/**
 * Memory Consolidation Engine
 *
 * Core logic for extracting long-term memories from conversations.
 * Handles deduplication, reinforcement, and relationship building.
 */

import { v4 as uuidv4 } from 'uuid'
import { AgentDatabase } from '../cozo-db'
import { escapeForCozo } from '../cozo-utils'
import { embedTexts } from '../rag/embeddings'

// Helper to embed a single text
async function embed(text: string): Promise<number[]> {
  const embeddings = await embedTexts([text])
  return Array.from(embeddings[0])
}
import {
  createMemory,
  storeMemoryEmbedding,
  reinforceMemory,
  linkMemories,
  searchMemoriesByEmbedding,
  recordConsolidationRun,
  updateConsolidationRun,
  markConversationConsolidated,
  MemoryCategory
} from '../cozo-schema-memory'
import {
  LLMProvider,
  ConsolidationOptions,
  ConsolidationResult,
  ExtractedMemory,
  PreparedConversation,
  DeduplicationResult,
  getCategorySystem,
  DEFAULT_MEMORY_SETTINGS
} from './types'
import { createOllamaProvider } from './ollama-provider'
import { createClaudeProvider } from './claude-provider'
import { JevClassifier, ClassifierError, chunkConversation, classifyRelations } from './jev-provider'
import { redactSecrets } from './redact'
import { loadClassifierSettings, isClassifierConfigured } from './settings'

type ProviderChoice =
  | { kind: 'classifier'; classifier: JevClassifier }
  | { kind: 'llm'; llm: LLMProvider }
  | { kind: 'none'; reason: string }

/**
 * Pick the memory provider. 'auto' prefers the Jev classifier when the user
 * has configured a key (Settings → Memory), then Ollama, then Claude.
 */
async function getProvider(options: ConsolidationOptions): Promise<ProviderChoice> {
  const preference = options.provider || 'auto'
  const tried: string[] = []

  if (preference === 'jev' || preference === 'auto') {
    const settings = loadClassifierSettings()
    if (isClassifierConfigured(settings)) {
      console.log(`[CONSOLIDATE] Using Jev classifier (${settings.url})`)
      return { kind: 'classifier', classifier: new JevClassifier(settings) }
    }
    tried.push('Jev (no API key set in Settings → Memory)')
    if (preference === 'jev') return { kind: 'none', reason: tried.join('; ') }
  }

  if (preference === 'ollama' || preference === 'auto') {
    const ollama = createOllamaProvider({
      model: options.ollamaModel || DEFAULT_MEMORY_SETTINGS.consolidation.ollamaModel
    })
    if (await ollama.isAvailable()) {
      console.log('[CONSOLIDATE] Using Ollama provider')
      return { kind: 'llm', llm: ollama }
    }
    tried.push('Ollama (not reachable)')
    if (preference === 'ollama') return { kind: 'none', reason: tried.join('; ') }
  }

  if (preference === 'claude' || preference === 'auto') {
    const claude = createClaudeProvider({
      model: options.claudeModel || DEFAULT_MEMORY_SETTINGS.consolidation.claudeModel
    })
    if (await claude.isAvailable()) {
      console.log('[CONSOLIDATE] Using Claude provider')
      return { kind: 'llm', llm: claude }
    }
    tried.push('Claude (ANTHROPIC_API_KEY missing or rejected)')
  }

  const reason = `No memory provider available. Tried: ${tried.join('; ')}`
  console.log(`[CONSOLIDATE] ${reason}`)
  return { kind: 'none', reason }
}

/**
 * Check if a memory is a duplicate of an existing one
 */
async function checkDuplicate(
  agentDb: AgentDatabase,
  agentId: string,
  memory: ExtractedMemory,
  embedding: number[]
): Promise<DeduplicationResult> {
  // Search for similar memories
  const similar = await searchMemoriesByEmbedding(
    agentDb,
    agentId,
    embedding,
    {
      limit: 5,
      categories: [memory.category as MemoryCategory],
      minConfidence: 0.5
    }
  )

  // Check for high similarity matches
  for (const match of similar) {
    // Cosine similarity > 0.85 means very similar
    // Note: searchMemoriesByEmbedding returns distance, not similarity
    // Lower distance = more similar
    if (match.similarity < 0.15) {  // distance < 0.15 means similarity > 0.85
      return {
        is_duplicate: true,
        existing_memory_id: match.memory_id,
        similarity: 1 - match.similarity,
        action: 'reinforce'
      }
    }
  }

  return {
    is_duplicate: false,
    action: 'create'
  }
}

