/**
 * Cross-Host Governance Service (Layer 3)
 *
 * Orchestrates governance operations that span host boundaries in the mesh network.
 * Local callers submit requests; remote hosts receive, approve, reject, or execute them.
 *
 * Request lifecycle:
 *   submit (local) -> receive (remote) -> approve/reject (either side) -> execute (target)
 *
 * All public functions return ServiceResult<T> for uniform error handling by API routes.
 */

import type { ServiceResult } from '@/types/service'
import type { GovernanceRequest, GovernanceRequestType, GovernanceRequestStatus, GovernanceRequestPayload } from '@/types/governance-request'
import type { AgentRole } from '@/types/agent'
import { verifyPassword, isManager, isChiefOfStaffAnywhere, getManagerId } from '@/lib/governance'
import { getAgent } from '@/lib/agent-registry'
import { getHosts, getSelfHostId, isSelf, getHostById } from '@/lib/hosts-config'
import {
  createGovernanceRequest,
  getGovernanceRequest,
  listGovernanceRequests,
  approveGovernanceRequest,
  rejectGovernanceRequest,
  loadGovernanceRequests,
  saveGovernanceRequests,
} from '@/lib/governance-request-registry'
import { broadcastGovernanceSync } from '@/lib/governance-sync'
import { signHostAttestation } from '@/lib/host-keys'
import { checkRateLimit, recordFailure, resetRateLimit } from '@/lib/rate-limit'
import { withLock } from '@/lib/file-lock'
import { loadTeams, saveTeams } from '@/lib/team-registry'
import { shouldAutoApprove } from '@/lib/manager-trust'

/** Timeout for outbound HTTP requests to peer hosts (milliseconds) -- matches governance-sync.ts */
const FETCH_TIMEOUT_MS = 5000

/** Log prefix for all cross-host governance operations */
const LOG_PREFIX = '[cross-host-governance]'

// ---------------------------------------------------------------------------
// 1. submitCrossHostRequest -- local caller initiates a cross-host operation
// ---------------------------------------------------------------------------

export async function submitCrossHostRequest(params: {
  type: GovernanceRequestType
  targetHostId: string
  requestedBy: string
  requestedByRole: AgentRole
  payload: GovernanceRequestPayload
  password: string
  note?: string
}): Promise<ServiceResult<GovernanceRequest>> {
  // CC-006: Rate-limit governance password attempts to prevent brute-force attacks
  const rateCheck = checkRateLimit('cross-host-gov-submit')
  if (!rateCheck.allowed) {
    const retryAfterSeconds = Math.ceil(rateCheck.retryAfterMs / 1000)
    return { error: `Too many failed attempts. Try again in ${retryAfterSeconds}s`, status: 429 }
  }

  // Verify governance password
  if (!(await verifyPassword(params.password))) {
    recordFailure('cross-host-gov-submit')
    return { error: 'Invalid governance password', status: 401 }
  }
  resetRateLimit('cross-host-gov-submit')

  // Validate that the requesting agent exists locally
  const agent = getAgent(params.requestedBy)
  if (!agent) {
    return { error: `Agent '${params.requestedBy}' not found in local registry`, status: 404 }
  }

  // Validate that requestedByRole matches the agent's actual role
  if (params.requestedByRole === 'manager' && !isManager(params.requestedBy)) {
    return { error: `Agent '${params.requestedBy}' is not the MANAGER`, status: 403 }
  }
  if (params.requestedByRole === 'chief-of-staff' && !isChiefOfStaffAnywhere(params.requestedBy)) {
    return { error: `Agent '${params.requestedBy}' is not a Chief of Staff`, status: 403 }
  }

  // Validate targetHostId is a known peer host (not self)
  const hosts = getHosts()
  const targetHost = hosts.find(h => h.id === params.targetHostId)
  if (!targetHost) {
    return { error: `Unknown target host '${params.targetHostId}'`, status: 404 }
  }
  if (isSelf(params.targetHostId)) {
    return { error: 'Target host cannot be self -- use local governance APIs for same-host operations', status: 400 }
  }

  // SR-007: Only allow implemented cross-host request types
  const IMPLEMENTED_TYPES: GovernanceRequestType[] = ['add-to-team', 'remove-from-team', 'assign-cos', 'remove-cos', 'transfer-agent']
  if (!IMPLEMENTED_TYPES.includes(params.type)) {
    return { error: `Request type '${params.type}' is not yet implemented`, status: 400 }
  }

  // Create local record with sourceHostId = this host
  const selfHostId = getSelfHostId()
  const request = await createGovernanceRequest({
    type: params.type,
    sourceHostId: selfHostId,
    targetHostId: params.targetHostId,
    requestedBy: params.requestedBy,
    requestedByRole: params.requestedByRole,
    payload: params.payload,
    note: params.note,
  })

  // Fire-and-forget: send the request to the target host
  sendRequestToRemoteHost(targetHost.url, request).catch((err) => {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`${LOG_PREFIX} Failed to send request ${request.id} to ${params.targetHostId}: ${msg}`)
  })

  return { data: request, status: 201 }
}

