/**
 * CozoDB Schema for Long-Term Memory
 *
 * Implements a biological memory model:
 * - Short-term: Current RAG system (messages, msg_vec, msg_terms)
 * - Warm: Recently consolidated, frequently accessed
 * - Long-term: Permanent, distilled knowledge
 *
 * Inspired by:
 * - Claude-Cognitive: HOT/WARM/COLD tiers
 * - Cipher: System 1/2 separation (knowledge vs reasoning)
 * - Cognee: Graph relationships between memories
 */

import { AgentDatabase } from './cozo-db'
import { escapeForCozo } from './cozo-utils'

/**
 * Memory categories following System 1/2 model
 */
export type MemoryCategory =
  | 'fact'        // System 1: Specific information (URLs, paths, names)
  | 'decision'    // System 1: Choices made with rationale
  | 'preference'  // System 1: User/project preferences
  | 'pattern'     // System 2: Recurring workflows
  | 'insight'     // System 2: Learned understanding
  | 'reasoning'   // System 2: How problems were solved

export type MemoryTier = 'warm' | 'long'
export type MemorySystem = 1 | 2  // 1 = knowledge, 2 = reasoning

export type RelationshipType =
  | 'leads_to'    // This memory led to another
  | 'contradicts' // This memory contradicts another
  | 'supports'    // This memory supports another
  | 'supersedes'  // This memory replaces another

/**
 * Initialize long-term memory schema
 */
export async function initializeMemorySchema(agentDb: AgentDatabase): Promise<void> {
  console.log('[MEMORY-SCHEMA] Initializing long-term memory schema...')

  const createTableIfNotExists = async (tableName: string, schema: string) => {
    try {
      await agentDb.run(schema)
      console.log(`[MEMORY-SCHEMA] ✓ Created table: ${tableName}`)
    } catch (error: any) {
      if (error.code === 'eval::stored_relation_conflict') {
        console.log(`[MEMORY-SCHEMA] ℹ Table ${tableName} already exists`)
      } else {
        console.error(`[MEMORY-SCHEMA] ✗ Failed to create ${tableName}:`, error)
        throw error
      }
    }
  }

  // 1. Memories table - Core long-term memory storage
  await createTableIfNotExists('memories', `
    :create memories {
      memory_id: String
      =>
      agent_id: String,
      tier: String,
      system: Int,
      category: String,
      content: String,
      context: String?,
      source_conversations: String?,
      source_message_ids: String?,
      related_memories: String?,
      confidence: Float,
      created_at: Int,
      last_reinforced_at: Int,
      reinforcement_count: Int,
      access_count: Int,
      last_accessed_at: Int?,
      promoted_at: Int?
    }
  `)

  // 2. Memory vectors - Embeddings for semantic search
  await createTableIfNotExists('memory_vec', `
    :create memory_vec {
      memory_id: String
      =>
      vec: <F32; 384>
    }
  `)

  // 3. Memory links - Graph relationships between memories
  await createTableIfNotExists('memory_links', `
    :create memory_links {
      from_memory_id: String,
      to_memory_id: String
      =>
      relationship: String,
      created_at: Int
    }
  `)

  // 4. Consolidation runs - Track consolidation history
  await createTableIfNotExists('consolidation_runs', `
    :create consolidation_runs {
      run_id: String
      =>
      agent_id: String,
      started_at: Int,
      completed_at: Int?,
      status: String,
      conversations_processed: Int,
      memories_created: Int,
      memories_reinforced: Int,
      memories_linked: Int,
      llm_provider: String,
      error: String?
    }
  `)

  // 5. Consolidated conversations - Track which conversations have been processed
  await createTableIfNotExists('consolidated_conversations', `
    :create consolidated_conversations {
      conversation_file: String
      =>
      agent_id: String,
      run_id: String,
      consolidated_at: Int,
      message_count: Int,
      memories_extracted: Int
    }
  `)

  console.log('[MEMORY-SCHEMA] ✅ Long-term memory schema initialized')
}

/**
 * Create a new memory
 */
export async function createMemory(agentDb: AgentDatabase, memory: {
  memory_id: string
  agent_id: string
  tier: MemoryTier
  system: MemorySystem
  category: MemoryCategory
  content: string
  context?: string
  source_conversations?: string[]
  source_message_ids?: string[]
  related_memories?: string[]
  confidence: number
}): Promise<void> {
  const now = Date.now()

  await agentDb.run(`
    ?[memory_id, agent_id, tier, system, category, content, context,
      source_conversations, source_message_ids, related_memories,
      confidence, created_at, last_reinforced_at, reinforcement_count,
      access_count, last_accessed_at, promoted_at] <- [[
      ${escapeForCozo(memory.memory_id)},
      ${escapeForCozo(memory.agent_id)},
      ${escapeForCozo(memory.tier)},
      ${memory.system},
      ${escapeForCozo(memory.category)},
      ${escapeForCozo(memory.content)},
      ${escapeForCozo(memory.context)},
      ${escapeForCozo(memory.source_conversations ? JSON.stringify(memory.source_conversations) : undefined)},
      ${escapeForCozo(memory.source_message_ids ? JSON.stringify(memory.source_message_ids) : undefined)},
      ${escapeForCozo(memory.related_memories ? JSON.stringify(memory.related_memories) : undefined)},
      ${memory.confidence},
      ${now},
      ${now},
      1,
      0,
      null,
      null
    ]]
    :put memories
  `)
}

