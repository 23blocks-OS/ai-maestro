import { NextRequest, NextResponse } from 'next/server'
import { listAllTeams, createNewTeam } from '@/services/teams-service'

// GET /api/teams - List all teams
// Phase 1: No ACL on team list -- localhost only. TODO Phase 2: Add auth/ACL for remote access.
export async function GET() {
  const result = listAllTeams()
  return NextResponse.json(result.data, { status: result.status })
}

// POST /api/teams - Create a new team
export async function POST(request: NextRequest) {
  // Extract requesting agent identity from header for governance checks
  const requestingAgentId = request.headers.get('X-Agent-Id') || undefined

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
