/**
 * Memory card summarizer — the host's own Claude subscription.
 *
 * Jev decides WHAT is worth remembering but cannot write text. This turns each
 * flagged passage, read in the context of its whole exchange (and the one
 * before it), into a memory card: a one-line statement, a fixed-vocabulary
 * action, typed entities and relations between them.
 *
 * It runs `claude -p` with the cheapest model on the login every agent on the
 * host already uses, so there is no extra key. Verified on Claude Code 2.1.280:
 *   - NOT --bare: bare mode reads only ANTHROPIC_API_KEY, never the subscription.
 *   - --no-session-persistence: no transcript, so the summarizer's own output
 *     is never consolidated back into memory.
 *   - hooks off, no MCP servers, no tools, neutral cwd (no CLAUDE.md).
 */

import { spawn, execFileSync } from 'child_process'
import crypto from 'crypto'
import { tmux } from '@/lib/tmux-safe.mjs'
import fs from 'fs'
import os from 'os'
import path from 'path'

export const CARD_ACTIONS = [
  'decided', 'rejected', 'prefers', 'fixed', 'found_bug', 'discovered',
  'configured', 'deployed', 'replaced', 'requires', 'explained', 'planned', 'other',
] as const
export type CardAction = typeof CARD_ACTIONS[number]

export const ENTITY_TYPES = [
  'agent', 'person', 'host', 'service', 'repo', 'file', 'function', 'tool',
  'product', 'library', 'organization', 'concept', 'other',
] as const
export type EntityType = typeof ENTITY_TYPES[number]

export const RELATION_PREDICATES = [
  'uses', 'depends_on', 'runs_on', 'part_of', 'replaces', 'fixes', 'breaks',
  'configures', 'owns', 'stores', 'calls', 'prefers', 'decided_on', 'rejected',
  'related_to',
] as const
export type RelationPredicate = typeof RELATION_PREDICATES[number]

export interface CardJob {
  memory_id: string
  category: string
  /** The passage Jev flagged (verbatim, redacted) */
  passage: string
  /** The whole exchange it came from */
  exchange: string
  /** The exchange before it, as background */
  previous?: string
}

export interface GeneratedCard {
  memory_id: string
  skip: boolean
  statement: string
  action: CardAction
  entities: Array<{ name: string; type: EntityType }>
  relations: Array<{ subject: string; predicate: RelationPredicate; object: string }>
}

export class SummarizerError extends Error {
  /** A usage/rate limit: stop for this run, try again next run */
  constructor(message: string, public limited: boolean) { super(message) }
}

export const SUMMARIZER_MODEL = 'haiku'
const CALL_TIMEOUT_MS = 180_000
const MAX_BATCH = 12
const MAX_BATCH_CHARS = 60_000
const MAX_PREVIOUS_CHARS = 2_000

const SYSTEM_PROMPT = `You write long-term memory cards for an AI software agent from excerpts of its own past conversations with its user.

For each MEMORY you get the passage that was flagged as worth remembering, the whole exchange it came from, and the exchange before it as background. Read all of it: the card must capture what the passage means in context, not just repeat it.

For each memory return:
- statement: ONE self-contained sentence, at most 35 words, stating the durable knowledge: what was decided, found, preferred or learned, and why if it is given. Use specific names. Write it so it makes sense with no other context. Do not write "the user said" or "the assistant explained"; state the knowledge itself.
- action: what kind of knowledge it is, from the allowed list.
- entities: the NAMED, specific things the statement is about: systems, services, hosts, agents, people, repos, files, functions, tools, products, libraries, organizations. A concept only if it has a proper name in this project (e.g. "AMP", "pane readback"). Never generic words like "message", "fallback", "user", "server", "bug", "fix". Usually 1 to 5 entities. Use canonical names; when a name in KNOWN ENTITIES refers to the same thing, use that exact spelling.
- relations: subject/predicate/object triples between entity names from your own entities list, only when the excerpt states the relation.
- skip: true if, read in context, the passage holds nothing worth remembering beyond this conversation. Then leave statement empty.

Never include secrets, passwords, tokens or keys; text shown as [REDACTED] stays redacted.

Reply with ONLY a JSON object, no prose and no code fence, one card per MEMORY using its memory_id:
{"cards":[{"memory_id":"...","skip":false,"statement":"...","action":"${CARD_ACTIONS.join('|')}","entities":[{"name":"...","type":"${ENTITY_TYPES.join('|')}"}],"relations":[{"subject":"...","predicate":"${RELATION_PREDICATES.join('|')}","object":"..."}]}]}`

