/**
 * POST /api/agents/:id/tasks/:taskId/comments — comment on a card.
 * An operator comment (author.kind "operator") is also handed to the assignee's session unless deliver is false.
 * Anything else is stored and shown, never injected.
 */

import { NextRequest } from 'next/server'
import { addAgentTaskComment } from '@/services/agent-tasks-service'
import { toResponse } from '@/app/api/_helpers'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; taskId: string }> }) {
  const { id, taskId } = await params
  const body = await request.json().catch(() => ({}))
  return toResponse(await addAgentTaskComment(id, taskId, body))
}
