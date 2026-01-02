/**
 * Long-Term Memory Search
 *
 * Provides semantic search across agent memories with graph traversal
 * for finding related memories.
 */

import { AgentDatabase } from '../cozo-db'
import { embedTexts } from '../rag/embeddings'

// Helper to embed a single text
async function embed(text: string): Promise<number[]> {
  const embeddings = await embedTexts([text])
  return Array.from(embeddings[0])
}
import {
  searchMemoriesByEmbedding,
  getMemoriesByCategory,
  getRelatedMemories,
  getMemoryStats,
  MemoryCategory,
  MemoryTier
} from '../cozo-schema-memory'
import {
  MemorySearchOptions,
  MemorySearchResult,
  MemoryStats,
  DEFAULT_MEMORY_SETTINGS
} from './types'
import { escapeForCozo } from '../cozo-utils'

/**
 * Search long-term memories using semantic similarity
 */
export async function searchMemories(
  agentDb: AgentDatabase,
  agentId: string,
  query: string,
  options: MemorySearchOptions = {}
): Promise<MemorySearchResult[]> {
  const limit = options.limit || DEFAULT_MEMORY_SETTINGS.search.defaultLimit
  const includeRelated = options.includeRelated ?? DEFAULT_MEMORY_SETTINGS.search.includeRelatedByDefault
  const relatedDepth = options.relatedDepth || DEFAULT_MEMORY_SETTINGS.search.relatedDepth

  // Generate embedding for query
  const queryEmbedding = await embed(query)

  // Search by embedding similarity
  const results = await searchMemoriesByEmbedding(
    agentDb,
    agentId,
    queryEmbedding,
    {
      limit,
      categories: options.categories,
      minConfidence: options.minConfidence,
      tier: options.tier
    }
  )

  // Optionally fetch related memories for each result
  if (includeRelated) {
    const enrichedResults: MemorySearchResult[] = []

    for (const result of results) {
      const related = await getRelatedMemories(agentDb, result.memory_id, relatedDepth)

      enrichedResults.push({
        ...result,
        category: result.category as MemoryCategory,
        related: related.length > 0 ? related.map(r => ({
          ...r,
          relationship: r.relationship as any
        })) : undefined
      })
    }

    return enrichedResults
  }

  return results.map(r => ({
    ...r,
    category: r.category as MemoryCategory
  }))
}

/**
 * Get memories by category
 */
export async function getMemoriesByType(
  agentDb: AgentDatabase,
  agentId: string,
  category: MemoryCategory,
  options: {
    limit?: number
    includeRelated?: boolean
  } = {}
): Promise<MemorySearchResult[]> {
  const limit = options.limit || 50

  const memories = await getMemoriesByCategory(agentDb, agentId, category, limit)

  if (options.includeRelated) {
    const enrichedResults: MemorySearchResult[] = []

    for (const memory of memories) {
      const related = await getRelatedMemories(agentDb, memory.memory_id, 2)

      enrichedResults.push({
        memory_id: memory.memory_id,
        category,
        content: memory.content,
        context: memory.context,
        confidence: memory.confidence,
        reinforcement_count: memory.reinforcement_count,
        similarity: 1.0,  // Not from similarity search
        related: related.length > 0 ? related.map(r => ({
          ...r,
          relationship: r.relationship as any
        })) : undefined
      })
    }

    return enrichedResults
  }

  return memories.map(m => ({
    memory_id: m.memory_id,
    category,
    content: m.content,
    context: m.context,
    confidence: m.confidence,
    reinforcement_count: m.reinforcement_count,
    similarity: 1.0
  }))
}

/**
 * Get all facts for an agent (commonly needed for context)
 */
export async function getFacts(
  agentDb: AgentDatabase,
  agentId: string,
  limit: number = 50
): Promise<MemorySearchResult[]> {
  return getMemoriesByType(agentDb, agentId, 'fact', { limit })
}

/**
 * Get all preferences for an agent
 */
export async function getPreferences(
  agentDb: AgentDatabase,
  agentId: string,
  limit: number = 50
): Promise<MemorySearchResult[]> {
  return getMemoriesByType(agentDb, agentId, 'preference', { limit })
}

/**
 * Get all patterns for an agent
 */
export async function getPatterns(
  agentDb: AgentDatabase,
  agentId: string,
  limit: number = 50
): Promise<MemorySearchResult[]> {
  return getMemoriesByType(agentDb, agentId, 'pattern', { limit })
}

/**
 * Get all decisions for an agent
 */
export async function getDecisions(
  agentDb: AgentDatabase,
  agentId: string,
  limit: number = 50
): Promise<MemorySearchResult[]> {
  return getMemoriesByType(agentDb, agentId, 'decision', { limit })
}

/**
 * Get all insights for an agent
 */
export async function getInsights(
  agentDb: AgentDatabase,
  agentId: string,
  limit: number = 50
): Promise<MemorySearchResult[]> {
  return getMemoriesByType(agentDb, agentId, 'insight', { limit })
}

/**
 * Get memory statistics for an agent
 */
export async function getStats(
  agentDb: AgentDatabase,
  agentId: string
): Promise<MemoryStats> {
  const stats = await getMemoryStats(agentDb, agentId)

  // Get last consolidation info
  const lastRun = await agentDb.run(`
    ?[run_id, started_at, memories_created] :=
      *consolidation_runs{run_id, agent_id, started_at, memories_created, status},
      agent_id = ${escapeForCozo(agentId)},
      status = 'completed'

    :order -started_at
    :limit 1
  `)

  return {
    ...stats,
    by_category: stats.by_category as Record<MemoryCategory, number>,
    by_tier: stats.by_tier as Record<MemoryTier, number>,
    by_system: stats.by_system as Record<1 | 2, number>,
    last_consolidation: lastRun.rows.length > 0 ? {
      run_id: lastRun.rows[0][0] as string,
      timestamp: lastRun.rows[0][1] as number,
      memories_created: lastRun.rows[0][2] as number
    } : undefined
  }
}

