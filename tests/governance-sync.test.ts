import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * Unit tests for lib/governance-sync.ts
 *
 * Coverage: 15 tests across 4 exported functions
 * - buildLocalGovernanceSnapshot: 3 tests (structure, manager name resolution, no-manager case)
 * - broadcastGovernanceSync: 5 tests (sends to peers, skips self, handles failures, no peers, catch-all)
 * - handleGovernanceSyncMessage: 4 tests (saves state, sender mismatch, missing teams, all payload fields)
 * - requestPeerSync: 3 tests (success, HTTP error, network error)
 *
 * External dependencies mocked: fetch, hosts-config, governance, agent-registry, team-registry, governance-peers
 */

// ============================================================================
// Mocks — all external dependencies
// ============================================================================

const mockGetHosts = vi.fn()
const mockGetSelfHostId = vi.fn()
const mockIsSelf = vi.fn()
vi.mock('@/lib/hosts-config', () => ({
  getHosts: (...args: unknown[]) => mockGetHosts(...args),
  getSelfHostId: (...args: unknown[]) => mockGetSelfHostId(...args),
  isSelf: (...args: unknown[]) => mockIsSelf(...args),
}))

const mockGetManagerId = vi.fn()
vi.mock('@/lib/governance', () => ({
  getManagerId: (...args: unknown[]) => mockGetManagerId(...args),
}))

const mockGetAgent = vi.fn()
vi.mock('@/lib/agent-registry', () => ({
  getAgent: (...args: unknown[]) => mockGetAgent(...args),
}))

const mockLoadTeams = vi.fn()
vi.mock('@/lib/team-registry', () => ({
  loadTeams: (...args: unknown[]) => mockLoadTeams(...args),
}))

const mockSavePeerGovernance = vi.fn()
vi.mock('@/lib/governance-peers', () => ({
  savePeerGovernance: (...args: unknown[]) => mockSavePeerGovernance(...args),
}))

// CC-P4-003: governance-sync imports host-keys for Ed25519 signing (SR-001).
// Without this mock, real host-keys would try to read ~/.aimaestro/host-keys/ during tests.
vi.mock('@/lib/host-keys', () => ({
  signHostAttestation: vi.fn(() => 'mock-sig'),
  getHostPublicKeyHex: vi.fn(() => 'mock-pubkey'),
  verifyHostAttestation: vi.fn(() => true),
}))

// ============================================================================
// Import module under test (after mocks are defined)
// ============================================================================

import {
  buildLocalGovernanceSnapshot,
  broadcastGovernanceSync,
  handleGovernanceSyncMessage,
  requestPeerSync,
} from '@/lib/governance-sync'
import type { GovernanceSyncMessage, GovernancePeerState } from '@/types/governance'

// ============================================================================
// Test data factories
// ============================================================================

/** Realistic Team objects matching the Team interface */
function makeTeam(overrides: Record<string, unknown> = {}) {
  return {
    id: 'team-backend-001',
    name: 'Backend Squad',
    type: 'closed' as const,
    description: 'Handles all backend services',
    agentIds: ['agent-a1', 'agent-a2', 'agent-a3'],
    chiefOfStaffId: 'agent-a1',
    createdAt: '2025-06-01T10:00:00.000Z',
    updatedAt: '2025-06-15T14:30:00.000Z',
    ...overrides,
  }
}

/** Realistic host config entries */
function makeHost(id: string, url: string) {
  return { id, url, name: id }
}

/** Build a valid GovernanceSyncMessage */
function makeSyncMessage(overrides: Partial<GovernanceSyncMessage> = {}): GovernanceSyncMessage {
  return {
    type: 'manager-changed',
    fromHostId: 'host-remote-1',
    timestamp: '2025-06-20T12:00:00.000Z',
    payload: {
      managerId: 'agent-mgr-remote',
      managerName: 'remote-manager',
      teams: [
        {
          id: 'team-remote-1',
          name: 'Remote Alpha',
          type: 'closed',
          chiefOfStaffId: null,
          agentIds: ['agent-r1', 'agent-r2'],
        },
      ],
    },
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
  // Default: self host is host-local
  mockGetSelfHostId.mockReturnValue('host-local')
  mockGetManagerId.mockReturnValue(null)
  mockGetAgent.mockReturnValue(null)
  mockLoadTeams.mockReturnValue([])
  mockGetHosts.mockReturnValue([])
  mockIsSelf.mockImplementation((id: string) => id === 'host-local')
})

afterEach(() => {
  // Restore global fetch if overridden
  globalThis.fetch = originalFetch
})

// ============================================================================
// buildLocalGovernanceSnapshot
// ============================================================================

