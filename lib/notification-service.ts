/**
 * Notification Service - Real-time agent notifications
 *
 * Sends instant notifications to agents when messages are delivered.
 * Eliminates the need for polling-based message discovery.
 *
 * RFC: Message Delivery Notifications (Lola, 2026-01-24)
 */

import { getAgent, getAgentByName } from '@/lib/agent-registry'
import { computeSessionName } from '@/types/agent'
import { getSelfHostId, isSelf } from '@/lib/hosts-config-server.mjs'
import { getRuntime } from '@/lib/agent-runtime'
import { hasHookReport } from '@/lib/session-idle'

// Configuration (can be overridden via environment variables)
const NOTIFICATIONS_ENABLED = process.env.NOTIFICATIONS_ENABLED !== 'false'
// Subject FIRST: these lines stack up in an agent's transcript, and with the
// sender leading, consecutive notifications were visually indistinguishable —
// the differentiator sat far right and got truncated.
const NOTIFICATION_FORMAT = process.env.NOTIFICATION_FORMAT || '[MESSAGE] {subject} — from {from}'
const NOTIFICATION_SKIP_TYPES = (process.env.NOTIFICATION_SKIP_TYPES || 'system,heartbeat').split(',')

export interface NotificationOptions {
  // Target agent identification
  agentId?: string        // Agent UUID (if known)
  agentName: string       // Agent name/alias (used for lookup if no agentId)
  agentHost?: string      // Target host (default: local)

  // Message info for notification content
  fromName: string        // Sender name/alias for display
  fromHost?: string       // Sender host for display
  subject: string         // Message subject
  messageId: string       // Message ID (for reference)
  priority?: string       // Message priority (urgent, high, normal, low)
  messageType?: string    // Content type (request, response, notification, etc.)
  body?: string           // Message body, so the pane carries the same content
                          // as the channel/stream injection paths (not just a
                          // "check your inbox" pointer the agent may ignore)
}

export interface NotificationResult {
  success: boolean
  notified: boolean       // True if the notification reached the pane
  verified?: boolean      // True if we READ IT BACK off the pane (real proof)
  reason?: string         // Why notification was skipped (if notified=false)
  error?: string          // Error message (if success=false)
}

// Delay between pasting text and sending Enter. TUIs like Claude Code batch
// incoming bytes per event-loop tick: if Enter arrives in the same batch as
// the text it can be processed before the input field has updated, so the
// submit is lost and the agent sits idle. A small shell-level delay between
// the two `send-keys` calls guarantees the TUI sees the text first, then a
// clean submit — without this, operators had to manually press Enter in
// every agent's terminal for notifications to take effect.
const NOTIFICATION_SUBMIT_DELAY_MS = 150

// Readback verification. send-keys returning without throwing only proves we
// handed bytes to tmux — not that the agent's TUI accepted them. So after
// submitting we capture the pane and look for the message back. Poll first
// (render lag is common), and only re-send if it never appears, so a slow
// render doesn't produce a duplicate notification.
const NOTIFICATION_VERIFY_POLLS = 4          // x delay below = ~1s per send
const NOTIFICATION_VERIFY_DELAY_MS = 250
const NOTIFICATION_MAX_SENDS = 2             // initial + one resend
const NOTIFICATION_CAPTURE_LINES = 120

// Body appended to the pane notification. Kept short and single-lined: a raw
// newline inside send-keys would submit the TUI early (and open an unterminated
// quote at a shell prompt), truncating the message at the first line break.
const NOTIFICATION_BODY_MAX = 400

interface PaneDeliveryResult {
  /** The bytes were handed to the runtime without error. */
  sent: boolean
  /** We read the message back off the pane — actual proof of arrival. */
  verified: boolean
  /** The runtime can't be captured, so absence of proof isn't proof of absence. */
  unverifiable: boolean
}

/**
 * Short, stable, PER-MESSAGE token used as the readback needle.
 *
 * Takes the TAIL of the id, not the head. Ids look like
 * `msg-<timestamp>-<random>`, so the leading characters are near-constant:
 * slicing the front gave every message sent within ~27 hours the identical ref
 * (`msg17878`). That broke two things at once — the pane readback could be
 * satisfied by a STALE ref left on screen from an earlier message, making
 * `confirmed` a false positive, and every notification looked like the same
 * message repeating to anyone reading the pane.
 */
