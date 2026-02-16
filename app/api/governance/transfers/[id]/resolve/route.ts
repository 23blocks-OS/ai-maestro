/**
 * Resolve (approve/reject) a transfer request
 * POST - Approve or reject a pending transfer
 */

import { NextRequest, NextResponse } from 'next/server'
import { getTransferRequest, resolveTransferRequest } from '@/lib/transfer-registry'
import { loadTeams, updateTeam } from '@/lib/team-registry'
import { isManager } from '@/lib/governance'

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
    const resolved = resolveTransferRequest(id, action === 'approve' ? 'approved' : 'rejected', resolvedBy, rejectReason)
    if (!resolved) {
      return NextResponse.json({ error: 'Failed to resolve transfer request' }, { status: 500 })
    }

    // If approved, execute the actual transfer
    if (action === 'approve') {
      // Remove agent from source team
      const fromTeamAgentIds = fromTeam.agentIds.filter(aid => aid !== transferReq.agentId)
      updateTeam(fromTeam.id, { agentIds: fromTeamAgentIds })

      // Add agent to destination team
      const toTeam = teams.find(t => t.id === transferReq.toTeamId)
      if (toTeam && !toTeam.agentIds.includes(transferReq.agentId)) {
        const toTeamAgentIds = [...toTeam.agentIds, transferReq.agentId]
        updateTeam(toTeam.id, { agentIds: toTeamAgentIds })
      }
    }

    return NextResponse.json({ success: true, request: resolved })
  } catch (error) {
    console.error('Error resolving transfer:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
