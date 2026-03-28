import { NextRequest, NextResponse } from 'next/server'
import { verifyPassword, loadGovernance, getManagerId } from '@/lib/governance'
import { getTeam, updateTeam, TeamValidationException } from '@/lib/team-registry'
import { getAgent } from '@/lib/agent-registry'
// NT-007: Use recordAttempt (the canonical name) instead of deprecated recordFailure alias
import { checkRateLimit, recordAttempt, resetRateLimit } from '@/lib/rate-limit'
import { isValidUuid } from '@/lib/validation'

// NT-008 fix: Force dynamic rendering for consistency with other POST-only routes
export const dynamic = 'force-dynamic'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    if (!isValidUuid(id)) {
      return NextResponse.json({ error: 'Invalid team ID format' }, { status: 400 })
    }
    let body
    try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }
    const { agentId: cosAgentId, password } = body

    if (!password || typeof password !== 'string') {
      return NextResponse.json({ error: 'Governance password is required' }, { status: 400 })
    }

    const config = loadGovernance()
    if (!config.passwordHash) {
      return NextResponse.json({ error: 'Governance password not set' }, { status: 400 })
    }

    // Separate check/record pattern (not checkAndRecordAttempt) so only failed attempts are penalized
    const rateLimitKey = `governance-cos-auth:${id}`
    const rateCheck = checkRateLimit(rateLimitKey)
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: `Too many failed password attempts. Try again in ${Math.ceil(rateCheck.retryAfterMs / 1000)}s` },
        { status: 429 }
      )
    }

    // Password auth is stronger than ACL — only managers know the governance password
    if (!(await verifyPassword(password))) {
      recordAttempt(rateLimitKey)
      return NextResponse.json({ error: 'Invalid governance password' }, { status: 401 })
    }
    // Password verified successfully — reset rate limit counter
    resetRateLimit(rateLimitKey)

    const team = getTeam(id)
    if (!team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 })
    }

    const managerId = getManagerId()

    if (cosAgentId === null) {
      // Capture old COS id before updateTeam clears it
      const oldCosId = team.chiefOfStaffId
      // Remove COS — team stays closed (governance simplification: all teams are closed)
      const updated = await updateTeam(id, { chiefOfStaffId: null }, managerId)

      // Auto-reject pending configure-agent requests from the removed COS (11a safeguard)
      if (oldCosId) {
        try {
          const { loadGovernanceRequests, rejectGovernanceRequest } = await import('@/lib/governance-request-registry')
          const file = loadGovernanceRequests()
          const pendingFromCOS = file.requests.filter((r: { type: string; status: string; requestedBy: string }) =>
            r.type === 'configure-agent' && r.status === 'pending' && r.requestedBy === oldCosId
          )
          for (const req of pendingFromCOS) {
            await rejectGovernanceRequest(req.id, managerId || 'system', `COS role revoked for team '${team.name}'`)
          }
          if (pendingFromCOS.length > 0) {
            console.log(`[governance] Auto-rejected ${pendingFromCOS.length} pending config request(s) from removed COS ${oldCosId}`)
          }
        } catch (err) {
          console.warn('[governance] Failed to auto-reject pending config requests:', err instanceof Error ? err.message : err)
        }
      }

      return NextResponse.json({ success: true, team: updated })
    }

    if (typeof cosAgentId !== 'string' || !cosAgentId.trim()) {
      return NextResponse.json({ error: 'agentId must be a non-empty string or null' }, { status: 400 })
    }
    // NT-002: Validate cosAgentId format before registry lookup
    if (!isValidUuid(cosAgentId)) {
      return NextResponse.json({ error: 'Invalid agent ID format' }, { status: 400 })
    }

    const agent = getAgent(cosAgentId)
    if (!agent) {
      return NextResponse.json({ error: `Agent '${cosAgentId}' not found` }, { status: 404 })
    }

    // Assign COS — auto-upgrade team to closed (R1.3); validateTeamMutation auto-adds COS to agentIds (R4.6)
    const updated = await updateTeam(id, { chiefOfStaffId: cosAgentId, type: 'closed' }, managerId)

    // Auto-assign required role-plugin for CHIEF-OF-STAFF title
    try {
      const { autoAssignRolePluginForTitle } = await import('@/services/role-plugin-service')
      await autoAssignRolePluginForTitle('chief-of-staff', cosAgentId)
    } catch (err) {
      console.warn('[governance] Failed to auto-assign role-plugin for COS:', err instanceof Error ? err.message : err)
      // Non-blocking — title assignment succeeds even if plugin assignment fails
    }

    return NextResponse.json({ success: true, team: updated, chiefOfStaffName: agent.name || agent.alias })
  } catch (error) {
    // TeamValidationException carries the correct HTTP status code from business rule validation
    if (error instanceof TeamValidationException) {
      return NextResponse.json({ error: error.message }, { status: error.code })
    }
    console.error('Failed to set chief-of-staff:', error)
    // NT-001: Return generic message instead of exposing internal error details
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
