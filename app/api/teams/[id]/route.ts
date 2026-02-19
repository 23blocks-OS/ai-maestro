import { NextRequest, NextResponse } from 'next/server'
import { getTeam, updateTeam, deleteTeam, TeamValidationException } from '@/lib/team-registry'
import { getManagerId, isManager } from '@/lib/governance'
import { checkTeamAccess } from '@/lib/team-acl'
import { isValidUuid } from '@/lib/validation'

// GET /api/teams/[id] - Get a single team
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    if (!isValidUuid(id)) {
      return NextResponse.json({ error: 'Invalid team ID format' }, { status: 400 })
    }
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
  } catch (error) {
    console.error('[teams] GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PUT /api/teams/[id] - Update a team
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    if (!isValidUuid(id)) {
      return NextResponse.json({ error: 'Invalid team ID format' }, { status: 400 })
    }
    const agentId = request.headers.get('X-Agent-Id') || undefined
    const access = checkTeamAccess({ teamId: id, requestingAgentId: agentId })
    if (!access.allowed) {
      return NextResponse.json({ error: access.reason }, { status: 403 })
    }
    let body
    try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }
    // Strip chiefOfStaffId and type from generic PUT — these must use dedicated password-protected endpoints (R3.12, R8.2)
    const { name, description, agentIds, lastMeetingAt, instructions, lastActivityAt } = body

    const managerId = getManagerId()
    const team = await updateTeam(id, { name, description, agentIds, lastMeetingAt, instructions, lastActivityAt }, managerId)
    if (!team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 })
    }

    return NextResponse.json({ team })
  } catch (error) {
    // TeamValidationException carries the correct HTTP status code from business rule validation
    if (error instanceof TeamValidationException) {
      return NextResponse.json({ error: error.message }, { status: error.code })
    }
    console.error('Failed to update team:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update team' },
      { status: 500 }
    )
  }
}

// DELETE /api/teams/[id] - Delete a team
// Phase 1: localhost-only, no X-Agent-Id auth required. Phase 2: require authenticated agent identity for delete operations.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    if (!isValidUuid(id)) {
      return NextResponse.json({ error: 'Invalid team ID format' }, { status: 400 })
    }
    const agentId = request.headers.get('X-Agent-Id') || undefined
    const access = checkTeamAccess({ teamId: id, requestingAgentId: agentId })
    if (!access.allowed) {
      return NextResponse.json({ error: access.reason }, { status: 403 })
    }
    // SR-002 fix: Closed team deletion requires elevated authority (MANAGER or COS)
    // checkTeamAccess allows any member for resource access, but deletion is destructive
    const team = getTeam(id)
    if (team && team.type === 'closed') {
      if (agentId && !isManager(agentId) && team.chiefOfStaffId !== agentId) {
        return NextResponse.json(
          { error: 'Closed team deletion requires MANAGER or Chief-of-Staff authority' },
          { status: 403 }
        )
      }
    }
    const deleted = await deleteTeam(id)
    if (!deleted) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 })
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[teams] DELETE error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
