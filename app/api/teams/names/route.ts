import { NextResponse } from 'next/server'
import { loadTeams } from '@/lib/team-registry'
import { loadAgents } from '@/lib/agent-registry'

/**
 * GET /api/teams/names — Returns all team names and agent names for client-side collision checking.
 * Called once when the Create Team dialog opens to pre-load the full list for real-time validation.
 */
// NT-041: Force dynamic — reads runtime filesystem state (teams + agents registry files)
export const dynamic = 'force-dynamic'

// Phase 1: localhost-only, no auth required. TODO: add ACL for Phase 2 remote access
export async function GET() {
  try {
    const teams = loadTeams()
    // loadAgents() called per request; acceptable for Phase 1 traffic levels
    const agents = loadAgents()
    return NextResponse.json({
      teamNames: teams.map(t => t.name),
      agentNames: agents.map(a => a.name).filter(Boolean),
    })
  } catch (error) {
    console.error('[teams/names] GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
