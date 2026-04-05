import { NextRequest, NextResponse } from 'next/server'
import { wakeAgent } from '@/services/agents-core-service'
import { isValidUuid } from '@/lib/validation'
import { authenticateAgent } from '@/lib/agent-auth'

/**
 * POST /api/agents/[id]/wake
 * Wake a hibernated agent.
 * Governance: only the web UI (user) or the MANAGER agent can wake agents.
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
    const { getManagerId } = await import('@/lib/governance')
    const { isAgentInAnyTeam, loadTeams } = await import('@/lib/team-registry')
    if (auth.agentId) {
      // Agent-initiated: MANAGER can wake ANY agent, COS can wake own team agents only
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
            { error: 'Only the MANAGER or the team\'s CHIEF-OF-STAFF can wake agents.' },
            { status: 403 }
          )
        }
      }
    }

    // Manager gate: team agents cannot wake without a MANAGER on the host
    if (!getManagerId() && isAgentInAnyTeam(id)) {
      return NextResponse.json(
        { error: 'Cannot wake team agent: no MANAGER exists on this host. Assign a MANAGER first.' },
        { status: 403 }
      )
    }

    // Parse optional body
    let startProgram = true
    let sessionIndex = 0
    let program: string | undefined
    try {
      const body = await request.json()
      if (body.startProgram === false) {
        startProgram = false
      }
      if (typeof body.sessionIndex === 'number') {
        sessionIndex = body.sessionIndex
      }
      if (typeof body.program === 'string') {
        // SF-010: Do not lowercase program name -- case-sensitive filesystems need exact case
        program = body.program
      }
    } catch {
      // No body or invalid JSON — use defaults (CC-P1-611: removed debug logging)
    }

    const result = await wakeAgent(id, { startProgram, sessionIndex, program })

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json(result.data)
  } catch (error) {
    // MF-003: Outer try-catch for unhandled service throws
    console.error('[Wake POST] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
