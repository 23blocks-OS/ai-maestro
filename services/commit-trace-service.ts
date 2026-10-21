/**
 * Commit-to-session trace: which agent and session made a commit, with the command and result behind it.
 *
 *   GET /api/commits/<sha>            every host's answer, merged (a down host is listed, not hidden)
 *   GET /api/commits/<sha>?local=1    this host only (what a peer is asked, so hosts never forward in a loop)
 *   GET /api/agents/<id>/commits      one agent's commits and PRs by session (asks the owning host)
 *
 * Three ways a commit is matched, from strongest to weakest:
 *   sha      the agent's session recorded this very commit            confidence "exact"
 *   pr       the commit on main is a squash "... (#528)"; the session opened or merged PR 528, and the
 *            branch commits it made are listed                       confidence "likely"
 *   subject  the same first line of message (a rebase merge or cherry-pick keeps it) confidence "weak"
 * A rebase merge or a cherry-pick with a changed message, a PR opened from the GitHub page, and a session
 * of an agent that does not run Claude Code (other transcript formats are not read) cannot be traced.
 */

import { getAgent, loadAgents } from '@/lib/agent-registry'
import { getHosts, getSelfHostId, isSelf } from '@/lib/hosts-config'
import { findPeerHostUrl } from '@/lib/owning-host'
import { getAgentWorkingDir } from '@/lib/chat-transcript.mjs'
import {
  loadIndex, refreshAgentIndex, runGit, type AgentCommitIndex, type GitRunner, type RefreshResult,
} from '@/lib/commit-index'
import { isShaQuery, prNumberOfSubject, sameRepository, stripPrSuffix, type CommitRecord, type PrRecord } from '@/lib/commit-trace'
import { invalidField, invalidRequest, notFound, serviceError, type ServiceResult } from '@/services/service-errors'

export interface TraceCommit {
  sha?: string
  subject?: string
  branch?: string
  ts: string
  repoDir?: string
  line: number
  via: CommitRecord['via']
  command: string
  evidence: string
}

export interface TracePr {
  pr: number
  repo?: string
  kind: PrRecord['kind']
  ts: string
  branch?: string
  command: string
}

export interface TraceMatch {
  hostId: string
  agentId: string
  agentName: string
  sessionId: string
  via: 'sha' | 'pr' | 'subject'
  confidence: 'exact' | 'likely' | 'weak'
  role: 'committed' | 'opened' | 'merged'
  commits: TraceCommit[]
  prs: TracePr[]
}

export interface TraceResult {
  query: string
  /** The commit ids the query stands for (one, unless the abbreviation is ambiguous) */
  shas: string[]
  subject?: string
  pr?: number
  matches: TraceMatch[]
  unreachable: string[]
  /** Not every transcript could be read in the time allowed; the answer may be missing sessions */
  partial?: boolean
}

export interface LiteAgent {
  id: string
  name?: string
  label?: string
  alias?: string
  program?: string
  workingDirectory?: string | null
}

export interface TraceDeps {
  listAgents: () => LiteAgent[]
  ensureIndex: (agent: LiteAgent, budgetMs: number) => Promise<RefreshResult>
  git: GitRunner
  hostId: () => string
  peers: () => { id: string; name?: string; url: string }[]
  fetchImpl: typeof fetch
  /** Called with the agents that could not be read in the time allowed: read them on, out of the request */
  warm?: (agents: LiteAgent[]) => void
}

const STALE_MS = 30_000
const LOOKUP_BUDGET_MS = 10_000
const WARM_BUDGET_MS = 10 * 60_000
const PEER_TIMEOUT_MS = 5_000
const MAX_COMMITS_LISTED = 200
const MAX_REPOS_PROBED = 80
const PROBE_BATCH = 8

