/**
 * GitHub Copilot CLI transcript reader — the Copilot half of multi-provider
 * chat (F038 item 4, mirrors F004's codex reader and F028's grok reader).
 *
 * Copilot keeps one event log per session:
 *
 *   ~/.copilot/session-state/<session-id>/events.jsonl      (COPILOT_HOME overrides ~/.copilot)
 *
 * Every line is `{ type, data, id, timestamp, parentId }` with a dotted type
 * (`session.start`, `user.message`, `assistant.message`, `tool.execution_start`,
 * `permission.requested`, ...). The first line is `session.start` and carries the
 * working directory in `data.context.cwd`; that is how a session is matched to an
 * agent. Written and checked against Copilot CLI 1.0.97 (see tests/fixtures/copilot).
 *
 * Mapped to the shared ChatView shapes (no component changes):
 *   user.message            -> user message         (data.content, the text as typed)
 *   assistant.message       -> assistant message    (text + one tool_use block per toolRequest),
 *                              plus a thinking message when data.reasoningText is set
 *   tool.execution_complete -> tool_result_marker   (success or not; the call is closed)
 *   session.error           -> summary divider with the error text
 * Everything else (session.*, turn_start/end, usage_record, permission.*, system.message,
 * abort) is not chat.
 *
 * parseJsonlLines detects the format PER LINE, because the live watcher passes only the
 * delta and Copilot lines are self-identifying.
 */

import fs from 'fs'
import os from 'os'
import path from 'path'

/** Copilot's session-state folder: the agent's own home if it has one, else COPILOT_HOME, else ~/.copilot. */
const COPILOT_STATE_DIR = (home) =>
  path.join(home || process.env.COPILOT_HOME || path.join(os.homedir(), '.copilot'), 'session-state')

// Same whole names the launcher recognises. The older `gh copilot` extension is not an agent.
const COPILOT_NAMES = new Set(['copilot', 'copilot-cli', 'github-copilot', 'github-copilot-cli'])

/** True when a registry program string means GitHub Copilot CLI. */
export function isCopilotProgram(program) {
  return COPILOT_NAMES.has(String(program || '').toLowerCase().trim().replace(/\s+/g, '-'))
}

/**
 * Is this registry agent a Copilot CLI agent? By its program name, or by what the registry says when the
 * program is a launcher script (`.../start.sh` that sets the environment and then runs copilot):
 * `programKind: 'copilot'`, or a `copilotHome` (an agent with its own Copilot home is a Copilot agent).
 */
export function isCopilotAgent(agent) {
  if (!agent) return false
  return isCopilotProgram(agent.program) || agent.programKind === 'copilot' || !!copilotHomeOf(agent)
}

/**
 * Check the two registry fields that mark a Copilot agent. Returns an error message, or null when they are fine
 * (absent, null to clear, or valid). programKind can only be 'copilot'; copilotHome must be an absolute path
 * or ~/...; a path that is not there yet is allowed (the agent may not have started).
 */
export function checkCopilotFields({ programKind, copilotHome } = {}) {
  if (programKind !== undefined && programKind !== null && programKind !== 'copilot') {
    return "programKind must be 'copilot' (or null to clear it)"
  }
  if (copilotHome !== undefined && copilotHome !== null) {
    if (typeof copilotHome !== 'string' || !copilotHome.trim()) return 'copilotHome must be a path, or null to clear it'
    const h = copilotHome.trim()
    if (!(h.startsWith('/') || h === '~' || h.startsWith('~/'))) return 'copilotHome must be an absolute path or start with ~/'
    if (h.includes('\0')) return 'copilotHome is not a valid path'
  }
  return null
}

/**
 * The agent's own COPILOT_HOME, when it runs Copilot with a private one (own config, hooks and session
 * history). `~` is expanded; a relative path is ignored, because the server cannot know what it is relative to.
 */
