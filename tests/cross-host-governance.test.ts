import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * Unit tests for services/cross-host-governance-service.ts
 *
 * Coverage: 40 tests across 6 exported/internal functions
 * - submitCrossHostRequest: 8 tests (password, agent, role, self-target, unknown host, success, fetch, fetch failure)
 * - receiveCrossHostRequest: 5 tests (unknown host, missing fields, success, returns id, duplicate)
 *     + 2 auto-approve tests (SF-028), 4 sanitization tests (SF-030: status/approvals stripped, invalid type, invalid role, sourceHostId mismatch)
 * - approveCrossHostRequest: 7 tests (password, unknown req, sourceManager, targetManager, sourceCOS, not-manager, execution)
 *     + 1 source/target guard test (SF-031)
 * - rejectCrossHostRequest: 5 tests (password, not authorized, sets rejected, unknown req, notifies source)
 * - listCrossHostRequests: 3 tests (no filter, filter status, filter hostId)
 * - performRequestExecution (via approve): 5 tests (add-to-team, remove-from-team, assign-cos, remove-cos, transfer-agent)
 *
 * External dependencies mocked: governance, agent-registry, hosts-config, governance-request-registry,
 *                                governance-sync, team-registry, file-lock, host-keys, manager-trust,
 *                                rate-limit, global fetch
 */

// ============================================================================
// Mocks -- all external dependencies
// ============================================================================

const mockVerifyPassword = vi.fn()
const mockIsManager = vi.fn()
const mockIsChiefOfStaffAnywhere = vi.fn()
const mockGetManagerId = vi.fn()
vi.mock('@/lib/governance', () => ({
  verifyPassword: (...args: unknown[]) => mockVerifyPassword(...args),
  isManager: (...args: unknown[]) => mockIsManager(...args),
  isChiefOfStaffAnywhere: (...args: unknown[]) => mockIsChiefOfStaffAnywhere(...args),
  getManagerId: (...args: unknown[]) => mockGetManagerId(...args),
}))

const mockGetAgent = vi.fn()
vi.mock('@/lib/agent-registry', () => ({
  getAgent: (...args: unknown[]) => mockGetAgent(...args),
}))

const mockGetHosts = vi.fn()
const mockGetSelfHostId = vi.fn()
const mockIsSelf = vi.fn()
const mockGetHostById = vi.fn()
vi.mock('@/lib/hosts-config', () => ({
  getHosts: (...args: unknown[]) => mockGetHosts(...args),
  getSelfHostId: (...args: unknown[]) => mockGetSelfHostId(...args),
  isSelf: (...args: unknown[]) => mockIsSelf(...args),
  getHostById: (...args: unknown[]) => mockGetHostById(...args),
}))

const mockCreateGovernanceRequest = vi.fn()
const mockGetGovernanceRequest = vi.fn()
const mockListGovernanceRequests = vi.fn()
const mockApproveGovernanceRequest = vi.fn()
const mockRejectGovernanceRequest = vi.fn()
// NT-015: Removed unused mockExecuteGovernanceRequest — executeGovernanceRequest is not imported by the service
const mockLoadGovernanceRequests = vi.fn()
const mockSaveGovernanceRequests = vi.fn()
const mockWithLock = vi.fn()

vi.mock('@/lib/governance-request-registry', () => ({
  createGovernanceRequest: (...args: unknown[]) => mockCreateGovernanceRequest(...args),
  getGovernanceRequest: (...args: unknown[]) => mockGetGovernanceRequest(...args),
  listGovernanceRequests: (...args: unknown[]) => mockListGovernanceRequests(...args),
  approveGovernanceRequest: (...args: unknown[]) => mockApproveGovernanceRequest(...args),
  rejectGovernanceRequest: (...args: unknown[]) => mockRejectGovernanceRequest(...args),
  loadGovernanceRequests: (...args: unknown[]) => mockLoadGovernanceRequests(...args),
  saveGovernanceRequests: (...args: unknown[]) => mockSaveGovernanceRequests(...args),
}))

vi.mock('@/lib/file-lock', () => ({
  withLock: (...args: unknown[]) => mockWithLock(...args),
}))

const mockBroadcastGovernanceSync = vi.fn()
vi.mock('@/lib/governance-sync', () => ({
  broadcastGovernanceSync: (...args: unknown[]) => mockBroadcastGovernanceSync(...args),
}))

const mockLoadTeams = vi.fn()
const mockSaveTeams = vi.fn()
vi.mock('@/lib/team-registry', () => ({
  loadTeams: (...args: unknown[]) => mockLoadTeams(...args),
  saveTeams: (...args: unknown[]) => mockSaveTeams(...args),
}))

// MF-006: Mock host-keys to prevent real Ed25519 key file access during tests
vi.mock('@/lib/host-keys', () => ({
  signHostAttestation: vi.fn(() => 'mock-sig'),
  getHostPublicKeyHex: vi.fn(() => 'mock-pubkey'),
  verifyHostAttestation: vi.fn(() => true),
}))