/**
 * Format conversation messages for LLM extraction
 */
function formatConversationForExtraction(conversation: PreparedConversation): string {
  const lines: string[] = []

  for (const msg of conversation.messages.slice(conversation.consolidated_offset || 0)) {
    if (msg.tool_use) continue  // Skip tool use messages

    const role = msg.role.toUpperCase()
    const content = msg.content.length > 2000
      ? msg.content.substring(0, 2000) + '... [truncated]'
      : msg.content

    lines.push(`[${role}]: ${content}`)
  }

  return lines.join('\n\n')
}

interface RunCounters {
  created: number
  reinforced: number
  linked: number
}

/**
 * Store one memory: dedupe by embedding (reinforce if near-identical), else create.
 * Returns the new memory id when one was created.
 */
async function storeMemory(
  agentDb: AgentDatabase,
  agentId: string,
  memory: ExtractedMemory,
  sourceFile: string,
  dryRun: boolean,
  counters: RunCounters
): Promise<{ memoryId: string; embedding: number[] } | null> {
  const embedding = await embed(memory.content)
  const dedup = await checkDuplicate(agentDb, agentId, memory, embedding)

  if (dryRun) {
    console.log(`[CONSOLIDATE] [DRY RUN] Would ${dedup.action}: ${memory.category} - ${memory.content.substring(0, 100)}...`)
    if (dedup.action === 'create') counters.created++
    else if (dedup.action === 'reinforce') counters.reinforced++
    return null
  }

  if (dedup.action === 'reinforce' && dedup.existing_memory_id) {
    await reinforceMemory(agentDb, dedup.existing_memory_id, memory.context)
    counters.reinforced++
    console.log(`[CONSOLIDATE] Reinforced memory: ${dedup.existing_memory_id}`)
    return null
  }

  const memoryId = `mem-${Date.now()}-${uuidv4().substring(0, 8)}`
  await createMemory(agentDb, {
    memory_id: memoryId,
    agent_id: agentId,
    tier: 'warm',  // New memories start in warm tier
    system: getCategorySystem(memory.category as MemoryCategory),
    category: memory.category as MemoryCategory,
    content: memory.content,
    context: memory.context,
    source_conversations: [sourceFile],
    confidence: memory.confidence
  })
  await storeMemoryEmbedding(agentDb, memoryId, embedding)
  counters.created++
  console.log(`[CONSOLIDATE] Created memory: ${memoryId} (${memory.category})`)
  return { memoryId, embedding }
}

/** Only memories this close are worth asking about (cosine distance). */
const LINK_MAX_DISTANCE = 0.35
/** Existing unlinked memories checked per run; the rest continue next run. */
const LINK_BACKFILL_PER_RUN = 60

/**
 * Link a memory to its nearest neighbours: one classifier call judges how it
 * relates to each (supports / contradicts / supersedes / leads_to). These are
 * the edges of the memory graph.
 */
async function linkMemory(
  agentDb: AgentDatabase,
  agentId: string,
  memory: { memory_id: string; content: string; embedding: number[] },
  classifier: JevClassifier,
  counters: RunCounters
): Promise<void> {
  const candidates = (await searchMemoriesByEmbedding(agentDb, agentId, memory.embedding, { limit: 7, minConfidence: 0 }))
    .filter(c => c.memory_id !== memory.memory_id && c.similarity <= LINK_MAX_DISTANCE)
    .slice(0, 6)

  if (candidates.length > 0) {
    const relations = await classifyRelations(classifier, memory.content, candidates.map(c => c.content))
    for (const rel of relations) {
      const other = candidates[rel.index].memory_id
      // leads_to: the existing memory led to the new one
      if (rel.relation === 'leads_to') await linkMemories(agentDb, other, memory.memory_id, 'leads_to')
      else await linkMemories(agentDb, memory.memory_id, other, rel.relation)
      counters.linked++
    }
  }
  await agentDb.run(`
    ?[memory_id, checked_at] <- [[${escapeForCozo(memory.memory_id)}, ${Date.now()}]]
    :put memory_link_checked
  `)
}

