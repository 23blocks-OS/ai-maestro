import { NextRequest, NextResponse } from 'next/server'
import { notifyTeamAgents } from '@/services/teams-service'

// POST /api/teams/notify - Notify team agents about a meeting
export async function POST(request: NextRequest) {
  const body = await request.json()
  const result = await notifyTeamAgents(body)

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data)
}
