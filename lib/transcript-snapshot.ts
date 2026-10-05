/**
 * What the status line shows for an agent, read from the agent's own Claude
 * transcript instead of from Claude Code's status-line JSON.
 *
 * Why the transcript: the status line runs inside the terminal and tells the
 * server only the cost. The transcript is on the agent's host, the server
 * already reads it for the chat, and every assistant turn in it carries the
 * model and the token usage. So the model, the context size, the effort, the
 * permission mode and the cache state are all one cheap read away, for every
 * agent, with or without the plugin.
 *
 * Cheap on purpose: only the last TAIL_BYTES of the file are read (a transcript
 * can be tens of MB), the result is cached by path + mtime + size, and any
 * failure yields null. The feed must never wait on this or fail because of it.
 */

import fs from 'fs'
import { compactHint, type CompactHint } from '@/lib/context-hint'

export const TAIL_BYTES = 256 * 1024
const DEFAULT_WINDOW = 200_000
const LONG_WINDOW = 1_000_000
const CACHE_TTL_1H_MS = 60 * 60 * 1000
const CACHE_TTL_5M_MS = 5 * 60 * 1000

export interface StatusSnapshot {
  /** The model id as the transcript has it, e.g. "claude-opus-5-5" */
  model: string
  /** input + cache read + cache write tokens of the last turn: what the next turn re-reads */
  contextTokens: number
  contextWindow: number
  /** True when the window size is assumed (200k) rather than known (1M model, or more than 200k seen) */
  contextApprox: boolean
  contextPercent: number
  compact: CompactHint
  /** Permission mode, e.g. "default", "plan", "acceptEdits", "auto". Absent when the tail has none */
  mode?: string
  /** Reasoning effort of the last turn. Absent when the transcript does not say */
  effort?: string
  /** When the prompt cache the last turn wrote or read runs out (ms since epoch). Absent when the TTL is unknown */
  cacheExpiresAt?: number
  /** When the last turn happened (ms since epoch): how old this snapshot is */
  asOf: number
  /**
   * THIS SESSION's cost in USD, as the status line reports it (Claude Code's own
   * session total). Never read from the transcript and never from the lifetime
   * agent metrics (a maximum that only grows, which showed $2466 for a $65 session).
   * Absent when no fresh report exists.
   */
  cost?: number
  /** Claude Code's display name for the model ("Opus 5.5"), when the status line reported it. The header prefers it over the id. */
  modelName?: string
  /** True while the prompt cache is warm: set by the feed from the expiry, or reported by the status line */
  cacheWarm?: boolean
  /** When the last turn happened (ms): what "last turn N ago" and the 24 h hiding rule use. `asOf` is the time of the freshest source */
  lastTurnAt?: number
  /** 'reported': the status line told the server (fresh); 'transcript': read from the transcript tail */
  source?: 'reported' | 'transcript'
}

/** Parse the lines of a transcript tail (oldest first). Pure. Returns null when no assistant turn is found. */
export function snapshotFromTranscriptLines(lines: string[]): StatusSnapshot | null {
  let last: { o: any; tokens: number } | null = null
  let mode: string | undefined
  let ttlMs: number | undefined
  let observedMax = 0

  // Walk from the end: the last main-conversation assistant turn wins, and so
  // does the last permission-mode entry. Older turns still tell us the cache
  // TTL and the largest context seen, so keep walking until all are known.
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]
    if (!line || line[0] !== '{') continue
    let o: any
    try { o = JSON.parse(line) } catch { continue }

    if (o.type === 'permission-mode' && mode === undefined && typeof o.permissionMode === 'string') {
      mode = o.permissionMode
      continue
    }
    if (o.type !== 'assistant' || o.isSidechain === true) continue
    const usage = o.message?.usage
    if (!usage || typeof o.message?.model !== 'string') continue
    // A synthetic assistant line (for example an interrupted request) has no real usage
    if (o.message.model === '<synthetic>') continue

    const tokens = (usage.input_tokens || 0) + (usage.cache_read_input_tokens || 0) + (usage.cache_creation_input_tokens || 0)
    if (!last) last = { o, tokens }
    observedMax = Math.max(observedMax, tokens)

    if (ttlMs === undefined) {
      const cc = usage.cache_creation
      if (cc && cc.ephemeral_1h_input_tokens > 0) ttlMs = CACHE_TTL_1H_MS
      else if (cc && cc.ephemeral_5m_input_tokens > 0) ttlMs = CACHE_TTL_5M_MS
    }
    if (mode !== undefined && ttlMs !== undefined && observedMax > DEFAULT_WINDOW) break
  }
  if (!last) return null

  const { o, tokens } = last
  const model: string = o.message.model
  const known = /\[1m\]/i.test(model) || observedMax > DEFAULT_WINDOW
  const contextWindow = known ? LONG_WINDOW : DEFAULT_WINDOW
  const parsed = Date.parse(o.timestamp)
  const asOf = Number.isFinite(parsed) ? parsed : Date.now()

  return {
    model,
    contextTokens: tokens,
    contextWindow,
    contextApprox: !known,
    contextPercent: Math.min(100, Math.round((tokens / contextWindow) * 100)),
    compact: compactHint(tokens),
    ...(mode !== undefined ? { mode } : {}),
    ...(typeof o.effort === 'string' ? { effort: o.effort } : {}),
    ...(ttlMs !== undefined ? { cacheExpiresAt: asOf + ttlMs } : {}),
    asOf,
    lastTurnAt: asOf,
    source: 'transcript',
  }
}

interface CacheEntry { mtimeMs: number; size: number; snapshot: StatusSnapshot | null }
const cache = new Map<string, CacheEntry>()
const CACHE_MAX = 500

/** Read the snapshot for a transcript file. Cached by mtime + size. Never throws. */
export function readTranscriptSnapshot(filePath: string): StatusSnapshot | null {
  let fd: number | null = null
  try {
    const st = fs.statSync(filePath)
    const hit = cache.get(filePath)
    if (hit && hit.mtimeMs === st.mtimeMs && hit.size === st.size) return hit.snapshot

    fd = fs.openSync(filePath, 'r')
    const start = Math.max(0, st.size - TAIL_BYTES)
    const len = st.size - start
    const buf = Buffer.alloc(len)
    fs.readSync(fd, buf, 0, len, start)
    let lines = buf.toString('utf8').split('\n')
    // A read that starts mid-file begins in the middle of a line: drop that fragment
    if (start > 0) lines = lines.slice(1)

    const snapshot = snapshotFromTranscriptLines(lines)
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string)
    cache.set(filePath, { mtimeMs: st.mtimeMs, size: st.size, snapshot })
    return snapshot
  } catch {
    return null
  } finally {
    if (fd !== null) { try { fs.closeSync(fd) } catch { /* already closed */ } }
  }
}

/** For tests */
export function clearSnapshotCache(): void {
  cache.clear()
}