const defaultDeps: TraceDeps = {
  listAgents: () => (loadAgents() as unknown as LiteAgent[]).map(withWorkingDir),
  ensureIndex: async (agent, budgetMs) => {
    const have = loadIndex(agent.id)
    if (Date.now() - Date.parse(have.updatedAt) < STALE_MS) return { index: have, partial: false }
    return refreshAgentIndex(agent, { budgetMs })
  },
  git: runGit,
  hostId: () => getSelfHostId(),
  peers: () => getHosts().filter(h => h.url && h.enabled !== false && !isSelf(h.id)).map(h => ({ id: h.id, name: h.name, url: h.url })),
  fetchImpl: fetch,
  warm: (agents) => warmInBackground(agents),
}

let warming = false
/**
 * The first lookups on a host with many agents cannot read every transcript in one request. The rest is read in
 * the background, one agent at a time and one run at a time, so later lookups are fast.
 */
function warmInBackground(agents: LiteAgent[]): void {
  if (warming || agents.length === 0) return
  warming = true
  void (async () => {
    try {
      for (const agent of agents) {
        try { await defaultDeps.ensureIndex(agent, WARM_BUDGET_MS) } catch { /* the next lookup tries again */ }
      }
    } finally {
      warming = false
    }
  })()
}

/** An agent's directory is on the agent, or on its first session, or in its preferences: the project's one helper knows */
function withWorkingDir(a: LiteAgent): LiteAgent {
  return a.workingDirectory ? a : { ...a, workingDirectory: getAgentWorkingDir(a) }
}

/** Agents whose transcripts are Claude Code's. The others keep other formats this does not read. */
export function readsClaudeTranscripts(agent: { program?: string }): boolean {
  const p = (agent.program || '').toLowerCase()
  return !/codex|grok|copilot|\bpi\b|pi-agent|pi-coding/.test(p)
}

const agentName = (a: LiteAgent) => a.label || a.name || a.alias || a.id.slice(0, 8)

const toCommit = (c: CommitRecord): TraceCommit => ({
  sha: c.sha, subject: c.subject, branch: c.branch, ts: c.ts, repoDir: c.repoDir, line: c.line, via: c.via, command: c.command, evidence: c.evidence,
})
const toPr = (p: PrRecord): TracePr => ({ pr: p.pr, repo: p.repo, kind: p.kind, ts: p.ts, branch: p.branch, command: p.command })

/** Does a recorded sha (full, or an abbreviation) stand for the queried one (full, or at least 7 characters)? */
export function shaMatches(recorded: string | undefined, query: string): boolean {
  if (!recorded) return false
  const r = recorded.toLowerCase()
  const q = query.toLowerCase()
  return r.startsWith(q) || (r.length < q.length && q.startsWith(r))
}

/** Distinct commits among shas: an abbreviation that is the start of a longer one is the same commit */
export function distinctShas(shas: string[]): string[] {
  const unique = [...new Set(shas.map(s => s.toLowerCase()))]
  return unique.filter(s => !unique.some(o => o !== s && o.length > s.length && o.startsWith(s)))
}

/**
 * The commits of a session that led to the PR it opened. With the branch name (--head, or printed by a
 * commit) that is the commits on that branch; without it, the commits made in the same repository after
 * the previous PR of that repository in this session and up to opening this one. An approximation, and
 * the match says so by being "likely", not "exact".
 */
