#!/usr/bin/env node
/**
 * Survey agents for project-binding mismatches.
 *
 * An agent's memory only fills if its CozoDB `projects` relation points at the
 * Claude project directory its conversations actually live in. Two defects in
 * lib/index-delta.ts let that binding go wrong and stay wrong:
 *
 *   1. Auto-discovery only runs when an agent has ZERO projects recorded. Once
 *      any project is recorded — including a wrong one — discovery never runs
 *      again, so a stale binding is permanent.
 *   2. A conversation is matched to an agent by EXACT cwd equality. A subagent
 *      or a session started in a child directory has a deeper cwd, so it never
 *      matches, and its conversations are invisible to the agent that owns them.
 *
 * Observed: pas-lola on mini-lola is bound to `/home/jpelaez` with four
 * registered conversations that no longer exist on disk, while its real
 * conversations sit in `-home-jpelaez-lola`. It reported "0 messages in 0ms,
 * success" every run for months.
 *
 * This reports, per agent:
 *   wd            the agent's working directory (registry)
 *   bound         project paths its database is bound to
 *   dead          registered conversations whose file is gone
 *   reachable     .jsonl files under the agent's own slug and child slugs
 *   indexed       messages actually in the database
 *   verdict       OK | STALE_BINDING | UNBOUND | MISSING_CHILDREN | EMPTY
 *
 * Read-only. Usage: node scripts/survey-agent-bindings.mjs [--json]
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { CozoDb } from 'cozo-node'

const AGENTS_DIR = path.join(os.homedir(), '.aimaestro', 'agents')
const PROJECTS_DIR = path.join(os.homedir(), '.claude', 'projects')
const JSON_OUT = process.argv.includes('--json')

/** Claude Code encodes a cwd as a project dir by replacing separators with '-'. */
function slugFor(cwd) {
  return cwd.replace(/\//g, '-')
}

/** Project dirs belonging to this cwd: its own slug plus any descendant slug. */
function projectDirsFor(cwd) {
  const slug = slugFor(cwd)
  try {
    return fs
      .readdirSync(PROJECTS_DIR)
      .filter((d) => d === slug || d.startsWith(slug + '-'))
      .map((d) => path.join(PROJECTS_DIR, d))
  } catch {
    return []
  }
}

/** Every .jsonl under a project dir, including <session>/subagents/*.jsonl. */
function jsonlUnder(dir) {
  const out = []
  const walk = (d) => {
    let entries
    try { entries = fs.readdirSync(d, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      const p = path.join(d, e.name)
      if (e.isDirectory()) walk(p)
      else if (e.name.endsWith('.jsonl')) out.push(p)
    }
  }
  walk(dir)
  return out
}

function loadRegistry() {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(AGENTS_DIR, 'registry.json'), 'utf-8'))
    const list = Array.isArray(raw) ? raw : raw.agents
    const arr = Array.isArray(list) ? list : Object.values(list || {})
    const byId = new Map()
    for (const a of arr) if (a?.id) byId.set(a.id, a)
    return byId
  } catch {
    return new Map()
  }
}

async function inspect(agentId, agent) {
  const dbPath = path.join(AGENTS_DIR, agentId, 'agent.db')
  const row = {
    agentId,
    name: agent?.name ?? '(unregistered)',
    wd: agent?.workingDirectory || agent?.sessions?.[0]?.workingDirectory || null,
    bound: [],
    registered: 0,
    dead: 0,
    reachable: 0,
    indexed: 0,
    verdict: 'OK',
  }

  const db = new CozoDb('sqlite', dbPath)
  const q = async (s) => (await db.run(s)).rows

  try {
    row.indexed = (await q(`?[count(msg_id)] := *messages{msg_id}`))[0][0]
  } catch { /* relation absent on a fresh agent */ }

  try {
    row.bound = (await q(`?[project_path] := *projects{project_path}`)).map((r) => r[0])
  } catch { /* ditto */ }

  try {
    const convs = await q(`?[jsonl_file] := *conversations{jsonl_file}`)
    row.registered = convs.length
    row.dead = convs.filter(([f]) => !fs.existsSync(f)).length
  } catch { /* ditto */ }

  if (row.wd) {
    for (const dir of projectDirsFor(row.wd)) row.reachable += jsonlUnder(dir).length
  }

  // Verdicts, most actionable first.
  if (!row.wd) row.verdict = 'NO_WD'
  else if (row.bound.length === 0) row.verdict = row.reachable > 0 ? 'UNBOUND' : 'EMPTY'
  else if (!row.bound.some((b) => b === row.wd || b.startsWith(row.wd + '/') || row.wd.startsWith(b + '/')))
    row.verdict = 'STALE_BINDING'
  else if (row.registered > 0 && row.dead === row.registered && row.reachable > 0)
    row.verdict = 'STALE_BINDING'
  else if (row.reachable > row.registered) row.verdict = 'MISSING_CHILDREN'
  else if (row.indexed === 0 && row.reachable > 0) row.verdict = 'EMPTY'

  return row
}

const registry = loadRegistry()
const ids = fs.existsSync(AGENTS_DIR)
  ? fs.readdirSync(AGENTS_DIR).filter((d) => fs.existsSync(path.join(AGENTS_DIR, d, 'agent.db')))
  : []

const rows = []
for (const id of ids) {
  try { rows.push(await inspect(id, registry.get(id))) }
  catch (e) { rows.push({ agentId: id, name: registry.get(id)?.name ?? '?', verdict: 'ERROR', error: e.message.split('\n')[0] }) }
}

if (JSON_OUT) {
  console.log(JSON.stringify(rows, null, 2))
} else {
  const bad = rows.filter((r) => !['OK', 'EMPTY'].includes(r.verdict))
  console.log(`${rows.length} agent(s) surveyed\n`)
  console.log('NAME                 VERDICT           WD                                   REG  DEAD  REACH  INDEXED')
  for (const r of rows.sort((a, b) => a.verdict.localeCompare(b.verdict))) {
    if (r.verdict === 'OK' || r.verdict === 'EMPTY') continue
    console.log(
      `${String(r.name).slice(0, 20).padEnd(20)} ${r.verdict.padEnd(17)} ` +
      `${String(r.wd ?? '-').slice(-36).padEnd(36)} ${String(r.registered).padStart(4)} ` +
      `${String(r.dead).padStart(5)} ${String(r.reachable).padStart(6)} ${String(r.indexed).padStart(8)}`
    )
  }
  const counts = rows.reduce((m, r) => ((m[r.verdict] = (m[r.verdict] || 0) + 1), m), {})
  console.log(`\nsummary: ${Object.entries(counts).map(([k, v]) => `${k}=${v}`).join('  ')}`)
  console.log(`needing repair: ${bad.length}/${rows.length}`)
}
