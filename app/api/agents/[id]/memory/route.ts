import { NextRequest, NextResponse } from 'next/server'
import { getMemory, initializeMemory } from '@/services/agents-memory-service'
import { isValidUuid } from '@/lib/validation'

/**
 * GET /api/agents/:id/memory
 * Get agent's memory (sessions and projects)
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
  const result = await getMemory(agentId)

  if (result.error) {
    return NextResponse.json({ success: false, error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data)
}

/**
 * POST /api/agents/:id/memory
 * Initialize schema and optionally populate from current tmux sessions
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

  const result = await initializeMemory(agentId, {
    populateFromSessions: body.populateFromSessions,
    force: body.force,
  })

  if (result.error) {
    return NextResponse.json({ success: false, error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data)
}