export function messageRef(messageId: string): string {
  const alnum = (messageId || '').replace(/[^a-zA-Z0-9]/g, '')
  return alnum.slice(-8) || 'nomsgid'
}

/** Collapse to one line so send-keys can't submit early on an embedded newline. */
export function toSingleLine(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat
}

/**
 * Whitespace-insensitive containment check. The pane hard-wraps at its width,
 * so the needle can be split across lines mid-token; normalising both sides
 * makes the match survive wrapping.
 */
function paneContains(pane: string, needle: string): boolean {
  const strip = (s: string) => s.replace(/\s+/g, '')
  return strip(pane).includes(strip(needle))
}

/**
 * Send a notification to a tmux session and confirm it landed.
 *
 * The notification is delivered in two separate send-keys calls with a short
 * shell-level delay between them (text first, then Enter). See the comment on
 * NOTIFICATION_SUBMIT_DELAY_MS for why this matters.
 *
 * Then we read the pane back. This is the runtime-agnostic equivalent of the
 * channel's amp_channel_ack: it needs no cooperation from whatever agent is
 * running in the pane, so it works for Claude Code, Codex, Gemini CLI, Aider,
 * or a bare shell alike.
 */
async function sendTmuxNotification(
  sessionName: string,
  message: string,
  needle: string
): Promise<PaneDeliveryResult> {
  const runtime = getRuntime()
  // Target the first pane of the first window
  const target = `${sessionName}:0.0`

  // A TUI agent takes the text as a prompt, so send it plainly. A bare shell
  // would try to EXECUTE it, so there the text is wrapped in `echo`.
  //
  // We can tell them apart now: a hook report for this session means a Claude
  // Code (or Codex/Gemini) agent is live in the pane. Before v0.36.42 there was
  // no such signal, so everything got the echo wrapper and every notification
  // landed in the agent's transcript looking like a shell command.
  //
  // No report ⇒ assume shell and keep the wrapper. That is the safe default:
  // an unnecessary `echo` is ugly, an unquoted message at a shell prompt is a
  // command.
  const isTui = hasHookReport(sessionName)
  const payload = isTui ? message : `echo '${message.replace(/'/g, "'\\''")}'`
  let sawPane = false

  for (let send = 1; send <= NOTIFICATION_MAX_SENDS; send++) {
    await runtime.sendKeys(target, payload, { literal: true })
    await new Promise(resolve => setTimeout(resolve, NOTIFICATION_SUBMIT_DELAY_MS))
    await runtime.sendKeys(target, 'Enter')

    for (let poll = 0; poll < NOTIFICATION_VERIFY_POLLS; poll++) {
      await new Promise(resolve => setTimeout(resolve, NOTIFICATION_VERIFY_DELAY_MS))
      const pane = await runtime.capturePane(target, NOTIFICATION_CAPTURE_LINES).catch(() => '')
      if (pane) sawPane = true
      if (pane && paneContains(pane, needle)) {
        return { sent: true, verified: true, unverifiable: false }
      }
    }

    // Never captured anything at all: this runtime doesn't support readback, so
    // resending would just double-deliver against a check that can't succeed.
    if (!sawPane) return { sent: true, verified: false, unverifiable: true }
  }

  return { sent: true, verified: false, unverifiable: false }
}

/**
 * Format a notification message using the configured template
 */
function formatNotification(options: NotificationOptions): string {
  const { fromName, fromHost, subject, priority, body, messageId } = options

  // Build sender info with optional host
  const senderWithHost = fromHost && fromHost !== 'local'
    ? `${fromName}@${fromHost}`
    : fromName

  // Add priority indicator for urgent/high
  const priorityPrefix = priority === 'urgent' ? '🔴 [URGENT] '
    : priority === 'high' ? '🟠 [HIGH] '
    : ''

  // Format using template
  let message = NOTIFICATION_FORMAT
    .replace('{from}', senderWithHost)
    .replace('{subject}', subject)

  // Per-message ref: doubles as the readback needle and lets an agent (or a
  // human reading the pane) tie the nudge to the inbox entry.
  const ref = `[#${messageRef(messageId)}]`

  // Carry the body, so the pane gets the same content the channel and stream
  // paths inject rather than a pointer the agent has to choose to follow.
  // NOTIFICATION_FORMAT still owns the header line, so custom templates keep
  // working — the body is appended, not substituted.
  const tail = body ? ` — ${toSingleLine(body, NOTIFICATION_BODY_MAX)}` : ''

  return `${priorityPrefix}${ref} ${message}${tail}`
}

