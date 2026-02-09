import { NextRequest, NextResponse } from 'next/server'
import { getDocument, updateDocument, deleteDocument } from '@/lib/document-registry'
import { getTeam } from '@/lib/team-registry'

// GET /api/teams/[id]/documents/[docId] - Get a single document
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  const { id, docId } = await params
  const team = getTeam(id)
  if (!team) {
    return NextResponse.json({ error: 'Team not found' }, { status: 404 })
  }
  const document = getDocument(id, docId)
  if (!document) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }
  return NextResponse.json({ document })
}

// PUT /api/teams/[id]/documents/[docId] - Update a document
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  try {
    const { id, docId } = await params
    const body = await request.json()
    const updates: Record<string, unknown> = {}
    if (body.title !== undefined) updates.title = body.title
    if (body.content !== undefined) updates.content = body.content
    if (body.pinned !== undefined) updates.pinned = body.pinned
    if (body.tags !== undefined) updates.tags = body.tags

    const document = updateDocument(id, docId, updates as any)
    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    return NextResponse.json({ document })
  } catch (error) {
    console.error('Failed to update document:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update document' },
      { status: 500 }
    )
  }
}

// DELETE /api/teams/[id]/documents/[docId] - Delete a document
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  const { id, docId } = await params
  const deleted = deleteDocument(id, docId)
  if (!deleted) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }
  return NextResponse.json({ success: true })
}
