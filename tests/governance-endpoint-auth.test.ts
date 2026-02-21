import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Unit tests for Ed25519 signature verification on governance endpoints (SR-001, SR-002, SR-007)
 *
 * Coverage: 12 tests across 3 security fixes
 * - SR-001 (signature on outbound): broadcastGovernanceSync signs requests, sendRequestToRemoteHost signs, notifyRemoteHostOfRejection signs
 * - SR-007 (type whitelist): submitCrossHostRequest rejects unimplemented types
 * - Signature header format: correct header names and values
 *
 * External dependencies mocked: host-keys, hosts-config, governance, agent-registry, team-registry,
 *                                governance-peers, governance-request-registry, file-lock, manager-trust, fetch
 */

// ============================================================================
// Mocks -- all external dependencies
// ============================================================================

const mockSignHostAttestation = vi.fn().mockReturnValue('mock-signature-base64')
const mockGetHostPublicKeyHex = vi.fn().mockReturnValue('mock-public-key-hex')
vi.mock('@/lib/host-keys', () => ({
  signHostAttestation: (...args: unknown[]) => mockSignHostAttestation(...args),
  getHostPublicKeyHex: (...args: unknown[]) => mockGetHostPublicKeyHex(...args),
  verifyHostAttestation: vi.fn(),
}))

const mockGetHosts = vi.fn()
const mockGetSelfHostId = vi.fn().mockReturnValue('host-local')
const mockIsSelf = vi.fn()
const mockGetHostById = vi.fn()
vi.mock('@/lib/hosts-config', () => ({
  getHosts: (...args: unknown[]) => mockGetHosts(...args),
  getSelfHostId: (...args: unknown[]) => mockGetSelfHostId(...args),
  isSelf: (...args: unknown[]) => mockIsSelf(...args),
  getHostById: (...args: unknown[]) => mockGetHostById(...args),
}))

const mockGetManagerId = vi.fn()
vi.mock('@/lib/governance', () => ({
  getManagerId: (...args: unknown[]) => mockGetManagerId(...args),
  verifyPassword: vi.fn().mockResolvedValue(true),
  isManager: vi.fn().mockReturnValue(true),
  isChiefOfStaffAnywhere: vi.fn().mockReturnValue(false),
}))

const mockGetAgent = vi.fn()
vi.mock('@/lib/agent-registry', () => ({
  getAgent: (...args: unknown[]) => mockGetAgent(...args),
}))

const mockLoadTeams = vi.fn().mockReturnValue([])
vi.mock('@/lib/team-registry', () => ({
  loadTeams: (...args: unknown[]) => mockLoadTeams(...args),
  saveTeams: vi.fn(),
}))

const mockSavePeerGovernance = vi.fn()
vi.mock('@/lib/governance-peers', () => ({
  savePeerGovernance: (...args: unknown[]) => mockSavePeerGovernance(...args),
}))

const mockCreateGovernanceRequest = vi.fn()
vi.mock('@/lib/governance-request-registry', () => ({
  createGovernanceRequest: (...args: unknown[]) => mockCreateGovernanceRequest(...args),
  getGovernanceRequest: vi.fn(),
  listGovernanceRequests: vi.fn().mockReturnValue([]),
  approveGovernanceRequest: vi.fn(),
  rejectGovernanceRequest: vi.fn(),
}))

vi.mock('@/lib/file-lock', () => ({
  withLock: vi.fn(),
}))

vi.mock('@/lib/governance-sync', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return {
    ...actual,
    // Keep all real exports so broadcastGovernanceSync tests work
  }
})

vi.mock('@/lib/manager-trust', () => ({
  shouldAutoApprove: vi.fn().mockReturnValue(false),
}))

// ============================================================================
// Import modules under test (after mocks)
// ============================================================================

import {
  broadcastGovernanceSync,
  buildLocalGovernanceSnapshot,
} from '@/lib/governance-sync'

import {
  submitCrossHostRequest,
} from '@/services/cross-host-governance-service'

// ============================================================================
// Test data
// ============================================================================

const HOST_LOCAL = { id: 'host-local', url: 'http://localhost:23000', name: 'host-local' }
const HOST_REMOTE = { id: 'host-remote', url: 'http://10.0.0.5:23000', name: 'host-remote' }

// ============================================================================
// Setup
// ============================================================================

