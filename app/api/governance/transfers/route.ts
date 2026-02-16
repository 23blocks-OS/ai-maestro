/**
 * Transfer Requests API
 * GET - List transfer requests (optionally filtered by teamId or agentId)
 * POST - Create a new transfer request
 */

import { NextRequest, NextResponse } from 'next/server'
import { loadTransfers, createTransferRequest, getPendingTransfersForAgent } from '@/lib/transfer-registry'
import { loadTeams } from '@/lib/team-registry'
import { isManager, isChiefOfStaffAnywhere } from '@/lib/governance'

// Phase 1: localhost-only, no auth required. TODO: add ACL for Phase 2 remote access
export async function GET(request: NextRequest) {
  try {
    const teamId = request.nextUrl.searchParams.get('teamId')
    const agentId = request.nextUrl.searchParams.get('agentId')
    const status = request.nextUrl.searchParams.get('status') // 'pending', 'approved', 'rejected', or null for all

    if (status && !['pending','approved','rejected'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status filter' }, { status: 400 })
    }

    let requests = loadTransfers()

    if (teamId) {
      requests = requests.filter(r => r.fromTeamId === teamId || r.toTeamId === teamId)
    }
    if (agentId) {
      requests = requests.filter(r => r.agentId === agentId)
    }
    if (status) {
      requests = requests.filter(r => r.status === status)
    }

    return NextResponse.json({ requests })
  } catch (error) {
    console.error('Error loading transfers:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { agentId, fromTeamId, toTeamId, requestedBy, note } = body

    if (!agentId || !fromTeamId || !toTeamId || !requestedBy) {
      return NextResponse.json({ error: 'agentId, fromTeamId, toTeamId, and requestedBy are required' }, { status: 400 })
    }

    // Verify requester has authority (must be MANAGER or COS)
    if (!isManager(requestedBy) && !isChiefOfStaffAnywhere(requestedBy)) {
      return NextResponse.json({ error: 'Only MANAGER or Chief-of-Staff can request transfers' }, { status: 403 })
    }

    // Validate source and destination are different teams (R5.6)
    if (fromTeamId === toTeamId) {
      return NextResponse.json({ error: 'Source and destination teams must be different' }, { status: 400 })
    }

    // Verify the agent is actually in the fromTeam
    const teams = loadTeams()
    const fromTeam = teams.find(t => t.id === fromTeamId)
    if (!fromTeam) {
      return NextResponse.json({ error: 'Source team not found' }, { status: 404 })
    }
    if (!fromTeam.agentIds.includes(agentId)) {
      return NextResponse.json({ error: 'Agent is not in the source team' }, { status: 400 })
    }

    // Validate destination team exists (R5.5)
    const toTeam = teams.find(t => t.id === toTeamId)
    if (!toTeam) {
      return NextResponse.json({ error: 'Destination team not found' }, { status: 404 })
    }

    // COS cannot be transferred out of their own team — would orphan the team (R5.4)
    if (fromTeam.chiefOfStaffId === agentId) {
      return NextResponse.json({ error: 'Cannot transfer the Chief-of-Staff out of their team — remove COS role first' }, { status: 400 })
    }

    // Check if source team is closed (transfer approval only needed for closed teams)
    if (fromTeam.type !== 'closed') {
      return NextResponse.json({ error: 'Transfer requests are only needed for closed teams. Use direct team update for open teams.' }, { status: 400 })
    }

    // Check for duplicate pending requests
    const pending = getPendingTransfersForAgent(agentId)
    const duplicate = pending.find(r => r.fromTeamId === fromTeamId && r.toTeamId === toTeamId)
    if (duplicate) {
      return NextResponse.json({ error: 'A transfer request for this agent between these teams already exists', existingRequest: duplicate }, { status: 409 })
    }

    const transferRequest = await createTransferRequest({ agentId, fromTeamId, toTeamId, requestedBy, note })

    return NextResponse.json({ success: true, request: transferRequest }, { status: 201 })
  } catch (error) {
    console.error('Error creating transfer:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
