import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { CommitRows, TraceMatches } from '@/components/AgentCommitsSection'
import type { TraceMatch, TraceResult } from '@/services/commit-trace-service'

const commit = { sha: 'a1b2c3d4e5f6a7b8c9d0a1b2c3d4e5f6a7b8c9d0', subject: 'feat: add the thing', ts: '2026-10-20T10:00:00.000Z', line: 7, via: 'output' as const, command: 'git commit -m "x"', evidence: '[main a1b2c3d] x' }
const match = (over: Partial<TraceMatch> = {}): TraceMatch => ({
  hostId: 'mac-mini', agentId: 'ag-1', agentName: 'Dev', sessionId: '12345678-aaaa-bbbb', via: 'sha', confidence: 'exact', role: 'committed',
  commits: [commit], prs: [{ pr: 528, repo: 'acme/app', kind: 'create', ts: '2026-10-20T10:30:00.000Z', command: 'gh pr create' }], ...over,
})
const result = (over: Partial<TraceResult> = {}): TraceResult => ({ query: 'a1b2c3d', shas: [commit.sha], matches: [match()], unreachable: [], ...over })

describe('the Commits section', () => {
  it('lists commits with a short sha, the message, the time, and what the session ran', () => {
    const html = renderToStaticMarkup(createElement(CommitRows, { commits: [commit] }))
    expect(html).toContain('a1b2c3d4')
    expect(html).not.toContain('a1b2c3d4e5f6')
    expect(html).toContain('feat: add the thing')
    expect(html).toContain('2026-10-20 10:00')
    expect(html).toContain('What the session ran')
    expect(html).toContain('[main a1b2c3d] x')
  })

  it('says so when there are no commits, and when a commit has no recorded sha or message', () => {
    expect(renderToStaticMarkup(createElement(CommitRows, { commits: [] }))).toContain('No commits found')
    const html = renderToStaticMarkup(createElement(CommitRows, { commits: [{ ...commit, sha: undefined, subject: undefined }] }))
    expect(html).toContain('no sha')
    expect(html).toContain('message not recorded')
  })

  it('names the agent with a link to it, the host and session, and links the PR on GitHub', () => {
    const html = renderToStaticMarkup(createElement(TraceMatches, { result: result() }))
    expect(html).toContain('href="/?agent=ag-1"')
    expect(html).toContain('Dev')
    expect(html).toContain('mac-mini')
    expect(html).toContain('session 12345678')
    expect(html).toContain('https://github.com/acme/app/pull/528')
    expect(html).toContain('The session recorded this commit')
  })

  it('says how sure each match is', () => {
    const likely = renderToStaticMarkup(createElement(TraceMatches, { result: result({ matches: [match({ via: 'pr', confidence: 'likely', role: 'opened' })] }) }))
    expect(likely).toContain('Matched through the pull request')
    expect(likely).toContain('opened the pull request')
    const weak = renderToStaticMarkup(createElement(TraceMatches, { result: result({ matches: [match({ via: 'subject', confidence: 'weak' })] }) }))
    expect(weak).toContain('Same first line of message only')
  })

  it('shows a host that could not be asked, and a search that was cut short', () => {
    const html = renderToStaticMarkup(createElement(TraceMatches, { result: result({ unreachable: ['mini-lola'], partial: true }) }))
    expect(html).toContain('Could not ask: mini-lola')
    expect(html).toContain('Not every session could be read')
  })

  it('says plainly when nothing is known', () => {
    const html = renderToStaticMarkup(createElement(TraceMatches, { result: result({ matches: [] }) }))
    expect(html).toContain('No session is known to have made this commit')
  })
})