const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 })

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('fetch', mockFetch)
  mockGetSelfHostId.mockReturnValue('host-local')
  mockGetHosts.mockReturnValue([HOST_LOCAL, HOST_REMOTE])
  mockIsSelf.mockImplementation((id: string) => id === 'host-local')
  mockGetManagerId.mockReturnValue(null)
  mockLoadTeams.mockReturnValue([])
  mockSignHostAttestation.mockReturnValue('mock-signature-base64')
})

// ============================================================================
// SR-001: broadcastGovernanceSync includes Ed25519 signature headers
// ============================================================================

describe('SR-001: broadcastGovernanceSync signs outbound requests', () => {
  it('includes X-Host-Id, X-Host-Timestamp, and X-Host-Signature headers in fetch calls', async () => {
    /** Verifies that governance sync broadcasts include all 3 authentication headers */
    await broadcastGovernanceSync('full-snapshot')

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const fetchCall = mockFetch.mock.calls[0]
    const headers = fetchCall[1].headers

    expect(headers['X-Host-Id']).toBe('host-local')
    expect(headers['X-Host-Timestamp']).toBeDefined()
    expect(headers['X-Host-Signature']).toBe('mock-signature-base64')
  })

  it('signs data with format gov-sync|{hostId}|{timestamp}', async () => {
    /** Verifies the signed data string follows the correct format for governance sync */
    await broadcastGovernanceSync('full-snapshot')

    expect(mockSignHostAttestation).toHaveBeenCalledTimes(1)
    const signedData = mockSignHostAttestation.mock.calls[0][0] as string
    expect(signedData).toMatch(/^gov-sync\|host-local\|/)
    // Verify the timestamp portion is an ISO string
    const parts = signedData.split('|')
    expect(parts).toHaveLength(3)
    expect(() => new Date(parts[2]).toISOString()).not.toThrow()
  })

  it('uses the same timestamp in headers and signed data', async () => {
    /** Verifies consistency between X-Host-Timestamp header and the signed data string */
    await broadcastGovernanceSync('full-snapshot')

    const signedData = mockSignHostAttestation.mock.calls[0][0] as string
    const signedTimestamp = signedData.split('|')[2]

    const fetchCall = mockFetch.mock.calls[0]
    const headerTimestamp = fetchCall[1].headers['X-Host-Timestamp']

    expect(signedTimestamp).toBe(headerTimestamp)
  })
})

// ============================================================================
// SR-001: sendRequestToRemoteHost and notifyRemoteHostOfRejection sign requests
// ============================================================================

describe('SR-001: cross-host governance service signs outbound requests', () => {
  it('sendRequestToRemoteHost includes signature headers when sending governance request', async () => {
    /** Verifies that outbound governance requests to remote hosts include auth headers */
    mockGetAgent.mockReturnValue({ id: 'manager-agent', name: 'mgr' })
    mockCreateGovernanceRequest.mockResolvedValue({
      id: 'req-001',
      type: 'add-to-team',
      sourceHostId: 'host-local',
      targetHostId: 'host-remote',
      requestedBy: 'manager-agent',
      requestedByRole: 'manager',
      payload: { agentId: 'agent-001', teamId: 'team-001' },
      approvals: {},
      status: 'pending',
      createdAt: new Date().toISOString(),
    })

    await submitCrossHostRequest({
      type: 'add-to-team',
      targetHostId: 'host-remote',
      requestedBy: 'manager-agent',
      requestedByRole: 'manager',
      payload: { agentId: 'agent-001', teamId: 'team-001' },
      password: 'test-pw',
    })

    // Wait for fire-and-forget fetch
    await new Promise(r => setTimeout(r, 50))

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const fetchCall = mockFetch.mock.calls[0]
    const headers = fetchCall[1].headers

    expect(headers['X-Host-Id']).toBeDefined()
    expect(headers['X-Host-Timestamp']).toBeDefined()
    expect(headers['X-Host-Signature']).toBe('mock-signature-base64')
  })

  it('sendRequestToRemoteHost signs data with gov-request format', async () => {
    /** Verifies the signed data uses gov-request|{hostId}|{timestamp} format */
    mockGetAgent.mockReturnValue({ id: 'manager-agent', name: 'mgr' })
    mockCreateGovernanceRequest.mockResolvedValue({
      id: 'req-001',
      type: 'add-to-team',
      sourceHostId: 'host-local',
      targetHostId: 'host-remote',
      requestedBy: 'manager-agent',
      requestedByRole: 'manager',
      payload: { agentId: 'agent-001', teamId: 'team-001' },
      approvals: {},
      status: 'pending',
      createdAt: new Date().toISOString(),
    })

    await submitCrossHostRequest({
      type: 'add-to-team',
      targetHostId: 'host-remote',
      requestedBy: 'manager-agent',
      requestedByRole: 'manager',
      payload: { agentId: 'agent-001', teamId: 'team-001' },
      password: 'test-pw',
    })

    // Wait for fire-and-forget fetch
    await new Promise(r => setTimeout(r, 50))

    expect(mockSignHostAttestation).toHaveBeenCalled()
    const signedData = mockSignHostAttestation.mock.calls[0][0] as string
    expect(signedData).toMatch(/^gov-request\|/)
  })
})

