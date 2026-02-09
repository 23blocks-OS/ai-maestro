import { NextRequest, NextResponse } from 'next/server'
import { getTeam, updateTeam, deleteTeam } from '@/lib/team-registry'

// GET /api/teams/[id] - Get a single team
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const team = getTeam(id)
  if (!team) {
    return NextResponse.json({ error: 'Team not found' }, { status: 404 })
  }
  return NextResponse.json({ team })
}

// PUT /api/teams/[id] - Update a team
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { name, description, agentIds, lastMeetingAt, instructions, lastActivityAt } = body

    const team = updateTeam(id, { name, description, agentIds, lastMeetingAt, instructions, lastActivityAt })
    if (!team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 })
    }

    return NextResponse.json({ team })
  } catch (error) {
    console.error('Failed to update team:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update team' },
      { status: 500 }
    )
  }
}

// DELETE /api/teams/[id] - Delete a team
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const deleted = deleteTeam(id)
  if (!deleted) {
    return NextResponse.json({ error: 'Team not found' }, { status: 404 })
  }
  return NextResponse.json({ success: true })
}