/**
 * Store memory embedding
 */
export async function storeMemoryEmbedding(
  agentDb: AgentDatabase,
  memoryId: string,
  embedding: number[]
): Promise<void> {
  // Convert embedding array to CozoDB vector format
  const vecString = `<${embedding.join(', ')}>`

  await agentDb.run(`
    ?[memory_id, vec] <- [[
      ${escapeForCozo(memoryId)},
      ${vecString}
    ]]
    :put memory_vec
  `)
}

/**
 * Reinforce existing memory (update when same insight is extracted again)
 */
export async function reinforceMemory(
  agentDb: AgentDatabase,
  memoryId: string,
  additionalContext?: string
): Promise<void> {
  const now = Date.now()

  // Get current memory
  const result = await agentDb.run(`
    ?[context, reinforcement_count] :=
      *memories{memory_id, context, reinforcement_count},
      memory_id = ${escapeForCozo(memoryId)}
  `)

  if (result.rows.length === 0) {
    throw new Error(`Memory ${memoryId} not found`)
  }

  const currentContext = result.rows[0][0] as string | null
  const currentCount = result.rows[0][1] as number

  // Merge context if new info provided
  let newContext = currentContext
  if (additionalContext && additionalContext !== currentContext) {
    newContext = currentContext
      ? `${currentContext}\n---\n${additionalContext}`
      : additionalContext
  }

  await agentDb.run(`
    ?[memory_id, last_reinforced_at, reinforcement_count, context] <- [[
      ${escapeForCozo(memoryId)},
      ${now},
      ${currentCount + 1},
      ${escapeForCozo(newContext)}
    ]]
    :update memories
  `)
}

/**
 * Create link between memories
 */
export async function linkMemories(
  agentDb: AgentDatabase,
  fromMemoryId: string,
  toMemoryId: string,
  relationship: RelationshipType
): Promise<void> {
  const now = Date.now()

  await agentDb.run(`
    ?[from_memory_id, to_memory_id, relationship, created_at] <- [[
      ${escapeForCozo(fromMemoryId)},
      ${escapeForCozo(toMemoryId)},
      ${escapeForCozo(relationship)},
      ${now}
    ]]
    :put memory_links
  `)
}

/**
 * Search memories by embedding similarity
 */
export async function searchMemoriesByEmbedding(
  agentDb: AgentDatabase,
  agentId: string,
  queryEmbedding: number[],
  options: {
    limit?: number
    categories?: MemoryCategory[]
    minConfidence?: number
    tier?: MemoryTier
  } = {}
): Promise<Array<{
  memory_id: string
  category: string
  content: string
  context: string | null
  confidence: number
  reinforcement_count: number
  similarity: number
}>> {
  const limit = options.limit || 10
  const minConfidence = options.minConfidence || 0.5
  const vecString = `<${queryEmbedding.join(', ')}>`

  // Build category filter
  let categoryFilter = ''
  if (options.categories && options.categories.length > 0) {
    const cats = options.categories.map(c => escapeForCozo(c)).join(', ')
    categoryFilter = `, category in [${cats}]`
  }

  // Build tier filter
  let tierFilter = ''
  if (options.tier) {
    tierFilter = `, tier = ${escapeForCozo(options.tier)}`
  }

  const query = `
    ?[memory_id, category, content, context, confidence, reinforcement_count, similarity] :=
      ~memory_vec:hnsw{memory_id, vec | query: ${vecString}, k: ${limit * 2}, ef: 50, bind_distance: similarity},
      *memories{memory_id, agent_id, category, content, context, confidence, reinforcement_count, tier},
      agent_id = ${escapeForCozo(agentId)},
      confidence >= ${minConfidence}
      ${categoryFilter}
      ${tierFilter}

    :order similarity
    :limit ${limit}
  `

  const result = await agentDb.run(query)

  // Update access counts for returned memories
  const now = Date.now()
  for (const row of result.rows) {
    const memId = row[0] as string
    await agentDb.run(`
      ?[memory_id, access_count, last_accessed_at] :=
        *memories{memory_id, access_count: old_count},
        memory_id = ${escapeForCozo(memId)},
        access_count = old_count + 1,
        last_accessed_at = ${now}
      :update memories
    `)
  }

  return result.rows.map((row: unknown[]) => ({
    memory_id: row[0] as string,
    category: row[1] as string,
    content: row[2] as string,
    context: row[3] as string | null,
    confidence: row[4] as number,
    reinforcement_count: row[5] as number,
    similarity: row[6] as number
  }))
}