// MF-007: Mock manager-trust to prevent import failures and control auto-approve behavior
const mockShouldAutoApprove = vi.fn()
vi.mock('@/lib/manager-trust', () => ({
  shouldAutoApprove: (...args: unknown[]) => mockShouldAutoApprove(...args),
}))

// MF-009: Mock rate-limit to prevent cross-test rate-limit state leaking between tests.
// SF-058: recordFailure alias removed -- only canonical names remain
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true, retryAfterMs: 0 })),
  checkAndRecordAttempt: vi.fn(() => ({ allowed: true, retryAfterMs: 0 })),
  recordAttempt: vi.fn(),
  resetRateLimit: vi.fn(),
}))

// ============================================================================
// Import module under test (after mocks are defined)
// ============================================================================

import {
  submitCrossHostRequest,
  receiveCrossHostRequest,
  approveCrossHostRequest,
  rejectCrossHostRequest,
  listCrossHostRequests,
} from '@/services/cross-host-governance-service'

import type { GovernanceRequest } from '@/types/governance-request'

// ============================================================================
// Test data factories
// ============================================================================

const HOST_LOCAL = { id: 'host-local', url: 'http://localhost:23000', name: 'host-local' }
const HOST_REMOTE = { id: 'host-remote', url: 'http://10.0.0.5:23000', name: 'host-remote' }

function makeGovernanceRequest(overrides: Partial<GovernanceRequest> = {}): GovernanceRequest {
  return {
    id: 'req-001',
    type: 'add-to-team',
    sourceHostId: 'host-local',
    targetHostId: 'host-remote',
    requestedBy: 'manager-agent',
    requestedByRole: 'manager',
    payload: {
      agentId: 'agent-target-001',
      teamId: 'team-backend-001',
    },
    approvals: {},
    status: 'pending',
    createdAt: '2025-06-01T10:00:00.000Z',
    updatedAt: '2025-06-01T10:00:00.000Z',
    ...overrides,
  }
}

// ============================================================================
// Setup / Teardown
// ============================================================================

const originalFetch = globalThis.fetch

beforeEach(() => {
  vi.clearAllMocks()
  vi.restoreAllMocks()

  // Default mock behavior
  mockGetSelfHostId.mockReturnValue('host-local')
  mockGetHosts.mockReturnValue([HOST_LOCAL, HOST_REMOTE])
  mockIsSelf.mockImplementation((id: string) => id === 'host-local')
  mockGetHostById.mockImplementation((id: string) => {
    if (id === 'host-local') return HOST_LOCAL
    if (id === 'host-remote') return HOST_REMOTE
    return undefined
  })
  mockVerifyPassword.mockResolvedValue(false)
  mockIsManager.mockReturnValue(false)
  mockIsChiefOfStaffAnywhere.mockReturnValue(false)
  mockGetManagerId.mockReturnValue('manager-agent')
  mockGetAgent.mockReturnValue(null)
  mockCreateGovernanceRequest.mockResolvedValue(makeGovernanceRequest())
  mockGetGovernanceRequest.mockReturnValue(null)
  mockListGovernanceRequests.mockReturnValue([])
  mockApproveGovernanceRequest.mockResolvedValue(null)
  mockRejectGovernanceRequest.mockResolvedValue(null)
  mockBroadcastGovernanceSync.mockResolvedValue(undefined)
  mockLoadTeams.mockReturnValue([])
  mockSaveTeams.mockReturnValue(undefined)

  // withLock: immediately call the function (bypass actual file locking)
  mockWithLock.mockImplementation(async (_name: string, fn: () => unknown) => fn())

  // loadGovernanceRequests defaults to empty
  mockLoadGovernanceRequests.mockReturnValue({ version: 1, requests: [] })
  mockSaveGovernanceRequests.mockReturnValue(undefined)

  // Default: manager-agent is manager, cos-agent is COS
  mockIsManager.mockImplementation((id: string) => id === 'manager-agent')
  mockIsChiefOfStaffAnywhere.mockImplementation((id: string) => id === 'cos-agent')
  mockGetAgent.mockImplementation((id: string) => {
    if (id === 'manager-agent') return { id: 'manager-agent', name: 'Manager' }
    if (id === 'cos-agent') return { id: 'cos-agent', name: 'COS Agent' }
    return null
  })

  // Default: verifyPassword returns true for 'correct'
  mockVerifyPassword.mockImplementation(async (pw: string) => pw === 'correct')

  // MF-007: shouldAutoApprove defaults to false (no auto-approve in tests)
  mockShouldAutoApprove.mockReturnValue(false)

  // Default fetch mock: ok response
  globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 })
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

// ============================================================================
// submitCrossHostRequest
// ============================================================================

