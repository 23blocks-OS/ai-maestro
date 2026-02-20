import { NextRequest, NextResponse } from 'next/server'
import { runDeltaIndex } from '@/services/agents-memory-service'

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
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: agentId } = await params
  const searchParams = request.nextUrl.searchParams

  const result = await runDeltaIndex(agentId, {
    dryRun: searchParams.get('dryRun') === 'true',
    batchSize: searchParams.get('batchSize')
      ? parseInt(searchParams.get('batchSize')!)
      : undefined,
  })

  return NextResponse.json(result.data, { status: result.status })
}
