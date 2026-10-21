import { describe, it, expect, vi } from 'vitest'

// The service reads the registry, hosts and the owning-host probe only through its default dependencies;
// these tests pass their own, so the modules are stubbed out of the way.
vi.mock('@/lib/agent-registry', () => ({ getAgent: () => null, loadAgents: () => [] }))
vi.mock('@/lib/hosts-config', () => ({ getHosts: () => [], getSelfHostId: () => 'self', isSelf: () => true }))
vi.mock('@/lib/owning-host', () => ({ findPeerHostUrl: async () => undefined }))

import {
  traceCommit, traceCommitLocal, getAgentCommits, shaMatches, distinctShas, commitsBehindPr, prsAfterCommits,
  type TraceDeps, type LiteAgent, type TraceResult,
} from '@/services/commit-trace-service'
import type { AgentCommitIndex } from '@/lib/commit-index'
import type { CommitRecord, PrRecord } from '@/lib/commit-trace'

const A40 = 'a1b2c3d' + '0'.repeat(33)
const B40 = 'a1b2c3d' + '9'.repeat(33)
const MAIN40 = 'f'.repeat(40)

const commit = (over: Partial<CommitRecord>): CommitRecord => ({
  sessionId: 's1', ts: '2026-10-20T10:00:00.000Z', line: 10, command: 'git commit', evidence: 'ok', via: 'output', ...over,
})
const pr = (over: Partial<PrRecord>): PrRecord => ({
  sessionId: 's1', ts: '2026-10-20T10:30:00.000Z', line: 20, pr: 528, kind: 'create', command: 'gh pr create', evidence: '', ...over,
})
const index = (agentId: string, commits: CommitRecord[], prs: PrRecord[] = []): AgentCommitIndex => ({
  version: 1, agentId, updatedAt: new Date().toISOString(), files: {}, commits, prs,
})

function deps(over: Partial<TraceDeps> & { indexes?: Record<string, AgentCommitIndex>; agents?: LiteAgent[] } = {}): TraceDeps {
  const agents = over.agents || [{ id: 'ag1', name: 'dev', program: 'Claude Code', workingDirectory: '/work/app' }]
  return {
    listAgents: () => agents,
    ensureIndex: async (a) => ({ index: over.indexes?.[a.id] || index(a.id, []), partial: false }),
    git: async () => null,
    hostId: () => 'self',
    peers: () => [],
    fetchImpl: (async () => { throw new Error('no network in this test') }) as unknown as typeof fetch,
    ...over,
  }
}

const data = (r: { data?: unknown }) => r.data as TraceResult

describe('matching a recorded sha', () => {
  it('an abbreviation stands for a longer sha either way round', () => {
    expect(shaMatches(A40, 'a1b2c3d')).toBe(true)
    expect(shaMatches('a1b2c3d', A40)).toBe(true)
    expect(shaMatches('a1b2c3d', 'a1b2c3e')).toBe(false)
    expect(shaMatches(undefined, 'a1b2c3d')).toBe(false)
  })
  it('distinct commits: an abbreviation of a listed sha is the same commit', () => {
    expect(distinctShas(['a1b2c3d', A40, A40.toUpperCase()])).toEqual([A40])
    expect(distinctShas([A40, B40])).toHaveLength(2)
  })
})