describe('buildLocalGovernanceSnapshot', () => {
  it('returns correct structure with hostId, managerId, managerName, and summarized teams', () => {
    /** Verifies the snapshot shape includes all required fields and teams are summarized (no extra fields) */
    const team1 = makeTeam()
    const team2 = makeTeam({
      id: 'team-frontend-002',
      name: 'Frontend Crew',
      type: 'closed',
      agentIds: ['agent-f1'],
      chiefOfStaffId: null,
    })
    mockGetSelfHostId.mockReturnValue('host-local')
    mockGetManagerId.mockReturnValue('agent-mgr-001')
    mockGetAgent.mockReturnValue({ id: 'agent-mgr-001', name: 'orchestrator-master' })
    mockLoadTeams.mockReturnValue([team1, team2])

    const snapshot = buildLocalGovernanceSnapshot()

    expect(snapshot.hostId).toBe('host-local')
    expect(snapshot.managerId).toBe('agent-mgr-001')
    expect(snapshot.managerName).toBe('orchestrator-master')
    expect(snapshot.teams).toHaveLength(2)
    // Verify team summary only has the subset of fields (no description, createdAt, updatedAt)
    expect(snapshot.teams[0]).toEqual({
      id: 'team-backend-001',
      name: 'Backend Squad',
      type: 'closed',
      chiefOfStaffId: 'agent-a1',
      agentIds: ['agent-a1', 'agent-a2', 'agent-a3'],
    })
    expect(snapshot.teams[1]).toEqual({
      id: 'team-frontend-002',
      name: 'Frontend Crew',
      type: 'closed',
      chiefOfStaffId: null,
      agentIds: ['agent-f1'],
    })
    // Snapshot must NOT contain lastSyncAt or ttl (those are added by the receiver)
    expect(snapshot).not.toHaveProperty('lastSyncAt')
    expect(snapshot).not.toHaveProperty('ttl')
  })

  it('resolves manager name from agent registry when manager is set', () => {
    /** Verifies resolveManagerName calls getAgent with the managerId and returns agent.name */
    mockGetManagerId.mockReturnValue('agent-boss-42')
    mockGetAgent.mockReturnValue({ id: 'agent-boss-42', name: 'boss-agent' })
    mockLoadTeams.mockReturnValue([])

    const snapshot = buildLocalGovernanceSnapshot()

    expect(mockGetAgent).toHaveBeenCalledWith('agent-boss-42')
    expect(snapshot.managerId).toBe('agent-boss-42')
    expect(snapshot.managerName).toBe('boss-agent')
  })

  it('returns null managerName when no manager is set', () => {
    /** Verifies that managerId=null leads to managerName=null without calling getAgent */
    mockGetManagerId.mockReturnValue(null)
    mockLoadTeams.mockReturnValue([])

    const snapshot = buildLocalGovernanceSnapshot()

    expect(snapshot.managerId).toBeNull()
    expect(snapshot.managerName).toBeNull()
    // resolveManagerName should short-circuit — getAgent should NOT be called
    expect(mockGetAgent).not.toHaveBeenCalled()
  })
})

// ============================================================================
// broadcastGovernanceSync
// ============================================================================

