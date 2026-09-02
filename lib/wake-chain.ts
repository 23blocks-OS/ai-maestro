/**
 * Wake chain — the ordered set of routes for getting a message in front of an
 * agent, and the proof each one can offer.
 *
 * Delivery and wake are different problems. Writing the AMP inbox file always
 * succeeds and is the source of truth for "the message exists". None of that
 * makes an agent read it. Waking is the hard half, and it is hard because the
 * injection point belongs to whoever owns the agent loop — which is a different
 * owner for an SDK session, a Claude Code channel, and a CLI in a tmux pane.
 *
 * The rule this module exists to enforce:
 *
 *   NO ADAPTER MAY REPORT A DELIVERY IT CANNOT PROVE.
 *
 * That is not pedantry. deliver() suppresses cheaper-but-noisier routes once a
 * better one succeeds, so an adapter that overstates its result doesn't just
 * log a wrong number — it silences the fallback that would have worked. That
 * is exactly how the channel path lost messages before v0.36.37: an MCP push
 * resolves when bytes reach the transport, Claude Code never acknowledges
 * channel events, and a push into a session that never registered the channel
 * is dropped silently. "Sent" looked like "arrived", and the pane notification
 * that would have saved it was skipped.
 *
 * Hence five statuses rather than a boolean:
 *
 *   confirmed   — something downstream of the transport proved arrival
 *   sent        — handed off successfully; arrival unknown
 *   deferred    — queued for a better moment; NOT delivered yet
 *   unavailable — this route does not apply to this agent
 *   failed      — the route applies and did not work
 *
 * Only `confirmed` stops the chain. `sent` and `deferred` keep going, because
 * an unproven or postponed wake is worth exactly as much as no wake when the
 * agent is waiting on it.
 */

import { pushToChannel, isChannelVerified } from '@/lib/channel-bridge.mjs'
import { pushToStreamSession, hasStreamSession } from '@/lib/streaming-bridge.mjs'
import { notifyAgent } from '@/lib/notification-service'
import { isSessionIdle } from '@/lib/session-idle'
import { enqueueWake } from '@/lib/wake-queue'
import { computeSessionName } from '@/types/agent'

export type WakeStatus = 'confirmed' | 'sent' | 'deferred' | 'unavailable' | 'failed'

export interface WakeContext {
  agentId: string
  agentName: string
  /** Full multi-line text for routes that inject a turn directly. */
  injectText: string
  /** Body only; the pane route single-lines it under its own header. */
  injectBody: string
  senderName: string
  senderHost?: string
  subject: string
  messageId: string
  priority?: string
  messageType?: string
}

export interface WakeOutcome {
  adapter: string
  status: WakeStatus
  detail?: string
}

export interface WakeAdapter {
  name: string
  /** What this route can actually prove, and how. Documentation, not logic. */
  proof: string
  deliver(ctx: WakeContext): Promise<WakeOutcome>
}

export interface WakeResult {
  /** An adapter proved the agent received it. */
  confirmed: boolean
  /** At least one adapter handed the message off (proven or not). */
  notified: boolean
  /** A route queued the wake for later instead of delivering it now. */
  deferred: boolean
  /** The adapter that confirmed, if any. */
  confirmedBy?: string
  /** Every route tried, in order — the record for surfacing/retry. */
  attempts: WakeOutcome[]
}

// ---------------------------------------------------------------------------
// Adapters
// ---------------------------------------------------------------------------

/**
 * Live Agent SDK session. `session.push()` hands the text into the SDK input
 * stream of a session object living in this process, after checking it is
 * neither closed nor exited. There is no transport in between that could drop
 * it, so success here is genuine confirmation — the strongest of the three.
 */
export const streamAdapter: WakeAdapter = {
  name: 'stream',
  proof: 'in-process handoff into a live SDK input stream',
  async deliver(ctx) {
    if (!hasStreamSession(ctx.agentId)) {
      return { adapter: 'stream', status: 'unavailable', detail: 'no live streaming session' }
    }
    return pushToStreamSession(ctx.agentId, ctx.injectText)
      ? { adapter: 'stream', status: 'confirmed' }
      : { adapter: 'stream', status: 'failed', detail: 'session rejected the push' }
  },
}

/**
 * Claude Code channel (MCP turn injection). Injects a real turn on an idle
 * agent with no keystrokes, which is why it is preferred over the pane.
 *
 * But a successful push proves only that our local HTTP server accepted the
 * POST and mcp.notification() wrote to the stdio transport. Claude Code never
 * acknowledges channel notifications and drops them silently when the session
 * did not register the server as a channel (no --channels, plugin off the
 * Anthropic allowlist, or channelsEnabled unset for the org). So a push is
 * only `sent`; `confirmed` requires the session to have called the server's
 * amp_channel_ack tool at least once. That failure is static per session, so
 * one ack covers its lifetime.
 */
