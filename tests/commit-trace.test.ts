import { describe, it, expect } from 'vitest'
import {
  scanTranscript, parseCommitSummary, commitSubjectOf, repoDirOf, shellView, isShaQuery, prNumberOfSubject, stripPrSuffix, mayHoldGitCall,
} from '@/lib/commit-trace'

// A transcript line holding one Bash call, and the line holding its result: the shapes Claude Code writes
const call = (id: string, command: string, ts = '2026-10-20T10:00:00.000Z', cwd = '/work/app') =>
  JSON.stringify({ type: 'assistant', timestamp: ts, cwd, sessionId: 's1', message: { content: [{ type: 'tool_use', id, name: 'Bash', input: { command } }] } })
const result = (id: string, text: string, ts = '2026-10-20T10:00:05.000Z', extra: Record<string, unknown> = {}) =>
  JSON.stringify({ type: 'user', timestamp: ts, message: { content: [{ type: 'tool_result', tool_use_id: id, content: text, ...extra }] } })

describe('sha queries', () => {
  it('accepts 7 to 40 hex characters and nothing else', () => {
    expect(isShaQuery('abc1234')).toBe(true)
    expect(isShaQuery('A'.repeat(40))).toBe(true)
    for (const bad of ['abc123', 'a'.repeat(41), 'abc123g', '../etc', 'abc1234;ls', '', ' abc1234', 5, null, undefined]) expect(isShaQuery(bad)).toBe(false)
  })
  it('reads the PR number GitHub adds to a squash subject', () => {
    expect(prNumberOfSubject('fix: the pane (#528)')).toBe(528)
    expect(prNumberOfSubject('fix: the pane (#528) ')).toBe(528)
    expect(prNumberOfSubject('fix (#12): the pane')).toBeUndefined()
    expect(prNumberOfSubject(undefined)).toBeUndefined()
    expect(stripPrSuffix('fix: the pane (#528)')).toBe('fix: the pane')
  })
})

describe('what git commit prints', () => {
  it('parses [branch sha] subject, with and without (root-commit)', () => {
    expect(parseCommitSummary('[feat/x 1a2b3c4] add the thing\n 2 files changed')).toEqual({ branch: 'feat/x', sha: '1a2b3c4', subject: 'add the thing' })
    expect(parseCommitSummary('[main (root-commit) abcdef0123] first')).toEqual({ branch: 'main', sha: 'abcdef0123', subject: 'first' })
    expect(parseCommitSummary('nothing here')).toBeUndefined()
  })
})

describe('the command', () => {
  it('finds the message subject from -m, a quoted -m, and a heredoc that feeds the commit', () => {
    expect(commitSubjectOf('git commit -m "fix: one"')).toBe('fix: one')
    expect(commitSubjectOf("git commit -q -m 'fix: two' && git push")).toBe('fix: two')
    expect(commitSubjectOf('git add -A && git commit -q -F - <<\'EOF\'\nfix: three\n\nbody\nEOF')).toBe('fix: three')
    expect(commitSubjectOf('git commit -m "$(cat <<\'EOF\'\nfix: four\n\nbody\nEOF\n)"')).toBe('fix: four')
  })
  it('does not take the subject from a script that only sits next to the commit', () => {
    const cmd = "python3 - <<'E'\nprint('not the message')\nE\ngit add -A && git commit -q -m \"feat: real subject\""
    expect(commitSubjectOf(cmd)).toBe('feat: real subject')
  })
  it('drops heredoc bodies that are not the commit message', () => {
    const cmd = "cat > notes.md <<'EOF'\nremember to git commit later\nEOF\nls"
    expect(shellView(cmd)).not.toContain('git commit')
    expect(mayHoldGitCall(cmd)).toBe(true) // the cheap prefilter lets it through; the shell view does not
  })
  it('resolves the directory the commit ran in: git -C, cds one after another, else the session cwd', () => {
    expect(repoDirOf('git -C /srv/repo commit -m x', '/work/app')).toBe('/srv/repo')
    expect(repoDirOf('cd /srv/repo && git commit -m x', '/work/app')).toBe('/srv/repo')
    expect(repoDirOf('cd plugin && git commit -m x', '/work/app')).toBe('/work/app/plugin')
    expect(repoDirOf('cd a; cd ../b; git commit -m x', '/work')).toBe('/work/b')
    expect(repoDirOf('cd ~/code && git commit -m x', '/work', '/home/me')).toBe('/home/me/code')
    expect(repoDirOf('git commit -m x', '/work/app')).toBe('/work/app')
    expect(repoDirOf('git commit -m x && cd /elsewhere', '/work/app')).toBe('/work/app') // a cd after the commit does not count
  })
})

