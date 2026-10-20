/**
 * PATCH  /api/projects/:id/tasks/:taskId — change a card (PUT works too)
 * DELETE /api/projects/:id/tasks/:taskId — remove a card
 */

import { NextRequest } from 'next/server'
import { updateProjectTask, deleteProjectTask } from '@/services/projects-service'
import { toResponse } from '@/app/api/_helpers'

type Ctx = { params: Promise<{ id: string; taskId: string }> }

export async function PATCH(request: NextRequest, { params }: Ctx) {
  const { id, taskId } = await params
  const body = await request.json().catch(() => ({}))
  return toResponse(updateProjectTask(id, taskId, body))
}

export async function PUT(request: NextRequest, { params }: Ctx) {
  const { id, taskId } = await params
  const body = await request.json().catch(() => ({}))
  return toResponse(updateProjectTask(id, taskId, body))
}

export async function DELETE(_request: NextRequest, { params }: Ctx) {
  const { id, taskId } = await params
  return toResponse(deleteProjectTask(id, taskId))
}