describe('broadcastGovernanceSync', () => {
  it('sends POST to all peer hosts with full snapshot in payload', async () => {
    /** Verifies each peer receives a POST with the GovernanceSyncMessage including snapshot fields */
    const hosts = [
      makeHost('host-local', 'http://localhost:23000'),
      makeHost('host-remote-1', 'http://remote1:23000'),
      makeHost('host-remote-2', 'http://remote2:23000'),
    ]
    mockGetHosts.mockReturnValue(hosts)
    mockIsSelf.mockImplementation((id: string) => id === 'host-local')
    mockGetManagerId.mockReturnValue('agent-mgr-001')
    mockGetAgent.mockReturnValue({ id: 'agent-mgr-001', name: 'orchestrator' })
    mockLoadTeams.mockReturnValue([makeTeam()])

    const fetchSpy = vi.fn().mockResolvedValue({ ok: true })
    globalThis.fetch = fetchSpy

    await broadcastGovernanceSync('manager-changed', { reason: 'election' })

    // Should have sent to 2 peers (not self)
    expect(fetchSpy).toHaveBeenCalledTimes(2)

    // Verify first call targets remote1
    const [url1, opts1] = fetchSpy.mock.calls[0]
    expect(url1).toBe('http://remote1:23000/api/v1/governance/sync')
    expect(opts1.method).toBe('POST')
    expect(opts1.headers['Content-Type']).toBe('application/json')

    // SF-034: Verify Ed25519 signature headers are included in the outbound request
    expect(opts1.headers['X-Host-Id']).toBe('host-local')
    expect(opts1.headers['X-Host-Timestamp']).toBeDefined()
    expect(opts1.headers['X-Host-Signature']).toBe('mock-sig')

    const body1 = JSON.parse(opts1.body)
    expect(body1.type).toBe('manager-changed')
    expect(body1.fromHostId).toBe('host-local')
    expect(body1.payload.managerId).toBe('agent-mgr-001')
    expect(body1.payload.managerName).toBe('orchestrator')
    expect(body1.payload.reason).toBe('election')
    expect(body1.payload.teams).toHaveLength(1)

    // Verify second call targets remote2
    const [url2] = fetchSpy.mock.calls[1]
    expect(url2).toBe('http://remote2:23000/api/v1/governance/sync')
  })

  it('skips broadcast when there are no peer hosts (single-host deployment)', async () => {
    /** Verifies early return when only self host exists — no fetch calls made */
    mockGetHosts.mockReturnValue([makeHost('host-local', 'http://localhost:23000')])
    mockIsSelf.mockImplementation(() => true)

    const fetchSpy = vi.fn()
    globalThis.fetch = fetchSpy

    await broadcastGovernanceSync('team-updated', { teamId: 't1' })

    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('handles HTTP error responses gracefully without throwing', async () => {
    /** Verifies that a non-ok HTTP response is logged but broadcastGovernanceSync does not throw */
    const hosts = [
      makeHost('host-local', 'http://localhost:23000'),
      makeHost('host-remote-1', 'http://remote1:23000'),
    ]
    mockGetHosts.mockReturnValue(hosts)
    mockIsSelf.mockImplementation((id: string) => id === 'host-local')
    mockLoadTeams.mockReturnValue([])

    const fetchSpy = vi.fn().mockResolvedValue({ ok: false, status: 503 })
    globalThis.fetch = fetchSpy
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    // Must not throw
    await expect(broadcastGovernanceSync('team-deleted', { teamId: 'x' })).resolves.toBeUndefined()

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to sync with host-remote-1')
    )
    consoleSpy.mockRestore()
  })

  it('handles network failures for individual peers without blocking others', async () => {
    /** Verifies Promise.allSettled tolerates one peer failing while others succeed */
    const hosts = [
      makeHost('host-local', 'http://localhost:23000'),
      makeHost('host-remote-1', 'http://remote1:23000'),
      makeHost('host-remote-2', 'http://remote2:23000'),
    ]
    mockGetHosts.mockReturnValue(hosts)
    mockIsSelf.mockImplementation((id: string) => id === 'host-local')
    mockLoadTeams.mockReturnValue([])

    const fetchSpy = vi.fn()
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))   // remote1 fails
      .mockResolvedValueOnce({ ok: true })                  // remote2 succeeds
    globalThis.fetch = fetchSpy
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    // Must not throw even when one peer is down
    await expect(broadcastGovernanceSync('transfer-update', {})).resolves.toBeUndefined()

    // Both peers should have been attempted
    expect(fetchSpy).toHaveBeenCalledTimes(2)
    // Failure logged for remote1
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('ECONNREFUSED')
    )
    consoleSpy.mockRestore()
  })

  it('catches unexpected errors in the outer try-catch without throwing', async () => {
    /** Verifies the catch-all protects against getHosts() throwing unexpectedly */
    mockGetHosts.mockImplementation(() => { throw new Error('hosts config corrupted') })
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(broadcastGovernanceSync('manager-changed', {})).resolves.toBeUndefined()

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Broadcast failed unexpectedly')
    )
    consoleSpy.mockRestore()
  })
})

// ============================================================================
// handleGovernanceSyncMessage
// ============================================================================

