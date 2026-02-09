import { NextRequest, NextResponse } from 'next/server'
import { loadTeams, createTeam } from '@/lib/team-registry'

// GET /api/teams - List all teams
export async function GET() {
  const teams = loadTeams()
  return NextResponse.json({ teams })
}

// POST /api/teams - Create a new team
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, description, agentIds } = body

    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'Team name is required' }, { status: 400 })
    }

    if (agentIds && !Array.isArray(agentIds)) {
      return NextResponse.json({ error: 'agentIds must be an array' }, { status: 400 })
    }

    const team = createTeam({ name, description, agentIds: agentIds || [] })
    return NextResponse.json({ team }, { status: 201 })
  } catch (error) {
    console.error('Failed to create team:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create team' },
      { status: 500 }
    )
  }
}
