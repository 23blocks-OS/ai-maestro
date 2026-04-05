import { NextRequest, NextResponse } from 'next/server'
import { hibernateAgent } from '@/services/agents-core-service'
import { isValidUuid } from '@/lib/validation'
import { authenticateAgent } from '@/lib/agent-auth'

/**
 * POST /api/agents/[id]/hibernate
 * Hibernate an agent by stopping its session and updating status.
 * Governance: only the web UI (user) or the MANAGER agent can hibernate agents.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = await params
    // SF-009: Validate UUID format for agent ID (defense-in-depth)
    if (!isValidUuid(id)) {
      return NextResponse.json({ error: 'Invalid agent ID format' }, { status: 400 })
    }

    // Governance: user (no auth) = allowed always. Agent-initiated = MANAGER or COS (own team only).
    const auth = authenticateAgent(
      request.headers.get('Authorization'),
      request.headers.get('X-Agent-Id')
    )
    if (auth.error) {
      return NextResponse.json({ error: auth.error }, { status: auth.status || 401 })
    }
    if (auth.agentId) {
      const { getManagerId } = await import('@/lib/governance')
      const { loadTeams } = await import('@/lib/team-registry')
      const managerId = getManagerId()
      if (managerId === auth.agentId) {
        // MANAGER — allowed
      } else {
        // Check if caller is COS of a team that contains the target agent
        const teams = loadTeams()
        const callerIsCoSOfTargetTeam = teams.some(t =>
          t.chiefOfStaffId === auth.agentId && t.agentIds.includes(id)
        )
        if (!callerIsCoSOfTargetTeam) {
          return NextResponse.json(
            { error: 'Only the MANAGER or the team\'s CHIEF-OF-STAFF can hibernate agents.' },
            { status: 403 }
          )
        }
      }
    }

    // Parse optional body for sessionIndex
    let sessionIndex = 0
    try {
      const body = await request.json()
      if (typeof body.sessionIndex === 'number') {
        sessionIndex = body.sessionIndex
      }
    } catch {
      // No body or invalid JSON, use defaults
    }

    const result = await hibernateAgent(id, { sessionIndex })

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json(result.data)
  } catch (error) {
    // MF-003: Outer try-catch for unhandled service throws
    console.error('[Hibernate POST] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
