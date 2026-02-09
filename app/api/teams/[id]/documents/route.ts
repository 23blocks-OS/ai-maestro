import { NextRequest, NextResponse } from 'next/server'
import { loadDocuments, createDocument } from '@/lib/document-registry'
import { getTeam } from '@/lib/team-registry'

// GET /api/teams/[id]/documents - List all documents for a team
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const team = getTeam(id)
  if (!team) {
    return NextResponse.json({ error: 'Team not found' }, { status: 404 })
  }
  const documents = loadDocuments(id)
  return NextResponse.json({ documents })
}

// POST /api/teams/[id]/documents - Create a new document
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const team = getTeam(id)
    if (!team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 })
    }

    const body = await request.json()
    const { title, content, pinned, tags } = body

    if (!title || typeof title !== 'string') {
      return NextResponse.json({ error: 'title is required' }, { status: 400 })
    }

    const document = createDocument({
      teamId: id,
      title,
      content: content || '',
      pinned,
      tags,
    })

    return NextResponse.json({ document }, { status: 201 })
  } catch (error) {
    console.error('Failed to create document:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create document' },
      { status: 500 }
    )
  }
}
