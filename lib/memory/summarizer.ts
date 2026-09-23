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

export const SYSTEM_PROMPT = `You write long-term memory cards for an AI software agent from excerpts of its own past conversations with its user.

For each MEMORY you get the passage that was flagged as worth remembering, the whole exchange it came from, and the exchange before it as background. Read all of it: the card must capture what the passage means in context, not just repeat it.

For each memory return:
- statement: ONE self-contained sentence, at most 35 words, stating the durable knowledge: what was decided, found, preferred or learned, and why if it is given. Use specific names. Write it so it makes sense with no other context. Do not write "the user said" or "the assistant explained"; state the knowledge itself.
- action: what kind of knowledge it is, from the allowed list.
- entities: the NAMED, specific things the statement is about: systems, services, hosts, agents, people, repos, files, functions, tools, products, libraries, organizations. A concept only if it has a proper name in this project (e.g. "AMP", "pane readback"). Never generic words like "message", "fallback", "user", "server", "bug", "fix". Usually 1 to 5 entities. Use canonical names; when a name in KNOWN ENTITIES refers to the same thing, use that exact spelling.
- relations: subject/predicate/object triples between entity names from your own entities list, only when the excerpt states the relation.
- skip: true if, read in context, the passage holds nothing worth remembering beyond this conversation. Then leave statement empty.

Never include secrets, passwords, tokens or keys; text shown as [REDACTED] stays redacted. Output only the JSON requested, one card per MEMORY, using its memory_id.`

export const CARDS_SCHEMA = {
  type: 'object',
  properties: {
    cards: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          memory_id: { type: 'string' },
          skip: { type: 'boolean' },
          statement: { type: 'string' },
          action: { type: 'string', enum: [...CARD_ACTIONS] },
          entities: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                type: { type: 'string', enum: [...ENTITY_TYPES] },
              },
              required: ['name', 'type'],
            },
          },
          relations: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                subject: { type: 'string' },
                predicate: { type: 'string', enum: [...RELATION_PREDICATES] },
                object: { type: 'string' },
              },
              required: ['subject', 'predicate', 'object'],
            },
          },
        },
        required: ['memory_id', 'skip', 'statement', 'action', 'entities', 'relations'],
      },
    },
  },
  required: ['cards'],
}

// ---------------------------------------------------------------------------
// Finding claude — pm2's PATH often lacks it (seen: ~/.local/bin, /usr/local/bin, /usr/bin)
// ---------------------------------------------------------------------------

let resolvedClaude: string | null | undefined

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
  for (const candidate of candidates) {
    try {
      fs.accessSync(candidate, fs.constants.X_OK)
      return (resolvedClaude = candidate)
    } catch { /* next */ }
  }
  // Last resort: the login shell's PATH, which is how agents launch it
  try {
    const shell = process.env.SHELL || '/bin/bash'
    const out = execFileSync(shell, ['-lc', 'command -v claude'], { encoding: 'utf8', timeout: 10_000 }).trim().split('\n').pop()
    if (out && fs.existsSync(out)) return (resolvedClaude = out)
  } catch { /* not found */ }
  return (resolvedClaude = null)
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

export async function summarizeBatch(jobs: CardJob[], knownEntities: string[]): Promise<GeneratedCard[]> {
  const claude = resolveClaudeBinary()
  if (!claude) throw new SummarizerError('claude CLI not found on this host (set CLAUDE_BIN to its path)', false)

  const args = [
    '-p',
    '--model', SUMMARIZER_MODEL,
    // Summarizing is not a reasoning task; default effort thinks for ~25 s per card
    '--effort', 'low',
    '--tools', '',
    '--no-session-persistence',
    '--strict-mcp-config',
    '--settings', JSON.stringify({ disableAllHooks: true }),
    '--output-format', 'json',
    '--system-prompt', SYSTEM_PROMPT,
    '--json-schema', JSON.stringify(CARDS_SCHEMA),
  ]
  const prompt = buildPrompt(jobs, knownEntities)

  return withSlot(() => new Promise<GeneratedCard[]>((resolve, reject) => {
    // Use the host's own login: a server-level API key would turn this into API
    // billing, and a parent Claude Code session's markers must not leak in.
    const env = { ...process.env }
    delete env.ANTHROPIC_API_KEY
    delete env.CLAUDECODE
    delete env.CLAUDE_CODE_ENTRYPOINT
    const child = spawn(claude, args, {
      cwd: workerDir(),
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new SummarizerError(`summarizer timed out after ${CALL_TIMEOUT_MS / 1000}s`, false))
    }, CALL_TIMEOUT_MS)

    child.stdout.on('data', d => { stdout += d })
    child.stderr.on('data', d => { stderr += d })
    child.on('error', err => { clearTimeout(timer); reject(new SummarizerError(`could not start claude: ${err.message}`, false)) })
    child.on('close', code => {
      clearTimeout(timer)
      let parsed: any = null
      try { parsed = JSON.parse(stdout) } catch { /* handled below */ }
      if (code !== 0 || !parsed || parsed.is_error) {
        const detail = String(parsed?.result || stderr || stdout || `exit ${code}`).slice(0, 300)
        reject(new SummarizerError(`summarizer failed: ${detail}`, LIMIT_PATTERN.test(detail)))
        return
      }
      resolve(parseCards(parsed.structured_output, jobs))
    })
    child.stdin.end(prompt)
  }))
}
