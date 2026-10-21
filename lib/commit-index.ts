/**
 * Commit-to-session trace, the storage half.
 *
 * One small index per agent, on the host where the agent lives (the subconscious rule):
 *   ~/.aimaestro/agents/<agentId>/commits.json
 * built from that agent's Claude Code transcripts (lib/commit-trace.ts) and refreshed incrementally:
 * each transcript is read only from where the last read stopped.
 *
 * Git is used to turn a printed or missing sha into the full sha: `git rev-parse` for an abbreviation,
 * `git log` in a time window around the call (matching the commit message's first line) when `git commit -q`
 * printed nothing. That works while the repository still exists on this host. A removed worktree's commits
 * live on in the main repository, so the agent's own working directory is tried too.
 *
 * Only Claude Code transcripts are read. Codex, Grok, Pi and Copilot sessions keep other formats; their
 * commits are not indexed yet.
 */

import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFile } from 'child_process'
import { isSafeAgentId } from '@/lib/safe-ids'
import { encodeProjectDirName } from '@/lib/chat-transcript.mjs'
import { scanTranscript, type CommitRecord, type PendingCall, type PrRecord } from '@/lib/commit-trace'

export const INDEX_VERSION = 1
const MAX_COMMITS = 5000
const MAX_PRS = 2000
const MAX_CHUNK_BYTES = 16 * 1024 * 1024

export interface FileState {
  size: number
  offset: number
  sessionId: string
  lines: number
  open: Record<string, PendingCall>
}

export interface AgentCommitIndex {
  version: number
  agentId: string
  updatedAt: string
  files: Record<string, FileState>
  commits: CommitRecord[]
  prs: PrRecord[]
}

export type GitRunner = (dir: string, args: string[]) => Promise<string | null>

/** git with argv only (never a shell string), a short timeout, and no prompts. null on any failure. */
export const runGit: GitRunner = (dir, args) =>
  new Promise((resolve) => {
    if (!dir || !path.isAbsolute(dir) || !fs.existsSync(dir)) return resolve(null)
    execFile('git', ['-C', dir, ...args], { timeout: 3000, maxBuffer: 1024 * 1024, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } },
      (err, stdout) => resolve(err ? null : String(stdout)))
  })

export function indexFilePath(agentId: string): string {
  if (!isSafeAgentId(agentId)) throw new Error('Invalid agent id')
  return path.join(os.homedir(), '.aimaestro', 'agents', agentId, 'commits.json')
}

export function emptyIndex(agentId: string): AgentCommitIndex {
  return { version: INDEX_VERSION, agentId, updatedAt: new Date(0).toISOString(), files: {}, commits: [], prs: [] }
}

export function loadIndex(agentId: string): AgentCommitIndex {
  try {
    const parsed = JSON.parse(fs.readFileSync(indexFilePath(agentId), 'utf-8')) as AgentCommitIndex
    if (parsed && parsed.version === INDEX_VERSION && Array.isArray(parsed.commits) && Array.isArray(parsed.prs) && parsed.files) return parsed
  } catch { /* none yet, or unreadable: start again from the transcripts */ }
  return emptyIndex(agentId)
}

function saveIndex(index: AgentCommitIndex): void {
  const file = indexFilePath(index.agentId)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(index), 'utf-8')
  fs.renameSync(tmp, file)
}

// ── Finding an agent's Claude transcripts ───────────────────────────────────

/** The working directory a transcript was written in: the first `cwd` in its first lines */
function transcriptCwd(file: string): string | undefined {
  try {
    const fd = fs.openSync(file, 'r')
    try {
      const buf = Buffer.alloc(65536)
      const n = fs.readSync(fd, buf, 0, buf.length, 0)
      const m = /"cwd":"((?:[^"\\]|\\.)*)"/.exec(buf.toString('utf-8', 0, n))
      return m ? JSON.parse(`"${m[1]}"`) : undefined
    } finally { fs.closeSync(fd) }
  } catch { return undefined }
}

