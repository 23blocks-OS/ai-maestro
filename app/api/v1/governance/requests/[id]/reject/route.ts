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
import { isValidUuid } from '@/lib/validation'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params

    // MF-014: Validate request ID is a valid UUID before passing to service
    if (!isValidUuid(id)) {
      return NextResponse.json({ error: 'Invalid request ID format' }, { status: 400 })
    }

    let body
    try { body = await request.json() } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    // SF-030: Routing decision — two auth modes exist for reject:
    // 1. Remote host notification: host-signature headers present (Ed25519-signed, no password needed)
    // 2. Local rejection: password-based auth (no host-signature headers)
    // If both are present, prefer host-signature auth but log a warning as it indicates a misconfigured client.
    const hostSignature = request.headers.get('X-Host-Signature')
    const hostTimestamp = request.headers.get('X-Host-Timestamp')
    const hostId = request.headers.get('X-Host-Id')

    if (hostSignature && hostTimestamp && hostId) {
      // SF-030: Warn if both password and host-signature are present (indicates misconfigured client)
      if (body?.password) {
        console.warn(`[Governance Reject] Request ${id}: both password and host-signature auth present. Using host-signature.`)
      }
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
      // SF-025: Validate rejectorAgentId is a string and valid UUID (remote path)
      if (typeof body.rejectorAgentId !== 'string' || !isValidUuid(body.rejectorAgentId)) {
        return NextResponse.json({ error: 'Invalid rejectorAgentId format' }, { status: 400 })
      }
      const result = await receiveRemoteRejection(id, hostId, body.rejectorAgentId, body.reason)
      return NextResponse.json(result.data ?? { error: result.error }, { status: result.status })
    }

    // Local rejection — requires password
    if (!body?.rejectorAgentId || !body?.password) {
      return NextResponse.json({ error: 'Missing required fields: rejectorAgentId, password' }, { status: 400 })
    }

    // SF-025: Validate rejectorAgentId is a string and valid UUID (local path)
    if (typeof body.rejectorAgentId !== 'string' || !isValidUuid(body.rejectorAgentId)) {
      return NextResponse.json({ error: 'Invalid rejectorAgentId format' }, { status: 400 })
    }

    const result = await rejectCrossHostRequest(id, body.rejectorAgentId, body.password, body.reason)
    return NextResponse.json(result.data ?? { error: result.error }, { status: result.status })
  } catch (err) {
    // MF-012: Log full error internally, return generic message to prevent information disclosure
    console.error('[Governance Reject] POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
