/**
 * Commit-to-session trace, the reading half: find the git commits and pull-request actions an agent
 * made in a Claude Code session, from the session transcript alone. No hook, no plugin.
 *
 * A transcript line is JSON. An assistant line holds a `tool_use` block (name "Bash", `input.command`);
 * the matching `tool_result` comes later in a user line, linked by `tool_use_id`. For each Bash call that
 * ran `git commit` or `gh pr create|merge` this pairs the call with its result and yields a record.
 *
 * What a transcript can and cannot say:
 * - `git commit` prints `[branch abc1234] subject` unless it ran with -q (agents often do). Without that
 *   line the record has no sha yet; the index step resolves it with git (subject + time window), which
 *   only works while the repository still exists on this host.
 * - The repository a commit went into is the directory the command ran in: a `cd <dir>` before it, or
 *   `git -C <dir>`, else the session's working directory.
 * - A squash merge makes a NEW commit on main, so the sha the agent made is not the one on main. The pull
 *   request is the link: records of `gh pr create` / `gh pr merge` carry the PR number.
 *
 * Pure: no file or network access here (see lib/commit-index.ts).
 */

import { isConversationRecord } from '@/lib/transcript-records.mjs'
import path from 'path'

export interface PendingCall {
  kind: 'commit' | 'pr'
  command: string
  ts?: string
  cwd?: string
  line: number
}

export interface CommitRecord {
  sessionId: string
  /** When the command finished (the result's time) */
  ts: string
  /** When the command was issued: the commit happened between this and `ts` */
  startedAt?: string
  line: number
  /** Directory the commit ran in (a cd before it, git -C, or the session's cwd) */
  repoDir?: string
  /** Which repository that is, whatever worktree it ran in: the repository's shared git directory (set by the index) */
  repoKey?: string
  /** The repository's GitHub name, owner/name, from its origin remote (set by the index) */
  repoSlug?: string
  branch?: string
  /** Full 40-character sha when known; otherwise the abbreviation the commit printed */
  sha?: string
  subject?: string
  /** The command, cut */
  command: string
  /** What the command printed, cut */
  evidence: string
  /** How the sha was found: printed by git, found in git log, or not found */
  via: 'output' | 'git-log' | 'unresolved'
  /** When the sha was last looked for and not found, so it is not asked for on every refresh */
  retriedAt?: string
  /** The directory whose repository held the commit when its sha was found (used to name the repository of a removed worktree) */
  foundIn?: string
}

export interface PrRecord {
  sessionId: string
  ts: string
  line: number
  pr: number
  /** owner/name when the command or its output says so */
  repo?: string
  kind: 'create' | 'merge'
  /** The branch the PR is for: --head, else the branch of the session's latest commit before it */
  branch?: string
  /** Directory the gh command ran in: the repository whose commits led to the PR */
  repoDir?: string
  /** The repository's shared git directory (set by the index): the same for a worktree and its main checkout */
  repoKey?: string
  /** owner/name: from the PR's URL or -R, else from the directory's origin remote (set by the index) */
  repoSlug?: string
  command: string
  evidence: string
}

/** Are two records about the same repository? By its git directory when both have one, else by the directory they ran in. */
export function sameRepository(
  a: { repoKey?: string; repoDir?: string; repoSlug?: string },
  b: { repoKey?: string; repoDir?: string; repoSlug?: string },
): boolean {
  // A PR opened with `gh pr create -R owner/name` from another directory is known only by its GitHub name
  if (a.repoSlug && b.repoSlug) return a.repoSlug.toLowerCase() === b.repoSlug.toLowerCase()
  if (a.repoKey && b.repoKey) return a.repoKey === b.repoKey
  return !a.repoDir || !b.repoDir || a.repoDir === b.repoDir
}

export interface ScanResult {
  commits: CommitRecord[]
  prs: PrRecord[]
  /** Calls seen but not yet answered: carried to the next chunk of the same transcript */
  open: Record<string, PendingCall>
}