// ---------------------------------------------------------------------------
// 2. receiveCrossHostRequest -- remote host receives a request from a peer
// ---------------------------------------------------------------------------

export async function receiveCrossHostRequest(
  fromHostId: string,
  request: GovernanceRequest,
): Promise<ServiceResult<{ ok: boolean; requestId: string }>> {
  // Validate fromHostId is a known host
  const hosts = getHosts()
  const senderHost = hosts.find(h => h.id === fromHostId)
  if (!senderHost) {
    return { error: `Unknown sender host '${fromHostId}'`, status: 403 }
  }

  // Validate required request fields
  if (!request.id || !request.type || !request.payload?.agentId) {
    return { error: 'Invalid governance request: missing id, type, or payload.agentId', status: 400 }
  }

  // CC-P1-002: Validate that request.type is a recognized GovernanceRequestType
  const VALID_REQUEST_TYPES: GovernanceRequestType[] = [
    'add-to-team', 'remove-from-team', 'assign-cos', 'remove-cos',
    'transfer-agent', 'create-agent', 'delete-agent', 'configure-agent',
  ]
  if (!VALID_REQUEST_TYPES.includes(request.type)) {
    return { error: `Invalid governance request type: '${request.type}'`, status: 400 }
  }

  // CC-P1-002: Validate requestedByRole is a valid AgentRole
  const VALID_ROLES: AgentRole[] = ['manager', 'chief-of-staff', 'member']
  if (!request.requestedByRole || !VALID_ROLES.includes(request.requestedByRole)) {
    return { error: `Invalid requestedByRole: '${request.requestedByRole}'`, status: 400 }
  }

  // CC-008: Validate that the request's sourceHostId matches the actual sender
  if (request.sourceHostId !== fromHostId) {
    return { error: 'Source host ID in request does not match sender', status: 400 }
  }

  // Store locally using the same ID from the remote request
  // Re-create via createGovernanceRequest to get proper file-locking and persistence
  // Note: createGovernanceRequest generates a new UUID; we store the remote request directly instead
  await withLock('governance-requests', () => {
    const file = loadGovernanceRequests()

    // Prevent duplicate: skip if a request with this ID already exists
    const existing = file.requests.find(r => r.id === request.id)
    if (existing) {
      console.log(`${LOG_PREFIX} Request ${request.id} already exists locally, skipping duplicate`)
      return
    }

    // CC-P1-002: Force status to 'pending' and clear approvals regardless of what remote sent.
    // A malicious peer could send status:'executed' with pre-filled approvals to bypass the
    // dual-approval workflow. We always start received requests as 'pending' with empty approvals.
    file.requests.push({
      ...request,
      status: 'pending' as GovernanceRequestStatus,
      approvals: {},
      updatedAt: new Date().toISOString(),
    })
    saveGovernanceRequests(file)
  })

  console.log(`${LOG_PREFIX} Received request ${request.id} (type=${request.type}) from host ${fromHostId}`)

  // Layer 4: Auto-approve if the requesting manager is in the trust registry
  if (shouldAutoApprove(request)) {
    console.log(`${LOG_PREFIX} Auto-approving request ${request.id} from trusted manager on host ${fromHostId}`)
    // Auto-approve as targetManager (we are the target host)
    const localManagerId = getManagerId()
    if (localManagerId) {
      const approvedRequest = await approveGovernanceRequest(request.id, localManagerId, 'targetManager')
      if (approvedRequest?.status === 'executed') {
        await performRequestExecution(approvedRequest)
      }
    }
  }

  return {
    data: { ok: true, requestId: request.id },
    status: 200,
  }
}

