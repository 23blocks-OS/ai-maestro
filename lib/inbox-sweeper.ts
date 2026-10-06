/**
 * Host-wide inbox sweeper: wakes an agent for an unread message that nothing
 * else woke it for.
 *
 * Why it exists (backlog F027). A message reaches an agent's inbox two ways.
 * Through the server (/api/v1/route), `deliver()` writes the file and runs the
 * wake chain. But `amp-send.sh` writes the file itself when the recipient is on
 * the same machine, so the server never hears of it, and the only other net is
 * the per-agent 5-minute poll in lib/agent.ts, which lives inside the agent
 * object. AgentRegistry keeps 10 of those in memory; a host with 20 live
 * sessions has no poll for half of them at any moment. On 2026-10-05 3m-counsel
 * was evicted four minutes before a same-host message and sat unread for 47+
 * minutes.
 *
 * This sweeper does not depend on that cache or on which writer put the file
 * there. Once a minute it looks at every agent with a live session on this host
 * and hands unread messages that no path has handled to the existing wake chain
 * (stream, channel, pane). The chain keeps doing what it already does: it never
 * types into a busy pane, it proves arrival by readback, and it queues a wake
 * for the idle transition. The sweeper never writes to an inbox and never marks
 * anything read, so it cannot lose or alter a message.
 *
 * Safety rails, because a wake costs a paid turn:
 *   - AIM_INBOX_SWEEP=on|shadow|off (default on). `shadow` logs what it would do, nothing else.
 *   - First run (no wake-state file): every unread message is baselined as seen.
 *     Enabling the sweeper never wakes agents for old mail.
 *   - A message is handed over once; it is re-handed only after a long backoff
 *     and at most MAX_HANDOFFS times in total, counting every path.
 *   - A fresh message gets GRACE_MS for the routing push or the poll to act first.
 *   - Messages older than MAX_AGE_MS are ignored.
 *   - One wake per agent per sweep, at most MAX_WAKES_PER_SWEEP per sweep.
 */

import { getRuntime } from '@/lib/agent-runtime'
import { getAgentBySession } from '@/lib/agent-registry'
import { listInboxMessages, getMessage, type MessageSummary } from '@/lib/messageQueue'
import { runWakeChain, describeWakeResult, type WakeContext, type WakeResult } from '@/lib/wake-chain'
import { enqueueWake } from '@/lib/wake-queue'
import { messageRef } from '@/lib/notification-service'
import { senderLabel } from '@/lib/sender-label'
import { getWakeRecord, recordWake, baselineMessage, takeFirstRun } from '@/lib/wake-state'
import { computeSessionName } from '@/types/agent'

export type SweepMode = 'off' | 'shadow' | 'on'

export const SWEEP_INTERVAL_MS = 60_000
/** Time a fresh message gets for the routing push or the poll to wake first. */
export const GRACE_MS = 90_000
/** Older unread messages are left alone: they are history, not news. */
export const MAX_AGE_MS = 24 * 60 * 60 * 1000
/** Wait before handing the same message over again, indexed by hand-offs so far minus one. */
export const REHAND_BACKOFF_MS = [15 * 60_000, 60 * 60_000]
/** Hand-offs per message across every path (push, poll, sweeper). */
export const MAX_HANDOFFS = REHAND_BACKOFF_MS.length + 1
export const MAX_WAKES_PER_SWEEP = 5
const SKIP_TYPES = new Set(['system', 'heartbeat'])

export function sweepMode(): SweepMode {
  const v = (process.env.AIM_INBOX_SWEEP || 'on').toLowerCase()
  return v === 'off' || v === 'shadow' ? v : 'on'
}

export interface SweepCandidate {
  agentId: string
  agentName: string
  sessionName: string
}

export interface SweepDeps {
  now: () => number
  mode: () => SweepMode
  candidates: () => Promise<SweepCandidate[]>
  unread: (agentId: string) => Promise<MessageSummary[]>
  body: (agentId: string, messageId: string) => Promise<string>
  wake: (ctx: WakeContext, cand: SweepCandidate) => Promise<WakeResult>
  log: (line: string) => void
}

export interface SweepResult {
  scanned: number
  baselined: number
  woken: string[]
  wouldWake: string[]
}

function eligible(msg: MessageSummary, agentId: string, now: number): boolean {
  if (msg.status !== 'unread') return false
  if (SKIP_TYPES.has(String(msg.type))) return false
  const sent = Date.parse(msg.timestamp)
  if (Number.isFinite(sent)) {
    const age = now - sent
    if (age > MAX_AGE_MS) return false
    if (age < GRACE_MS) return false
  }
  const rec = getWakeRecord(agentId, msg.id)
  if (!rec) return true
  if (rec.count >= MAX_HANDOFFS) return false
  return now - rec.lastWake >= REHAND_BACKOFF_MS[Math.min(rec.count - 1, REHAND_BACKOFF_MS.length - 1)]
}

