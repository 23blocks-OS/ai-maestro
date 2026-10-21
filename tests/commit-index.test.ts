import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { listClaudeTranscripts, refreshAgentIndex, resolveCommitShas, indexFilePath, loadIndex, type GitRunner } from '@/lib/commit-index'
import type { CommitRecord } from '@/lib/commit-trace'

let home: string
beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'commit-index-'))
  vi.stubEnv('HOME', home)
})
afterEach(() => {
  vi.unstubAllEnvs()
  fs.rmSync(home, { recursive: true, force: true })
})

const SHA_A = 'a'.repeat(40)
const SHA_B = 'b'.repeat(40)

const enc = (d: string) => d.replace(/[/_.]/g, '-')
const call = (id: string, command: string, ts: string, cwd: string) =>
  JSON.stringify({ type: 'assistant', timestamp: ts, cwd, message: { content: [{ type: 'tool_use', id, name: 'Bash', input: { command } }] } })
const result = (id: string, text: string, ts: string) =>
  JSON.stringify({ type: 'user', timestamp: ts, message: { content: [{ type: 'tool_result', tool_use_id: id, content: text }] } })

/** A Claude project folder for a working directory, with one transcript in it */
function transcript(workingDir: string, session: string, lines: string[], cwd = workingDir): string {
  const dir = path.join(home, '.claude', 'projects', enc(workingDir))
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, `${session}.jsonl`)
  fs.writeFileSync(file, [JSON.stringify({ type: 'user', cwd, sessionId: session, message: { content: 'hi' } }), ...lines].join('\n') + '\n')
  return file
}

const noGit: GitRunner = async () => null

describe('finding an agent\'s transcripts', () => {
  it('takes the project folder of its working directory and of directories below it, by the cwd they were written in', () => {
    transcript('/work/app', 's-main', [])
    transcript('/work/app/.claude/worktrees/x', 's-worktree', [], '/work/app/.claude/worktrees/x')
    const found = listClaudeTranscripts('/work/app', home).map(t => t.sessionId).sort()
    expect(found).toEqual(['s-main', 's-worktree'])
  })

  it('does not take a sibling directory whose folder name only starts the same way', () => {
    transcript('/work/app', 's-main', [])
    transcript('/work/app-other', 's-sibling', [])
    expect(listClaudeTranscripts('/work/app', home).map(t => t.sessionId)).toEqual(['s-main'])
  })

  it('finds nothing for no working directory or no projects folder', () => {
    expect(listClaudeTranscripts(null, home)).toEqual([])
    expect(listClaudeTranscripts('/nowhere', home)).toEqual([])
  })
})

describe('resolving shas with git', () => {
  const rec = (over: Partial<CommitRecord>): CommitRecord => ({
    sessionId: 's', ts: '2026-10-20T10:00:10.000Z', startedAt: '2026-10-20T10:00:00.000Z', line: 1, command: 'c', evidence: '', via: 'unresolved', ...over,
  })

  it('turns an abbreviation git printed into the full sha', async () => {
    const git: GitRunner = async (dir, args) => (args[0] === 'rev-parse' && args[3] === 'abc1234^{commit}' ? `${SHA_A}\n` : null)
    const [r] = await resolveCommitShas([rec({ sha: 'abc1234', via: 'output', repoDir: '/work/app' })], [], git)
    expect(r.sha).toBe(SHA_A)
    expect(r.via).toBe('output')
  })

  it('finds a quiet commit by its subject in the time window, and uses argv only', async () => {
    const calls: string[][] = []
    const git: GitRunner = async (dir, args) => {
      calls.push([dir, ...args])
      return `${SHA_B}\t1792490405\tfix: quiet one\n${SHA_A}\t1792490000\tsomething else\n`
    }
    const [r] = await resolveCommitShas([rec({ subject: 'fix: quiet one', repoDir: '/work/app' })], [], git)
    expect(r.sha).toBe(SHA_B)
    expect(r.via).toBe('git-log')
    expect(calls[0].slice(0, 3)).toEqual(['/work/app', 'log', '--all'])
    expect(calls[0].some(a => a.startsWith('--since=2026-10-20T09:59:00'))).toBe(true)
  })

  it('does not guess without a subject unless exactly one commit sits in the window', async () => {
    const t = Date.parse('2026-10-20T10:00:00.000Z') / 1000
    const two: GitRunner = async () => `${SHA_A}\t${t}\tx\n${SHA_B}\t${t + 1}\ty\n`
    expect((await resolveCommitShas([rec({ repoDir: '/w' })], [], two))[0].sha).toBeUndefined()
    const one: GitRunner = async () => `${SHA_A}\t${t}\tx\n`
    expect((await resolveCommitShas([rec({ repoDir: '/w' })], [], one))[0].sha).toBe(SHA_A)
  })

  it('looks in the fallback directories when the commit\'s own directory is gone', async () => {
    const asked: string[] = []
    const git: GitRunner = async (dir) => { asked.push(dir); return dir === '/work/app' ? `${SHA_A}\t1792490405\tfix: later\n` : null }
    const [r] = await resolveCommitShas([rec({ subject: 'fix: later', repoDir: '/removed/worktree' })], ['/work/app'], git)
    expect(asked).toEqual(['/removed/worktree', '/work/app'])
    expect(r.sha).toBe(SHA_A)
  })

  it('leaves a record unresolved when nothing matches', async () => {
    const git: GitRunner = async () => `${SHA_A}\t1792490405\tsome other subject\n`
    const [r] = await resolveCommitShas([rec({ subject: 'fix: not there', repoDir: '/w' })], [], git)
    expect(r.sha).toBeUndefined()
    expect(r.via).toBe('unresolved')
  })
})