/**
 * Every session transcript of an agent: the project folder of its working directory, and the folders of
 * directories below it (a session started in a worktree under it). The folder name is an encoding that
 * cannot be reversed exactly, so a folder is accepted only when the `cwd` written in its transcripts is
 * the agent's directory or inside it.
 */
export function listClaudeTranscripts(workingDir: string | null | undefined, home: string = os.homedir()): { file: string; sessionId: string }[] {
  if (!workingDir) return []
  const root = path.join(home, '.claude', 'projects')
  const enc = encodeProjectDirName(workingDir)
  let dirs: string[]
  try { dirs = fs.readdirSync(root) } catch { return [] }
  const out: { file: string; sessionId: string }[] = []
  for (const d of dirs) {
    if (d !== enc && !d.startsWith(enc + '-')) continue
    const dir = path.join(root, d)
    let files: string[]
    try { files = fs.readdirSync(dir).filter(f => f.endsWith('.jsonl')) } catch { continue }
    if (files.length === 0) continue
    const cwd = transcriptCwd(path.join(dir, files[0]))
    if (!cwd || !(cwd === workingDir || cwd.startsWith(workingDir.replace(/\/$/, '') + '/'))) continue
    for (const f of files) out.push({ file: path.join(dir, f), sessionId: f.replace(/\.jsonl$/, '') })
  }
  return out
}

// ── Resolving shas with git ─────────────────────────────────────────────────

const FULL = /^[0-9a-f]{40}$/

async function fullShaOf(short: string, dirs: string[], git: GitRunner): Promise<{ sha: string; dir: string } | undefined> {
  for (const dir of dirs) {
    const out = await git(dir, ['rev-parse', '--verify', '--quiet', `${short}^{commit}`])
    const sha = out?.trim()
    if (sha && FULL.test(sha)) return { sha, dir }
  }
  return undefined
}

async function shaBySubject(rec: CommitRecord, dirs: string[], git: GitRunner): Promise<{ sha: string; dir: string } | undefined> {
  const end = Date.parse(rec.ts)
  if (!Number.isFinite(end)) return undefined
  // The commit happened while the command ran: after it was issued, before its result came back
  const begin = Number.isFinite(Date.parse(rec.startedAt || '')) ? Date.parse(rec.startedAt as string) : end
  const at = begin
  const since = new Date(begin - 60_000).toISOString()
  const until = new Date(end + 60_000).toISOString()
  for (const dir of dirs) {
    const out = await git(dir, ['log', '--all', `--since=${since}`, `--until=${until}`, '-n', '100', '--format=%H%x09%ct%x09%s'])
    if (!out) continue
    const rows = out.split('\n').map(l => l.split('\t')).filter(r => r.length >= 3 && FULL.test(r[0]))
    const bySubject = rec.subject ? rows.filter(r => r[2].trim() === rec.subject) : []
    const pool = bySubject.length > 0 ? bySubject : rec.subject ? [] : rows.filter(r => Math.abs(Number(r[1]) * 1000 - at) <= 30_000)
    // Without a subject, only a single commit in the window is a safe answer
    if (!rec.subject && pool.length !== 1) continue
    if (pool.length === 0) continue
    pool.sort((a, b) => Math.abs(Number(a[1]) * 1000 - at) - Math.abs(Number(b[1]) * 1000 - at))
    return { sha: pool[0][0], dir }
  }
  return undefined
}

/**
 * Say which repository each record is about: the repository's shared git directory, which a worktree
 * and its main checkout have in common. A removed directory has none (comparison falls back to the path).
 */