export async function sweepOnce(deps: SweepDeps): Promise<SweepResult> {
  const result: SweepResult = { scanned: 0, baselined: 0, woken: [], wouldWake: [] }
  const mode = deps.mode()
  if (mode === 'off') return result

  const now = deps.now()
  const baseline = takeFirstRun()
  let cands: SweepCandidate[]
  try {
    cands = await deps.candidates()
  } catch (err) {
    deps.log(`[Sweep] could not list sessions: ${err instanceof Error ? err.message : String(err)}`)
    return result
  }

  for (const cand of cands) {
    result.scanned++
    let unread: MessageSummary[]
    try {
      unread = (await deps.unread(cand.agentId)).filter((m) => m.status === 'unread')
    } catch {
      continue
    }
    if (unread.length === 0) continue

    if (baseline) {
      // First run on this host: take what is already unread as seen, wake nothing.
      for (const m of unread) baselineMessage(cand.agentId, m.id, MAX_HANDOFFS, now)
      result.baselined += unread.length
      continue
    }

    const due = unread.filter((m) => eligible(m, cand.agentId, now))
    if (due.length === 0) continue
    // Newest first: it is the one the agent most needs to see; the rest ride along.
    due.sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))
    const lead = due[0]

    if (mode === 'shadow') {
      result.wouldWake.push(`${cand.agentName}:${lead.id}`)
      deps.log(
        `[Sweep] shadow: would wake ${cand.agentName} for ${lead.id} ` +
          `(${due.length} unread not yet woken, oldest ${Math.round((now - Date.parse(due[due.length - 1].timestamp)) / 60000)} min)`
      )
      continue
    }
    if (result.woken.length >= MAX_WAKES_PER_SWEEP) continue

    const more = due.length - 1
    const bodyText = (await deps.body(cand.agentId, lead.id).catch(() => lead.preview || '')) || lead.preview || ''
    const injectBody = bodyText.slice(0, 2000)
    const sender = senderLabel({ address: lead.from?.includes('@') ? lead.from : undefined, name: lead.fromAlias || lead.from, host: lead.fromHost })
    const injectText =
      `[AMP #${messageRef(lead.id)}] New message from ${sender}${lead.subject ? ` — "${lead.subject}"` : ''}` +
      `${more > 0 ? ` (and ${more} more unread)` : ''}:\n${injectBody}\n\n` +
      `(Reply with the agent-messaging skill if it needs an answer, then continue.)`
    const ctx: WakeContext = {
      agentId: cand.agentId,
      agentName: cand.agentName,
      injectText,
      injectBody,
      senderName: lead.fromAlias || lead.from,
      senderHost: lead.fromHost,
      senderAddress: lead.from?.includes('@') ? lead.from : undefined,
      subject: lead.subject,
      messageId: lead.id,
      priority: lead.priority,
      messageType: lead.type,
    }

    let wake: WakeResult
    try {
      wake = await deps.wake(ctx, cand)
    } catch (err) {
      deps.log(`[Sweep] wake threw for ${cand.agentName}: ${err instanceof Error ? err.message : String(err)}`)
      continue
    }
    // Every message in this batch counts as handed over: the agent sees them all
    // when it opens its inbox, and one wake per agent per sweep is the budget.
    for (const m of due) recordWake(cand.agentId, m.id, now)
    result.woken.push(`${cand.agentName}:${lead.id}`)

    if (wake.confirmed) {
      deps.log(`[Sweep] ${lead.id} → ${cand.agentName} confirmed via ${wake.confirmedBy} (${describeWakeResult(wake)}), ${due.length} unread handed over`)
    } else if (wake.deferred) {
      deps.log(`[Sweep] ${lead.id} → ${cand.agentName} deferred to idle (${describeWakeResult(wake)})`)
    } else {
      deps.log(`[Sweep] ${lead.id} → ${cand.agentName} UNCONFIRMED (${describeWakeResult(wake)}), queued for retry`)
      enqueueWake({
        agentId: cand.agentId,
        agentName: cand.agentName,
        sessionName: cand.sessionName,
        injectBody,
        senderName: ctx.senderName,
        senderHost: ctx.senderHost,
        senderAddress: ctx.senderAddress,
        subject: ctx.subject,
        messageId: lead.id,
        priority: ctx.priority,
        messageType: ctx.messageType,
        reason: 'unconfirmed',
        attempts: 1,
      })
    }
  }

  if (baseline && result.baselined > 0) {
    deps.log(`[Sweep] first run on this host: ${result.baselined} unread message(s) taken as already seen, none woken`)
  }
  return result
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

export function liveDeps(): SweepDeps {
  return {
    now: () => Date.now(),
    mode: sweepMode,
    candidates: async () => {
      const sessions = await getRuntime().listSessions()
      const out: SweepCandidate[] = []
      const seen = new Set<string>()
      for (const s of sessions) {
        const agent = getAgentBySession(s.name)
        if (!agent || seen.has(agent.id)) continue
        seen.add(agent.id)
        out.push({ agentId: agent.id, agentName: agent.name, sessionName: s.name || computeSessionName(agent.name, 0) })
      }
      return out
    },
    unread: (agentId) => listInboxMessages(agentId, { status: 'unread' }),
    body: async (agentId, messageId) => {
      const m = await getMessage(agentId, messageId, 'inbox')
      return m?.content?.message?.toString() ?? ''
    },
    wake: (ctx) => runWakeChain(ctx),
    log: (line) => console.log(line),
  }
}

let timer: ReturnType<typeof setInterval> | null = null
let running = false

/** Start the host-wide sweep. Idempotent. */
export function startInboxSweeper(): void {
  if (timer) return
  const mode = sweepMode()
  console.log(`[Sweep] inbox sweeper ${mode === 'off' ? 'disabled (AIM_INBOX_SWEEP=off)' : `started, mode=${mode}, every ${SWEEP_INTERVAL_MS / 1000}s`}`)
  if (mode === 'off') return
  const tick = () => {
    if (running) return
    running = true
    sweepOnce(liveDeps())
      .catch((err) => console.error('[Sweep] failed:', err instanceof Error ? err.message : err))
      .finally(() => {
        running = false
      })
  }
  timer = setInterval(tick, SWEEP_INTERVAL_MS)
  timer.unref?.()
  setTimeout(tick, 20_000).unref?.()
}

export function stopInboxSweeper(): void {
  if (timer) clearInterval(timer)
  timer = null
}
