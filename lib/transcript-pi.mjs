/**
 * Pi transcript reader — the Pi half of multi-provider chat (F036 item 4,
 * mirrors F004's codex reader and F028's grok reader).
 *
 * Pi (pi.dev, `@earendil-works/pi-coding-agent`) keeps a session as a JSONL
 * file, one entry per line, linked into a tree by `id` / `parentId`:
 *
 *   <sessions root>/--<cwd with / \ : replaced by ->--/<timestamp>_<uuid>.jsonl
 *
 * The sessions root is `PI_CODING_AGENT_SESSION_DIR` when set, else
 * `<PI_CODING_AGENT_DIR or ~/.pi/agent>/sessions`. With the override Pi writes
 * the files FLAT (no `--cwd--` group dir), so the working directory is matched
 * from the `session` header on line 1 (`{type:'session', cwd, ...}`), which
 * also guards against two cwds that encode to the same group name.
 *
 * Verified against real Pi 1.2.0 output (tests/fixtures/pi/). Entry shapes:
 *   session        header, line 1                        -> nothing
 *   message        message.role = system                 -> nothing (prompt / tool loadout)
 *   message        message.role = user                   -> user message
 *   message        message.role = assistant              -> thinking messages (one per
 *                  `thinking` block), then ONE assistant message holding the text and
 *                  `toolCall` blocks (as tool_use); stopReason 'error' + errorMessage
 *                  becomes visible error text
 *   message        message.role = toolResult             -> tool_result_marker
 *   model_change, thinking_level_change, usage, context_edit -> nothing
 * Mapped from Pi's documentation only, NOT seen in a real file (no way to
 * trigger them without a real model): `compaction` -> summary, `branch_summary`.
 *
 * The file is a tree. This reader shows the entries in file order, which is the
 * active branch until the person uses /tree or /fork inside Pi.
 */

import fs from 'fs'
import os from 'os'
import path from 'path'

const PI_AGENT_DIR = () =>
  process.env.PI_CODING_AGENT_DIR || path.join(os.homedir(), '.pi', 'agent')

const PI_SESSIONS_DIR = () =>
  process.env.PI_CODING_AGENT_SESSION_DIR || path.join(PI_AGENT_DIR(), 'sessions')

const PI_ENTRY_TYPES = new Set([
  'session', 'message', 'model_change', 'thinking_level_change', 'usage', 'compaction',
  'context_edit', 'branch_summary', 'custom', 'custom_message', 'label', 'session_info',
])
const PI_ROLES = new Set(['system', 'user', 'assistant', 'toolResult', 'bashExecution', 'custom', 'branchSummary', 'compactionSummary'])

/**
 * Is this parsed JSONL object a Pi session entry (vs Claude / codex / grok)?
 * Claude lines are type user/assistant/system, codex has `payload`, grok has
 * `method`; none of them uses `type: 'message'` or `type: 'session'`.
 */
export function isPiLine(obj) {
  if (!obj || typeof obj !== 'object' || typeof obj.type !== 'string') return false
  if (!PI_ENTRY_TYPES.has(obj.type)) return false
  if (obj.type === 'session') return typeof obj.cwd === 'string' && typeof obj.id === 'string'
  if (typeof obj.id !== 'string') return false
  if (obj.type === 'message') {
    return !!obj.message && typeof obj.message === 'object' && PI_ROLES.has(obj.message.role)
  }
  return true
}

/** Text of a Pi content value: a string, or an array of text / image blocks. */
function contentText(content) {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .filter(b => b && b.type === 'text' && typeof b.text === 'string')
    .map(b => b.text)
    .join('')
}

/** Pi tool name -> the Claude name ChatView knows how to preview. */
const TOOL_NAMES = { bash: 'Bash', read: 'Read', write: 'Write', edit: 'Edit', grep: 'Grep', find: 'Glob' }

function toolInputOf(args) {
  const input = args && typeof args === 'object' ? { ...args } : {}
  // Pi names the file argument `path`; ChatView previews `file_path`.
  if (typeof input.path === 'string' && input.file_path === undefined) input.file_path = input.path
  return input
}

