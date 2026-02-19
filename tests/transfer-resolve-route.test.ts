import { describe, it, expect, vi, beforeEach } from 'vitest'

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
  TeamValidationException: class TeamValidationException extends Error {
    code: number
    constructor(message: string, code: number) {
      super(message)
      this.code = code
    }
  },
}))

const mockIsManager = vi.fn()
const mockGetManagerId = vi.fn()
const mockIsChiefOfStaffAnywhere = vi.fn()

vi.mock('@/lib/governance', () => ({
  isManager: (...args: unknown[]) => mockIsManager(...args),
  getManagerId: (...args: unknown[]) => mockGetManagerId(...args),
  isChiefOfStaffAnywhere: (...args: unknown[]) => mockIsChiefOfStaffAnywhere(...args),
}))

vi.mock('@/lib/agent-registry', () => ({
  getAgent: vi.fn(() => null),
}))

vi.mock('@/lib/notification-service', () => ({
  notifyAgent: vi.fn(() => Promise.resolve()),
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

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost:23000/api/governance/transfers/tr-1/resolve', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
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
    expect(data.error).toContain('already in closed team')

    // CRITICAL: resolveTransferRequest must NOT have been called — the transfer
    // must remain in 'pending' state on disk, not marked as 'approved'
    expect(mockResolveTransferRequest).not.toHaveBeenCalled()
  })

  it('allows approval when there is no multi-closed-team conflict', async () => {
    /** Verifies that the constraint check passes and resolveTransferRequest is called when there is no multi-closed conflict */
    mockGetTransferRequest.mockReturnValue(pendingTransfer())
    mockLoadTeams.mockReturnValue(teamsNoConflict())
    mockResolveTransferRequest.mockResolvedValue({
      ...pendingTransfer(),
      status: 'approved',
      resolvedAt: '2025-06-01T13:00:00.000Z',
      resolvedBy: 'cos-source',
    })
    mockSaveTeams.mockReturnValue(true)

    const req = makeRequest({ action: 'approve', resolvedBy: 'cos-source' })
    const res = await POST(req, makeParams('tr-1'))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.success).toBe(true)
    expect(mockResolveTransferRequest).toHaveBeenCalledOnce()
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
    mockSaveTeams.mockReturnValue(false)
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
    mockSaveTeams.mockReturnValue(true)

    const req = makeRequest({ action: 'approve', resolvedBy: 'cos-source' })
    const res = await POST(req, makeParams('tr-1'))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.success).toBe(true)
    expect(mockRevertTransferToPending).not.toHaveBeenCalled()
  })
})
