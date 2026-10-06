/**
 * Grok Build transcript reader — the grok half of multi-provider chat (F028,
 * mirrors F004's codex reader).
 *
 * Grok keeps its conversation as an ACP update stream:
 *
 *   ~/.grok/sessions/<url-encoded cwd>/<session-id>/updates.jsonl
 *
 * (GROK_HOME overrides ~/.grok.) When the encoded cwd exceeds 255 bytes grok
 * names the group dir with a slug plus a hash and writes the original path to a
 * `.cwd` file inside it. Every line is
 * `{ timestamp, method, params: { sessionId, update: { sessionUpdate, ... }, _meta } }`.
 *
 * Mapped to the shared ChatView shapes (no component changes):
 *   user_message_chunk  -> user message        (consecutive chunks merged)
 *   agent_message_chunk -> assistant message   (consecutive chunks merged)
 *   tool_call           -> assistant tool_use block, keyed by toolCallId
 *   tool_call_update    -> tool_result_marker once status is completed/failed
 * Everything else (hook_execution, turn_completed, metadata) is not chat.
 *
 * Chunk merging happens in parseJsonlLines (it sees the whole batch); the
 * per-line mapper marks chunks with `_grokChunk` and parseJsonlLines strips it.
 */

import fs from 'fs'
import os from 'os'
import path from 'path'

const GROK_SESSIONS_DIR = () =>
  path.join(process.env.GROK_HOME || path.join(os.homedir(), '.grok'), 'sessions')

/** Is this parsed JSONL object a grok ACP session update line? */
export function isGrokLine(obj) {
  return !!obj &&
    typeof obj === 'object' &&
    typeof obj.method === 'string' &&
    obj.method.endsWith('session/update') &&
    !!obj.params &&
    typeof obj.params === 'object' &&
    !!obj.params.update &&
    typeof obj.params.update.sessionUpdate === 'string'
}

function chunkText(update) {
  const c = update.content
  if (c && typeof c === 'object' && c.type === 'text' && typeof c.text === 'string') return c.text
  return ''
}

function isoOf(envelope) {
  const t = envelope.timestamp
  if (typeof t === 'number') return new Date(t < 1e12 ? t * 1000 : t).toISOString()
  return t
}

/** Map a grok tool kind to the Claude tool name ChatView knows how to preview. */
function toolNameOf(update) {
  const meta = update._meta?.['x.ai/tool']
  const kind = update.kind || meta?.kind
  if (kind === 'execute') return 'Bash'
  return meta?.label || update.title || meta?.name || 'tool'
}

/**
 * Map ONE grok line to zero or more chat messages. Text chunks come back with
 * `_grokChunk: true` so parseJsonlLines can merge adjacent ones.
 */
export function grokLineToMessages(envelope) {
  if (!isGrokLine(envelope)) return []
  const update = envelope.params.update
  const ts = isoOf(envelope)
  const eventId = envelope.params._meta?.eventId || `grok:${envelope.timestamp}`

  switch (update.sessionUpdate) {
    case 'user_message_chunk':
    case 'agent_message_chunk': {
      const text = chunkText(update)
      if (!text) return []
      const kind = update.sessionUpdate === 'user_message_chunk' ? 'user' : 'assistant'
      return [{
        type: kind,
        message: { role: kind, content: [{ type: 'text', text }] },
        timestamp: ts,
        uuid: `grok:${eventId}`,
        _grokChunk: true,
      }]
    }
    case 'tool_call': {
      const id = update.toolCallId
      if (!id) return []
      return [{
        type: 'assistant',
        message: { role: 'assistant', content: [{
          type: 'tool_use', id, name: toolNameOf(update), input: update.rawInput || {},
        }] },
        timestamp: ts,
        uuid: `grok:call:${id}`,
      }]
    }
    case 'tool_call_update': {
      const id = update.toolCallId
      if (!id) return []
      if (update.status !== 'completed' && update.status !== 'failed') return []
      return [{ type: 'tool_result_marker', tool_use_id: id, timestamp: ts, uuid: `grok:result:${id}` }]
    }
    default:
      return []
  }
}

/** Merge grok text chunks of the same role that sit next to each other. */
export function pushGrokMessage(messages, m) {
  const prev = messages[messages.length - 1]
  if (m._grokChunk && prev && prev._grokChunk && prev.type === m.type) {
    prev.message.content[0].text += m.message.content[0].text
    return
  }
  messages.push(m)
}

/** Remove the internal merge marker once a batch is parsed. */
export function stripGrokMarkers(messages) {
  for (const m of messages) if (m && m._grokChunk) delete m._grokChunk
  return messages
}

function readCwdFile(groupDir) {
  try { return fs.readFileSync(path.join(groupDir, '.cwd'), 'utf-8').trim() } catch { return null }
}

/**
 * Find the newest grok session (updates.jsonl) for `workingDir`.
 * Group dir = encodeURIComponent(cwd); for long paths grok uses slug+hash and a
 * `.cwd` file, so fall back to scanning groups for a matching `.cwd`.
 */
export function resolveGrokTranscriptForDir(workingDir) {
  if (!workingDir) return null
  const root = GROK_SESSIONS_DIR()
  if (!fs.existsSync(root)) return null

  const candidates = []
  const direct = path.join(root, encodeURIComponent(workingDir))
  if (fs.existsSync(direct)) candidates.push(direct)
  else if (Buffer.byteLength(encodeURIComponent(workingDir)) > 255) {
    try {
      for (const e of fs.readdirSync(root, { withFileTypes: true })) {
        if (!e.isDirectory()) continue
        const g = path.join(root, e.name)
        if (readCwdFile(g) === workingDir) candidates.push(g)
      }
    } catch { /* ignore */ }
  }

  let best = null
  for (const group of candidates) {
    let sessions
    try { sessions = fs.readdirSync(group, { withFileTypes: true }) } catch { continue }
    for (const s of sessions) {
      if (!s.isDirectory()) continue
      const p = path.join(group, s.name, 'updates.jsonl')
      try {
        const mtime = fs.statSync(p).mtime
        if (!best || mtime.getTime() > best.mtime.getTime()) best = { path: p, name: 'updates.jsonl', mtime }
      } catch { /* no updates yet */ }
    }
  }
  return best
}
