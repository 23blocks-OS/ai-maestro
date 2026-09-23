/**
 * Memory cards and the entity graph (F006).
 *
 * A consolidated memory is a verbatim passage: evidence, not something an agent
 * can read at a glance. This pass turns memories without a card into cards:
 *
 *   1. job      the flagged passage + its whole exchange + the one before it
 *               (from memory_sources, which outlives Claude Code's 30-day cleanup)
 *   2. write    the host's own Claude (haiku) writes statement/action/entities/relations
 *   3. check    Jev: is the statement supported by the excerpt? Unfaithful → rejected
 *   4. link     entities are canonicalised (exact name/alias, then embedding +
 *               Jev "same thing?") and become graph nodes; relations become edges
 *
 * The verbatim memory is never lost: a skipped or rejected card only means the
 * memory is shown as its passage.
 */

import { v4 as uuidv4 } from 'uuid'
import { AgentDatabase } from '../cozo-db'
import { escapeForCozo } from '../cozo-utils'
import { embedTexts } from '../rag/embeddings'
import { toCozoVector } from '../cozo-schema-memory'
import { SUMMARIZER_MODEL, type GeneratedCard } from './summarizer'
import type { JevClassifier } from './jev-provider'

/** A non-null string literal: escapeForCozo('') is `null`, which a String column rejects. */
const str = (s: string | undefined | null) => (s ? escapeForCozo(s) : "''")

/** Entities this close (cosine distance) are asked about as possible duplicates */
const ENTITY_MERGE_DISTANCE = 0.2

// ---------------------------------------------------------------------------
// Entity candidates: deterministic names that seed the summarizer's hints
// ---------------------------------------------------------------------------

const FILE_PATH = /(?:[\w.-]+\/)+[\w.-]+\.(?:tsx?|mjs|cjs|jsx?|sh|md|json|ya?ml|py|rb|go|rs|sql|css|html)\b/g
const BACKTICKED = /`([^`\n]{3,60})`/g

/** Names worth offering to the summarizer as canonical spellings. */
export function extractEntityCandidates(text: string): string[] {
  const out = new Set<string>()
  for (const m of text.matchAll(FILE_PATH)) out.add(m[0])
  for (const m of text.matchAll(BACKTICKED)) {
    const v = m[1].trim()
    // identifiers and names, not sentences or commands with many arguments
    if (v.split(/\s+/).length <= 3 && !/^[-$>#]/.test(v) && !v.includes('[REDACTED]')) out.add(v)
  }
  return [...out].slice(0, 40)
}

// ---------------------------------------------------------------------------
// Entity store with canonicalisation
// ---------------------------------------------------------------------------

interface EntityRow { entity_id: string; name: string; type: string; aliases: string[]; mention_count: number }

const norm = (s: string) => s.trim().toLowerCase().replace(/[`"'“”]/g, '').replace(/\s+/g, ' ')

export class EntityIndex {
  private byKey = new Map<string, EntityRow>()
  private rows = new Map<string, EntityRow>()

  private constructor(private agentDb: AgentDatabase, private agentId: string, private classifier: JevClassifier) {}

  static async load(agentDb: AgentDatabase, agentId: string, classifier: JevClassifier): Promise<EntityIndex> {
    const idx = new EntityIndex(agentDb, agentId, classifier)
    const result = await agentDb.run(`
      ?[entity_id, name, type, aliases, mention_count] :=
        *entities{entity_id, agent_id, name, type, aliases, mention_count},
        agent_id = ${escapeForCozo(agentId)}
    `)
    for (const r of result.rows as unknown[][]) {
      let aliases: string[] = []
      try { aliases = JSON.parse(r[3] as string) } catch { /* none */ }
      idx.index({ entity_id: r[0] as string, name: r[1] as string, type: r[2] as string, aliases, mention_count: r[4] as number })
    }
    return idx
  }

  private index(row: EntityRow) {
    this.rows.set(row.entity_id, row)
    for (const key of [row.name, ...row.aliases]) this.byKey.set(norm(key), row)
  }

  get size(): number { return this.rows.size }

  /** The most-mentioned names, offered to the summarizer as canonical spellings. */
  topNames(limit = 40): string[] {
    return [...this.rows.values()].sort((a, b) => b.mention_count - a.mention_count).slice(0, limit).map(r => r.name)
  }

