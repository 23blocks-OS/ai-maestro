import { NextRequest } from 'next/server'
import { getTeamDocument, updateTeamDocument, deleteTeamDocument } from '@/services/teams-service'
import { toResponse } from '@/app/api/_helpers'

// GET /api/teams/[id]/documents/[docId] - Get a single document
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  const { id, docId } = await params
  const result = getTeamDocument(id, docId)
  return toResponse(result)
}

// PUT /api/teams/[id]/documents/[docId] - Update a document
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  const { id, docId } = await params
  const body = await request.json()
  const result = updateTeamDocument(id, docId, body)
  return toResponse(result)
}

// DELETE /api/teams/[id]/documents/[docId] - Delete a document
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  const { id, docId } = await params
  const result = deleteTeamDocument(id, docId)
  return toResponse(result)
}