export function copilotHomeOf(agent) {
  const h = typeof agent?.copilotHome === 'string' ? agent.copilotHome.trim() : ''
  if (!h) return null
  const abs = h === '~' ? os.homedir() : h.startsWith('~/') ? path.join(os.homedir(), h.slice(2)) : h
  return path.isAbsolute(abs) ? abs : null
}

/** Is this parsed JSONL object a Copilot events.jsonl line (vs Claude, codex or grok)? */
export function isCopilotLine(obj) {
  return !!obj &&
    typeof obj === 'object' &&
    typeof obj.type === 'string' &&
    (obj.type.includes('.') || obj.type === 'abort') &&
    !!obj.data &&
    typeof obj.data === 'object' &&
    typeof obj.id === 'string' &&
    obj.timestamp !== undefined
}

/**
 * Copilot's tool names -> the Claude tool names ChatView knows how to preview.
 * Only the shell tool's arguments are confirmed against real output for all of these
 * (bash, create, edit were driven live; view/grep/glob are mapped by name and passed through).
 */
function toolOf(name, args) {
  const a = args && typeof args === 'object' ? args : {}
  switch (name) {
    case 'bash':
      return { name: 'Bash', input: { command: a.command || '', description: a.description } }
    case 'view':
      return { name: 'Read', input: { file_path: a.path, ...(a.view_range ? { view_range: a.view_range } : {}) } }
    case 'create':
      return { name: 'Write', input: { file_path: a.path, content: a.file_text } }
    case 'edit':
      return { name: 'Edit', input: { file_path: a.path, old_string: a.old_str, new_string: a.new_str } }
    case 'grep':
      return { name: 'Grep', input: a }
    case 'glob':
      return { name: 'Glob', input: a }
    default:
      return { name: name || 'tool', input: a }
  }
}

/**
 * Map ONE Copilot event to zero or more chat messages in the shared shape
 * (`{ type, message:{content:[...]}, timestamp, uuid }`, `thinking`, `summary`,
 * `tool_result_marker`). Returns [] for anything that is not conversation.
 */
export function copilotLineToMessages(ev) {
  if (!isCopilotLine(ev)) return []
  const d = ev.data
  const ts = ev.timestamp

  switch (ev.type) {
    case 'user.message': {
      // `content` is what the person typed; `transformedContent` adds the date and context.
      const text = typeof d.content === 'string' ? d.content : ''
      if (!text.trim()) return []
      return [{
        type: 'user',
        message: { role: 'user', content: [{ type: 'text', text }] },
        timestamp: ts,
        uuid: `copilot:${ev.id}`,
      }]
    }
    case 'assistant.message': {
      const out = []
      if (typeof d.reasoningText === 'string' && d.reasoningText.trim()) {
        out.push({ type: 'thinking', thinking: d.reasoningText, timestamp: ts, uuid: `copilot:${ev.id}#thinking-0` })
      }
      const blocks = []
      if (typeof d.content === 'string' && d.content.trim()) blocks.push({ type: 'text', text: d.content })
      for (const req of Array.isArray(d.toolRequests) ? d.toolRequests : []) {
        if (!req || !req.toolCallId) continue
        const t = toolOf(req.name, req.arguments)
        blocks.push({ type: 'tool_use', id: req.toolCallId, name: t.name, input: t.input })
      }
      if (blocks.length) {
        out.push({ type: 'assistant', message: { role: 'assistant', content: blocks }, timestamp: ts, uuid: `copilot:${ev.id}` })
      }
      return out
    }
    case 'tool.execution_complete': {
      if (!d.toolCallId) return []
      return [{ type: 'tool_result_marker', tool_use_id: d.toolCallId, timestamp: ts, uuid: `copilot:result:${d.toolCallId}` }]
    }
    case 'session.error': {
      const text = typeof d.message === 'string' && d.message.trim() ? d.message.trim() : 'Copilot reported an error'
      return [{ type: 'summary', summary: `Copilot error: ${text}`, timestamp: ts, uuid: `copilot:${ev.id}#error` }]
    }
    default:
      return []
  }
}

