import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
// NT-017: Import shared MockTeamValidationException instead of defining inline duplicate
import { MockTeamValidationException } from './test-utils/service-mocks'

// ============================================================================
// Mocks — must be declared before importing the module under test
// ============================================================================

const mockGetTransferRequest = vi.fn()
const mockResolveTransferRequest = vi.fn()
const mockRevertTransferToPending = vi.fn()

vi.mock('@/lib/transfer-registry', () => ({
  getTransferRequest: (...args: unknown[]) => mockGetTransferRequest(...args),
  resolveTransferRequest: (...args: unknown[]) => mockResolveTransferRequest(...args),
  revertTransferToPending: (...args: unknown[]) => mockRevertTransferToPending(...args),
}))

const mockLoadTeams = vi.fn()
const mockSaveTeams = vi.fn()

vi.mock('@/lib/team-registry', () => ({
  loadTeams: (...args: unknown[]) => mockLoadTeams(...args),
  saveTeams: (...args: unknown[]) => mockSaveTeams(...args),
  TeamValidationException: MockTeamValidationException,
}))

const mockIsManager = vi.fn()
const mockGetManagerId = vi.fn()
const mockIsChiefOfStaffAnywhere = vi.fn()

vi.mock('@/lib/governance', () => ({
  isManager: (...args: unknown[]) => mockIsManager(...args),
  getManagerId: (...args: unknown[]) => mockGetManagerId(...args),
  isChiefOfStaffAnywhere: (...args: unknown[]) => mockIsChiefOfStaffAnywhere(...args),
}))

const mockIsValidUuid = vi.fn(() => true)

vi.mock('@/lib/validation', () => ({
  isValidUuid: (...args: unknown[]) => mockIsValidUuid(...args),
}))

vi.mock('@/lib/agent-registry', () => ({
  getAgent: vi.fn(() => null),
}))

vi.mock('@/lib/notification-service', () => ({
  notifyAgent: vi.fn(() => Promise.resolve()),
}))

// Mock agent-auth module - in tests, trust X-Agent-Id directly (no real API keys in test environment)
vi.mock('@/lib/agent-auth', () => ({
  authenticateAgent: vi.fn((authHeader: string | null, agentIdHeader: string | null) => {
    if (agentIdHeader) return { agentId: agentIdHeader }
    return {}
  })
}))

const mockAcquireLock = vi.fn()

vi.mock('@/lib/file-lock', () => ({
  acquireLock: (...args: unknown[]) => mockAcquireLock(...args),
}))

// ============================================================================
// Import module under test (after mocks)
// ============================================================================

import { POST } from '@/app/api/governance/transfers/[id]/resolve/route'
import { NextRequest } from 'next/server'

// ============================================================================
// Test helpers
// ============================================================================

function makeRequest(body: Record<string, unknown>, headers: Record<string, string> = {}): NextRequest {
  // The route derives resolvedBy from the authenticated agent identity (X-Agent-Id header),
  // not from the request body. If the test provides resolvedBy in the body, automatically
  // set X-Agent-Id header so the mock agent-auth returns the correct agentId.
  const resolvedHeaders: Record<string, string> = { 'Content-Type': 'application/json', ...headers }
  if (body.resolvedBy && typeof body.resolvedBy === 'string' && !resolvedHeaders['X-Agent-Id']) {
    resolvedHeaders['X-Agent-Id'] = body.resolvedBy
  }
  return new NextRequest('http://localhost:23000/api/governance/transfers/tr-1/resolve', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: resolvedHeaders,
  })
}

function makeParams(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) }
}

/** A pending transfer request fixture */
function pendingTransfer(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tr-1',
    agentId: 'agent-normal',
    fromTeamId: 'team-source',
    toTeamId: 'team-dest',
    requestedBy: 'cos-source',
    status: 'pending',
    createdAt: '2025-06-01T12:00:00.000Z',
    ...overrides,
  }
}

