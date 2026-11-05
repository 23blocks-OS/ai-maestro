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
import { pushToStreamSession } from '@/lib/streaming-bridge.mjs'
import { deliverAndVerify } from '@/lib/chat-verify.mjs'
import { isPaneAtBareShell } from '@/lib/pane-occupant'

const execAsync = promisify(exec)

const CHECK_INTERVAL_MS = 60_000
const EXISTING_SESSION_DELAY_MS = 2_000
const NEW_SESSION_LAUNCH_DELAY_MS = 15_000

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
  const agent = getAgent(schedule.agentId)

  // An agent running as a streaming session gets the prompt there: a terminal beside it would be a second
  // process on its conversation
  if (agent && (pushToStreamSession(agent.id, schedule.prompt) || (!!agent.name && pushToStreamSession(agent.name, schedule.prompt)))) {
    console.log(`[Scheduler] Sent the prompt for "${schedule.name}" to ${agent.name}'s streaming session`)
    completeExecution(executionId, 'success')
    return
  }

  if (!sessionExisted) {
    if (agent?.runtimeMode === 'streaming') {
      throw new Error(`${agent.name} runs in streaming mode and its streaming session is not open; open it, or switch the agent to terminal mode`)
    }
    // The agent's own wake: its identity (AIM_AGENT_ID, AMP_DIR), its program and permissions, and the
    // guard that refuses a terminal while it runs elsewhere. This used to start a bare `claude`, which
    // took its identity from the folder.
    const { wakeAgent } = await import('@/services/agents-core-service')
    const woke = await wakeAgent(schedule.agentId, { startProgram: true })
    const data = woke.data as { woken?: boolean; message?: string; programStarted?: boolean; programError?: string } | undefined
    if (woke.status !== 200 || !data?.woken) throw new Error(`could not wake ${sessionName}: ${data?.message || woke.status}`)
    if (data.programStarted === false) throw new Error(`${sessionName} woke but its program did not start: ${data.programError || 'unknown'}`)

    // Wait for the program to initialize — this is the fragile part
    console.log(`[Scheduler] Waiting ${NEW_SESSION_LAUNCH_DELAY_MS / 1000}s for ${sessionName} to start...`)
    await sleep(NEW_SESSION_LAUNCH_DELAY_MS)
  } else {
    // Session exists — small delay to ensure we're not mid-keystroke
    await sleep(EXISTING_SESSION_DELAY_MS)
  }

  // Send the prompt and prove it was submitted (B030). This used to mark success as soon as the keys were
  // sent, so a scrolled pane, a dialog or a bare shell swallowed the prompt while the run said "success".
  await runtime.cancelCopyMode(sessionName)
  if (await isPaneAtBareShell(sessionName)) {
    throw new Error(`${sessionName} is at a bare shell (its program is not running); the prompt was not sent`)
  }
  console.log(`[Scheduler] Sending prompt to "${sessionName}": ${schedule.prompt.substring(0, 80)}...`)
  // Typed as written: send-keys -l passes it verbatim, so no shell escaping (it turned ' into '\'')
  const { submitted } = await deliverAndVerify(schedule.prompt, {
    capture: () => runtime.capturePaneRaw(sessionName),
    deliver: () => runtime.sendKeys(sessionName, schedule.prompt, { literal: true, enter: true }),
    clear: (count: number) => runtime.repeatKey(sessionName, 'BSpace', count),
  })
  if (!submitted) {
    throw new Error(`the prompt reached ${sessionName}'s input box but was never submitted; a prompt or dialog is holding the keyboard`)
  }
  console.log(`[Scheduler] Prompt for "${schedule.name}" submitted to ${sessionName}`)
  completeExecution(executionId, 'success')
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
