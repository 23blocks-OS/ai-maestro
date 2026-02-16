import { NextRequest, NextResponse } from 'next/server'
import { listAllTeams, createNewTeam } from '@/services/teams-service'

// GET /api/teams - List all teams
export async function GET() {
  const result = listAllTeams()
  return NextResponse.json(result.data, { status: result.status })
}

// POST /api/teams - Create a new team
export async function POST(request: NextRequest) {
  const body = await request.json()
  const result = createNewTeam(body)

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data, { status: result.status })
}