// ---------------------------------------------------------------------------
// 3. approveCrossHostRequest -- approve a pending governance request
// ---------------------------------------------------------------------------

export async function approveCrossHostRequest(
  requestId: string,
  approverAgentId: string,
  password: string,
): Promise<ServiceResult<GovernanceRequest>> {
  // CC-006: Rate-limit governance password attempts to prevent brute-force attacks
  const rateCheck = checkRateLimit('cross-host-gov-approve')
  if (!rateCheck.allowed) {
    const retryAfterSeconds = Math.ceil(rateCheck.retryAfterMs / 1000)
    return { error: `Too many failed attempts. Try again in ${retryAfterSeconds}s`, status: 429 }
  }

  // Verify governance password
  if (!(await verifyPassword(password))) {
    recordFailure('cross-host-gov-approve')
    return { error: 'Invalid governance password', status: 401 }
  }
  resetRateLimit('cross-host-gov-approve')

  // Load the request
  const request = getGovernanceRequest(requestId)
  if (!request) {
    return { error: `Governance request '${requestId}' not found`, status: 404 }
  }

  // Determine approverType based on the approver's role and which host they are on
  const selfHostId = getSelfHostId()
  const isOnSourceHost = request.sourceHostId === selfHostId
  const isOnTargetHost = request.targetHostId === selfHostId

  // CC-010: Reject if this host is neither source nor target of the request
  if (!isOnSourceHost && !isOnTargetHost) {
    return { error: 'This host is neither source nor target of this request', status: 400 }
  }

  let approverType: 'sourceCOS' | 'sourceManager' | 'targetCOS' | 'targetManager'

  if (isManager(approverAgentId)) {
    // Approver is the MANAGER — host role is guaranteed by the guard above
    approverType = isOnSourceHost ? 'sourceManager' : 'targetManager'
  } else if (isChiefOfStaffAnywhere(approverAgentId)) {
    // Approver is a COS — host role is guaranteed by the guard above
    approverType = isOnSourceHost ? 'sourceCOS' : 'targetCOS'
  } else {
    return { error: 'Only MANAGER or Chief of Staff can approve governance requests', status: 403 }
  }

  // Record the approval and update status
  const updated = await approveGovernanceRequest(requestId, approverAgentId, approverType)
  if (!updated) {
    return { error: `Failed to approve request '${requestId}'`, status: 500 }
  }

  // If both managers approved and status became 'executed', perform the actual mutation
  if (updated.status === 'executed') {
    await performRequestExecution(updated)
  }

  return { data: updated, status: 200 }
}

// ---------------------------------------------------------------------------
// 4. rejectCrossHostRequest -- reject a pending governance request
// ---------------------------------------------------------------------------

