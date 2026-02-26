import { NextRequest, NextResponse } from 'next/server'
import { searchConversations, ingestConversations } from '@/services/agents-memory-service'
import { isValidUuid } from '@/lib/validation'

// SF-022: Allowed role values for runtime validation
const VALID_ROLES: readonly string[] = ['user', 'assistant', 'system']

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
    // SF-009: Validate UUID format for agent ID (defense-in-depth)
    if (!isValidUuid(agentId)) {
      return NextResponse.json({ error: 'Invalid agent ID format' }, { status: 400 })
    }
    const searchParams = request.nextUrl.searchParams

    // SF-022: Validate roleFilter against allowed values before casting
    const roleParam = searchParams.get('role')
    if (roleParam && !VALID_ROLES.includes(roleParam)) {
      return NextResponse.json({ error: `Invalid role parameter. Allowed: ${VALID_ROLES.join(', ')}` }, { status: 400 })
    }

    const result = await searchConversations(agentId, {
      query: searchParams.get('q') || '',
      mode: searchParams.get('mode') || undefined,
      // SF-017 fix: Use NaN-check instead of || undefined to preserve valid zero values
      limit: searchParams.get('limit') ? (Number.isNaN(parseInt(searchParams.get('limit')!, 10)) ? undefined : parseInt(searchParams.get('limit')!, 10)) : undefined,
      // SF-016 fix: Use NaN-check instead of || undefined to preserve valid zero for minScore
      minScore: searchParams.get('minScore') ? (Number.isNaN(parseFloat(searchParams.get('minScore')!)) ? undefined : parseFloat(searchParams.get('minScore')!)) : undefined,
      roleFilter: roleParam as 'user' | 'assistant' | 'system' | null,
      conversationFile: searchParams.get('conversation_file') || undefined,
      // SF-017 fix: Use NaN-check instead of || undefined to preserve valid zero for timestamps
      startTs: searchParams.get('startTs') ? (Number.isNaN(parseInt(searchParams.get('startTs')!, 10)) ? undefined : parseInt(searchParams.get('startTs')!, 10)) : undefined,
      endTs: searchParams.get('endTs') ? (Number.isNaN(parseInt(searchParams.get('endTs')!, 10)) ? undefined : parseInt(searchParams.get('endTs')!, 10)) : undefined,
      useRrf: searchParams.get('useRrf') !== 'false',
      // SF-050: NaN guard for bm25Weight (defense-in-depth)
      bm25Weight: searchParams.get('bm25Weight') ? (Number.isNaN(parseFloat(searchParams.get('bm25Weight')!)) ? undefined : parseFloat(searchParams.get('bm25Weight')!)) : undefined,
      // SF-050: NaN guard for semanticWeight (defense-in-depth)
      semanticWeight: searchParams.get('semanticWeight') ? (Number.isNaN(parseFloat(searchParams.get('semanticWeight')!)) ? undefined : parseFloat(searchParams.get('semanticWeight')!)) : undefined,
    })

    if (result.error) {
      return NextResponse.json({ success: false, error: result.error }, { status: result.status })
    }
    return NextResponse.json(result.data)
  } catch (error) {
    // MF-003: Outer try-catch for unhandled service throws
    console.error('[Search GET] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
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
  try {
    const { id: agentId } = await params
    // SF-009: Validate UUID format for agent ID (defense-in-depth)
    if (!isValidUuid(agentId)) {
      return NextResponse.json({ error: 'Invalid agent ID format' }, { status: 400 })
    }
    let body
    try { body = await request.json() } catch {
      return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
    }

    const result = await ingestConversations(agentId, {
      conversationFiles: body.conversationFiles,
      batchSize: body.batchSize,
    })

    if (result.error) {
      return NextResponse.json({ success: false, error: result.error }, { status: result.status })
    }
    return NextResponse.json(result.data)
  } catch (error) {
    // MF-003: Outer try-catch for unhandled service throws
    console.error('[Search POST] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
