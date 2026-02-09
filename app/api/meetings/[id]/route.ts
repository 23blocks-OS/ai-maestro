import { NextRequest, NextResponse } from 'next/server'
import { getMeeting, updateMeeting, deleteMeeting } from '@/lib/meeting-registry'

// GET /api/meetings/[id] - Get a single meeting
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const meeting = getMeeting(id)
  if (!meeting) {
    return NextResponse.json({ error: 'Meeting not found' }, { status: 404 })
  }
  return NextResponse.json({ meeting })
}

// PATCH /api/meetings/[id] - Update a meeting
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { name, agentIds, status, activeAgentId, sidebarMode, lastActiveAt, endedAt, teamId } = body

    const meeting = updateMeeting(id, {
      name, agentIds, status, activeAgentId, sidebarMode, lastActiveAt, endedAt, teamId,
    })
    if (!meeting) {
      return NextResponse.json({ error: 'Meeting not found' }, { status: 404 })
    }

    return NextResponse.json({ meeting })
  } catch (error) {
    console.error('Failed to update meeting:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update meeting' },
      { status: 500 }
    )
  }
}

// DELETE /api/meetings/[id] - Delete a meeting
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const deleted = deleteMeeting(id)
  if (!deleted) {
    return NextResponse.json({ error: 'Meeting not found' }, { status: 404 })
  }
  return NextResponse.json({ success: true })
}
