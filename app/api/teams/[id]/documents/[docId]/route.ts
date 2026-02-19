import { NextRequest, NextResponse } from 'next/server'
import { getDocument, updateDocument, deleteDocument } from '@/lib/document-registry'
import { getTeam } from '@/lib/team-registry'
import { isValidUuid } from '@/lib/validation'
import type { TeamDocument } from '@/types/document'

// GET /api/teams/[id]/documents/[docId] - Get a single document
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  const { id, docId } = await params
  // CC-002: Validate UUID format for both path parameters
  if (!isValidUuid(id) || !isValidUuid(docId)) {
    return NextResponse.json({ error: 'Invalid ID format' }, { status: 400 })
  }
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
    // CC-002: Validate UUID format for both path parameters
    if (!isValidUuid(id) || !isValidUuid(docId)) {
      return NextResponse.json({ error: 'Invalid ID format' }, { status: 400 })
    }
    // CC-005: Verify team exists before attempting update
    const team = getTeam(id)
    if (!team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 })
    }
    const body = await request.json()
    // CC-004: Properly typed updates object instead of `as any`
    const updates: Partial<Pick<TeamDocument, 'title' | 'content' | 'pinned' | 'tags'>> = {}
    if (body.title !== undefined) updates.title = body.title
    if (body.content !== undefined) updates.content = body.content
    if (body.pinned !== undefined) updates.pinned = body.pinned
    if (body.tags !== undefined) updates.tags = body.tags

    const document = await updateDocument(id, docId, updates)
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
  // CC-002: Validate UUID format for both path parameters
  if (!isValidUuid(id) || !isValidUuid(docId)) {
    return NextResponse.json({ error: 'Invalid ID format' }, { status: 400 })
  }
  // CC-006: Verify team exists before attempting deletion
  const team = getTeam(id)
  if (!team) {
    return NextResponse.json({ error: 'Team not found' }, { status: 404 })
  }
  const deleted = await deleteDocument(id, docId)
  if (!deleted) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }
  return NextResponse.json({ success: true })
}
