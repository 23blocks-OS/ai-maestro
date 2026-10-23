/**
 * Who works with whom, and what is waiting on whom. Pure, so the World view's relations and work
 * lenses are tested without a canvas.
 *
 * Two kinds of tie between two agents, both read from data the app already holds:
 *   talk  they exchanged AMP messages (the delivery log: sender name -> recipient id)
 *   task  a card connects them: one created it and the other holds it, it waits on the other, or the
 *         other co-owns it
 * Ties are undirected here (the lens draws "these two work together"); the weight is how many.
 * Team membership is not a tie: a team is drawn as a set (see the page), because a team of ten is
 * not forty lines.
 */

export interface EventLike {
  id: string
  /** Delivery time, epoch ms */
  ts: number
  /** Sender, as the name in its AMP address */
  from: string
  toAgentId: string
}

/** The least of an open card this module needs; `MeshCard` (hooks/useOpenTasks.ts) satisfies it */
export interface CardLike {
  id: string
  subject: string
  status: string
  /** The board the card is on (an agent's own board); the assignee when `assigneeAgentId` is not set */
  agentId?: string
  assigneeAgentId?: string | null
  waitingOn?: string
  waitingNote?: string
  owners?: string[] | null
  origin?: { agentId?: string }
  /** YYYY-MM-DD */
  due?: string | null
  updatedAt?: string
}

export type TieKind = 'talk' | 'task' | 'report'

export interface AgentTie {
  /** Agent ids, a < b */
  a: string
  b: string
  kind: TieKind
  weight: number
}

/** waitingOn values that are not an agent */
const FIXED_WAITING = new Set(['juan', 'outside', 'hold'])

const pairKey = (x: string, y: string, kind: TieKind) => (x < y ? `${x}|${y}|${kind}` : `${y}|${x}|${kind}`)

function add(map: Map<string, AgentTie>, x: string | undefined, y: string | undefined, kind: TieKind, weight = 1) {
  if (!x || !y || x === y) return
  const key = pairKey(x, y, kind)
  const prev = map.get(key)
  if (prev) prev.weight += weight
  else map.set(key, { a: x < y ? x : y, b: x < y ? y : x, kind, weight })
}

/** Sender names (and aliases) to agent ids, case-insensitive. The first agent to claim a name keeps it. */
export function idByName(agents: Array<{ id: string; name?: string; alias?: string }>): Map<string, string> {
  const m = new Map<string, string>()
  for (const a of agents) {
    for (const n of [a.name, a.alias]) {
      if (n && !m.has(n.toLowerCase())) m.set(n.toLowerCase(), a.id)
    }
  }
  return m
}

/** Pairs that exchanged messages; a sender the fleet does not know (an outsider) is skipped */
export function talkTies(events: EventLike[], byName: Map<string, string>): AgentTie[] {
  const out = new Map<string, AgentTie>()
  for (const e of events) add(out, byName.get(e.from.toLowerCase()), e.toAgentId, 'talk')
  return [...out.values()]
}

/** `resolve` turns an id or a name as written on a card into an agent id (or nothing) */
export function taskTies(cards: CardLike[], resolve: (ref: string) => string | undefined): AgentTie[] {
  const out = new Map<string, AgentTie>()
  for (const c of cards) {
    if (c.status === 'completed') continue
    const holder = c.assigneeAgentId || c.agentId
    if (!holder) continue
    add(out, c.origin?.agentId, holder, 'task')
    if (c.waitingOn && !FIXED_WAITING.has(c.waitingOn)) add(out, holder, resolve(c.waitingOn), 'task')
    for (const o of c.owners || []) add(out, holder, resolve(o), 'task')
  }
  return [...out.values()]
}

/** A tie between two groups (islands or buildings), with what connects them */
export interface GroupArc {
  /** Group keys, from < to */
  from: string
  to: string
  weight: number
  kinds: TieKind[]
}

/**
 * Ties lifted to the groups the agents stand in: the arcs between different groups, and how many ties
 * stay inside each group. An agent in no group (hidden, say) drops its ties.
 */