describe('submitCrossHostRequest', () => {
  const baseParams = {
    type: 'add-to-team' as const,
    targetHostId: 'host-remote',
    requestedBy: 'manager-agent',
    requestedByRole: 'manager' as const,
    payload: { agentId: 'agent-target-001', teamId: 'team-backend-001' },
    password: 'correct',
    note: 'Adding remote agent to backend team',
  }

  it('rejects with 401 when governance password is invalid', async () => {
    /** Verifies password check is the first guard and returns 401 on failure */
    const result = await submitCrossHostRequest({ ...baseParams, password: 'wrong' })

    expect(result.status).toBe(401)
    expect(result.error).toContain('Invalid governance password')
    expect(result.data).toBeUndefined()
    expect(mockCreateGovernanceRequest).not.toHaveBeenCalled()
  })

  it('rejects with 404 when requestedBy agent does not exist', async () => {
    /** Verifies agent existence check returns 404 for unknown agent */
    const result = await submitCrossHostRequest({
      ...baseParams,
      requestedBy: 'nonexistent-agent',
      requestedByRole: 'member',
    })

    expect(result.status).toBe(404)
    expect(result.error).toContain("Agent 'nonexistent-agent' not found")
    expect(mockCreateGovernanceRequest).not.toHaveBeenCalled()
  })

  it('rejects with 403 when requestedByRole claims manager but agent is not', async () => {
    /** Verifies role validation catches agents claiming manager without being one */
    // cos-agent is NOT the manager
    const result = await submitCrossHostRequest({
      ...baseParams,
      requestedBy: 'cos-agent',
      requestedByRole: 'manager',
    })

    expect(result.status).toBe(403)
    expect(result.error).toContain('is not the MANAGER')
    expect(mockCreateGovernanceRequest).not.toHaveBeenCalled()
  })

  it('rejects with 400 when targetHostId is self', async () => {
    /** Verifies that cross-host requests cannot target the local host */
    const result = await submitCrossHostRequest({
      ...baseParams,
      targetHostId: 'host-local',
    })

    expect(result.status).toBe(400)
    expect(result.error).toContain('Target host cannot be self')
    expect(mockCreateGovernanceRequest).not.toHaveBeenCalled()
  })

  it('rejects with 404 when targetHostId is unknown', async () => {
    /** Verifies that requests to unknown hosts are rejected */
    const result = await submitCrossHostRequest({
      ...baseParams,
      targetHostId: 'host-nonexistent',
    })

    expect(result.status).toBe(404)
    expect(result.error).toContain("Unknown target host 'host-nonexistent'")
    expect(mockCreateGovernanceRequest).not.toHaveBeenCalled()
  })

  it('creates local request and returns it on success with status 201', async () => {
    /** Verifies the happy path: valid params create a local record and return the request */
    const expectedRequest = makeGovernanceRequest()
    mockCreateGovernanceRequest.mockResolvedValue(expectedRequest)

    const result = await submitCrossHostRequest(baseParams)

    expect(result.status).toBe(201)
    expect(result.data).toEqual(expectedRequest)
    expect(mockCreateGovernanceRequest).toHaveBeenCalledWith({
      type: 'add-to-team',
      sourceHostId: 'host-local',
      targetHostId: 'host-remote',
      requestedBy: 'manager-agent',
      requestedByRole: 'manager',
      payload: { agentId: 'agent-target-001', teamId: 'team-backend-001' },
      note: 'Adding remote agent to backend team',
    })
  })

  it('sends HTTP POST to target host with correct URL and body', async () => {
    /** Verifies fire-and-forget fetch is called with the remote host's governance endpoint */
    const expectedRequest = makeGovernanceRequest()
    mockCreateGovernanceRequest.mockResolvedValue(expectedRequest)
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true })
    globalThis.fetch = fetchSpy

    await submitCrossHostRequest(baseParams)

    // CC-P4-004: Use deterministic vi.waitFor instead of fragile setTimeout for fire-and-forget fetch
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1))
    const [url, opts] = fetchSpy.mock.calls[0]
    expect(url).toBe('http://10.0.0.5:23000/api/v1/governance/requests')
    expect(opts.method).toBe('POST')
    expect(opts.headers['Content-Type']).toBe('application/json')
    const body = JSON.parse(opts.body)
    expect(body.fromHostId).toBe('host-local')
    expect(body.request.id).toBe('req-001')
  })

  it('tolerates HTTP failure to remote host and still returns local record', async () => {
    /** Verifies that a network failure to the remote host does not affect the local response */
    const expectedRequest = makeGovernanceRequest()
    mockCreateGovernanceRequest.mockResolvedValue(expectedRequest)
    const fetchSpy = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'))
    globalThis.fetch = fetchSpy
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await submitCrossHostRequest(baseParams)

    // Local record is created successfully regardless of remote failure
    expect(result.status).toBe(201)
    expect(result.data).toEqual(expectedRequest)

    // CC-P4-004: Use deterministic vi.waitFor instead of fragile setTimeout for fire-and-forget fetch
    await vi.waitFor(() => expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to send request')
    ))
    consoleSpy.mockRestore()
  })
})

// ============================================================================
// receiveCrossHostRequest
// ============================================================================

