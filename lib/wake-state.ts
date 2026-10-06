/**
 * Which messages have already been handed to a wake route, and when.
 *
 * Three things wake an agent for a message: the routing-time push
 * (lib/message-delivery.ts), the per-agent 5-minute poll (lib/agent.ts) and the
 * host-wide inbox sweeper (lib/inbox-sweeper.ts). A wake costs a paid turn, so
 * they must agree on "this message was already handed over". This is that
 * record. It is a memory aid, never a gate on delivery: when it is missing or
 * unreadable the sweeper starts clean (and baselines, see `isFirstRun`).
 *
 * Persisted to ~/.aimaestro/wake-state.json (AIM_WAKE_STATE_FILE overrides it)
 * so a restart does not wake every unread message again. Disabled under vitest
 * unless a file is named.
 */

import fs from 'fs'
import os from 'os'
import path from 'path'

export interface WakeRecord {
  /** First time any path handed this message to a wake route (ms). */
  firstWake: number
  /** Most recent hand-off (ms). */
  lastWake: number
  /** Hand-offs so far, across every path. */
  count: number
}

const KEEP_MS = 14 * 24 * 60 * 60 * 1000

let records: Map<string, WakeRecord> | null = null
let firstRun = false
let saveTimer: ReturnType<typeof setTimeout> | null = null

function filePath(): string {
  return process.env.AIM_WAKE_STATE_FILE || path.join(os.homedir(), '.aimaestro', 'wake-state.json')
}

function persistent(): boolean {
  return !process.env.VITEST || !!process.env.AIM_WAKE_STATE_FILE
}

function key(agentId: string, messageId: string): string {
  return `${agentId}:${messageId}`
}

function load(): Map<string, WakeRecord> {
  if (records) return records
  records = new Map()
  if (!persistent()) return records
  try {
    const raw = JSON.parse(fs.readFileSync(filePath(), 'utf-8')) as Record<string, WakeRecord>
    const cutoff = Date.now() - KEEP_MS
    for (const [k, v] of Object.entries(raw)) {
      if (v && typeof v.lastWake === 'number' && v.lastWake > cutoff) records.set(k, v)
    }
  } catch (err) {
    // No file yet (first run) or it is corrupt: start clean. Either way the
    // sweeper must not treat every old unread message as new.
    firstRun = true
  }
  return records
}

function scheduleSave() {
  if (!persistent() || saveTimer) return
  saveTimer = setTimeout(() => {
    saveTimer = null
    try {
      const dir = path.dirname(filePath())
      fs.mkdirSync(dir, { recursive: true })
      const tmp = `${filePath()}.tmp`
      fs.writeFileSync(tmp, JSON.stringify(Object.fromEntries(load())))
      fs.renameSync(tmp, filePath())
    } catch {
      // Best effort: a lost write costs at most one repeated wake after a restart.
    }
  }, 2000)
  saveTimer.unref?.()
}

/**
 * True once, on the first call after a start that found no usable state file.
 * The sweeper uses it to baseline whatever is unread at that moment.
 */
export function takeFirstRun(): boolean {
  load()
  const was = firstRun
  firstRun = false
  return was
}

export function getWakeRecord(agentId: string, messageId: string): WakeRecord | undefined {
  return load().get(key(agentId, messageId))
}

/** Record that a wake route was handed this message (any path). */
export function recordWake(agentId: string, messageId: string, now = Date.now()): WakeRecord {
  const map = load()
  const k = key(agentId, messageId)
  const prev = map.get(k)
  const next: WakeRecord = prev
    ? { ...prev, lastWake: now, count: prev.count + 1 }
    : { firstWake: now, lastWake: now, count: 1 }
  map.set(k, next)
  scheduleSave()
  return next
}

/**
 * Mark a message as seen without waking anything. Used for the first-run
 * baseline: `count` is set to `count` so the sweeper's attempt cap treats the
 * message as already used up.
 */
export function baselineMessage(agentId: string, messageId: string, count: number, now = Date.now()): void {
  const map = load()
  const k = key(agentId, messageId)
  if (map.has(k)) return
  map.set(k, { firstWake: now, lastWake: now, count })
  scheduleSave()
}

export function __resetWakeState(): void {
  records = null
  firstRun = false
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
}