/** Teams fixture: source is closed, dest is closed, plus a third closed team containing the agent */
function teamsWithMultiClosedConflict() {
  return [
    {
      id: 'team-source',
      name: 'Source Team',
      type: 'closed',
      chiefOfStaffId: 'cos-source',
      agentIds: ['agent-normal'],
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    },
    {
      id: 'team-dest',
      name: 'Dest Team',
      type: 'closed',
      chiefOfStaffId: 'cos-dest',
      agentIds: [],
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    },
    {
      id: 'team-other-closed',
      name: 'Other Closed Team',
      type: 'closed',
      chiefOfStaffId: 'cos-other',
      agentIds: ['agent-normal'],
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    },
  ]
}

/** Teams fixture: simple transfer without multi-closed conflict */
function teamsNoConflict() {
  return [
    {
      id: 'team-source',
      name: 'Source Team',
      type: 'closed',
      chiefOfStaffId: 'cos-source',
      agentIds: ['agent-normal'],
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    },
    {
      id: 'team-dest',
      name: 'Dest Team',
      type: 'closed',
      chiefOfStaffId: 'cos-dest',
      agentIds: [],
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    },
  ]
}

// ============================================================================
// Setup
// ============================================================================

beforeEach(() => {
  vi.clearAllMocks()

  // Default: all UUIDs are valid
  mockIsValidUuid.mockReturnValue(true)

  // Default: lock always succeeds and returns a release function
  mockAcquireLock.mockResolvedValue(vi.fn())

  // Default: resolver is COS of the source team
  mockIsManager.mockReturnValue(false)
  mockGetManagerId.mockReturnValue('manager-id')
  mockIsChiefOfStaffAnywhere.mockReturnValue(false)
})

// ============================================================================
// SR-001: Multi-closed-team constraint must run BEFORE resolveTransferRequest
// ============================================================================

describe('SR-001: multi-closed-team constraint check ordering', () => {
  it('rejects transfer BEFORE marking as approved when agent is already in another closed team', async () => {
    /** Verifies that the multi-closed-team constraint check runs before resolveTransferRequest so that a constraint violation does not leave an inconsistent "approved but not moved" state on disk */
    mockGetTransferRequest.mockReturnValue(pendingTransfer())
    mockLoadTeams.mockReturnValue(teamsWithMultiClosedConflict())

    const req = makeRequest({ action: 'approve', resolvedBy: 'cos-source' })
    const res = await POST(req, makeParams('tr-1'))
    const data = await res.json()

    // The constraint check must return 409 conflict
    expect(res.status).toBe(409)
    expect(data.error).toContain('already in another closed team')

    // CRITICAL: resolveTransferRequest must NOT have been called — the transfer
    // must remain in 'pending' state on disk, not marked as 'approved'
    expect(mockResolveTransferRequest).not.toHaveBeenCalled()
  })

  it('allows approval when there is no multi-closed-team conflict', async () => {
    /** Verifies that the constraint check passes and resolveTransferRequest is called when there is no multi-closed conflict, and that the lock is released after completion (CC-020) */
    const releaseFn = vi.fn()
    mockAcquireLock.mockResolvedValue(releaseFn)

    mockGetTransferRequest.mockReturnValue(pendingTransfer())
    mockLoadTeams.mockReturnValue(teamsNoConflict())
    mockResolveTransferRequest.mockResolvedValue({
      ...pendingTransfer(),
      status: 'approved',
      resolvedAt: '2025-06-01T13:00:00.000Z',
      resolvedBy: 'cos-source',
    })
    mockSaveTeams.mockImplementation(() => { /* success: void return */ })

    const req = makeRequest({ action: 'approve', resolvedBy: 'cos-source' })
    const res = await POST(req, makeParams('tr-1'))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.success).toBe(true)
    expect(mockResolveTransferRequest).toHaveBeenCalledOnce()
    // CC-020: verify the lock release function was called to prevent deadlocks
    expect(releaseFn).toHaveBeenCalled()
  })

  it('still allows rejection even when multi-closed constraint would fail', async () => {
    /** Verifies that the multi-closed-team constraint check only applies to approvals, not rejections */
    mockGetTransferRequest.mockReturnValue(pendingTransfer())
    mockLoadTeams.mockReturnValue(teamsWithMultiClosedConflict())
    mockResolveTransferRequest.mockResolvedValue({
      ...pendingTransfer(),
      status: 'rejected',
      resolvedAt: '2025-06-01T13:00:00.000Z',
      resolvedBy: 'cos-source',
      rejectReason: 'Not needed',
    })

    const req = makeRequest({ action: 'reject', resolvedBy: 'cos-source', rejectReason: 'Not needed' })
    const res = await POST(req, makeParams('tr-1'))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.success).toBe(true)
    // resolveTransferRequest should be called for rejections regardless
    expect(mockResolveTransferRequest).toHaveBeenCalledOnce()
  })
})