const COMMIT_RE = /\bgit\s+(?:-C\s+("[^"]+"|'[^']+'|\S+)\s+)?commit(?=\s|$)/
const PR_RE = /\bgh\s+pr\s+(create|merge)\b/
const CUT = 400

/** Cheap test on a raw line: worth parsing as JSON? */
export function mayHoldGitCall(rawLine: string): boolean {
  return /git\s+(?:-C\s+\S+\s+)?commit|gh\s+pr\s+(?:create|merge)/.test(rawLine)
}

function unquote(s: string): string {
  const t = s.trim()
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) return t.slice(1, -1)
  return t
}

function expandHome(p: string, home?: string): string {
  if (home && (p === '~' || p.startsWith('~/'))) return home + p.slice(1)
  return p
}

/** The command text without noise from the shell snapshot that the harness prepends to results */
export function cleanEvidence(text: string): string {
  return text
    .split('\n')
    .filter(l => !/^zoxide: |^Please ensure that zoxide|^If the issue persists|^https:\/\/github\.com\/ajeetdsouza|^Disable this message by setting _ZO_DOCTOR/.test(l))
    .join('\n')
    .trim()
    .slice(0, CUT)
}

/**
 * The command as the shell runs it: heredoc bodies are dropped unless the heredoc feeds the commit
 * message (its start line has `commit` on it). A script written through a heredoc (python, node, a file
 * being created) can mention `git commit` in its text without running it.
 */
export function shellView(command: string): string {
  const lines = command.split('\n')
  const out: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    out.push(line)
    const m = /<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1/.exec(line)
    if (!m) continue
    let j = i + 1
    const body: string[] = []
    while (j < lines.length && lines[j].trim() !== m[2]) { body.push(lines[j]); j++ }
    if (/\bcommit\b/.test(line)) out.push(...body)
    i = j - 1
  }
  return out.join('\n')
}

/**
 * The directory a command ran in: git -C, else the cds before it, else the session's directory.
 * Relative paths are resolved the way the shell would, one step at a time.
 */
export function repoDirOf(command: string, cwd: string | undefined, home?: string, anchor: RegExp = COMMIT_RE): string | undefined {
  const view = shellView(command)
  const call = anchor.exec(view) || /\b(?:git|gh)\s+/.exec(view)
  const at = call ? call.index : view.length
  let dir = cwd
  const step = (arg: string) => {
    const p = expandHome(unquote(arg), home)
    if (p === '-' || p === '') return
    if (p.startsWith('/')) dir = path.posix.normalize(p)
    else if (dir) dir = path.posix.resolve(dir, p)
    else dir = undefined
  }
  const cd = /\bcd\s+("[^"]+"|'[^']+'|[^\s;&|]+)/g
  let m: RegExpExecArray | null
  while ((m = cd.exec(view)) !== null) {
    if (m.index < at) step(m[1])
  }
  if (anchor === COMMIT_RE && call && call[1]) step(call[1])
  return dir
}

/** The first line of the commit message: from -m / --message, or from a heredoc that feeds the commit */
export function commitSubjectOf(command: string): string | undefined {
  const view = shellView(command)
  const call = COMMIT_RE.exec(view)
  const tail = call ? view.slice(call.index) : view
  const firstLine = (text: string) => text.split('\n').map(l => l.trim()).find(l => l.length > 0)

  const msg = /(?:\s-m\s*|--message[= ])("(?:[^"\\]|\\.)*"|'[^']*'|\S+)/.exec(tail)
  const heredoc = /<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1[ \t]*\n([\s\S]*?)\n\s*\2\b/.exec(tail)
  // A heredoc inside -m "$(cat <<'EOF' ... )" holds the message; a plain -m before a heredoc is the message
  if (heredoc && (!msg || heredoc.index < msg.index + msg[0].length)) {
    const first = firstLine(heredoc[3])
    if (first) return first
  }
  if (msg) {
    const first = firstLine(unquote(msg[1]))
    if (first && !first.startsWith('$(')) return first
  }
  return undefined
}

