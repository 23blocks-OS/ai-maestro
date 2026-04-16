import { NextRequest } from 'next/server'
import { listTeamDocuments, createTeamDocument } from '@/services/teams-service'
import { toResponse } from '@/app/api/_helpers'

// GET /api/teams/[id]/documents - List all documents for a team
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const result = listTeamDocuments(id)
  return toResponse(result)
}

// POST /api/teams/[id]/documents - Create a new document
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json()
  const result = createTeamDocument(id, body)
  return toResponse(result)
}
