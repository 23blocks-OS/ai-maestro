import { NextRequest, NextResponse } from 'next/server'
import { searchConversations, ingestConversations } from '@/services/agents-memory-service'
import { isValidUuid } from '@/lib/validation'

// Allowed role values for runtime validation
const VALID_ROLES: readonly string[] = ['user', 'assistant', 'system']

// NT-002 fix: Reusable helpers to parse query params with NaN safety
function parseIntParam(searchParams: URLSearchParams, key: string): number | undefined {
  const raw = searchParams.get(key)
  if (!raw) return undefined
  const parsed = parseInt(raw, 10)
  return Number.isNaN(parsed) ? undefined : parsed
}

function parseFloatParam(searchParams: URLSearchParams, key: string): number | undefined {
  const raw = searchParams.get(key)
  if (!raw) return undefined
  const parsed = parseFloat(raw)
  return Number.isNaN(parsed) ? undefined : parsed
}

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
    if (!isValidUuid(agentId)) {
      return NextResponse.json({ error: 'Invalid agent ID format' }, { status: 400 })
    }
    const searchParams = request.nextUrl.searchParams

    // Validate roleFilter against allowed values before casting
    const roleParam = searchParams.get('role')
    if (roleParam && !VALID_ROLES.includes(roleParam)) {
      return NextResponse.json({ error: `Invalid role parameter. Allowed: ${VALID_ROLES.join(', ')}` }, { status: 400 })
    }

    // NT-002 fix: Store param values in local variables instead of repeated get() calls
    const result = await searchConversations(agentId, {
      query: searchParams.get('q') || '',
      mode: searchParams.get('mode') || undefined,
      limit: parseIntParam(searchParams, 'limit'),
      minScore: parseFloatParam(searchParams, 'minScore'),
      roleFilter: roleParam as 'user' | 'assistant' | 'system' | null,
      conversationFile: searchParams.get('conversation_file') || undefined,
      startTs: parseIntParam(searchParams, 'startTs'),
      endTs: parseIntParam(searchParams, 'endTs'),
      useRrf: searchParams.get('useRrf') !== 'false',
      bm25Weight: parseFloatParam(searchParams, 'bm25Weight'),
      semanticWeight: parseFloatParam(searchParams, 'semanticWeight'),
    })

    if (result.error) {
      return NextResponse.json({ success: false, error: result.error }, { status: result.status })
    }
    return NextResponse.json(result.data)
  } catch (error) {
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
    console.error('[Search POST] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