// ============================================================================
// SR-007: saveTeams failure must revert transfer status to pending
// ============================================================================

describe('SR-007: saveTeams failure triggers compensating revert', () => {
  it('reverts transfer to pending when saveTeams returns false', async () => {
    /** Verifies that when saveTeams fails after approval, the transfer status is reverted back to pending via revertTransferToPending, preventing an inconsistent state where transfer is "approved" but team mutations were not persisted */
    mockGetTransferRequest.mockReturnValue(pendingTransfer())
    mockLoadTeams.mockReturnValue(teamsNoConflict())
    mockResolveTransferRequest.mockResolvedValue({
      ...pendingTransfer(),
      status: 'approved',
      resolvedAt: '2025-06-01T13:00:00.000Z',
      resolvedBy: 'cos-source',
    })
    // saveTeams fails (disk full, permissions, etc.)
    mockSaveTeams.mockImplementation(() => { throw new Error("ENOSPC: disk full") })
    mockRevertTransferToPending.mockResolvedValue(true)

    const req = makeRequest({ action: 'approve', resolvedBy: 'cos-source' })
    const res = await POST(req, makeParams('tr-1'))
    const data = await res.json()

    // Must return 500 error
    expect(res.status).toBe(500)
    expect(data.error).toContain('Failed to save team changes')

    // CRITICAL: revertTransferToPending must be called to undo the approval
    expect(mockRevertTransferToPending).toHaveBeenCalledWith('tr-1')
  })

  it('does not call revert when saveTeams succeeds', async () => {
    /** Verifies that revertTransferToPending is NOT called on a successful save */
    mockGetTransferRequest.mockReturnValue(pendingTransfer())
    mockLoadTeams.mockReturnValue(teamsNoConflict())
    mockResolveTransferRequest.mockResolvedValue({
      ...pendingTransfer(),
      status: 'approved',
      resolvedAt: '2025-06-01T13:00:00.000Z',
      resolvedBy: 'cos-source',
    })
    mockSaveTeams.mockImplementation(() => { /* success: void return */ })

    const req = makeRequest({ action: 'approve', resolvedBy: 'cos-source' })
    const res = await POST(req, makeParams('tr-1'))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.success).toBe(true)
    expect(mockRevertTransferToPending).not.toHaveBeenCalled()
  })
})

// ============================================================================
// CC-007: 400 validation paths for missing/invalid fields
// ============================================================================

describe('CC-007: request body validation', () => {
  it('returns 400 when action is missing', async () => {
    /** Verifies that the route rejects requests where the action field is absent */
    const req = makeRequest({ resolvedBy: 'cos-source' })
    const res = await POST(req, makeParams('tr-1'))
    const data = await res.json()

    expect(res.status).toBe(400)
    expect(data.error).toContain('action is required')
  })

  it('returns 401 when agent identity is not provided', async () => {
    /** Verifies that the route requires agent authentication to resolve transfers (resolvedBy is derived from auth, not body) */
    const req = makeRequest({ action: 'approve' })
    const res = await POST(req, makeParams('tr-1'))
    const data = await res.json()

    expect(res.status).toBe(401)
    expect(data.error).toContain('Agent authentication required')
  })

  it('returns 400 when action is invalid', async () => {
    /** Verifies that the route rejects requests where action is not "approve" or "reject" */
    const req = makeRequest({ action: 'invalid', resolvedBy: 'cos-source' })
    const res = await POST(req, makeParams('tr-1'))
    const data = await res.json()

    expect(res.status).toBe(400)
    expect(data.error).toContain('action must be "approve" or "reject"')
  })
})

// ============================================================================
// CC-008: 403 authorization — resolver must be COS or MANAGER
// ============================================================================

