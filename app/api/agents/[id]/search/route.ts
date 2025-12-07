import { NextRequest, NextResponse } from 'next/server'
import { agentRegistry } from '@/lib/agent'
import { hybridSearch, semanticSearch, searchByTerm, searchBySymbol } from '@/lib/rag/search'

/**
 * GET /api/agents/:id/search
 * Search agent's conversation history using hybrid RAG search
 *
 * Query parameters:
 * - q: Search query (required)
 * - mode: Search mode (hybrid | semantic | term | symbol) (default: hybrid)
 * - limit: Max results (default: 10)
 * - minScore: Minimum score threshold (default: 0.0)
 * - role: Filter by role (user | assistant | system)
 * - conversation_file: Filter by specific conversation file path
 * - startTs: Filter by start timestamp (unix ms)
 * - endTs: Filter by end timestamp (unix ms)
 * - useRrf: Use Reciprocal Rank Fusion (true | false) (default: true)
 * - bm25Weight: Weight for BM25 results (0-1) (default: 0.4)
 * - semanticWeight: Weight for semantic results (0-1) (default: 0.6)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: agentId } = await params
    const searchParams = request.nextUrl.searchParams

    // Get query parameter
    const query = searchParams.get('q')
    if (!query) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required parameter: q (query)'
        },
        { status: 400 }
      )
    }

    // Get search mode
    const mode = searchParams.get('mode') || 'hybrid'
    if (!['hybrid', 'semantic', 'term', 'symbol'].includes(mode)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid mode. Must be: hybrid, semantic, term, or symbol'
        },
        { status: 400 }
      )
    }

    // Parse options
    const limit = parseInt(searchParams.get('limit') || '10')
    const minScore = parseFloat(searchParams.get('minScore') || '0.0')
    const roleFilter = searchParams.get('role') as 'user' | 'assistant' | 'system' | null
    const conversationFile = searchParams.get('conversation_file') || undefined
    const startTs = searchParams.get('startTs') ? parseInt(searchParams.get('startTs')!) : undefined
    const endTs = searchParams.get('endTs') ? parseInt(searchParams.get('endTs')!) : undefined
    const useRrf = searchParams.get('useRrf') !== 'false'
    const bm25Weight = parseFloat(searchParams.get('bm25Weight') || '0.4')
    const semanticWeight = parseFloat(searchParams.get('semanticWeight') || '0.6')

    console.log(`[Search API] Agent: ${agentId}, Query: "${query}", Mode: ${mode}`)

    // Trigger delta indexing before search (ensures fresh results)
    triggerBackgroundDeltaIndexing(agentId).catch((err) => {
      console.error('[Search API] Background delta indexing failed:', err)
    })

    // Get or create agent (will initialize with subconscious if first time)
    const agent = await agentRegistry.getAgent(agentId)
    const agentDb = await agent.getDatabase()

    // Perform search based on mode
    let results: Awaited<ReturnType<typeof hybridSearch>> = []

    if (mode === 'hybrid') {
      results = await hybridSearch(agentDb, query, {
        limit,
        minScore,
        useRrf,
        bm25Weight,
        semanticWeight,
        roleFilter: roleFilter || undefined,
        conversationFile: conversationFile || undefined,
        timeRange: startTs && endTs ? { start: startTs, end: endTs } : undefined
      })
    } else if (mode === 'semantic') {
      results = await semanticSearch(agentDb, query, limit, conversationFile)
    } else if (mode === 'term') {
      results = await searchByTerm(agentDb, query, limit, conversationFile)
    } else if (mode === 'symbol') {
      results = await searchBySymbol(agentDb, query, limit, conversationFile)
    }

    // NOTE: Don't close agentDb - it's owned by the agent and stays open

    return NextResponse.json({
      success: true,
      agent_id: agentId,
      query,
      mode,
      results,
      count: results.length
    })
  } catch (error) {
    console.error('[Search API] Error:', error)
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
 * POST /api/agents/:id/search/ingest
 * Manually trigger ingestion of conversation files for an agent
 *
 * Body:
 * - conversationFiles: Array of file paths to ingest
 * - batchSize: Batch size for processing (default: 10)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: agentId } = await params
    const body = await request.json()

    const { conversationFiles, batchSize = 10 } = body

    if (!conversationFiles || !Array.isArray(conversationFiles)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing or invalid conversationFiles array'
        },
        { status: 400 }
      )
    }

    console.log(`[Search API] Ingesting ${conversationFiles.length} conversations for agent ${agentId}`)

    // Get or create agent (will initialize with subconscious if first time)
    const agent = await agentRegistry.getAgent(agentId)
    const agentDb = await agent.getDatabase()

    // Import ingestion functions
    const { ingestAllConversations } = await import('@/lib/rag/ingest')

    // Perform ingestion
    const stats = await ingestAllConversations(agentDb, conversationFiles, {
      batchSize,
      onProgress: (fileIdx, totalFiles, currentStats) => {
        console.log(`[Search API] Progress: ${fileIdx}/${totalFiles} files (${currentStats.processedMessages} messages)`)
      }
    })

    // NOTE: Don't close agentDb - it's owned by the agent and stays open

    return NextResponse.json({
      success: true,
      agent_id: agentId,
      stats
    })
  } catch (error) {
    console.error('[Search API] Ingestion Error:', error)
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
 * Trigger delta indexing in the background (non-blocking)
 */
async function triggerBackgroundDeltaIndexing(agentId: string): Promise<void> {
  console.log(`[Search API] Triggering background delta indexing for agent ${agentId}`)

  try {
    const response = await fetch(`http://localhost:23000/api/agents/${agentId}/index-delta`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      console.error(`[Search API] Delta indexing returned status ${response.status}`)
      return
    }

    const result = await response.json()
    if (result.success && result.total_messages_processed > 0) {
      console.log(`[Search API] ✅ Delta indexed ${result.total_messages_processed} messages`)
    }
  } catch (error) {
    console.error('[Search API] Failed to trigger delta indexing:', error)
  }
}
