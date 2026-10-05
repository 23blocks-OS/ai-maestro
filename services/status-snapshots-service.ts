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
 * Where it comes from, in order of trust:
 *   1. What the status line reports (POST /api/agents/<id>/status-snapshot):
 *      Claude Code's own live values for the session, so the header and the
 *      terminal bar show the same numbers. Used while the report is fresh
 *      (REPORT_FRESH_MS); the cost comes ONLY from here.
 *   2. The agent's own Claude transcript, on the host where the agent lives
 *      (lib/transcript-snapshot.ts): model, context, effort, permission mode and
 *      the prompt-cache expiry for every agent, with or without the plugin.
 * Agents on other hosts are read from that host's own feed, in the background:
 * a refresh runs when the cached copy is older than REMOTE_REFRESH_MS, and the
 * feed answers with the last copy without waiting for it. A host that does not
 * answer simply keeps showing its last snapshot until the header's age rule
 * hides it.
 */

import fs from 'fs'
import os from 'os'
import path from 'path'
import { loadAgents, getAgent } from '@/lib/agent-registry'
import { resolveJsonlPath } from '@/lib/chat-transcript.mjs'
import { readTranscriptSnapshot, type StatusSnapshot } from '@/lib/transcript-snapshot'
import { compactHint } from '@/lib/context-hint'
import { getHosts, isSelfHost } from '@/lib/hosts-config'
import { type ServiceResult, invalidRequest, invalidField, notFound, serviceError } from '@/services/service-errors'

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

// ── Reported by the status line ─────────────────────────────────────────────

/** A report older than this is ignored: the status line only runs while a session is open */
export const REPORT_FRESH_MS = 5 * 60 * 1000
const REPORT_KEEP_MS = 60 * 60 * 1000
const STORE_MAX = 2000
export const MAX_REPORT_CHARS = 4096

export interface Reported {
  /** When this host received it (ms). Freshness is judged on this, never on the sender's clock */
  receivedAt: number
  sessionId?: string
  /** Claude Code's display name for the model, e.g. "Opus 5.5" */
  model?: string
  modelId?: string
  contextTokens?: number
  contextWindow?: number
  contextPercent?: number
  /** This session's cost in USD */
  cost?: number
  /** null: the model has no effort setting, so show none */
  effort?: string | null
  cacheWarm?: boolean | null
  /** ms since epoch (the report carries seconds) */
  cacheExpiresAt?: number | null
  exceeds200k?: boolean
}

// The route handlers and the feed are bundled separately, so module state is not
// shared between them: keep the store on globalThis (same bridge as the other
// shared maps).
function reportStore(): Map<string, Reported> {
  const g = globalThis as any
  if (!g.__aimStatusReports) {
    g.__aimStatusReports = new Map<string, Reported>()
    loadPersistedReports(g.__aimStatusReports)
  }
  return g.__aimStatusReports
}

// ── Surviving a restart ─────────────────────────────────────────────────────
// Reports live in memory, and every deploy restarts the server. An idle agent's
// status line does not report again until it next redraws, so without a copy on
// disk every cost would vanish from the header after each update. The file holds
// only what the status line reported (no secrets), is written at most every 20 s,
// and anything older than a day is dropped on load.

function reportsFile(): string {
  return process.env.AIM_STATUS_REPORTS_FILE || path.join(os.homedir(), '.aimaestro', 'status-reports.json')
}

/** A test run must never read or write the real file; a test opts in with its own path */
function persistenceEnabled(): boolean {
  return !process.env.VITEST || !!process.env.AIM_STATUS_REPORTS_FILE
}

const PERSIST_EVERY_MS = 20_000
let persistTimer: ReturnType<typeof setTimeout> | null = null

function persistSoon(): void {
  if (persistTimer || !persistenceEnabled()) return
  persistTimer = setTimeout(() => {
    persistTimer = null
    try {
      const file = reportsFile()
      fs.mkdirSync(path.dirname(file), { recursive: true })
      const tmp = `${file}.${process.pid}.tmp`
      fs.writeFileSync(tmp, JSON.stringify([...reportStore()]), { mode: 0o600 })
      fs.renameSync(tmp, file)
    } catch { /* a missed write only costs a stale cost after the next restart */ }
  }, PERSIST_EVERY_MS)
  ;(persistTimer as any).unref?.()
}

