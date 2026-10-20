import { atom, update } from 'claude-code'
import type { EngineInterface as Engine, Register } from 'claude-code'

// An agent's own AI Maestro board, inside its terminal session. READ-ONLY: this mod never writes a
// card (the agent moves cards with aimaestro-task.sh, the agent-tasks skill). It matters most for
// agents that run without the AI Maestro dashboard, e.g. a lolabot.
//
// Where the cards come from, in order:
//   1. the AI Maestro server on this host: GET /api/agents/<id>/board (own cards + team cards, with the
//      quadrant); asked through curl, so the mod needs no other tool;
//   2. no server: ~/.aimaestro/agents/<id>/tasks.json, the file the server would have read (own cards only).
// Honest limits: the mods API is early access; the status line may be shared with other mods; project
// cards are not on the board yet.

const POLL_MS = 30_000
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/ // the same rule the server uses for a folder name
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DEFAULT_API = 'http://localhost:23000'

export type Card = {
  id: string
  subject: string
  status: string
  quadrant: string | null
  waitingOn?: string
  waitingNote?: string
  scope?: string
  teamName?: string
}

export type Summary = { open: number; waitingOnMe: number } | null

const summary = atom({ plugin: 'ai-maestro-board', key: 'summary' } as const, null as Summary)

let cards: Card[] = []
let source: 'server' | 'file' | null = null
let who = ''

/** No control, separator or escape characters, bounded length: card text comes from other people and agents. */
export function clean(text: unknown, limit = 120): string {
  const chars = Array.from(String(text ?? ''), c => (c === ' ' || !/[\p{C}\p{Z}]/u.test(c) ? c : ' '))
  const s = chars.join('').replace(/\s+/g, ' ').trim()
  return s.length <= limit ? s : s.slice(0, limit - 1) + '…'
}

// Everything the logic needs from the engine, so tests can hand it a world from memory.
export type EnvName = 'HOME' | 'AIM_AGENT_ID' | 'CLAUDE_AGENT_ID' | 'AMP_DIR' | 'AIM_AGENT_NAME' | 'CLAUDE_AGENT_NAME' | 'AIMAESTRO_API'

export type IO = {
  env: (name: EnvName) => Promise<string | undefined>
  run: (argv: string[], timeoutMs: number) => Promise<{ exitCode: number; stdout: string }>
  read: (path: string) => Promise<string | null>
}

const ioOf = ($: Engine): IO => ({
  // $.env.get takes a literal name, so the variables this mod reads can be listed
  env: async name => {
    switch (name) {
      case 'HOME': return (await $.env.get('HOME')) ?? undefined
      case 'AIM_AGENT_ID': return (await $.env.get('AIM_AGENT_ID')) ?? undefined
      case 'CLAUDE_AGENT_ID': return (await $.env.get('CLAUDE_AGENT_ID')) ?? undefined
      case 'AMP_DIR': return (await $.env.get('AMP_DIR')) ?? undefined
      case 'AIM_AGENT_NAME': return (await $.env.get('AIM_AGENT_NAME')) ?? undefined
      case 'CLAUDE_AGENT_NAME': return (await $.env.get('CLAUDE_AGENT_NAME')) ?? undefined
      default: return (await $.env.get('AIMAESTRO_API')) ?? undefined
    }
  },
  run: async (argv, timeoutMs) => {
    const r = await $.process.run(argv, { timeoutMs })
    return { exitCode: r.exitCode, stdout: r.stdout }
  },
  read: async path => {
    try {
      return String(await $.fs.read(path))
    } catch {
      return null
    }
  },
})

/** Quadrant from the two answers; null unless BOTH are given (false/false is q4, not "unplaced"). */
export function quadrantOf(urgent: unknown, important: unknown): string | null {
  if (typeof urgent !== 'boolean' || typeof important !== 'boolean') return null
  return urgent ? (important ? 'q1' : 'q3') : (important ? 'q2' : 'q4')
}

