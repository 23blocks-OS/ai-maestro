import { NextRequest, NextResponse } from 'next/server'
import { verifyPassword, loadGovernance } from '@/lib/governance'
import { getTeam, updateTeam } from '@/lib/team-registry'
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

    if (team.type !== 'closed') {
      return NextResponse.json({ error: 'Chief-of-Staff can only be assigned to closed teams' }, { status: 400 })
    }

    if (agentId === null) {
      // Remove COS
      const updated = await updateTeam(id, { chiefOfStaffId: undefined } as any)
      return NextResponse.json({ success: true, team: updated })
    }

    if (typeof agentId !== 'string' || !agentId.trim()) {
      return NextResponse.json({ error: 'agentId must be a non-empty string or null' }, { status: 400 })
    }

    const agent = getAgent(agentId)
    if (!agent) {
      return NextResponse.json({ error: `Agent '${agentId}' not found` }, { status: 404 })
    }

    const updated = await updateTeam(id, { chiefOfStaffId: agentId } as any)
    return NextResponse.json({ success: true, team: updated, chiefOfStaffName: agent.name || agent.alias })
  } catch (error) {
    console.error('Failed to set chief-of-staff:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to set chief-of-staff' },
      { status: 500 }
    )
  }
}
