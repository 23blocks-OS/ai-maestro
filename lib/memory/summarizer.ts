/**
 * Memory card summarizer — the host's own Claude subscription.
 *
 * Jev flags passages that MIGHT be worth remembering but cannot write text.
 * This reads ONE session's flagged passages together, each with the exchange it
 * came from, and writes at most a few memory cards: only knowledge worth having
 * in a future session, merged where passages say the same thing, each citing
 * the passages it rests on. Zero cards is a valid answer. (Judging passage by
 * passage kept 15-37% of everything; a paragraph rarely shows it will matter
 * again. Recurrence across sessions decides that; see lib/memory/recurrence.ts.)
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
] as const
export type RelationPredicate = typeof RELATION_PREDICATES[number]

export const CARD_CATEGORIES = ['fact', 'decision', 'preference', 'pattern', 'insight', 'reasoning'] as const
export type CardCategory = typeof CARD_CATEGORIES[number]

/** A passage Jev flagged, with where it came from. */
export interface Candidate {
  /** 1-based number the summarizer cites as evidence */
  n: number
  passage: string
  /** Jev's category guess */
  category: string
  /** Which exchange (chunk) it belongs to, for grouping */
  exchangeKey: string
  exchange: string
  previous?: string
}

export interface GeneratedCard {
  statement: string
  category: CardCategory
  action: CardAction
  entities: Array<{ name: string; type: EntityType }>
  relations: Array<{ subject: string; predicate: RelationPredicate; object: string }>
  /** Candidate numbers this card rests on */
  evidence: number[]
}

export class SummarizerError extends Error {
  /** A usage/rate limit: stop for this run, try again next run */
  constructor(message: string, public limited: boolean) { super(message) }
}

export const SUMMARIZER_MODEL = 'haiku'
const CALL_TIMEOUT_MS = 180_000
const MAX_PREVIOUS_CHARS = 1_500
/** Per call; a session larger than this is split into several calls */
export const MAX_SESSION_CHARS = 60_000
/** Cards per call: few, merged, only what a future session needs */
export function maxCardsFor(candidates: number): number {
  return Math.max(1, Math.min(5, Math.ceil(candidates / 3)))
}

const SYSTEM_PROMPT = `You maintain the long-term memory of an AI software agent. You get passages from ONE of its work sessions that a filter flagged as possibly worth remembering, each shown with the exchange it came from.

Write memory cards ONLY for knowledge the agent will need in a FUTURE session: decisions and their reasons, stable facts about systems, hosts, people and the environment, the user's preferences, recurring patterns and gotchas, lessons that change how to work. Merge passages that say the same thing into one card. Do NOT write cards for: what was done today, progress and status updates, narration of a debugging session, anything that only matters for this session's task. Fewer, better cards. Zero cards is a correct answer when nothing qualifies.

Each card:
- statement: ONE self-contained sentence, at most 35 words, stating the durable knowledge and why if given. Specific names. It must make sense with no other context. Never "the user said" / "the assistant found": state the knowledge itself.
- category: fact | decision | preference | pattern | insight | reasoning
- action: what kind of knowledge it is, from the allowed list.
- entities: the NAMED specific things it is about (systems, services, hosts, agents, people, repos, files, functions, tools, products, libraries, organizations; a concept only if it has a proper name here). Never generic words. Usually 1 to 5. When a name in KNOWN ENTITIES is the same thing, use that exact spelling.
- relations: how the entities relate, as subject/predicate/object between your entity names. When a card has two or more entities, state how they relate if the excerpt says so (X runs_on Y, X depends_on Y, X replaces Y, X fixes Y, X part_of Y, X uses Y, X calls Y). Leave relations empty rather than guess; "related" is not a relation.
- evidence: the numbers of the flagged passages the card rests on.

Never include secrets, passwords, tokens or keys; [REDACTED] stays redacted.

Reply with ONLY a JSON object, no prose and no code fence:
{"cards":[{"statement":"...","category":"${CARD_CATEGORIES.join('|')}","action":"${CARD_ACTIONS.join('|')}","entities":[{"name":"...","type":"${ENTITY_TYPES.join('|')}"}],"relations":[{"subject":"...","predicate":"${RELATION_PREDICATES.join('|')}","object":"..."}],"evidence":[1,2]}]}`

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

/**
 * Split a session's candidates into calls under the size limit, never splitting
 * one exchange across calls (its passages are judged together).
 */
export function batchCandidates<T extends Candidate>(candidates: T[]): T[][] {
  const batches: T[][] = []
  let current: T[] = []
  let size = 0
  let lastKey = ''
  for (const c of candidates) {
    const newExchange = c.exchangeKey !== lastKey
    const cost = (newExchange ? c.exchange.length + Math.min(c.previous?.length || 0, MAX_PREVIOUS_CHARS) : 0) + c.passage.length
    if (newExchange && current.length > 0 && size + cost > MAX_SESSION_CHARS) {
      batches.push(current)
      current = []
      size = 0
    }
    current.push(c)
    size += cost
    lastKey = c.exchangeKey
  }
  if (current.length > 0) batches.push(current)
  return batches
}

