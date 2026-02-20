/**
 * Governance Service
 *
 * Pure business logic for governance endpoints.
 * API routes become thin wrappers that call these functions.
 *
 * Covers:
 *   GET    /api/governance                          -> getGovernanceConfig
 *   POST   /api/governance/manager                  -> setManagerRole
 *   POST   /api/governance/password                 -> setGovernancePassword
 *   GET    /api/governance/reachable                -> getReachableAgents
 *   GET    /api/governance/transfers                -> listTransferRequests
 *   POST   /api/governance/transfers                -> createTransferReq
 *   POST   /api/governance/transfers/[id]/resolve   -> resolveTransferReq
 */

import { loadGovernance, verifyPassword, setManager, removeManager, setPassword, isManager, isChiefOfStaffAnywhere, getManagerId } from '@/lib/governance'
import { getAgent, loadAgents } from '@/lib/agent-registry'
import { checkRateLimit, recordFailure, resetRateLimit } from '@/lib/rate-limit'
import { checkMessageAllowed } from '@/lib/message-filter'
import { loadTransfers, createTransferRequest, getTransferRequest, resolveTransferRequest, revertTransferToPending, getPendingTransfersForAgent } from '@/lib/transfer-registry'
import { loadTeams, saveTeams, TeamValidationException } from '@/lib/team-registry'
import { notifyAgent } from '@/lib/notification-service'
import { acquireLock } from '@/lib/file-lock'
import { isValidUuid } from '@/lib/validation'

// Re-use the ServiceResult type pattern
export interface ServiceResult<T> {
  data?: T
  error?: string
  status: number
  headers?: Record<string, string>
}

// ---------------------------------------------------------------------------
// GET /api/governance
// ---------------------------------------------------------------------------
export function getGovernanceConfig(): ServiceResult<{
  hasPassword: boolean
  hasManager: boolean
  managerId: string | null
  managerName: string | null
}> {
  const config = loadGovernance()
  const managerName = config.managerId ? getAgent(config.managerId)?.name || null : null
  return {
    data: {
      hasPassword: !!config.passwordHash,
      hasManager: !!config.managerId,
      managerId: config.managerId ?? null,
      managerName,
    },
    status: 200,
  }
}

// ---------------------------------------------------------------------------
// POST /api/governance/manager
// ---------------------------------------------------------------------------
export async function setManagerRole(params: {
  agentId?: string | null
  password?: string
}): Promise<ServiceResult<{ success: boolean; managerId?: string | null; managerName?: string }>> {
  const { agentId, password } = params

  if (!password || typeof password !== 'string') {
    return { error: 'Governance password is required', status: 400 }
  }

  const config = loadGovernance()
  if (!config.passwordHash) {
    return { error: 'Governance password not set. Set a password first via POST /api/governance/password', status: 400 }
  }

  const rateCheck = checkRateLimit('governance-manager-auth')
  if (!rateCheck.allowed) {
    return { error: `Too many failed password attempts. Try again in ${Math.ceil(rateCheck.retryAfterMs / 1000)}s`, status: 429 }
  }

  if (!(await verifyPassword(password))) {
    recordFailure('governance-manager-auth')
    return { error: 'Invalid governance password', status: 401 }
  }
  resetRateLimit('governance-manager-auth')

  // agentId === null means "remove manager"
  if (agentId === null) {
    await removeManager()
    return { data: { success: true, managerId: null }, status: 200 }
  }

  if (typeof agentId !== 'string' || !agentId.trim()) {
    return { error: 'agentId must be a non-empty string or null', status: 400 }
  }

  const agent = getAgent(agentId)
  if (!agent) {
    return { error: `Agent '${agentId}' not found`, status: 404 }
  }

  await setManager(agentId)
  return { data: { success: true, managerId: agentId, managerName: agent.name || agent.alias }, status: 200 }
}