/** Only the fields the status line reports, each checked again: the file is input too */
function sanitizePersisted(v: any): Reported | null {
  if (!v || typeof v !== 'object' || !Number.isFinite(v.receivedAt)) return null
  const out: Reported = { receivedAt: v.receivedAt }
  for (const k of ['sessionId', 'model', 'modelId'] as const) {
    if (typeof v[k] === 'string' && v[k].length > 0 && v[k].length <= 100 && !CONTROL.test(v[k])) out[k] = v[k]
  }
  for (const k of ['contextTokens', 'contextWindow', 'contextPercent', 'cost'] as const) {
    if (typeof v[k] === 'number' && Number.isFinite(v[k]) && v[k] >= 0) out[k] = v[k]
  }
  if (v.effort === null || (typeof v.effort === 'string' && v.effort.length <= 32 && !CONTROL.test(v.effort))) out.effort = v.effort
  if (typeof v.cacheWarm === 'boolean' || v.cacheWarm === null) out.cacheWarm = v.cacheWarm
  if ((typeof v.cacheExpiresAt === 'number' && Number.isFinite(v.cacheExpiresAt)) || v.cacheExpiresAt === null) out.cacheExpiresAt = v.cacheExpiresAt
  if (typeof v.exceeds200k === 'boolean') out.exceeds200k = v.exceeds200k
  return out
}

function loadPersistedReports(store: Map<string, Reported>): void {
  if (!persistenceEnabled()) return
  try {
    const raw = JSON.parse(fs.readFileSync(reportsFile(), 'utf-8'))
    if (!Array.isArray(raw)) return
    const now = Date.now()
    for (const entry of raw) {
      if (!Array.isArray(entry) || typeof entry[0] !== 'string' || entry[0].length > 100) continue
      const r = sanitizePersisted(entry[1])
      if (r && now - r.receivedAt <= REPORT_IDLE_MAX_MS) store.set(entry[0], r)
    }
  } catch { /* no file yet, or unreadable: start empty */ }
}

const CONTROL = /[\u0000-\u001f\u007f]/

type Failure = ServiceResult<never>
const isFailure = (v: unknown): v is Failure => typeof v === 'object' && v !== null && 'status' in v

function readString(body: Record<string, unknown>, key: string, max = 100): string | undefined | Failure {
  const v = body[key]
  if (v === undefined) return undefined
  if (typeof v !== 'string' || v.length === 0 || v.length > max || CONTROL.test(v)) {
    return invalidField(key, `${key} must be a short string without control characters`)
  }
  return v
}

function readNumber(body: Record<string, unknown>, key: string, min: number, max: number, integer = false): number | undefined | Failure {
  const v = body[key]
  if (v === undefined) return undefined
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max || (integer && !Number.isInteger(v))) {
    return invalidField(key, `${key} must be ${integer ? 'an integer' : 'a number'} between ${min} and ${max}`)
  }
  return v
}

/**
 * The status line reports what Claude Code just told it. Validates every field
 * (the body is untrusted input from the network), keeps the report in memory,
 * and writes nothing to disk. All fields are optional; unknown fields are dropped.
 */
