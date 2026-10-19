/**
 * GET /api/agents/:id/board — everything on one agent's board on this host:
 * its own cards plus the cards of its teams that are assigned to it.
 */

import { NextRequest } from 'next/server'
import { getAgentBoard } from '@/services/agent-tasks-service'
import { toResponse } from '@/app/api/_helpers'

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return toResponse(getAgentBoard(id))
}
