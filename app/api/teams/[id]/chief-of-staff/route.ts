import { NextRequest, NextResponse } from 'next/server'
import { verifyPassword, loadGovernance, getManagerId } from '@/lib/governance'
import { getTeam, updateTeam, TeamValidationException } from '@/lib/team-registry'
import { getAgent } from '@/lib/agent-registry'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { agentId, password } = body

    if (!password || typeof password !== 'string') {
      return NextResponse.json({ error: 'Governance password is required' }, { status: 400 })
    }

    const config = loadGovernance()
    if (!config.passwordHash) {
      return NextResponse.json({ error: 'Governance password not set' }, { status: 400 })
    }

    if (!verifyPassword(password)) {
      return NextResponse.json({ error: 'Invalid governance password' }, { status: 401 })
    }

    const team = getTeam(id)
    if (!team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 })
    }

    const managerId = getManagerId()

    if (agentId === null) {
      // Remove COS — auto-downgrade team to open (R1.5)
      const updated = await updateTeam(id, { chiefOfStaffId: null, type: 'open' }, managerId)
      return NextResponse.json({ success: true, team: updated })
    }

    if (typeof agentId !== 'string' || !agentId.trim()) {
      return NextResponse.json({ error: 'agentId must be a non-empty string or null' }, { status: 400 })
    }

    const agent = getAgent(agentId)
    if (!agent) {
      return NextResponse.json({ error: `Agent '${agentId}' not found` }, { status: 404 })
    }

    // Assign COS — auto-upgrade team to closed (R1.3) and auto-add COS to agentIds (R4.6)
    const newAgentIds = team.agentIds.includes(agentId) ? team.agentIds : [...team.agentIds, agentId]
    const updated = await updateTeam(id, { chiefOfStaffId: agentId, type: 'closed', agentIds: newAgentIds }, managerId)
    return NextResponse.json({ success: true, team: updated, chiefOfStaffName: agent.name || agent.alias })
  } catch (error) {
    // TeamValidationException carries the correct HTTP status code from business rule validation
    if (error instanceof TeamValidationException) {
      return NextResponse.json({ error: error.message }, { status: error.code })
    }
    console.error('Failed to set chief-of-staff:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to set chief-of-staff' },
      { status: 500 }
    )
  }
}
