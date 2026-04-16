import { NextRequest } from 'next/server'
import { notifyTeamAgents } from '@/services/teams-service'
import { toResponse } from '@/app/api/_helpers'

// POST /api/teams/notify - Notify team agents about a meeting
export async function POST(request: NextRequest) {
  const body = await request.json()
  const result = await notifyTeamAgents(body)
  return toResponse(result)
}