describe('asking for a commit', () => {
  it('refuses anything that is not 7 to 40 hex characters', async () => {
    for (const bad of ['abc', 'zzzzzzz', '../../x', 'abc1234 ; rm', 'a'.repeat(41)]) {
      const r = await traceCommit(bad, {}, deps())
      expect(r.status).toBe(400)
    }
    expect((await traceCommit('abc1234', { pr: -3 }, deps())).status).toBe(400)
    expect((await traceCommit('abc1234', { repo: 'not a repo' }, deps())).status).toBe(400)
  })

  it('finds the session that recorded the commit, by full sha and by prefix, with the evidence', async () => {
    const d = deps({ indexes: { ag1: index('ag1', [commit({ sha: A40, subject: 'feat: one', branch: 'feat/x', evidence: '[feat/x a1b2c3d] feat: one' })], [pr({ branch: 'feat/x' })]) } })
    for (const q of [A40, 'a1b2c3d', 'A1B2C3D']) {
      const r = await traceCommit(q, {}, d)
      expect(r.status).toBe(200)
      expect(data(r).shas).toEqual([A40])
      expect(data(r).matches).toHaveLength(1)
      expect(data(r).matches[0]).toMatchObject({ hostId: 'self', agentId: 'ag1', agentName: 'dev', sessionId: 's1', via: 'sha', confidence: 'exact' })
      expect(data(r).matches[0].commits[0].evidence).toContain('feat: one')
      expect(data(r).matches[0].prs.map(p => p.pr)).toEqual([528]) // the PR the session opened from that branch
    }
  })

  it('answers 404 when no session is known to have made it', async () => {
    const r = await traceCommit('abc1234', {}, deps())
    expect(r.status).toBe(404)
  })

  it('does not say "not found" when it could not read every transcript: 200, empty, partial', async () => {
    const d = deps({ ensureIndex: async (a) => ({ index: index(a.id, []), partial: true }) })
    const r = await traceCommit('abc1234', {}, d)
    expect(r.status).toBe(200)
    expect(data(r).matches).toEqual([])
    expect(data(r).partial).toBe(true)
  })

  it('hands the agents it could not finish to the background, and only those', async () => {
    const warm = vi.fn()
    const agents: LiteAgent[] = [{ id: 'done', name: 'done' }, { id: 'slow', name: 'slow' }]
    const ensureIndex = async (a: LiteAgent) => ({ index: index(a.id, []), partial: a.id === 'slow' })
    await traceCommit('abc1234', {}, deps({ agents, ensureIndex, warm }))
    expect(warm).toHaveBeenCalledTimes(1)
    expect((warm.mock.calls[0][0] as LiteAgent[]).map(a => a.id)).toEqual(['slow'])
    warm.mockClear()
    await traceCommit('abc1234', {}, deps({ agents: [{ id: 'done', name: 'done' }], ensureIndex, warm }))
    expect(warm).not.toHaveBeenCalled()
  })

  it('in a fleet of many working directories it still finds the repository that has the commit (squash path)', async () => {
    const agents: LiteAgent[] = Array.from({ length: 40 }, (_, i) => ({ id: `ag${i}`, name: `agent-${i}`, program: 'Claude Code', workingDirectory: `/work/other-${i}` }))
    agents.push({ id: 'dev', name: 'dev', program: 'Claude Code', workingDirectory: '/work/app' })
    const asked: string[] = []
    const git = async (dir: string, args: string[]) => { asked.push(dir); return args[0] === 'show' && dir === '/work/app' ? `${MAIN40}\tfeat: x (#528)\n` : null }
    const indexes: Record<string, AgentCommitIndex> = { dev: index('dev', [commit({ sha: 'c'.repeat(40), branch: 'feat/x' })], [pr({ pr: 528, branch: 'feat/x' })]) }
    const r = await traceCommit('ffffffff', {}, deps({ agents, git, indexes }))
    expect(r.status).toBe(200)
    expect(data(r).matches.map(m => m.agentId)).toEqual(['dev'])
    expect(asked).toContain('/work/app')
  })

  it('refuses an abbreviation that stands for two different commits, naming both', async () => {
    const d = deps({
      agents: [{ id: 'ag1', name: 'dev' }, { id: 'ag2', name: 'ops' }],
      indexes: { ag1: index('ag1', [commit({ sha: A40 })]), ag2: index('ag2', [commit({ sha: B40, sessionId: 's2' })]) },
    })
    const r = await traceCommit('a1b2c3d', {}, d)
    expect(r.status).toBe(409)
    expect((r.data as { details: { candidates: string[] } }).details.candidates.sort()).toEqual([A40, B40].sort())
    // ...and a longer prefix is fine
    expect((await traceCommit(A40, {}, d)).status).toBe(200)
  })

  it('does not read the transcripts of agents that run another program', async () => {
    const ensure = vi.fn(async (a: LiteAgent) => ({ index: index(a.id, []), partial: false }))
    await traceCommit('abc1234', {}, deps({ agents: [{ id: 'cx', name: 'codex-agent', program: 'codex' }, { id: 'cl', name: 'claude-agent', program: 'Claude Code' }], ensureIndex: ensure }))
    expect(ensure.mock.calls.map(c => c[0].id)).toEqual(['cl'])
  })

  it('reports partial when a transcript could not be read in the time allowed', async () => {
    const d = deps({ ensureIndex: async (a) => ({ index: index(a.id, [commit({ sha: A40 })]), partial: true }) })
    expect(data(await traceCommit(A40, {}, d)).partial).toBe(true)
  })
})

