import { NextRequest, NextResponse } from 'next/server'
import { loadTeams, createTeam, TeamValidationException } from '@/lib/team-registry'
import { getManagerId } from '@/lib/governance'
import { loadAgents } from '@/lib/agent-registry'

// GET /api/teams - List all teams
// Phase 1: localhost-only, no auth required. TODO: add ACL for Phase 2 remote access
export async function GET() {
  const teams = loadTeams()
  return NextResponse.json({ teams })
}

// POST /api/teams - Create a new team
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, description, agentIds, type, chiefOfStaffId } = body

    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'Team name is required' }, { status: 400 })
    }

    if (agentIds && !Array.isArray(agentIds)) {
      return NextResponse.json({ error: 'agentIds must be an array' }, { status: 400 })
    }

    // Pass managerId for multi-closed-team constraint checks (R4.1)
    const managerId = getManagerId()
    // Load agent names to prevent team/agent name collisions (R2.1)
    const allAgents = loadAgents()
    const agentNames = allAgents.map(a => a.name).filter(Boolean) as string[]
    const team = await createTeam({ name, description, agentIds: agentIds || [], type, chiefOfStaffId }, managerId, agentNames)
    return NextResponse.json({ team }, { status: 201 })
  } catch (error) {
    // TeamValidationException carries the correct HTTP status code from business rule validation
    if (error instanceof TeamValidationException) {
      return NextResponse.json({ error: error.message }, { status: error.code })
    }
    console.error('Failed to create team:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create team' },
      { status: 500 }
    )
  }
}
