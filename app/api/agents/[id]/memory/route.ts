import { NextRequest } from 'next/server'
import { getMemory, initializeMemory } from '@/services/agents-memory-service'
import { toResponse } from '@/app/api/_helpers'

/**
 * GET /api/agents/:id/memory
 * Get agent's memory (sessions and projects)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: agentId } = await params
  const result = await getMemory(agentId)
  return toResponse(result)
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
  const body = await request.json().catch(() => ({}))

  const result = await initializeMemory(agentId, {
    populateFromSessions: body.populateFromSessions,
    force: body.force,
  })

  return toResponse(result)
}