// ---------------------------------------------------------------------------
// POST /api/governance/password
// ---------------------------------------------------------------------------
export async function setGovernancePassword(params: {
  password?: string
  currentPassword?: string
}): Promise<ServiceResult<{ success: boolean }>> {
  const { password, currentPassword } = params

  if (!password || typeof password !== 'string' || password.length < 6) {
    return { error: 'Password must be at least 6 characters', status: 400 }
  }
  if (password.length > 72) {
    return { error: 'Password must not exceed 72 characters (bcrypt limit)', status: 400 }
  }

  const config = loadGovernance()

  // If a password already exists, require current password for change
  if (config.passwordHash) {
    const rateCheck = checkRateLimit('governance-password-change')
    if (!rateCheck.allowed) {
      return { error: `Too many failed password attempts. Try again in ${Math.ceil(rateCheck.retryAfterMs / 1000)}s`, status: 429 }
    }

    if (!currentPassword || typeof currentPassword !== 'string') {
      recordFailure('governance-password-change')
      return { error: 'Invalid current password', status: 400 }
    }
    if (!(await verifyPassword(currentPassword))) {
      recordFailure('governance-password-change')
      return { error: 'Invalid current password', status: 401 }
    }
    resetRateLimit('governance-password-change')
  }

  await setPassword(password)
  const isChange = !!config.passwordHash
  if (isChange) {
    console.log('[governance] Password changed at', new Date().toISOString())
  } else {
    console.log('[governance] Password set at', new Date().toISOString())
  }

  return { data: { success: true }, status: 200 }
}

// ---------------------------------------------------------------------------
// GET /api/governance/reachable?agentId=...
// ---------------------------------------------------------------------------
const reachableCache = new Map<string, { ids: string[]; expiresAt: number }>()
const CACHE_TTL_MS = 5_000

export function getReachableAgents(agentId: string | null): ServiceResult<{ reachableAgentIds: string[] }> {
  if (!agentId) {
    return { error: 'agentId query parameter is required', status: 400 }
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(agentId)) {
    return { error: 'Invalid agentId format', status: 400 }
  }

  // Check cache first
  const cached = reachableCache.get(agentId)
  if (cached && Date.now() < cached.expiresAt) {
    return { data: { reachableAgentIds: cached.ids }, status: 200 }
  }

  const allAgents = loadAgents()
  const reachableAgentIds: string[] = []

  for (const agent of allAgents) {
    if (agent.id === agentId) continue
    if (agent.deletedAt) continue

    const result = checkMessageAllowed({
      senderAgentId: agentId,
      recipientAgentId: agent.id,
    })

    if (result.allowed) {
      reachableAgentIds.push(agent.id)
    }
  }

  reachableCache.set(agentId, { ids: reachableAgentIds, expiresAt: Date.now() + CACHE_TTL_MS })

  // Evict stale entries
  const now = Date.now()
  for (const [key, entry] of reachableCache) {
    if (now >= entry.expiresAt) reachableCache.delete(key)
  }

  return { data: { reachableAgentIds }, status: 200 }
}