export function commitsBehindPr(opened: PrRecord | undefined, sessionPrs: PrRecord[], sessionCommits: CommitRecord[]): CommitRecord[] {
  if (!opened) return []
  if (opened.branch) {
    const onBranch = sessionCommits.filter(c => c.branch === opened.branch)
    if (onBranch.length > 0) return onBranch
  }
  const before = sessionPrs
    .filter(p => p !== opened && p.ts < opened.ts && sameRepository(p, opened))
    .map(p => p.ts)
    .sort()
    .pop() || ''
  // Follow-up pushes to the open PR count too, up to its merge, the next PR in the same repository, or 12 hours
  const limits = [new Date(Date.parse(opened.ts) + OPEN_PR_WINDOW_MS).toISOString()]
  for (const p of sessionPrs) {
    if (p === opened || p.ts <= opened.ts || !sameRepository(p, opened)) continue
    if ((p.kind === 'merge' && p.pr === opened.pr) || (p.kind === 'create' && p.pr !== opened.pr)) limits.push(p.ts)
  }
  const until = limits.filter(Boolean).sort()[0]
  const mine = (c: CommitRecord) => {
    if (c.ts > before && c.ts <= opened.ts) return sameRepository(c, opened)
    if (c.ts > opened.ts && c.ts <= until) return sameRepository(c, opened) && !(opened.branch && c.branch && opened.branch !== c.branch)
    return false
  }
  return dedupeBySha(sessionCommits.filter(mine))
}

/** Two records of the same commit in one session (a retry, a command run twice): keep the later one */
export function dedupeBySha(commits: CommitRecord[]): CommitRecord[] {
  const last = new Map<string, CommitRecord>()
  const noSha: CommitRecord[] = []
  for (const c of commits) {
    if (!c.sha) { noSha.push(c); continue }
    const prev = last.get(c.sha)
    if (!prev || prev.ts <= c.ts) last.set(c.sha, c)
  }
  return [...last.values(), ...noSha].sort((a, b) => (a.ts < b.ts ? -1 : 1))
}

const OPEN_PR_WINDOW_MS = 12 * 60 * 60 * 1000

/**
 * The pull requests a session opened for these commits, inferred (the commit does not say which PR it is
 * in): for each commit, the first PR the session opened in the same repository after it, else the latest
 * one opened in the same repository up to 12 hours before it that was not merged by then (a follow-up
 * push to an open PR). When both the commit and the PR name a branch, the branches must agree.
 */
export function prsAfterCommits(sessionPrs: PrRecord[], commits: CommitRecord[]): PrRecord[] {
  const creates = sessionPrs.filter(p => p.kind === 'create').sort((a, b) => (a.ts < b.ts ? -1 : 1))
  const numbers = new Set<number>()
  for (const c of commits) {
    const fits = (p: PrRecord) => sameRepository(c, p) && !(p.branch && c.branch && p.branch !== c.branch)
    const after = creates.find(p => p.ts >= c.ts && fits(p))
    if (after) { numbers.add(after.pr); continue }
    const at = Date.parse(c.ts)
    const before = [...creates].reverse().find(p => {
      if (p.ts >= c.ts || !fits(p)) return false
      if (Number.isFinite(at) && at - Date.parse(p.ts) > OPEN_PR_WINDOW_MS) return false
      return !sessionPrs.some(m => m.kind === 'merge' && m.pr === p.pr && m.ts < c.ts)
    })
    if (before) numbers.add(before.pr)
  }
  return sessionPrs.filter(p => numbers.has(p.pr))
}

interface Loaded { agent: LiteAgent; index: AgentCommitIndex }

async function loadAll(deps: TraceDeps): Promise<{ loaded: Loaded[]; partial: boolean }> {
  const started = Date.now()
  const loaded: Loaded[] = []
  let partial = false
  const unfinished: LiteAgent[] = []
  for (const agent of deps.listAgents().filter(readsClaudeTranscripts)) {
    const left = LOOKUP_BUDGET_MS - (Date.now() - started)
    if (left <= 0) {
      partial = true
      unfinished.push(agent)
      // Out of time: use what is already stored for the rest
      loaded.push({ agent, index: loadIndex(agent.id) })
      continue
    }
    try {
      const r = await deps.ensureIndex(agent, left)
      if (r.partial) { partial = true; unfinished.push(agent) }
      loaded.push({ agent, index: r.index })
    } catch {
      loaded.push({ agent, index: loadIndex(agent.id) })
    }
  }
  if (unfinished.length > 0) deps.warm?.(unfinished)
  return { loaded, partial }
}