export async function rejectCrossHostRequest(
  requestId: string,
  rejectorAgentId: string,
  password: string,
  reason?: string,
): Promise<ServiceResult<GovernanceRequest>> {
  // CC-006: Rate-limit governance password attempts to prevent brute-force attacks
  const rateCheck = checkRateLimit('cross-host-gov-reject')
  if (!rateCheck.allowed) {
    const retryAfterSeconds = Math.ceil(rateCheck.retryAfterMs / 1000)
    return { error: `Too many failed attempts. Try again in ${retryAfterSeconds}s`, status: 429 }
  }

  // Verify governance password
  if (!(await verifyPassword(password))) {
    recordFailure('cross-host-gov-reject')
    return { error: 'Invalid governance password', status: 401 }
  }
  resetRateLimit('cross-host-gov-reject')

  // Validate rejector is MANAGER or COS
  if (!isManager(rejectorAgentId) && !isChiefOfStaffAnywhere(rejectorAgentId)) {
    return { error: 'Only MANAGER or Chief of Staff can reject governance requests', status: 403 }
  }

  // Load the request to check if it originated from another host
  const request = getGovernanceRequest(requestId)
  if (!request) {
    return { error: `Governance request '${requestId}' not found`, status: 404 }
  }

  // Record the rejection
  const updated = await rejectGovernanceRequest(requestId, rejectorAgentId, reason)
  if (!updated) {
    return { error: `Failed to reject request '${requestId}'`, status: 500 }
  }

  // If the request originated from another host, notify the source host (fire-and-forget)
  const selfHostId = getSelfHostId()
  if (request.sourceHostId !== selfHostId) {
    const sourceHost = getHostById(request.sourceHostId)
    if (sourceHost) {
      notifyRemoteHostOfRejection(sourceHost.url, requestId, rejectorAgentId, reason).catch((err) => {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`${LOG_PREFIX} Failed to notify source host ${request.sourceHostId} of rejection: ${msg}`)
      })
    }
  }

  return { data: updated, status: 200 }
}

// ---------------------------------------------------------------------------
// 5. performRequestExecution -- execute the actual team/agent mutation
// ---------------------------------------------------------------------------

async function performRequestExecution(request: GovernanceRequest): Promise<void> {
  console.log(`${LOG_PREFIX} Executing request ${request.id} (type=${request.type})`)

  try {
    // CC-002: Acquire the teams lock for the entire mutation to prevent concurrent corruption
    await withLock('teams', async () => {
      switch (request.type) {
        case 'add-to-team': {
          // Add the agent to the target team
          const teams = loadTeams()
          const team = teams.find(t => t.id === request.payload.teamId)
          if (!team) {
            console.error(`${LOG_PREFIX} Cannot execute add-to-team: team '${request.payload.teamId}' not found`)
            return
          }
          if (!team.agentIds.includes(request.payload.agentId)) {
            team.agentIds.push(request.payload.agentId)
            saveTeams(teams)
          }
          break
        }

        case 'remove-from-team': {
          // Remove the agent from the target team
          const teams = loadTeams()
          const team = teams.find(t => t.id === request.payload.teamId)
          if (!team) {
            console.error(`${LOG_PREFIX} Cannot execute remove-from-team: team '${request.payload.teamId}' not found`)
            return
          }
          team.agentIds = team.agentIds.filter(id => id !== request.payload.agentId)
          saveTeams(teams)
          break
        }

        case 'assign-cos': {
          // Set the chiefOfStaffId on the target team
          const teams = loadTeams()
          const team = teams.find(t => t.id === request.payload.teamId)
          if (!team) {
            console.error(`${LOG_PREFIX} Cannot execute assign-cos: team '${request.payload.teamId}' not found`)
            return
          }
          team.chiefOfStaffId = request.payload.agentId
          // Ensure the COS is also in agentIds (R4.6: COS must be a member)
          if (!team.agentIds.includes(request.payload.agentId)) {
            team.agentIds.push(request.payload.agentId)
          }
          saveTeams(teams)
          break
        }

        case 'remove-cos': {
          // Clear the chiefOfStaffId on the target team
          const teams = loadTeams()
          const team = teams.find(t => t.id === request.payload.teamId)
          if (!team) {
            console.error(`${LOG_PREFIX} Cannot execute remove-cos: team '${request.payload.teamId}' not found`)
            return
          }
          team.chiefOfStaffId = null
          saveTeams(teams)
          break
        }

        case 'transfer-agent': {
          // Move agent between teams: remove from source, add to destination
          const teams = loadTeams()
          const fromTeam = request.payload.fromTeamId ? teams.find(t => t.id === request.payload.fromTeamId) : null
          const toTeam = request.payload.toTeamId ? teams.find(t => t.id === request.payload.toTeamId) : null

          if (fromTeam) {
            fromTeam.agentIds = fromTeam.agentIds.filter(id => id !== request.payload.agentId)
          }
          if (toTeam && !toTeam.agentIds.includes(request.payload.agentId)) {
            toTeam.agentIds.push(request.payload.agentId)
          }
          saveTeams(teams)
          break
        }

        default:
          // Other types (create-agent, delete-agent, configure-agent) are not yet implemented
          console.warn(`${LOG_PREFIX} Request type '${request.type}' execution is not yet implemented`)
          return
      }
    })

    // CC-003: Removed redundant executeGovernanceRequest call — caller already set status to 'executed'

    // Broadcast the governance state change to all peers
    broadcastGovernanceSync('team-updated', { requestId: request.id, type: request.type }).catch(() => {})

    console.log(`${LOG_PREFIX} Successfully executed request ${request.id} (type=${request.type})`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`${LOG_PREFIX} Failed to execute request ${request.id}: ${msg}`)
  }
}