// ---------------------------------------------------------------------------
// GET /api/governance/transfers?teamId=...&agentId=...&status=...
// ---------------------------------------------------------------------------
export function listTransferRequests(query: {
  teamId?: string | null
  agentId?: string | null
  status?: string | null
}): ServiceResult<{ requests: any[] }> {
  const { teamId, agentId, status } = query

  if (status && !['pending', 'approved', 'rejected'].includes(status)) {
    return { error: 'Invalid status filter', status: 400 }
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

  return { data: { requests }, status: 200 }
}

// ---------------------------------------------------------------------------
// POST /api/governance/transfers
// ---------------------------------------------------------------------------
export async function createTransferReq(params: {
  agentId?: string
  fromTeamId?: string
  toTeamId?: string
  requestedBy?: string
  note?: string
  rejectReason?: string
  resolution?: string
}): Promise<ServiceResult<{ success: boolean; request: any }>> {
  const { agentId, fromTeamId, toTeamId, requestedBy, note } = params

  if (!agentId || !fromTeamId || !toTeamId || !requestedBy) {
    return { error: 'agentId, fromTeamId, toTeamId, and requestedBy are required', status: 400 }
  }

  if (typeof agentId !== 'string' || typeof fromTeamId !== 'string' || typeof toTeamId !== 'string' || typeof requestedBy !== 'string') {
    return { error: 'agentId, fromTeamId, toTeamId, and requestedBy must be strings', status: 400 }
  }

  if (!isValidUuid(agentId) || !isValidUuid(fromTeamId) || !isValidUuid(toTeamId) || !isValidUuid(requestedBy)) {
    return { error: 'Invalid UUID format', status: 400 }
  }

  // Only MANAGER or Chief-of-Staff can request transfers
  if (!isManager(requestedBy) && !isChiefOfStaffAnywhere(requestedBy)) {
    return { error: 'Only MANAGER or Chief-of-Staff can request transfers', status: 403 }
  }

  if (note !== undefined && note !== null) {
    if (typeof note !== 'string') return { error: 'note must be a string', status: 400 }
    if (note.length > 1000) return { error: 'note must not exceed 1000 characters', status: 400 }
  }

  if (params.rejectReason !== undefined && params.rejectReason !== null) {
    if (typeof params.rejectReason !== 'string' || params.rejectReason.length > 500) {
      return { error: 'rejectReason must be a string of at most 500 characters', status: 400 }
    }
  }
  if (params.resolution !== undefined && params.resolution !== null) {
    if (typeof params.resolution !== 'string' || params.resolution.length > 500) {
      return { error: 'resolution must be a string of at most 500 characters', status: 400 }
    }
  }

  if (fromTeamId === toTeamId) {
    return { error: 'Source and destination teams must be different', status: 400 }
  }

  const teams = loadTeams()
  const fromTeam = teams.find(t => t.id === fromTeamId)
  if (!fromTeam) return { error: 'Source team not found', status: 404 }
  if (!fromTeam.agentIds.includes(agentId)) return { error: 'Agent is not in the source team', status: 400 }

  const toTeam = teams.find(t => t.id === toTeamId)
  if (!toTeam) return { error: 'Destination team not found', status: 404 }

  // Cannot transfer the Chief-of-Staff out of their team
  if (fromTeam.chiefOfStaffId === agentId) {
    return { error: 'Cannot transfer the Chief-of-Staff out of their team \u2014 remove COS role first', status: 400 }
  }

  // Transfer requests are only meaningful for closed teams
  if (fromTeam.type !== 'closed') {
    return { error: 'Transfer requests are only needed for closed teams. Use direct team update for open teams.', status: 400 }
  }

  // Check for duplicate pending transfer
  const pending = getPendingTransfersForAgent(agentId)
  const duplicate = pending.find(r => r.fromTeamId === fromTeamId && r.toTeamId === toTeamId)
  if (duplicate) {
    return { error: 'A transfer request for this agent between these teams already exists', status: 409 }
  }

  const transferRequest = await createTransferRequest({ agentId, fromTeamId, toTeamId, requestedBy, note })
  return { data: { success: true, request: transferRequest }, status: 201 }
}

// ---------------------------------------------------------------------------
// POST /api/governance/transfers/[id]/resolve
// ---------------------------------------------------------------------------
export async function resolveTransferReq(
  transferId: string,
  params: { action?: string; resolvedBy?: string; rejectReason?: string }
): Promise<ServiceResult<{ success: boolean; request: any }>> {
  if (!isValidUuid(transferId)) {
    return { error: 'Invalid transfer ID format', status: 400 }
  }

  const action = params.action
  const resolvedBy = typeof params.resolvedBy === 'string' ? params.resolvedBy : ''
  const rejectReason = typeof params.rejectReason === 'string' ? params.rejectReason : undefined

  if (!action || !resolvedBy) {
    return { error: 'action and resolvedBy are required', status: 400 }
  }
  if (!isValidUuid(resolvedBy)) {
    return { error: 'Invalid resolvedBy UUID format', status: 400 }
  }
  if (action !== 'approve' && action !== 'reject') {
    return { error: 'action must be "approve" or "reject"', status: 400 }
  }

  const transferReq = getTransferRequest(transferId)
  if (!transferReq) return { error: 'Transfer request not found', status: 404 }
  if (transferReq.status !== 'pending') return { error: 'Transfer request is already resolved', status: 409 }

  const releaseLock = await acquireLock('teams')
  try {
    const teams = loadTeams()
    const fromTeam = teams.find(t => t.id === transferReq.fromTeamId)
    if (!fromTeam) return { error: 'Source team not found', status: 404 }

    // Only the source team COS or global MANAGER can resolve
    const isSourceCOS = fromTeam.chiefOfStaffId === resolvedBy
    const isGlobalManager = isManager(resolvedBy)

    if (!isSourceCOS && !isGlobalManager) {
      return { error: 'Only the source team COS or MANAGER can resolve this transfer', status: 403 }
    }

    const toTeam = teams.find(t => t.id === transferReq.toTeamId)

    if (action === 'approve') {
      if (!toTeam) return { error: 'Destination team no longer exists \u2014 transfer cannot be completed', status: 404 }

      // Check closed-team constraint: normal agents can only be in one closed team
      const managerId = getManagerId()
      if (toTeam.type === 'closed') {
        const agentId = transferReq.agentId
        const isPrivileged = agentId === managerId || isChiefOfStaffAnywhere(agentId)
        if (!isPrivileged) {
          const otherClosedTeam = teams.find(t =>
            t.type === 'closed' && t.id !== fromTeam.id && t.id !== toTeam.id && t.agentIds.includes(agentId)
          )
          if (otherClosedTeam) {
            return { error: 'Agent is already in another closed team \u2014 normal agents can only be in one closed team', status: 409 }
          }
        }
      }
    }

    const resolved = await resolveTransferRequest(transferId, action === 'approve' ? 'approved' : 'rejected', resolvedBy, rejectReason)
    if (!resolved) return { error: 'Transfer already resolved', status: 409 }

    // If approved, move the agent between teams
    if (action === 'approve') {
      const fromIdx = teams.findIndex(t => t.id === fromTeam.id)
      if (fromIdx !== -1) {
        teams[fromIdx] = {
          ...teams[fromIdx],
          agentIds: teams[fromIdx].agentIds.filter(aid => aid !== transferReq.agentId),
          updatedAt: new Date().toISOString(),
        }
      }

      const toIdx = teams.findIndex(t => t.id === toTeam!.id)
      if (toIdx !== -1 && !teams[toIdx].agentIds.includes(transferReq.agentId)) {
        teams[toIdx] = {
          ...teams[toIdx],
          agentIds: [...teams[toIdx].agentIds, transferReq.agentId],
          updatedAt: new Date().toISOString(),
        }
      }

      const saved = saveTeams(teams)
      if (!saved) {
        await revertTransferToPending(transferId)
        return { error: 'Failed to save team changes after transfer approval \u2014 transfer reverted to pending', status: 500 }
      }
    }

    // Notify agent about transfer resolution (fire-and-forget, outside lock)
    const affectedAgent = getAgent(transferReq.agentId)
    if (affectedAgent && fromTeam) {
      const resolverAgent = getAgent(resolvedBy)
      const resolverName = resolverAgent?.name || resolvedBy
      const statusText = action === 'approve' ? 'APPROVED' : 'REJECTED'
      const teamInfo = action === 'approve'
        ? `${fromTeam.name} \u2192 ${toTeam?.name || 'unknown'}`
        : `from ${fromTeam.name}`
      const subject = `Transfer ${statusText}: ${teamInfo}`

      notifyAgent({
        agentId: affectedAgent.id,
        agentName: affectedAgent.name,
        fromName: resolverName,
        subject,
        messageId: transferId,
        priority: 'high',
        messageType: 'transfer-resolution',
      }).catch((err) => {
        console.error(`[TransferResolve] Failed to notify agent ${affectedAgent.name}:`, err)
      })
    }

    return { data: { success: true, request: resolved }, status: 200 }
  } finally {
    releaseLock()
  }
}