describe('the per-agent index', () => {
  const agent = { id: 'agent-1', workingDirectory: '/work/app' }

  it('lives in the agent\'s own directory and refuses an unsafe id', () => {
    expect(indexFilePath('agent-1')).toBe(path.join(home, '.aimaestro', 'agents', 'agent-1', 'commits.json'))
    expect(() => indexFilePath('../../etc')).toThrow()
    expect(() => indexFilePath('a/b')).toThrow()
  })

  it('reads a transcript, stores the commits and PRs, and reads only what is new next time', async () => {
    const file = transcript('/work/app', 's1', [
      call('c1', 'git commit -m "feat: one"', '2026-10-20T10:00:00.000Z', '/work/app'),
      result('c1', '[feat/x 1111111] feat: one', '2026-10-20T10:00:02.000Z'),
    ])
    const first = await refreshAgentIndex(agent, { home, git: noGit })
    expect(first.partial).toBe(false)
    expect(first.index.commits.map(c => [c.sha, c.sessionId, c.branch])).toEqual([['1111111', 's1', 'feat/x']])
    expect(fs.existsSync(indexFilePath('agent-1'))).toBe(true)

    fs.appendFileSync(file, [
      call('p1', 'gh pr create --base main --head feat/x --title t --body b', '2026-10-20T10:05:00.000Z', '/work/app'),
      result('p1', 'https://github.com/acme/app/pull/9', '2026-10-20T10:05:03.000Z'),
    ].join('\n') + '\n')
    const second = await refreshAgentIndex(agent, { home, git: noGit })
    expect(second.index.commits).toHaveLength(1) // not read twice
    expect(second.index.prs.map(p => [p.pr, p.repo])).toEqual([[9, 'acme/app']])
    expect(loadIndex('agent-1').prs).toHaveLength(1)
  })

  it('does not consume a line that is still being written, and carries a call whose answer comes later', async () => {
    const file = transcript('/work/app', 's1', [call('c1', 'git commit -m "feat: late"', '2026-10-20T10:00:00.000Z', '/work/app')])
    const a = await refreshAgentIndex(agent, { home, git: noGit })
    expect(a.index.commits).toHaveLength(0)
    // The answer arrives, cut in the middle of its line
    const answer = result('c1', '[main 2222222] feat: late', '2026-10-20T10:00:02.000Z')
    fs.appendFileSync(file, answer.slice(0, 40))
    const b = await refreshAgentIndex(agent, { home, git: noGit })
    expect(b.index.commits).toHaveLength(0)
    fs.appendFileSync(file, answer.slice(40) + '\n')
    const c = await refreshAgentIndex(agent, { home, git: noGit })
    expect(c.index.commits.map(x => x.sha)).toEqual(['2222222'])
  })

  it('rebuilds a transcript that shrank (it was rewritten) without keeping its old records', async () => {
    const file = transcript('/work/app', 's1', [
      call('c1', 'git commit -m "feat: old"', '2026-10-20T10:00:00.000Z', '/work/app'),
      result('c1', '[main 3333333] feat: old', '2026-10-20T10:00:02.000Z'),
    ])
    await refreshAgentIndex(agent, { home, git: noGit })
    fs.writeFileSync(file, '{"cwd":"/work/app"}\n')
    const r = await refreshAgentIndex(agent, { home, git: noGit })
    expect(r.index.commits).toEqual([])
  })

  it('does not ask git again for an unresolved commit inside ten minutes', async () => {
    transcript('/work/app', 's1', [
      call('c1', 'git commit -q -m "feat: gone"', '2026-10-20T10:00:00.000Z', '/work/app'),
      result('c1', '', '2026-10-20T10:00:02.000Z'),
    ])
    let asked = 0
    const git: GitRunner = async (_dir, args) => { if (args[0] === 'log') asked++; return null }
    let clock = Date.parse('2026-10-21T00:00:00.000Z')
    await refreshAgentIndex(agent, { home, git, now: () => clock })
    const afterFirst = asked
    expect(afterFirst).toBeGreaterThan(0)
    clock += 60_000
    await refreshAgentIndex(agent, { home, git, now: () => clock })
    expect(asked).toBe(afterFirst)
    clock += 11 * 60_000
    await refreshAgentIndex(agent, { home, git, now: () => clock })
    expect(asked).toBeGreaterThan(afterFirst)
  })

  it('stops reading more transcripts when the time budget is spent, and says so', async () => {
    transcript('/work/app', 's1', [])
    transcript('/work/app/.claude/worktrees/x', 's2', [], '/work/app/.claude/worktrees/x')
    let clock = 0
    const r = await refreshAgentIndex(agent, { home, git: noGit, budgetMs: 5, now: () => (clock += 10) })
    expect(r.partial).toBe(true)
  })
})
