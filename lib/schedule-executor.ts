import { exec } from 'child_process'
import { promisify } from 'util'
import {
  getDueSchedules,
  recordExecution,
  completeExecution,
  advanceNextRun,
} from '@/lib/schedule-registry'
import { getAgent } from '@/lib/agent-registry'
import { getRuntime } from '@/lib/agent-runtime'
import type { Schedule } from '@/types/schedule'

const execAsync = promisify(exec)

const CHECK_INTERVAL_MS = 60_000
const EXISTING_SESSION_DELAY_MS = 2_000
const NEW_SESSION_LAUNCH_DELAY_MS = 15_000
const DEFAULT_TIMEOUT_MS = 300_000

let intervalHandle: ReturnType<typeof setInterval> | null = null
const runningExecutions = new Set<string>()

export function startScheduler(): void {
  if (intervalHandle) return
  console.log('[Scheduler] Starting schedule check loop (60s interval)')
  intervalHandle = setInterval(checkAndExecute, CHECK_INTERVAL_MS)
  // Also run immediately on startup
  setTimeout(checkAndExecute, 5_000)
}

export function stopScheduler(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle)
    intervalHandle = null
    console.log('[Scheduler] Stopped')
  }
}

export function isSchedulerRunning(): boolean {
  return intervalHandle !== null
}

export function getRunningExecutions(): string[] {
  return Array.from(runningExecutions)
}

async function checkAndExecute(): Promise<void> {
  try {
    const due = getDueSchedules()
    if (due.length === 0) return

    console.log(`[Scheduler] ${due.length} schedule(s) due`)
    for (const schedule of due) {
      if (runningExecutions.has(schedule.id)) {
        console.log(`[Scheduler] Skipping ${schedule.name} — already executing`)
        advanceNextRun(schedule.id)
        continue
      }
      executeSchedule(schedule, 'cron')
    }
  } catch (error) {
    console.error('[Scheduler] Check loop error:', error)
  }
}

export async function executeSchedule(
  schedule: Schedule,
  triggeredBy: 'cron' | 'manual' | 'webhook' = 'cron'
): Promise<{ executionId: string; status: string }> {
  const runtime = getRuntime()
  const agent = getAgent(schedule.agentId)
  const sessionName = agent?.name || schedule.agentName

  let sessionExisted = false
  try {
    sessionExisted = await runtime.sessionExists(sessionName)
  } catch {
    sessionExisted = false
  }

  const execution = recordExecution({
    scheduleId: schedule.id,
    agentId: schedule.agentId,
    agentName: schedule.agentName,
    prompt: schedule.prompt,
    triggeredBy,
    sessionExisted,
  })

  runningExecutions.add(schedule.id)
  console.log(
    `[Scheduler] Executing "${schedule.name}" for agent ${schedule.agentName} ` +
    `(trigger=${triggeredBy}, session=${sessionExisted ? 'existing' : 'new'})`
  )

  // Fire and forget — don't block the check loop
  runExecution(schedule, execution.id, sessionName, sessionExisted)
    .catch(error => {
      console.error(`[Scheduler] Execution failed for ${schedule.name}:`, error)
      completeExecution(execution.id, 'failure', String(error))
    })
    .finally(() => {
      runningExecutions.delete(schedule.id)
    })

  return { executionId: execution.id, status: 'started' }
}

async function runExecution(
  schedule: Schedule,
  executionId: string,
  sessionName: string,
  sessionExisted: boolean
): Promise<void> {
  const runtime = getRuntime()

  if (!sessionExisted) {
    // Need to wake the agent: create tmux session + launch claude
    const agent = getAgent(schedule.agentId)
    const cwd = agent?.workingDirectory || process.cwd()

    console.log(`[Scheduler] Creating tmux session "${sessionName}" in ${cwd}`)
    const env = { ...process.env, TMUX: undefined }
    await execAsync(`tmux new-session -d -s "${sessionName}" -c "${cwd}"`, { env })

    // Wait for shell to be ready
    await sleep(1_000)

    // Launch Claude Code
    console.log(`[Scheduler] Launching claude in "${sessionName}"`)
    await runtime.sendKeys(sessionName, '"claude"', { enter: true })

    // Wait for Claude to initialize — this is the fragile part
    console.log(`[Scheduler] Waiting ${NEW_SESSION_LAUNCH_DELAY_MS / 1000}s for claude to start...`)
    await sleep(NEW_SESSION_LAUNCH_DELAY_MS)
  } else {
    // Session exists — small delay to ensure we're not mid-keystroke
    await sleep(EXISTING_SESSION_DELAY_MS)
  }

  // Send the prompt
  console.log(`[Scheduler] Sending prompt to "${sessionName}": ${schedule.prompt.substring(0, 80)}...`)
  const escaped = schedule.prompt.replace(/'/g, "'\\''")
  await runtime.sendKeys(sessionName, escaped, { literal: true, enter: true })

  // For now, mark as success after sending. We can't easily detect when Claude
  // finishes processing. Future: poll tmux pane for idle indicator.
  const timeoutMs = schedule.timeoutMs || DEFAULT_TIMEOUT_MS
  console.log(
    `[Scheduler] Prompt sent for "${schedule.name}". ` +
    `Marking success (timeout tracking: ${timeoutMs / 1000}s — not yet implemented)`
  )
  completeExecution(executionId, 'success')
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