describe('handleGovernanceSyncMessage', () => {
  it('saves peer governance state to disk with correct fields', () => {
    /** Verifies savePeerGovernance is called with a complete GovernancePeerState from the message */
    const message = makeSyncMessage()
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    handleGovernanceSyncMessage('host-remote-1', message)

    expect(mockSavePeerGovernance).toHaveBeenCalledTimes(1)
    const [hostId, state] = mockSavePeerGovernance.mock.calls[0]
    expect(hostId).toBe('host-remote-1')
    expect(state.hostId).toBe('host-remote-1')
    expect(state.managerId).toBe('agent-mgr-remote')
    expect(state.managerName).toBe('remote-manager')
    expect(state.teams).toHaveLength(1)
    expect(state.teams[0].id).toBe('team-remote-1')
    expect(state.teams[0].name).toBe('Remote Alpha')
    expect(state.teams[0].agentIds).toEqual(['agent-r1', 'agent-r2'])
    expect(state.lastSyncAt).toBe('2025-06-20T12:00:00.000Z')
    expect(state.ttl).toBe(300)
    consoleSpy.mockRestore()
  })

  it('rejects message when fromHostId does not match message.fromHostId (sender mismatch)', () => {
    /** Verifies sender validation prevents spoofed messages from being saved */
    const message = makeSyncMessage({ fromHostId: 'host-remote-1' })
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    // The request-level fromHostId does not match the envelope
    handleGovernanceSyncMessage('host-impersonator', message)

    expect(mockSavePeerGovernance).not.toHaveBeenCalled()
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Sender mismatch')
    )
    consoleSpy.mockRestore()
  })

  it('handles missing teams in payload by defaulting to empty array', () => {
    /** Verifies that a message with no teams field in payload results in an empty teams array */
    const message: GovernanceSyncMessage = {
      type: 'manager-changed',
      fromHostId: 'host-remote-2',
      timestamp: '2025-06-21T08:00:00.000Z',
      payload: {
        managerId: 'agent-mgr-2',
        managerName: 'manager-two',
        // intentionally omitting teams
      },
    }
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    handleGovernanceSyncMessage('host-remote-2', message)

    expect(mockSavePeerGovernance).toHaveBeenCalledTimes(1)
    const [, state] = mockSavePeerGovernance.mock.calls[0]
    expect(state.teams).toEqual([])
    expect(state.managerId).toBe('agent-mgr-2')
    consoleSpy.mockRestore()
  })

  it('handles null managerId and managerName in payload gracefully', () => {
    /** Verifies that null governance fields are preserved correctly in the peer state */
    const message: GovernanceSyncMessage = {
      type: 'team-updated',
      fromHostId: 'host-remote-3',
      timestamp: '2025-06-22T09:00:00.000Z',
      payload: {
        managerId: null,
        managerName: null,
        teams: [
          { id: 't1', name: 'Team One', type: 'closed', chiefOfStaffId: null, agentIds: ['a1'] },
        ],
      },
    }
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    handleGovernanceSyncMessage('host-remote-3', message)

    expect(mockSavePeerGovernance).toHaveBeenCalledTimes(1)
    const [, state] = mockSavePeerGovernance.mock.calls[0]
    expect(state.managerId).toBeNull()
    expect(state.managerName).toBeNull()
    expect(state.teams).toHaveLength(1)
    consoleSpy.mockRestore()
  })
})

// ============================================================================
// requestPeerSync
// ============================================================================

describe('requestPeerSync', () => {
  it('returns parsed GovernancePeerState on successful GET', async () => {
    /** Verifies a successful HTTP 200 response is parsed and returned as GovernancePeerState */
    const peerState: GovernancePeerState = {
      hostId: 'host-remote-1',
      managerId: 'agent-mgr-remote',
      managerName: 'remote-boss',
      teams: [
        { id: 'team-r1', name: 'Remote Alpha', type: 'closed', chiefOfStaffId: 'agent-r1', agentIds: ['agent-r1', 'agent-r2'] },
      ],
      lastSyncAt: '2025-06-20T12:00:00.000Z',
      ttl: 300,
    }

    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(peerState),
    })
    globalThis.fetch = fetchSpy

    const result = await requestPeerSync('http://remote1:23000')

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, opts] = fetchSpy.mock.calls[0]
    expect(url).toBe('http://remote1:23000/api/v1/governance/sync')
    expect(opts.method).toBe('GET')
    expect(opts.headers.Accept).toBe('application/json')
    expect(result).toEqual(peerState)
  })

  it('returns null when peer responds with HTTP error status', async () => {
    /** Verifies that a non-ok HTTP response results in null return and error log */
    const fetchSpy = vi.fn().mockResolvedValue({ ok: false, status: 500 })
    globalThis.fetch = fetchSpy
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await requestPeerSync('http://remote1:23000')

    expect(result).toBeNull()
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('HTTP 500')
    )
    consoleSpy.mockRestore()
  })

  it('returns null when network request fails (e.g., host unreachable)', async () => {
    /** Verifies that a network-level error (ECONNREFUSED, timeout) returns null without throwing */
    const fetchSpy = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'))
    globalThis.fetch = fetchSpy
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await requestPeerSync('http://unreachable-host:23000')

    expect(result).toBeNull()
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('ECONNREFUSED')
    )
    consoleSpy.mockRestore()
  })

  // SF-024: Verify Ed25519 signature headers are sent with GET requests
  it('includes X-Host-Id, X-Host-Timestamp, and X-Host-Signature headers (SR-P2-002)', async () => {
    /** Verifies requestPeerSync signs GET requests with Ed25519 for the protected endpoint */
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        hostId: 'host-remote-1',
        managerId: null,
        managerName: null,
        teams: [],
        lastSyncAt: '2025-06-20T12:00:00.000Z',
        ttl: 300,
      }),
    })
    globalThis.fetch = fetchSpy

    await requestPeerSync('http://remote1:23000')

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [, opts] = fetchSpy.mock.calls[0]
    // Verify signature headers are present
    expect(opts.headers['X-Host-Id']).toBe('host-local')
    expect(opts.headers['X-Host-Timestamp']).toBeDefined()
    expect(opts.headers['X-Host-Signature']).toBe('mock-sig')
  })
})
