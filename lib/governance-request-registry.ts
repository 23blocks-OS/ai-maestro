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
    return { ...DEFAULT_GOVERNANCE_REQUESTS_FILE }
  }
  try {
    const data = fs.readFileSync(REQUESTS_FILE, 'utf-8')
    const parsed: GovernanceRequestsFile = JSON.parse(data)
    // NT-002 (P5): Version guard -- reject files with unexpected schema version or missing requests array
    if (parsed.version !== 1 || !Array.isArray(parsed.requests)) {
      console.error(`[governance-requests] Schema mismatch: version=${parsed.version}, requests isArray=${Array.isArray(parsed.requests)} -- returning defaults`)
      return { ...DEFAULT_GOVERNANCE_REQUESTS_FILE }
    }
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
      } catch (backupErr) { console.warn('[governance-requests] Failed to backup corrupted file:', backupErr) }
      // Heal the corrupted file by writing defaults
      saveGovernanceRequests(DEFAULT_GOVERNANCE_REQUESTS_FILE)
    } else {
      console.error('[governance-requests] Failed to read governance requests:', error)
    }
    return { ...DEFAULT_GOVERNANCE_REQUESTS_FILE }
  }
}

/** Write governance requests to disk using atomic temp-file-then-rename pattern */
export function saveGovernanceRequests(file: GovernanceRequestsFile): void {
  // Fail-fast: let errors propagate to callers (all wrapped in withLock try/catch)
  ensureAimaestroDir()
  // Atomic write: write to temp file then rename to avoid corruption on crash
  // SF-040: Include process.pid for multi-process safety
  const tmpFile = REQUESTS_FILE + `.tmp.${process.pid}`
  fs.writeFileSync(tmpFile, JSON.stringify(file, null, 2), 'utf-8')
  fs.renameSync(tmpFile, REQUESTS_FILE)
}

/**
 * Find a governance request by ID, or null if not found.
 *
 * Intentionally lock-free: reads are non-mutating and acceptable without
 * serialization in the single-process Phase 1 architecture.
 */
export function getGovernanceRequest(id: string): GovernanceRequest | null {
  const file = loadGovernanceRequests()
  return file.requests.find((r) => r.id === id) ?? null
}

/**
 * List governance requests with optional filtering by status, type, hostId, or agentId.
 *
 * Intentionally lock-free: reads are non-mutating and acceptable without
 * serialization in the single-process Phase 1 architecture.
 */
