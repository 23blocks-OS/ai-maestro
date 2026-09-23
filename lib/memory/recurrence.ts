/**
 * Recurrence: a memory's weight is how many distinct sessions it came up in.
 *
 * One paragraph never shows that something will matter again; the same
 * knowledge surfacing in another session does. So a new card that states what
 * an existing memory already states does not become a second memory: it
 * reinforces the first (one more session, one more piece of evidence).
 *
 *   warm   new, seen in one session
 *   long   seen in 2+ distinct sessions (promoted)
 *   faded  one session, never recalled, older than 30 days; or a legacy raw
 *          passage from before cards. Kept, never recalled or injected. A
 *          faded CARD that comes up in a new session is revived.
 */

import { AgentDatabase } from '../cozo-db'
import { escapeForCozo } from '../cozo-utils'
import { searchMemoriesByEmbedding, storeMemoryEmbedding } from '../cozo-schema-memory'
import { embedTexts } from '../rag/embeddings'
import type { JevClassifier } from './jev-provider'

/**
 * "Same point" thresholds, calibrated 2026-09-23 on real cards (the same session
 * replayed under another name, so the summarizer reworded every card):
 *   true duplicates   distance 0.07-0.21, Jev "same" 0.55-0.77
 *   different points  distance 0.29-0.44, Jev "same" 0.02-0.30
 * A single Jev cutoff of 0.75 sat on the edge and missed 3 of 4 true repeats,
 * so recurrence (the whole point) never built weight. Jev still decides:
 * "use X" and "do not use X" embed close together and score near zero.
 */
const SAME_POINT_DISTANCE = 0.25
const SAME_POINT_MIN = 0.5
/** Near-identical wording needs less confirmation */
const NEAR_IDENTICAL_DISTANCE = 0.12
const NEAR_IDENTICAL_MIN = 0.35
const MAX_EVIDENCE_PER_MEMORY = 12
const PROMOTE_AT_SESSIONS = 2
const FADE_AFTER_DAYS = 30

const str = (s: string | undefined | null) => (s ? escapeForCozo(s) : "''")

// ---------------------------------------------------------------------------
// Same point
// ---------------------------------------------------------------------------

/**
 * The existing memory that states the same knowledge as `statement`, if any.
 * Embedding distance finds candidates; Jev decides, because "use CozoDB" and
 * "do not use CozoDB" are close in embedding space and opposite in meaning.
 */