describe('receiveCrossHostRequest', () => {
  it('rejects with 403 for unknown fromHostId', async () => {
    /** Verifies that requests from unrecognized hosts are rejected */
    const request = makeGovernanceRequest()

    const result = await receiveCrossHostRequest('host-unknown', request)

    expect(result.status).toBe(403)
    expect(result.error).toContain("Unknown sender host 'host-unknown'")
  })

  it('rejects with 400 for missing required request fields', async () => {
    /** Verifies validation catches requests with missing id, type, or payload.agentId */
    const badRequest = makeGovernanceRequest({ id: '', type: '' as any, payload: { agentId: '' } })

    const result = await receiveCrossHostRequest('host-remote', badRequest)

    expect(result.status).toBe(400)
    expect(result.error).toContain('missing id, type, requestedBy, or payload.agentId')
  })

  it('creates local record on success', async () => {
    /** Verifies that a valid request from a known host is stored locally via withLock */
    const request = makeGovernanceRequest({ sourceHostId: 'host-remote', targetHostId: 'host-local' })
    mockLoadGovernanceRequests.mockReturnValue({ version: 1, requests: [] })
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    const result = await receiveCrossHostRequest('host-remote', request)

    expect(result.status).toBe(200)
    // withLock should have been called (it calls the function synchronously in our mock)
    expect(mockWithLock).toHaveBeenCalledWith('governance-requests', expect.any(Function))
    // saveGovernanceRequests should have been called with the request added
    expect(mockSaveGovernanceRequests).toHaveBeenCalledTimes(1)
    const savedFile = mockSaveGovernanceRequests.mock.calls[0][0]
    expect(savedFile.requests).toHaveLength(1)
    expect(savedFile.requests[0].id).toBe('req-001')
    consoleSpy.mockRestore()
  })

  it('returns requestId on success', async () => {
    /** Verifies the response contains the request ID from the incoming request */
    const request = makeGovernanceRequest({ id: 'req-unique-42', sourceHostId: 'host-remote' })
    mockLoadGovernanceRequests.mockReturnValue({ version: 1, requests: [] })
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    const result = await receiveCrossHostRequest('host-remote', request)

    expect(result.status).toBe(200)
    expect(result.data).toEqual({ ok: true, requestId: 'req-unique-42' })
    consoleSpy.mockRestore()
  })

  it('handles duplicate request ID gracefully by skipping storage', async () => {
    /** Verifies that an already-stored request ID does not cause duplicate entries */
    const existingRequest = makeGovernanceRequest({ id: 'req-duplicate', sourceHostId: 'host-remote' })
    mockLoadGovernanceRequests.mockReturnValue({ version: 1, requests: [existingRequest] })
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    const result = await receiveCrossHostRequest('host-remote', makeGovernanceRequest({ id: 'req-duplicate', sourceHostId: 'host-remote' }))

    expect(result.status).toBe(200)
    // saveGovernanceRequests should NOT have been called because the duplicate was skipped
    expect(mockSaveGovernanceRequests).not.toHaveBeenCalled()
    consoleSpy.mockRestore()
  })
})

// ============================================================================
// approveCrossHostRequest
// ============================================================================