  /**
   * Find or create the entity for a name. Exact name/alias first; then the
   * nearest existing entity by embedding, confirmed by Jev before merging.
   */
  async resolve(name: string, type: string, context: string): Promise<string> {
    const key = norm(name)
    const exact = this.byKey.get(key)
    if (exact) return exact.entity_id

    const [vecF] = await embedTexts([name])
    const vec = Array.from(vecF)
    const near = await this.agentDb.run(`
      ?[entity_id, distance] :=
        ~entity_vec:hnsw{entity_id | query: ${toCozoVector(vec)}, k: 3, ef: 40, bind_distance: distance}
      :order distance
    `).catch(() => ({ rows: [] as unknown[][] }))

    for (const [candidateId, distance] of near.rows as [string, number][]) {
      const candidate = this.rows.get(candidateId)
      if (!candidate || distance > ENTITY_MERGE_DISTANCE) continue
      const same = await this.sameThing(name, candidate.name, context)
      if (same) {
        candidate.aliases = [...new Set([...candidate.aliases, name])]
        this.index(candidate)
        await this.save(candidate)
        return candidate.entity_id
      }
    }

    const row: EntityRow = { entity_id: `ent-${uuidv4()}`, name, type, aliases: [], mention_count: 0 }
    this.index(row)
    await this.save(row)
    await this.agentDb.run(`
      ?[entity_id, vec] <- [[${escapeForCozo(row.entity_id)}, ${toCozoVector(vec)}]]
      :put entity_vec
    `)
    return row.entity_id
  }

  private async sameThing(a: string, b: string, context: string): Promise<boolean> {
    try {
      const { answers } = await this.classifier.ask(
        `CONTEXT: ${context.slice(0, 600)}\n\nNAME A: ${a}\nNAME B: ${b}`,
        { same: { type: 'noul', instructions: 'Do NAME A and NAME B refer to the same specific thing?', criteria: { true: 'The same system, person, file, host or concept, just named differently', false: 'Different things, even if related' } } }
      )
      return Number(answers.same?.noul ?? 0) >= 0.8
    } catch {
      return false // when unsure, keep them apart; a duplicate node is cheaper than a wrong merge
    }
  }

  async mention(entityId: string): Promise<void> {
    const row = this.rows.get(entityId)
    if (!row) return
    row.mention_count++
    await this.save(row)
  }

  private async save(row: EntityRow): Promise<void> {
    const now = Date.now()
    await this.agentDb.run(`
      ?[entity_id, agent_id, name, type, aliases, mention_count, created_at, updated_at] <- [[
        ${escapeForCozo(row.entity_id)},
        ${escapeForCozo(this.agentId)},
        ${escapeForCozo(row.name)},
        ${escapeForCozo(row.type)},
        ${escapeForCozo(JSON.stringify(row.aliases))},
        ${row.mention_count},
        ${now},
        ${now}
      ]]
      :put entities
    `)
  }
}

// ---------------------------------------------------------------------------
// Writing a card's pieces
// ---------------------------------------------------------------------------

export async function saveCard(agentDb: AgentDatabase, memoryId: string, card: { statement: string; action: string; status: string; faithfulness: number }) {
  await agentDb.run(`
    ?[memory_id, statement, action, status, model, faithfulness, created_at] <- [[
      ${escapeForCozo(memoryId)},
      ${str(card.statement)},
      ${str(card.action)},
      ${str(card.status)},
      ${escapeForCozo(SUMMARIZER_MODEL)},
      ${card.faithfulness},
      ${Date.now()}
    ]]
    :put memory_cards
  `)
}

/** Entities become graph nodes linked to the memory; stated relations become edges. */
export async function linkCardEntities(agentDb: AgentDatabase, entities: EntityIndex, memoryId: string, card: Pick<GeneratedCard, 'statement' | 'entities' | 'relations'>) {
  const idByName = new Map<string, string>()
  for (const e of card.entities) {
    if (idByName.has(norm(e.name))) continue
    const id = await entities.resolve(e.name, e.type, card.statement)
    idByName.set(norm(e.name), id)
    await entities.mention(id)
    await agentDb.run(`
      ?[memory_id, entity_id] <- [[${escapeForCozo(memoryId)}, ${escapeForCozo(id)}]]
      :put memory_entities
    `)
  }
  for (const r of card.relations) {
    const from = idByName.get(norm(r.subject))
    const to = idByName.get(norm(r.object))
    if (!from || !to || from === to) continue
    await agentDb.run(`
      ?[from_entity, predicate, to_entity, memory_id, created_at] <- [[
        ${escapeForCozo(from)}, ${escapeForCozo(r.predicate)}, ${escapeForCozo(to)}, ${escapeForCozo(memoryId)}, ${Date.now()}
      ]]
      :put entity_relations
    `)
  }
}