export const channelAdapter: WakeAdapter = {
  name: 'channel',
  proof: 'amp_channel_ack called by the session at least once',
  async deliver(ctx) {
    const pushed = await pushToChannel(ctx.agentId, ctx.injectText)
    if (!pushed) {
      return { adapter: 'channel', status: 'unavailable', detail: 'no channel registered' }
    }
    return isChannelVerified(ctx.agentId)
      ? { adapter: 'channel', status: 'confirmed' }
      : {
          adapter: 'channel',
          status: 'sent',
          detail: 'channel unverified — session has not acked, keeping fallback',
        }
  },
}

/**
 * The tmux pane. Universal: it needs no cooperation from whatever occupies the
 * pane, so it covers Claude Code, Codex, Gemini CLI, Aider and a bare shell
 * alike. That makes it the only route that works across a mixed fleet, and the
 * reason the chain never depends on any single runtime's features.
 *
 * notifyAgent() reads the pane back after sending and looks for a per-message
 * ref, so `confirmed` here means the message was observed on the pane — not
 * merely that send-keys returned.
 *
 * Idle-gated: typing into a pane that is mid-render is precisely when the text
 * gets eaten, so a busy pane defers to lib/wake-queue instead of sending into
 * the churn. Deferred is reported as its own status — a queued wake has not
 * been delivered and must never be counted as one.
 */
export const paneAdapter: WakeAdapter = {
  name: 'pane',
  proof: 'message read back off the pane via capture',
  async deliver(ctx) {
    const sessionName = computeSessionName(ctx.agentName, 0)
    if (!isSessionIdle(sessionName)) {
      const depth = enqueueWake({
        agentId: ctx.agentId,
        agentName: ctx.agentName,
        sessionName,
        injectBody: ctx.injectBody,
        senderName: ctx.senderName,
        senderHost: ctx.senderHost,
        subject: ctx.subject,
        messageId: ctx.messageId,
        priority: ctx.priority,
        messageType: ctx.messageType,
      })
      return {
        adapter: 'pane',
        status: 'deferred',
        detail: `pane busy — queued for idle (depth ${depth})`,
      }
    }

    const res = await notifyAgent({
      agentId: ctx.agentId,
      agentName: ctx.agentName,
      fromName: ctx.senderName,
      fromHost: ctx.senderHost || 'unknown',
      subject: ctx.subject,
      messageId: ctx.messageId,
      priority: ctx.priority,
      messageType: ctx.messageType,
      body: ctx.injectBody,
    })
    if (res.verified) return { adapter: 'pane', status: 'confirmed' }
    if (res.notified) return { adapter: 'pane', status: 'sent', detail: res.reason }
    // We typed into the pane and it did not take — most sharply when the text
    // is still sitting in the input box. That is the route failing, not the
    // route being inapplicable, and calling it `unavailable` would hide a real
    // fault behind a word that means "nothing to see here".
    if (res.attempted) return { adapter: 'pane', status: 'failed', detail: res.reason || res.error }
    // notifyAgent never throws for an absent agent/session; it reports why.
    return { adapter: 'pane', status: 'unavailable', detail: res.reason || res.error }
  },
}

/**
 * Preference order: strongest proof and least disruption first.
 *
 * stream before channel because an SDK session is a direct handoff with no
 * transport to lose it. channel before pane because turn injection needs no
 * keystrokes and cannot be mangled by a TUI's input state. pane last because
 * it is the noisiest but also the only universal one — it is the floor the
 * chain always falls back to, never the route it depends on.
 */
export const DEFAULT_WAKE_CHAIN: WakeAdapter[] = [streamAdapter, channelAdapter, paneAdapter]

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

/**
 * Run adapters in order, stopping at the first CONFIRMED one.
 *
 * `sent` and `deferred` deliberately do not stop the chain: an unproven or
 * postponed wake is worth nothing to an agent that is waiting, and a duplicate
 * nudge is far cheaper than a lost message. A thrown adapter is recorded as `failed` and the chain
 * continues — one broken route must never strand a message that another route
 * could still carry.
 */
export async function runWakeChain(
  ctx: WakeContext,
  adapters: WakeAdapter[] = DEFAULT_WAKE_CHAIN
): Promise<WakeResult> {
  const attempts: WakeOutcome[] = []

  for (const adapter of adapters) {
    let outcome: WakeOutcome
    try {
      outcome = await adapter.deliver(ctx)
    } catch (err) {
      outcome = {
        adapter: adapter.name,
        status: 'failed',
        detail: err instanceof Error ? err.message : String(err),
      }
    }
    attempts.push(outcome)

    if (outcome.status === 'confirmed') {
      return {
        confirmed: true,
        notified: true,
        deferred: false,
        confirmedBy: adapter.name,
        attempts,
      }
    }
  }

  return {
    confirmed: false,
    notified: attempts.some((a) => a.status === 'sent'),
    deferred: attempts.some((a) => a.status === 'deferred'),
    attempts,
  }
}

/** Compact one-line summary for logs: `stream:unavailable → channel:sent → pane:confirmed`. */
export function describeWakeResult(result: WakeResult): string {
  return result.attempts.map((a) => `${a.adapter}:${a.status}`).join(' → ')
}
