/**
 * Relations between entities: the part of memory an agent acts on.
 *
 * An agent that operates on systems needs to know, before it touches something,
 * what depends on it, where it runs, what it stores, and what went wrong the
 * last time it changed. Those are directed, typed relations between entities,
 * and they change over time: a service moves hosts, a bucket is retired. So a
 * relation is not a fact stated once; it is the latest of its statements.
 *
 *   entity_relations     (from, predicate, to, memory) — a memory states it
 *   relation_statements  (from, predicate, to, memory) → said_at, holds
 *                        when it was said (conversation time, not processing
 *                        time: history is backfilled newest first) and whether
 *                        it was said to hold or to have ended
 *
 * A relation holds when its most recent statement says so. Relations from
 * before statements existed have none and count as holding. Its weight is the
 * number of sessions behind the memories that state it (recurrence).
 */

import { AgentDatabase } from '../cozo-db'
import { escapeForCozo } from '../cozo-utils'

/**
 * Directed verbs, read "SUBJECT predicate OBJECT". Chosen for consequences:
 * each answers "what else is affected if this changes?".
 */
export const RELATION_PREDICATES = [
  'uses', 'depends_on', 'runs_on', 'hosts', 'deploys_to', 'stores_data_in',
  'reads_from', 'writes_to', 'calls', 'part_of', 'owns', 'configures',
  'requires', 'replaces', 'fixes', 'breaks', 'affects', 'stores',
  'prefers', 'decided_on', 'rejected',
] as const
export type RelationPredicate = typeof RELATION_PREDICATES[number]

/** The verbs new relations are stated with ('stores' is ambiguous in direction; kept only for old rows) */
export const STATED_PREDICATES = RELATION_PREDICATES.filter(p => p !== 'stores')

/** What each verb means, for the model that picks it */
export const PREDICATE_GLOSS: Record<string, string> = {
  uses: 'X uses Y (a library, tool, service)',
  depends_on: 'X stops working or changes if Y changes',
  runs_on: 'X runs on host/platform Y',
  hosts: 'X (a host/platform) runs Y',
  deploys_to: 'X is deployed to Y',
  stores_data_in: 'X keeps its data in Y (a bucket, database, disk)',
  reads_from: 'X reads data from Y',
  writes_to: 'X writes data to Y',
  calls: 'X calls Y (an API, function, service)',
  part_of: 'X is a component of Y',
  owns: 'X (a person, team, agent) is responsible for Y',
  configures: 'X sets up or configures Y',
  requires: 'X needs Y first (a permission, approval, step)',
  replaces: 'X replaces Y',
  fixes: 'X fixes Y',
  breaks: 'X breaks Y',
  affects: 'a change to X changes Y',
  prefers: 'X (a person) prefers Y',
  decided_on: 'X decided on Y',
  rejected: 'X rejected Y',
}

export interface RelationStatement {
  from: string
  predicate: string
  to: string
  memoryId: string
  /** When it was said (conversation time) */
  saidAt: number
  /** false: the conversation said it no longer holds (moved off, removed, replaced) */
  holds: boolean
}

export async function recordRelation(agentDb: AgentDatabase, s: RelationStatement): Promise<void> {
  await agentDb.run(`
    ?[from_entity, predicate, to_entity, memory_id, created_at] <- [[
      ${escapeForCozo(s.from)}, ${escapeForCozo(s.predicate)}, ${escapeForCozo(s.to)}, ${escapeForCozo(s.memoryId)}, ${Date.now()}
    ]]
    :put entity_relations
  `)
  await agentDb.run(`
    ?[from_entity, predicate, to_entity, memory_id, said_at, holds] <- [[
      ${escapeForCozo(s.from)}, ${escapeForCozo(s.predicate)}, ${escapeForCozo(s.to)}, ${escapeForCozo(s.memoryId)},
      ${Math.floor(s.saidAt) || Date.now()}, ${s.holds ? 'true' : 'false'}
    ]]
    :put relation_statements
  `)
}