/**
 * Which agent is this? The way amp-helper.sh does it, with the plugin option first:
 * option agentId, AIM_AGENT_ID (set in sessions AI Maestro starts), CLAUDE_AGENT_ID, the folder name in AMP_DIR,
 * then a name (AIM_AGENT_NAME, CLAUDE_AGENT_NAME) that the server can turn into an id.
 */
export async function identify(io: IO, option: unknown): Promise<{ id?: string; name?: string }> {
  const candidates: Array<string | undefined> = [
    typeof option === 'string' && option.trim() ? option.trim() : undefined,
    await io.env('AIM_AGENT_ID'),
    await io.env('CLAUDE_AGENT_ID'),
  ]
  const amp = await io.env('AMP_DIR')
  if (amp) candidates.push(amp.replace(/\/+$/, '').split('/').pop())
  for (const c of candidates) if (c && ID_RE.test(c)) return { id: c }
  for (const name of [await io.env('AIM_AGENT_NAME'), await io.env('CLAUDE_AGENT_NAME')]) {
    if (name && ID_RE.test(name)) return { name }
  }
  return {}
}

function toCard(raw: any): Card | null {
  if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || typeof raw.subject !== 'string' || typeof raw.status !== 'string') return null
  return {
    id: raw.id,
    subject: raw.subject,
    status: raw.status,
    quadrant: typeof raw.quadrant === 'string' ? raw.quadrant : quadrantOf(raw.urgent, raw.important),
    waitingOn: typeof raw.waitingOn === 'string' ? raw.waitingOn : undefined,
    waitingNote: typeof raw.waitingNote === 'string' ? raw.waitingNote : undefined,
    scope: typeof raw.scope === 'string' ? raw.scope : undefined,
    teamName: typeof raw.teamName === 'string' ? raw.teamName : undefined,
  }
}

function parseCards(text: string, key: 'cards' | 'tasks'): Card[] | null {
  try {
    const data = JSON.parse(text)
    const list = data?.[key]
    if (!Array.isArray(list)) return null
    return list.map(toCard).filter((c): c is Card => c !== null)
  } catch {
    return null
  }
}

async function get(io: IO, api: string, path: string): Promise<string | null> {
  try {
    const r = await io.run(['curl', '-sS', '--max-time', '5', '-f', `${api}${path}`], 8000)
    return r.exitCode === 0 ? r.stdout : null
  } catch {
    return null
  }
}

/** The cards of one agent: from the server, else from the board file. null when neither answers. */
export async function load(io: IO, option: unknown, apiOption: unknown): Promise<{ cards: Card[]; source: 'server' | 'file'; id: string } | null> {
  const home = (await io.env('HOME')) ?? ''
  const api = ((typeof apiOption === 'string' && apiOption.trim()) || (await io.env('AIMAESTRO_API')) || DEFAULT_API).replace(/\/+$/, '')
  const me = await identify(io, option)
  let id = me.id
  if (!id && me.name) {
    // only a name: ask the server which agent that is
    const list = await get(io, api, '/api/agents')
    try {
      const agents = JSON.parse(list ?? '{}').agents as Array<{ id: string; name?: string; alias?: string }> | undefined
      id = agents?.find(a => a.name === me.name || a.alias === me.name)?.id
    } catch { /* no server, no id */ }
  }
  if (!id || !ID_RE.test(id)) return null

  const body = await get(io, api, `/api/agents/${encodeURIComponent(id)}/board`)
  const fromServer = body === null ? null : parseCards(body, 'cards')
  if (fromServer) return { cards: fromServer, source: 'server', id }

  const file = await io.read(`${home}/.aimaestro/agents/${id}/tasks.json`)
  const fromFile = file === null ? null : parseCards(file, 'tasks')
  return fromFile ? { cards: fromFile, source: 'file', id } : null
}

