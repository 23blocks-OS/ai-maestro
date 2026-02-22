/**
 * Cross-Host Governance Requests Endpoint
 *
 * POST /api/v1/governance/requests  — Submit or receive a cross-host governance request
 * GET  /api/v1/governance/requests  — List governance requests with optional filtering
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  submitCrossHostRequest,
  receiveCrossHostRequest,
  listCrossHostRequests,
} from '@/services/cross-host-governance-service'
import { verifyHostAttestation } from '@/lib/host-keys'
import { getHosts } from '@/lib/hosts-config'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  // Determine if this is a remote receive (fromHostId present) or local submission
  if (body?.fromHostId) {
    // Verify Ed25519 signature for remote governance requests (SR-P2-001)
    const hostId = request.headers.get('X-Host-Id')
    const hostSignature = request.headers.get('X-Host-Signature')
    const hostTimestamp = request.headers.get('X-Host-Timestamp')
    if (!hostId || !hostSignature || !hostTimestamp) {
      return NextResponse.json({ error: 'Missing host authentication headers' }, { status: 401 })
    }
    if (hostId !== body.fromHostId) {
      return NextResponse.json({ error: 'Host ID header does not match body fromHostId' }, { status: 400 })
    }
    const hosts = getHosts()
    const knownHost = hosts.find((h) => h.id === hostId)
    if (!knownHost) {
      return NextResponse.json({ error: 'Unknown host' }, { status: 403 })
    }
    if (!knownHost.publicKeyHex) {
      return NextResponse.json({ error: 'Host has no registered public key' }, { status: 403 })
    }
    const signedData = `gov-request|${hostId}|${hostTimestamp}`
    if (!verifyHostAttestation(signedData, hostSignature, knownHost.publicKeyHex)) {
      return NextResponse.json({ error: 'Invalid host signature' }, { status: 403 })
    }
    const tsAge = Date.now() - new Date(hostTimestamp).getTime()
    if (isNaN(tsAge) || tsAge > 300_000 || tsAge < -60_000) {
      return NextResponse.json({ error: 'Signature expired' }, { status: 403 })
    }

    const result = await receiveCrossHostRequest(body.fromHostId, body.request)
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json(result.data, { status: result.status })
  }

  try {
    const result = await submitCrossHostRequest(body)
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json(result.data, { status: result.status })
  } catch (err) {
    console.error('[Governance Requests] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/** Valid GovernanceRequestStatus values for query param validation (CC-P4-006) */
const VALID_GOVERNANCE_REQUEST_STATUSES = new Set([
  'pending', 'remote-approved', 'local-approved', 'dual-approved', 'executed', 'rejected',
])

export async function GET(request: NextRequest): Promise<NextResponse> {
  const searchParams = request.nextUrl.searchParams
  // CC-P4-006: Validate status param against known values before passing through
  const statusParam = searchParams.get('status')
  if (statusParam && !VALID_GOVERNANCE_REQUEST_STATUSES.has(statusParam)) {
    return NextResponse.json(
      { error: `Invalid status value '${statusParam}'. Must be one of: ${[...VALID_GOVERNANCE_REQUEST_STATUSES].join(', ')}` },
      { status: 400 }
    )
  }
  try {
    // SF-024: Pass type filter through to listCrossHostRequests (was silently ignored)
    const result = listCrossHostRequests({
      status: (statusParam as import('@/types/governance-request').GovernanceRequestStatus) || undefined,
      type: searchParams.get('type') || undefined,
      hostId: searchParams.get('hostId') || undefined,
      agentId: searchParams.get('agentId') || undefined,
    })
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json(result.data, { status: result.status })
  } catch (err) {
    console.error('[Governance Requests] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