/** Link memories stored before linking existed (or whose check failed). */
async function backfillLinks(
  agentDb: AgentDatabase,
  agentId: string,
  classifier: JevClassifier,
  counters: RunCounters,
  errors: string[]
): Promise<void> {
  const result = await agentDb.run(`
    ?[memory_id, content, vec] :=
      *memories{memory_id, agent_id, content},
      agent_id = ${escapeForCozo(agentId)},
      *memory_vec{memory_id, vec},
      not *memory_link_checked{memory_id}
    :limit ${LINK_BACKFILL_PER_RUN}
  `)
  for (const row of result.rows) {
    try {
      await linkMemory(agentDb, agentId, {
        memory_id: row[0] as string,
        content: row[1] as string,
        embedding: Array.from(row[2] as ArrayLike<number>),
      }, classifier, counters)
    } catch (err) {
      errors.push(`Linking error (${row[0]}): ${(err as Error).message}`)
      if (err instanceof ClassifierError && err.fatal) return
    }
  }
}

/**
 * Redact secrets from memories stored before redaction existed. Rewrites the
 * content and re-embeds it. Returns how many memories were changed.
 */
export async function scrubStoredSecrets(agentDb: AgentDatabase, agentId: string): Promise<number> {
  const result = await agentDb.run(`
    ?[memory_id, content, context] :=
      *memories{memory_id, agent_id, content, context},
      agent_id = ${escapeForCozo(agentId)}
  `)
  let changed = 0
  for (const row of result.rows) {
    const [memoryId, content, context] = row as [string, string, string | null]
    const clean = redactSecrets(content)
    const cleanContext = context ? redactSecrets(context) : context
    if (clean === content && cleanContext === context) continue
    await agentDb.run(`
      ?[memory_id, content, context] <- [[${escapeForCozo(memoryId)}, ${escapeForCozo(clean)}, ${escapeForCozo(cleanContext ?? undefined)}]]
      :update memories
    `)
    await storeMemoryEmbedding(agentDb, memoryId, await embed(clean))
    changed++
  }
  if (changed > 0) console.log(`[CONSOLIDATE] Redacted secrets from ${changed} stored memories`)
  return changed
}

/** Per-run cap on classifier calls (passages); the next run picks up where this stopped. */
const MAX_PASSAGES_PER_RUN = 1000

/**
 * Classifier path: split new messages into exchanges and their passages, ask
 * Jev what kind of memory each passage is, store the ones that pass verbatim.
 *
 * Returns the message offset reached. The budget is spent in whole exchanges
 * and the offset never advances past an exchange with a failed classification,
 * so a transient API error or the per-run cap loses nothing.
 */
async function consolidateWithClassifier(
  agentDb: AgentDatabase,
  agentId: string,
  conversation: PreparedConversation,
  classifier: JevClassifier,
  budget: { remaining: number },
  dryRun: boolean,
  counters: RunCounters,
  errors: string[]
): Promise<{ offset: number; created: number; classified: number; fatal: boolean; capped: boolean }> {
  const startOffset = conversation.consolidated_offset || 0
  const allChunks = chunkConversation(conversation.messages, startOffset)

  const chunks: typeof allChunks = []
  for (const chunk of allChunks) {
    if (chunk.passages.length > budget.remaining && chunks.length > 0) break
    chunks.push(chunk)
    budget.remaining -= chunk.passages.length
  }
  const capped = chunks.length < allChunks.length

  // Classify every passage in parallel (the classifier enforces a process-wide concurrency cap)
  const results = await Promise.all(chunks.map(async chunk => ({
    chunk,
    passages: await Promise.all(chunk.passages.map(async passage => {
      try {
        return { passage, classification: await classifier.classify(passage.state), error: null }
      } catch (err) {
        return { passage, classification: null, error: err as Error }
      }
    }))
  })))

  let offset = startOffset
  let created = 0
  let classified = 0
  for (const { chunk, passages } of results) {
    const failed = passages.find(p => p.error)
    if (failed?.error) {
      errors.push(`Classifier error (${conversation.file_path}): ${failed.error.message}`)
      return { offset, created, classified, fatal: failed.error instanceof ClassifierError && failed.error.fatal, capped }
    }
    const when = chunk.timestamp ? new Date(chunk.timestamp).toISOString() : 'unknown time'
    for (const { passage, classification } of passages) {
      if (!classification) continue
      classified++
      if (!classifier.accepts(classification)) continue
      try {
        const stored = await storeMemory(agentDb, agentId, {
          category: classification.category as MemoryCategory,
          content: passage.text,
          context: `${classification.model} · durable ${classification.durable.toFixed(2)} · ${classification.category} ${classification.categoryConfidence.toFixed(2)} · importance ${classification.importance.toFixed(1)} · ${when}`,
          confidence: classification.durable
        }, conversation.file_path, dryRun, counters)
        if (stored) {
          created++
          try {
            await linkMemory(agentDb, agentId, { memory_id: stored.memoryId, content: passage.text, embedding: stored.embedding }, classifier, counters)
          } catch (linkErr) {
            // Unlinked memories are retried by the backfill; never lose the memory over a link
            console.log(`[CONSOLIDATE] Linking failed for ${stored.memoryId}: ${(linkErr as Error).message}`)
          }
        }
      } catch (err) {
        // Keep the progress made so far; this exchange is retried next run
        errors.push(`Memory storage error (${conversation.file_path}): ${(err as Error).message}`)
        return { offset, created, classified, fatal: false, capped }
      }
    }
    offset = chunk.endIndex
  }
  return { offset, created, classified, fatal: false, capped }
}

