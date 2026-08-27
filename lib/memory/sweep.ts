/**
 * Memory maintenance sweep — indexing that does not require residency.
 *
 * WHY
 *
 * Memory maintenance used to run only from an Agent object's timer, and Agent
 * objects only exist inside `agentRegistry`, an LRU capped at 10. With 125
 * agents on this host that meant:
 *
 *   - an agent was indexed only if something happened to load it
 *   - loading the 11th agent evicted the 1st, cancelling its timers
 *   - consolidation, gated on being resident at 2 AM, essentially never ran
 *
 * Measured before this existed: 8 of 125 agent databases had been written in
 * the previous 7 days, and two of three "running" agents reported
 * `lastMemoryRun: null`.
 *
 * The work itself never needed the Agent object. `runIndexDelta(agentId)` takes
 * an id and opens the database itself. So the sweep walks agent directories on
 * disk and calls it directly — no hydration, no eviction, no LRU pressure, and
 * no dependency on which ten agents happen to be loaded.
 *
 * This is the same shape as Letta's sleep-time agents: maintenance runs on a
 * lifecycle independent of the primary, rather than piggybacking on it.
 */

import fs from 'fs'
import os from 'os'
import path from 'path'

export interface SweepAgentResult {
  agentId: string
  messagesProcessed: number
  conversationsDiscovered: number
  ms: number
  error?: string
}

export interface SweepResult {
  scanned: number
  indexed: number
  failed: number
  messagesProcessed: number
  ms: number
  agents: SweepAgentResult[]
}

export interface SweepOptions {
  /** Cap agents processed in one pass. Keeps a sweep bounded on a big host. */
  limit?: number
  /** Skip agents whose last successful index is newer than this (ms). */
  minAgeMs?: number
  /** Process only these agent ids. */
  only?: string[]
}

const AGENTS_DIR = () => path.join(os.homedir(), '.aimaestro', 'agents')

/** Agent ids that have a database on disk — the set worth sweeping. */
export function listIndexableAgents(): string[] {
  try {
    return fs
      .readdirSync(AGENTS_DIR())
      .filter((id) => fs.existsSync(path.join(AGENTS_DIR(), id, 'agent.db')))
  } catch {
    return []
  }
}

/** When this agent was last swept, from the marker the sweep writes. */
function lastSweptAt(agentId: string): number {
  try {
    const p = path.join(AGENTS_DIR(), agentId, 'last-sweep.json')
    return JSON.parse(fs.readFileSync(p, 'utf-8')).at ?? 0
  } catch {
    return 0
  }
}

function markSwept(agentId: string, result: Omit<SweepAgentResult, 'agentId'>): void {
  try {
    const p = path.join(AGENTS_DIR(), agentId, 'last-sweep.json')
    fs.writeFileSync(p, JSON.stringify({ at: Date.now(), ...result }, null, 2))
  } catch {
    // A missing marker only means the agent gets swept again sooner.
  }
}

/**
 * Index every eligible agent once.
 *
 * Sequential on purpose. Each `runIndexDelta` opens a CozoDB file and may call
 * the embedding model; running 125 of those concurrently would be far more
 * disruptive than the slow path is valuable. One agent failing never stops the
 * sweep — a single corrupt database must not strand the other 124.
 */
export async function sweepAgentMemory(opts: SweepOptions = {}): Promise<SweepResult> {
  const { limit, minAgeMs = 0, only } = opts
  const started = Date.now()

  let candidates = only ?? listIndexableAgents()
  if (minAgeMs > 0) {
    candidates = candidates.filter((id) => Date.now() - lastSweptAt(id) >= minAgeMs)
  }
  // Oldest first, so a limited sweep makes progress across the fleet instead of
  // re-visiting the same head of the list every time.
  candidates.sort((a, b) => lastSweptAt(a) - lastSweptAt(b))
  if (limit) candidates = candidates.slice(0, limit)

  const { runIndexDelta } = await import('@/lib/index-delta')

  const agents: SweepAgentResult[] = []
  let indexed = 0
  let failed = 0
  let messagesProcessed = 0

  for (const agentId of candidates) {
    const t0 = Date.now()
    try {
      const r = await runIndexDelta(agentId)
      const entry: SweepAgentResult = {
        agentId,
        messagesProcessed: r.total_messages_processed || 0,
        conversationsDiscovered: r.new_conversations_discovered || 0,
        ms: Date.now() - t0,
      }
      // runIndexDelta RETURNS {success:false} on failure rather than throwing,
      // so catching exceptions alone counted broken runs as successes. That is
      // how a host whose embedding provider was misconfigured reported
      // "17 indexed, 0 failed, 0 messages" for months.
      if (r.success === false) {
        entry.error = (r as { error?: string }).error || 'index-delta reported failure'
        failed++
      } else {
        indexed++
      }
      agents.push(entry)
      markSwept(agentId, entry)
      messagesProcessed += entry.messagesProcessed
    } catch (err) {
      const entry: SweepAgentResult = {
        agentId,
        messagesProcessed: 0,
        conversationsDiscovered: 0,
        ms: Date.now() - t0,
        error: err instanceof Error ? err.message : String(err),
      }
      agents.push(entry)
      markSwept(agentId, entry)
      failed++
    }
  }

  return {
    scanned: candidates.length,
    indexed,
    failed,
    messagesProcessed,
    ms: Date.now() - started,
    agents,
  }
}
