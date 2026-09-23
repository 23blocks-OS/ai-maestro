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
import { JevClassifier, ClassifierError } from './jev-provider'
import {
  summarizeBatch, batchJobs, SummarizerError, SUMMARIZER_MODEL,
  type CardJob, type GeneratedCard,
} from './summarizer'

/** Memories turned into cards per agent per run; the rest continue next run. */
const CARDS_PER_RUN = 60
/** Minimum P(statement supported by excerpt) */
const MIN_FAITHFULNESS = 0.6
/** Entities this close (cosine distance) are asked about as possible duplicates */
const ENTITY_MERGE_DISTANCE = 0.2

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

export async function recordMemorySource(agentDb: AgentDatabase, source: {
  memory_id: string
  conversation_file: string
  msg_start: number
  msg_end: number
  ts?: number
  exchange: string
  previous_exchange?: string
}): Promise<void> {
  await agentDb.run(`
    ?[memory_id, conversation_file, msg_start, msg_end, ts, exchange, previous_exchange] <- [[
      ${escapeForCozo(source.memory_id)},
      ${escapeForCozo(source.conversation_file)},
      ${Math.floor(source.msg_start)},
      ${Math.floor(source.msg_end)},
      ${Number.isFinite(source.ts) ? Math.floor(source.ts as number) : 'null'},
      ${escapeForCozo(source.exchange)},
      ${escapeForCozo(source.previous_exchange)}
    ]]
    :put memory_sources
  `)
}

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
// The card pass
// ---------------------------------------------------------------------------

async function pendingJobs(agentDb: AgentDatabase, agentId: string, limit: number): Promise<CardJob[]> {
  const result = await agentDb.run(`
    ?[memory_id, category, content, created_at] :=
      *memories{memory_id, agent_id, category, content, created_at},
      agent_id = ${escapeForCozo(agentId)},
      not *memory_cards{memory_id}
    :order -created_at
    :limit ${limit}
  `)
  if (result.rows.length === 0) return []
  const ids = (result.rows as unknown[][]).map(r => r[0] as string)
  const sources = await agentDb.run(`
    ?[memory_id, exchange, previous_exchange] :=
      *memory_sources{memory_id, exchange, previous_exchange},
      memory_id in [${ids.map(id => escapeForCozo(id)).join(', ')}]
  `)
  const byId = new Map((sources.rows as unknown[][]).map(r => [r[0] as string, { exchange: r[1] as string, previous: (r[2] as string | null) || undefined }]))
  return (result.rows as unknown[][]).map(r => {
    const src = byId.get(r[0] as string)
    return {
      memory_id: r[0] as string,
      category: r[1] as string,
      passage: r[2] as string,
      // Memories from before sources were kept: the passage is all the context there is
      exchange: src?.exchange || (r[2] as string),
      previous: src?.previous,
    }
  })
}

async function faithfulness(classifier: JevClassifier, statement: string, job: CardJob): Promise<number> {
  const { answers } = await classifier.ask(
    `EXCERPT:\n${job.exchange.slice(0, 6000)}\n\nFLAGGED PASSAGE:\n${job.passage.slice(0, 2000)}\n\nSTATEMENT: ${statement}`,
    { supported: { type: 'noul', instructions: 'Is the STATEMENT fully supported by the EXCERPT, with nothing invented or changed?', criteria: { true: 'Every claim in the statement is stated or clearly implied by the excerpt', false: 'The statement adds, changes or contradicts something' } } }
  )
  return Number(answers.supported?.noul ?? 0)
}

async function saveCard(agentDb: AgentDatabase, memoryId: string, card: { statement: string; action: string; status: string; faithfulness: number }) {
  await agentDb.run(`
    ?[memory_id, statement, action, status, model, faithfulness, created_at] <- [[
      ${escapeForCozo(memoryId)},
      ${escapeForCozo(card.statement)},
      ${escapeForCozo(card.action)},
      ${escapeForCozo(card.status)},
      ${escapeForCozo(SUMMARIZER_MODEL)},
      ${card.faithfulness},
      ${Date.now()}
    ]]
    :put memory_cards
  `)
}

async function linkCardEntities(agentDb: AgentDatabase, entities: EntityIndex, card: GeneratedCard) {
  const idByName = new Map<string, string>()
  for (const e of card.entities) {
    const id = await entities.resolve(e.name, e.type, card.statement)
    if (idByName.has(norm(e.name))) continue
    idByName.set(norm(e.name), id)
    await entities.mention(id)
    await agentDb.run(`
      ?[memory_id, entity_id] <- [[${escapeForCozo(card.memory_id)}, ${escapeForCozo(id)}]]
      :put memory_entities
    `)
  }
  for (const r of card.relations) {
    const from = idByName.get(norm(r.subject))
    const to = idByName.get(norm(r.object))
    if (!from || !to || from === to) continue
    await agentDb.run(`
      ?[from_entity, predicate, to_entity, memory_id, created_at] <- [[
        ${escapeForCozo(from)}, ${escapeForCozo(r.predicate)}, ${escapeForCozo(to)}, ${escapeForCozo(card.memory_id)}, ${Date.now()}
      ]]
      :put entity_relations
    `)
  }
}

export interface CardPassResult {
  cards: number
  skipped: number
  rejected: number
  entities: number
  deferred: boolean
}

/**
 * Turn up to CARDS_PER_RUN memories without a card into cards. Never throws:
 * errors are reported, and anything unfinished stays pending for the next run.
 */
export async function buildCards(
  agentDb: AgentDatabase,
  agentId: string,
  classifier: JevClassifier,
  knownNames: string[],
  errors: string[]
): Promise<CardPassResult> {
  const result: CardPassResult = { cards: 0, skipped: 0, rejected: 0, entities: 0, deferred: false }
  const jobs = await pendingJobs(agentDb, agentId, CARDS_PER_RUN)
  if (jobs.length === 0) return result

  const entities = await EntityIndex.load(agentDb, agentId, classifier)
  const before = entities.topNames(100_000).length

  for (const batch of batchJobs(jobs)) {
    const hints = [...new Set([
      ...knownNames,
      ...entities.topNames(),
      ...batch.flatMap(j => extractEntityCandidates(j.exchange)),
    ])]

    let cards: GeneratedCard[]
    try {
      cards = await summarizeBatch(batch, hints)
    } catch (err) {
      const e = err as SummarizerError
      errors.push(`Card summarizer: ${e.message}`)
      if (e.limited) result.deferred = true
      return result // leave the rest pending; limits and outages clear by the next run
    }

    for (const card of cards) {
      const job = batch.find(j => j.memory_id === card.memory_id)!
      try {
        if (card.skip) {
          await saveCard(agentDb, card.memory_id, { statement: '', action: card.action, status: 'skipped', faithfulness: 0 })
          result.skipped++
          continue
        }
        const score = await faithfulness(classifier, card.statement, job)
        if (score < MIN_FAITHFULNESS) {
          await saveCard(agentDb, card.memory_id, { statement: card.statement, action: card.action, status: 'rejected', faithfulness: score })
          result.rejected++
          continue
        }
        await linkCardEntities(agentDb, entities, card)
        await saveCard(agentDb, card.memory_id, { statement: card.statement, action: card.action, status: 'done', faithfulness: score })
        result.cards++
      } catch (err) {
        errors.push(`Card ${card.memory_id}: ${(err as Error).message}`)
        if (err instanceof ClassifierError && err.fatal) return result
      }
    }
  }

  result.entities = entities.topNames(100_000).length - before
  return result
}
