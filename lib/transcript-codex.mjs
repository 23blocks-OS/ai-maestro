/**
 * Codex transcript reader — the codex half of multi-provider chat (F004).
 *
 * The chat panel was a Claude Code transcript viewer: it located
 * `~/.claude/projects/<enc cwd>/*.jsonl` and parsed Claude's message schema.
 * Codex keeps an equally complete transcript, in a different place and shape:
 *
 *   ~/.codex/sessions/YYYY/MM/DD/rollout-<ts>-<session_id>.jsonl
 *
 * Every line is an envelope `{ timestamp, ordinal, type, payload }`. This module
 * locates the right rollout for an agent (by the cwd recorded in its
 * `session_meta`) and maps codex events onto the SAME message shapes ChatView
 * already renders — so no component changes. See F004 for the full schema eval.
 *
 * Two integration points call this, both unchanged at their call sites:
 *   - resolveJsonlPath(agent)  → resolveCodexTranscriptForDir (which file)
 *   - parseJsonlLines(lines)   → isCodexLine / codexLineToMessages (how to parse)
 *
 * parseJsonlLines detects the format PER LINE, because the live watcher passes
 * only the delta (no session_meta in it) and codex lines are self-identifying.
 */

import fs from 'fs'
import os from 'os'
import path from 'path'

const CODEX_SESSIONS_DIR = () => path.join(os.homedir(), '.codex', 'sessions')

// Envelope `type` values codex writes. Presence of `payload` + one of these is
// what distinguishes a codex line from a Claude one.
const CODEX_ENVELOPE_TYPES = new Set([
  'session_meta', 'response_item', 'event_msg', 'token_usage_record',
  'world_state', 'turn_context',
])

/** Is this parsed JSONL object a codex rollout envelope (vs a Claude message)? */
export function isCodexLine(obj) {
  return !!obj &&
    typeof obj === 'object' &&
    obj.payload !== undefined &&
    typeof obj.type === 'string' &&
    CODEX_ENVELOPE_TYPES.has(obj.type)
}

/** Concatenate the text of a codex content-part array (`[{type, text}]`). */
function partsText(content) {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .map((c) => (c && typeof c === 'object' ? (c.text || '') : ''))
    .filter(Boolean)
    .join('')
    .trim()
}

// User turns that codex auto-injects as context, not typed by the person. The
// AGENTS.md preamble is the common one; hiding it keeps the chat readable, the
// same way Claude's system-reminders are not shown as user messages.
const INJECTED_USER_PREFIXES = ['# AGENTS.md instructions', '<user_instructions', '<environment_context']

function isInjectedUserText(text) {
  const t = (text || '').trimStart()
  return INJECTED_USER_PREFIXES.some((p) => t.startsWith(p))
}

/** A tool call's input rendered as something ChatView's tool preview can show. */
function toolInputOf(payload) {
  // function_call carries a JSON `arguments` string; custom_tool_call an `input`.
  if (typeof payload.arguments === 'string') {
    try { return JSON.parse(payload.arguments) } catch { return { arguments: payload.arguments } }
  }
  if (payload.input !== undefined) {
    return typeof payload.input === 'string' ? { command: payload.input } : payload.input
  }
  return {}
}

const TOOL_CALL_TYPES = new Set(['custom_tool_call', 'function_call', 'tool_search_call'])
const TOOL_OUTPUT_TYPES = new Set(['custom_tool_call_output', 'function_call_output', 'tool_search_output'])

let _synthCounter = 0
function uuidFor(envelope, payload) {
  return payload?.id || payload?.call_id || `codex:${envelope.type}:${envelope.ordinal ?? _synthCounter++}`
}

/**
 * Map ONE codex envelope to zero or more chat messages in the shared shape
 * (`{ type, message:{content:[...]}, timestamp, uuid }` and `tool_result_marker`).
 * Returns [] for anything not user-visible (metadata, encrypted reasoning,
 * developer/system setup, the event_msg mirror).
 */