// ---------------------------------------------------------------------------
// 6. listCrossHostRequests -- query stored governance requests with filters
// ---------------------------------------------------------------------------

export function listCrossHostRequests(filter?: {
  status?: GovernanceRequestStatus
  hostId?: string
  agentId?: string
}): ServiceResult<GovernanceRequest[]> {
  const requests = listGovernanceRequests(filter)
  return { data: requests, status: 200 }
}

// ---------------------------------------------------------------------------
// Internal helpers -- fire-and-forget HTTP to peer hosts
// ---------------------------------------------------------------------------

/**
 * Send a governance request to a remote host for processing.
 * Uses the same 5-second timeout pattern as governance-sync.ts.
 */
async function sendRequestToRemoteHost(hostUrl: string, request: GovernanceRequest): Promise<void> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const url = `${hostUrl}/api/v1/governance/requests`
    // Sign the outbound request with this host's Ed25519 key (SR-001)
    const timestamp = new Date().toISOString()
    const signedData = `gov-request|${request.sourceHostId}|${timestamp}`
    const signature = signHostAttestation(signedData)
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Host-Id': request.sourceHostId,
        'X-Host-Timestamp': timestamp,
        'X-Host-Signature': signature,
      },
      body: JSON.stringify({
        fromHostId: request.sourceHostId,
        request,
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      console.error(`${LOG_PREFIX} Remote host returned HTTP ${response.status} for request ${request.id}`)
    }
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Notify a remote host that a governance request was rejected.
 * Fire-and-forget: logs errors but never throws to callers.
 */
async function notifyRemoteHostOfRejection(
  hostUrl: string,
  requestId: string,
  rejectorAgentId: string,
  reason?: string,
): Promise<void> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const url = `${hostUrl}/api/v1/governance/requests/${requestId}/reject`
    // Sign the outbound rejection notification with this host's Ed25519 key (SR-001)
    const selfHost = getSelfHostId()
    const timestamp = new Date().toISOString()
    const signedData = `gov-request|${selfHost}|${timestamp}`
    const signature = signHostAttestation(signedData)
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Host-Id': selfHost,
        'X-Host-Timestamp': timestamp,
        'X-Host-Signature': signature,
      },
      body: JSON.stringify({
        rejectorAgentId,
        reason,
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      console.error(`${LOG_PREFIX} Remote host returned HTTP ${response.status} for rejection notification of ${requestId}`)
    }
  } finally {
    clearTimeout(timeout)
  }
}
