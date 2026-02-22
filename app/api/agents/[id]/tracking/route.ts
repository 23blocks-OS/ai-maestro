import { NextRequest, NextResponse } from 'next/server'
import { getTracking, initializeTracking } from '@/services/agents-memory-service'
import { isValidUuid } from '@/lib/validation'

/**
 * GET /api/agents/:id/tracking
 * Get agent's complete tracking data (sessions, projects, conversations)
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: agentId } = await params
  // SF-009: Validate UUID format for agent ID (defense-in-depth)
  if (!isValidUuid(agentId)) {
    return NextResponse.json({ error: 'Invalid agent ID format' }, { status: 400 })
  }
  const result = await getTracking(agentId)

  if (result.error) {
    return NextResponse.json({ success: false, error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data)
}

/**
 * POST /api/agents/:id/tracking
 * Initialize tracking schema and optionally add sample data
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: agentId } = await params
  // SF-009: Validate UUID format for agent ID (defense-in-depth)
  if (!isValidUuid(agentId)) {
    return NextResponse.json({ error: 'Invalid agent ID format' }, { status: 400 })
  }
  const body = await request.json().catch(() => ({}))

  const result = await initializeTracking(agentId, {
    addSampleData: body.addSampleData,
  })

  if (result.error) {
    return NextResponse.json({ success: false, error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data)
}
