/**
 * AMP replay protection (AMP spec 07-security §Replay Protection).
 *
 * Recipients MUST reject re-sent captured messages: track seen message IDs
 * (>= 24h), reject timestamps older than 5 minutes (unless retrieved from a relay
 * queue) and more than 60 seconds in the future (clock-skew tolerance).
 *
 * Locally-originated messages routed via /route are already replay-safe because
 * the server assigns a fresh id + timestamp. This guard matters on the FEDERATION
 * deliver path, where a message arrives with its original id + timestamp.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const STALE_MS = 5 * 60 * 1000      // 5 minutes
const FUTURE_MS = 60 * 1000         // 60 seconds clock-skew tolerance
const RETAIN_MS = 24 * 60 * 60 * 1000 // seen-id retention

export type ReplayReason = 'duplicate_message' | 'timestamp_expired' | 'timestamp_future'
export interface ReplayResult { ok: boolean; reason?: ReplayReason }
type Seen = Record<string, number>   // messageId -> firstSeenMs

function seenPath(base?: string): string {
  const root = base || process.env.AIMAESTRO_REPLAY_DIR || path.join(os.homedir(), '.aimaestro', 'amp')
  return path.join(root, 'seen-messages.json')
}
function load(base?: string): Seen {
  try { return JSON.parse(fs.readFileSync(seenPath(base), 'utf8')) } catch { return {} }
}
let saveSeq = 0
function save(s: Seen, base?: string): void {
  const p = seenPath(base)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  const tmp = `${p}.tmp-${process.pid}-${saveSeq++}`
  fs.writeFileSync(tmp, JSON.stringify(s, null, 2))
  fs.renameSync(tmp, p)
}

/**
 * Check a message for replay and record its id if fresh. `nowMs` and `base` are
 * injectable for tests. Returns {ok:false, reason} to reject, {ok:true} to accept.
 */
export function checkReplay(
  messageId: string, timestampIso: string, opts: { fromRelay?: boolean; nowMs: number; base?: string }
): ReplayResult {
  const { fromRelay = false, nowMs, base } = opts
  const seen = load(base)
  // prune expired seen ids
  for (const [id, t] of Object.entries(seen)) if (nowMs - t > RETAIN_MS) delete seen[id]

  if (messageId && seen[messageId] !== undefined) return { ok: false, reason: 'duplicate_message' }

  if (!fromRelay && timestampIso) {
    const ts = Date.parse(timestampIso)
    if (!Number.isNaN(ts)) {
      if (nowMs - ts > STALE_MS) return { ok: false, reason: 'timestamp_expired' }
      if (ts - nowMs > FUTURE_MS) return { ok: false, reason: 'timestamp_future' }
    }
  }

  if (messageId) { seen[messageId] = nowMs; save(seen, base) }
  return { ok: true }
}