export function liftTies(ties: AgentTie[], groupOf: Map<string, string>): { arcs: GroupArc[]; within: Map<string, number> } {
  const arcs = new Map<string, GroupArc>()
  const within = new Map<string, number>()
  for (const t of ties) {
    const ga = groupOf.get(t.a)
    const gb = groupOf.get(t.b)
    if (!ga || !gb) continue
    if (ga === gb) { within.set(ga, (within.get(ga) || 0) + t.weight); continue }
    const from = ga < gb ? ga : gb
    const to = ga < gb ? gb : ga
    const key = `${from}|${to}`
    const arc = arcs.get(key) || { from, to, weight: 0, kinds: [] as TieKind[] }
    arc.weight += t.weight
    if (!arc.kinds.includes(t.kind)) arc.kinds.push(t.kind)
    arcs.set(key, arc)
  }
  return { arcs: [...arcs.values()].sort((x, y) => y.weight - x.weight), within }
}

/** Ties among a set of agents (those in one building) */
export function tiesAmong(ties: AgentTie[], ids: Set<string>): AgentTie[] {
  return ties.filter(t => ids.has(t.a) && ids.has(t.b))
}

/** How many agents outside `ids` each agent in `ids` is tied to (shown on the agent's card) */
export function outsideTies(ties: AgentTie[], ids: Set<string>): Map<string, number> {
  const out = new Map<string, number>()
  for (const t of ties) {
    const ina = ids.has(t.a), inb = ids.has(t.b)
    if (ina === inb) continue
    const inside = ina ? t.a : t.b
    out.set(inside, (out.get(inside) || 0) + 1)
  }
  return out
}

/** What one agent has on its plate */
export interface WorkSummary {
  open: number
  waitingOnYou: number
  overdue: number
  /** The card that most needs you (waiting on you, soonest due first, then longest waiting) */
  ask?: { id: string; subject: string; note?: string }
}

const byUrgency = (a: CardLike, b: CardLike) =>
  (a.due || '9999-12-31').localeCompare(b.due || '9999-12-31') || (a.updatedAt || '').localeCompare(b.updatedAt || '')

/** `today` is the reader's local date, YYYY-MM-DD */
export function workByAgent(cards: CardLike[], today: string): Map<string, WorkSummary> {
  const out = new Map<string, WorkSummary>()
  const asks = new Map<string, CardLike[]>()
  for (const c of cards) {
    if (c.status === 'completed') continue
    const id = c.assigneeAgentId || c.agentId
    if (!id) continue
    const w = out.get(id) || { open: 0, waitingOnYou: 0, overdue: 0 }
    w.open += 1
    if (c.due && c.due < today) w.overdue += 1
    if (c.status === 'waiting' && c.waitingOn === 'juan') {
      w.waitingOnYou += 1
      asks.set(id, [...(asks.get(id) || []), c])
    }
    out.set(id, w)
  }
  for (const [id, list] of asks) {
    const top = [...list].sort(byUrgency)[0]
    out.get(id)!.ask = { id: top.id, subject: top.subject, note: top.waitingNote }
  }
  return out
}

/** Every card waiting on you, most urgent first */
export function waitingOnYou<T extends CardLike>(cards: T[]): T[] {
  return cards.filter(c => c.status === 'waiting' && c.waitingOn === 'juan').sort(byUrgency)
}

/** Deliveries after `from` and up to `to` (the replay hands these out as its clock passes them) */
export function eventsBetween<T extends { ts: number }>(events: T[], from: number, to: number): T[] {
  return events.filter(e => e.ts > from && e.ts <= to)
}

/** Deliveries in the span ending at `until` (the relations lens shows what happened lately) */
export function eventsWithin<T extends { ts: number }>(events: T[], until: number, spanMs: number): T[] {
  return events.filter(e => e.ts <= until && e.ts > until - spanMs)
}

/** Reporting lines: one tie from each agent to its manager agent (a person as manager is not an agent, so it has no line) */
export function reportTies(agents: Array<{ id: string; managerAgentId?: string }>, known: (id: string) => boolean): AgentTie[] {
  const out = new Map<string, AgentTie>()
  for (const a of agents) {
    const m = a.managerAgentId?.toLowerCase()
    if (m && known(m)) add(out, a.id, m, 'report')
  }
  return [...out.values()]
}