export function buildSessionPrompt(candidates: Candidate[], knownEntities: string[], maxCards: number): string {
  const groups: Candidate[][] = []
  for (const c of candidates) {
    const last = groups[groups.length - 1]
    if (last && last[0].exchangeKey === c.exchangeKey) last.push(c)
    else groups.push([c])
  }
  const parts = groups.map((g, i) => [
    `### EXCHANGE ${i + 1}`,
    g[0].previous ? `BACKGROUND (the exchange before it):\n${clip(g[0].previous, MAX_PREVIOUS_CHARS)}` : '',
    `EXCHANGE:\n${g[0].exchange || g.map(c => c.passage).join('\n\n')}`,
    `FLAGGED PASSAGES:\n${g.map(c => `[${c.n}] (${c.category}) >>> ${c.passage}`).join('\n\n')}`,
  ].filter(Boolean).join('\n\n'))
  const known = knownEntities.length > 0
    ? `KNOWN ENTITIES (use these exact names when they refer to the same thing): ${knownEntities.slice(0, 80).join(', ')}\n\n`
    : ''
  return `${known}${candidates.length} flagged passages from one work session follow. Write AT MOST ${maxCards} memory cards (zero is fine).\n\n${parts.join('\n\n---\n\n')}`
}

/**
 * Words that name a kind of thing, not a thing. As graph nodes they connect
 * unrelated memories ("attachments", "config", "tests" appear everywhere) and
 * turn the entity graph into a hairball. Measured on the first real graph:
 * "attachments" was the second-biggest node.
 */
const GENERIC_ENTITIES = new Set([
  'agent', 'agents', 'api', 'apis', 'app', 'application', 'attachment', 'attachments', 'backend', 'bug', 'bugs',
  'cache', 'cli', 'client', 'code', 'codebase', 'config', 'configuration', 'data', 'database', 'db', 'deploy',
  'deployment', 'dashboard', 'docs', 'documentation', 'endpoint', 'endpoints', 'error', 'errors', 'feature',
  'file', 'files', 'fix', 'fixes', 'frontend', 'function', 'hook', 'hooks', 'host', 'hosts', 'issue', 'issues',
  'key', 'keys', 'log', 'logs', 'memory', 'memories', 'message', 'messages', 'model', 'models', 'network',
  'pr', 'prs', 'project', 'prompt', 'repo', 'repository', 'request', 'requests', 'script', 'scripts', 'server',
  'servers', 'service', 'services', 'session', 'sessions', 'settings', 'system', 'task', 'tasks', 'test', 'tests',
  'token', 'tokens', 'tool', 'tools', 'ui', 'user', 'users', 'version', 'workflow',
])

export function isGenericEntity(name: string, type?: string): boolean {
  const n = name.trim().toLowerCase().replace(/[`"'.]/g, '')
  if (GENERIC_ENTITIES.has(n)) return true
  // A snake_case "concept" (attachment_limits) is an attribute, not a thing;
  // a snake_case table, file or function is a real named entity.
  if ((type === 'concept' || type === 'other') && /^[a-z]+(_[a-z]+)+$/.test(n)) return true
  return false
}

/** Keep well-formed cards; coerce off-list values; drop evidence that was never offered. */
export function parseSessionCards(output: unknown, candidates: Candidate[], maxCards: number): GeneratedCard[] {
  const cards = (output as { cards?: unknown[] })?.cards
  if (!Array.isArray(cards)) return []
  const valid = new Set(candidates.map(c => c.n))
  const categories = new Set<string>(CARD_CATEGORIES)
  const actions = new Set<string>(CARD_ACTIONS)
  const types = new Set<string>(ENTITY_TYPES)
  const predicates = new Set<string>(RELATION_PREDICATES)
  const out: GeneratedCard[] = []
  for (const raw of cards as any[]) {
    const statement = String(raw?.statement || '').trim()
    if (!statement) continue
    const evidence = (Array.isArray(raw.evidence) ? raw.evidence : []).map(Number).filter((n: number) => valid.has(n))
    if (evidence.length === 0) continue // a card must rest on something that was flagged
    out.push({
      statement,
      category: categories.has(raw.category) ? raw.category : 'insight',
      action: actions.has(raw.action) ? raw.action : 'other',
      entities: (Array.isArray(raw.entities) ? raw.entities : [])
        .filter((e: any) => e && typeof e.name === 'string' && e.name.trim() && !isGenericEntity(e.name, e.type))
        .map((e: any) => ({ name: e.name.trim().slice(0, 120), type: types.has(e.type) ? e.type : 'other' })),
      relations: (Array.isArray(raw.relations) ? raw.relations : [])
        .filter((r: any) => r && r.subject && r.object && predicates.has(r.predicate))
        .map((r: any) => ({ subject: String(r.subject).trim(), predicate: r.predicate, object: String(r.object).trim() })),
      evidence: [...new Set<number>(evidence)],
    })
    if (out.length >= maxCards) break
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

export async function summarizeSession(candidates: Candidate[], knownEntities: string[]): Promise<GeneratedCard[]> {
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
  const maxCards = maxCardsFor(candidates.length)
  const prompt = buildSessionPrompt(candidates, knownEntities, maxCards)

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
    return parseSessionCards(extractJson(String(parsed.result ?? '')), candidates, maxCards)
  })
}

function parseResult(raw: RawResult): any {
  try { return JSON.parse(raw.stdout) } catch { return null }
}

function isNotLoggedIn(raw: RawResult, parsed: any): boolean {
  return NOT_LOGGED_IN.test(String(parsed?.result || '') + raw.stderr + (parsed ? '' : raw.stdout))
}