export interface NeighbourRelation {
  /** out: entity → other; in: other → entity */
  direction: 'out' | 'in'
  predicate: string
  entity_id: string
  name: string
  type: string
  holds: boolean
  /** Sessions behind the memories that state it */
  weight: number
  /** Most recent statement (conversation time), null for relations from before v0.42 */
  last_said_at: number | null
}

/** Pure: the state of one relation from its statements. */
export function relationState(statements: Array<{ said_at: number; holds: boolean }>): { holds: boolean; last_said_at: number | null } {
  if (statements.length === 0) return { holds: true, last_said_at: null }
  const latest = statements.reduce((a, b) => (b.said_at > a.said_at ? b : a))
  return { holds: latest.holds, last_said_at: latest.said_at }
}

/**
 * Everything an entity relates to, strongest current relations first, ended
 * ones after. `related_to` (from before the vocabulary) says nothing and is left out.
 */
export async function entityNeighbourhood(agentDb: AgentDatabase, entityId: string, limit = 12): Promise<NeighbourRelation[]> {
  const id = escapeForCozo(entityId)
  const rels = await agentDb.run(`
    ?[direction, predicate, other, other_name, other_type, memory_id, sessions] :=
      *entity_relations{from_entity: ${id}, predicate, to_entity: other, memory_id},
      *entities{entity_id: other, name: other_name, type: other_type},
      *memories{memory_id, tier, reinforcement_count: sessions}, tier != 'faded',
      direction = 'out'
    ?[direction, predicate, other, other_name, other_type, memory_id, sessions] :=
      *entity_relations{from_entity: other, predicate, to_entity: ${id}, memory_id},
      *entities{entity_id: other, name: other_name, type: other_type},
      *memories{memory_id, tier, reinforcement_count: sessions}, tier != 'faded',
      direction = 'in'
  `)
  const statements = await agentDb.run(`
    ?[from_entity, predicate, to_entity, memory_id, said_at, holds] :=
      *relation_statements{from_entity, predicate, to_entity, memory_id, said_at, holds}, from_entity = ${id}
    ?[from_entity, predicate, to_entity, memory_id, said_at, holds] :=
      *relation_statements{from_entity, predicate, to_entity, memory_id, said_at, holds}, to_entity = ${id}
  `).catch(() => ({ rows: [] as unknown[][] }))
  const saidBy = new Map<string, Array<{ said_at: number; holds: boolean }>>()
  for (const [f, p, t, , at, holds] of statements.rows as [string, string, string, string, number, boolean][]) {
    const k = `${f}|${p}|${t}`
    if (!saidBy.has(k)) saidBy.set(k, [])
    saidBy.get(k)!.push({ said_at: at, holds })
  }

  const byKey = new Map<string, NeighbourRelation>()
  for (const [direction, predicate, other, name, type, , sessions] of rels.rows as [string, string, string, string, string, string, number][]) {
    if (predicate === 'related_to' || other === entityId) continue
    const key = `${direction}|${predicate}|${other}`
    const existing = byKey.get(key)
    if (existing) { existing.weight += sessions || 1; continue }
    const rk = direction === 'out' ? `${entityId}|${predicate}|${other}` : `${other}|${predicate}|${entityId}`
    const state = relationState(saidBy.get(rk) || [])
    byKey.set(key, {
      direction: direction as 'out' | 'in', predicate, entity_id: other, name, type,
      holds: state.holds, weight: sessions || 1, last_said_at: state.last_said_at,
    })
  }
  return [...byKey.values()]
    .sort((a, b) => Number(b.holds) - Number(a.holds) || b.weight - a.weight || (b.last_said_at || 0) - (a.last_said_at || 0))
    .slice(0, limit)
}

/** Pure: one relation as a line an agent reads ("products.public stores_data_in winepro"). */
export function describeRelation(entityName: string, r: NeighbourRelation): string {
  const verb = r.predicate.replace(/_/g, ' ')
  const text = r.direction === 'out' ? `${entityName} ${verb} ${r.name}` : `${r.name} ${verb} ${entityName}`
  const notes: string[] = []
  if (!r.holds) notes.push('no longer')
  if (r.weight > 1) notes.push(`${r.weight} sessions`)
  return notes.length ? `${text} (${notes.join(', ')})` : text
}
