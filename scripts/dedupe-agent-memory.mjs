#!/usr/bin/env node
/**
 * Deduplicate message rows in agent memory databases.
 *
 * Before deterministic msg_ids, every re-index inserted a fresh copy of each
 * message plus its ~26 term rows and its ~1.5 KB embedding. Long-lived agents
 * measured at 6.8x and 9.5x duplication, which is the dominant cost in the
 * multi-GB databases.
 *
 * Usage:
 *   node scripts/dedupe-agent-memory.mjs                 # dry run, all agents
 *   node scripts/dedupe-agent-memory.mjs --apply         # delete, all agents
 *   node scripts/dedupe-agent-memory.mjs --agent <id>    # one agent
 *   node scripts/dedupe-agent-memory.mjs --min-mb 500    # only large ones
 *
 * Dry run is the default on purpose: the delete is not reversible.
 *
 * Stop AI Maestro first, or run against agents it has not loaded — CozoDB is a
 * single-writer embedded store and a live server may hold the file open.
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { CozoDb } from 'cozo-node'

const AGENTS_DIR = path.join(os.homedir(), '.aimaestro', 'agents')
const BATCH = 500

const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const ONLY = args.includes('--agent') ? args[args.indexOf('--agent') + 1] : null
const MIN_MB = args.includes('--min-mb') ? Number(args[args.indexOf('--min-mb') + 1]) : 0

const esc = (s) => `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
const inlineIds = (ids) => ids.map((id) => `[${esc(id)}]`).join(', ')
const mb = (p) => +(fs.statSync(p).size / 1e6).toFixed(1)

async function dedupeOne(dbPath) {
  const before = mb(dbPath)
  const db = new CozoDb('sqlite', dbPath)
  const q = async (s) => (await db.run(s)).rows

  let rows
  try {
    rows = await q(`?[msg_id, conversation_file, ts, text] := *messages{msg_id, conversation_file, ts, text}`)
  } catch {
    return { before, skipped: 'no messages relation' }
  }

  const seen = new Set()
  const doomed = []
  for (const [msgId, file, ts, text] of rows) {
    const key = `${file} ${ts} ${text}`
    if (seen.has(key)) doomed.push(msgId)
    else seen.add(key)
  }

  const stat = {
    before,
    scanned: rows.length,
    unique: seen.size,
    duplicates: doomed.length,
    factor: seen.size ? +(rows.length / seen.size).toFixed(2) : 1,
  }
  if (!APPLY || doomed.length === 0) return stat

  for (const [rel, col] of [['msg_terms', 'term'], ['code_symbols', 'symbol']]) {
    for (let i = 0; i < doomed.length; i += BATCH) {
      const batch = inlineIds(doomed.slice(i, i + BATCH))
      try {
        await db.run(`
          doomed[msg_id] <- [${batch}]
          ?[msg_id, ${col}] := doomed[msg_id], *${rel}{msg_id, ${col}}
          :delete ${rel}
        `)
      } catch (e) { /* relation may not exist on older agents */ }
    }
  }
  for (const rel of ['msg_vec', 'messages']) {
    for (let i = 0; i < doomed.length; i += BATCH) {
      try {
        await db.run(`?[msg_id] <- [${inlineIds(doomed.slice(i, i + BATCH))}] :delete ${rel}`)
      } catch (e) { /* ditto */ }
    }
  }

  // Orphans: dependent rows whose message no longer exists. Some predate this
  // script (msg_vec held 131,445 rows for 57,686 messages on the agent this was
  // developed against), so sweep regardless of what we just deleted.
  for (const [rel, col] of [['msg_terms', 'term'], ['code_symbols', 'symbol']]) {
    try {
      await db.run(`
        ?[msg_id, ${col}] := *${rel}{msg_id, ${col}}, not *messages{msg_id}
        :delete ${rel}
      `)
    } catch (e) { /* relation may not exist */ }
  }
  try {
    await db.run(`?[msg_id] := *msg_vec{msg_id}, not *messages{msg_id} :delete msg_vec`)
  } catch (e) { /* ditto */ }

  // Deleted pages go to SQLite's freelist; the file only shrinks on VACUUM.
  // Cozo has no VACUUM verb, so this runs against the closed file via the
  // sqlite3 CLI. Measured: 3,094.9 MB -> 582 MB in 2.8s.
  stat.beforeVacuum = mb(dbPath)
  try {
    execFileSync('sqlite3', [dbPath, 'VACUUM;'], { stdio: 'pipe' })
  } catch (e) {
    console.warn(`  (VACUUM skipped — sqlite3 CLI unavailable; run 'sqlite3 ${dbPath} VACUUM;' to reclaim)`)
  }

  stat.after = mb(dbPath)
  return stat
}

const dirs = ONLY
  ? [ONLY]
  : fs.readdirSync(AGENTS_DIR).filter((d) => fs.existsSync(path.join(AGENTS_DIR, d, 'agent.db')))

console.log(`${APPLY ? 'APPLYING' : 'DRY RUN'} — ${dirs.length} agent(s)\n`)

let totalDup = 0
let totalScanned = 0
for (const id of dirs) {
  const dbPath = path.join(AGENTS_DIR, id, 'agent.db')
  if (!fs.existsSync(dbPath)) continue
  if (mb(dbPath) < MIN_MB) continue
  try {
    const r = await dedupeOne(dbPath)
    if (r.skipped) continue
    totalDup += r.duplicates || 0
    totalScanned += r.scanned || 0
    const sizes = r.after !== undefined ? `${r.before} -> ${r.after} MB` : `${r.before} MB`
    console.log(
      `${id.slice(0, 8)}  ${sizes.padEnd(22)} ${String(r.scanned).padStart(8)} rows  ` +
      `${String(r.unique).padStart(8)} unique  ${r.factor}x  ${r.duplicates} dupes`
    )
  } catch (e) {
    console.log(`${id.slice(0, 8)}  ERROR: ${e.message.split('\n')[0].slice(0, 80)}`)
  }
}

console.log(`\ntotal: ${totalScanned} rows scanned, ${totalDup} duplicates ${APPLY ? 'removed' : 'found'}`)
if (!APPLY && totalDup > 0) console.log('re-run with --apply to delete (not reversible)')