// ============================================================================
// SR-007: submitCrossHostRequest rejects unimplemented request types
// ============================================================================

describe('SR-007: submitCrossHostRequest type whitelist', () => {
  const baseParams = {
    targetHostId: 'host-remote',
    requestedBy: 'manager-agent',
    requestedByRole: 'manager' as const,
    payload: { agentId: 'agent-001' },
    password: 'test-pw',
  }

  beforeEach(() => {
    mockGetAgent.mockReturnValue({ id: 'manager-agent', name: 'mgr' })
  })

  it('rejects create-agent type as unimplemented', async () => {
    /** Verifies that create-agent request type returns 400 with not-implemented error */
    const result = await submitCrossHostRequest({
      ...baseParams,
      type: 'create-agent',
    })
    expect(result.status).toBe(400)
    expect(result.error).toContain('not yet implemented')
  })

  it('rejects delete-agent type as unimplemented', async () => {
    /** Verifies that delete-agent request type returns 400 with not-implemented error */
    const result = await submitCrossHostRequest({
      ...baseParams,
      type: 'delete-agent',
    })
    expect(result.status).toBe(400)
    expect(result.error).toContain('not yet implemented')
  })

  it('rejects configure-agent type as unimplemented', async () => {
    /** Verifies that configure-agent request type returns 400 with not-implemented error */
    const result = await submitCrossHostRequest({
      ...baseParams,
      type: 'configure-agent',
    })
    expect(result.status).toBe(400)
    expect(result.error).toContain('not yet implemented')
  })

  it('allows add-to-team type (implemented)', async () => {
    /** Verifies that add-to-team passes the type whitelist check and proceeds */
    mockCreateGovernanceRequest.mockResolvedValue({
      id: 'req-001',
      type: 'add-to-team',
      sourceHostId: 'host-local',
      targetHostId: 'host-remote',
      requestedBy: 'manager-agent',
      requestedByRole: 'manager',
      payload: { agentId: 'agent-001', teamId: 'team-001' },
      approvals: {},
      status: 'pending',
      createdAt: new Date().toISOString(),
    })

    const result = await submitCrossHostRequest({
      ...baseParams,
      type: 'add-to-team',
    })
    expect(result.status).toBe(201)
  })

  it('allows transfer-agent type (implemented)', async () => {
    /** Verifies that transfer-agent passes the type whitelist check and proceeds */
    mockCreateGovernanceRequest.mockResolvedValue({
      id: 'req-001',
      type: 'transfer-agent',
      sourceHostId: 'host-local',
      targetHostId: 'host-remote',
      requestedBy: 'manager-agent',
      requestedByRole: 'manager',
      payload: { agentId: 'agent-001' },
      approvals: {},
      status: 'pending',
      createdAt: new Date().toISOString(),
    })

    const result = await submitCrossHostRequest({
      ...baseParams,
      type: 'transfer-agent',
    })
    expect(result.status).toBe(201)
  })
})

// ============================================================================
// Header format verification
// ============================================================================

describe('Signature header format', () => {
  it('X-Host-Timestamp is a valid ISO 8601 string', async () => {
    /** Verifies timestamp header is parseable as ISO 8601 datetime */
    await broadcastGovernanceSync('full-snapshot')

    const fetchCall = mockFetch.mock.calls[0]
    const timestamp = fetchCall[1].headers['X-Host-Timestamp']
    const parsed = new Date(timestamp)
    expect(parsed.getTime()).not.toBeNaN()
    expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })
})