/**
 * Get memories by category
 */
export async function getMemoriesByCategory(
  agentDb: AgentDatabase,
  agentId: string,
  category: MemoryCategory,
  limit: number = 50
): Promise<Array<{
  memory_id: string
  content: string
  context: string | null
  confidence: number
  reinforcement_count: number
  created_at: number
}>> {
  const result = await agentDb.run(`
    ?[memory_id, content, context, confidence, reinforcement_count, created_at] :=
      *memories{memory_id, agent_id, category, content, context, confidence, reinforcement_count, created_at},
      agent_id = ${escapeForCozo(agentId)},
      category = ${escapeForCozo(category)}

    :order -reinforcement_count, -created_at
    :limit ${limit}
  `)

  return result.rows.map((row: unknown[]) => ({
    memory_id: row[0] as string,
    content: row[1] as string,
    context: row[2] as string | null,
    confidence: row[3] as number,
    reinforcement_count: row[4] as number,
    created_at: row[5] as number
  }))
}

/**
 * Get related memories via graph traversal
 */
export async function getRelatedMemories(
  agentDb: AgentDatabase,
  memoryId: string,
  depth: number = 2
): Promise<Array<{
  memory_id: string
  relationship: string
  content: string
  distance: number
}>> {
  // Use CozoDB's graph traversal
  const result = await agentDb.run(`
    related[memory_id, relationship, distance] :=
      from_id = ${escapeForCozo(memoryId)},
      *memory_links{from_memory_id: from_id, to_memory_id: memory_id, relationship},
      distance = 1

    related[memory_id, relationship, distance] :=
      related[prev_id, _, prev_distance],
      prev_distance < ${depth},
      *memory_links{from_memory_id: prev_id, to_memory_id: memory_id, relationship},
      distance = prev_distance + 1

    ?[memory_id, relationship, content, distance] :=
      related[memory_id, relationship, distance],
      *memories{memory_id, content}

    :order distance
  `)

  return result.rows.map((row: unknown[]) => ({
    memory_id: row[0] as string,
    relationship: row[1] as string,
    content: row[2] as string,
    distance: row[3] as number
  }))
}

/**
 * Record a consolidation run
 */
export async function recordConsolidationRun(
  agentDb: AgentDatabase,
  run: {
    run_id: string
    agent_id: string
    llm_provider: string
  }
): Promise<void> {
  const now = Date.now()

  await agentDb.run(`
    ?[run_id, agent_id, started_at, completed_at, status,
      conversations_processed, memories_created, memories_reinforced,
      memories_linked, llm_provider, error] <- [[
      ${escapeForCozo(run.run_id)},
      ${escapeForCozo(run.agent_id)},
      ${now},
      null,
      'running',
      0,
      0,
      0,
      0,
      ${escapeForCozo(run.llm_provider)},
      null
    ]]
    :put consolidation_runs
  `)
}

/**
 * Update consolidation run progress
 */
export async function updateConsolidationRun(
  agentDb: AgentDatabase,
  runId: string,
  updates: {
    status?: 'running' | 'completed' | 'failed'
    conversations_processed?: number
    memories_created?: number
    memories_reinforced?: number
    memories_linked?: number
    error?: string
  }
): Promise<void> {
  const now = Date.now()

  // Build update fields
  const fields: string[] = []
  const values: string[] = []

  if (updates.status) {
    fields.push('status')
    values.push(escapeForCozo(updates.status))
    if (updates.status === 'completed' || updates.status === 'failed') {
      fields.push('completed_at')
      values.push(`${now}`)
    }
  }
  if (updates.conversations_processed !== undefined) {
    fields.push('conversations_processed')
    values.push(`${updates.conversations_processed}`)
  }
  if (updates.memories_created !== undefined) {
    fields.push('memories_created')
    values.push(`${updates.memories_created}`)
  }
  if (updates.memories_reinforced !== undefined) {
    fields.push('memories_reinforced')
    values.push(`${updates.memories_reinforced}`)
  }
  if (updates.memories_linked !== undefined) {
    fields.push('memories_linked')
    values.push(`${updates.memories_linked}`)
  }
  if (updates.error) {
    fields.push('error')
    values.push(escapeForCozo(updates.error))
  }

  if (fields.length === 0) return

  await agentDb.run(`
    ?[run_id, ${fields.join(', ')}] <- [[
      ${escapeForCozo(runId)},
      ${values.join(', ')}
    ]]
    :update consolidation_runs
  `)
}

