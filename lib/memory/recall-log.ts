/**
 * What memory was actually given to the agent.
 *
 * Until now `access_count` was bumped by any embedding search that returned a
 * memory, and consolidation's own link-finding searches return every memory
 * many times. Measured 2026-09-23: 918 of 918 memories across the fleet showed
 * as "recalled", which said nothing about use.
 *
 * Now only an injection counts. The hook appends one line per injection to the
 * agent's own log (`memory-recalls.jsonl`, in the agent's directory):
 *
 *   {"at": 1758600000000, "session": "…", "kind": "prompt" | "primer", "ids": ["…"], "entities": ["…"]}
 *
 * Consolidation folds new lines into `access_count` / `last_accessed_at`. The
 * log is kept whole: it is the raw data for "did the agent use its memory".
 */

import fs from 'fs'
import os from 'os'
import path from 'path'
import { AgentDatabase } from '../cozo-db'
import { escapeForCozo } from '../cozo-utils'

export const RECALL_LOG = 'memory-recalls.jsonl'
const OFFSET_FILE = 'memory-recalls.offset'

const agentDir = (agentId: string) => path.join(os.homedir(), '.aimaestro', 'agents', agentId)

export interface RecallLogEntry {
  at: number
  session?: string
  kind?: 'prompt' | 'primer'
  ids: string[]
  entities?: string[]
}

/** New entries since the last fold, and the byte offset they end at. */
export function readNewRecalls(agentId: string): { entries: RecallLogEntry[]; end: number; start: number } {
  const file = path.join(agentDir(agentId), RECALL_LOG)
  let start = 0
  try { start = parseInt(fs.readFileSync(path.join(agentDir(agentId), OFFSET_FILE), 'utf-8'), 10) || 0 } catch { /* first fold */ }
  let buf: Buffer
  try { buf = fs.readFileSync(file) } catch { return { entries: [], end: start, start } }
  if (start > buf.length) start = 0 // log was rotated or replaced
  // Only whole lines: the hook may be mid-append
  const text = buf.subarray(start).toString('utf-8')
  const lastNewline = text.lastIndexOf('\n')
  if (lastNewline < 0) return { entries: [], end: start, start }
  const entries: RecallLogEntry[] = []
  for (const line of text.slice(0, lastNewline).split('\n')) {
    try {
      const e = JSON.parse(line)
      if (e && Array.isArray(e.ids)) entries.push(e)
    } catch { /* torn or foreign line */ }
  }
  return { entries, end: start + Buffer.byteLength(text.slice(0, lastNewline + 1)), start }
}

/** Fold new injections into access_count. Returns how many injections were counted. */
export async function foldRecallLog(agentDb: AgentDatabase, agentId: string): Promise<number> {
  const { entries, end } = readNewRecalls(agentId)
  if (entries.length === 0) return 0
  const counts = new Map<string, { n: number; last: number }>()
  for (const e of entries) {
    for (const id of e.ids) {
      const c = counts.get(id) || { n: 0, last: 0 }
      c.n++
      c.last = Math.max(c.last, e.at || 0)
      counts.set(id, c)
    }
  }
  for (const [id, c] of counts) {
    await agentDb.run(`
      ?[memory_id, access_count, last_accessed_at] :=
        *memories{memory_id, access_count: old},
        memory_id = ${escapeForCozo(id)},
        access_count = old + ${c.n},
        last_accessed_at = ${Math.floor(c.last) || Date.now()}
      :update memories
    `).catch(() => { /* the memory was deleted since */ })
  }
  try { fs.writeFileSync(path.join(agentDir(agentId), OFFSET_FILE), String(end)) } catch { /* recounted next time */ }
  return entries.length
}