// ---------------------------------------------------------------------------
// Reading cards and the entity graph
// ---------------------------------------------------------------------------

export interface MemoryCardView {
  statement: string
  action: string
  status: string
}

const idList = (ids: string[]) => ids.map(id => escapeForCozo(id)).join(', ')

export interface EvidenceView {
  passage: string
  conversation_file: string
  ts: number | null
}

interface CardExtras {
  card?: MemoryCardView
  entities: Array<{ name: string; type: string }>
  /** Passages the memory rests on, newest first (at most 3) */
  evidence: EvidenceView[]
}

/** Cards, entities and evidence for a set of memories, keyed by memory id. */
export async function loadCards(agentDb: AgentDatabase, memoryIds: string[]): Promise<Map<string, CardExtras>> {
  const out = new Map<string, CardExtras>()
  if (memoryIds.length === 0) return out
  for (const id of memoryIds) out.set(id, { entities: [], evidence: [] })
  const ev = await agentDb.run(`
    ?[memory_id, passage, conversation_file, ts, created_at] :=
      *memory_evidence{memory_id, passage, conversation_file, ts, created_at},
      memory_id in [${idList(memoryIds)}]
    :order -created_at
  `).catch(() => ({ rows: [] as unknown[][] }))
  for (const r of ev.rows as unknown[][]) {
    const bucket = out.get(r[0] as string)!
    if (bucket.evidence.length < 3) bucket.evidence.push({ passage: r[1] as string, conversation_file: r[2] as string, ts: (r[3] as number | null) ?? null })
  }
  const cards = await agentDb.run(`
    ?[memory_id, statement, action, status] :=
      *memory_cards{memory_id, statement, action, status},
      memory_id in [${idList(memoryIds)}]
  `).catch(() => ({ rows: [] as unknown[][] }))
  for (const r of cards.rows as unknown[][]) {
    out.get(r[0] as string)!.card = { statement: r[1] as string, action: r[2] as string, status: r[3] as string }
  }
  const ents = await agentDb.run(`
    ?[memory_id, name, type] :=
      *memory_entities{memory_id, entity_id},
      memory_id in [${idList(memoryIds)}],
      *entities{entity_id, name, type}
  `).catch(() => ({ rows: [] as unknown[][] }))
  for (const r of ents.rows as unknown[][]) {
    out.get(r[0] as string)!.entities.push({ name: r[1] as string, type: r[2] as string })
  }
  return out
}

/** Attach card + entities to memory rows (anything with a memory_id). */
export async function withCards<T extends { memory_id: string }>(agentDb: AgentDatabase, memories: T[]): Promise<Array<T & CardExtras>> {
  const cards = await loadCards(agentDb, memories.map(m => m.memory_id))
  return memories.map(m => ({ ...m, ...(cards.get(m.memory_id) || { entities: [], evidence: [] }) }))
}

/**
 * The entity graph: the most-mentioned entities as nodes; edges are the typed
 * relations between them, plus "co_mentioned" where two entities appear in the
 * same memory without a stated relation.
 */
export async function entityGraph(agentDb: AgentDatabase, agentId: string, limit = 150) {
  const nodesResult = await agentDb.run(`
    ?[entity_id, name, type, mention_count] :=
      *entities{entity_id, agent_id, name, type, mention_count},
      agent_id = ${escapeForCozo(agentId)}
    :order -mention_count
    :limit ${limit}
  `)
  const nodes = (nodesResult.rows as unknown[][]).map(r => ({
    id: r[0] as string, name: r[1] as string, type: r[2] as string, mention_count: r[3] as number,
  }))
  const ids = new Set(nodes.map(n => n.id))
  if (nodes.length === 0) return { nodes, links: [] as Array<{ source: string; target: string; relationship: string; weight: number }> }

  const rels = await agentDb.run(`
    ?[from_entity, predicate, to_entity, count(memory_id)] :=
      *entity_relations{from_entity, predicate, to_entity, memory_id}
  `)
  const links = new Map<string, { source: string; target: string; relationship: string; weight: number }>()
  const related = new Set<string>()
  for (const [from, predicate, to, weight] of rels.rows as [string, string, string, number][]) {
    if (!ids.has(from) || !ids.has(to)) continue
    links.set(`${from}|${predicate}|${to}`, { source: from, target: to, relationship: predicate, weight })
    related.add([from, to].sort().join('|'))
  }

  const co = await agentDb.run(`
    ?[a, b, count(memory_id)] :=
      *memory_entities{memory_id, entity_id: a},
      *memory_entities{memory_id, entity_id: b},
      a < b
  `)
  for (const [a, b, weight] of co.rows as [string, string, number][]) {
    if (!ids.has(a) || !ids.has(b) || related.has(`${a}|${b}`)) continue
    links.set(`${a}|co|${b}`, { source: a, target: b, relationship: 'co_mentioned', weight })
  }
  return { nodes, links: [...links.values()] }
}