/**
 * Read the cwd a session was started in: line 1 is `session.start`
 * (`data.context.cwd`). Grows the read until a newline is found, capped at 2 MB.
 * Falls back to the `cwd:` line of the sibling workspace.yaml.
 */
function sessionCwd(eventsPath) {
  let fd
  try {
    fd = fs.openSync(eventsPath, 'r')
    const CHUNK = 65536
    const MAX = 2 * 1024 * 1024
    const buf = Buffer.alloc(CHUNK)
    let acc = ''
    let pos = 0
    while (pos < MAX) {
      const n = fs.readSync(fd, buf, 0, CHUNK, pos)
      if (n <= 0) break
      acc += buf.toString('utf-8', 0, n)
      const nl = acc.indexOf('\n')
      if (nl !== -1) { acc = acc.slice(0, nl); break }
      pos += n
    }
    const obj = JSON.parse(acc)
    if (obj?.type === 'session.start' && obj.data?.context?.cwd) return obj.data.context.cwd
  } catch {
    // fall through to workspace.yaml
  } finally {
    if (fd !== undefined) try { fs.closeSync(fd) } catch { /* ignore */ }
  }
  try {
    const yaml = fs.readFileSync(path.join(path.dirname(eventsPath), 'workspace.yaml'), 'utf-8')
    const m = yaml.match(/^cwd:\s*(.+)$/m)
    if (m) return m[1].trim().replace(/^['"]|['"]$/g, '')
  } catch { /* ignore */ }
  return null
}

function realOrSame(p) {
  try { return fs.realpathSync(p) } catch { return p }
}

/**
 * Find the newest Copilot session whose cwd is `workingDir`.
 *
 * Scans session-state newest-first (by events.jsonl mtime) and returns on the first cwd
 * match, so in the common case it reads one first line. A scan cap bounds the cost on a
 * large history. A symlinked working directory (macOS /tmp -> /private/tmp) still matches.
 */
export function resolveCopilotTranscriptForDir(workingDir, { scanCap = 400, home } = {}) {
  if (!workingDir) return null
  const root = COPILOT_STATE_DIR(home)
  let dirs
  try { dirs = fs.readdirSync(root, { withFileTypes: true }) } catch { return null }

  const files = []
  for (const e of dirs) {
    if (!e.isDirectory() || e.name.startsWith('.')) continue
    const p = path.join(root, e.name, 'events.jsonl')
    try { files.push({ path: p, name: 'events.jsonl', mtime: fs.statSync(p).mtime }) } catch { /* no log yet */ }
  }
  if (files.length === 0) return null

  files.sort((a, b) => b.mtime.getTime() - a.mtime.getTime())
  const wanted = realOrSame(workingDir)
  const limit = Math.min(files.length, scanCap)
  for (let i = 0; i < limit; i++) {
    const cwd = sessionCwd(files[i].path)
    if (cwd && (cwd === workingDir || realOrSame(cwd) === wanted)) return files[i]
  }
  return null
}

/**
 * Every Copilot session on this host: `{ path, sessionId, cwd, mtimeMs }`, newest first.
 *
 * The memory indexer needs ALL sessions of a working directory (an agent that has run Copilot
 * for months has many), not only the newest, so this lists every session directory and reads
 * only the first line of each for its cwd. A session with no readable cwd is left out.
 */
export function listCopilotSessions(home) {
  const root = COPILOT_STATE_DIR(home)
  let dirs
  try { dirs = fs.readdirSync(root, { withFileTypes: true }) } catch { return [] }
  const out = []
  for (const e of dirs) {
    if (!e.isDirectory() || e.name.startsWith('.')) continue
    const p = path.join(root, e.name, 'events.jsonl')
    let mtimeMs
    try { mtimeMs = fs.statSync(p).mtimeMs } catch { continue }
    const cwd = sessionCwd(p)
    if (cwd) out.push({ path: p, sessionId: e.name, cwd, mtimeMs })
  }
  return out.sort((a, b) => b.mtimeMs - a.mtimeMs)
}

/** Realpath of a directory when it exists (macOS /tmp -> /private/tmp), else the path as given. */
export function realDir(p) { return realOrSame(p) }

/**
 * Map ONE Copilot event to the messages the memory indexer and consolidation read: the Claude
 * transcript shape `{ type: 'user' | 'assistant', timestamp, message: { content } }`.
 * Tool results, errors, permission prompts and session bookkeeping are not memory. The model's
 * reasoning is kept as an assistant message (a `thinking` block), as the Claude path keeps it.
 * Returns [] for a line that is not a Copilot event.
 */
export function copilotLineToIndexMessages(ev) {
  const out = []
  for (const m of copilotLineToMessages(ev)) {
    if (m.type === 'user' || m.type === 'assistant') {
      out.push({ type: m.type, timestamp: m.timestamp, message: m.message })
    } else if (m.type === 'thinking' && typeof m.thinking === 'string') {
      out.push({ type: 'assistant', timestamp: m.timestamp, message: { role: 'assistant', content: [{ type: 'thinking', thinking: m.thinking }] } })
    }
  }
  return out
}

const WORKING_STALE_MS = 10 * 60 * 1000

/**
 * Live turn status from the event stream (not the pane): the LAST meaningful event says
 * what Copilot is doing.
 *
 *   'waiting'  a permission.requested with no permission.completed after it, or an open ask_user
 *   'working'  a turn is open: user.message, turn_start, a tool running, an answered
 *              permission, or a turn that ended with tool calls (the next turn follows at once)
 *   'idle'     the last turn ended without tool calls, or aborted, errored, shut down or
 *              just started/resumed
 *   null       nothing recognisable
 *
 * A stale 'working' is not trusted: if Copilot died mid-turn the log stops there for good.
 * `ageMs` (time since the file last changed) lets the file reader apply that.
 */
export function copilotLiveStatus(lines, { ageMs = 0 } = {}) {
  const list = lines || []
  if (copilotPendingAskUser(list)) return 'waiting'
  for (let i = list.length - 1; i >= 0; i--) {
    const line = list[i]
    if (!line || line.indexOf('"type"') === -1) continue
    let ev
    try { ev = JSON.parse(line) } catch { continue }
    if (!isCopilotLine(ev)) continue
    switch (ev.type) {
      case 'permission.requested':
        return 'waiting'
      case 'permission.completed':
        return ev.data?.result?.kind === 'cancelled' ? 'idle' : (ageMs > WORKING_STALE_MS ? null : 'working')
      case 'user.message':
      case 'assistant.turn_start':
      case 'assistant.message':
      case 'tool.execution_start':
      case 'tool.execution_complete':
        return ageMs > WORKING_STALE_MS ? null : 'working'
      case 'assistant.turn_end': {
        // Walk back to this turn's assistant.message: tool calls mean another turn follows.
        for (let j = i - 1; j >= 0; j--) {
          if (!list[j] || list[j].indexOf('assistant.message') === -1) continue
          try {
            const m = JSON.parse(list[j])
            if (m?.type !== 'assistant.message') continue
            const calls = Array.isArray(m.data?.toolRequests) ? m.data.toolRequests.length : 0
            return calls > 0 && ageMs <= WORKING_STALE_MS ? 'working' : 'idle'
          } catch { /* keep looking */ }
        }
        return 'idle'
      }
      case 'abort':
      case 'session.error':
      case 'session.shutdown':
      case 'session.start':
      case 'session.resume':
        return 'idle'
      default:
        continue // usage_record, model_change, system.message ...
    }
  }
  return null
}

/**
 * An open `ask_user` elicitation: Copilot asked the person a question and is blocked on the answer (#664).
 * It is an ordinary tool call, so nothing marks it as a wait: it is a tool.execution_start with no
 * tool.execution_complete, and used to read as "working". Pending means a request named ask_user whose
 * toolCallId has no completion after it and no later user turn, abort or session end.
 * Returns { toolCallId, message, fields } or null.
 */
export function copilotPendingAskUser(lines) {
  const list = lines || []
  if (!list.some((l) => l && l.indexOf('ask_user') !== -1)) return null
  let open = null
  for (const line of list) {
    if (!line || line.indexOf('"type"') === -1) continue
    let ev
    try { ev = JSON.parse(line) } catch { continue }
    if (!isCopilotLine(ev)) continue
    const d = ev.data
    switch (ev.type) {
      case 'assistant.message':
        for (const req of Array.isArray(d.toolRequests) ? d.toolRequests : []) {
          if (req?.name === 'ask_user' && req.toolCallId) open = askOf(req.toolCallId, req.arguments)
        }
        break
      case 'tool.execution_start':
        // The request already carried the arguments; a start without them must not blank the question.
        if (d.toolName === 'ask_user' && d.toolCallId && open?.toolCallId !== d.toolCallId) open = askOf(d.toolCallId, d.arguments)
        break
      case 'tool.execution_complete':
        if (open && d.toolCallId === open.toolCallId) open = null
        break
      case 'user.message':
      case 'abort':
      case 'session.error':
      case 'session.shutdown':
      case 'session.resume':
        open = null
        break
      default:
        break
    }
  }
  return open
}

function askOf(toolCallId, args) {
  const a = args && typeof args === 'object' ? args : {}
  const props = a.requestedSchema && typeof a.requestedSchema === 'object' ? a.requestedSchema.properties : null
  const fields = props && typeof props === 'object'
    ? Object.entries(props).map(([key, v]) => String((v && v.title) || key))
    : []
  const message = String(a.message || a.question || a.prompt || '').trim() || 'Copilot is asking you a question.'
  return { toolCallId, message, fields }
}

/** The chat card for an open ask_user. Answering happens in the terminal for now. */
export function askUserCard(ask) {
  const fields = ask.fields.length ? `\n${ask.fields.map((f) => `• ${f}`).join('\n')}` : ''
  return {
    status: 'permission_request',
    message: ask.message,
    description: `${ask.message}${fields}\nAnswer it in the Terminal tab.`,
    source: 'copilot-ask',
    toolName: 'ask_user',
  }
}

/** copilotLiveStatus for a file, reading only the tail (the last events are at the end). */
export function copilotLiveStatusFromFile(filePath, tailBytes = 262144) {
  try {
    const st = fs.statSync(filePath)
    const start = Math.max(0, st.size - tailBytes)
    const fd = fs.openSync(filePath, 'r')
    try {
      const buf = Buffer.alloc(st.size - start)
      fs.readSync(fd, buf, 0, buf.length, start)
      return copilotLiveStatus(buf.toString('utf-8').split('\n'), { ageMs: Date.now() - st.mtimeMs })
    } finally {
      fs.closeSync(fd)
    }
  } catch {
    return null
  }
}

/** copilotPendingAskUser for a file, reading only the tail (the last events are at the end). */
export function copilotPendingAskUserFromFile(filePath, tailBytes = 262144) {
  try {
    const st = fs.statSync(filePath)
    const start = Math.max(0, st.size - tailBytes)
    const fd = fs.openSync(filePath, 'r')
    try {
      const buf = Buffer.alloc(st.size - start)
      fs.readSync(fd, buf, 0, buf.length, start)
      return copilotPendingAskUser(buf.toString('utf-8').split('\n'))
    } finally {
      fs.closeSync(fd)
    }
  } catch {
    return null
  }
}
