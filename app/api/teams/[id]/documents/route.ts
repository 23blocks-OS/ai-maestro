import { NextRequest, NextResponse } from 'next/server'
import { listTeamDocuments, createTeamDocument } from '@/services/teams-service'

// GET /api/teams/[id]/documents - List all documents for a team
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const requestingAgentId = request.headers.get('X-Agent-Id') || undefined
  const result = listTeamDocuments(id, requestingAgentId)

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data)
}

// POST /api/teams/[id]/documents - Create a new document
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const requestingAgentId = request.headers.get('X-Agent-Id') || undefined

  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const result = createTeamDocument(id, { ...body, requestingAgentId })

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data, { status: result.status })
}
