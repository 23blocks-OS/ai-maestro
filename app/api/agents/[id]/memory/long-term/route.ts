import { NextRequest, NextResponse } from 'next/server'
import { agentRegistry } from '@/lib/agent'
import {
  searchMemories,
  getMemoriesByType,
  getFacts,
  getPreferences,
  getPatterns,
  getDecisions,
  getInsights,
  getStats,
  getRecentMemories,
  getMostReinforcedMemories,
  buildMemoryContext,
  getMemoryById
} from '@/lib/memory/search'
import { MemoryCategory } from '@/lib/cozo-schema-memory'
import { escapeForCozo } from '@/lib/cozo-utils'
import { embedTexts } from '@/lib/rag/embeddings'

/**
 * GET /api/agents/:id/memory/long-term
 * Query long-term memories with various filters
 *
 * Query parameters:
 * - query: Semantic search query (optional)
 * - category: Filter by category (fact, decision, preference, pattern, insight, reasoning)
 * - limit: Max results (default: 20)
 * - includeRelated: Include related memories (default: false)
 * - minConfidence: Minimum confidence threshold (default: 0)
 * - tier: Filter by tier (warm, long)
 * - view: Special views (stats, recent, reinforced, context)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: agentId } = await params
    const searchParams = request.nextUrl.searchParams

    const query = searchParams.get('query')
    const category = searchParams.get('category') as MemoryCategory | null
    const limit = parseInt(searchParams.get('limit') || '20')
    const includeRelated = searchParams.get('includeRelated') === 'true'
    const minConfidence = parseFloat(searchParams.get('minConfidence') || '0')
    const tier = searchParams.get('tier') as 'warm' | 'long' | null
    const view = searchParams.get('view')
    const memoryId = searchParams.get('id')

    // Get agent
    const agent = await agentRegistry.getAgent(agentId)
    const agentDb = await agent.getDatabase()

    // Handle special views
    if (view === 'stats') {
      const stats = await getStats(agentDb, agentId)
      return NextResponse.json({
        success: true,
        agent_id: agentId,
        stats
      })
    }

    if (view === 'recent') {
      const memories = await getRecentMemories(agentDb, agentId, limit)
      return NextResponse.json({
        success: true,
        agent_id: agentId,
        memories,
        count: memories.length
      })
    }

    if (view === 'reinforced') {
      const memories = await getMostReinforcedMemories(agentDb, agentId, limit)
      return NextResponse.json({
        success: true,
        agent_id: agentId,
        memories,
        count: memories.length
      })
    }

    // Graph view: return memories with their links
    if (view === 'graph') {
      // Get memories
      const memoriesResult = await agentDb.run(`
        ?[memory_id, category, tier, content, confidence, reinforcement_count] :=
          *memories{memory_id, agent_id, category, tier, content, confidence, reinforcement_count},
          agent_id = ${escapeForCozo(agentId)}
        :limit ${limit}
      `)

      // Get links between memories
      const linksResult = await agentDb.run(`
        ?[from_memory_id, to_memory_id, relationship] :=
          *memory_links{from_memory_id, to_memory_id, relationship},
          *memories{memory_id: from_memory_id, agent_id},
          agent_id = ${escapeForCozo(agentId)}
      `)

      const nodes = memoriesResult.rows.map((row: unknown[]) => ({
        id: row[0] as string,
        category: row[1] as string,
        tier: row[2] as string,
        content: row[3] as string,
        confidence: row[4] as number,
        reinforcement_count: row[5] as number
      }))

      const links = linksResult.rows.map((row: unknown[]) => ({
        source: row[0] as string,
        target: row[1] as string,
        relationship: row[2] as string
      }))

      return NextResponse.json({
        success: true,
        agent_id: agentId,
        graph: { nodes, links },
        count: nodes.length
      })
    }

    if (view === 'context' && query) {
      const context = await buildMemoryContext(agentDb, agentId, query, {
        maxTokens: parseInt(searchParams.get('maxTokens') || '2000'),
        includeCategories: category ? [category] : undefined
      })
      return NextResponse.json({
        success: true,
        agent_id: agentId,
        context,
        query
      })
    }

    // Get specific memory by ID
    if (memoryId) {
      const memory = await getMemoryById(agentDb, memoryId)
      if (!memory) {
        return NextResponse.json(
          { success: false, error: 'Memory not found' },
          { status: 404 }
        )
      }
      return NextResponse.json({
        success: true,
        agent_id: agentId,
        memory
      })
    }

    // Handle category-specific queries
    if (category && !query) {
      let memories
      switch (category) {
        case 'fact':
          memories = await getFacts(agentDb, agentId, limit)
          break
        case 'preference':
          memories = await getPreferences(agentDb, agentId, limit)
          break
        case 'pattern':
          memories = await getPatterns(agentDb, agentId, limit)
          break
        case 'decision':
          memories = await getDecisions(agentDb, agentId, limit)
          break
        case 'insight':
          memories = await getInsights(agentDb, agentId, limit)
          break
        default:
          memories = await getMemoriesByType(agentDb, agentId, category, {
            limit,
            includeRelated
          })
      }
      return NextResponse.json({
        success: true,
        agent_id: agentId,
        category,
        memories,
        count: memories.length
      })
    }

    // Semantic search if query provided
    if (query) {
      const memories = await searchMemories(agentDb, agentId, query, {
        limit,
        includeRelated,
        categories: category ? [category] : undefined,
        minConfidence,
        tier: tier || undefined
      })
      return NextResponse.json({
        success: true,
        agent_id: agentId,
        query,
        memories,
        count: memories.length
      })
    }

    // Default: return recent memories
    const memories = await getRecentMemories(agentDb, agentId, limit)
    return NextResponse.json({
      success: true,
      agent_id: agentId,
      memories,
      count: memories.length
    })
  } catch (error) {
    console.error('[Long-Term Memory API] GET Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/agents/:id/memory/long-term
 * Delete a specific memory by ID
 *
 * Query parameters:
 * - id: Memory ID to delete (required)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: agentId } = await params
    const searchParams = request.nextUrl.searchParams
    const memoryId = searchParams.get('id')

    if (!memoryId) {
      return NextResponse.json(
        { success: false, error: 'Memory ID is required' },
        { status: 400 }
      )
    }

    const agent = await agentRegistry.getAgent(agentId)
    const agentDb = await agent.getDatabase()

    // Verify memory exists and belongs to this agent
    const memory = await getMemoryById(agentDb, memoryId)
    if (!memory) {
      return NextResponse.json(
        { success: false, error: 'Memory not found' },
        { status: 404 }
      )
    }

    if (memory.agent_id !== agentId) {
      return NextResponse.json(
        { success: false, error: 'Memory does not belong to this agent' },
        { status: 403 }
      )
    }

    // Delete memory and its embedding
    await agentDb.run(`
      ?[memory_id] <- [['${memoryId}']]
      :delete memories
    `)

    await agentDb.run(`
      ?[memory_id] <- [['${memoryId}']]
      :delete memory_vec
    `)

    // Delete any links to/from this memory
    await agentDb.run(`
      ?[from_memory_id, to_memory_id] :=
        *memory_links{from_memory_id, to_memory_id},
        from_memory_id = '${memoryId}'

      :delete memory_links
    `)

    await agentDb.run(`
      ?[from_memory_id, to_memory_id] :=
        *memory_links{from_memory_id, to_memory_id},
        to_memory_id = '${memoryId}'

      :delete memory_links
    `)

    console.log(`[Long-Term Memory API] Deleted memory: ${memoryId}`)

    return NextResponse.json({
      success: true,
      deleted: memoryId
    })
  } catch (error) {
    console.error('[Long-Term Memory API] DELETE Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/agents/:id/memory/long-term
 * Update a memory's content or category
 *
 * Body:
 * - id: Memory ID (required)
 * - content: New content (optional)
 * - category: New category (optional)
 * - context: New context (optional)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: agentId } = await params
    const body = await request.json()
    const { id: memoryId, content, category, context } = body

    if (!memoryId) {
      return NextResponse.json(
        { success: false, error: 'Memory ID is required' },
        { status: 400 }
      )
    }

    if (!content && !category && context === undefined) {
      return NextResponse.json(
        { success: false, error: 'At least one field (content, category, context) must be provided' },
        { status: 400 }
      )
    }

    const agent = await agentRegistry.getAgent(agentId)
    const agentDb = await agent.getDatabase()

    // Verify memory exists and belongs to this agent
    const memory = await getMemoryById(agentDb, memoryId)
    if (!memory) {
      return NextResponse.json(
        { success: false, error: 'Memory not found' },
        { status: 404 }
      )
    }

    if (memory.agent_id !== agentId) {
      return NextResponse.json(
        { success: false, error: 'Memory does not belong to this agent' },
        { status: 403 }
      )
    }

    // Build update fields
    const newContent = content || memory.content
    const newCategory = category || memory.category
    const newContext = context !== undefined ? context : memory.context

    // Update memory record
    await agentDb.run(`
      ?[memory_id, agent_id, tier, system, category, content, context, source_conversations,
        source_message_ids, confidence, created_at, last_reinforced_at, reinforcement_count,
        access_count, last_accessed_at, promoted_at] :=
        *memories{memory_id, agent_id, tier, system, category: _, content: _, context: _,
          source_conversations, source_message_ids, confidence, created_at, last_reinforced_at,
          reinforcement_count, access_count, last_accessed_at, promoted_at},
        memory_id = ${escapeForCozo(memoryId)},
        category = ${escapeForCozo(newCategory)},
        content = ${escapeForCozo(newContent)},
        context = ${newContext ? escapeForCozo(newContext) : 'null'}

      :put memories {
        memory_id, agent_id, tier, system, category, content, context, source_conversations,
        source_message_ids, confidence, created_at, last_reinforced_at, reinforcement_count,
        access_count, last_accessed_at, promoted_at
      }
    `)

    // If content changed, update the embedding
    if (content && content !== memory.content) {
      const embeddings = await embedTexts([content])
      const embeddingArray = Array.from(embeddings[0])

      await agentDb.run(`
        ?[memory_id, vec] <- [[${escapeForCozo(memoryId)}, vec(${JSON.stringify(embeddingArray)})]]
        :put memory_vec { memory_id, vec }
      `)
    }

    console.log(`[Long-Term Memory API] Updated memory: ${memoryId}`)

    // Return the updated memory
    const updatedMemory = await getMemoryById(agentDb, memoryId)

    return NextResponse.json({
      success: true,
      memory: updatedMemory
    })
  } catch (error) {
    console.error('[Long-Term Memory API] PATCH Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