export function listGovernanceRequests(filter?: {
  status?: GovernanceRequestStatus
  type?: GovernanceRequestType
  hostId?: string
  agentId?: string
}): GovernanceRequest[] {
  const file = loadGovernanceRequests()
  if (!filter) return file.requests

  return file.requests.filter((r) => {
    // Filter by status if specified
    if (filter.status && r.status !== filter.status) return false
    // SF-024: Filter by request type if specified (e.g. 'configure-agent')
    if (filter.type && r.type !== filter.type) return false
    // Filter by hostId: match either source or target host
    if (filter.hostId && r.sourceHostId !== filter.hostId && r.targetHostId !== filter.hostId) return false
    // Filter by agentId: match the payload's agentId or the requestedBy field
    // SF-007: use optional chaining -- payload.agentId may be undefined for non-agent request types
    if (filter.agentId && r.payload?.agentId !== filter.agentId && r.requestedBy !== filter.agentId) return false
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
 * - If both sides have COS approval but not both managers -> status = 'dual-approved'
 * - If only source side approved (sourceCOS or sourceManager) -> status = 'remote-approved'
 * - If only target side approved (targetCOS or targetManager) -> status = 'local-approved'
 *
 * Naming convention: 'remote-approved' / 'local-approved' are from the **target host's**
 * perspective (the host that stores and evaluates the request).
 *   - 'remote-approved' = the request's *source* (i.e. remote) host approved it.
 *   - 'local-approved'  = the *target* (i.e. local) host approved it.
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

    // Terminal states: return the unchanged request so callers can inspect request.status
    // to distinguish "not found" (null) from "already finalized" (non-null, terminal status).
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
    } else if (hasAnySourceApproval && hasAnyTargetApproval) {
      // Both sides have at least COS approval but not both managers yet
      request.status = 'dual-approved'
    }
    // If none of the above matched, keep current status

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

/**
 * Lock-free TTL expiry helper: auto-reject pending requests older than ttlDays.
 * Operates on the requests array in-place. Caller must hold the governance-requests lock.
 * Returns the number of requests expired.
 */
function expirePendingRequestsInPlace(requests: GovernanceRequest[], ttlDays: number): number {
  const cutoff = Date.now() - ttlDays * 86_400_000
  let expired = 0
  // SF-002 (P5): Expire all non-terminal statuses, not just 'pending'. Intermediate
  // approval states ('remote-approved', 'local-approved', 'dual-approved') can accumulate
  // forever if the counterpart never responds. Terminal statuses are 'executed' and 'rejected'.
  const NON_TERMINAL_STATUSES: GovernanceRequestStatus[] = [
    'pending', 'remote-approved', 'local-approved', 'dual-approved',
  ]
  for (const req of requests) {
    if (NON_TERMINAL_STATUSES.includes(req.status)) {
      const createdAt = new Date(req.createdAt).getTime()
      if (createdAt < cutoff) {
        // MF-002: Capture previousStatus BEFORE mutation so rejectReason records the actual prior status
        const previousStatus = req.status
        req.status = 'rejected'
        req.rejectReason = `Request expired (TTL: ${ttlDays}d, was: ${previousStatus})`
        req.updatedAt = new Date().toISOString()
        expired++
      }
    }
  }
  return expired
}

/** Structured result from purgeOldRequests to avoid double-counting */
export interface PurgeResult {
  /** Number of terminal-state (executed/rejected) requests removed */
  purged: number
  /** Number of pending requests auto-rejected via TTL expiry */
  expired: number
}

/**
 * Remove governance requests in terminal states (executed, rejected) that are older
 * than the specified age, and auto-reject stale pending requests via TTL.
 * Prevents unbounded growth of governance-requests.json.
 *
 * Two different time windows apply:
 *   1. **Pending requests** expire after a fixed 7-day TTL -- they are auto-rejected
 *      (status set to 'rejected', reason: 'expired') by expirePendingRequestsInPlace.
 *   2. **Terminal-state requests** (executed/rejected) are purged after `maxAgeDays`
 *      (default 30 days) to keep the file size bounded while retaining audit history.
 *
 * Delegates TTL expiry to the canonical expirePendingRequestsInPlace helper
 * to avoid duplicating TTL logic (SF-002).
 */
export async function purgeOldRequests(maxAgeDays: number = 30): Promise<PurgeResult> {
  return withLock('governance-requests', () => {
    const file = loadGovernanceRequests()
    const cutoff = Date.now() - maxAgeDays * 86_400_000
    const before = file.requests.length

    // First pass: remove terminal-state requests older than maxAgeDays
    const filtered = file.requests.filter((r) => {
      if (r.status !== 'executed' && r.status !== 'rejected') return true
      const updatedAt = new Date(r.updatedAt).getTime()
      return updatedAt > cutoff
    })

    // Second pass: auto-reject stale pending requests via canonical TTL helper
    const expired = expirePendingRequestsInPlace(filtered, 7)

    const purged = before - filtered.length
    if (purged > 0 || expired > 0) {
      saveGovernanceRequests({ ...file, requests: filtered })
    }
    if (expired > 0) {
      console.log(`[governance-requests] Expired ${expired} pending request(s) past 7-day TTL`)
    }

    return { purged, expired }
  })
}

/**
 * Auto-reject pending governance requests that have exceeded their TTL.
 * Default TTL: 7 days. Prevents stale pending requests from accumulating.
 * Can be called independently of purgeOldRequests for targeted TTL enforcement.
 */
export async function expirePendingRequests(ttlDays: number = 7): Promise<number> {
  return withLock('governance-requests', () => {
    const file = loadGovernanceRequests()
    const expired = expirePendingRequestsInPlace(file.requests, ttlDays)

    if (expired > 0) {
      saveGovernanceRequests(file)
      console.log(`[governance-requests] Expired ${expired} pending request(s) past ${ttlDays}-day TTL`)
    }

    return expired
  })
}
