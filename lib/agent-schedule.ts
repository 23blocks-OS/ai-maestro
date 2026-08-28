/**
 * Agent-owned scheduled tasks.
 *
 * WHY THIS EXISTS RATHER THAN CRON
 *
 * An agent is meant to be an autonomous entity that can move between machines.
 * Its schedule therefore has to be *its* data, not the host's — so it lives at
 * `~/.aimaestro/agents/<id>/schedule.json`, beside the agent's CozoDB, keys and
 * canvas. Move that directory to another machine and the schedule moves with
 * it; whichever host is currently running the agent honours it, with no
 * per-machine setup.
 *
 * Claude Code's own scheduling could not provide this. Measured against the
 * requirement:
 *
 *   Cloud Routines      — no local file access (fresh clone), but the
 *                         subconscious must read ~/.claude/projects/*.jsonl and
 *                         the agent's local database.
 *   /loop + CronCreate  — session-scoped and in-memory ("nothing is written to
 *                         disk", `durable` has no effect), recurring tasks
 *                         auto-expire after 7 days, and they only fire while
 *                         that one session is open. An agent restart loses it.
 *   Desktop tasks       — persist with local access, but are machine-level
 *                         config tied to one host; the schedule would not
 *                         travel with the agent.
 *
 * EXECUTION IS EVENT-DRIVEN, NOT CLOCK-DRIVEN
 *
 * Tasks are considered when the agent goes idle — the Stop hook already tells
 * us that, per agent, on whichever host it runs. That is genuinely agent-level:
 * no timer owns the agent, the agent's own lifecycle drives its maintenance,
 * and work lands exactly when the agent is free rather than competing with it.
 * A bounded host-side sweep exists only as a fallback for agents that stay busy
 * or wedged; it still executes agent-owned schedules rather than a host-owned
 * list.
 *
 * This module is pure model + persistence. Execution lives in
 * lib/agent-schedule-runner.ts so the scheduling rules stay testable without
 * touching a database or an embedding model.
 */

import fs from 'fs'
import os from 'os'
import path from 'path'

/** What a task does when it fires. */
export type ScheduledAction =
  /** Index new conversation messages into the agent's memory (index-delta). */
  | 'index'
  /** Consolidate short-term memory into long-term knowledge. */
  | 'consolidate'
  /** Deliver a prompt to the agent through the wake chain. */
  | 'prompt'

export interface ScheduledTask {
  /** Stable id, unique within the agent. */
  id: string
  action: ScheduledAction
  /** Interval in milliseconds. Mutually exclusive with `atHour`. */
  everyMs?: number
  /** Local hour (0-23) for once-a-day tasks. Mutually exclusive with `everyMs`. */
  atHour?: number
  /** Prompt text — required for action 'prompt'. */
  prompt?: string
  enabled: boolean
  lastRunAt?: number
  lastOk?: boolean
  lastDetail?: string
  runCount?: number
}

export interface AgentSchedule {
  version: 1
  agentId: string
  tasks: ScheduledTask[]
}

const HOUR = 60 * 60 * 1000

function schedulePath(agentId: string): string {
  return path.join(os.homedir(), '.aimaestro', 'agents', agentId, 'schedule.json')
}

/**
 * The schedule a freshly-seen agent gets.
 *
 * Indexing hourly and consolidating overnight are what the subconscious was
 * always meant to do; before this they depended on the agent being resident in
 * a 10-slot LRU at the right moment, which is why neither reliably happened.
 */
export function defaultSchedule(agentId: string): AgentSchedule {
  return {
    version: 1,
    agentId,
    tasks: [
      { id: 'memory-index', action: 'index', everyMs: HOUR, enabled: true },
      { id: 'memory-consolidate', action: 'consolidate', atHour: 2, enabled: true },
    ],
  }
}

/** Read an agent's schedule, seeding the default when it has none yet. */
export function readSchedule(agentId: string): AgentSchedule {
  try {
    const raw = JSON.parse(fs.readFileSync(schedulePath(agentId), 'utf-8'))
    if (raw && Array.isArray(raw.tasks)) return { ...raw, agentId, version: 1 }
  } catch {
    // No schedule yet, or unreadable — fall through to the default rather than
    // leaving the agent with no maintenance at all.
  }
  return defaultSchedule(agentId)
}

/** Persist a schedule next to the agent's other portable state. */
export function writeSchedule(schedule: AgentSchedule): boolean {
  try {
    const p = schedulePath(schedule.agentId)
    fs.mkdirSync(path.dirname(p), { recursive: true })
    fs.writeFileSync(p, JSON.stringify(schedule, null, 2))
    return true
  } catch {
    return false
  }
}

/**
 * Is this task due?
 *
 * Interval tasks are due once `everyMs` has elapsed since the last run — and
 * immediately if they have never run, so a newly-moved agent starts working
 * rather than waiting out a full interval on its new host.
 *
 * Daily tasks are due when the local hour matches and the task has not already
 * run within the last 23 hours. The 23-hour window (rather than "today") means
 * a machine that was asleep at 2am still consolidates when it wakes, instead of
 * silently skipping a day — the exact failure mode of the old
 * resident-at-2am-or-never design.
 */
export function isDue(task: ScheduledTask, now: number = Date.now()): boolean {
  if (!task.enabled) return false

  if (typeof task.everyMs === 'number') {
    if (!task.lastRunAt) return true
    return now - task.lastRunAt >= task.everyMs
  }

  if (typeof task.atHour === 'number') {
    if (new Date(now).getHours() !== task.atHour) return false
    if (!task.lastRunAt) return true
    return now - task.lastRunAt >= 23 * HOUR
  }

  // Neither cadence set: not schedulable. Enabled-but-unschedulable is a
  // config mistake, and silently never running is friendlier than throwing
  // inside an agent's idle transition.
  return false
}

/** Tasks currently due, in declaration order. */
export function dueTasks(schedule: AgentSchedule, now: number = Date.now()): ScheduledTask[] {
  return schedule.tasks.filter((t) => isDue(t, now))
}

/** Record the outcome of a run and persist it. */
export function markRun(
  agentId: string,
  taskId: string,
  result: { ok: boolean; detail?: string },
  now: number = Date.now()
): AgentSchedule {
  const schedule = readSchedule(agentId)
  const task = schedule.tasks.find((t) => t.id === taskId)
  if (task) {
    task.lastRunAt = now
    task.lastOk = result.ok
    task.lastDetail = result.detail
    task.runCount = (task.runCount ?? 0) + 1
    writeSchedule(schedule)
  }
  return schedule
}

/** Human-readable cadence, for status output. */
export function describeCadence(task: ScheduledTask): string {
  if (typeof task.everyMs === 'number') {
    const mins = Math.round(task.everyMs / 60000)
    return mins >= 60 ? `every ${Math.round(mins / 60)}h` : `every ${mins}m`
  }
  if (typeof task.atHour === 'number') return `daily at ${String(task.atHour).padStart(2, '0')}:00`
  return 'unscheduled'
}