/**
 * Mark conversation as consolidated
 */
export async function markConversationConsolidated(
  agentDb: AgentDatabase,
  conversationFile: string,
  agentId: string,
  runId: string,
  messageCount: number,
  memoriesExtracted: number
): Promise<void> {
  const now = Date.now()

  await agentDb.run(`
    ?[conversation_file, agent_id, run_id, consolidated_at, message_count, memories_extracted] <- [[
      ${escapeForCozo(conversationFile)},
      ${escapeForCozo(agentId)},
      ${escapeForCozo(runId)},
      ${now},
      ${messageCount},
      ${memoriesExtracted}
    ]]
    :put consolidated_conversations
  `)
}

/**
 * Check if conversation has been consolidated
 */
export async function isConversationConsolidated(
  agentDb: AgentDatabase,
  conversationFile: string
): Promise<boolean> {
  const result = await agentDb.run(`
    ?[exists] :=
      *consolidated_conversations{conversation_file},
      conversation_file = ${escapeForCozo(conversationFile)},
      exists = true

    ?[exists] :=
      not *consolidated_conversations{conversation_file: ${escapeForCozo(conversationFile)}},
      exists = false
  `)

  return result.rows.length > 0 && result.rows[0][0] === true
}

/**
 * Get memory statistics for an agent
 */
export async function getMemoryStats(
  agentDb: AgentDatabase,
  agentId: string
): Promise<{
  total_memories: number
  by_category: Record<string, number>
  by_tier: Record<string, number>
  by_system: Record<number, number>
  avg_confidence: number
  total_reinforcements: number
  total_accesses: number
}> {
  const result = await agentDb.run(`
    stats[category, tier, system, count, conf_sum, reinf_sum, access_sum] :=
      *memories{agent_id, category, tier, system, confidence, reinforcement_count, access_count},
      agent_id = ${escapeForCozo(agentId)},
      count = count(category),
      conf_sum = sum(confidence),
      reinf_sum = sum(reinforcement_count),
      access_sum = sum(access_count)

    ?[category, tier, system, count, conf_sum, reinf_sum, access_sum] := stats[category, tier, system, count, conf_sum, reinf_sum, access_sum]
  `)

  const by_category: Record<string, number> = {}
  const by_tier: Record<string, number> = {}
  const by_system: Record<number, number> = {}
  let total = 0
  let confSum = 0
  let reinfSum = 0
  let accessSum = 0

  for (const row of result.rows) {
    const category = row[0] as string
    const tier = row[1] as string
    const system = row[2] as number
    const count = row[3] as number

    by_category[category] = (by_category[category] || 0) + count
    by_tier[tier] = (by_tier[tier] || 0) + count
    by_system[system] = (by_system[system] || 0) + count
    total += count
    confSum += row[4] as number
    reinfSum += row[5] as number
    accessSum += row[6] as number
  }

  return {
    total_memories: total,
    by_category,
    by_tier,
    by_system,
    avg_confidence: total > 0 ? confSum / total : 0,
    total_reinforcements: reinfSum,
    total_accesses: accessSum
  }
}

/**
 * Promote memory from warm to long tier
 */
export async function promoteMemory(
  agentDb: AgentDatabase,
  memoryId: string
): Promise<void> {
  const now = Date.now()

  await agentDb.run(`
    ?[memory_id, tier, promoted_at] <- [[
      ${escapeForCozo(memoryId)},
      'long',
      ${now}
    ]]
    :update memories
  `)
}

/**
 * Get recent consolidation runs
 */
export async function getConsolidationRuns(
  agentDb: AgentDatabase,
  agentId: string,
  limit: number = 10
): Promise<Array<{
  run_id: string
  started_at: number
  completed_at: number | null
  status: string
  conversations_processed: number
  memories_created: number
  memories_reinforced: number
  llm_provider: string
  error: string | null
}>> {
  const result = await agentDb.run(`
    ?[run_id, started_at, completed_at, status, conversations_processed,
      memories_created, memories_reinforced, llm_provider, error] :=
      *consolidation_runs{run_id, agent_id, started_at, completed_at, status,
        conversations_processed, memories_created, memories_reinforced,
        llm_provider, error},
      agent_id = ${escapeForCozo(agentId)}

    :order -started_at
    :limit ${limit}
  `)

  return result.rows.map((row: unknown[]) => ({
    run_id: row[0] as string,
    started_at: row[1] as number,
    completed_at: row[2] as number | null,
    status: row[3] as string,
    conversations_processed: row[4] as number,
    memories_created: row[5] as number,
    memories_reinforced: row[6] as number,
    llm_provider: row[7] as string,
    error: row[8] as string | null
  }))
}