/** The JSON object in a model reply, tolerating a stray code fence or preamble. */
export function extractJson(text: string): unknown {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try { return JSON.parse(text.slice(start, end + 1)) } catch { return null }
}

// ---------------------------------------------------------------------------
// Finding claude — pm2's PATH often lacks it (seen: ~/.local/bin, /usr/local/bin, /usr/bin)
// ---------------------------------------------------------------------------

let resolvedClaude: string | null | undefined

/** "2.1.278 (Claude Code)" → [2, 1, 278] */
export function parseClaudeVersion(output: string): number[] | null {
  const m = output.match(/(\d+)\.(\d+)\.(\d+)/)
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
}

export function newerVersion(a: number[], b: number[]): boolean {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i]
  return false
}

/**
 * The newest `claude` on the host. Hosts can have several: mac-mini had a
 * stale Homebrew cask (2.0.33) at /usr/local/bin ahead of the current install
 * (2.1.278) in ~/.local/bin, and the old one rejects --no-session-persistence.
 * pm2's PATH also often lacks the right one (seen: ~/.local/bin, /usr/local/bin,
 * /usr/bin), so every known location is checked and the highest version wins.
 */
export function resolveClaudeBinary(): string | null {
  if (resolvedClaude !== undefined) return resolvedClaude
  const candidates = [
    process.env.CLAUDE_BIN,
    ...(process.env.PATH || '').split(path.delimiter).filter(Boolean).map(dir => path.join(dir, 'claude')),
    path.join(os.homedir(), '.local', 'bin', 'claude'),
    path.join(os.homedir(), '.claude', 'local', 'claude'),
    '/opt/homebrew/bin/claude',
    '/usr/local/bin/claude',
    '/usr/bin/claude',
  ].filter((p): p is string => Boolean(p))

  // An explicit CLAUDE_BIN wins outright
  if (process.env.CLAUDE_BIN) {
    try { fs.accessSync(process.env.CLAUDE_BIN, fs.constants.X_OK); return (resolvedClaude = process.env.CLAUDE_BIN) } catch { /* fall through */ }
  }

  // The login shell's claude (how agents launch it) is a candidate too
  try {
    const shell = process.env.SHELL || '/bin/bash'
    const out = execFileSync(shell, ['-lc', 'command -v claude'], { encoding: 'utf8', timeout: 10_000 }).trim().split('\n').pop()
    if (out) candidates.push(out)
  } catch { /* not found */ }

  let best: { bin: string; version: number[] } | null = null
  const seen = new Set<string>()
  for (const candidate of candidates) {
    let real: string
    try {
      fs.accessSync(candidate, fs.constants.X_OK)
      real = fs.realpathSync(candidate)
    } catch { continue }
    if (seen.has(real)) continue
    seen.add(real)
    let version: number[] | null = null
    try { version = parseClaudeVersion(execFileSync(candidate, ['--version'], { encoding: 'utf8', timeout: 15_000 })) } catch { /* unusable */ }
    if (!version) continue
    if (!best || newerVersion(version, best.version)) best = { bin: candidate, version }
  }
  if (best) console.log(`[MEMORY-CARDS] Using claude ${best.version.join('.')} at ${best.bin}`)
  return (resolvedClaude = best?.bin ?? null)
}

// ---------------------------------------------------------------------------
// Process-wide cap: every agent's nightly run shares the host's subscription
// ---------------------------------------------------------------------------

const MAX_CONCURRENT_CALLS = 2
let active = 0
const waiting: Array<() => void> = []
async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX_CONCURRENT_CALLS) await new Promise<void>(resolve => waiting.push(resolve))
  active++
  try { return await fn() } finally { active--; waiting.shift()?.() }
}

// ---------------------------------------------------------------------------
// Prompt building
// ---------------------------------------------------------------------------

function clip(text: string, max: number): string {
  if (text.length <= max) return text
  const half = Math.floor(max / 2)
  return `${text.slice(0, half)}\n[…]\n${text.slice(-half)}`
}

/** Split jobs into calls that stay under the per-call size limits. */
export function batchJobs(jobs: CardJob[]): CardJob[][] {
  const batches: CardJob[][] = []
  let current: CardJob[] = []
  let size = 0
  for (const job of jobs) {
    const jobSize = job.exchange.length + Math.min(job.previous?.length || 0, MAX_PREVIOUS_CHARS) + job.passage.length
    if (current.length > 0 && (current.length >= MAX_BATCH || size + jobSize > MAX_BATCH_CHARS)) {
      batches.push(current)
      current = []
      size = 0
    }
    current.push(job)
    size += jobSize
  }
  if (current.length > 0) batches.push(current)
  return batches
}