describe('scanning a transcript', () => {
  it('records a commit with the sha and branch git printed', () => {
    const r = scanTranscript([
      call('t1', 'cd /srv/repo && git commit -m "feat: add the thing"'),
      result('t1', '[feat/x 1a2b3c4] feat: add the thing\n 1 file changed'),
    ], { sessionId: 's1' })
    expect(r.commits).toHaveLength(1)
    expect(r.commits[0]).toMatchObject({ sessionId: 's1', sha: '1a2b3c4', branch: 'feat/x', subject: 'feat: add the thing', repoDir: '/srv/repo', via: 'output', line: 1 })
    expect(r.commits[0].startedAt).toBe('2026-10-20T10:00:00.000Z')
    expect(r.commits[0].ts).toBe('2026-10-20T10:00:05.000Z')
    expect(r.commits[0].evidence).toContain('feat: add the thing')
    expect(r.open).toEqual({})
  })

  it('records a quiet commit (git commit -q prints nothing) without a sha, with its subject, to be resolved later', () => {
    const r = scanTranscript([
      call('t1', 'git add -A && git commit -q -m "fix: quiet one"'),
      result('t1', ''),
    ], { sessionId: 's1' })
    expect(r.commits[0]).toMatchObject({ sha: undefined, subject: 'fix: quiet one', via: 'unresolved', repoDir: '/work/app' })
  })

  it('skips a commit that did nothing, was a dry run, or was denied', () => {
    const r = scanTranscript([
      call('a', 'git commit -m "x"'), result('a', 'On branch main\nnothing to commit, working tree clean'),
      call('b', 'git commit --dry-run -m "x"'), result('b', 'On branch main'),
      call('c', 'git commit -m "x"'), result('c', 'Permission for this action was denied by the Claude Code auto mode classifier.', undefined, { is_error: true }),
    ], { sessionId: 's1' })
    expect(r.commits).toEqual([])
  })

  it('does not take a script that only mentions git commit for a commit', () => {
    const r = scanTranscript([
      call('t1', "python3 - <<'E'\nopen('CHANGELOG.md').write('run git commit afterwards')\nE"),
      result('t1', 'ok'),
    ], { sessionId: 's1' })
    expect(r.commits).toEqual([])
  })

  it('records the PR a session opened, with its repository and --head branch', () => {
    const r = scanTranscript([
      call('p1', 'gh pr create --base main --head feat/x --title "t" --body "b"'),
      result('p1', 'zoxide: detected a possible configuration issue.\nhttps://github.com/acme/app/pull/528\n'),
    ], { sessionId: 's1' })
    expect(r.prs).toHaveLength(1)
    expect(r.prs[0]).toMatchObject({ pr: 528, repo: 'acme/app', kind: 'create', branch: 'feat/x', repoDir: '/work/app' })
    expect(r.prs[0].evidence).not.toContain('zoxide')
  })

  it('takes the branch of a PR from the last commit that printed one when --head is not given', () => {
    const r = scanTranscript([
      call('c1', 'git commit -m "x"'), result('c1', '[feat/y 9999999] x'),
      call('p1', 'gh pr create --base main --title t --body b'), result('p1', 'https://github.com/acme/app/pull/7'),
    ], { sessionId: 's1' })
    expect(r.prs[0].branch).toBe('feat/y')
  })

  it('records a merge by number or URL, and ignores a failed or denied one', () => {
    const r = scanTranscript([
      call('m1', 'gh pr merge 528 --squash --subject "fix: x (#528)"'), result('m1', '✓ Squashed and merged pull request #528 (fix: x)'),
      call('m2', 'gh pr merge https://github.com/acme/app/pull/530 --squash'), result('m2', ''),
      call('m3', 'gh pr merge 531 --squash'), result('m3', 'Pull request #531 is not mergeable: the base branch policy prohibits the merge.'),
      call('m4', 'gh pr merge 532 --squash'), result('m4', 'Permission for this action was denied by the Claude Code auto mode classifier.', undefined, { is_error: true }),
      call('m5', 'gh pr merge 533 -R acme/app --squash'), result('m5', ''),
    ], { sessionId: 's1' })
    expect(r.prs.map(p => [p.pr, p.repo, p.kind])).toEqual([[528, undefined, 'merge'], [530, 'acme/app', 'merge'], [533, 'acme/app', 'merge']])
  })

  it('carries an unanswered call to the next chunk of the same transcript', () => {
    const first = scanTranscript([call('t1', 'git commit -m "feat: split"')], { sessionId: 's1' })
    expect(first.commits).toEqual([])
    expect(Object.keys(first.open)).toEqual(['t1'])
    const second = scanTranscript([result('t1', '[main abcdef0] feat: split')], { sessionId: 's1', startLine: 2, open: first.open })
    expect(second.commits).toHaveLength(1)
    expect(second.commits[0]).toMatchObject({ sha: 'abcdef0', line: 1, repoDir: '/work/app' })
    expect(second.open).toEqual({})
  })

  it('ignores lines that are not JSON, not Bash, or not about git', () => {
    const r = scanTranscript(['not json at all git commit', JSON.stringify({ message: { content: 'text' } }), call('t', 'ls -la'), result('t', 'x')], { sessionId: 's1' })
    expect(r.commits).toEqual([])
    expect(r.prs).toEqual([])
  })

  it('numbers lines from startLine', () => {
    const r = scanTranscript([call('t1', 'git commit -m "a"'), result('t1', '[main abcdef0] a')], { sessionId: 's1', startLine: 101 })
    expect(r.commits[0].line).toBe(101)
  })
})

