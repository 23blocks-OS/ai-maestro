import { NextRequest, NextResponse } from 'next/server'
import { runDeltaIndex, getDeltaIndexStatus } from '@/services/agents-memory-service'

/**
 * POST /api/agents/:id/index-delta
 * Index new messages (delta) for all conversations of an agent
 *
 * Query parameters:
 * - dryRun: If true, only report what would be indexed (default: false)
 * - batchSize: Batch size for processing (default: 10)
 * - waitSeconds: how long to wait for the run before answering 202 (default 60, max 600).
 *   A run that outlasts it carries on in the background; GET shows its state.
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
    waitSeconds: searchParams.get('waitSeconds') ? Number(searchParams.get('waitSeconds')) : undefined,
  })

  return NextResponse.json(result.data, { status: result.status })
}

/** GET /api/agents/:id/index-delta: state of the current or last run */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: agentId } = await params
  const result = await getDeltaIndexStatus(agentId)
  return NextResponse.json(result.data, { status: result.status })
}