describe('approveCrossHostRequest', () => {
  it('rejects with 401 for invalid governance password', async () => {
    /** Verifies password check is enforced before any approval logic */
    const result = await approveCrossHostRequest('req-001', 'manager-agent', 'wrong-password')

    expect(result.status).toBe(401)
    expect(result.error).toContain('Invalid governance password')
    expect(mockApproveGovernanceRequest).not.toHaveBeenCalled()
  })

  it('returns 404 for unknown request ID', async () => {
    /** Verifies lookup failure returns 404 with descriptive error */
    mockGetGovernanceRequest.mockReturnValue(null)

    const result = await approveCrossHostRequest('req-nonexistent', 'manager-agent', 'correct')

    expect(result.status).toBe(404)
    expect(result.error).toContain("Governance request 'req-nonexistent' not found")
  })

  it('determines sourceManager approverType when approver is manager on source host', async () => {
    /** Verifies that a manager approving from the source host gets approverType=sourceManager */
    const request = makeGovernanceRequest({ sourceHostId: 'host-local', targetHostId: 'host-remote' })
    mockGetGovernanceRequest.mockReturnValue(request)
    mockApproveGovernanceRequest.mockResolvedValue({ ...request, status: 'remote-approved' })

    const result = await approveCrossHostRequest('req-001', 'manager-agent', 'correct')

    expect(result.status).toBe(200)
    expect(mockApproveGovernanceRequest).toHaveBeenCalledWith('req-001', 'manager-agent', 'sourceManager')
  })

  it('determines targetManager approverType when approver is manager on target host', async () => {
    /** Verifies that a manager approving from the target host gets approverType=targetManager */
    // Request was sent FROM host-remote TO host-local (we are host-local = target)
    const request = makeGovernanceRequest({ sourceHostId: 'host-remote', targetHostId: 'host-local' })
    mockGetGovernanceRequest.mockReturnValue(request)
    mockApproveGovernanceRequest.mockResolvedValue({ ...request, status: 'local-approved' })

    const result = await approveCrossHostRequest('req-001', 'manager-agent', 'correct')

    expect(result.status).toBe(200)
    expect(mockApproveGovernanceRequest).toHaveBeenCalledWith('req-001', 'manager-agent', 'targetManager')
  })

  it('determines sourceCOS approverType when approver is COS on source host', async () => {
    /** Verifies that a COS approving from the source host gets approverType=sourceCOS */
    const request = makeGovernanceRequest({ sourceHostId: 'host-local', targetHostId: 'host-remote' })
    mockGetGovernanceRequest.mockReturnValue(request)
    mockApproveGovernanceRequest.mockResolvedValue({ ...request, status: 'pending' })

    const result = await approveCrossHostRequest('req-001', 'cos-agent', 'correct')

    expect(result.status).toBe(200)
    expect(mockApproveGovernanceRequest).toHaveBeenCalledWith('req-001', 'cos-agent', 'sourceCOS')
  })

  it('returns 403 when approver is neither manager nor COS', async () => {
    /** Verifies that a regular member agent cannot approve governance requests */
    const request = makeGovernanceRequest()
    mockGetGovernanceRequest.mockReturnValue(request)

    const result = await approveCrossHostRequest('req-001', 'regular-agent', 'correct')

    expect(result.status).toBe(403)
    expect(result.error).toContain('Only MANAGER or Chief of Staff can approve')
    expect(mockApproveGovernanceRequest).not.toHaveBeenCalled()
  })

  it('calls performRequestExecution when approval causes status to become executed', async () => {
    /** Verifies that the execution path is triggered when both approvals complete */
    const executedRequest = makeGovernanceRequest({
      status: 'executed',
      payload: { agentId: 'agent-target-001', teamId: 'team-backend-001' },
    })
    mockGetGovernanceRequest.mockReturnValue(makeGovernanceRequest())
    mockApproveGovernanceRequest.mockResolvedValue(executedRequest)
    mockLoadTeams.mockReturnValue([
      { id: 'team-backend-001', name: 'Backend', type: 'closed', agentIds: ['existing-agent'], chiefOfStaffId: null, createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z' }
    ])
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    const result = await approveCrossHostRequest('req-001', 'manager-agent', 'correct')

    expect(result.status).toBe(200)
    expect(result.data?.status).toBe('executed')
    // performRequestExecution should have called loadTeams + saveTeams for add-to-team
    expect(mockLoadTeams).toHaveBeenCalled()
    expect(mockSaveTeams).toHaveBeenCalled()
    consoleSpy.mockRestore()
  })
})

// ============================================================================
// rejectCrossHostRequest
// ============================================================================

describe('rejectCrossHostRequest', () => {
  it('rejects with 401 for invalid governance password', async () => {
    /** Verifies password check is enforced before any rejection logic */
    const result = await rejectCrossHostRequest('req-001', 'manager-agent', 'wrong-password', 'bad idea')

    expect(result.status).toBe(401)
    expect(result.error).toContain('Invalid governance password')
    expect(mockRejectGovernanceRequest).not.toHaveBeenCalled()
  })

  it('rejects with 403 when rejector is not manager or COS', async () => {
    /** Verifies that a regular agent cannot reject governance requests */
    const result = await rejectCrossHostRequest('req-001', 'regular-agent', 'correct', 'nope')

    expect(result.status).toBe(403)
    expect(result.error).toContain('Only MANAGER or Chief of Staff can reject')
    expect(mockRejectGovernanceRequest).not.toHaveBeenCalled()
  })

  it('sets request to rejected with reason', async () => {
    /** Verifies the rejection is persisted with the provided reason */
    const request = makeGovernanceRequest({ sourceHostId: 'host-local' })
    mockGetGovernanceRequest.mockReturnValue(request)
    const rejectedRequest = { ...request, status: 'rejected' as const, rejectReason: 'Policy violation' }
    mockRejectGovernanceRequest.mockResolvedValue(rejectedRequest)

    const result = await rejectCrossHostRequest('req-001', 'manager-agent', 'correct', 'Policy violation')

    expect(result.status).toBe(200)
    expect(result.data?.status).toBe('rejected')
    expect(mockRejectGovernanceRequest).toHaveBeenCalledWith('req-001', 'manager-agent', 'Policy violation')
  })

  it('returns 404 for unknown request ID', async () => {
    /** Verifies lookup failure returns 404 */
    mockGetGovernanceRequest.mockReturnValue(null)

    const result = await rejectCrossHostRequest('req-nonexistent', 'manager-agent', 'correct', 'reason')

    expect(result.status).toBe(404)
    expect(result.error).toContain("Governance request 'req-nonexistent' not found")
  })

  it('notifies source host on rejection of cross-host request via fetch', async () => {
    /** Verifies that when the request came from another host, the source is notified */
    // Request came FROM host-remote, we (host-local) are rejecting it
    const request = makeGovernanceRequest({ sourceHostId: 'host-remote', targetHostId: 'host-local' })
    mockGetGovernanceRequest.mockReturnValue(request)
    const rejectedRequest = { ...request, status: 'rejected' as const, rejectReason: 'Denied' }
    mockRejectGovernanceRequest.mockResolvedValue(rejectedRequest)
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true })
    globalThis.fetch = fetchSpy

    await rejectCrossHostRequest('req-001', 'manager-agent', 'correct', 'Denied')

    // CC-P4-004: Use deterministic vi.waitFor instead of fragile setTimeout for fire-and-forget fetch
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1))
    const [url, opts] = fetchSpy.mock.calls[0]
    expect(url).toBe('http://10.0.0.5:23000/api/v1/governance/requests/req-001/reject')
    expect(opts.method).toBe('POST')
    const body = JSON.parse(opts.body)
    expect(body.rejectorAgentId).toBe('manager-agent')
    expect(body.reason).toBe('Denied')
  })
})

