/**
 * Resolve (approve/reject) a transfer request
 * POST - Approve or reject a pending transfer
 */

import { NextRequest, NextResponse } from 'next/server'
import { getTransferRequest, resolveTransferRequest, revertTransferToPending } from '@/lib/transfer-registry'
import { loadTeams, saveTeams, TeamValidationException } from '@/lib/team-registry'
import { isManager, getManagerId, isChiefOfStaffAnywhere } from '@/lib/governance'
import { getAgent } from '@/lib/agent-registry'
import { notifyAgent } from '@/lib/notification-service'
import { acquireLock } from '@/lib/file-lock'
import { isValidUuid } from '@/lib/validation'
import { authenticateAgent } from '@/lib/agent-auth'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    if (!isValidUuid(id)) {
      return NextResponse.json({ error: 'Invalid transfer ID format' }, { status: 400 })
    }

    // Authenticate the resolver identity from headers (prevents impersonation via body)
    const auth = authenticateAgent(
      request.headers.get('Authorization'),
      request.headers.get('X-Agent-Id')
    )
    if (auth.error) {
      // SF-053: Use nullish coalescing to avoid hiding status 0 (though unlikely)
      return NextResponse.json({ error: auth.error }, { status: auth.status ?? 401 })
    }

    let body: Record<string, unknown>
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Malformed JSON in request body' }, { status: 400 })
    }
    const { action } = body
    const rejectReason = typeof body.rejectReason === 'string' ? body.rejectReason : undefined

    // resolvedBy comes from authenticated identity, not body (prevents impersonation)
    const resolvedBy = auth.agentId
    if (!resolvedBy) {
      return NextResponse.json({ error: 'Agent authentication required to resolve transfers' }, { status: 401 })
    }

    if (!action) {
      return NextResponse.json({ error: 'action is required' }, { status: 400 })
    }
    // Defense-in-depth: validate resolvedBy as UUID before authority check (CC-002)
    if (!isValidUuid(resolvedBy)) {
      return NextResponse.json({ error: 'Invalid resolvedBy UUID format' }, { status: 400 })
    }
    if (action !== 'approve' && action !== 'reject') {
      return NextResponse.json({ error: 'action must be "approve" or "reject"' }, { status: 400 })
    }

    // Optimization: check transfer status before acquiring lock.
    // Real guard is inside resolveTransferRequest() under the 'transfers' lock.
    const transferReq = getTransferRequest(id)
    if (!transferReq) {
      return NextResponse.json({ error: 'Transfer request not found' }, { status: 404 })
    }
    if (transferReq.status !== 'pending') {
      return NextResponse.json({ error: 'Transfer request is already resolved' }, { status: 409 })
    }

    // Acquire teams lock for the entire read-validate-write cycle to prevent TOCTOU races.
    // We use acquireLock directly (instead of withLock) because we need to return
    // NextResponse objects from within the critical section.
    const releaseLock = await acquireLock('teams')
    let teams: ReturnType<typeof loadTeams>
    let fromTeam: ReturnType<typeof loadTeams>[number] | undefined
    let toTeam: ReturnType<typeof loadTeams>[number] | undefined
    let resolved: Awaited<ReturnType<typeof resolveTransferRequest>> | undefined
    try {
      // Verify resolver has authority: must be COS of the source team or MANAGER
      teams = loadTeams()
      fromTeam = teams.find(t => t.id === transferReq.fromTeamId)
      if (!fromTeam) {
        return NextResponse.json({ error: 'Source team not found' }, { status: 404 })
      }

      const isSourceCOS = fromTeam.chiefOfStaffId === resolvedBy
      const isGlobalManager = isManager(resolvedBy)

      if (!isSourceCOS && !isGlobalManager) {
        return NextResponse.json({ error: 'Only the source team COS or MANAGER can resolve this transfer' }, { status: 403 })
      }

      // Look up destination team early so we can validate before marking as approved
      toTeam = teams.find(t => t.id === transferReq.toTeamId)

      if (action === 'approve') {
        // Verify destination team still exists BEFORE marking transfer as approved (R5.5)
        // — must check before resolveTransferRequest so we don't mark approved on disk
        // when the transfer cannot actually be completed
        if (!toTeam) {
          return NextResponse.json({ error: 'Destination team no longer exists — transfer cannot be completed' }, { status: 404 })
        }

        // Multi-closed-team constraint check (R4.1, R5.7) — runs BEFORE resolveTransferRequest
        // so that a constraint violation does not leave an inconsistent "approved but not moved" state (SR-001)
        const managerId = getManagerId()
        if (toTeam.type === 'closed') {
          const agentId = transferReq.agentId
          const isPrivileged = agentId === managerId || isChiefOfStaffAnywhere(agentId)
          if (!isPrivileged) {
            // Defensive guard: fromTeam/toTeam are guaranteed non-null by earlier checks
            // but TypeScript cannot narrow across the conditional blocks above
            if (!fromTeam || !toTeam) {
              return NextResponse.json({ error: 'Source or destination team not found' }, { status: 404 })
            }
            const otherClosedTeam = teams.find(t =>
              t.type === 'closed' && t.id !== fromTeam.id && t.id !== toTeam.id && t.agentIds.includes(agentId)
            )
            if (otherClosedTeam) {
              return NextResponse.json({
                error: 'Agent is already in another closed team — normal agents can only be in one closed team',
              }, { status: 409 })
            }
          }
        }
      }

      // Resolve the request (mark as approved/rejected on disk)
      // All pre-approval validation has passed at this point
      resolved = await resolveTransferRequest(id, action === 'approve' ? 'approved' : 'rejected', resolvedBy, rejectReason)
      if (!resolved) {
        // Concurrent resolve detected — another request resolved this transfer first
        return NextResponse.json({ error: 'Transfer already resolved' }, { status: 409 })
      }

      // If approved, execute the actual team mutations
      if (action === 'approve') {
        // Remove agent from source team — direct mutation under the held lock
        // (avoids calling updateTeam which would re-acquire the non-reentrant lock)
        // Defensive guard: fromTeam/toTeam are guaranteed non-null by earlier checks
        // but TypeScript cannot narrow across the conditional blocks above
        if (!fromTeam || !toTeam) {
          return NextResponse.json({ error: 'Source or destination team not found' }, { status: 404 })
        }
        const fromIdx = teams.findIndex(t => t.id === fromTeam.id)
        if (fromIdx !== -1) {
          teams[fromIdx] = {
            ...teams[fromIdx],
            agentIds: teams[fromIdx].agentIds.filter(aid => aid !== transferReq.agentId),
            updatedAt: new Date().toISOString(),
          }
        }

        // Add agent to destination team — direct mutation under the held lock
        const toIdx = teams.findIndex(t => t.id === toTeam.id)
        if (toIdx !== -1 && !teams[toIdx].agentIds.includes(transferReq.agentId)) {
          teams[toIdx] = {
            ...teams[toIdx],
            agentIds: [...teams[toIdx].agentIds, transferReq.agentId],
            updatedAt: new Date().toISOString(),
          }
        }

        // Single atomic save for both team mutations — saveTeams throws on write failure
        // (disk full, permission error, etc.) so we catch and revert (SR-007)
        try {
          saveTeams(teams)
        } catch (saveError) {
          // NT-029: Log the save error for debugging before reverting
          console.error('[TransferResolve] Failed to save teams after approval:', saveError)
          // Compensating action (SR-007): revert transfer from 'approved' back to 'pending'
          // to maintain consistency when team save fails
          await revertTransferToPending(id)
          return NextResponse.json({ error: 'Failed to save team changes after transfer approval — transfer reverted to pending' }, { status: 500 })
        }
      }
    } finally {
      releaseLock()
    }

    // Notify the affected agent about the transfer resolution via tmux
    const affectedAgent = getAgent(transferReq.agentId)
    if (affectedAgent && fromTeam) {
      const resolverAgent = getAgent(resolvedBy)
      const resolverName = resolverAgent?.name || resolvedBy
      const statusText = action === 'approve' ? 'APPROVED' : 'REJECTED'
      const teamInfo = action === 'approve'
        ? `${fromTeam.name} → ${toTeam?.name || 'unknown'}`
        : `from ${fromTeam.name}`
      const subject = `Transfer ${statusText}: ${teamInfo}`

      // Fire-and-forget: notification failure does not affect the transfer outcome
      notifyAgent({
        agentId: affectedAgent.id,
        agentName: affectedAgent.name,
        fromName: resolverName,
        subject,
        messageId: id,
        priority: 'high',
        messageType: 'transfer-resolution',
      }).catch((err) => {
        console.error(`[TransferResolve] Failed to notify agent ${affectedAgent.name}:`, err)
      })
    }

    return NextResponse.json({ success: true, request: resolved })
  } catch (error) {
    if (error instanceof TeamValidationException) {
      return NextResponse.json({ error: error.message }, { status: error.code })
    }
    console.error('Error resolving transfer:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
