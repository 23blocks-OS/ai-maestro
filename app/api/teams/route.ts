import { NextRequest } from 'next/server'
import { listAllTeams, createNewTeam } from '@/services/teams-service'
import { toResponse } from '@/app/api/_helpers'

// GET /api/teams - List all teams
export async function GET() {
  const result = listAllTeams()
  return toResponse(result)
}

// POST /api/teams - Create a new team
export async function POST(request: NextRequest) {
  const body = await request.json()
  const result = createNewTeam(body)
  return toResponse(result)
}
