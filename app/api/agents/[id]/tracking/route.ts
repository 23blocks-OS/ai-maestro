import { NextRequest } from 'next/server'
import { getTracking, initializeTracking } from '@/services/agents-memory-service'
import { toResponse } from '@/app/api/_helpers'

/**
 * GET /api/agents/:id/tracking
 * Get agent's complete tracking data (sessions, projects, conversations)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: agentId } = await params
  const result = await getTracking(agentId)
  return toResponse(result)
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
  const body = await request.json().catch(() => ({}))

  const result = await initializeTracking(agentId, {
    addSampleData: body.addSampleData,
  })

  return toResponse(result)
}
