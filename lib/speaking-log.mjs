/**
 * What an agent's speaking side heard, said and handed over (F100), so the chat has no holes (F098): the person's
 * words go to the speaking side, not into the main session's transcript.
 *   ~/.aimaestro/agents/<id>/speaking/log.jsonl   { ts, kind: heard|said|handoff|from-main, device, text }
 */
import fs from 'fs'
import os from 'os'
import path from 'path'

const MAX_BYTES = 2 * 1024 * 1024
const SAFE_ID = /^[A-Za-z0-9_-]{1,80}$/

export function speakingLogPath(agentId, root = path.join(os.homedir(), '.aimaestro', 'agents')) {
  return SAFE_ID.test(String(agentId)) ? path.join(root, agentId, 'speaking', 'log.jsonl') : null
}

export function appendSpeakingLog(agentId, entry, { root, now = Date.now } = {}) {
  const file = speakingLogPath(agentId, root)
  if (!file) return null
  const record = { ts: new Date(now()).toISOString(), ...entry }
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
    // shortcut: when it grows past 2 MB the oldest half goes; enough for weeks of talking
    if (fs.existsSync(file) && fs.statSync(file).size > MAX_BYTES) {
      const lines = fs.readFileSync(file, 'utf8').trim().split('\n')
      fs.writeFileSync(file, lines.slice(Math.floor(lines.length / 2)).join('\n') + '\n', { mode: 0o600 })
    }
    fs.appendFileSync(file, JSON.stringify(record) + '\n', { mode: 0o600 })
    return record
  } catch (err) {
    console.error(`[Speaking] could not write the log for ${agentId}: ${err.message}`)
    return null
  }
}

/** One log record as a chat entry */
export const toChatEntry = (e) => ({ type: 'speaking_message', kind: e.kind, device: e.device || null, source: e.source === 'voice' ? 'said' : e.source ? 'typed' : null, text: e.text, timestamp: e.ts, uuid: `speaking-${e.ts}-${e.kind}` })

/** The log as chat entries, oldest first. */
export function speakingEntries(agentId, { root } = {}) {
  const file = speakingLogPath(agentId, root)
  if (!file || !fs.existsSync(file)) return []
  const out = []
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue
    try {
      const e = JSON.parse(line)
      if (!e.ts || !e.kind || typeof e.text !== 'string') continue
      out.push(toChatEntry(e))
    } catch { /* skip */ }
  }
  return out
}

/** Merges speaking entries into a chat list by time. The list stays as it was when there are none. */
export function withSpeaking(messages, entries) {
  if (!entries.length) return messages
  const t = (m) => Date.parse(m?.timestamp || '') || 0
  const first = messages.length ? t(messages[0]) : 0
  // Only entries inside the window this page covers, so paging does not repeat them
  const own = entries.filter((e) => !messages.length || t(e) >= first)
  return [...messages, ...own].map((m, i) => [m, i]).sort((a, b) => (t(a[0]) - t(b[0])) || (a[1] - b[1])).map(([m]) => m)
}
