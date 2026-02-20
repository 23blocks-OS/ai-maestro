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

// Configuration (can be overridden via environment variables)
const NOTIFICATIONS_ENABLED = process.env.NOTIFICATIONS_ENABLED !== 'false'
const NOTIFICATION_FORMAT = process.env.NOTIFICATION_FORMAT || '[MESSAGE] From: {from} - {subject} - check your inbox'
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
}

export interface NotificationResult {
  success: boolean
  notified: boolean       // True if notification was actually sent
  reason?: string         // Why notification was skipped (if notified=false)
  error?: string          // Error message (if success=false)
}

/**
 * Send a notification to a tmux session
 * Uses echo to display the message without interrupting the agent's work
 */
async function sendTmuxNotification(sessionName: string, message: string): Promise<void> {
  const runtime = getRuntime()
  // Target the first pane of the first window
  const target = `${sessionName}:0.0`

  // Uses literal flag to prevent tmux from misinterpreting key names in notification text
  // Note: If the session is running a non-shell program (vim, REPL, TUI), this echo command
  // will be typed as input to that program. Notifications are designed for idle shell prompts.
  const escapedMessage = message.replace(/'/g, "'\\''")
  await runtime.sendKeys(target, `echo '${escapedMessage}'`, { literal: true, enter: true })
}

/**
 * Format a notification message using the configured template
 */
function formatNotification(options: NotificationOptions): string {
  const { fromName, fromHost, subject, priority } = options

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

  return priorityPrefix + message
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

    // Format and send the notification
    const notification = formatNotification(options)
    await sendTmuxNotification(sessionName, notification)

    console.log(`[Notify] ✓ Notified ${agentName} about message from ${options.fromName}`)
    return { success: true, notified: true }

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
