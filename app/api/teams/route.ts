import { NextRequest, NextResponse } from 'next/server'
import { listAllTeams, createNewTeam } from '@/services/teams-service'
import { authenticateAgent } from '@/lib/agent-auth'

// GET /api/teams - List all teams
// Phase 1: No ACL on team list -- localhost only. TODO Phase 2: Add auth/ACL for remote access.
// CC-P1-309: Add standard result.error check for consistency with other routes
export async function GET() {
  const result = listAllTeams()
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data, { status: result.status })
}

// POST /api/teams - Create a new team
export async function POST(request: NextRequest) {
  // Authenticate requesting agent identity for governance checks
  const auth = authenticateAgent(
    request.headers.get('Authorization'),
    request.headers.get('X-Agent-Id')
  )
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status || 401 })
  }
  const requestingAgentId = auth.agentId

  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const result = await createNewTeam({ ...body, requestingAgentId })

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data, { status: result.status })
}
