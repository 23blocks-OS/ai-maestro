/**
 * Reject Cross-Host Governance Request
 *
 * POST /api/v1/governance/requests/:id/reject
 *
 * Supports two auth modes:
 * 1. Local rejection: requires { rejectorAgentId, password } in body
 * 2. Remote host notification (SR-P4-001): host-signature auth via X-Host-Id/X-Host-Signature/X-Host-Timestamp headers
 */

import { NextRequest, NextResponse } from 'next/server'
import { rejectCrossHostRequest, receiveRemoteRejection } from '@/services/cross-host-governance-service'
import { getHosts } from '@/lib/hosts-config'
import { verifyHostAttestation } from '@/lib/host-keys'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params

    let body
    try { body = await request.json() } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    // SR-P4-001: Accept host-signature auth as alternative for remote rejection notifications
    const hostSignature = request.headers.get('X-Host-Signature')
    const hostTimestamp = request.headers.get('X-Host-Timestamp')
    const hostId = request.headers.get('X-Host-Id')
    if (hostSignature && hostTimestamp && hostId) {
      // Remote host rejection notification — verify host signature instead of password
      const hosts = getHosts()
      const knownHost = hosts.find(h => h.id === hostId)
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
      if (!body?.rejectorAgentId) {
        return NextResponse.json({ error: 'Missing required field: rejectorAgentId' }, { status: 400 })
      }
      const result = await receiveRemoteRejection(id, hostId, body.rejectorAgentId, body.reason)
      return NextResponse.json(result.data ?? { error: result.error }, { status: result.status })
    }

    // Local rejection — requires password
    if (!body?.rejectorAgentId || !body?.password) {
      return NextResponse.json({ error: 'Missing required fields: rejectorAgentId, password' }, { status: 400 })
    }

    const result = await rejectCrossHostRequest(id, body.rejectorAgentId, body.password, body.reason)
    return NextResponse.json(result.data ?? { error: result.error }, { status: result.status })
  } catch (err) {
    return NextResponse.json({ error: `Internal server error: ${(err as Error).message}` }, { status: 500 })
  }
}
