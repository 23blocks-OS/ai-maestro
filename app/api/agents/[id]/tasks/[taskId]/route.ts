/**
 * PATCH  /api/agents/:id/tasks/:taskId — change a card (PUT works too)
 * DELETE /api/agents/:id/tasks/:taskId — remove a card
 */

import { NextRequest } from 'next/server'
import { updateAgentTask, deleteAgentTask } from '@/services/agent-tasks-service'
import { toResponse } from '@/app/api/_helpers'

type Ctx = { params: Promise<{ id: string; taskId: string }> }

export async function PATCH(request: NextRequest, { params }: Ctx) {
  const { id, taskId } = await params
  const body = await request.json().catch(() => ({}))
  return toResponse(updateAgentTask(id, taskId, body))
}

export async function PUT(request: NextRequest, { params }: Ctx) {
  const { id, taskId } = await params
  const body = await request.json().catch(() => ({}))
  return toResponse(updateAgentTask(id, taskId, body))
}

export async function DELETE(_request: NextRequest, { params }: Ctx) {
  const { id, taskId } = await params
  return toResponse(deleteAgentTask(id, taskId))
}
