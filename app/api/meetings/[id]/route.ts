import { NextRequest } from 'next/server'
import { getMeetingById, updateExistingMeeting, deleteExistingMeeting } from '@/services/messages-service'
import { toResponse } from '@/app/api/_helpers'

// GET /api/meetings/[id] - Get a single meeting
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const result = getMeetingById(id)
  return toResponse(result)
}

// PATCH /api/meetings/[id] - Update a meeting
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json()
  const result = updateExistingMeeting(id, body)
  return toResponse(result)
}

// DELETE /api/meetings/[id] - Delete a meeting
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const result = deleteExistingMeeting(id)
  return toResponse(result)
}