/**
 * Map ONE Pi entry to zero or more chat messages in the shared shape
 * (`{ type, message:{content:[...]}, timestamp, uuid }`, `thinking`,
 * `tool_result_marker`, `summary`).
 */
export function piLineToMessages(entry) {
  if (!isPiLine(entry)) return []
  const ts = entry.timestamp
  const uuid = `pi:${entry.id}`

  if (entry.type === 'compaction' || entry.type === 'branch_summary') {
    if (!entry.summary) return []
    return [{ type: 'summary', summary: entry.summary, timestamp: ts, uuid: `${uuid}#summary` }]
  }
  if (entry.type !== 'message') return []

  const m = entry.message
  switch (m.role) {
    case 'user': {
      const text = contentText(m.content)
      if (!text) return []
      return [{ type: 'user', message: { role: 'user', content: [{ type: 'text', text }] }, timestamp: ts, uuid }]
    }
    case 'assistant': {
      const out = []
      const blocks = Array.isArray(m.content) ? m.content : []
      let thinkingIdx = 0
      const visible = []
      for (const b of blocks) {
        if (!b || typeof b !== 'object') continue
        if (b.type === 'thinking') {
          if (b.thinking) {
            out.push({ type: 'thinking', thinking: b.thinking, timestamp: ts, uuid: `${uuid}#thinking-${thinkingIdx++}` })
          }
        } else if (b.type === 'text') {
          if (b.text) visible.push({ type: 'text', text: b.text })
        } else if (b.type === 'toolCall') {
          if (!b.id) continue
          visible.push({
            type: 'tool_use', id: b.id, name: TOOL_NAMES[b.name] || b.name || 'tool', input: toolInputOf(b.arguments),
          })
        }
      }
      if (m.stopReason === 'error' && m.errorMessage) {
        visible.push({ type: 'text', text: `Pi error: ${m.errorMessage}` })
      }
      if (visible.length > 0) {
        out.push({ type: 'assistant', message: { role: 'assistant', content: visible }, timestamp: ts, uuid })
      }
      return out
    }
    case 'toolResult': {
      if (!m.toolCallId) return []
      return [{ type: 'tool_result_marker', tool_use_id: m.toolCallId, timestamp: ts, uuid: `${uuid}#result` }]
    }
    default:
      return []
  }
}

/** First line of a session file parsed as the header, or null. */
function readHeader(filePath) {
  let fd
  try {
    fd = fs.openSync(filePath, 'r')
    const CHUNK = 16384
    const MAX = 1024 * 1024
    const buf = Buffer.alloc(CHUNK)
    let acc = ''
    let pos = 0
    while (pos < MAX) {
      const n = fs.readSync(fd, buf, 0, CHUNK, pos)
      if (n <= 0) break
      acc += buf.toString('utf-8', 0, n)
      pos += n
      const nl = acc.indexOf('\n')
      if (nl !== -1) { acc = acc.slice(0, nl); break }
    }
    const h = JSON.parse(acc)
    return h && h.type === 'session' ? h : null
  } catch {
    return null
  } finally {
    if (fd !== undefined) { try { fs.closeSync(fd) } catch { /* ignore */ } }
  }
}

/** The group dir name Pi uses for a cwd: drop the leading separator, / \ : -> -, wrap in --. */
export function piGroupDirName(workingDir) {
  return `--${workingDir.replace(/^[/\\]/, '').replace(/[/\\:]/g, '-')}--`
}

function listJsonl(dir) {
  let names
  try { names = fs.readdirSync(dir) } catch { return [] }
  const files = []
  for (const name of names) {
    if (!name.endsWith('.jsonl')) continue
    const p = path.join(dir, name)
    try { files.push({ name, path: p, mtime: fs.statSync(p).mtime }) } catch { /* skip */ }
  }
  return files.sort((a, b) => b.mtime.getTime() - a.mtime.getTime())
}