export function buildPrompt(jobs: CardJob[], knownEntities: string[]): string {
  const parts = jobs.map(job => [
    `### MEMORY ${job.memory_id}`,
    `CATEGORY: ${job.category}`,
    job.previous ? `PREVIOUS EXCHANGE (background only):\n${clip(job.previous, MAX_PREVIOUS_CHARS)}` : '',
    `EXCHANGE:\n${job.exchange || job.passage}`,
    `FLAGGED PASSAGE:\n>>> ${job.passage}`,
  ].filter(Boolean).join('\n\n'))
  const known = knownEntities.length > 0
    ? `KNOWN ENTITIES (use these exact names when they refer to the same thing): ${knownEntities.slice(0, 80).join(', ')}\n\n`
    : ''
  return `${known}Write one memory card for each of the ${jobs.length} memories below.\n\n${parts.join('\n\n---\n\n')}`
}

/** Keep only well-formed cards for memories that were asked about. */
export function parseCards(output: unknown, jobs: CardJob[]): GeneratedCard[] {
  const wanted = new Set(jobs.map(j => j.memory_id))
  const cards = (output as { cards?: unknown[] })?.cards
  if (!Array.isArray(cards)) return []
  const actions = new Set<string>(CARD_ACTIONS)
  const types = new Set<string>(ENTITY_TYPES)
  const predicates = new Set<string>(RELATION_PREDICATES)
  const out: GeneratedCard[] = []
  for (const raw of cards as any[]) {
    if (!raw || !wanted.has(raw.memory_id)) continue
    wanted.delete(raw.memory_id) // first card per memory wins
    const statement = String(raw.statement || '').trim()
    const skip = Boolean(raw.skip) || !statement
    out.push({
      memory_id: raw.memory_id,
      skip,
      statement,
      action: actions.has(raw.action) ? raw.action : 'other',
      entities: (Array.isArray(raw.entities) ? raw.entities : [])
        .filter((e: any) => e && typeof e.name === 'string' && e.name.trim())
        .map((e: any) => ({ name: e.name.trim().slice(0, 120), type: types.has(e.type) ? e.type : 'other' })),
      relations: (Array.isArray(raw.relations) ? raw.relations : [])
        .filter((r: any) => r && r.subject && r.object && predicates.has(r.predicate))
        .map((r: any) => ({ subject: String(r.subject).trim(), predicate: r.predicate, object: String(r.object).trim() })),
    })
  }
  return out
}

// ---------------------------------------------------------------------------
// The call
// ---------------------------------------------------------------------------

