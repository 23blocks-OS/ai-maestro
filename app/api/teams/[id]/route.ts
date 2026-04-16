import { NextRequest } from 'next/server'
import { getTeamById, updateTeamById, deleteTeamById } from '@/services/teams-service'
import { toResponse } from '@/app/api/_helpers'

// GET /api/teams/[id] - Get a single team
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const result = getTeamById(id)
  return toResponse(result)
}

// PUT /api/teams/[id] - Update a team
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json()
  const result = updateTeamById(id, body)
  return toResponse(result)
}

// DELETE /api/teams/[id] - Delete a team
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const result = deleteTeamById(id)
  return toResponse(result)
}