describe('CC-008: authorization check', () => {
  it('returns 403 when resolver is not COS or MANAGER', async () => {
    /** Verifies that an agent who is neither the source team COS nor a global MANAGER is forbidden from resolving a transfer */
    mockGetTransferRequest.mockReturnValue(pendingTransfer())
    mockLoadTeams.mockReturnValue(teamsNoConflict())
    // resolvedBy is 'random-agent', not the COS ('cos-source') of team-source
    // isManager returns false (set in beforeEach), so neither condition is met
    mockIsManager.mockReturnValue(false)

    const req = makeRequest({ action: 'approve', resolvedBy: 'random-agent' })
    const res = await POST(req, makeParams('tr-1'))
    const data = await res.json()

    expect(res.status).toBe(403)
    expect(data.error).toContain('Only the source team COS or MANAGER can resolve this transfer')
    // Transfer must NOT have been resolved
    expect(mockResolveTransferRequest).not.toHaveBeenCalled()
  })
})

// ============================================================================
// CC-009: 404 when source team not found
// ============================================================================

describe('CC-009: source team not found', () => {
  it('returns 404 when the source team does not exist in the teams list', async () => {
    /** Verifies that the route returns 404 when loadTeams does not include the transfer's fromTeamId, preventing operations on orphaned transfers */
    mockGetTransferRequest.mockReturnValue(pendingTransfer({ fromTeamId: 'team-source' }))
    // Return teams that do NOT include 'team-source' — only destination team exists
    mockLoadTeams.mockReturnValue([
      {
        id: 'team-dest',
        name: 'Dest Team',
        type: 'closed',
        chiefOfStaffId: 'cos-dest',
        agentIds: [],
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      },
    ])

    const req = makeRequest({ action: 'approve', resolvedBy: 'cos-source' })
    const res = await POST(req, makeParams('tr-1'))
    const data = await res.json()

    expect(res.status).toBe(404)
    expect(data.error).toContain('Source team not found')
    // Transfer must NOT have been resolved since source team is missing
    expect(mockResolveTransferRequest).not.toHaveBeenCalled()
  })
})

// ============================================================================
// CC-010: 404 when destination team not found during approval
// ============================================================================

describe('CC-010: destination team not found during approval', () => {
  it('returns 404 when the destination team does not exist during approval', async () => {
    /** Verifies that the route returns 404 when approving a transfer whose destination team no longer exists, preventing agents from being moved to a non-existent team */
    mockGetTransferRequest.mockReturnValue(pendingTransfer({ fromTeamId: 'team-source', toTeamId: 'team-dest' }))
    // Return teams that include the source team but NOT the destination team
    mockLoadTeams.mockReturnValue([
      {
        id: 'team-source',
        name: 'Source Team',
        type: 'closed',
        chiefOfStaffId: 'cos-source',
        agentIds: ['agent-normal'],
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      },
    ])

    const req = makeRequest({ action: 'approve', resolvedBy: 'cos-source' })
    const res = await POST(req, makeParams('tr-1'))
    const data = await res.json()

    expect(res.status).toBe(404)
    expect(data.error).toContain('Destination team no longer exists')
    // Transfer must NOT have been resolved since destination team is missing
    expect(mockResolveTransferRequest).not.toHaveBeenCalled()
  })
})

// ============================================================================
// CC-011: 400 when transfer ID has invalid UUID format
// ============================================================================

describe('CC-011: invalid transfer ID format', () => {
  it('returns 400 when the transfer ID fails UUID validation', async () => {
    /** Verifies that the isValidUuid guard rejects malformed transfer IDs before any further processing occurs */
    // Make isValidUuid return false for the invalid transfer ID
    mockIsValidUuid.mockReturnValue(false)

    const req = makeRequest({ action: 'approve', resolvedBy: 'cos-source' })
    const res = await POST(req, makeParams('not-a-valid-uuid!!!'))
    const data = await res.json()

    expect(res.status).toBe(400)
    expect(data.error).toContain('Invalid transfer ID format')
    // No further processing should occur — transfer lookup must be skipped
    expect(mockGetTransferRequest).not.toHaveBeenCalled()
    expect(mockResolveTransferRequest).not.toHaveBeenCalled()
  })
})