describe('a squash merge', () => {
  const sessionCommits = [
    commit({ sha: 'c'.repeat(40), subject: 'feat: first step', branch: 'feat/x', ts: '2026-10-20T10:00:00.000Z' }),
    commit({ sha: 'd'.repeat(40), subject: 'feat: second step', branch: 'feat/x', ts: '2026-10-20T10:10:00.000Z' }),
    commit({ sha: 'e'.repeat(40), subject: 'unrelated work', branch: 'other', ts: '2026-10-20T11:00:00.000Z' }),
  ]
  const prs = [pr({ pr: 528, branch: 'feat/x', ts: '2026-10-20T10:20:00.000Z' }), pr({ pr: 528, kind: 'merge', sessionId: 's2', ts: '2026-10-20T12:00:00.000Z' })]
  const squashGit = async (_dir: string, args: string[]) => (args[0] === 'show' ? `${MAIN40}\tfeat: add the thing (#528)\n` : null)

  it('reaches the session that opened the PR, with the branch commits it made, through "(#NNN)" in the subject', async () => {
    const d = deps({ git: squashGit, indexes: { ag1: index('ag1', sessionCommits, prs) } })
    const r = await traceCommit('ffffffff', {}, d)
    expect(r.status).toBe(200)
    expect(data(r)).toMatchObject({ shas: [MAIN40], pr: 528, subject: 'feat: add the thing (#528)' })
    const opened = data(r).matches.find(m => m.sessionId === 's1')!
    expect(opened).toMatchObject({ via: 'pr', confidence: 'likely', role: 'opened' })
    expect(opened.commits.map(c => c.subject)).toEqual(['feat: first step', 'feat: second step'])
    const merged = data(r).matches.find(m => m.sessionId === 's2')!
    expect(merged).toMatchObject({ via: 'pr', role: 'merged' })
  })

  it('takes the PR number from the caller when git cannot say what the commit is', async () => {
    const d = deps({ indexes: { ag1: index('ag1', sessionCommits, prs) } })
    const r = await traceCommit('ffffffff', { pr: 528 }, d)
    expect(data(r).matches.map(m => m.via)).toEqual(['pr', 'pr'])
    expect((await traceCommit('ffffffff', { pr: 999 }, d)).status).toBe(404)
  })

  it('narrows the PR to a repository when asked', async () => {
    const d = deps({ git: squashGit, indexes: { ag1: index('ag1', sessionCommits, [pr({ repo: 'acme/app', branch: 'feat/x' }), pr({ repo: 'acme/other', sessionId: 's9' })]) } })
    const r = await traceCommit('ffffffff', { repo: 'acme/app' }, d)
    expect(data(r).matches.map(m => m.sessionId)).toEqual(['s1'])
  })

  it('falls back to the same first line of message, and calls it weak (a rebase merge keeps the subject)', async () => {
    const rebaseGit = async (_d: string, args: string[]) => (args[0] === 'show' ? `${MAIN40}\tfeat: second step\n` : null)
    const d = deps({ git: rebaseGit, indexes: { ag1: index('ag1', sessionCommits, []) } })
    const r = await traceCommit('ffffffff', {}, d)
    expect(data(r).matches).toHaveLength(1)
    expect(data(r).matches[0]).toMatchObject({ via: 'subject', confidence: 'weak', sessionId: 's1' })
    expect(data(r).matches[0].commits.map(c => c.subject)).toEqual(['feat: second step'])
  })

  it('does not match a very short subject by text alone', async () => {
    const g = async (_d: string, args: string[]) => (args[0] === 'show' ? `${MAIN40}\tfix typo\n` : null)
    const d = deps({ git: g, indexes: { ag1: index('ag1', [commit({ sha: A40, subject: 'fix typo' })], []) } })
    expect((await traceCommit('ffffffff', {}, d)).status).toBe(404)
  })

  it('links the commits to a PR without a branch name by repository and time', () => {
    const opened = pr({ branch: undefined, repoDir: '/r', ts: '2026-10-20T10:20:00.000Z' })
    const earlier = pr({ pr: 500, branch: undefined, repoDir: '/r', ts: '2026-10-20T09:00:00.000Z' })
    const cs = [
      commit({ sha: '1'.repeat(40), repoDir: '/r', ts: '2026-10-20T08:00:00.000Z' }), // belongs to the earlier PR
      commit({ sha: '2'.repeat(40), repoDir: '/r', ts: '2026-10-20T10:00:00.000Z' }),
      commit({ sha: '3'.repeat(40), repoDir: '/elsewhere', ts: '2026-10-20T10:05:00.000Z' }),
      commit({ sha: '4'.repeat(40), repoDir: '/r', ts: '2026-10-20T10:30:00.000Z' }), // a follow-up push to the open PR
      commit({ sha: '5'.repeat(40), repoDir: '/r', ts: '2026-10-20T11:30:00.000Z' }), // after the PR was merged
    ]
    const merged = pr({ pr: 528, kind: 'merge', branch: undefined, repoDir: '/r', ts: '2026-10-20T11:00:00.000Z' })
    expect(commitsBehindPr(opened, [opened, earlier, merged], cs).map(c => c.sha)).toEqual(['2'.repeat(40), '4'.repeat(40)])
    expect(commitsBehindPr(undefined, [], cs)).toEqual([])
  })

  it('follow-up commits stop at the next PR opened in the same repository', () => {
    const first = pr({ pr: 1, branch: undefined, repoDir: '/r', ts: '2026-10-20T10:00:00.000Z' })
    const second = pr({ pr: 2, branch: undefined, repoDir: '/r', ts: '2026-10-20T10:40:00.000Z' })
    const cs = [
      commit({ sha: 'a'.repeat(40), repoDir: '/r', ts: '2026-10-20T10:20:00.000Z' }),
      commit({ sha: 'b'.repeat(40), repoDir: '/r', ts: '2026-10-20T10:50:00.000Z' }),
    ]
    expect(commitsBehindPr(first, [first, second], cs).map(c => c.sha)).toEqual(['a'.repeat(40)])
  })

  it('a follow-up on another branch is not taken for this PR when both branches are named', () => {
    const open = pr({ pr: 1, branch: 'feat/x', repoDir: '/r', ts: '2026-10-20T10:00:00.000Z' })
    const cs = [commit({ sha: 'a'.repeat(40), repoDir: '/r', branch: 'other', ts: '2026-10-20T10:20:00.000Z' })]
    expect(commitsBehindPr(open, [open], cs)).toEqual([])
  })

  it('names the PR a session opened after a commit, by branch or by repository', () => {
    const c = commit({ sha: A40, repoDir: '/r', branch: undefined, ts: '2026-10-20T10:00:00.000Z' })
    const a = pr({ pr: 1, repoDir: '/r', branch: undefined, ts: '2026-10-20T10:10:00.000Z' })
    const b = pr({ pr: 2, repoDir: '/other', branch: undefined, ts: '2026-10-20T10:20:00.000Z' })
    const early = pr({ pr: 3, repoDir: '/r', branch: undefined, ts: '2026-10-20T09:00:00.000Z' })
    expect(prsAfterCommits([early, a, b], [c]).map(p => p.pr)).toEqual([1])
  })

  it('a follow-up commit after the PR was opened belongs to that PR while it is still open', () => {
    const open = pr({ pr: 82, repoDir: '/r', branch: 'feat/x', ts: '2026-10-20T10:00:00.000Z' })
    const followUp = commit({ sha: A40, repoDir: '/r', branch: undefined, ts: '2026-10-20T11:30:00.000Z' })
    expect(prsAfterCommits([open], [followUp]).map(p => p.pr)).toEqual([82])
    // merged before the commit: the commit is something else
    const merged = pr({ pr: 82, kind: 'merge', repoDir: '/r', branch: undefined, ts: '2026-10-20T11:00:00.000Z' })
    expect(prsAfterCommits([open, merged], [followUp])).toEqual([])
    // opened more than 12 hours earlier: too far to say
    const old = commit({ sha: B40, repoDir: '/r', ts: '2026-10-21T00:30:00.000Z' })
    expect(prsAfterCommits([open], [old])).toEqual([])
  })

  it('when the commit and the PR both name a branch, they must be the same branch', () => {
    const open = pr({ pr: 5, repoDir: '/r', branch: 'feat/x', ts: '2026-10-20T10:00:00.000Z' })
    expect(prsAfterCommits([open], [commit({ sha: A40, repoDir: '/r', branch: 'other', ts: '2026-10-20T10:30:00.000Z' })])).toEqual([])
    expect(prsAfterCommits([open], [commit({ sha: A40, repoDir: '/r', branch: 'feat/x', ts: '2026-10-20T10:30:00.000Z' })]).map(p => p.pr)).toEqual([5])
  })

  it('a PR opened with -R from another directory is matched by the GitHub name of the repository', () => {
    const open = pr({ pr: 82, repoDir: '/app-checkout', repoSlug: 'acme/plugins', repo: 'acme/plugins', branch: 'feat/x', ts: '2026-10-20T10:00:00.000Z' })
    const inPlugins = commit({ sha: A40, repoDir: '/app-checkout/plugin', repoSlug: 'Acme/Plugins', ts: '2026-10-20T10:30:00.000Z' })
    const inApp = commit({ sha: B40, repoDir: '/app-checkout', repoSlug: 'acme/app', ts: '2026-10-20T10:30:00.000Z' })
    expect(prsAfterCommits([open], [inPlugins]).map(p => p.pr)).toEqual([82])
    expect(prsAfterCommits([open], [inApp])).toEqual([])
  })

  it('a worktree and its main checkout are the same repository (same git directory), a submodule is not', () => {
    const open = pr({ pr: 9, repoDir: '/main', repoKey: '/main/.git', ts: '2026-10-20T10:00:00.000Z' })
    const inWorktree = commit({ sha: A40, repoDir: '/gone/worktree', repoKey: '/main/.git', ts: '2026-10-20T10:30:00.000Z' })
    const inSubmodule = commit({ sha: B40, repoDir: '/main/plugin', repoKey: '/main/.git/modules/plugin', ts: '2026-10-20T10:30:00.000Z' })
    expect(prsAfterCommits([open], [inWorktree]).map(p => p.pr)).toEqual([9])
    expect(prsAfterCommits([open], [inSubmodule])).toEqual([])
  })
})

