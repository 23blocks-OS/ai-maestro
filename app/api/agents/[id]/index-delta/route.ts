import { NextRequest, NextResponse } from 'next/server'
import { runDeltaIndex } from '@/services/agents-memory-service'
import { isValidUuid } from '@/lib/validation'

/**
 * POST /api/agents/:id/index-delta
 * Index new messages (delta) for all conversations of an agent
 *
 * Query parameters:
 * - dryRun: If true, only report what would be indexed (default: false)
 * - batchSize: Batch size for processing (default: 10)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id: agentId } = await params
    // SF-009: Validate UUID format for agent ID (defense-in-depth)
    if (!isValidUuid(agentId)) {
      return NextResponse.json({ error: 'Invalid agent ID format' }, { status: 400 })
    }
    const searchParams = request.nextUrl.searchParams

    const result = await runDeltaIndex(agentId, {
      dryRun: searchParams.get('dryRun') === 'true',
      batchSize: searchParams.get('batchSize')
        ? (parseInt(searchParams.get('batchSize')!, 10) || 10)
        : undefined,
    })

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json(result.data, { status: result.status })
  } catch (error) {
    // MF-003: Outer try-catch for unhandled service throws
    console.error('[Index Delta POST] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