/** The first line of a commit's message and its full id, asked of the repositories this host's agents work in */
async function describeCommit(query: string, loaded: Loaded[], deps: TraceDeps): Promise<{ sha: string; subject: string } | undefined> {
  const dirs: string[] = []
  const add = (d?: string | null) => { if (d && !dirs.includes(d)) dirs.push(d) }
  for (const { agent, index } of loaded) {
    add(agent.workingDirectory)
    for (const c of index.commits.slice(-50)) add(c.repoDir)
  }
  // A fleet has many working directories; asking git in a repository that lacks the commit is quick, so ask
  // in small parallel batches and take the first that knows it
  const probe = async (dir: string) => {
    const out = await deps.git(dir, ['show', '-s', '--format=%H%x09%s', `${query}^{commit}`])
    const row = out?.trim().split('\t')
    return row && row.length >= 2 && /^[0-9a-f]{40}$/.test(row[0]) ? { sha: row[0], subject: row.slice(1).join('\t').trim() } : undefined
  }
  const candidates = dirs.slice(0, MAX_REPOS_PROBED)
  for (let i = 0; i < candidates.length; i += PROBE_BATCH) {
    const found = (await Promise.all(candidates.slice(i, i + PROBE_BATCH).map(probe))).find(Boolean)
    if (found) return found
  }
  return undefined
}

/** This host's answer. Never forwards. */
export async function traceCommitLocal(
  query: string,
  opts: { pr?: number; repo?: string } = {},
  deps: TraceDeps = defaultDeps,
): Promise<ServiceResult<TraceResult>> {
  if (!isShaQuery(query)) return invalidField('sha', 'sha must be 7 to 40 hexadecimal characters')
  const q = query.toLowerCase()
  const { loaded, partial } = await loadAll(deps)
  const hostId = deps.hostId()
  const matches: TraceMatch[] = []
  const result: TraceResult = { query: q, shas: [], matches, unreachable: [], ...(partial ? { partial: true } : {}) }

  // 1. The session recorded this very commit
  const directShas: string[] = []
  for (const { agent, index } of loaded) {
    const bySession = new Map<string, CommitRecord[]>()
    for (const c of index.commits) {
      if (!shaMatches(c.sha, q)) continue
      directShas.push(c.sha as string)
      bySession.set(c.sessionId, [...(bySession.get(c.sessionId) || []), c])
    }
    for (const [sessionId, commits] of bySession) {
      const prs = prsAfterCommits(index.prs.filter(p => p.sessionId === sessionId), commits)
      matches.push({
        hostId, agentId: agent.id, agentName: agentName(agent), sessionId, via: 'sha', confidence: 'exact', role: 'committed',
        commits: commits.map(toCommit), prs: prs.map(toPr),
      })
    }
  }
  if (matches.length > 0) {
    result.shas = distinctShas(directShas)
    return { data: result, status: 200 }
  }

  // 2. A squash merge: the commit on main is new. Its subject ends "(#N)"; N links to the PR a session opened.
  const described = await describeCommit(q, loaded, deps)
  if (described) {
    result.shas = [described.sha]
    result.subject = described.subject
  }
  const pr = opts.pr ?? prNumberOfSubject(described?.subject)
  if (pr) result.pr = pr
  if (pr) {
    for (const { agent, index } of loaded) {
      const prs = index.prs.filter(p => p.pr === pr && (!opts.repo || !p.repo || p.repo === opts.repo))
      const sessions = [...new Set(prs.map(p => p.sessionId))]
      for (const sessionId of sessions) {
        const mine = prs.filter(p => p.sessionId === sessionId)
        const opened = mine.find(p => p.kind === 'create')
        const commits = commitsBehindPr(opened, index.prs.filter(p => p.sessionId === sessionId), index.commits.filter(c => c.sessionId === sessionId))
        matches.push({
          hostId, agentId: agent.id, agentName: agentName(agent), sessionId, via: 'pr', confidence: 'likely',
          role: opened ? 'opened' : 'merged', commits: commits.map(toCommit), prs: mine.map(toPr),
        })
      }
    }
    if (matches.length > 0) return { data: result, status: 200 }
  }

  // 3. The same first line of message (a rebase merge or a cherry-pick keeps it): weak, and said so
  const subject = described ? stripPrSuffix(described.subject) : undefined
  if (subject && subject.length >= 12) {
    for (const { agent, index } of loaded) {
      const bySession = new Map<string, CommitRecord[]>()
      for (const c of index.commits) {
        if (c.subject && stripPrSuffix(c.subject) === subject) bySession.set(c.sessionId, [...(bySession.get(c.sessionId) || []), c])
      }
      for (const [sessionId, commits] of bySession) {
        matches.push({
          hostId, agentId: agent.id, agentName: agentName(agent), sessionId, via: 'subject', confidence: 'weak', role: 'committed',
          commits: commits.map(toCommit), prs: [],
        })
      }
    }
  }
  return { data: result, status: 200 }
}

