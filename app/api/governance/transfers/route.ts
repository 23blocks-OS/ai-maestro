/**
 * Transfer Requests API
 * GET - List transfer requests (optionally filtered by teamId or agentId)
 * POST - Create a new transfer request
 */

import { NextRequest, NextResponse } from 'next/server'
import { loadTransfers, createTransferRequest, getPendingTransfersForAgent } from '@/lib/transfer-registry'
import { loadTeams } from '@/lib/team-registry'
import { isManager, isChiefOfStaffAnywhere } from '@/lib/governance'
import { isValidUuid } from '@/lib/validation'
import { authenticateAgent } from '@/lib/agent-auth'

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
    // Authenticate the requester identity from headers (prevents impersonation via body)
    const auth = authenticateAgent(
      request.headers.get('Authorization'),
      request.headers.get('X-Agent-Id')
    )
    if (auth.error) {
      return NextResponse.json({ error: auth.error }, { status: auth.status || 401 })
    }

    // Fix: catch malformed JSON and return 400 instead of letting it bubble as 500
    let body
    try { body = await request.json() } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    const { agentId, fromTeamId, toTeamId, note } = body

    // requestedBy comes from authenticated identity, not body (prevents impersonation)
    const requestedBy = auth.agentId
    if (!requestedBy) {
      return NextResponse.json({ error: 'Agent authentication required to request transfers' }, { status: 401 })
    }

    if (!agentId || !fromTeamId || !toTeamId) {
      return NextResponse.json({ error: 'agentId, fromTeamId, and toTeamId are required' }, { status: 400 })
    }

    // Validate string types for all ID fields to reject numbers, booleans, objects etc. (CC-003)
    if (typeof agentId !== 'string' || typeof fromTeamId !== 'string' || typeof toTeamId !== 'string') {
      return NextResponse.json({ error: 'agentId, fromTeamId, and toTeamId must be strings' }, { status: 400 })
    }

    // Validate UUID format for all ID fields to prevent path traversal and invalid lookups (CC-001)
    // requestedBy is already validated by authenticateAgent
    if (!isValidUuid(agentId) || !isValidUuid(fromTeamId) || !isValidUuid(toTeamId) || !isValidUuid(requestedBy)) {
      return NextResponse.json({ error: 'Invalid UUID format' }, { status: 400 })
    }

    // requestedBy is now from auth headers and UUID-validated; check authority (manager/COS)
    if (!isManager(requestedBy) && !isChiefOfStaffAnywhere(requestedBy)) {
      return NextResponse.json({ error: 'Only MANAGER or Chief-of-Staff can request transfers' }, { status: 403 })
    }

    // Validate optional note field: must be a string with max 1000 chars (CC-007)
    if (note !== undefined && note !== null) {
      if (typeof note !== 'string') {
        return NextResponse.json({ error: 'note must be a string' }, { status: 400 })
      }
      if (note.length > 1000) {
        return NextResponse.json({ error: 'note must not exceed 1000 characters' }, { status: 400 })
      }
    }

    // Validate optional free-text fields max length to prevent oversized payloads (CC-008)
    if (body.rejectReason !== undefined && body.rejectReason !== null) {
      if (typeof body.rejectReason !== 'string' || body.rejectReason.length > 500) {
        return NextResponse.json({ error: 'rejectReason must be a string of at most 500 characters' }, { status: 400 })
      }
    }
    if (body.resolution !== undefined && body.resolution !== null) {
      if (typeof body.resolution !== 'string' || body.resolution.length > 500) {
        return NextResponse.json({ error: 'resolution must be a string of at most 500 characters' }, { status: 400 })
      }
    }

    // Validate source and destination are different teams (R5.6)
    if (fromTeamId === toTeamId) {
      return NextResponse.json({ error: 'Source and destination teams must be different' }, { status: 400 })
    }

    // Team validation and duplicate check are performed here as a fast-fail optimization.
    // TOCTOU note: createTransferRequest() re-checks for duplicates inside the file lock
    // (see transfer-registry.ts), so the authoritative duplicate guard is atomic.
    // The checks below are cheap pre-flight validations to return clear HTTP errors
    // without acquiring the lock for obviously invalid requests.
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

    // Pre-flight duplicate check — fast-fail before acquiring the lock.
    // The authoritative duplicate check runs inside createTransferRequest()'s lock.
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
