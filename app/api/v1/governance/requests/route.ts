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
import { isValidUuid } from '@/lib/validation'

export const dynamic = 'force-dynamic'

// NT-015: Moved const declarations above POST to follow convention of declaring constants before usage
/** Valid GovernanceRequestStatus values for query param validation (CC-P4-006) */
const VALID_GOVERNANCE_REQUEST_STATUSES = new Set([
  'pending', 'remote-approved', 'local-approved', 'dual-approved', 'executed', 'rejected',
])

/** Valid GovernanceRequestType values for query param validation (NT-001) */
const VALID_GOVERNANCE_REQUEST_TYPES = new Set([
  'add-to-team', 'remove-from-team', 'assign-cos', 'remove-cos',
  'transfer-agent', 'create-agent', 'delete-agent', 'configure-agent',
])

/** Valid AgentRole values for requestedByRole validation (SF-001) */
const VALID_REQUESTED_BY_ROLES = new Set(['manager', 'chief-of-staff', 'member'])

/** Hostname format: alphanumeric start/end, allows dots/hyphens/underscores, 1-253 chars (NT-001, SF-002) */
const HOSTNAME_RE = /^[a-zA-Z0-9]([a-zA-Z0-9._-]{0,251}[a-zA-Z0-9])?$/

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  // Determine if this is a remote receive (fromHostId present) or local submission
  if (body?.fromHostId) {
    try {
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

      // SF-028: Validate body.request is a non-null object before passing to service
      if (!body.request || typeof body.request !== 'object' || Array.isArray(body.request)) {
        return NextResponse.json({ error: 'Missing or invalid request: must be an object' }, { status: 400 })
      }
      const result = await receiveCrossHostRequest(body.fromHostId, body.request)
      if (result.error) {
        return NextResponse.json({ error: result.error }, { status: result.status })
      }
      return NextResponse.json(result.data, { status: result.status })
    } catch (err) {
      console.error('[Governance Requests] POST remote-receive error:', err)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
  }

  // SF-055: Wrap local submission validation in try-catch to prevent unhandled errors
  try {
    // SF-007: Validate required fields before passing to submitCrossHostRequest
    if (!body.type || typeof body.type !== 'string') {
      return NextResponse.json({ error: 'Missing required field: type' }, { status: 400 })
    }
    if (!body.password || typeof body.password !== 'string') {
      return NextResponse.json({ error: 'Missing required field: password' }, { status: 400 })
    }
    if (!body.targetHostId || typeof body.targetHostId !== 'string') {
      return NextResponse.json({ error: 'Missing required field: targetHostId' }, { status: 400 })
    }
    if (!body.requestedBy || typeof body.requestedBy !== 'string') {
      return NextResponse.json({ error: 'Missing required field: requestedBy' }, { status: 400 })
    }
    // SF-001: Validate requestedByRole against known AgentRole values
    if (!body.requestedByRole || !VALID_REQUESTED_BY_ROLES.has(body.requestedByRole)) {
      return NextResponse.json(
        { error: `Invalid or missing requestedByRole. Must be one of: ${[...VALID_REQUESTED_BY_ROLES].join(', ')}` },
        { status: 400 }
      )
    }
    // SF-001: Validate payload is an object containing at least agentId as a string
    if (!body.payload || typeof body.payload !== 'object' || Array.isArray(body.payload)) {
      return NextResponse.json({ error: 'Missing or invalid payload: must be an object' }, { status: 400 })
    }
    if (!body.payload.agentId || typeof body.payload.agentId !== 'string') {
      return NextResponse.json({ error: 'Missing or invalid payload.agentId: must be a string' }, { status: 400 })
    }

    // NT-034: body fields validated above (type, password, targetHostId, requestedBy, requestedByRole, payload);
    // submitCrossHostRequest performs additional domain-level validation internally.
    const result = await submitCrossHostRequest(body)
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json(result.data, { status: result.status })
  } catch (err) {
    console.error('[Governance Requests] POST local-submission error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const searchParams = request.nextUrl.searchParams
  // CC-P4-006: Validate status param against known values before passing through
  const statusParam = searchParams.get('status')
  if (statusParam && !VALID_GOVERNANCE_REQUEST_STATUSES.has(statusParam)) {
    return NextResponse.json(
      // SF-057: Truncate reflected query param values to max 50 chars to limit reflected content
      { error: `Invalid status value '${statusParam.slice(0, 50)}'. Must be one of: ${[...VALID_GOVERNANCE_REQUEST_STATUSES].join(', ')}` },
      { status: 400 }
    )
  }
  // NT-001: Validate type param against known GovernanceRequestType values
  const typeParam = searchParams.get('type')
  if (typeParam && !VALID_GOVERNANCE_REQUEST_TYPES.has(typeParam)) {
    return NextResponse.json(
      // SF-057: Truncate reflected query param values to max 50 chars to limit reflected content
      { error: `Invalid type value '${typeParam.slice(0, 50)}'. Must be one of: ${[...VALID_GOVERNANCE_REQUEST_TYPES].join(', ')}` },
      { status: 400 }
    )
  }
  // SF-008: Validate agentId (UUID) and hostId (hostname) format before passing to filter
  const hostId = searchParams.get('hostId') || undefined
  const agentId = searchParams.get('agentId') || undefined
  if (agentId && !isValidUuid(agentId)) {
    return NextResponse.json({ error: 'Invalid agentId format' }, { status: 400 })
  }
  // hostId is a hostname (e.g. "macbook-pro"), not a UUID -- validate as safe hostname
  if (hostId && !HOSTNAME_RE.test(hostId)) {
    return NextResponse.json({ error: 'Invalid hostId format' }, { status: 400 })
  }
  try {
    // SF-024: Pass type filter through to listCrossHostRequests (was silently ignored)
    const result = listCrossHostRequests({
      status: (statusParam as import('@/types/governance-request').GovernanceRequestStatus) || undefined,
      type: (typeParam as import('@/types/governance-request').GovernanceRequestType) || undefined,
      hostId,
      agentId,
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
