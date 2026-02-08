import { NextRequest, NextResponse } from 'next/server'
import { runIndexDelta } from '@/lib/index-delta'

/**
 * POST /api/agents/:id/index-delta
 * Index new messages (delta) for all conversations of an agent
 *
 * Thin wrapper around runIndexDelta() — the core logic lives in lib/index-delta.ts
 * so it can be called directly by the subconscious without HTTP overhead.
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

  const dryRun = searchParams.get('dryRun') === 'true'
  const batchSize = parseInt(searchParams.get('batchSize') || '10')

  const result = await runIndexDelta(agentId, { dryRun, batchSize })

  return NextResponse.json(result, {
    status: result.success ? 200 : 500
  })
}