function workerDir(): string {
  const dir = path.join(os.homedir(), '.aimaestro', 'memory-worker')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

const LIMIT_PATTERN = /usage limit|rate limit|limit reached|too many requests|\b429\b|quota|overloaded/i

const NOT_LOGGED_IN = /not logged in|please run \/login|invalid api key|authentication/i

/**
 * macOS: a pm2 daemon started outside the login session cannot read the login
 * Keychain, so `claude` spawned from the server reports "Not logged in" even
 * though every agent on the host is logged in. Agents work because they run
 * inside tmux, whose server was started from the user's session. Once a direct
 * spawn fails that way, route through a short-lived hidden tmux session
 * (`…__call` names are excluded from agent discovery) for the rest of the
 * process's life.
 */
let viaTmux = false

function shellQuote(arg: string): string {
  return `'${arg.replace(/'/g, `'\\''`)}'`
}

function childEnv(): NodeJS.ProcessEnv {
  // Use the host's own login: a server-level API key would turn this into API
  // billing, and a parent Claude Code session's markers must not leak in.
  const env = { ...process.env }
  delete env.ANTHROPIC_API_KEY
  delete env.CLAUDECODE
  delete env.CLAUDE_CODE_ENTRYPOINT
  env.MAX_THINKING_TOKENS = '0'
  return env
}

interface RawResult { code: number | null; stdout: string; stderr: string }

function runDirect(claude: string, args: string[], prompt: string): Promise<RawResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(claude, args, { cwd: workerDir(), env: childEnv(), stdio: ['pipe', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new SummarizerError(`summarizer timed out after ${CALL_TIMEOUT_MS / 1000}s`, false))
    }, CALL_TIMEOUT_MS)
    child.stdout.on('data', d => { stdout += d })
    child.stderr.on('data', d => { stderr += d })
    child.on('error', err => { clearTimeout(timer); reject(new SummarizerError(`could not start claude: ${err.message}`, false)) })
    child.on('close', code => { clearTimeout(timer); resolve({ code, stdout, stderr }) })
    child.stdin.end(prompt)
  })
}

async function runViaTmux(claude: string, args: string[], prompt: string): Promise<RawResult> {
  const dir = workerDir()
  const id = `memsum-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`
  const file = (ext: string) => path.join(dir, `${id}.${ext}`)
  fs.writeFileSync(file('prompt'), prompt, { mode: 0o600 })
  fs.writeFileSync(file('sh'), [
    '#!/bin/bash',
    `cd ${shellQuote(dir)}`,
    'unset ANTHROPIC_API_KEY CLAUDECODE CLAUDE_CODE_ENTRYPOINT',
    'export MAX_THINKING_TOKENS=0',
    `${[claude, ...args].map(shellQuote).join(' ')} < ${shellQuote(file('prompt'))} > ${shellQuote(file('tmp'))} 2> ${shellQuote(file('err'))}`,
    `echo $? > ${shellQuote(file('code'))}`,
    `mv ${shellQuote(file('tmp'))} ${shellQuote(file('out'))}`,
  ].join('\n'), { mode: 0o700 })

  const session = `${id}__call`
  const cleanup = () => {
    for (const ext of ['prompt', 'sh', 'tmp', 'out', 'err', 'code']) fs.rmSync(file(ext), { force: true })
    tmux(['kill-session', '-t', session]).catch(() => { /* already gone */ })
  }
  try {
    await tmux(['new-session', '-d', '-s', session, `bash ${shellQuote(file('sh'))}`])
    const deadline = Date.now() + CALL_TIMEOUT_MS
    while (!fs.existsSync(file('out'))) {
      if (Date.now() > deadline) throw new SummarizerError(`summarizer timed out after ${CALL_TIMEOUT_MS / 1000}s`, false)
      await new Promise(resolve => setTimeout(resolve, 500))
    }
    const read = (ext: string) => { try { return fs.readFileSync(file(ext), 'utf8') } catch { return '' } }
    return { code: Number(read('code').trim() || 0), stdout: read('out'), stderr: read('err') }
  } finally {
    cleanup()
  }
}

export async function summarizeBatch(jobs: CardJob[], knownEntities: string[]): Promise<GeneratedCard[]> {
  const claude = resolveClaudeBinary()
  if (!claude) throw new SummarizerError('claude CLI not found on this host (set CLAUDE_BIN to its path)', false)

  const args = [
    '-p',
    '--model', SUMMARIZER_MODEL,
    '--tools', '',
    '--no-session-persistence',
    '--strict-mcp-config',
    // Thinking off: summarizing is not a reasoning task. With it on (even at
    // --effort low) 3 cards took 120-160 s and ~12-16k hidden output tokens;
    // off, 10 s and ~1k. --json-schema is not used either: it added validation
    // turns; the reply is plain JSON checked by parseCards.
    '--settings', JSON.stringify({ disableAllHooks: true, alwaysThinkingEnabled: false }),
    '--output-format', 'json',
    '--system-prompt', SYSTEM_PROMPT,
  ]
  const prompt = buildPrompt(jobs, knownEntities)

  return withSlot(async () => {
    let raw = viaTmux ? await runViaTmux(claude, args, prompt) : await runDirect(claude, args, prompt)
    let parsed = parseResult(raw)
    if (!viaTmux && isNotLoggedIn(raw, parsed)) {
      console.log('[MEMORY-CARDS] claude reports "Not logged in" from the server process; retrying inside tmux (keychain access)')
      viaTmux = true
      raw = await runViaTmux(claude, args, prompt)
      parsed = parseResult(raw)
    }
    if (raw.code !== 0 || !parsed || parsed.is_error) {
      const detail = String(parsed?.result || raw.stderr || raw.stdout || `exit ${raw.code}`).slice(0, 300)
      throw new SummarizerError(`summarizer failed: ${detail}`, LIMIT_PATTERN.test(detail))
    }
    return parseCards(extractJson(String(parsed.result ?? '')), jobs)
  })
}

function parseResult(raw: RawResult): any {
  try { return JSON.parse(raw.stdout) } catch { return null }
}

function isNotLoggedIn(raw: RawResult, parsed: any): boolean {
  return NOT_LOGGED_IN.test(String(parsed?.result || '') + raw.stderr + (parsed ? '' : raw.stdout))
}
