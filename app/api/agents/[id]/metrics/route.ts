import { NextRequest, NextResponse } from 'next/server'
import { getMetrics, updateMetrics } from '@/services/agents-memory-service'

/**
 * GET /api/agents/[id]/metrics
 * Get agent metrics
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: agentId } = await params
  const result = getMetrics(agentId)

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data)
}

/**
 * PATCH /api/agents/[id]/metrics
 * Update agent metrics (full update or increment)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: agentId } = await params
  const body = await request.json()

  const result = updateMetrics(agentId, body)

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data)
}