/**
 * Consolidate memories for an agent
 */
export async function consolidateMemories(
  agentDb: AgentDatabase,
  agentId: string,
  conversations: PreparedConversation[],
  options: ConsolidationOptions = {}
): Promise<ConsolidationResult> {
  const startTime = Date.now()
  const runId = `run-${Date.now()}-${uuidv4().substring(0, 8)}`
  const errors: string[] = []
  const counters: RunCounters = { created: 0, reinforced: 0, linked: 0 }
  const dryRun = Boolean(options.dryRun)

  let conversationsProcessed = 0
  let chunksClassified = 0
  let moreRemaining = false

  const choice = await getProvider(options)
  if (choice.kind === 'none') {
    return {
      run_id: runId,
      status: 'failed',
      conversations_processed: 0,
      memories_created: 0,
      memories_reinforced: 0,
      memories_linked: 0,
      duration_ms: Date.now() - startTime,
      errors: [choice.reason],
      provider_used: 'none'
    }
  }

  const providerUsed = choice.kind === 'classifier' ? `jev:${choice.classifier.model}` : choice.llm.name

  if (!dryRun) {
    await recordConsolidationRun(agentDb, {
      run_id: runId,
      agent_id: agentId,
      llm_provider: providerUsed
    })
  }

  const minConfidence = options.minConfidence || DEFAULT_MEMORY_SETTINGS.consolidation.minConfidence
  const maxConversations = options.maxConversations || 50
  const withNewMessages = conversations.filter(c => (c.consolidated_offset || 0) < c.messages.length)
  const pending = withNewMessages.slice(0, maxConversations)
  if (withNewMessages.length > pending.length) moreRemaining = true

  console.log(`[CONSOLIDATE] Processing ${pending.length} conversations with new messages (${providerUsed})`)

  const budget = { remaining: MAX_PASSAGES_PER_RUN }

  if (!dryRun) {
    try {
      await scrubStoredSecrets(agentDb, agentId)
    } catch (err) {
      errors.push(`Secret scrub error: ${(err as Error).message}`)
    }
  }

  for (const conversation of pending) {
    try {
      console.log(`[CONSOLIDATE] Processing: ${conversation.file_path} from message ${conversation.consolidated_offset || 0}`)

      let newOffset = conversation.messages.length
      let memoriesFromConversation = 0

      if (choice.kind === 'classifier') {
        if (budget.remaining <= 0) { moreRemaining = true; break }
        const r = await consolidateWithClassifier(agentDb, agentId, conversation, choice.classifier, budget, dryRun, counters, errors)
        newOffset = r.offset
        memoriesFromConversation = r.created
        chunksClassified += r.classified
        if (r.capped) moreRemaining = true
        if (r.fatal) {
          // Bad key / bad URL: every other conversation would fail the same way
          if (!dryRun && newOffset > (conversation.consolidated_offset || 0)) {
            await markConversationConsolidated(agentDb, conversation.file_path, agentId, runId, newOffset, memoriesFromConversation)
          }
          break
        }
      } else {
        const provider = choice.llm
        const text = formatConversationForExtraction(conversation)

        if (text.length >= 100) {
          const extraction = await provider.extractMemories(text, {
            minConfidence,
            maxMemories: DEFAULT_MEMORY_SETTINGS.consolidation.maxMemoriesPerConversation,
            categories: options.categories
          })
          console.log(`[CONSOLIDATE] Extracted ${extraction.memories.length} memories from ${conversation.file_path}`)

          for (const memory of extraction.memories) {
            try {
              const stored = await storeMemory(agentDb, agentId, memory, conversation.file_path, dryRun, counters)
              if (!stored) continue
              memoriesFromConversation++

              if (provider.findRelationships) {
                try {
                  const existingMemories = await searchMemoriesByEmbedding(agentDb, agentId, stored.embedding, { limit: 10, minConfidence: 0.5 })
                  if (existingMemories.length > 0) {
                    const relationships = await provider.findRelationships(
                      memory,
                      existingMemories.map(m => ({ memory_id: m.memory_id, content: m.content, category: m.category }))
                    )
                    for (const rel of relationships) {
                      await linkMemories(agentDb, stored.memoryId, rel.memory_id, rel.relationship)
                      counters.linked++
                    }
                  }
                } catch (relError: any) {
                  console.log(`[CONSOLIDATE] Relationship finding failed:`, relError.message)
                }
              }
            } catch (memError: any) {
              errors.push(`Memory processing error: ${memError.message}`)
              console.error(`[CONSOLIDATE] Memory error:`, memError.message)
            }
          }
        }
      }

      // Record how far this conversation has been consolidated
      if (!dryRun && newOffset > (conversation.consolidated_offset || 0)) {
        await markConversationConsolidated(agentDb, conversation.file_path, agentId, runId, newOffset, memoriesFromConversation)
      }

      conversationsProcessed++

      if (!dryRun && conversationsProcessed % 5 === 0) {
        await updateConsolidationRun(agentDb, runId, {
          conversations_processed: conversationsProcessed,
          memories_created: counters.created,
          memories_reinforced: counters.reinforced,
          memories_linked: counters.linked
        })
      }
    } catch (convError: any) {
      errors.push(`Conversation error (${conversation.file_path}): ${convError.message}`)
      console.error(`[CONSOLIDATE] Conversation error:`, convError.message)
    }
  }

  // Give memories stored before linking existed (or whose link check failed) their edges
  if (choice.kind === 'classifier' && !dryRun) {
    await backfillLinks(agentDb, agentId, choice.classifier, counters, errors)
  }

  const status = errors.length > 0 && conversationsProcessed === 0 && counters.linked === 0 ? 'failed' : 'completed'

  if (!dryRun) {
    await updateConsolidationRun(agentDb, runId, {
      status,
      conversations_processed: conversationsProcessed,
      memories_created: counters.created,
      memories_reinforced: counters.reinforced,
      memories_linked: counters.linked,
      error: errors.length > 0 ? errors.join('; ') : undefined
    })
  }

  const result: ConsolidationResult = {
    run_id: runId,
    status,
    conversations_processed: conversationsProcessed,
    memories_created: counters.created,
    memories_reinforced: counters.reinforced,
    memories_linked: counters.linked,
    duration_ms: Date.now() - startTime,
    errors,
    provider_used: providerUsed,
    ...(choice.kind === 'classifier' ? { chunks_classified: chunksClassified, more_remaining: moreRemaining } : {})
  }

  console.log(`[CONSOLIDATE] Completed:`, result)
  return result
}