export async function fillRepoKeys(
  records: { repoDir?: string; repoKey?: string; repoSlug?: string; foundIn?: string }[],
  git: GitRunner = runGit,
  cache: Map<string, string | null> = new Map(),
): Promise<void> {
  const keyOf = async (dir: string | undefined): Promise<string | null> => {
    if (!dir || !path.isAbsolute(dir)) return null
    if (!cache.has(dir)) {
      const out = (await git(dir, ['rev-parse', '--git-common-dir']))?.trim()
      cache.set(dir, out ? path.resolve(dir, out) : null)
    }
    return cache.get(dir) ?? null
  }
  const slugOf = async (dir: string | undefined): Promise<string | null> => {
    if (!dir || !path.isAbsolute(dir)) return null
    const k = `slug:${dir}`
    if (!cache.has(k)) {
      const url = (await git(dir, ['remote', 'get-url', 'origin']))?.trim() || ''
      const m = /github\.com[:/]([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/.exec(url)
      cache.set(k, m ? `${m[1]}/${m[2]}` : null)
    }
    return cache.get(k) ?? null
  }
  for (const r of records) {
    // The directory it ran in, or (when that worktree is gone) the directory whose repository holds its commit
    const dir = r.repoDir && (await keyOf(r.repoDir)) ? r.repoDir : r.foundIn
    if (!r.repoKey) {
      const key = (await keyOf(r.repoDir)) || (await keyOf(r.foundIn))
      if (key) r.repoKey = key
    }
    if (!r.repoSlug) {
      const slug = (await slugOf(dir)) || (await slugOf(r.foundIn))
      if (slug) r.repoSlug = slug
    }
  }
}

/** Fill in the full sha of each record where git can say it. Mutates and returns the records. */
export async function resolveCommitShas(records: CommitRecord[], fallbackDirs: string[], git: GitRunner = runGit): Promise<CommitRecord[]> {
  for (const rec of records) {
    if (rec.sha && FULL.test(rec.sha)) continue
    const dirs = [...new Set([rec.repoDir, ...fallbackDirs].filter((d): d is string => !!d))]
    if (rec.sha) {
      const full = await fullShaOf(rec.sha, dirs, git)
      if (full) { rec.sha = full.sha; rec.foundIn = full.dir }
    } else {
      const found = await shaBySubject(rec, dirs, git)
      if (found) { rec.sha = found.sha; rec.via = 'git-log'; rec.foundIn = found.dir }
    }
  }
  return records
}

// ── Refreshing an agent's index ─────────────────────────────────────────────

const locks = new Map<string, Promise<unknown>>()

export interface RefreshOptions {
  home?: string
  git?: GitRunner
  /** Stop reading new transcripts after this many ms; what was read is kept */
  budgetMs?: number
  now?: () => number
}

export interface RefreshResult { index: AgentCommitIndex; partial: boolean }

/** Bring one agent's index up to date with its transcripts. One refresh per agent at a time. */
export function refreshAgentIndex(
  agent: { id: string; workingDirectory?: string | null; program?: string },
  opts: RefreshOptions = {},
): Promise<RefreshResult> {
  const prev = locks.get(agent.id) || Promise.resolve()
  const run = prev.catch(() => undefined).then(() => doRefresh(agent, opts))
  locks.set(agent.id, run)
  return run.finally(() => { if (locks.get(agent.id) === run) locks.delete(agent.id) })
}

async function doRefresh(
  agent: { id: string; workingDirectory?: string | null },
  opts: RefreshOptions,
): Promise<RefreshResult> {
  const now = opts.now || Date.now
  const started = now()
  const git = opts.git || runGit
  const home = opts.home || os.homedir()
  const index = loadIndex(agent.id)
  const transcripts = listClaudeTranscripts(agent.workingDirectory, home)
  const fallbackDirs = agent.workingDirectory ? [agent.workingDirectory] : []
  let partial = false
  let changed = false
  const repoKeys = new Map<string, string | null>()

  for (const t of transcripts) {
    if (opts.budgetMs && now() - started > opts.budgetMs) { partial = true; break }
    let size: number
    try { size = fs.statSync(t.file).size } catch { continue }
    let state: FileState | undefined = index.files[t.file]
    if (state && size < state.offset) {
      // The file shrank: it was rewritten. Forget what it gave and read it again.
      const gone = state.sessionId
      index.commits = index.commits.filter(c => c.sessionId !== gone)
      index.prs = index.prs.filter(p => p.sessionId !== gone)
      state = undefined
    }
    if (!state) state = { size: 0, offset: 0, sessionId: t.sessionId, lines: 0, open: {} }
    index.files[t.file] = { ...state, size }

    // A transcript can be hundreds of megabytes: read it in chunks, until it is caught up or time runs out
    // (the next refresh goes on from the stored offset)
    while (state.offset < size) {
      if (opts.budgetMs && now() - started > opts.budgetMs) { partial = true; break }
      const length = Math.min(size - state.offset, MAX_CHUNK_BYTES)
      const buf = Buffer.alloc(length)
      const fd = fs.openSync(t.file, 'r')
      try { fs.readSync(fd, buf, 0, length, state.offset) } finally { fs.closeSync(fd) }
      // Only whole lines: a line still being written is read next time
      const lastNl = buf.lastIndexOf(0x0a)
      if (lastNl < 0) {
        // No line end in a full chunk: one enormous line (an embedded image). It cannot be a git call; step over it.
        if (length === MAX_CHUNK_BYTES) { state = { ...state, offset: state.offset + length, size, lines: state.lines + 1 }; index.files[t.file] = state; changed = true; continue }
        break
      }
      const lines = buf.toString('utf-8', 0, lastNl).split('\n')
      const scanned = scanTranscript(lines, { sessionId: t.sessionId, startLine: state.lines + 1, open: state.open, home })
      // A commit run after a cd that did not stick (or from a removed worktree) is looked for in the
      // other repositories this session worked in, and in the agent's own directory
      const seen = [...new Set(scanned.commits.map(c => c.repoDir).filter((d): d is string => !!d && path.isAbsolute(d)))].slice(0, 6)
      await resolveCommitShas(scanned.commits, [...fallbackDirs, ...seen], git)
      await fillRepoKeys([...scanned.commits, ...scanned.prs], git, repoKeys)
      index.commits.push(...scanned.commits)
      index.prs.push(...scanned.prs)
      state = { size, offset: state.offset + lastNl + 1, sessionId: t.sessionId, lines: state.lines + lines.length, open: scanned.open }
      index.files[t.file] = state
      changed = true
    }
    if (partial) break
  }

  // Commits that printed no sha and whose repository was not reachable yet get another try
  const nowIso = new Date(now()).toISOString()
  const RETRY_MS = 10 * 60 * 1000
  const stillOpen = index.commits
    .filter(c => !c.sha && c.via === 'unresolved' && (!c.retriedAt || now() - Date.parse(c.retriedAt) > RETRY_MS))
    .slice(-200)
  if (stillOpen.length > 0) {
    await resolveCommitShas(stillOpen, fallbackDirs, git)
    for (const c of stillOpen) c.retriedAt = nowIso
    changed = true
  }
  // Records written by an earlier version of the index, or whose directory was not there then, get a key now
  const unkeyed = [...index.commits, ...index.prs].filter(r => (!r.repoKey || !r.repoSlug) && (r.repoDir || (r as CommitRecord).foundIn)).slice(-300)
  if (unkeyed.length > 0 && (!opts.budgetMs || now() - started <= opts.budgetMs)) {
    await fillRepoKeys(unkeyed, git, repoKeys)
    if (unkeyed.some(r => r.repoKey || r.repoSlug)) changed = true
  }

  if (index.commits.length > MAX_COMMITS) index.commits = index.commits.slice(-MAX_COMMITS)
  if (index.prs.length > MAX_PRS) index.prs = index.prs.slice(-MAX_PRS)
  index.updatedAt = new Date(now()).toISOString()
  if (changed || transcripts.length > 0) {
    try { saveIndex(index) } catch (e) { console.error(`[commit-index] could not save the index of ${agent.id}:`, e) }
  }
  return { index, partial }
}
