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
 * The queue does double duty. It holds two kinds of pending wake:
 *
 *   'busy'        — never attempted; the pane was mid-render
 *   'unconfirmed' — attempted, and nothing could prove it landed
 *
 * Both want the same thing: try again when the agent is quiet. So rather than
 * a second retry subsystem, an unconfirmed wake re-enters this queue with a
 * backoff. Retries are bounded — after the last attempt we stop and say so,
 * because a notification that has failed four times is not going to start
 * working, and the message is in the inbox regardless.
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

/**
 * Delay before each retry of an UNCONFIRMED wake, indexed by attempts already
 * made. A 'busy' wake uses no backoff — it is waiting on idle, not on a timer.
 */
const RETRY_BACKOFF_MS = [0, 30_000, 120_000, 600_000]

/** Attempts before giving up on an unconfirmed wake. */
const MAX_ATTEMPTS = RETRY_BACKOFF_MS.length

/** Why a wake is sitting in the queue. */
export type WakeQueueReason = 'busy' | 'unconfirmed'

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
  /** Why it is queued: never attempted (busy) or attempted without proof. */
  reason: WakeQueueReason
  /** Delivery attempts made so far. */
  attempts: number
  /** Earliest timestamp at which to try again (backoff gate). */
  notBefore: number
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
export function enqueueWake(
  item: Omit<QueuedWake, 'queuedAt' | 'reason' | 'attempts' | 'notBefore'> & {
    reason?: WakeQueueReason
    attempts?: number
  }
): number {
  const queue = queues.get(item.agentId) || []
  const reason: WakeQueueReason = item.reason ?? 'busy'
  const attempts = item.attempts ?? 0
  const backoff = reason === 'unconfirmed' ? RETRY_BACKOFF_MS[Math.min(attempts, MAX_ATTEMPTS - 1)] : 0
  queue.push({ ...item, reason, attempts, queuedAt: Date.now(), notBefore: Date.now() + backoff })

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
    // Two gates: the agent must be quiet, and a retry must have served its
    // backoff. Either one failing just means "not this tick".
    if (!isSessionIdle(next.sessionName)) continue
    if (Date.now() < next.notBefore) continue

    fresh.shift()
    if (fresh.length === 0) queues.delete(agentId)
    else queues.set(agentId, fresh)

    const waited = Math.round((Date.now() - next.queuedAt) / 1000)
    const attempt = next.attempts + 1

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

      if (res.verified) {
        console.log(
          `[WakeQueue] ${next.agentName}: ${next.messageId} confirmed on attempt ${attempt} after ${waited}s`
        )
        continue
      }

      requeueUnconfirmed(next, attempt, res.reason || 'unconfirmed')
    } catch (err) {
      requeueUnconfirmed(next, attempt, err instanceof Error ? err.message : String(err))
    }
  }

  stopTickerIfEmpty()
}

/**
 * Put an unconfirmed attempt back in the queue with a backoff, or give up.
 *
 * Giving up is deliberate and loud. After MAX_ATTEMPTS the notification is not
 * going to start working, and continuing to retype into the pane every ten
 * minutes is worse than stopping. The message itself is never lost — it has
 * been in the agent's inbox since before the first attempt.
 */
function requeueUnconfirmed(item: QueuedWake, attempt: number, why: string): void {
  if (attempt >= MAX_ATTEMPTS) {
    console.error(
      `[WakeQueue] ${item.agentName}: GIVING UP on ${item.messageId} after ${attempt} attempts (${why}). ` +
        `The message is still in the inbox; the agent was never confirmed to have seen it.`
    )
    return
  }
  const depth = enqueueWake({ ...item, reason: 'unconfirmed', attempts: attempt })
  console.warn(
    `[WakeQueue] ${item.agentName}: ${item.messageId} unconfirmed on attempt ${attempt} (${why}) — ` +
      `retrying, queue depth ${depth}`
  )
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

export interface PendingWakeView {
  agentId: string
  agentName: string
  messageId: string
  subject: string
  from: string
  reason: WakeQueueReason
  attempts: number
  waitingMs: number
  retryInMs: number
}

/**
 * Snapshot of everything still waiting, newest state first.
 *
 * This is the operator-facing answer to "did that message actually get
 * through?". A row here means the message is on disk but no route has proved
 * the agent saw it yet — the state that used to be invisible.
 */
export function pendingWakes(): PendingWakeView[] {
  const now = Date.now()
  const rows: PendingWakeView[] = []
  for (const queue of Array.from(queues.values())) {
    for (const item of queue) {
      rows.push({
        agentId: item.agentId,
        agentName: item.agentName,
        messageId: item.messageId,
        subject: item.subject,
        from: item.senderHost && item.senderHost !== 'local'
          ? `${item.senderName}@${item.senderHost}`
          : item.senderName,
        reason: item.reason,
        attempts: item.attempts,
        waitingMs: now - item.queuedAt,
        retryInMs: Math.max(0, item.notBefore - now),
      })
    }
  }
  return rows.sort((a, b) => b.waitingMs - a.waitingMs)
}

/** Test seam: drop all queued state and stop the ticker. */
export function __resetWakeQueue(): void {
  queues.clear()
  if (ticker) {
    clearInterval(ticker)
    ticker = null
  }
}
