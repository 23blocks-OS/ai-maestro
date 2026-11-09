#!/usr/bin/env node
/**
 * Status audit: for every agent with a tmux session on THIS host, compare the status
 * the server reports with what the agent's own transcript shows. Read only.
 *
 *   node scripts/status-audit.mjs                 # table
 *   node scripts/status-audit.mjs --json          # rows as JSON
 *   node scripts/status-audit.mjs --viewer URL    # also show what another host's feed says
 *
 * Over ssh, without copying the file:  ssh host 'node --input-type=module - --json' < scripts/status-audit.mjs
 *
 * Truth comes from the transcript's last timestamped entry (metadata lines without a
 * timestamp are skipped: Claude Code appends them without a new turn, so the file's
 * mtime is not proof of work):
 *   system turn_duration / stop_hook_summary, or assistant without tool_use  -> ready
 *   user, tool_result, api-request, assistant with tool_use                   -> working (or needs-you)
 * A "working" last entry older than STALE_MS is reported as "working?" (a question
 * left open, a crash, or a long tool).
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'

const args = process.argv.slice(2)
const asJson = args.includes('--json')
const viewer = args.includes('--viewer') ? args[args.indexOf('--viewer') + 1] : null
const BASE = process.env.AIM_BASE || 'http://localhost:23000'
const HOME = os.homedir()
const STATE_DIR = path.join(HOME, '.aimaestro', 'chat-state')
const STALE_MS = 10 * 60 * 1000
const TAIL_BYTES = 512 * 1024

const hashCwd = (cwd) => crypto.createHash('md5').update(cwd || '').digest('hex').substring(0, 16)
const getJson = async (url) => (await fetch(url, { signal: AbortSignal.timeout(15000) })).json()

/** The feed's status word -> the sidebar word (same rule as lib/agent-presence.ts presenceFrom) */
function presence(info) {
  if (!info) return 'ready'
  const needs = info.hookStatus === 'permission_request' ||
    (info.hookStatus === 'waiting_for_input' && ['permission_prompt', 'elicitation_dialog'].includes(info.notificationType || ''))
  if (needs) return 'needs-you'
  if (info.status === 'waiting') return info.hookStatus || info.notificationType ? 'ready' : 'needs-you'
  if (info.status === 'active' || info.hookStatus === 'active') return 'working'
  return 'ready'
}

function readState(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return null }
}

/** Every hook state file for this agent: its folder and any subfolder */
function stateFiles(workingDir) {
  let names = []
  try { names = fs.readdirSync(STATE_DIR).filter(n => /^[0-9a-f]{16}\.json$/.test(n)) } catch { return [] }
  const out = []
  for (const n of names) {
    const s = readState(path.join(STATE_DIR, n))
    if (!s || !s.cwd) continue
    if (s.cwd === workingDir || s.cwd.startsWith(workingDir + '/')) out.push({ file: n, root: n === `${hashCwd(workingDir)}.json`, ...s })
  }
  return out.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
}

function newestTranscript(workingDir, hinted) {
  const dir = path.join(HOME, '.claude', 'projects', workingDir.replace(/[^a-zA-Z0-9]/g, '-'))
  let best = null
  const consider = (p) => { try { const m = fs.statSync(p).mtimeMs; if (!best || m > best.mtime) best = { path: p, mtime: m } } catch {} }
  try { for (const n of fs.readdirSync(dir)) if (n.endsWith('.jsonl')) consider(path.join(dir, n)) } catch {}
  for (const h of hinted) if (h) consider(h)
  return best
}

function lastEntry(file) {
  let text = ''
  try {
    const fd = fs.openSync(file, 'r')
    const size = fs.fstatSync(fd).size
    const len = Math.min(size, TAIL_BYTES)
    const buf = Buffer.alloc(len)
    fs.readSync(fd, buf, 0, len, size - len)
    fs.closeSync(fd)
    text = buf.toString('utf8')
  } catch { return null }
  const lines = text.split('\n').reverse()
  for (const l of lines) {
    let d
    try { d = JSON.parse(l) } catch { continue }
    if (!d.timestamp || !['user', 'assistant', 'system', 'api-request'].includes(d.type)) continue
    const content = Array.isArray(d.message?.content) ? d.message.content : []
    const kinds = content.map(c => c && c.type)
    let truth
    if (d.type === 'system') truth = ['turn_duration', 'stop_hook_summary'].includes(d.subtype) ? 'ready' : null
    else if (d.type === 'assistant') truth = kinds.includes('tool_use') ? 'working' : 'ready'
    else truth = 'working' // user prompt, tool_result, api-request
    if (!truth) continue // other system lines (compaction notes, errors): look further back
    return { at: Date.parse(d.timestamp), type: d.type, subtype: d.subtype || (kinds.join(',') || null), truth }
  }
  return null
}