// ============================================================================
// listCrossHostRequests
// ============================================================================

describe('listCrossHostRequests', () => {
  const req1 = makeGovernanceRequest({ id: 'req-1', status: 'pending', sourceHostId: 'host-local' })
  const req2 = makeGovernanceRequest({ id: 'req-2', status: 'executed', sourceHostId: 'host-remote' })
  const req3 = makeGovernanceRequest({ id: 'req-3', status: 'pending', sourceHostId: 'host-remote' })

  it('returns all requests when no filter is provided', () => {
    /** Verifies that calling without filter passes undefined to the registry and returns all */
    mockListGovernanceRequests.mockReturnValue([req1, req2, req3])

    const result = listCrossHostRequests()

    expect(result.status).toBe(200)
    expect(result.data).toHaveLength(3)
    expect(mockListGovernanceRequests).toHaveBeenCalledWith(undefined)
  })

  it('filters by status when status filter is provided', () => {
    /** Verifies the status filter is passed through to the registry */
    mockListGovernanceRequests.mockReturnValue([req1, req3])

    const result = listCrossHostRequests({ status: 'pending' })

    expect(result.status).toBe(200)
    expect(result.data).toHaveLength(2)
    expect(mockListGovernanceRequests).toHaveBeenCalledWith({ status: 'pending' })
  })

  it('filters by hostId when hostId filter is provided', () => {
    /** Verifies the hostId filter is passed through to the registry */
    mockListGovernanceRequests.mockReturnValue([req2, req3])

    const result = listCrossHostRequests({ hostId: 'host-remote' })

    expect(result.status).toBe(200)
    expect(result.data).toHaveLength(2)
    expect(mockListGovernanceRequests).toHaveBeenCalledWith({ hostId: 'host-remote' })
  })
})

// ============================================================================
// performRequestExecution (tested via approveCrossHostRequest)
// ============================================================================