export function codexLineToMessages(envelope) {
  if (!isCodexLine(envelope)) return []
  const ts = envelope.timestamp
  const payload = envelope.payload || {}

  // Only response_item carries conversation. Everything else is metadata or a
  // duplicate view (event_msg mirrors response_items — use response_item alone).
  if (envelope.type !== 'response_item') return []

  const ptype = payload.type

  // Assistant / user / (agent_message is an assistant-authored inter-agent note).
  if (ptype === 'message' || ptype === 'agent_message') {
    const role = ptype === 'agent_message' ? 'assistant' : payload.role
    const text = partsText(payload.content)
    if (!text) return []
    if (role === 'developer' || role === 'system' || role === 'tool') return [] // setup, not chat
    if (role === 'user' && isInjectedUserText(text)) return []                  // injected context
    const kind = role === 'user' ? 'user' : 'assistant'
    return [{
      type: kind,
      message: { role: kind, content: [{ type: 'text', text }] },
      timestamp: ts,
      uuid: uuidFor(envelope, payload),
    }]
  }

  // Reasoning is codex's thinking, but it is stored encrypted (empty summary +
  // encrypted_content) — there is nothing to show. Skip rather than render a
  // blank thinking block.
  if (ptype === 'reasoning') return []

  // Tool call → an assistant message carrying a tool_use block, keyed by call_id
  // so its later output pairs to it (ChatView pairs by tool_use id).
  if (TOOL_CALL_TYPES.has(ptype)) {
    const callId = payload.call_id || payload.id
    if (!callId) return []
    return [{
      type: 'assistant',
      message: { role: 'assistant', content: [{
        type: 'tool_use', id: callId, name: payload.name || 'tool', input: toolInputOf(payload),
      }] },
      timestamp: ts,
      uuid: `codex:call:${callId}`,
    }]
  }

  // Tool output → a marker, so the call renders as completed (the raw output is
  // not shown inline, matching how Claude tool results are dropped from the
  // visible transcript and kept only as a completion marker).
  if (TOOL_OUTPUT_TYPES.has(ptype)) {
    const callId = payload.call_id || payload.id
    if (!callId) return []
    return [{ type: 'tool_result_marker', tool_use_id: callId, timestamp: ts, uuid: `codex:result:${callId}` }]
  }

  return []
}

/**
 * Read the cwd a rollout was recorded in — line 1 is always `session_meta`.
 *
 * Reads only the first line, but grows the read until a newline is found:
 * session_meta embeds `base_instructions` (the system prompt) and routinely
 * exceeds tens of KB, so a fixed small read truncates the JSON mid-string. Cap
 * the line at 2 MB — a session_meta larger than that is pathological and not
 * worth parsing.
 */
function rolloutCwd(filePath) {
  let fd
  try {
    fd = fs.openSync(filePath, 'r')
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
    if (obj?.type === 'session_meta') return obj.payload?.cwd || null
  } catch {
    return null
  } finally {
    if (fd !== undefined) try { fs.closeSync(fd) } catch { /* ignore */ }
  }
  return null
}

/**
 * Find the newest codex rollout whose session was started in `workingDir`.
 *
 * Scans ~/.codex/sessions newest-first and returns on the first cwd match, so in
 * the common case (the agent's current session is the newest file) it reads a
 * single first-line. A scan cap bounds the cost on a large history.
 */
export function resolveCodexTranscriptForDir(workingDir, { scanCap = 400 } = {}) {
  if (!workingDir) return null
  const root = CODEX_SESSIONS_DIR()
  if (!fs.existsSync(root)) return null

  // Collect rollout files with mtimes. The tree is YYYY/MM/DD/rollout-*.jsonl.
  const files = []
  const walk = (dir, depth) => {
    let entries
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      const full = path.join(dir, e.name)
      if (e.isDirectory() && depth < 4) walk(full, depth + 1)
      else if (e.isFile() && e.name.startsWith('rollout-') && e.name.endsWith('.jsonl')) {
        try { files.push({ path: full, name: e.name, mtime: fs.statSync(full).mtime }) } catch { /* skip */ }
      }
    }
  }
  walk(root, 0)
  if (files.length === 0) return null

  files.sort((a, b) => b.mtime.getTime() - a.mtime.getTime())
  const limit = Math.min(files.length, scanCap)
  for (let i = 0; i < limit; i++) {
    if (rolloutCwd(files[i].path) === workingDir) return files[i]
  }
  return null
}

/**
 * Codex live turn status, from the transcript's turn-lifecycle events (F004
 * Phase 2). Codex brackets every turn with `event_msg` `task_started` …
 * `task_complete`, so the LAST such event is the live state: a `task_started`
 * with no `task_complete` after it means codex is mid-turn (working); a
 * `task_complete` means it finished and is waiting for the user.
 *
 * This is what gives a codex agent a "working" indicator without the AI Maestro
 * hook (which only Claude Code runs). Returns 'working', 'idle', or null when
 * the turn state can't be determined.
 */
export function codexLiveStatus(lines) {
  for (let i = (lines || []).length - 1; i >= 0; i--) {
    const line = lines[i]
    // Cheap pre-filter before JSON.parse — most lines are not task events.
    if (!line || (line.indexOf('task_started') === -1 && line.indexOf('task_complete') === -1)) continue
    try {
      const d = JSON.parse(line)
      if (d?.type !== 'event_msg') continue
      const t = d.payload?.type
      if (t === 'task_started') return 'working'
      if (t === 'task_complete') return 'idle'
    } catch { /* skip */ }
  }
  return null
}

/**
 * codexLiveStatus for a file, reading only the tail — the last task event is
 * near the end, and re-reading a large rollout every poll would be wasteful.
 */
export function codexLiveStatusFromFile(filePath, tailBytes = 65536) {
  try {
    const size = fs.statSync(filePath).size
    const start = Math.max(0, size - tailBytes)
    const fd = fs.openSync(filePath, 'r')
    try {
      const buf = Buffer.alloc(size - start)
      fs.readSync(fd, buf, 0, buf.length, start)
      return codexLiveStatus(buf.toString('utf-8').split('\n'))
    } finally {
      fs.closeSync(fd)
    }
  } catch {
    return null
  }
}