export async function findSamePoint(
  agentDb: AgentDatabase,
  agentId: string,
  classifier: JevClassifier,
  statement: string,
  vec: number[]
): Promise<string | null> {
  const hits = (await searchMemoriesByEmbedding(agentDb, agentId, vec, { limit: 5, minConfidence: 0, trackAccess: false }))
    .filter(m => m.similarity <= SAME_POINT_DISTANCE)
  // A faded CARD may come back (recurrence revives it); a faded legacy raw
  // passage never does: it is a paragraph, not a statement of knowledge.
  const fadedIds = hits.filter(m => m.tier === 'faded').map(m => m.memory_id)
  const revivable = new Set<string>()
  if (fadedIds.length > 0) {
    const cards = await agentDb.run(`
      ?[memory_id] := *memory_cards{memory_id, status}, status = 'done',
        memory_id in [${fadedIds.map(id => escapeForCozo(id)).join(', ')}]
    `)
    for (const [id] of cards.rows as [string][]) revivable.add(id)
  }
  const near = hits.filter(m => m.tier !== 'faded' || revivable.has(m.memory_id))
  for (const m of near) {
    try {
      const { answers } = await classifier.ask(
        `STATEMENT A: ${statement}\n\nSTATEMENT B: ${m.content}`,
        { same: { type: 'noul', instructions: 'Do STATEMENT A and STATEMENT B state the same piece of knowledge (the same decision, fact, preference or lesson), even if worded differently?', criteria: { true: 'Same knowledge; one could replace the other', false: 'Different knowledge, a different aspect, or they conflict' } } }
      )
      const threshold = m.similarity <= NEAR_IDENTICAL_DISTANCE ? NEAR_IDENTICAL_MIN : SAME_POINT_MIN
      if (Number(answers.same?.noul ?? 0) >= threshold) return m.memory_id
    } catch {
      return null // unsure → keep separate; a duplicate is cheaper than a wrong merge
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// Reinforcement and evidence
// ---------------------------------------------------------------------------

/**
 * One more sighting of a memory. Weight grows only for a session (conversation)
 * not seen before; a repeat inside the same session only refreshes the time.
 * Returns true when it counted as a new session.
 */
export async function reinforceWithSession(agentDb: AgentDatabase, memoryId: string, conversationFile: string): Promise<boolean> {
  const result = await agentDb.run(`
    ?[source_conversations, reinforcement_count, tier] :=
      *memories{memory_id, source_conversations, reinforcement_count, tier},
      memory_id = ${escapeForCozo(memoryId)}
  `)
  if (result.rows.length === 0) return false
  let sessions: string[] = []
  try { sessions = JSON.parse((result.rows[0][0] as string) || '[]') } catch { /* legacy */ }
  const count = result.rows[0][1] as number
  const tier = result.rows[0][2] as string
  const isNew = !sessions.includes(conversationFile)
  const nextSessions = isNew ? [...sessions, conversationFile] : sessions
  // Coming up in a new session revives a faded memory; lifecycle then promotes it
  const nextTier = isNew && tier === 'faded' ? 'warm' : tier
  await agentDb.run(`
    ?[memory_id, source_conversations, reinforcement_count, last_reinforced_at, tier] <- [[
      ${escapeForCozo(memoryId)},
      ${escapeForCozo(JSON.stringify(nextSessions))},
      ${isNew ? count + 1 : count},
      ${Date.now()},
      ${escapeForCozo(nextTier)}
    ]]
    :update memories
  `)
  return isNew
}

export async function addEvidence(agentDb: AgentDatabase, memoryId: string, ev: {
  conversation_file: string
  msg_start: number
  msg_end: number
  ts?: number
  passage: string
  exchange: string
}): Promise<void> {
  const have = await agentDb.run(`
    ?[count(evidence_id)] := *memory_evidence{memory_id: ${escapeForCozo(memoryId)}, evidence_id}
  `)
  if (((have.rows[0]?.[0] as number) || 0) >= MAX_EVIDENCE_PER_MEMORY) return
  await agentDb.run(`
    ?[memory_id, evidence_id, conversation_file, msg_start, msg_end, ts, passage, exchange, created_at] <- [[
      ${escapeForCozo(memoryId)},
      ${escapeForCozo(`${ev.conversation_file}#${ev.msg_start}`)},
      ${escapeForCozo(ev.conversation_file)},
      ${Math.floor(ev.msg_start)},
      ${Math.floor(ev.msg_end)},
      ${Number.isFinite(ev.ts) ? Math.floor(ev.ts as number) : 'null'},
      ${str(ev.passage)},
      ${str(ev.exchange)},
      ${Date.now()}
    ]]
    :put memory_evidence
  `)
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

/** Promote memories seen in 2+ sessions; fade one-off memories nobody used. */
export async function updateLifecycle(agentDb: AgentDatabase, agentId: string): Promise<{ promoted: number; faded: number }> {
  const now = Date.now()
  const promote = await agentDb.run(`
    ?[memory_id] :=
      *memories{memory_id, agent_id, tier, reinforcement_count},
      agent_id = ${escapeForCozo(agentId)},
      tier = 'warm',
      reinforcement_count >= ${PROMOTE_AT_SESSIONS}
  `)
  for (const [id] of promote.rows as [string][]) {
    await agentDb.run(`?[memory_id, tier, promoted_at] <- [[${escapeForCozo(id)}, 'long', ${now}]] :update memories`)
  }
  const cutoff = now - FADE_AFTER_DAYS * 24 * 60 * 60 * 1000
  const fade = await agentDb.run(`
    ?[memory_id] :=
      *memories{memory_id, agent_id, tier, reinforcement_count, access_count, created_at},
      agent_id = ${escapeForCozo(agentId)},
      tier = 'warm',
      reinforcement_count <= 1,
      access_count = 0,
      created_at < ${cutoff}
  `)
  for (const [id] of fade.rows as [string][]) {
    await agentDb.run(`?[memory_id, tier] <- [[${escapeForCozo(id)}, 'faded']] :update memories`)
  }
  return { promoted: promote.rows.length, faded: fade.rows.length }
}

// ---------------------------------------------------------------------------
// One-time migration: verbatim passages → cards as memories
// ---------------------------------------------------------------------------

const MIGRATION = 'cards-as-memories-v1'

/**
 * Before this, a memory was a verbatim passage and a card was an annotation on
 * it. Now the card IS the memory and passages are its evidence:
 *   - a memory with a faithful card: content becomes the card statement (and is
 *     re-embedded); the old passage becomes its first evidence
 *   - any other memory (raw passage, rejected or skipped card): faded
 * Nothing is deleted. Runs once per database.
 */
export async function migrateToCardMemories(agentDb: AgentDatabase, agentId: string): Promise<{ converted: number; faded: number } | null> {
  const done = await agentDb.run(`?[applied_at] := *memory_migrations{name: ${escapeForCozo(MIGRATION)}, applied_at}`)
  if (done.rows.length > 0) return null

  const rows = await agentDb.run(`
    ?[memory_id, content, source_conversations, created_at] :=
      *memories{memory_id, agent_id, content, source_conversations, created_at, tier},
      agent_id = ${escapeForCozo(agentId)},
      tier != 'faded'
  `)
  const cards = await agentDb.run(`?[memory_id, statement, status] := *memory_cards{memory_id, statement, status}`)
  const cardById = new Map((cards.rows as [string, string, string][]).map(r => [r[0], { statement: r[1], status: r[2] }]))
  const sources = await agentDb.run(`?[memory_id, conversation_file, msg_start, msg_end, ts, exchange] := *memory_sources{memory_id, conversation_file, msg_start, msg_end, ts, exchange}`)
  const sourceById = new Map((sources.rows as unknown[][]).map(r => [r[0] as string, r]))

  let converted = 0
  let faded = 0
  for (const [id, content, sourceConversations, createdAt] of rows.rows as [string, string, string | null, number][]) {
    const card = cardById.get(id)
    if (card?.status === 'done' && card.statement) {
      const src = sourceById.get(id)
      let file = ''
      try { file = (JSON.parse(sourceConversations || '[]') as string[])[0] || '' } catch { /* none */ }
      await addEvidence(agentDb, id, {
        conversation_file: (src?.[1] as string) || file,
        msg_start: (src?.[2] as number) ?? 0,
        msg_end: (src?.[3] as number) ?? 0,
        ts: (src?.[4] as number | null) ?? createdAt,
        passage: content,
        exchange: (src?.[5] as string) || '',
      })
      await agentDb.run(`?[memory_id, content] <- [[${escapeForCozo(id)}, ${str(card.statement)}]] :update memories`)
      const [vec] = await embedTexts([card.statement])
      await storeMemoryEmbedding(agentDb, id, Array.from(vec))
      converted++
    } else {
      await agentDb.run(`?[memory_id, tier] <- [[${escapeForCozo(id)}, 'faded']] :update memories`)
      faded++
    }
  }
  await agentDb.run(`?[name, applied_at] <- [[${escapeForCozo(MIGRATION)}, ${Date.now()}]] :put memory_migrations`)
  console.log(`[MEMORY] ${MIGRATION}: ${converted} memories now cards, ${faded} raw passages faded`)
  return { converted, faded }
}