/**
 * Promote warm memories to long-term based on reinforcement
 */
export async function promoteMemories(
  agentDb: AgentDatabase,
  agentId: string,
  options: {
    minReinforcements?: number
    minAgeDays?: number
    dryRun?: boolean
  } = {}
): Promise<{ promoted: number; eligible: number }> {
  const minReinforcements = options.minReinforcements || DEFAULT_MEMORY_SETTINGS.retention.warmToLongMinReinforcements
  const minAgeDays = options.minAgeDays || DEFAULT_MEMORY_SETTINGS.retention.warmToLongPromotionDays
  const minAgeMs = minAgeDays * 24 * 60 * 60 * 1000
  const cutoffTime = Date.now() - minAgeMs

  // Find eligible memories
  const result = await agentDb.run(`
    ?[memory_id, reinforcement_count, created_at] :=
      *memories{memory_id, agent_id, tier, reinforcement_count, created_at},
      agent_id = ${escapeForCozo(agentId)},
      tier = 'warm',
      reinforcement_count >= ${minReinforcements},
      created_at <= ${cutoffTime}
  `)

  const eligible = result.rows.length
  let promoted = 0

  if (!options.dryRun) {
    for (const row of result.rows) {
      const memoryId = row[0] as string
      try {
        await agentDb.run(`
          ?[memory_id, tier, promoted_at] <- [[
            ${escapeForCozo(memoryId)},
            'long',
            ${Date.now()}
          ]]
          :update memories
        `)
        promoted++
        console.log(`[CONSOLIDATE] Promoted to long-term: ${memoryId}`)
      } catch (error: any) {
        console.error(`[CONSOLIDATE] Failed to promote ${memoryId}:`, error.message)
      }
    }
  } else {
    promoted = eligible
  }

  return { promoted, eligible }
}