/** Every host's answer, merged. A host that cannot answer is named in `unreachable`. */
export async function traceCommit(
  query: string,
  opts: { local?: boolean; pr?: number; repo?: string } = {},
  deps: TraceDeps = defaultDeps,
): Promise<ServiceResult<TraceResult>> {
  if (!isShaQuery(query)) return invalidField('sha', 'sha must be 7 to 40 hexadecimal characters')
  if (opts.pr !== undefined && (!Number.isInteger(opts.pr) || opts.pr <= 0)) return invalidField('pr', 'pr must be a pull request number')
  if (opts.repo !== undefined && !/^[\w.-]+\/[\w.-]+$/.test(opts.repo)) return invalidField('repo', 'repo must be owner/name')

  const local = await traceCommitLocal(query, opts, deps)
  if (opts.local || local.status !== 200) return local
  const merged = local.data as TraceResult

  const q = new URLSearchParams({ local: '1' })
  if (opts.pr) q.set('pr', String(opts.pr))
  if (opts.repo) q.set('repo', opts.repo)
  const answers = await Promise.all(deps.peers().map(async (host) => {
    try {
      const res = await deps.fetchImpl(`${host.url.replace(/\/$/, '')}/api/commits/${encodeURIComponent(query)}?${q}`, { signal: AbortSignal.timeout(PEER_TIMEOUT_MS) })
      if (!res.ok) throw new Error(String(res.status))
      return { host, data: (await res.json()) as TraceResult }
    } catch {
      return { host, data: null }
    }
  }))

  const seen = new Set(merged.matches.map(m => `${m.hostId}|${m.agentId}|${m.sessionId}|${m.via}`))
  const shas = [...merged.shas]
  for (const { host, data } of answers) {
    if (!data || !Array.isArray(data.matches)) { merged.unreachable.push(host.name || host.id); continue }
    for (const m of data.matches) {
      const key = `${m.hostId}|${m.agentId}|${m.sessionId}|${m.via}`
      if (seen.has(key)) continue
      seen.add(key)
      merged.matches.push(m)
    }
    shas.push(...(data.shas || []))
    if (data.partial) merged.partial = true
    if (!merged.subject && data.subject) merged.subject = data.subject
    if (!merged.pr && data.pr) merged.pr = data.pr
  }
  merged.shas = distinctShas(shas)

  // An abbreviation that stands for two different commits is refused, with both named
  if (merged.shas.length > 1) {
    return serviceError('invalid_state', `"${merged.query}" stands for ${merged.shas.length} different commits; use more characters`, 409, {
      details: { candidates: merged.shas },
    })
  }
  // Prefer the strongest evidence first
  const rank = { exact: 0, likely: 1, weak: 2 }
  merged.matches.sort((a, b) => rank[a.confidence] - rank[b.confidence])
  // "Not found" only when every host answered and every transcript was read; otherwise it is "cannot say yet"
  if (merged.matches.length === 0 && merged.unreachable.length === 0 && !merged.partial) return notFound('A session that made this commit', merged.query)
  return { data: merged, status: 200 }
}

