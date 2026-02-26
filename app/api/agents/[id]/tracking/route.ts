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
  try {
    const { id: agentId } = await params
    if (!isValidUuid(agentId)) {
      return NextResponse.json({ error: 'Invalid agent ID format' }, { status: 400 })
    }
    const result = await getTracking(agentId)

    if (result.error) {
      return NextResponse.json({ success: false, error: result.error }, { status: result.status })
    }
    return NextResponse.json(result.data)
  } catch (error) {
    console.error('[Tracking GET] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/agents/:id/tracking
 * Initialize tracking schema and optionally add sample data
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
    // NT-004 fix: Use explicit try/catch instead of silently swallowing JSON parse errors
    let body: Record<string, unknown>
    try { body = await request.json() } catch {
      body = {}
    }

    const result = await initializeTracking(agentId, {
      addSampleData: body.addSampleData,
    })

    if (result.error) {
      return NextResponse.json({ success: false, error: result.error }, { status: result.status })
    }
    return NextResponse.json(result.data)
  } catch (error) {
    console.error('[Tracking POST] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
