import { NextResponse } from 'next/server'
import { loadTeams } from '@/lib/team-registry'
import { loadAgents } from '@/lib/agent-registry'

/**
 * GET /api/teams/names — Returns all team names and agent names for client-side collision checking.
 * Called once when the Create Team dialog opens to pre-load the full list for real-time validation.
 */
export async function GET() {
  const teams = loadTeams()
  const agents = loadAgents()
  return NextResponse.json({
    teamNames: teams.map(t => t.name),
    agentNames: agents.map(a => a.name).filter(Boolean),
  })
}