/**
 * Get recent memories (for debugging/exploration)
 */
export async function getRecentMemories(
  agentDb: AgentDatabase,
  agentId: string,
  limit: number = 20
): Promise<Array<{
  memory_id: string
  category: MemoryCategory
  tier: MemoryTier
  content: string
  confidence: number
  created_at: number
  reinforcement_count: number
}>> {
  const result = await agentDb.run(`
    ?[memory_id, category, tier, content, confidence, created_at, reinforcement_count] :=
      *memories{memory_id, agent_id, category, tier, content, confidence, created_at, reinforcement_count},
      agent_id = ${escapeForCozo(agentId)}

    :order -created_at
    :limit ${limit}
  `)

  return result.rows.map((row: unknown[]) => ({
    memory_id: row[0] as string,
    category: row[1] as MemoryCategory,
    tier: row[2] as MemoryTier,
    content: row[3] as string,
    confidence: row[4] as number,
    created_at: row[5] as number,
    reinforcement_count: row[6] as number
  }))
}

/**
 * Get most reinforced memories (most important)
 */
export async function getMostReinforcedMemories(
  agentDb: AgentDatabase,
  agentId: string,
  limit: number = 20
): Promise<Array<{
  memory_id: string
  category: MemoryCategory
  content: string
  reinforcement_count: number
  access_count: number
}>> {
  const result = await agentDb.run(`
    ?[memory_id, category, content, reinforcement_count, access_count] :=
      *memories{memory_id, agent_id, category, content, reinforcement_count, access_count},
      agent_id = ${escapeForCozo(agentId)}

    :order -reinforcement_count, -access_count
    :limit ${limit}
  `)

  return result.rows.map((row: unknown[]) => ({
    memory_id: row[0] as string,
    category: row[1] as MemoryCategory,
    content: row[2] as string,
    reinforcement_count: row[3] as number,
    access_count: row[4] as number
  }))
}

/**
 * Build context from memories for LLM prompt
 */
export async function buildMemoryContext(
  agentDb: AgentDatabase,
  agentId: string,
  query: string,
  options: {
    maxTokens?: number
    includeCategories?: MemoryCategory[]
  } = {}
): Promise<string> {
  const maxTokens = options.maxTokens || 2000
  const categories = options.includeCategories || ['fact', 'preference', 'pattern', 'insight']

  // Get relevant memories for the query
  const queryResults = await searchMemories(agentDb, agentId, query, {
    limit: 10,
    categories,
    minConfidence: 0.6
  })

  // Get top preferences and patterns
  const preferences = await getPreferences(agentDb, agentId, 5)
  const patterns = await getPatterns(agentDb, agentId, 5)

  // Build context string
  const sections: string[] = []

  if (queryResults.length > 0) {
    sections.push('## Relevant Memories')
    for (const mem of queryResults) {
      sections.push(`- [${mem.category}] ${mem.content}`)
      if (mem.context) {
        sections.push(`  Context: ${mem.context}`)
      }
    }
  }

  if (preferences.length > 0) {
    sections.push('\n## User Preferences')
    for (const pref of preferences) {
      sections.push(`- ${pref.content}`)
    }
  }

  if (patterns.length > 0) {
    sections.push('\n## Known Patterns')
    for (const pattern of patterns) {
      sections.push(`- ${pattern.content}`)
    }
  }

  let context = sections.join('\n')

  // Rough token estimate (4 chars per token)
  const estimatedTokens = context.length / 4
  if (estimatedTokens > maxTokens) {
    // Truncate to approximate token limit
    const maxChars = maxTokens * 4
    context = context.substring(0, maxChars) + '\n... [truncated]'
  }

  return context
}

/**
 * Get a single memory by ID
 */
export async function getMemoryById(
  agentDb: AgentDatabase,
  memoryId: string
): Promise<{
  memory_id: string
  agent_id: string
  tier: MemoryTier
  system: 1 | 2
  category: MemoryCategory
  content: string
  context: string | null
  confidence: number
  reinforcement_count: number
  access_count: number
  created_at: number
  related?: Array<{
    memory_id: string
    relationship: string
    content: string
    distance: number
  }>
} | null> {
  const result = await agentDb.run(`
    ?[memory_id, agent_id, tier, system, category, content, context,
      confidence, reinforcement_count, access_count, created_at] :=
      *memories{memory_id, agent_id, tier, system, category, content, context,
        confidence, reinforcement_count, access_count, created_at},
      memory_id = ${escapeForCozo(memoryId)}
  `)

  if (result.rows.length === 0) {
    return null
  }

  const row = result.rows[0]
  const related = await getRelatedMemories(agentDb, memoryId, 2)

  return {
    memory_id: row[0] as string,
    agent_id: row[1] as string,
    tier: row[2] as MemoryTier,
    system: row[3] as 1 | 2,
    category: row[4] as MemoryCategory,
    content: row[5] as string,
    context: row[6] as string | null,
    confidence: row[7] as number,
    reinforcement_count: row[8] as number,
    access_count: row[9] as number,
    created_at: row[10] as number,
    related: related.length > 0 ? related : undefined
  }
}
