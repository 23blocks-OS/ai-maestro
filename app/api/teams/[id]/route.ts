import { NextRequest, NextResponse } from 'next/server'
import { getTeam, updateTeam, deleteTeam } from '@/lib/team-registry'
import { checkTeamAccess } from '@/lib/team-acl'

// GET /api/teams/[id] - Get a single team
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const team = getTeam(id)
  if (!team) {
    return NextResponse.json({ error: 'Team not found' }, { status: 404 })
  }
  const agentId = request.headers.get('X-Agent-Id') || undefined
  const access = checkTeamAccess({ teamId: id, requestingAgentId: agentId })
  if (!access.allowed) {
    return NextResponse.json({ error: access.reason }, { status: 403 })
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
    const agentId = request.headers.get('X-Agent-Id') || undefined
    const access = checkTeamAccess({ teamId: id, requestingAgentId: agentId })
    if (!access.allowed) {
      return NextResponse.json({ error: access.reason }, { status: 403 })
    }
    const body = await request.json()
    const { name, description, agentIds, lastMeetingAt, instructions, lastActivityAt, type, chiefOfStaffId } = body

    const team = updateTeam(id, { name, description, agentIds, lastMeetingAt, instructions, lastActivityAt, type, chiefOfStaffId })
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
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const agentId = request.headers.get('X-Agent-Id') || undefined
  const access = checkTeamAccess({ teamId: id, requestingAgentId: agentId })
  if (!access.allowed) {
    return NextResponse.json({ error: access.reason }, { status: 403 })
  }
  const deleted = deleteTeam(id)
  if (!deleted) {
    return NextResponse.json({ error: 'Team not found' }, { status: 404 })
  }
  return NextResponse.json({ success: true })
}
