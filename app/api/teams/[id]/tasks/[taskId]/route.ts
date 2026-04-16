import { NextRequest } from 'next/server'
import { updateTeamTask, deleteTeamTask } from '@/services/teams-service'
import { toResponse } from '@/app/api/_helpers'

// PUT /api/teams/[id]/tasks/[taskId] - Update a task
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> }
) {
  const { id, taskId } = await params
  const body = await request.json()
  const result = updateTeamTask(id, taskId, body)
  return toResponse(result)
}

// DELETE /api/teams/[id]/tasks/[taskId] - Delete a task
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> }
) {
  const { id, taskId } = await params
  const result = deleteTeamTask(id, taskId)
  return toResponse(result)
}
