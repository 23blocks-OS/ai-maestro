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
  isConversationConsolidated,
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

/**
 * Get LLM provider based on options
 */
async function getProvider(options: ConsolidationOptions): Promise<LLMProvider | null> {
  const preference = options.provider || 'auto'

  if (preference === 'ollama' || preference === 'auto') {
    const ollama = createOllamaProvider({
      model: options.ollamaModel || DEFAULT_MEMORY_SETTINGS.consolidation.ollamaModel
    })
    if (await ollama.isAvailable()) {
      console.log('[CONSOLIDATE] Using Ollama provider')
      return ollama
    }
    if (preference === 'ollama') {
      console.log('[CONSOLIDATE] Ollama not available and explicitly requested')
      return null
    }
  }

  if (preference === 'claude' || preference === 'auto') {
    const claude = createClaudeProvider({
      model: options.claudeModel || DEFAULT_MEMORY_SETTINGS.consolidation.claudeModel
    })
    if (await claude.isAvailable()) {
      console.log('[CONSOLIDATE] Using Claude provider')
      return claude
    }
    if (preference === 'claude') {
      console.log('[CONSOLIDATE] Claude not available and explicitly requested')
      return null
    }
  }

  console.log('[CONSOLIDATE] No LLM provider available')
  return null
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

  for (const msg of conversation.messages) {
    if (msg.tool_use) continue  // Skip tool use messages

    const role = msg.role.toUpperCase()
    const content = msg.content.length > 2000
      ? msg.content.substring(0, 2000) + '... [truncated]'
      : msg.content

    lines.push(`[${role}]: ${content}`)
  }

  return lines.join('\n\n')
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

  let conversationsProcessed = 0
  let memoriesCreated = 0
  let memoriesReinforced = 0
  let memoriesLinked = 0
  let providerUsed = 'none'

  // Get LLM provider
  const provider = await getProvider(options)
  if (!provider) {
    return {
      run_id: runId,
      status: 'failed',
      conversations_processed: 0,
      memories_created: 0,
      memories_reinforced: 0,
      memories_linked: 0,
      duration_ms: Date.now() - startTime,
      errors: ['No LLM provider available'],
      provider_used: 'none'
    }
  }

  providerUsed = provider.name

  // Record run start
  if (!options.dryRun) {
    await recordConsolidationRun(agentDb, {
      run_id: runId,
      agent_id: agentId,
      llm_provider: providerUsed
    })
  }

  const minConfidence = options.minConfidence || DEFAULT_MEMORY_SETTINGS.consolidation.minConfidence
  const maxConversations = options.maxConversations || 50

  // Filter out already consolidated conversations
  const unconsolidated: PreparedConversation[] = []
  for (const conv of conversations) {
    if (await isConversationConsolidated(agentDb, conv.file_path)) {
      continue
    }
    unconsolidated.push(conv)
    if (unconsolidated.length >= maxConversations) break
  }

  console.log(`[CONSOLIDATE] Processing ${unconsolidated.length} conversations (${conversations.length - unconsolidated.length} already consolidated)`)

  // Process each conversation
  for (const conversation of unconsolidated) {
    try {
      console.log(`[CONSOLIDATE] Processing: ${conversation.file_path}`)

      // Format conversation for extraction
      const text = formatConversationForExtraction(conversation)

      if (text.length < 100) {
        console.log(`[CONSOLIDATE] Skipping short conversation: ${conversation.file_path}`)
        continue
      }

      // Extract memories using LLM
      const extraction = await provider.extractMemories(text, {
        minConfidence,
        maxMemories: DEFAULT_MEMORY_SETTINGS.consolidation.maxMemoriesPerConversation,
        categories: options.categories
      })

      console.log(`[CONSOLIDATE] Extracted ${extraction.memories.length} memories from ${conversation.file_path}`)

      let memoriesFromConversation = 0

      // Process each extracted memory
      for (const memory of extraction.memories) {
        try {
          // Generate embedding for the memory
          const embedding = await embed(memory.content)

          // Check for duplicates
          const dedup = await checkDuplicate(agentDb, agentId, memory, embedding)

          if (options.dryRun) {
            console.log(`[CONSOLIDATE] [DRY RUN] Would ${dedup.action}: ${memory.category} - ${memory.content.substring(0, 100)}...`)
            if (dedup.action === 'create') memoriesCreated++
            else if (dedup.action === 'reinforce') memoriesReinforced++
            continue
          }

          if (dedup.action === 'reinforce' && dedup.existing_memory_id) {
            // Reinforce existing memory
            await reinforceMemory(agentDb, dedup.existing_memory_id, memory.context)
            memoriesReinforced++
            console.log(`[CONSOLIDATE] Reinforced memory: ${dedup.existing_memory_id}`)
          } else if (dedup.action === 'create') {
            // Create new memory
            const memoryId = `mem-${Date.now()}-${uuidv4().substring(0, 8)}`

            await createMemory(agentDb, {
              memory_id: memoryId,
              agent_id: agentId,
              tier: 'warm',  // New memories start in warm tier
              system: getCategorySystem(memory.category as MemoryCategory),
              category: memory.category as MemoryCategory,
              content: memory.content,
              context: memory.context,
              source_conversations: [conversation.file_path],
              confidence: memory.confidence
            })

            // Store embedding
            await storeMemoryEmbedding(agentDb, memoryId, embedding)

            memoriesCreated++
            memoriesFromConversation++
            console.log(`[CONSOLIDATE] Created memory: ${memoryId} (${memory.category})`)

            // Find and create relationships with existing memories
            if (provider.findRelationships) {
              try {
                // Get some existing memories to check relationships
                const existingMemories = await searchMemoriesByEmbedding(
                  agentDb,
                  agentId,
                  embedding,
                  { limit: 10, minConfidence: 0.5 }
                )

                if (existingMemories.length > 0) {
                  const relationships = await provider.findRelationships(
                    memory,
                    existingMemories.map(m => ({
                      memory_id: m.memory_id,
                      content: m.content,
                      category: m.category
                    }))
                  )

                  for (const rel of relationships) {
                    await linkMemories(agentDb, memoryId, rel.memory_id, rel.relationship)
                    memoriesLinked++
                    console.log(`[CONSOLIDATE] Linked ${memoryId} -> ${rel.memory_id} (${rel.relationship})`)
                  }
                }
              } catch (relError: any) {
                console.log(`[CONSOLIDATE] Relationship finding failed:`, relError.message)
              }
            }
          }
        } catch (memError: any) {
          errors.push(`Memory processing error: ${memError.message}`)
          console.error(`[CONSOLIDATE] Memory error:`, memError.message)
        }
      }

      // Mark conversation as consolidated
      if (!options.dryRun) {
        await markConversationConsolidated(
          agentDb,
          conversation.file_path,
          agentId,
          runId,
          conversation.message_count,
          memoriesFromConversation
        )
      }

      conversationsProcessed++

      // Update run progress periodically
      if (!options.dryRun && conversationsProcessed % 5 === 0) {
        await updateConsolidationRun(agentDb, runId, {
          conversations_processed: conversationsProcessed,
          memories_created: memoriesCreated,
          memories_reinforced: memoriesReinforced,
          memories_linked: memoriesLinked
        })
      }
    } catch (convError: any) {
      errors.push(`Conversation error (${conversation.file_path}): ${convError.message}`)
      console.error(`[CONSOLIDATE] Conversation error:`, convError.message)
    }
  }

  // Final update
  if (!options.dryRun) {
    await updateConsolidationRun(agentDb, runId, {
      status: errors.length > 0 && conversationsProcessed === 0 ? 'failed' : 'completed',
      conversations_processed: conversationsProcessed,
      memories_created: memoriesCreated,
      memories_reinforced: memoriesReinforced,
      memories_linked: memoriesLinked,
      error: errors.length > 0 ? errors.join('; ') : undefined
    })
  }

  const result: ConsolidationResult = {
    run_id: runId,
    status: errors.length > 0 && conversationsProcessed === 0 ? 'failed' : 'completed',
    conversations_processed: conversationsProcessed,
    memories_created: memoriesCreated,
    memories_reinforced: memoriesReinforced,
    memories_linked: memoriesLinked,
    duration_ms: Date.now() - startTime,
    errors,
    provider_used: providerUsed
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