const ago = (t) => {
  if (!t || !Number.isFinite(t)) return '-'
  const s = Math.round((Date.now() - t) / 1000)
  return s < 120 ? `${s}s` : s < 7200 ? `${Math.round(s / 60)}m` : `${Math.round(s / 3600)}h`
}

async function main() {
  const [sessions, feed, viewFeed] = await Promise.all([
    getJson(`${BASE}/api/sessions?local=true`),
    getJson(`${BASE}/api/sessions/activity?local=true`),
    viewer ? getJson(`${viewer}/api/sessions/activity`).catch(() => null) : null,
  ])
  const rows = []
  for (const s of sessions.sessions || []) {
    const name = s.name || s.id
    const wd = s.workingDirectory
    if (!wd) continue
    const info = (feed.activity || {})[name] || (feed.activity || {})[s.agentId] || null
    const files = stateFiles(wd)
    const root = files.find(f => f.root) || null
    const newest = files[0] || null
    const tr = newestTranscript(wd, files.map(f => f.transcriptPath))
    const last = tr ? lastEntry(tr.path) : null
    let truth = last ? last.truth : 'unknown'
    if (truth === 'working' && Date.now() - last.at > STALE_MS) truth = 'working?'
    if (truth !== 'unknown' && newest && ['permission_request'].includes(newest.status) && truth.startsWith('working')) truth = 'needs-you?'
    const shown = presence(info)
    const viewInfo = viewFeed ? (viewFeed.activity || {})[name] || (viewFeed.activity || {})[s.agentId] || null : undefined
    const viewShown = viewFeed ? presence(viewInfo) : undefined
    const wrong = (v) => truth !== 'unknown' && !truth.endsWith('?') && v !== truth && !(truth === 'working' && v === 'needs-you')
    rows.push({
      name,
      shown,
      truth,
      verdict: truth === 'unknown' || truth.endsWith('?') ? 'CHECK' : wrong(shown) ? 'WRONG' : 'ok',
      ...(viewFeed && { viewerShows: viewShown, viewerVerdict: wrong(viewShown) ? 'WRONG' : 'ok' }),
      feed: info ? `${info.status}/${info.hookStatus || '-'}/${info.notificationType || '-'}` : 'none',
      lastEntry: last ? `${last.type}:${last.subtype || ''} ${ago(last.at)} ago` : 'no transcript',
      transcriptMtime: tr ? `${ago(tr.mtime)} ago` : '-',
      mtimeWithoutEntry: !!(tr && last && tr.mtime - last.at > 3000),
      rootFile: root ? `${root.status}/${root.notificationType || '-'} ${ago(Date.parse(root.updatedAt))} ago` : 'none',
      newestFile: newest && !newest.root ? `${newest.status}/${newest.notificationType || '-'} ${ago(Date.parse(newest.updatedAt))} ago in ${path.relative(wd, newest.cwd)}` : '(root)',
      stateFiles: files.length,
    })
  }
  rows.sort((a, b) => (a.verdict === b.verdict ? a.name.localeCompare(b.name) : a.verdict === 'WRONG' ? -1 : b.verdict === 'WRONG' ? 1 : a.verdict === 'CHECK' ? -1 : 1))
  if (asJson) { console.log(JSON.stringify({ host: os.hostname(), at: new Date().toISOString(), rows })); return }
  console.table(rows)
  const n = (v) => rows.filter(r => r.verdict === v).length
  console.log(`${os.hostname()}: ${rows.length} agents with a session, ${n('ok')} ok, ${n('WRONG')} wrong, ${n('CHECK')} to check`)
}

main().catch((e) => { console.error(e); process.exit(1) })