/**
 * Find the newest Pi session file for `workingDir`.
 * Pi records the REAL path of the cwd (a symlinked /tmp shows up as
 * /private/tmp on macOS), so both the path as given and its realpath match.
 */
export function resolvePiTranscriptForDir(workingDir, scanCap = 50) {
  if (!workingDir) return null
  const root = PI_SESSIONS_DIR()
  if (!fs.existsSync(root)) return null

  const wanted = new Set([workingDir])
  try { wanted.add(fs.realpathSync(workingDir)) } catch { /* dir may be gone */ }

  const dirs = []
  for (const w of wanted) dirs.push(path.join(root, piGroupDirName(w)))
  dirs.push(root) // PI_CODING_AGENT_SESSION_DIR writes flat

  const candidates = []
  for (const d of dirs) candidates.push(...listJsonl(d))
  candidates.sort((a, b) => b.mtime.getTime() - a.mtime.getTime())

  const limit = Math.min(candidates.length, scanCap)
  for (let i = 0; i < limit; i++) {
    const header = readHeader(candidates[i].path)
    if (header && wanted.has(header.cwd)) return candidates[i]
  }
  return null
}

/**
 * Pi live turn status from the transcript. Pi writes the user's message the
 * moment it is sent (before the model answers), then the assistant message and
 * each tool result as they finish, so the last conversational entry says where
 * the turn is:
 *   user | toolResult | assistant stopReason 'toolUse'  -> 'working'
 *   context_edit (written after a failed attempt, Pi is retrying) -> 'working'
 *   assistant with any other stopReason (stop, error, ...) -> 'idle'
 * Returns null when no such entry is found. A Pi that dies mid-turn would read
 * 'working' forever, so the status feed goes through piSessionStatus, which gives up
 * on a 'working' file nobody has written to for a while.
 */
export function piLiveStatus(lines) {
  for (let i = (lines || []).length - 1; i >= 0; i--) {
    const line = lines[i]
    if (!line || (line.indexOf('"message"') === -1 && line.indexOf('"context_edit"') === -1)) continue
    try {
      const e = JSON.parse(line)
      if (!isPiLine(e)) continue
      if (e.type === 'context_edit') return 'working'
      if (e.type !== 'message') continue
      const role = e.message.role
      if (role === 'user' || role === 'toolResult') return 'working'
      if (role === 'assistant') return e.message.stopReason === 'toolUse' ? 'working' : 'idle'
    } catch { /* skip */ }
  }
  return null
}

/** piLiveStatus for a file, reading only the tail. */
export function piLiveStatusFromFile(filePath, tailBytes = 65536) {
  try {
    const size = fs.statSync(filePath).size
    const start = Math.max(0, size - tailBytes)
    const fd = fs.openSync(filePath, 'r')
    try {
      const buf = Buffer.alloc(size - start)
      fs.readSync(fd, buf, 0, buf.length, start)
      const lines = buf.toString('utf-8').split('\n')
      if (start > 0) lines.shift() // first line is cut mid-way
      return piLiveStatus(lines)
    } finally {
      fs.closeSync(fd)
    }
  } catch {
    return null
  }
}

/**
 * How long a 'working' Pi file may sit untouched before we stop believing it. Pi writes an entry only
 * when a step finishes, so a long model call or tool run is quiet for a while; ten minutes is well past
 * that, and a Pi that crashed mid-turn would otherwise read 'working' until someone restarts it.
 */
export const PI_WORKING_MAX_AGE_MS = 10 * 60 * 1000

/**
 * Status for the activity feed: 'working', 'idle', or null when unknown (no file, nothing readable, or a
 * 'working' turn whose file has not changed for PI_WORKING_MAX_AGE_MS). 'idle' never goes stale.
 */
export function piSessionStatus(filePath, now = Date.now(), maxAgeMs = PI_WORKING_MAX_AGE_MS) {
  const status = piLiveStatusFromFile(filePath)
  if (status !== 'working') return status
  try {
    return now - fs.statSync(filePath).mtimeMs > maxAgeMs ? null : status
  } catch {
    return null
  }
}
