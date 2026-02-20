/**
 * Governance Request Registry -- CRUD for cross-host governance requests
 *
 * Storage: ~/.aimaestro/governance-requests.json
 * Follows the same synchronous file I/O + withLock pattern as lib/governance.ts
 */

import fs from 'fs'
import path from 'path'
import os from 'os'
import crypto from 'crypto'
import { withLock } from '@/lib/file-lock'
import type {
  GovernanceRequest,
  GovernanceRequestsFile,
  GovernanceRequestType,
  GovernanceRequestStatus,
  GovernanceRequestPayload,
  GovernanceApproval,
} from '@/types/governance-request'
import { DEFAULT_GOVERNANCE_REQUESTS_FILE } from '@/types/governance-request'
import type { AgentRole } from '@/types/agent'

const AIMAESTRO_DIR = path.join(os.homedir(), '.aimaestro')
const REQUESTS_FILE = path.join(AIMAESTRO_DIR, 'governance-requests.json')

/** Ensure ~/.aimaestro directory exists */
function ensureAimaestroDir() {
  if (!fs.existsSync(AIMAESTRO_DIR)) {
    fs.mkdirSync(AIMAESTRO_DIR, { recursive: true })
  }
}

/** Load governance requests from disk, creating with defaults if missing */
export function loadGovernanceRequests(): GovernanceRequestsFile {
  ensureAimaestroDir()
  if (!fs.existsSync(REQUESTS_FILE)) {
    // First-time initialization: write defaults and return them
    saveGovernanceRequests(DEFAULT_GOVERNANCE_REQUESTS_FILE)
    return { ...DEFAULT_GOVERNANCE_REQUESTS_FILE, requests: [] }
  }
  try {
    const data = fs.readFileSync(REQUESTS_FILE, 'utf-8')
    const parsed: GovernanceRequestsFile = JSON.parse(data)
    return parsed
  } catch (error) {
    // Distinguish read errors from parse errors -- parse errors indicate disk corruption
    if (error instanceof SyntaxError) {
      console.error('[governance-requests] CORRUPTION: governance-requests.json contains invalid JSON -- returning defaults. Manual inspection required:', REQUESTS_FILE)
      // Backup corrupted file before returning defaults to prevent silent data loss
      try {
        const backupPath = REQUESTS_FILE + '.corrupted.' + Date.now()
        fs.copyFileSync(REQUESTS_FILE, backupPath)
        console.error(`[governance-requests] Corrupted file backed up to ${backupPath}`)
      } catch { /* backup is best-effort */ }
      // Heal the corrupted file by writing defaults
      saveGovernanceRequests(DEFAULT_GOVERNANCE_REQUESTS_FILE)
    } else {
      console.error('[governance-requests] Failed to read governance requests:', error)
    }
    return { ...DEFAULT_GOVERNANCE_REQUESTS_FILE, requests: [] }
  }
}

/** Write governance requests to disk using atomic temp-file-then-rename pattern */
export function saveGovernanceRequests(file: GovernanceRequestsFile): void {
  // Fail-fast: let errors propagate to callers (all wrapped in withLock try/catch)
  ensureAimaestroDir()
  // Atomic write: write to temp file then rename to avoid corruption on crash
  const tmpFile = REQUESTS_FILE + '.tmp'
  fs.writeFileSync(tmpFile, JSON.stringify(file, null, 2), 'utf-8')
  fs.renameSync(tmpFile, REQUESTS_FILE)
}

/** Find a governance request by ID, or null if not found */
export function getGovernanceRequest(id: string): GovernanceRequest | null {
  const file = loadGovernanceRequests()
  return file.requests.find((r) => r.id === id) ?? null
}

/** List governance requests with optional filtering by status, hostId, or agentId */
export function listGovernanceRequests(filter?: {
  status?: GovernanceRequestStatus
  hostId?: string
  agentId?: string
}): GovernanceRequest[] {
  const file = loadGovernanceRequests()
  if (!filter) return file.requests

  return file.requests.filter((r) => {
    // Filter by status if specified
    if (filter.status && r.status !== filter.status) return false
    // Filter by hostId: match either source or target host
    if (filter.hostId && r.sourceHostId !== filter.hostId && r.targetHostId !== filter.hostId) return false
    // Filter by agentId: match the payload's agentId or the requestedBy field
    if (filter.agentId && r.payload.agentId !== filter.agentId && r.requestedBy !== filter.agentId) return false
    return true
  })
}