describe('asking every host', () => {
  const peers = [{ id: 'mini', name: 'mac-mini', url: 'http://mini:23000' }, { id: 'lola', name: 'mini-lola', url: 'http://lola:23000/' }]
  const peerMatch = (hostId: string, agentId: string): TraceResult => ({
    query: 'a1b2c3d', shas: [A40], unreachable: [],
    matches: [{ hostId, agentId, agentName: agentId, sessionId: 'sp', via: 'sha', confidence: 'exact', role: 'committed', commits: [], prs: [] }],
  })

  it('asks each peer with local=1 (so a peer does not ask the others) and merges what they say', async () => {
    const urls: string[] = []
    const fetchImpl = (async (url: string) => {
      urls.push(url)
      return { ok: true, status: 200, json: async () => (url.startsWith('http://mini') ? peerMatch('mini', 'remote-agent') : { query: 'a1b2c3d', shas: [], matches: [], unreachable: [] }) }
    }) as unknown as typeof fetch
    const d = deps({ peers: () => peers, fetchImpl, indexes: { ag1: index('ag1', [commit({ sha: A40 })]) } })
    const r = await traceCommit('a1b2c3d', {}, d)
    expect(urls.sort()).toEqual(['http://lola:23000/api/commits/a1b2c3d?local=1', 'http://mini:23000/api/commits/a1b2c3d?local=1'])
    expect(data(r).matches.map(m => m.hostId).sort()).toEqual(['mini', 'self'])
    expect(data(r).unreachable).toEqual([])
    expect(data(r).shas).toEqual([A40])
  })

  it('passes pr and repo on to the peers', async () => {
    const urls: string[] = []
    const fetchImpl = (async (url: string) => { urls.push(url); return { ok: true, status: 200, json: async () => ({ query: 'x', shas: [], matches: [], unreachable: [] }) } }) as unknown as typeof fetch
    await traceCommit('a1b2c3d', { pr: 528, repo: 'acme/app' }, deps({ peers: () => [peers[0]], fetchImpl, indexes: { ag1: index('ag1', [commit({ sha: A40 })]) } }))
    expect(urls[0]).toContain('pr=528')
    expect(urls[0]).toContain('repo=acme%2Fapp')
  })

  it('the same commit made on two hosts is listed on both, and is not "ambiguous"', async () => {
    const fetchImpl = (async () => ({ ok: true, status: 200, json: async () => peerMatch('mini', 'remote-agent') })) as unknown as typeof fetch
    const d = deps({ peers: () => [peers[0]], fetchImpl, indexes: { ag1: index('ag1', [commit({ sha: A40 })]) } })
    const r = await traceCommit(A40, {}, d)
    expect(r.status).toBe(200)
    expect(data(r).matches.map(m => `${m.hostId}/${m.agentId}`).sort()).toEqual(['mini/remote-agent', 'self/ag1'])
    expect(data(r).shas).toEqual([A40])
  })

  it('lists a host that is down, and still answers with the rest', async () => {
    const fetchImpl = (async (url: string) => {
      if (url.startsWith('http://lola')) throw new Error('fetch failed')
      return { ok: true, status: 200, json: async () => ({ query: 'a1b2c3d', shas: [], matches: [], unreachable: [] }) }
    }) as unknown as typeof fetch
    const d = deps({ peers: () => peers, fetchImpl, indexes: { ag1: index('ag1', [commit({ sha: A40 })]) } })
    const r = await traceCommit('a1b2c3d', {}, d)
    expect(r.status).toBe(200)
    expect(data(r).unreachable).toEqual(['mini-lola'])
    expect(data(r).matches).toHaveLength(1)
  })

  it('a host answering an error counts as unreachable, and with nothing found it is 200 (cannot say), not 404', async () => {
    const fetchImpl = (async () => ({ ok: false, status: 500, json: async () => ({}) })) as unknown as typeof fetch
    const r = await traceCommit('a1b2c3d', {}, deps({ peers: () => [peers[0]], fetchImpl }))
    expect(r.status).toBe(200)
    expect(data(r).unreachable).toEqual(['mac-mini'])
    expect(data(r).matches).toEqual([])
  })

  it('an abbreviation that two hosts resolve to different commits is refused', async () => {
    const fetchImpl = (async () => ({ ok: true, status: 200, json: async () => ({ ...peerMatch('mini', 'remote-agent'), shas: [B40] }) })) as unknown as typeof fetch
    const r = await traceCommit('a1b2c3d', {}, deps({ peers: () => [peers[0]], fetchImpl, indexes: { ag1: index('ag1', [commit({ sha: A40 })]) } }))
    expect(r.status).toBe(409)
  })

  it('local=1 never asks a peer', async () => {
    const fetchImpl = vi.fn()
    const r = await traceCommit('a1b2c3d', { local: true }, deps({ peers: () => peers, fetchImpl: fetchImpl as unknown as typeof fetch, indexes: { ag1: index('ag1', [commit({ sha: A40 })]) } }))
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(r.status).toBe(200)
  })

  it('this host\'s own answer is the same function the peers run (traceCommitLocal never forwards)', async () => {
    const fetchImpl = vi.fn()
    await traceCommitLocal('a1b2c3d', {}, deps({ peers: () => peers, fetchImpl: fetchImpl as unknown as typeof fetch }))
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe('one agent\'s commits', () => {
  const idx = index('ag1', [
    commit({ sha: A40, sessionId: 's1', ts: '2026-10-20T10:00:00.000Z', subject: 'one' }),
    commit({ sha: B40, sessionId: 's2', ts: '2026-10-20T12:00:00.000Z', subject: 'two' }),
    commit({ sha: MAIN40, sessionId: 's2', ts: '2026-10-20T13:00:00.000Z', subject: 'three' }),
  ], [pr({ sessionId: 's2', ts: '2026-10-20T13:10:00.000Z' })])
  const agent: LiteAgent = { id: 'ag1', name: 'dev', program: 'Claude Code', workingDirectory: '/work/app' }
  const lookup = (id: string) => (id === 'ag1' ? agent : null)

  it('lists commits newest first and the sessions they belong to', async () => {
    const r = await getAgentCommits('ag1', {}, deps({ indexes: { ag1: idx } }), lookup)
    expect(r.status).toBe(200)
    const d = r.data as { commits: { subject: string }[]; sessions: { sessionId: string; commits: number; prs: number }[]; hostId: string }
    expect(d.commits.map(c => c.subject)).toEqual(['three', 'two', 'one'])
    expect(d.sessions.map(s => [s.sessionId, s.commits, s.prs])).toEqual([['s2', 2, 1], ['s1', 1, 0]])
    expect(d.hostId).toBe('self')
  })

  it('narrows to one session, limits the list, and refuses a hostile session id', async () => {
    const one = await getAgentCommits('ag1', { session: 's2' }, deps({ indexes: { ag1: idx } }), lookup)
    expect((one.data as { commits: unknown[] }).commits).toHaveLength(2)
    const limited = await getAgentCommits('ag1', { limit: 1 }, deps({ indexes: { ag1: idx } }), lookup)
    expect((limited.data as { commits: unknown[]; truncated?: boolean }).commits).toHaveLength(1)
    expect((limited.data as { truncated?: boolean }).truncated).toBe(true)
    expect((await getAgentCommits('ag1', { session: '../../x' }, deps(), lookup)).status).toBe(400)
  })

  it('asks the owning host for an agent that lives on another one', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ agentId: 'far', hostId: 'mini', sessions: [], commits: [], prs: [] }) }))
    const r = await getAgentCommits('far', { session: 's9' }, deps({ fetchImpl: fetchImpl as unknown as typeof fetch }), lookup, async () => 'http://mini:23000/')
    expect(r.status).toBe(200)
    expect((r.data as { hostId: string }).hostId).toBe('mini')
    expect((fetchImpl.mock.calls[0] as unknown as [string])[0]).toBe('http://mini:23000/api/agents/far/commits?session=s9')
  })

  it('is 404 for an agent no host has, and 504 when the owning host does not answer', async () => {
    expect((await getAgentCommits('nobody', {}, deps(), lookup, async () => undefined)).status).toBe(404)
    const down = (async () => { throw new Error('fetch failed') }) as unknown as typeof fetch
    expect((await getAgentCommits('far', {}, deps({ fetchImpl: down }), lookup, async () => 'http://mini:23000')).status).toBe(504)
  })

  it('says plainly that an agent on another program is not traced', async () => {
    const codex: LiteAgent = { id: 'cx', name: 'cx', program: 'codex' }
    const r = await getAgentCommits('cx', {}, deps(), () => codex)
    expect(r.status).toBe(400)
  })
})
