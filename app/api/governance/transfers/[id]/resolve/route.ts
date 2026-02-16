/**
 * Resolve (approve/reject) a transfer request
 * POST - Approve or reject a pending transfer
 */

import { NextRequest, NextResponse } from 'next/server'
import { getTransferRequest, resolveTransferRequest } from '@/lib/transfer-registry'
import { loadTeams, updateTeam, TeamValidationException } from '@/lib/team-registry'
import { isManager, getManagerId, isChiefOfStaffAnywhere } from '@/lib/governance'
import { getAgent } from '@/lib/agent-registry'
import { notifyAgent } from '@/lib/notification-service'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { action, resolvedBy, rejectReason } = body

    if (!action || !resolvedBy) {
      return NextResponse.json({ error: 'action and resolvedBy are required' }, { status: 400 })
    }
    if (action !== 'approve' && action !== 'reject') {
      return NextResponse.json({ error: 'action must be "approve" or "reject"' }, { status: 400 })
    }

    // Get the transfer request
    const transferReq = getTransferRequest(id)
    if (!transferReq) {
      return NextResponse.json({ error: 'Transfer request not found' }, { status: 404 })
    }
    if (transferReq.status !== 'pending') {
      return NextResponse.json({ error: 'Transfer request is already resolved' }, { status: 400 })
    }

    // Verify resolver has authority: must be COS of the source team or MANAGER
    const teams = loadTeams()
    const fromTeam = teams.find(t => t.id === transferReq.fromTeamId)
    if (!fromTeam) {
      return NextResponse.json({ error: 'Source team not found' }, { status: 404 })
    }

    const isSourceCOS = fromTeam.chiefOfStaffId === resolvedBy
    const isGlobalManager = isManager(resolvedBy)

    if (!isSourceCOS && !isGlobalManager) {
      return NextResponse.json({ error: 'Only the source team COS or MANAGER can resolve this transfer' }, { status: 403 })
    }

    // Resolve the request
    const resolved = await resolveTransferRequest(id, action === 'approve' ? 'approved' : 'rejected', resolvedBy, rejectReason)
    if (!resolved) {
      return NextResponse.json({ error: 'Failed to resolve transfer request' }, { status: 500 })
    }

    // If approved, execute the actual transfer
    const toTeam = teams.find(t => t.id === transferReq.toTeamId)
    if (action === 'approve') {
      // Verify destination team still exists (R5.5 — may have been deleted since request was created)
      if (!toTeam) {
        return NextResponse.json({ error: 'Destination team no longer exists — transfer cannot be completed' }, { status: 404 })
      }

      const managerId = getManagerId()

      // Multi-closed-team constraint check (R4.1, R5.7)
      // If destination is a closed team and agent is normal (not MANAGER, not COS), verify constraint
      if (toTeam.type === 'closed') {
        const agentId = transferReq.agentId
        const isPrivileged = agentId === managerId || isChiefOfStaffAnywhere(agentId)
        if (!isPrivileged) {
          const otherClosedTeam = teams.find(t =>
            t.type === 'closed' && t.id !== fromTeam.id && t.id !== toTeam.id && t.agentIds.includes(agentId)
          )
          if (otherClosedTeam) {
            return NextResponse.json({
              error: `Agent is already in closed team "${otherClosedTeam.name}" — normal agents can only be in one closed team`,
            }, { status: 409 })
          }
        }
      }

      // Remove agent from source team
      const fromTeamAgentIds = fromTeam.agentIds.filter(aid => aid !== transferReq.agentId)
      await updateTeam(fromTeam.id, { agentIds: fromTeamAgentIds }, managerId)

      // Add agent to destination team
      if (!toTeam.agentIds.includes(transferReq.agentId)) {
        const toTeamAgentIds = [...toTeam.agentIds, transferReq.agentId]
        await updateTeam(toTeam.id, { agentIds: toTeamAgentIds }, managerId)
      }
    }

    // Notify the affected agent about the transfer resolution via tmux
    const affectedAgent = getAgent(transferReq.agentId)
    if (affectedAgent) {
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
        messageType: 'notification',
      }).catch((err) => {
        console.error(`[TransferResolve] Failed to notify agent ${affectedAgent.name}:`, err)
      })
    }

    return NextResponse.json({ success: true, request: resolved })
  } catch (error) {
    console.error('Error resolving transfer:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
