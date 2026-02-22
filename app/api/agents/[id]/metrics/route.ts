import { NextRequest, NextResponse } from 'next/server'
import { getMetrics, updateMetrics } from '@/services/agents-memory-service'
import { isValidUuid } from '@/lib/validation'

/**
 * GET /api/agents/[id]/metrics
 * Get agent metrics
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: agentId } = await params
  // SF-009: Validate UUID format for agent ID (defense-in-depth)
  if (!isValidUuid(agentId)) {
    return NextResponse.json({ error: 'Invalid agent ID format' }, { status: 400 })
  }
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
  // SF-009: Validate UUID format for agent ID (defense-in-depth)
  if (!isValidUuid(agentId)) {
    return NextResponse.json({ error: 'Invalid agent ID format' }, { status: 400 })
  }
  let body
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const result = await updateMetrics(agentId, body)

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data)
}