export function summarize(list: Card[]): Summary {
  const open = list.filter(c => c.status !== 'completed' && c.status !== 'backlog')
  if (open.length === 0) return { open: 0, waitingOnMe: 0 }
  return { open: open.length, waitingOnMe: open.filter(c => c.status === 'waiting' && c.waitingOn === 'juan').length }
}

export function statusText(s: Summary): string | undefined {
  if (!s || s.open === 0) return undefined
  return `board: ${s.open} open${s.waitingOnMe > 0 ? `, ${s.waitingOnMe} waiting on you` : ''}`
}

const COLUMNS: Array<[string, string]> = [
  ['pending', 'To Do'], ['in_progress', 'In Progress'], ['review', 'Review'], ['waiting', 'Waiting'], ['backlog', 'Backlog'],
]

function waitingLabel(c: Card): string {
  const on = c.waitingOn
  const base = !on ? 'waiting' : on === 'juan' ? 'waiting on you' : on === 'outside' ? 'waiting on someone outside' : on === 'hold' ? 'on hold' : `waiting on ${clean(on, 40)}`
  return c.waitingNote ? `${base}: ${clean(c.waitingNote, 80)}` : base
}

/** The board as text, by column. Completed cards are not shown. */
export function render(list: Card[], opts: { who: string; source: 'server' | 'file' }): string {
  const open = list.filter(c => c.status !== 'completed')
  const s = summarize(list)
  const lines: string[] = [`Board of ${clean(opts.who, 60)}: ${s?.open ?? 0} open${s && s.waitingOnMe > 0 ? `, ${s.waitingOnMe} waiting on you` : ''}${opts.source === 'file' ? '  (from the board file; no AI Maestro server answered, team cards are not shown)' : ''}`]
  if (open.length === 0) {
    lines.push('No open cards.')
    return lines.join('\n')
  }
  for (const [status, label] of COLUMNS) {
    const col = open.filter(c => c.status === status)
    if (col.length === 0) continue
    lines.push('', `${label} (${col.length})`)
    for (const c of col) {
      const q = c.quadrant ? c.quadrant.toUpperCase() : '--'
      const team = c.scope === 'team' && c.teamName ? `  (team: ${clean(c.teamName, 40)})` : ''
      lines.push(`  ${clean(c.id.slice(0, 8), 8)}  ${q}  ${clean(c.subject)}${status === 'waiting' ? `  [${waitingLabel(c)}]` : ''}${team}`)
    }
  }
  lines.push('', 'Q1 do first, Q2 schedule, Q3 delegate, Q4 delete, -- not placed. Move cards with aimaestro-task.sh (the agent-tasks skill).')
  return lines.join('\n')
}

async function refresh($: Engine, options: Record<string, unknown>) {
  const r = await load(ioOf($), options.agentId, options.apiUrl)
  if (!r) {
    cards = []
    source = null
    await update($, summary, () => null)
    $.ui.status(undefined)
    return
  }
  cards = r.cards
  source = r.source
  who = r.id
  const s = summarize(cards)
  await update($, summary, () => s)
  $.ui.status(options.showStatus === false ? undefined : statusText(s))
}

export const register: Register = (on, options) => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'board', description: 'Show your AI Maestro task board: cards by column, what each waits on, its quadrant' })
    await refresh($, options as Record<string, unknown>)
    $.clock.every(POLL_MS, () => { void refresh($, options as Record<string, unknown>) })
    return next(e)
  })

  on('command.run', { command: 'board' }, async $ => {
    await refresh($, options as Record<string, unknown>)
    if (!source) {
      const me = await identify(ioOf($), (options as Record<string, unknown>).agentId)
      return { text: me.id || me.name
        ? `No board found for ${clean(me.id || me.name, 60)}: the AI Maestro server did not answer and there is no board file for it.`
        : 'I do not know which agent this is. Inside AI Maestro it is set for you; elsewhere set the "Agent id" option of this mod to the agent\'s AMP identity id.' }
    }
    return { text: render(cards, { who: UUID_RE.test(who) ? who.slice(0, 8) : who, source }) }
  })
}
