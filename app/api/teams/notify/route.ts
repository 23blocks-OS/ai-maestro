import { NextRequest, NextResponse } from 'next/server'
import { notifyTeamAgents } from '@/services/teams-service'
import { authenticateAgent } from '@/lib/agent-auth'

// NT-008 fix: Force dynamic rendering for consistency with other POST-only routes
export const dynamic = 'force-dynamic'

// POST /api/teams/notify - Notify team agents about a meeting
export async function POST(request: NextRequest) {
  // Authenticate requesting agent identity (CC-P1-304)
  const auth = authenticateAgent(
    request.headers.get('Authorization'),
    request.headers.get('X-Agent-Id')
  )
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status || 401 })
  }

  let body
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  // Whitelist only expected fields instead of passing raw body
  const { agentIds, teamName } = body

  // Validate agentIds is a non-empty array of strings
  if (!agentIds || !Array.isArray(agentIds) || agentIds.length === 0) {
    return NextResponse.json({ error: 'agentIds must be a non-empty array' }, { status: 400 })
  }
  if (!agentIds.every((id: unknown) => typeof id === 'string')) {
    return NextResponse.json({ error: 'Each agentIds element must be a string' }, { status: 400 })
  }

  const result = await notifyTeamAgents({ agentIds, teamName })

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data)
}
