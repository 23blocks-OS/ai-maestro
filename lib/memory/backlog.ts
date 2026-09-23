/**
 * Night backlog: history that has not been consolidated yet.
 *
 * One consolidation run has a budget (about three conversations' worth of
 * passages and ten summarizer calls). The nightly schedule gives an agent one
 * run, so an agent with months of history (IaC: 422 conversations) would take
 * months to catch up. Claude Code deletes transcripts after 30 days; the
 * message index keeps them, and this is what turns that index into memory.
 *
 * Every consolidation records whether it left work behind
 * (`memory-backlog.json` in the agent's directory). During the night window the
 * backlog worker keeps consolidating agents that have some, one agent at a time,
 * round-robin so each gets its newest history first, until the window closes or
 * no agent has a backlog. An agent whose run makes no progress (a summarizer
 * usage limit, a classifier outage) is skipped for the rest of the night.
 */

import fs from 'fs'
import os from 'os'
import path from 'path'
import { isMemorySkillEnabled } from './skill'

export interface BacklogState {
  moreRemaining: boolean
  at: number
  conversationsProcessed: number
  memoriesCreated: number
}

const agentDir = (agentId: string) => path.join(os.homedir(), '.aimaestro', 'agents', agentId)
const backlogFile = (agentId: string) => path.join(agentDir(agentId), 'memory-backlog.json')

export function readBacklog(agentId: string): BacklogState | null {
  try {
    return JSON.parse(fs.readFileSync(backlogFile(agentId), 'utf-8'))
  } catch {
    return null
  }
}

export function writeBacklog(agentId: string, state: BacklogState): void {
  try {
    fs.writeFileSync(backlogFile(agentId), JSON.stringify(state, null, 2))
  } catch {
    // Without the marker the agent simply waits for its next nightly run
  }
}

/**
 * Agents with a backlog, least recently run first. An agent that never ran
 * consolidation has no marker and is not here: its nightly run creates one.
 */
export function agentsWithBacklog(): string[] {
  let ids: string[] = []
  try {
    ids = fs.readdirSync(path.join(os.homedir(), '.aimaestro', 'agents'))
  } catch {
    return []
  }
  return ids
    .map(id => ({ id, state: readBacklog(id) }))
    .filter(a => a.state?.moreRemaining && isMemorySkillEnabled(a.id))
    .sort((a, b) => (a.state!.at || 0) - (b.state!.at || 0))
    .map(a => a.id)
}

/** The night window: 2 to 8 AM local, the same as the nightly sweep. */
export function inNightWindow(now = new Date()): boolean {
  const h = now.getHours()
  return h >= 2 && h < 8
}

export interface BacklogPassResult {
  runs: number
  agents: number
  stoppedBecause: 'window_closed' | 'no_backlog' | 'already_running'
}

let running = false

/**
 * Work the backlog until the night window closes or nothing is left.
 * `consolidate` is injected so this stays testable without a database.
 */
export async function runBacklogPass(
  consolidate: (agentId: string) => Promise<{ conversations_processed?: number; memories_created?: number; status?: string } | null>,
  opts: { inWindow?: () => boolean; maxRuns?: number } = {}
): Promise<BacklogPassResult> {
  if (running) return { runs: 0, agents: 0, stoppedBecause: 'already_running' }
  running = true
  const inWindow = opts.inWindow ?? (() => inNightWindow())
  const maxRuns = opts.maxRuns ?? 10_000
  const stalled = new Set<string>()
  const touched = new Set<string>()
  let runs = 0
  try {
    while (runs < maxRuns) {
      if (!inWindow()) return { runs, agents: touched.size, stoppedBecause: 'window_closed' }
      const next = agentsWithBacklog().find(id => !stalled.has(id))
      if (!next) return { runs, agents: touched.size, stoppedBecause: 'no_backlog' }
      touched.add(next)
      runs++
      let result: Awaited<ReturnType<typeof consolidate>> = null
      try {
        result = await consolidate(next)
      } catch (err) {
        console.warn(`[Memory Backlog] ${next.substring(0, 8)} failed: ${err instanceof Error ? err.message : err}`)
      }
      if (!result || !result.conversations_processed) {
        // No progress: a usage limit or an outage. Try again tomorrow night.
        stalled.add(next)
        continue
      }
      console.log(`[Memory Backlog] ${next.substring(0, 8)}: ${result.conversations_processed} conversations, ${result.memories_created || 0} memories`)
    }
    return { runs, agents: touched.size, stoppedBecause: 'window_closed' }
  } finally {
    running = false
  }
}