/**
 * Prune old short-term memories that have been consolidated
 */
export async function pruneShortTermMemory(
  agentDb: AgentDatabase,
  agentId: string,
  options: {
    retentionDays?: number
    dryRun?: boolean
  } = {}
): Promise<{ pruned: number }> {
  const retentionDays = options.retentionDays || DEFAULT_MEMORY_SETTINGS.retention.shortTermDays

  if (retentionDays === 0) {
    console.log('[CONSOLIDATE] Pruning disabled (retentionDays = 0)')
    return { pruned: 0 }
  }

  const cutoffTime = Date.now() - (retentionDays * 24 * 60 * 60 * 1000)

  // Find messages older than retention that are in consolidated conversations
  // Fix: messages table has columns (msg_id, conversation_file, role, ts, text) — no agent_id or timestamp
  // Filter by agent_id via consolidated_conversations which does have that column
  const result = await agentDb.run(`
    ?[msg_id, conversation_file] :=
      *messages{msg_id, conversation_file, ts},
      ts < ${cutoffTime},
      *consolidated_conversations{conversation_file, agent_id},
      agent_id = ${escapeForCozo(agentId)}
  `)

  const toPrune = result.rows.length

  if (!options.dryRun && toPrune > 0) {
    // Delete messages
    for (const row of result.rows) {
      const msgId = row[0] as string
      try {
        await agentDb.run(`
          ?[msg_id] <- [[${escapeForCozo(msgId)}]]
          :delete messages
        `)
        // Also delete embeddings
        await agentDb.run(`
          ?[msg_id] <- [[${escapeForCozo(msgId)}]]
          :delete msg_vec
        `)
      } catch (error: any) {
        console.error(`[CONSOLIDATE] Failed to delete ${msgId}:`, error.message)
      }
    }
    console.log(`[CONSOLIDATE] Pruned ${toPrune} old messages`)

    // Orphan cleanup: best-effort, non-fatal
    // If process crashes between memory deletion and orphan cleanup,
    // orphans will accumulate but won't cause data corruption.
    // The outer try/catch ensures orphan cleanup failures never crash pruning.
    try {
      // Delete orphaned msg_terms rows whose msg_id no longer exists in messages
      try {
        const orphanedTerms = await agentDb.run(`
          ?[msg_id, term] :=
            *msg_terms{msg_id, term},
            not *messages{msg_id}
        `)
        if (orphanedTerms.rows.length > 0) {
          for (const row of orphanedTerms.rows) {
            const orphanMsgId = row[0] as string
            const orphanTerm = row[1] as string
            await agentDb.run(`
              ?[msg_id, term] <- [[${escapeForCozo(orphanMsgId)}, ${escapeForCozo(orphanTerm)}]]
              :delete msg_terms
            `)
          }
          console.log(`[CONSOLIDATE] Deleted ${orphanedTerms.rows.length} orphaned msg_terms rows`)
        }
      } catch (error: any) {
        console.error(`[CONSOLIDATE] Failed to delete orphaned msg_terms:`, error.message)
      }

      // Delete orphaned code_symbols rows whose msg_id no longer exists in messages
      try {
        const orphanedSymbols = await agentDb.run(`
          ?[msg_id, symbol] :=
            *code_symbols{msg_id, symbol},
            not *messages{msg_id}
        `)
        if (orphanedSymbols.rows.length > 0) {
          for (const row of orphanedSymbols.rows) {
            const orphanMsgId = row[0] as string
            const orphanSymbol = row[1] as string
            await agentDb.run(`
              ?[msg_id, symbol] <- [[${escapeForCozo(orphanMsgId)}, ${escapeForCozo(orphanSymbol)}]]
              :delete code_symbols
            `)
          }
          console.log(`[CONSOLIDATE] Deleted ${orphanedSymbols.rows.length} orphaned code_symbols rows`)
        }
      } catch (error: any) {
        console.error(`[CONSOLIDATE] Failed to delete orphaned code_symbols:`, error.message)
      }
    } catch (orphanErr) {
      console.warn('[CONSOLIDATE] Non-fatal: orphan cleanup failed:', orphanErr)
    }
  }

  return { pruned: options.dryRun ? toPrune : toPrune }
}
