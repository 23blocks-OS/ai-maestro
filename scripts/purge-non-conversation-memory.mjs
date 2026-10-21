#!/usr/bin/env node
/**
 * Remove message rows that are not conversation from agent memory databases.
 *
 * Before 0.93.6 the indexer stored any transcript line that had `message.content`. Since Claude
 * Code 2.1.300 that includes `api-request-blob` (the system prompt, tool list and history of each
 * API request). The row's `role` is the record's own `type`, so a row whose role is not `user`,
 * `assistant` or `system` provably came from a record that was never a chat message. Nothing else
 * is touched: no guessing from the text.
 *
 * Usage:
 *   node scripts/purge-non-conversation-memory.mjs                    # dry run, all agents
 *   node scripts/purge-non-conversation-memory.mjs --apply            # delete, all agents
 *   node scripts/purge-non-conversation-memory.mjs --agent <id>       # one agent
 *   node scripts/purge-non-conversation-memory.mjs --agents-dir <dir> # a copy, not ~/.aimaestro/agents
 *
 * Dry run is the default. --apply first copies each agent.db next to itself as
 * agent.db.before-purge-<time> (it needs that much free disk), and stops for that agent if the
 * copy fails. A database that another process has open is skipped (CozoDB is single-writer):
 * stop AI Maestro first, or point --agents-dir at a copy.
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { execFileSync } from 'node:child_process'
import { CozoDb } from 'cozo-node'

/** Roles that are conversation. Every other role is the `type` of a record that was not. */
export const KEEP_ROLES = ['user', 'assistant', 'system']
const BATCH = 500

const esc = (s) => `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
const mb = (p) => +(fs.statSync(p).size / 1e6).toFixed(1)

/** True when another process holds the file open (lsof is not everywhere; then we cannot tell) */
function heldOpen(file) {
  try {
    return execFileSync('lsof', ['-t', '--', file], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim().length > 0
  } catch (e) {
    return false // lsof exits 1 when nothing has it open (or is missing)
  }
}

export async function purgeOne(dbPath, { apply = false, now = () => new Date() } = {}) {
  const before = mb(dbPath)
  const db = new CozoDb('sqlite', dbPath)
  const q = async (s) => (await db.run(s)).rows
  try {
    let roleRows
    try {
      roleRows = await q('?[role, count(msg_id)] := *messages{msg_id, role}')
    } catch {
      return { before, skipped: 'no messages relation' }
    }
    const total = roleRows.reduce((n, [, c]) => n + c, 0)
    const byRole = Object.fromEntries(roleRows.filter(([r]) => !KEEP_ROLES.includes(r)))
    const doomedCount = Object.values(byRole).reduce((n, c) => n + c, 0)
    const stat = { before, total, doomed: doomedCount, byRole }
    if (!apply || doomedCount === 0) return stat

    // A copy first. Anything that goes wrong after this can be put back by renaming it.
    const stamp = now().toISOString().replace(/[:.]/g, '-')
    const backup = `${dbPath}.before-purge-${stamp}`
    for (const suffix of ['', '-wal', '-shm']) {
      if (fs.existsSync(dbPath + suffix)) fs.copyFileSync(dbPath + suffix, backup + suffix)
    }
    stat.backup = backup

    const ids = (await q(`?[msg_id] := *messages{msg_id, role}, not is_in(role, [${KEEP_ROLES.map(esc).join(', ')}])`)).map(r => r[0])
    const inline = (batch) => batch.map((id) => `[${esc(id)}]`).join(', ')
    for (let i = 0; i < ids.length; i += BATCH) {
      const batch = inline(ids.slice(i, i + BATCH))
      for (const [rel, col] of [['msg_terms', 'term'], ['code_symbols', 'symbol']]) {
        try {
          await db.run(`doomed[msg_id] <- [${batch}]\n?[msg_id, ${col}] := doomed[msg_id], *${rel}{msg_id, ${col}}\n:delete ${rel}`)
        } catch { /* relation may not exist on older agents */ }
      }
      for (const rel of ['msg_vec', 'messages']) {
        try { await db.run(`?[msg_id] <- [${batch}] :delete ${rel}`) } catch { /* ditto */ }
      }
    }
    stat.deleted = ids.length
    return stat
  } finally {
    db.close()
  }
}

async function main() {
  const args = process.argv.slice(2)
  const APPLY = args.includes('--apply')
  const arg = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null)
  const ONLY = arg('--agent')
  const AGENTS_DIR = arg('--agents-dir') || path.join(os.homedir(), '.aimaestro', 'agents')
  const dirs = ONLY
    ? [ONLY]
    : fs.readdirSync(AGENTS_DIR).filter((d) => fs.existsSync(path.join(AGENTS_DIR, d, 'agent.db')))

  console.log(`${APPLY ? 'APPLYING' : 'DRY RUN'} - ${dirs.length} agent(s) in ${AGENTS_DIR}\n`)
  let rows = 0
  let doomed = 0
  let skipped = 0
  for (const id of dirs) {
    const dbPath = path.join(AGENTS_DIR, id, 'agent.db')
    if (!fs.existsSync(dbPath)) continue
    if (heldOpen(dbPath)) {
      console.log(`${id.slice(0, 8)}  skipped: another process has the database open`)
      skipped++
      continue
    }
    try {
      const r = await purgeOne(dbPath, { apply: APPLY })
      if (r.skipped) continue
      rows += r.total
      doomed += r.doomed
      const roles = Object.entries(r.byRole).map(([k, v]) => `${k}=${v}`).join(' ') || '-'
      console.log(`${id.slice(0, 8)}  ${String(r.before).padStart(8)} MB  ${String(r.total).padStart(8)} rows  ${String(r.doomed).padStart(7)} not conversation  (${roles})${r.backup ? `  backup ${path.basename(r.backup)}` : ''}`)
      if (APPLY && r.deleted) {
        try { execFileSync('sqlite3', [dbPath, 'VACUUM;'], { stdio: 'pipe' }) } catch { console.warn(`  (VACUUM skipped; run: sqlite3 ${dbPath} VACUUM;)`) }
      }
    } catch (e) {
      console.log(`${id.slice(0, 8)}  failed: ${e.message || e}`)
    }
  }
  console.log(`\n${rows} rows scanned, ${doomed} not conversation${skipped ? `, ${skipped} database(s) skipped (open)` : ''}.`)
  if (!APPLY && doomed) console.log('Dry run: nothing changed. Re-run with --apply (stop AI Maestro first, or use a copy via --agents-dir).')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main()
