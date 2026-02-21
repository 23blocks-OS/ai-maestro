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

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.json()

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
    const knownHost = hosts.find((h: any) => h.id === hostId)
    if (!knownHost) {
      return NextResponse.json({ error: `Unknown host: ${hostId}` }, { status: 403 })
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
    return NextResponse.json(result.data ?? { error: result.error }, { status: result.status })
  }

  const result = await submitCrossHostRequest(body)
  return NextResponse.json(result.data ?? { error: result.error }, { status: result.status })
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url)
  const result = listCrossHostRequests({
    status: (searchParams.get('status') as import('@/types/governance-request').GovernanceRequestStatus) || undefined,
    hostId: searchParams.get('hostId') || undefined,
    agentId: searchParams.get('agentId') || undefined,
  })
  return NextResponse.json(result.data ?? { error: result.error }, { status: result.status })
}