/** `[branch abc1234] subject` or `[branch (root-commit) abc1234] subject`, as git commit prints it */
export function parseCommitSummary(output: string): { branch: string; sha: string; subject: string } | undefined {
  const m = /^\[(\S+?)(?: \([^)]*\))? ([0-9a-f]{7,40})\] (.*)$/m.exec(output)
  return m ? { branch: m[1], sha: m[2], subject: m[3].trim() } : undefined
}

function textOf(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content.map(b => (b && typeof b === 'object' && typeof (b as { text?: unknown }).text === 'string' ? (b as { text: string }).text : '')).join('\n')
  }
  return ''
}

/** Each `gh pr create` / `gh pr merge` in a command, with the text up to the next one (its own flags) */
export function ghSegments(view: string): { kind: 'create' | 'merge'; text: string }[] {
  const found = [...view.matchAll(/\bgh\s+pr\s+(create|merge)\b/g)]
  return found.map((m, i) => ({
    kind: m[1] as 'create' | 'merge',
    text: view.slice(m.index, i + 1 < found.length ? found[i + 1].index : undefined),
  }))
}

/** --head and --repo / -R of one gh call */
export function ghFlags(text: string): { head?: string; repo?: string } {
  const head = /--head[= ]([^\s"']+)/.exec(text)
  const repo = /--repo[= ]([\w.-]+\/[\w.-]+)|\s-R\s*([\w.-]+\/[\w.-]+)/.exec(text)
  return { head: head ? head[1] : undefined, repo: repo ? repo[1] || repo[2] : undefined }
}

/** The PR number in `gh pr merge <n|url> ...` */
function prNumberOfMerge(command: string): { pr: number; repo?: string } | undefined {
  const m = /\bgh\s+pr\s+merge\s+(?:(?:-[A-Za-z-]+(?:[= ]\S+)?\s+)*)(https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/pull\/(\d+)|\d+)/.exec(command)
  if (!m) return undefined
  if (m[3]) return { pr: Number(m[3]), repo: m[2] }
  const repoFlag = /--repo[= ]([\w.-]+\/[\w.-]+)|\s-R\s*([\w.-]+\/[\w.-]+)/.exec(command)
  return { pr: Number(m[1]), repo: repoFlag ? repoFlag[1] || repoFlag[2] : undefined }
}

/**
 * Scan transcript lines of one session. `startLine` is the 1-based number of the first line given.
 * `open` carries calls from the previous chunk whose results are in this one.
 */
export function scanTranscript(
  lines: string[],
  opts: { sessionId: string; startLine?: number; open?: Record<string, PendingCall>; home?: string },
): ScanResult {
  const open: Record<string, PendingCall> = { ...(opts.open || {}) }
  const commits: CommitRecord[] = []
  const prs: PrRecord[] = []
  const first = opts.startLine ?? 1
  let lastBranch: string | undefined

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    if (!raw) continue
    const hasOpen = Object.keys(open).length > 0
    const isResult = hasOpen && raw.includes('tool_result')
    if (!isResult && !mayHoldGitCall(raw)) continue
    let obj: any
    try { obj = JSON.parse(raw) } catch { continue }
    // `api-request-blob` and the other bookkeeping records replay earlier calls and results with no timestamp
    if (!isConversationRecord(obj)) continue
    const content = obj?.message?.content
    if (!Array.isArray(content)) continue

    for (const block of content) {
      if (block?.type === 'tool_use' && block.name === 'Bash' && typeof block.input?.command === 'string') {
        const command: string = block.input.command
        const view = shellView(command)
        const kind = COMMIT_RE.test(view) ? 'commit' : PR_RE.test(view) ? 'pr' : null
        if (kind && typeof block.id === 'string') {
          open[block.id] = { kind, command, ts: obj.timestamp, cwd: obj.cwd, line: first + i }
        }
      } else if (block?.type === 'tool_result' && typeof block.tool_use_id === 'string' && open[block.tool_use_id]) {
        const call = open[block.tool_use_id]
        delete open[block.tool_use_id]
        const output = textOf(block.content)
        const denied = /Permission for this action was denied|The user doesn't want to proceed|was rejected/.test(output)
        if (denied) continue
        const evidence = cleanEvidence(output)
        const ts = obj.timestamp || call.ts || ''

        if (call.kind === 'commit') {
          // Only the shell's own text counts: a script written through a heredoc can mention --dry-run
          const view = shellView(call.command)
          const at = COMMIT_RE.exec(view)
          if (/(^|\s)--dry-run(\s|$)/.test(at ? view.slice(at.index).split(/&&|;|\|\||\n/)[0] : view)) continue
          const printed = parseCommitSummary(output)
          if (/nothing to commit|no changes added to commit|^fatal:|^error:/m.test(output) && !printed) continue
          if (printed) lastBranch = printed.branch
          commits.push({
            sessionId: opts.sessionId,
            ts,
            startedAt: call.ts,
            line: call.line,
            repoDir: repoDirOf(call.command, call.cwd, opts.home),
            branch: printed?.branch,
            sha: printed?.sha,
            subject: printed?.subject || commitSubjectOf(call.command),
            command: call.command.slice(0, CUT),
            evidence,
            via: printed ? 'output' : 'unresolved',
          })
        } else {
          // One command can open or merge several PRs (one in each of two repositories): take each on its own
          const segments = ghSegments(shellView(call.command))
          const dir = repoDirOf(call.command, call.cwd, opts.home, PR_RE)
          const base = { sessionId: opts.sessionId, ts, line: call.line, repoDir: dir, command: call.command.slice(0, CUT), evidence }
          const creates = segments.filter(s => s.kind === 'create')
          if (creates.length > 0) {
            const urls = [...new Map([...output.matchAll(/https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/pull\/(\d+)/g)].map(m => [m[0], m] as const)).values()]
            urls.forEach((u, k) => {
              // The segment aimed at this URL's repository (-R), else the one in the same position
              const seg = creates.find(s => ghFlags(s.text).repo?.toLowerCase() === u[1].toLowerCase()) || (creates.length === urls.length ? creates[k] : creates[0])
              const head = ghFlags(seg.text).head
              prs.push({ ...base, pr: Number(u[2]), repo: u[1], repoSlug: u[1], kind: 'create', branch: head ?? lastBranch })
            })
          }
          const merges = segments.filter(s => s.kind === 'merge')
          if (merges.length > 0 && !(/^(GraphQL: |could not |no pull requests? found)|failed|Pull request #\d+ is not mergeable/mi.test(output) && !/merged pull request/i.test(output))) {
            for (const seg of merges) {
              const target = prNumberOfMerge(seg.text)
              if (!target) continue
              const repo = target.repo || ghFlags(seg.text).repo
              prs.push({ ...base, pr: target.pr, repo, repoSlug: repo, kind: 'merge', branch: lastBranch })
            }
          }
        }
      }
    }
  }
  return { commits, prs, open }
}

/** `fix: something (#528)` -> 528 (what GitHub appends to a squash commit's subject) */
export function prNumberOfSubject(subject: string | undefined): number | undefined {
  const m = /\(#(\d+)\)\s*$/.exec((subject || '').trim())
  return m ? Number(m[1]) : undefined
}

export function stripPrSuffix(subject: string): string {
  return subject.replace(/\s*\(#\d+\)\s*$/, '').trim()
}

/** A sha typed by a person or sent by a client: 7 to 40 hex characters, nothing else */
export function isShaQuery(s: unknown): s is string {
  return typeof s === 'string' && /^[0-9a-fA-F]{7,40}$/.test(s)
}
