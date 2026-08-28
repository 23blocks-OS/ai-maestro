/**
 * Executes an agent's due scheduled tasks.
 *
 * Kept separate from lib/agent-schedule.ts so the scheduling rules stay
 * testable without a database or an embedding model.
 *
 * Nothing here hydrates an Agent object. Every action works from an agent id
 * and files on disk, which is what lets maintenance run for all agents on a
 * host rather than only the ten resident in the registry's LRU — the
 * constraint that stopped indexing and consolidation from ever reliably
 * happening.
 */

import { readSchedule, dueTasks, markRun, type ScheduledTask } from '@/lib/agent-schedule'

export interface TaskRunResult {
  taskId: string
  action: string
  ok: boolean
  detail: string
  ms: number
}

export interface ScheduleRunResult {
  agentId: string
  ran: TaskRunResult[]
  skipped: number
}

/** Guard against two triggers running an agent's tasks concurrently. */
const inFlight = new Set<string>()

async function runIndex(agentId: string): Promise<{ ok: boolean; detail: string }> {
  const { runIndexDelta } = await import('@/lib/index-delta')
  const r = await runIndexDelta(agentId)
  // runIndexDelta reports failure by RETURNING success:false rather than
  // throwing, so this must be checked explicitly — treating a returned failure
  // as success is how a whole host reported "indexed, 0 messages" for months.
  if (r.success === false) {
    return { ok: false, detail: (r as { error?: string }).error || 'index-delta reported failure' }
  }
  return { ok: true, detail: `${r.total_messages_processed || 0} messages` }
}

async function runConsolidate(agentId: string): Promise<{ ok: boolean; detail: string }> {
  // Consolidation needs the agent's database. Import lazily so an agent whose
  // schedule has no consolidate task never pays for loading it.
  const { agentRegistry } = await import('@/lib/agent')
  const agent = await agentRegistry.getAgent(agentId)
  const subconscious = agent.getSubconscious()
  if (!subconscious) return { ok: false, detail: 'subconscious not initialised' }
  const result = await subconscious.triggerConsolidation()
  return { ok: true, detail: JSON.stringify(result ?? {}).slice(0, 200) }
}

async function runPrompt(
  agentId: string,
  task: ScheduledTask
): Promise<{ ok: boolean; detail: string }> {
  if (!task.prompt) return { ok: false, detail: 'task has no prompt' }

  // Scheduled prompts go through the same wake chain as an AMP message, so a
  // scheduled instruction is delivered with the same proof-of-arrival rules as
  // anything else: confirmed, deferred while the agent is mid-render, or
  // queued for retry. A schedule that fires into the void would be worse than
  // no schedule.
  const { runWakeChain, describeWakeResult } = await import('@/lib/wake-chain')
  const { getAgent } = await import('@/lib/agent-registry')
  const agent = getAgent(agentId)

  const wake = await runWakeChain({
    agentId,
    agentName: agent?.name || agentId,
    injectText: `[SCHEDULED] ${task.prompt}`,
    injectBody: task.prompt,
    senderName: 'scheduler',
    subject: `Scheduled task: ${task.id}`,
    messageId: `sched-${task.id}-${Date.now()}`,
    messageType: 'notification',
  })

  return {
    ok: wake.confirmed || wake.notified || wake.deferred,
    detail: describeWakeResult(wake),
  }
}

async function runTask(agentId: string, task: ScheduledTask): Promise<TaskRunResult> {
  const t0 = Date.now()
  let outcome: { ok: boolean; detail: string }
  try {
    switch (task.action) {
      case 'index':
        outcome = await runIndex(agentId)
        break
      case 'consolidate':
        outcome = await runConsolidate(agentId)
        break
      case 'prompt':
        outcome = await runPrompt(agentId, task)
        break
      default:
        outcome = { ok: false, detail: `unknown action: ${task.action}` }
    }
  } catch (err) {
    outcome = { ok: false, detail: err instanceof Error ? err.message : String(err) }
  }

  markRun(agentId, task.id, outcome)
  return { taskId: task.id, action: task.action, ...outcome, ms: Date.now() - t0 }
}

/**
 * Run whatever this agent is due for.
 *
 * `markRun` records the attempt whether it succeeded or failed, so a task that
 * errors backs off for its normal interval instead of retrying on every idle
 * transition — an agent that goes idle frequently would otherwise hammer a
 * broken task continuously.
 */
export async function runDueTasks(agentId: string): Promise<ScheduleRunResult> {
  if (inFlight.has(agentId)) return { agentId, ran: [], skipped: 1 }
  inFlight.add(agentId)
  try {
    const schedule = readSchedule(agentId)
    const due = dueTasks(schedule)
    const ran: TaskRunResult[] = []
    for (const task of due) {
      const r = await runTask(agentId, task)
      ran.push(r)
      if (!r.ok) {
        console.warn(`[Schedule] ${agentId.substring(0, 8)} ${task.id} failed: ${r.detail}`)
      } else {
        console.log(`[Schedule] ${agentId.substring(0, 8)} ${task.id}: ${r.detail} (${r.ms}ms)`)
      }
    }
    return { agentId, ran, skipped: 0 }
  } finally {
    inFlight.delete(agentId)
  }
}
