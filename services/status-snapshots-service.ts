/**
 * The status snapshot of every agent: model, context size, the /compact
 * recommendation, cost, permission mode, effort, prompt-cache expiry.
 *
 * It rides beside the activity feed (GET /api/sessions/activity returns
 * `{ activity, snapshots }`) and reaches the browser through the same store
 * (hooks/useSessionActivity.ts). It is not part of `activity` on purpose: a
 * snapshot says nothing about whether the agent is working, and an agent that
 * has not touched its terminal for a day still has a context size worth showing.
 *
 * Where it comes from: the agent's own Claude transcript, on the host where the
 * agent lives (lib/transcript-snapshot.ts). Agents on other hosts are read from
 * that host's own feed, in the background: a refresh runs when the cached copy
 * is older than REMOTE_REFRESH_MS, and the feed answers with the last copy
 * without waiting for it. A host that does not answer simply keeps showing its
 * last snapshot until the header's age rule hides it.
 */

import { loadAgents } from '@/lib/agent-registry'
import { resolveJsonlPath } from '@/lib/chat-transcript.mjs'
import { readTranscriptSnapshot, type StatusSnapshot } from '@/lib/transcript-snapshot'
import { getHosts, isSelfHost } from '@/lib/hosts-config'

export type SnapshotMap = Record<string, StatusSnapshot>

const PATH_MEMO_MS = 8_000
const REMOTE_REFRESH_MS = 15_000

const pathMemo = new Map<string, { at: number; path: string | null }>()

function transcriptPathFor(agent: any, now: number): string | null {
  const key = agent.id || agent.name
  const hit = pathMemo.get(key)
  if (hit && now - hit.at < PATH_MEMO_MS) return hit.path
  let p: string | null = null
  try { p = resolveJsonlPath(agent)?.path ?? null } catch { p = null }
  pathMemo.set(key, { at: now, path: p })
  return p
}

/**
 * Snapshots of the agents whose transcripts are on this host. Keyed by agent id
 * and by agent name, because the views look an agent up by either (the same
 * keys the activity map uses).
 */
export function getLocalSnapshots(now: number = Date.now()): SnapshotMap {
  const out: SnapshotMap = {}
  let agents: any[] = []
  try { agents = loadAgents() as any[] } catch { return out }
  if (!Array.isArray(agents)) return out

  for (const agent of agents) {
    // A codex transcript has a different shape: no snapshot rather than a wrong one
    if ((agent.program || '').toLowerCase().includes('codex')) continue
    const file = transcriptPathFor(agent, now)
    if (!file) continue
    const snap = readTranscriptSnapshot(file)
    if (!snap) continue
    const cost = agent.metrics?.estimatedCost
    const withCost: StatusSnapshot = typeof cost === 'number' && cost > 0 ? { ...snap, cost } : snap
    if (agent.id) out[agent.id] = withCost
    const name = agent.name || agent.alias
    if (name) out[name] = withCost
  }
  return out
}

// ── Other hosts ─────────────────────────────────────────────────────────────

interface RemoteEntry { at: number; map: SnapshotMap; inflight: boolean }
const remote = new Map<string, RemoteEntry>()

export type HttpGetJson = (url: string) => Promise<any>

function refreshRemote(hostId: string, url: string, httpGet: HttpGetJson, now: number): void {
  const entry = remote.get(hostId) || { at: 0, map: {}, inflight: false }
  remote.set(hostId, entry)
  if (entry.inflight || now - entry.at < REMOTE_REFRESH_MS) return
  entry.inflight = true
  // `local=true`: ask the other host for its OWN snapshots only. Two hosts that
  // each fetched the other's merged feed would chase each other's stale copies.
  httpGet(`${url}/api/sessions/activity?local=true`)
    .then((data) => {
      const snaps = data?.snapshots
      if (snaps && typeof snaps === 'object') entry.map = snaps as SnapshotMap
    })
    .catch(() => { /* keep the last copy */ })
    .finally(() => { entry.inflight = false; entry.at = Date.now() })
}

/**
 * Local snapshots, plus the cached snapshots of the other hosts' agents (never
 * waiting on them). `localOnly` is for the request another host makes.
 */
export function getSnapshots(opts: { localOnly?: boolean; httpGet?: HttpGetJson; now?: number } = {}): SnapshotMap {
  const now = opts.now ?? Date.now()
  const local = getLocalSnapshots(now)
  if (opts.localOnly || !opts.httpGet) return local

  let hosts: any[] = []
  try { hosts = getHosts() } catch { hosts = [] }
  const merged: SnapshotMap = {}
  for (const host of hosts) {
    if (host.enabled === false || !host.url) continue
    try { if (isSelfHost(host)) continue } catch { continue }
    refreshRemote(host.id, host.url, opts.httpGet, now)
    Object.assign(merged, remote.get(host.id)?.map || {})
  }
  // This host's own agents win over any copy another host holds
  return Object.assign(merged, local)
}

/** For tests */
export function resetSnapshotCaches(): void {
  pathMemo.clear()
  remote.clear()
}