describe('performRequestExecution (via approve flow)', () => {
  it('add-to-team: adds agent to team agentIds array', async () => {
    /** Verifies that executing an add-to-team request pushes the agent into the team */
    const executedRequest = makeGovernanceRequest({
      type: 'add-to-team',
      status: 'executed',
      payload: { agentId: 'new-remote-agent', teamId: 'team-alpha' },
    })
    mockGetGovernanceRequest.mockReturnValue(makeGovernanceRequest())
    mockApproveGovernanceRequest.mockResolvedValue(executedRequest)
    const teams = [
      {
        id: 'team-alpha',
        name: 'Alpha Team',
        type: 'closed',
        agentIds: ['agent-a1', 'agent-a2'],
        chiefOfStaffId: 'agent-a1',
        createdAt: '2025-06-01T10:00:00Z',
        updatedAt: '2025-06-01T10:00:00Z',
      }
    ]
    mockLoadTeams.mockReturnValue(teams)
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await approveCrossHostRequest('req-001', 'manager-agent', 'correct')

    expect(mockSaveTeams).toHaveBeenCalledTimes(1)
    const savedTeams = mockSaveTeams.mock.calls[0][0]
    const alphaTeam = savedTeams.find((t: any) => t.id === 'team-alpha')
    expect(alphaTeam.agentIds).toContain('new-remote-agent')
    expect(alphaTeam.agentIds).toHaveLength(3)
    consoleSpy.mockRestore()
  })

  it('remove-from-team: removes agent from team agentIds array', async () => {
    /** Verifies that executing a remove-from-team request filters the agent out of the team */
    const executedRequest = makeGovernanceRequest({
      type: 'remove-from-team',
      status: 'executed',
      payload: { agentId: 'agent-a2', teamId: 'team-beta' },
    })
    mockGetGovernanceRequest.mockReturnValue(makeGovernanceRequest())
    mockApproveGovernanceRequest.mockResolvedValue(executedRequest)
    const teams = [
      {
        id: 'team-beta',
        name: 'Beta Team',
        type: 'closed',
        agentIds: ['agent-b1', 'agent-a2', 'agent-b3'],
        chiefOfStaffId: null,
        createdAt: '2025-06-01T10:00:00Z',
        updatedAt: '2025-06-01T10:00:00Z',
      }
    ]
    mockLoadTeams.mockReturnValue(teams)
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await approveCrossHostRequest('req-001', 'manager-agent', 'correct')

    expect(mockSaveTeams).toHaveBeenCalledTimes(1)
    const savedTeams = mockSaveTeams.mock.calls[0][0]
    const betaTeam = savedTeams.find((t: any) => t.id === 'team-beta')
    expect(betaTeam.agentIds).not.toContain('agent-a2')
    expect(betaTeam.agentIds).toEqual(['agent-b1', 'agent-b3'])
    consoleSpy.mockRestore()
  })

  // SF-019: Coverage for assign-cos execution path
  it('assign-cos: sets chiefOfStaffId on closed team and adds agent to members', async () => {
    /** Verifies that executing an assign-cos request sets chiefOfStaffId and adds agent to agentIds */
    const executedRequest = makeGovernanceRequest({
      type: 'assign-cos',
      status: 'executed',
      payload: { agentId: 'new-cos-agent', teamId: 'team-gamma' },
    })
    mockGetGovernanceRequest.mockReturnValue(makeGovernanceRequest())
    mockApproveGovernanceRequest.mockResolvedValue(executedRequest)
    const teams = [
      {
        id: 'team-gamma',
        name: 'Gamma Team',
        type: 'closed',
        agentIds: ['agent-g1', 'agent-g2'],
        chiefOfStaffId: null,
        createdAt: '2025-06-01T10:00:00Z',
        updatedAt: '2025-06-01T10:00:00Z',
      }
    ]
    mockLoadTeams.mockReturnValue(teams)
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await approveCrossHostRequest('req-001', 'manager-agent', 'correct')

    expect(mockSaveTeams).toHaveBeenCalledTimes(1)
    const savedTeams = mockSaveTeams.mock.calls[0][0]
    const gammaTeam = savedTeams.find((t: any) => t.id === 'team-gamma')
    expect(gammaTeam.chiefOfStaffId).toBe('new-cos-agent')
    // R4.6: COS must be added to agentIds if not already present
    expect(gammaTeam.agentIds).toContain('new-cos-agent')
    consoleSpy.mockRestore()
  })

  // SF-019: Coverage for remove-cos execution path
  it('remove-cos: clears chiefOfStaffId on team', async () => {
    /** Verifies that executing a remove-cos request sets chiefOfStaffId to null */
    const executedRequest = makeGovernanceRequest({
      type: 'remove-cos',
      status: 'executed',
      payload: { agentId: 'old-cos-agent', teamId: 'team-delta' },
    })
    mockGetGovernanceRequest.mockReturnValue(makeGovernanceRequest())
    mockApproveGovernanceRequest.mockResolvedValue(executedRequest)
    const teams = [
      {
        id: 'team-delta',
        name: 'Delta Team',
        type: 'closed',
        agentIds: ['old-cos-agent', 'agent-d1'],
        chiefOfStaffId: 'old-cos-agent',
        createdAt: '2025-06-01T10:00:00Z',
        updatedAt: '2025-06-01T10:00:00Z',
      }
    ]
    mockLoadTeams.mockReturnValue(teams)
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await approveCrossHostRequest('req-001', 'manager-agent', 'correct')

    expect(mockSaveTeams).toHaveBeenCalledTimes(1)
    const savedTeams = mockSaveTeams.mock.calls[0][0]
    const deltaTeam = savedTeams.find((t: any) => t.id === 'team-delta')
    expect(deltaTeam.chiefOfStaffId).toBeNull()
    consoleSpy.mockRestore()
  })

  // SF-019: Coverage for transfer-agent execution path
  it('transfer-agent: removes from source team and adds to destination team', async () => {
    /** Verifies that executing a transfer-agent request moves agent between teams */
    const executedRequest = makeGovernanceRequest({
      type: 'transfer-agent',
      status: 'executed',
      payload: { agentId: 'transfer-agent', teamId: 'team-dest', fromTeamId: 'team-src', toTeamId: 'team-dest' },
    })
    mockGetGovernanceRequest.mockReturnValue(makeGovernanceRequest())
    mockApproveGovernanceRequest.mockResolvedValue(executedRequest)
    const teams = [
      {
        id: 'team-src',
        name: 'Source Team',
        type: 'closed',
        agentIds: ['transfer-agent', 'agent-s1'],
        chiefOfStaffId: null,
        createdAt: '2025-06-01T10:00:00Z',
        updatedAt: '2025-06-01T10:00:00Z',
      },
      {
        id: 'team-dest',
        name: 'Dest Team',
        type: 'closed',
        agentIds: ['agent-d1'],
        chiefOfStaffId: null,
        createdAt: '2025-06-01T10:00:00Z',
        updatedAt: '2025-06-01T10:00:00Z',
      }
    ]
    mockLoadTeams.mockReturnValue(teams)
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await approveCrossHostRequest('req-001', 'manager-agent', 'correct')

    expect(mockSaveTeams).toHaveBeenCalledTimes(1)
    const savedTeams = mockSaveTeams.mock.calls[0][0]
    const srcTeam = savedTeams.find((t: any) => t.id === 'team-src')
    const destTeam = savedTeams.find((t: any) => t.id === 'team-dest')
    expect(srcTeam.agentIds).not.toContain('transfer-agent')
    expect(destTeam.agentIds).toContain('transfer-agent')
    consoleSpy.mockRestore()
  })
})

// ============================================================================
// SF-018: receiveCrossHostRequest auto-approve path
// ============================================================================