describe('one command that opens or merges several PRs (real transcript regression)', () => {
  it('records each PR, with its own repository and --head', () => {
    const cmd = 'cd /srv/app && gh pr create -R acme/plugins --base main --head feat/plug --title "p" --body "b"; gh pr create --base main --head feat/app --title "a" --body "b"'
    const out = 'https://github.com/acme/plugins/pull/82\nhttps://github.com/acme/app/pull/649\n'
    const r = scanTranscript([call('p1', cmd), result('p1', out)], { sessionId: 's1' })
    expect(r.prs.map(p => [p.pr, p.repo, p.branch, p.kind])).toEqual([[82, 'acme/plugins', 'feat/plug', 'create'], [649, 'acme/app', 'feat/app', 'create']])
    expect(r.prs.every(p => p.repoDir === '/srv/app')).toBe(true)
  })

  it('records each merge in a command that merges two PRs', () => {
    const r = scanTranscript([
      call('m1', 'gh pr merge 81 -R acme/plugins --merge && gh pr merge 648 --squash'), result('m1', ''),
    ], { sessionId: 's1' })
    expect(r.prs.map(p => [p.pr, p.repo, p.kind])).toEqual([[81, 'acme/plugins', 'merge'], [648, undefined, 'merge']])
  })

  it('does not take gh text inside a heredoc script for a PR action', () => {
    const r = scanTranscript([call('x', "cat > notes.md <<'EOF'\nrun gh pr create when ready\nEOF"), result('x', 'https://github.com/a/b/pull/1')], { sessionId: 's1' })
    expect(r.prs).toEqual([])
  })
})

describe('a commit whose command also carries text about commits (real transcript regression)', () => {
  it('records a commit even though a script written in the same command mentions --dry-run', () => {
    const cmd = "python3 - <<'E'\nopen('CHANGELOG.md').write('`import <file> [--dry-run]` adds many cards')\nE\ngit add -A && git commit -q -m \"feat: the import\" && git push -q"
    const r = scanTranscript([call('t1', cmd), result('t1', '')], { sessionId: 's1' })
    expect(r.commits).toHaveLength(1)
    expect(r.commits[0].subject).toBe('feat: the import')
  })
  it('still skips a real dry run, and only the one on the commit itself', () => {
    const r = scanTranscript([
      call('a', 'git commit --dry-run -m "x" && echo done'), result('a', 'On branch main'),
      call('b', 'git commit -m "y" && git push --dry-run'), result('b', '[main abcdef0] y'),
    ], { sessionId: 's1' })
    expect(r.commits.map(c => c.subject)).toEqual(['y'])
  })
})
