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

  // NT-006: requestingAgentId removed -- NotifyTeamParams only accepts agentIds + teamName.
  // Authentication is verified above; audit logging of the requesting agent is not yet needed.
  const result = await notifyTeamAgents(body)

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data)
}