/**
 * Notify an agent about a new message
 *
 * This is called immediately after a message is stored in the inbox.
 * Notifications are fire-and-forget - failures don't affect message delivery.
 */
export async function notifyAgent(options: NotificationOptions): Promise<NotificationResult> {
  // Check if notifications are enabled
  if (!NOTIFICATIONS_ENABLED) {
    return { success: true, notified: false, reason: 'Notifications disabled' }
  }

  // Skip certain message types
  if (options.messageType && NOTIFICATION_SKIP_TYPES.includes(options.messageType)) {
    return { success: true, notified: false, reason: `Skipped type: ${options.messageType}` }
  }

  try {
    const { agentId, agentName, agentHost } = options
    const selfHostId = getSelfHostId()

    // Check if target is on a remote host
    // Use isSelf() for robust hostname comparison (handles variations like 'mac-mini' vs 'mac-mini.local')
    if (agentHost && agentHost !== 'local' && !isSelf(agentHost)) {
      // Target is genuinely on a remote host - skip notification
      // (Remote host will handle its own notification when it receives the message)
      console.log(`[Notify] Agent ${agentName} is on remote host ${agentHost} (self: ${selfHostId}), skipping notification`)
      return { success: true, notified: false, reason: `Remote host: ${agentHost}` }
    }

    // Look up the agent
    let agent = agentId ? getAgent(agentId) : null
    if (!agent) {
      agent = getAgentByName(agentName, selfHostId)
    }

    if (!agent) {
      console.log(`[Notify] Agent ${agentName} not found in registry`)
      return { success: true, notified: false, reason: 'Agent not found' }
    }

    // Check if agent has any sessions
    if (!agent.sessions || agent.sessions.length === 0) {
      console.log(`[Notify] Agent ${agentName} has no sessions configured`)
      return { success: true, notified: false, reason: 'No sessions' }
    }

    // Get the primary session (index 0)
    const primarySession = agent.sessions.find(s => s.index === 0) || agent.sessions[0]
    const sessionName = computeSessionName(agent.name, primarySession.index)

    // Check if tmux session exists
    const runtime = getRuntime()
    const sessionExists = await runtime.sessionExists(sessionName)
    if (!sessionExists) {
      console.log(`[Notify] tmux session ${sessionName} not found`)
      return { success: true, notified: false, reason: 'Session not active' }
    }

    // Format, send, and confirm the notification actually landed in the pane.
    const notification = formatNotification(options)
    const ref = `[#${messageRef(options.messageId)}]`
    const result = await sendTmuxNotification(sessionName, notification, ref)

    if (result.verified) {
      console.log(`[Notify] ✓ Notified ${agentName} about message from ${options.fromName} (verified in pane)`)
      return { success: true, notified: true, verified: true }
    }

    if (result.unverifiable) {
      // Runtime offers no readback (docker/api/direct). Report it as sent, but
      // never as verified — callers must not mistake this for proof.
      console.log(`[Notify] ~ Sent to ${agentName}, runtime cannot verify pane content`)
      return { success: true, notified: true, verified: false, reason: 'Runtime cannot verify' }
    }

    // We could read the pane and the message never showed up after a resend.
    // Report honestly so the caller can retry or surface it, rather than
    // recording a delivery that never happened.
    console.warn(`[Notify] ✗ Notification to ${agentName} not seen in pane after ${NOTIFICATION_MAX_SENDS} sends`)
    return { success: true, notified: false, verified: false, reason: 'Not seen in pane after retries' }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error(`[Notify] Failed to notify ${options.agentName}:`, error)

    // Return success=true because notification failure shouldn't fail message delivery
    return { success: true, notified: false, error: errorMessage }
  }
}

/**
 * Singleton notification service for easy import
 */
export const notificationService = {
  notifyAgent,
  isEnabled: () => NOTIFICATIONS_ENABLED,
}

export default notificationService