/** Create a new governance request and persist it under the governance-requests lock */
export async function createGovernanceRequest(params: {
  type: GovernanceRequestType
  sourceHostId: string
  targetHostId: string
  requestedBy: string
  requestedByRole: AgentRole
  payload: GovernanceRequestPayload
  note?: string
}): Promise<GovernanceRequest> {
  return withLock('governance-requests', () => {
    const file = loadGovernanceRequests()
    const now = new Date().toISOString()

    const request: GovernanceRequest = {
      id: crypto.randomUUID(),
      type: params.type,
      sourceHostId: params.sourceHostId,
      targetHostId: params.targetHostId,
      requestedBy: params.requestedBy,
      requestedByRole: params.requestedByRole,
      payload: params.payload,
      approvals: {},
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      ...(params.note ? { note: params.note } : {}),
    }

    file.requests.push(request)
    saveGovernanceRequests(file)
    return request
  })
}

/**
 * Add an approval to a governance request and update its status.
 *
 * Approval logic:
 * - If sourceManager AND targetManager both approved -> status = 'executed' (auto-execute)
 * - If only source side approved (sourceCOS or sourceManager) -> status = 'remote-approved'
 * - If only target side approved (targetCOS or targetManager) -> status = 'local-approved'
 */
export async function approveGovernanceRequest(
  requestId: string,
  approverAgentId: string,
  approverType: 'sourceCOS' | 'sourceManager' | 'targetCOS' | 'targetManager',
): Promise<GovernanceRequest | null> {
  return withLock('governance-requests', () => {
    const file = loadGovernanceRequests()
    const request = file.requests.find((r) => r.id === requestId)
    if (!request) return null

    // Cannot approve an already rejected or executed request
    if (request.status === 'rejected' || request.status === 'executed') return request

    const now = new Date().toISOString()

    // Record the approval
    const approval: GovernanceApproval = {
      approved: true,
      agentId: approverAgentId,
      at: now,
    }
    request.approvals[approverType] = approval
    request.updatedAt = now

    // Determine new status based on which manager approvals are present
    const hasSourceManagerApproval = request.approvals.sourceManager?.approved === true
    const hasTargetManagerApproval = request.approvals.targetManager?.approved === true
    const hasAnySourceApproval = hasSourceManagerApproval || request.approvals.sourceCOS?.approved === true
    const hasAnyTargetApproval = hasTargetManagerApproval || request.approvals.targetCOS?.approved === true

    if (hasSourceManagerApproval && hasTargetManagerApproval) {
      // Both managers approved -> auto-execute
      request.status = 'executed'
    } else if (hasAnySourceApproval && !hasAnyTargetApproval) {
      // Only source side approved
      request.status = 'remote-approved'
    } else if (hasAnyTargetApproval && !hasAnySourceApproval) {
      // Only target side approved
      request.status = 'local-approved'
    }
    // If both sides have some approval but not both managers, keep current status
    // (could be remote-approved or local-approved from prior step)

    saveGovernanceRequests(file)
    return request
  })
}

/** Reject a governance request with an optional reason */
export async function rejectGovernanceRequest(
  requestId: string,
  rejectorAgentId: string,
  reason?: string,
): Promise<GovernanceRequest | null> {
  return withLock('governance-requests', () => {
    const file = loadGovernanceRequests()
    const request = file.requests.find((r) => r.id === requestId)
    if (!request) return null

    // Cannot reject an already executed request
    if (request.status === 'executed') return request

    const now = new Date().toISOString()
    request.status = 'rejected'
    request.updatedAt = now
    request.rejectReason = reason ?? `Rejected by ${rejectorAgentId}`

    saveGovernanceRequests(file)
    return request
  })
}

/** Set a governance request status to 'executed' */
export async function executeGovernanceRequest(
  requestId: string,
): Promise<GovernanceRequest | null> {
  return withLock('governance-requests', () => {
    const file = loadGovernanceRequests()
    const request = file.requests.find((r) => r.id === requestId)
    if (!request) return null

    // Cannot execute an already rejected request
    if (request.status === 'rejected') return request

    const now = new Date().toISOString()
    request.status = 'executed'
    request.updatedAt = now

    saveGovernanceRequests(file)
    return request
  })
}
