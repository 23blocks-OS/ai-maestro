/**
 * GET  /api/agents/:id/tasks  — the agent's own cards (?status, ?waitingOn, ?quadrant=q1|q2|q3|q4|unplaced)
 * POST /api/agents/:id/tasks  — add a card to the agent's own board
 *
 * Thin wrapper — business logic in services/agent-tasks-service.ts
 */

import { NextRequest } from 'next/server'
import { listAgentTasks, createAgentTask } from '@/services/agent-tasks-service'
import { toResponse } from '@/app/api/_helpers'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const url = new URL(request.url)
  return toResponse(listAgentTasks(id, {
    status: url.searchParams.get('status') || undefined,
    waitingOn: url.searchParams.get('waitingOn') || undefined,
    quadrant: url.searchParams.get('quadrant') || undefined,
  }))
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await request.json().catch(() => ({}))
  return toResponse(createAgentTask(id, body))
}
