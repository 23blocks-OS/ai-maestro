/**
 * POST /api/agents/:id/task-instruction — the assignee's host takes an instruction that another host
 * (the one that stores a project) is forwarding: the text is typed into this agent's session.
 * 404 when this host does not know the agent, so the sender can try the next host.
 */

import { NextRequest } from 'next/server'
import { receiveInstruction } from '@/services/agent-tasks-service'
import { toResponse } from '@/app/api/_helpers'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await request.json().catch(() => ({}))
  return toResponse(await receiveInstruction(id, body))
}
