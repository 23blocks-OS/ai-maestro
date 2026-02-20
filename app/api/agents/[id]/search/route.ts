import { NextRequest, NextResponse } from 'next/server'
import { searchConversations, ingestConversations } from '@/services/agents-memory-service'

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
  const { id: agentId } = await params
  const searchParams = request.nextUrl.searchParams

  const result = await searchConversations(agentId, {
    query: searchParams.get('q') || '',
    mode: searchParams.get('mode') || undefined,
    limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : undefined,
    minScore: searchParams.get('minScore') ? parseFloat(searchParams.get('minScore')!) : undefined,
    roleFilter: searchParams.get('role') as 'user' | 'assistant' | 'system' | null,
    conversationFile: searchParams.get('conversation_file') || undefined,
    startTs: searchParams.get('startTs') ? parseInt(searchParams.get('startTs')!) : undefined,
    endTs: searchParams.get('endTs') ? parseInt(searchParams.get('endTs')!) : undefined,
    useRrf: searchParams.get('useRrf') !== 'false',
    bm25Weight: searchParams.get('bm25Weight') ? parseFloat(searchParams.get('bm25Weight')!) : undefined,
    semanticWeight: searchParams.get('semanticWeight') ? parseFloat(searchParams.get('semanticWeight')!) : undefined,
  })

  if (result.error) {
    return NextResponse.json({ success: false, error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data)
}

/**
 * POST /api/agents/:id/search
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
  const { id: agentId } = await params
  const body = await request.json()

  const result = await ingestConversations(agentId, {
    conversationFiles: body.conversationFiles,
    batchSize: body.batchSize,
  })

  if (result.error) {
    return NextResponse.json({ success: false, error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data)
}
