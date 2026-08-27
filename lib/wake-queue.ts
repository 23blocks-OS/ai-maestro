/**
 * Idle-gated wake queue — hold pane notifications for a busy agent and deliver
 * them the moment it goes quiet.
 *
 * WHY THIS EXISTS
 *
 * Typing into a TUI that is mid-render is where notifications get eaten. The
 * text lands in a screen that is being repainted and simply vanishes; that is
 * the "dropped Enter" the fleet has fought for months. Sending harder does not
 * fix it — the send is not what fails, the timing is.
 *
 * So do not send at a bad moment. If the pane is busy, queue the wake and
 * flush it on the idle transition. This is the same trade Claude Code makes for
 * its own agent-to-agent messaging, where events "queue into the session and
 * are delivered together on the next turn" and the docs are explicit that you
 * should never poll or nag instead.
 *
 * Only the PANE route needs this. The streaming and channel routes hand off
 * into queues their runtimes drain safely at a turn boundary, so they are
 * unaffected by TUI render state and are never deferred.
 *
 * HONESTY
 *
 * A queued wake has NOT been delivered. It is reported as `deferred`, never as
 * `sent` — the whole point of this subsystem is that unproven states stay
 * distinguishable from proven ones. The inbox write already happened, so a
 * deferred wake is a delay, not a loss; but it must never be counted as an
 * arrival.
 */

import { notifyAgent } from '@/lib/notification-service'
import { isSessionIdle } from '@/lib/session-idle'

/** How often to re-check queued agents for idleness. */
const FLUSH_INTERVAL_MS = 5_000

/**
 * Give up on a queued wake after this long. The message is safe on disk and the
 * agent will find it in its inbox; holding a stale notification forever only
 * produces a confusing interruption long after the fact.
 */
const QUEUE_TTL_MS = 10 * 60 * 1000

/** Per-agent cap. Beyond this the OLDEST are dropped — recent context wins. */
const MAX_PER_AGENT = 20

export interface QueuedWake {
  agentId: string
  agentName: string
  sessionName: string
  injectBody: string
  senderName: string
  senderHost?: string
  subject: string
  messageId: string
  priority?: string
  messageType?: string
  queuedAt: number
}

/** agentId -> FIFO of pending wakes. */
const queues = new Map<string, QueuedWake[]>()
let ticker: ReturnType<typeof setInterval> | null = null

function startTicker() {
  if (ticker) return
  ticker = setInterval(() => {
    void flushDueWakes()
  }, FLUSH_INTERVAL_MS)
  // Never hold the process open for a queue that is only best-effort.
  ticker.unref?.()
}

function stopTickerIfEmpty() {
  if (queues.size === 0 && ticker) {
    clearInterval(ticker)
    ticker = null
  }
}

/**
 * Queue a wake for an agent whose pane is busy. Returns the queue depth for
 * that agent after insertion.
 */
export function enqueueWake(item: Omit<QueuedWake, 'queuedAt'>): number {
  const queue = queues.get(item.agentId) || []
  queue.push({ ...item, queuedAt: Date.now() })

  if (queue.length > MAX_PER_AGENT) {
    const dropped = queue.splice(0, queue.length - MAX_PER_AGENT)
    console.warn(
      `[WakeQueue] ${item.agentName}: queue over ${MAX_PER_AGENT}, dropped ${dropped.length} oldest ` +
        `(still in inbox: ${dropped.map((d) => d.messageId).join(', ')})`
    )
  }

  queues.set(item.agentId, queue)
  startTicker()
  return queue.length
}

/**
 * Deliver one pending wake per idle agent, oldest first.
 *
 * One per tick on purpose: each pane send costs a readback, and firing a burst
 * into a pane that just went idle is its own kind of mistimed interruption. The
 * next tick picks up the rest.
 */
export async function flushDueWakes(): Promise<void> {
  for (const [agentId, queue] of Array.from(queues.entries())) {
    // Expire stale entries first, regardless of idleness.
    const fresh = queue.filter((item) => {
      const age = Date.now() - item.queuedAt
      if (age > QUEUE_TTL_MS) {
        console.warn(
          `[WakeQueue] ${item.agentName}: expiring wake for ${item.messageId} after ${Math.round(age / 1000)}s ` +
            `(message remains in the inbox)`
        )
        return false
      }
      return true
    })

    if (fresh.length === 0) {
      queues.delete(agentId)
      continue
    }
    queues.set(agentId, fresh)

    const next = fresh[0]
    if (!isSessionIdle(next.sessionName)) continue

    fresh.shift()
    if (fresh.length === 0) queues.delete(agentId)
    else queues.set(agentId, fresh)

    try {
      const res = await notifyAgent({
        agentId: next.agentId,
        agentName: next.agentName,
        fromName: next.senderName,
        fromHost: next.senderHost || 'unknown',
        subject: next.subject,
        messageId: next.messageId,
        priority: next.priority,
        messageType: next.messageType,
        body: next.injectBody,
      })
      const waited = Math.round((Date.now() - next.queuedAt) / 1000)
      if (res.verified) {
        console.log(`[WakeQueue] ${next.agentName}: flushed ${next.messageId} on idle after ${waited}s (verified)`)
      } else {
        console.warn(
          `[WakeQueue] ${next.agentName}: flushed ${next.messageId} after ${waited}s but UNCONFIRMED (${res.reason || 'no reason'})`
        )
      }
    } catch (err) {
      console.warn(`[WakeQueue] ${next.agentName}: flush failed for ${next.messageId}:`, err)
    }
  }

  stopTickerIfEmpty()
}

/** Pending wake count for an agent (0 if none). Exposed for status/UI. */
export function pendingWakeCount(agentId: string): number {
  return queues.get(agentId)?.length ?? 0
}

/** Total pending wakes across all agents. */
export function totalPendingWakes(): number {
  let total = 0
  for (const q of Array.from(queues.values())) total += q.length
  return total
}

/** Test seam: drop all queued state and stop the ticker. */
export function __resetWakeQueue(): void {
  queues.clear()
  if (ticker) {
    clearInterval(ticker)
    ticker = null
  }
}