describe('receiveCrossHostRequest auto-approve', () => {
  it('auto-approves request when shouldAutoApprove returns true', async () => {
    /** Verifies that trusted managers trigger automatic targetManager approval */
    const request = makeGovernanceRequest({ sourceHostId: 'host-remote', targetHostId: 'host-local' })
    mockLoadGovernanceRequests.mockReturnValue({ version: 1, requests: [] })
    mockShouldAutoApprove.mockReturnValue(true)
    mockGetManagerId.mockReturnValue('manager-agent')
    const approvedRequest = { ...request, status: 'executed' as const }
    mockApproveGovernanceRequest.mockResolvedValue(approvedRequest)
    mockLoadTeams.mockReturnValue([
      { id: 'team-backend-001', name: 'Backend', type: 'closed', agentIds: [], chiefOfStaffId: null, createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z' }
    ])
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    const result = await receiveCrossHostRequest('host-remote', request)

    expect(result.status).toBe(200)
    expect(mockShouldAutoApprove).toHaveBeenCalledWith(request)
    // Should have auto-approved as targetManager
    expect(mockApproveGovernanceRequest).toHaveBeenCalledWith(request.id, 'manager-agent', 'targetManager')
    consoleSpy.mockRestore()
  })

  it('does not auto-approve when shouldAutoApprove returns false', async () => {
    /** Verifies that untrusted managers do not trigger auto-approval */
    const request = makeGovernanceRequest({ sourceHostId: 'host-remote', targetHostId: 'host-local' })
    mockLoadGovernanceRequests.mockReturnValue({ version: 1, requests: [] })
    mockShouldAutoApprove.mockReturnValue(false)
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    const result = await receiveCrossHostRequest('host-remote', request)

    expect(result.status).toBe(200)
    expect(mockShouldAutoApprove).toHaveBeenCalledWith(request)
    expect(mockApproveGovernanceRequest).not.toHaveBeenCalled()
    consoleSpy.mockRestore()
  })
})

// ============================================================================
// SF-020: receiveCrossHostRequest sanitization tests
// ============================================================================

describe('receiveCrossHostRequest sanitization', () => {
  it('forces status to pending and clears approvals regardless of incoming values', async () => {
    /** Verifies CC-P1-002: malicious pre-filled status/approvals are sanitized */
    const maliciousRequest = makeGovernanceRequest({
      sourceHostId: 'host-remote',
      targetHostId: 'host-local',
      status: 'executed' as any,
      approvals: { sourceManager: 'manager-agent', targetManager: 'manager-agent' } as any,
    })
    mockLoadGovernanceRequests.mockReturnValue({ version: 1, requests: [] })
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    const result = await receiveCrossHostRequest('host-remote', maliciousRequest)

    expect(result.status).toBe(200)
    // Verify saved request has sanitized status and approvals
    expect(mockSaveGovernanceRequests).toHaveBeenCalledTimes(1)
    const savedFile = mockSaveGovernanceRequests.mock.calls[0][0]
    expect(savedFile.requests[0].status).toBe('pending')
    expect(savedFile.requests[0].approvals).toEqual({})
    consoleSpy.mockRestore()
  })

  it('rejects request with invalid type', async () => {
    /** Verifies CC-P1-002: unrecognized request types are rejected */
    const badRequest = makeGovernanceRequest({
      sourceHostId: 'host-remote',
      type: 'evil-type' as any,
    })

    const result = await receiveCrossHostRequest('host-remote', badRequest)

    expect(result.status).toBe(400)
    expect(result.error).toContain('Invalid governance request type')
  })

  it('rejects request with invalid requestedByRole', async () => {
    /** Verifies CC-P1-002: unrecognized roles are rejected */
    const badRequest = makeGovernanceRequest({
      sourceHostId: 'host-remote',
      requestedByRole: 'superadmin' as any,
    })

    const result = await receiveCrossHostRequest('host-remote', badRequest)

    expect(result.status).toBe(400)
    expect(result.error).toContain('Invalid requestedByRole')
  })

  it('rejects request when sourceHostId does not match fromHostId', async () => {
    /** Verifies CC-008: spoofed sourceHostId is caught */
    const spoofedRequest = makeGovernanceRequest({
      sourceHostId: 'host-local',
      targetHostId: 'host-remote',
    })

    const result = await receiveCrossHostRequest('host-remote', spoofedRequest)

    expect(result.status).toBe(400)
    expect(result.error).toContain('Source host ID in request does not match sender')
  })
})

// ============================================================================
// SF-021: approveCrossHostRequest source/target guard
// ============================================================================

describe('approveCrossHostRequest source/target validation', () => {
  it('rejects with 400 when this host is neither source nor target of the request', async () => {
    /** Verifies CC-010: approval fails if request belongs to two other hosts */
    const request = makeGovernanceRequest({
      sourceHostId: 'host-remote',
      targetHostId: 'host-other',
    })
    mockGetGovernanceRequest.mockReturnValue(request)

    const result = await approveCrossHostRequest('req-001', 'manager-agent', 'correct')

    expect(result.status).toBe(400)
    expect(result.error).toContain('neither source nor target')
  })
})