/** Find an entity by name or alias (case-insensitive). */
export async function findEntity(agentDb: AgentDatabase, agentId: string, name: string): Promise<{ entity_id: string; name: string; type: string; aliases: string[]; mention_count: number } | null> {
  const key = norm(name)
  const result = await agentDb.run(`
    ?[entity_id, name, type, aliases, mention_count] :=
      *entities{entity_id, agent_id, name, type, aliases, mention_count},
      agent_id = ${escapeForCozo(agentId)}
  `)
  let best: { entity_id: string; name: string; type: string; aliases: string[]; mention_count: number } | null = null
  for (const r of result.rows as unknown[][]) {
    let aliases: string[] = []
    try { aliases = JSON.parse(r[3] as string) } catch { /* none */ }
    const row = { entity_id: r[0] as string, name: r[1] as string, type: r[2] as string, aliases, mention_count: r[4] as number }
    if ([row.name, ...aliases].some(n => norm(n) === key) && (!best || row.mention_count > best.mention_count)) best = row
  }
  return best
}

/** Everything known about one entity: its relations and the memories that mention it. */
export async function aboutEntity(agentDb: AgentDatabase, agentId: string, name: string, limit = 20) {
  const entity = await findEntity(agentDb, agentId, name)
  if (!entity) return null
  const id = escapeForCozo(entity.entity_id)
  const relations = await agentDb.run(`
    ?[direction, predicate, other_name, other_type] :=
      *entity_relations{from_entity: ${id}, predicate, to_entity: other},
      *entities{entity_id: other, name: other_name, type: other_type},
      direction = 'out'
    ?[direction, predicate, other_name, other_type] :=
      *entity_relations{from_entity: other, predicate, to_entity: ${id}},
      *entities{entity_id: other, name: other_name, type: other_type},
      direction = 'in'
  `)
  const memories = await agentDb.run(`
    ?[memory_id, category, content, created_at] :=
      *memory_entities{memory_id, entity_id: ${id}},
      *memories{memory_id, category, content, created_at}
    :order -created_at
    :limit ${limit}
  `)
  const rows = (memories.rows as unknown[][]).map(r => ({ memory_id: r[0] as string, category: r[1] as string, content: r[2] as string, created_at: r[3] as number }))
  return {
    entity,
    relations: (relations.rows as unknown[][]).map(r => ({ direction: r[0] as string, predicate: r[1] as string, name: r[2] as string, type: r[3] as string })),
    memories: await withCards(agentDb, rows),
  }
}

/**
 * Entities named in a piece of text (a user prompt): whole-word, case-insensitive
 * matches on names and aliases of at least 3 characters.
 */
export async function entitiesMentionedIn(agentDb: AgentDatabase, agentId: string, text: string): Promise<string[]> {
  const haystack = ` ${norm(text)} `
  const result = await agentDb.run(`
    ?[entity_id, name, aliases] :=
      *entities{entity_id, agent_id, name, aliases},
      agent_id = ${escapeForCozo(agentId)}
  `).catch(() => ({ rows: [] as unknown[][] }))
  const hits: string[] = []
  for (const r of result.rows as unknown[][]) {
    let aliases: string[] = []
    try { aliases = JSON.parse(r[2] as string) } catch { /* none */ }
    for (const n of [r[1] as string, ...aliases]) {
      const k = norm(n)
      if (k.length < 3) continue
      const escaped = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      if (new RegExp(`(^|[^a-z0-9_])${escaped}([^a-z0-9_]|$)`).test(haystack)) { hits.push(r[0] as string); break }
    }
  }
  return hits
}