export function ingestStatusSnapshot(agentId: string, body: unknown, now: number = Date.now()): ServiceResult<{ ok: true }> {
  if (!agentId || typeof agentId !== 'string' || agentId.length > 100) return invalidField('id', 'agent id is invalid')
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return invalidRequest('body must be a JSON object')
  let size = 0
  try { size = JSON.stringify(body).length } catch { return invalidRequest('body is not valid JSON') }
  if (size > MAX_REPORT_CHARS) return serviceError('payload_too_large', `body exceeds ${MAX_REPORT_CHARS} characters`, 413)

  let agent: any = null
  try { agent = getAgent(agentId) } catch { agent = null }
  if (!agent) return notFound('Agent', agentId)

  const b = body as Record<string, unknown>
  const out: Reported = { receivedAt: now }

  for (const key of ['sessionId', 'model', 'modelId'] as const) {
    const r = readString(b, key)
    if (isFailure(r)) return r
    if (r !== undefined) out[key] = r
  }
  // effort: a short string, or null when the model has none
  if (b.effort === null) {
    out.effort = null
  } else if (b.effort !== undefined) {
    const r = readString(b, 'effort', 32)
    if (isFailure(r)) return r
    out.effort = r as string
  }

  const nums: Array<['contextTokens' | 'contextWindow' | 'contextPercent' | 'cost', number, number, boolean]> = [
    ['contextTokens', 0, 10_000_000, true],
    ['contextWindow', 1, 10_000_000, true],
    ['contextPercent', 0, 100, false],
    ['cost', 0, 1_000_000, false],
  ]
  for (const [key, min, max, integer] of nums) {
    const r = readNumber(b, key, min, max, integer)
    if (isFailure(r)) return r
    if (r !== undefined) out[key] = r
  }
  // ts is checked for shape and then ignored: freshness is the server's own receive time
  const ts = readNumber(b, 'ts', 0, 4_102_444_800_000)
  if (isFailure(ts)) return ts

  if (b.cacheWarm !== undefined) {
    if (b.cacheWarm !== null && typeof b.cacheWarm !== 'boolean') return invalidField('cacheWarm', 'cacheWarm must be true, false or null')
    out.cacheWarm = b.cacheWarm
  }
  if (b.cacheExpiresAt === null) {
    out.cacheExpiresAt = null
  } else if (b.cacheExpiresAt !== undefined) {
    const r = readNumber(b, 'cacheExpiresAt', 0, 4_102_444_800)
    if (isFailure(r)) return r
    out.cacheExpiresAt = (r as number) * 1000
  }
  if (b.exceeds200k !== undefined) {
    if (typeof b.exceeds200k !== 'boolean') return invalidField('exceeds200k', 'exceeds200k must be a boolean')
    out.exceeds200k = b.exceeds200k
  }

  const store = reportStore()
  store.set(agent.id, out)
  persistSoon()
  // Keep the store small: drop what is long past, and the oldest if it ever grows
  if (store.size > 64) {
    for (const [k, v] of store) if (now - v.receivedAt > REPORT_KEEP_MS) store.delete(k)
    while (store.size > STORE_MAX) store.delete(store.keys().next().value as string)
  }
  return { data: { ok: true }, status: 200 }
}

/**
 * A report is good while the agent has not done anything since it was sent. For
 * five minutes that is a given. After that it holds as long as the transcript has
 * no turn newer than the report (an idle agent's cost cannot change, and an idle
 * agent's status line does not report), for up to a day. A newer turn with no
 * report means the numbers may have moved: fall back to the transcript, no cost.
 */
export const REPORT_IDLE_MAX_MS = 24 * 60 * 60 * 1000
const REPORT_TURN_SLACK_MS = 60_000
function freshReport(agentId: string | undefined, now: number, base?: StatusSnapshot | null): Reported | null {
  if (!agentId) return null
  const r = reportStore().get(agentId)
  if (!r) return null
  const age = now - r.receivedAt
  if (age <= REPORT_FRESH_MS) return r
  if (age <= REPORT_IDLE_MAX_MS && base?.lastTurnAt !== undefined && base.lastTurnAt <= r.receivedAt + REPORT_TURN_SLACK_MS) return r
  return null
}

/** Warm or cold is a question about now: answer it when the feed is built (a reported value wins) */
function finishCache(snap: StatusSnapshot, now: number): StatusSnapshot {
  if (snap.cacheWarm === undefined && snap.cacheExpiresAt !== undefined) {
    return { ...snap, cacheWarm: snap.cacheExpiresAt > now }
  }
  return snap
}

/** The transcript snapshot alone: no cost (it only ever comes from a report) */
function transcriptOnly(base: StatusSnapshot, now: number): StatusSnapshot {
  const { cost: _cost, ...rest } = base
  return finishCache({ ...rest, source: 'transcript' }, now)
}

/**
 * The transcript snapshot with the status line's report laid over it (when the
 * report is fresh). The reported values win for everything the status line
 * knows; the permission mode and the last-turn time come from the transcript.
 * The cost is the reported session cost or nothing. Pure.
 */