// ── One agent's commits ─────────────────────────────────────────────────────

export interface AgentCommitsResult {
  agentId: string
  hostId: string
  sessions: { sessionId: string; commits: number; prs: number; first: string; last: string }[]
  commits: TraceCommit[]
  prs: TracePr[]
  truncated?: boolean
  partial?: boolean
}

export async function getAgentCommits(
  agentId: string,
  opts: { session?: string; limit?: number } = {},
  deps: TraceDeps = defaultDeps,
  lookup: (id: string) => LiteAgent | null | undefined = (id) => {
    const a = getAgent(id) as unknown as LiteAgent | null
    return a ? withWorkingDir(a) : null
  },
  peerOf: (id: string) => Promise<string | undefined> = (id) => findPeerHostUrl(id),
): Promise<ServiceResult<AgentCommitsResult>> {
  if (opts.session !== undefined && !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(opts.session)) return invalidField('session', 'session must be a session id')
  const agent = lookup(agentId)
  if (!agent) {
    // The agent may live on another host: ask the one that owns it
    const peer = await peerOf(agentId).catch(() => undefined)
    if (!peer) return notFound('Agent', agentId)
    try {
      const q = new URLSearchParams()
      if (opts.session) q.set('session', opts.session)
      if (opts.limit) q.set('limit', String(opts.limit))
      const res = await deps.fetchImpl(`${peer.replace(/\/$/, '')}/api/agents/${encodeURIComponent(agentId)}/commits?${q}`, { signal: AbortSignal.timeout(PEER_TIMEOUT_MS * 2) })
      const data = await res.json().catch(() => ({}))
      return { data, status: res.status }
    } catch {
      return serviceError('timeout', 'The host this agent lives on did not answer', 504)
    }
  }
  if (!readsClaudeTranscripts(agent)) {
    return invalidRequest('Only Claude Code sessions are traced; this agent runs another program')
  }

  const { index, partial } = await deps.ensureIndex(agent, LOOKUP_BUDGET_MS)
  const limit = Math.min(Math.max(opts.limit || MAX_COMMITS_LISTED, 1), 1000)
  const inSession = <T extends { sessionId: string }>(r: T) => !opts.session || r.sessionId === opts.session
  const commits = index.commits.filter(inSession)
  const prs = index.prs.filter(inSession)

  const bySession = new Map<string, { commits: number; prs: number; first: string; last: string }>()
  const touch = (sessionId: string, ts: string, kind: 'commits' | 'prs') => {
    const s = bySession.get(sessionId) || { commits: 0, prs: 0, first: ts, last: ts }
    s[kind]++
    if (ts && ts < s.first) s.first = ts
    if (ts && ts > s.last) s.last = ts
    bySession.set(sessionId, s)
  }
  for (const c of commits) touch(c.sessionId, c.ts, 'commits')
  for (const p of prs) touch(p.sessionId, p.ts, 'prs')

  const newest = [...commits].sort((a, b) => (a.ts < b.ts ? 1 : -1))
  return {
    data: {
      agentId,
      hostId: deps.hostId(),
      sessions: [...bySession.entries()].map(([sessionId, s]) => ({ sessionId, ...s })).sort((a, b) => (a.last < b.last ? 1 : -1)),
      commits: newest.slice(0, limit).map(toCommit),
      prs: [...prs].sort((a, b) => (a.ts < b.ts ? 1 : -1)).map(toPr),
      ...(newest.length > limit ? { truncated: true } : {}),
      ...(partial ? { partial: true } : {}),
    },
    status: 200,
  }
}