export function composeSnapshot(base: StatusSnapshot | null, rep: Reported | null, now: number): StatusSnapshot | null {
  if (!rep) return base ? transcriptOnly(base, now) : null

  const model = rep.modelId ?? base?.model ?? rep.model
  const contextTokens = rep.contextTokens ?? base?.contextTokens
  if (!model || contextTokens === undefined) return base ? transcriptOnly(base, now) : null

  const reportedWindow = rep.contextWindow !== undefined
  const contextWindow = rep.contextWindow ?? base?.contextWindow ?? 200_000
  const contextPercent = rep.contextPercent !== undefined
    ? Math.round(rep.contextPercent)
    : Math.min(100, Math.round((contextTokens / contextWindow) * 100))

  // Cache: a reported expiry wins; a reported warm/cold with no expiry stands alone;
  // otherwise whatever the transcript worked out.
  let cacheFields: Partial<StatusSnapshot> = {}
  if (rep.cacheExpiresAt != null) {
    cacheFields = { cacheExpiresAt: rep.cacheExpiresAt }
    if (rep.cacheWarm != null) cacheFields.cacheWarm = rep.cacheWarm
  } else if (rep.cacheWarm != null) {
    cacheFields = { cacheWarm: rep.cacheWarm }
  } else if (base?.cacheExpiresAt !== undefined) {
    cacheFields = { cacheExpiresAt: base.cacheExpiresAt }
  }

  const effort = 'effort' in rep ? (rep.effort || undefined) : base?.effort

  const snap: StatusSnapshot = {
    model,
    ...(rep.model ? { modelName: rep.model } : {}),
    contextTokens,
    contextWindow,
    contextApprox: reportedWindow || rep.contextPercent !== undefined ? false : (base?.contextApprox ?? true),
    contextPercent,
    // The status line treats "over 200k" as 'now' even when the window is larger
    compact: rep.exceeds200k ? 'now' : compactHint(contextTokens),
    ...(base?.mode !== undefined ? { mode: base.mode } : {}),
    ...(effort ? { effort } : {}),
    ...(rep.cost !== undefined ? { cost: rep.cost } : {}),
    ...cacheFields,
    asOf: rep.receivedAt,
    lastTurnAt: base?.lastTurnAt ?? rep.receivedAt,
    source: 'reported',
  }
  return finishCache(snap, now)
}

/**
 * Snapshots of the agents on this host. Keyed by agent id and by agent name,
 * because the views look an agent up by either (the same keys the activity map
 * uses).
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
    const base = file ? readTranscriptSnapshot(file) : null
    const snap = composeSnapshot(base, freshReport(agent.id, now, base), now)
    if (!snap) continue
    if (agent.id) out[agent.id] = snap
    const name = agent.name || agent.alias
    if (name) out[name] = snap
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

// A copy that is refreshed only when someone asks is old at the moment they ask:
// the first request after a quiet spell got the old copy and only then started a
// refresh (an agent on another host showed a cost eight hours old). While requests
// keep coming, a timer keeps every host's copy within one refresh window; it stops
// by itself ten minutes after the last request.
const REFRESHER_IDLE_MS = 10 * 60_000
let refresher: ReturnType<typeof setInterval> | null = null
let lastRequestAt = 0
let refresherGet: HttpGetJson | null = null

function stopRefresher(): void {
  if (refresher) { clearInterval(refresher); refresher = null }
}

function ensureRefresher(httpGet: HttpGetJson, now: number): void {
  lastRequestAt = now
  refresherGet = httpGet
  if (refresher) return
  refresher = setInterval(() => {
    if (!refresherGet || Date.now() - lastRequestAt > REFRESHER_IDLE_MS) { stopRefresher(); return }
    let hosts: any[] = []
    try { hosts = getHosts() } catch { return }
    for (const host of hosts) {
      if (host.enabled === false || !host.url) continue
      try { if (isSelfHost(host)) continue } catch { continue }
      refreshRemote(host.id, host.url, refresherGet, Date.now())
    }
  }, REMOTE_REFRESH_MS)
  // Never keep the process alive for this
  ;(refresher as any).unref?.()
}

/**
 * Local snapshots, plus the cached snapshots of the other hosts' agents (never
 * waiting on them). `localOnly` is for the request another host makes.
 */
export function getSnapshots(opts: { localOnly?: boolean; httpGet?: HttpGetJson; now?: number } = {}): SnapshotMap {
  const now = opts.now ?? Date.now()
  const local = getLocalSnapshots(now)
  if (opts.localOnly || !opts.httpGet) return local
  ensureRefresher(opts.httpGet, now)

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
  stopRefresher()
  pathMemo.clear()
  remote.clear()
  reportStore().clear()
  if (persistTimer) { clearTimeout(persistTimer); persistTimer = null }
}
