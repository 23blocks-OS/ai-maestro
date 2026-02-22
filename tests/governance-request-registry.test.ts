/**
 * Unit tests for lib/governance-request-registry.ts
 *
 * Coverage: 30 tests across 10 exported functions
 * - loadGovernanceRequests: missing file defaults, existing file read, corrupted JSON backup
 * - saveGovernanceRequests: atomic write via temp-file-then-rename
 * - getGovernanceRequest: by ID found and not found
 * - listGovernanceRequests: no filter, by status, by hostId, by agentId, by type (NT-005)
 * - createGovernanceRequest: UUID generation, persistence, note field
 * - approveGovernanceRequest: sourceCOS, targetManager, remote-approved, local-approved,
 *     both-managers auto-execute, unknown ID, rejected guard, executed guard
 * - rejectGovernanceRequest: sets rejected + reason, executed guard
 * - executeGovernanceRequest: sets executed, rejected guard
 * - purgeOldRequests: purges terminal-state + expires stale pending (NT-006)
 * - expirePendingRequests: TTL-based auto-rejection of stale pending requests (NT-006)
 *
 * Mocking strategy:
 * - fs (external I/O) -- mocked with in-memory fsStore
 * - @/lib/file-lock -- withLock executes callback immediately (no real locking)
 * - crypto -- randomUUID returns predictable IDs
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import path from 'path'
import os from 'os'

// ============================================================================
// Predictable UUID tracking
// ============================================================================

let uuidCounter = 0
const nextUUID = () => `uuid-${String(++uuidCounter).padStart(4, '0')}`

// ============================================================================
// In-memory filesystem mock (same pattern as governance-peers.test.ts)
// ============================================================================

let fsStore: Record<string, string> = {}

vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn((filePath: string) => filePath in fsStore),
    mkdirSync: vi.fn(),
    readFileSync: vi.fn((filePath: string) => {
      if (filePath in fsStore) return fsStore[filePath]
      throw new Error(`ENOENT: no such file or directory, open '${filePath}'`)
    }),
    writeFileSync: vi.fn((filePath: string, data: string) => {
      fsStore[filePath] = data
    }),
    renameSync: vi.fn((src: string, dest: string) => {
      if (!(src in fsStore)) throw new Error(`ENOENT: no such file or directory, rename '${src}'`)
      fsStore[dest] = fsStore[src]
      delete fsStore[src]
    }),
    copyFileSync: vi.fn((src: string, dest: string) => {
      if (!(src in fsStore)) throw new Error(`ENOENT: no such file or directory, copy '${src}'`)
      fsStore[dest] = fsStore[src]
    }),
  },
  existsSync: vi.fn((filePath: string) => filePath in fsStore),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn((filePath: string) => {
    if (filePath in fsStore) return fsStore[filePath]
    throw new Error(`ENOENT: no such file or directory, open '${filePath}'`)
  }),
  writeFileSync: vi.fn((filePath: string, data: string) => {
    fsStore[filePath] = data
  }),
  renameSync: vi.fn((src: string, dest: string) => {
    if (!(src in fsStore)) throw new Error(`ENOENT: no such file or directory, rename '${src}'`)
    fsStore[dest] = fsStore[src]
    delete fsStore[src]
  }),
  copyFileSync: vi.fn((src: string, dest: string) => {
    if (!(src in fsStore)) throw new Error(`ENOENT: no such file or directory, copy '${src}'`)
    fsStore[dest] = fsStore[src]
  }),
}))

// ============================================================================
// Mock file-lock: withLock just executes the callback immediately
// ============================================================================

vi.mock('@/lib/file-lock', () => ({
  withLock: vi.fn(async (_name: string, fn: () => unknown) => fn()),
}))

// ============================================================================
// Mock crypto: randomUUID returns predictable sequential IDs
// ============================================================================

vi.mock('crypto', () => ({
  default: {
    randomUUID: vi.fn(() => nextUUID()),
  },
  randomUUID: vi.fn(() => nextUUID()),
}))

// ============================================================================
// Import module under test (after mocks are declared)
// ============================================================================

import {
  loadGovernanceRequests,
  saveGovernanceRequests,
  getGovernanceRequest,
  listGovernanceRequests,
  createGovernanceRequest,
  approveGovernanceRequest,
  rejectGovernanceRequest,
  executeGovernanceRequest,
  purgeOldRequests,
  expirePendingRequests,
} from '@/lib/governance-request-registry'

import type {
  GovernanceRequest,
  GovernanceRequestsFile,
} from '@/types/governance-request'

// ============================================================================
// Test helpers
// ============================================================================

const AIMAESTRO_DIR = path.join(os.homedir(), '.aimaestro')
const REQUESTS_FILE = path.join(AIMAESTRO_DIR, 'governance-requests.json')

/** Build a valid GovernanceRequestsFile with optional request list */
function makeRequestsFile(requests: GovernanceRequest[] = []): GovernanceRequestsFile {
  return { version: 1, requests }
}

/** Build a valid GovernanceRequest with sensible defaults and optional overrides */
function makeRequest(overrides: Partial<GovernanceRequest> = {}): GovernanceRequest {
  return {
    id: 'req-default-id',
    type: 'add-to-team',
    sourceHostId: 'host-source',
    targetHostId: 'host-target',
    requestedBy: 'agent-requester@host-source',
    requestedByRole: 'manager',
    payload: {
      agentId: 'agent-payload-1',
      teamId: 'team-alpha',
    },
    approvals: {},
    status: 'pending',
    createdAt: '2025-06-01T12:00:00.000Z',
    updatedAt: '2025-06-01T12:00:00.000Z',
    ...overrides,
  }
}

/** Seed the requests file directly into in-memory fs */
function seedRequestsFile(file: GovernanceRequestsFile): void {
  fsStore[REQUESTS_FILE] = JSON.stringify(file, null, 2)
}

// ============================================================================
// Setup
// ============================================================================

beforeEach(() => {
  fsStore = {}
  uuidCounter = 0
  vi.clearAllMocks()
})

// ============================================================================
// loadGovernanceRequests
// ============================================================================

describe('loadGovernanceRequests', () => {
  it('returns defaults when file missing', () => {
    /** Verifies that a missing requests file results in default empty structure being created */
    const result = loadGovernanceRequests()

    expect(result.version).toBe(1)
    expect(result.requests).toEqual([])
    // Also verify that the file was written to disk (first-time initialization)
    expect(fsStore[REQUESTS_FILE]).toBeDefined()
    const written = JSON.parse(fsStore[REQUESTS_FILE])
    expect(written.version).toBe(1)
    expect(written.requests).toEqual([])
  })

  it('reads existing file correctly', () => {
    /** Verifies correct deserialization of an existing governance requests JSON file */
    const req1 = makeRequest({ id: 'req-001', type: 'add-to-team', status: 'pending' })
    const req2 = makeRequest({ id: 'req-002', type: 'assign-cos', status: 'executed' })
    seedRequestsFile(makeRequestsFile([req1, req2]))

    const result = loadGovernanceRequests()

    expect(result.version).toBe(1)
    expect(result.requests).toHaveLength(2)
    expect(result.requests[0].id).toBe('req-001')
    expect(result.requests[0].type).toBe('add-to-team')
    expect(result.requests[1].id).toBe('req-002')
    expect(result.requests[1].status).toBe('executed')
  })

  it('handles corrupted JSON gracefully and backs up corrupted file', () => {
    /** Verifies graceful degradation: corrupted file is backed up, defaults are returned */
    fsStore[REQUESTS_FILE] = '{this-is-not-valid-json!!!'

    const result = loadGovernanceRequests()

    expect(result.version).toBe(1)
    expect(result.requests).toEqual([])
    // Verify that a backup was created (copyFileSync was called with .corrupted.* path)
    const backupKeys = Object.keys(fsStore).filter(k => k.includes('.corrupted.'))
    expect(backupKeys.length).toBe(1)
    expect(fsStore[backupKeys[0]]).toBe('{this-is-not-valid-json!!!')
    // Verify the file was healed with defaults
    const healed = JSON.parse(fsStore[REQUESTS_FILE])
    expect(healed.version).toBe(1)
    expect(healed.requests).toEqual([])
  })
})

// ============================================================================
// saveGovernanceRequests
// ============================================================================

describe('saveGovernanceRequests', () => {
  it('writes atomically via temp-file-then-rename', () => {
    /** Verifies the atomic write pattern: write to .tmp first, then rename to final */
    const file = makeRequestsFile([makeRequest({ id: 'req-atomic' })])

    saveGovernanceRequests(file)

    // The .tmp file should no longer exist (it was renamed)
    const tmpFile = REQUESTS_FILE + '.tmp'
    expect(fsStore[tmpFile]).toBeUndefined()
    // The final file should exist with correct content
    expect(fsStore[REQUESTS_FILE]).toBeDefined()
    const written = JSON.parse(fsStore[REQUESTS_FILE])
    expect(written.requests[0].id).toBe('req-atomic')
  })
})

// ============================================================================
// getGovernanceRequest
// ============================================================================

describe('getGovernanceRequest', () => {
  it('returns request by ID', () => {
    /** Verifies that an existing request is found and returned by its ID */
    const req = makeRequest({ id: 'req-findme', type: 'transfer-agent', status: 'remote-approved' })
    seedRequestsFile(makeRequestsFile([req]))

    const result = getGovernanceRequest('req-findme')

    expect(result).not.toBeNull()
    expect(result!.id).toBe('req-findme')
    expect(result!.type).toBe('transfer-agent')
    expect(result!.status).toBe('remote-approved')
  })

  it('returns null for unknown ID', () => {
    /** Verifies that querying a non-existent ID returns null without throwing */
    seedRequestsFile(makeRequestsFile([makeRequest({ id: 'req-exists' })]))

    const result = getGovernanceRequest('req-does-not-exist')

    expect(result).toBeNull()
  })
})

// ============================================================================
// listGovernanceRequests
// ============================================================================

describe('listGovernanceRequests', () => {
  const pendingReq = makeRequest({
    id: 'req-pending',
    status: 'pending',
    sourceHostId: 'host-A',
    targetHostId: 'host-B',
    payload: { agentId: 'agent-x', teamId: 'team-1' },
    requestedBy: 'agent-boss@host-A',
  })
  const executedReq = makeRequest({
    id: 'req-executed',
    status: 'executed',
    sourceHostId: 'host-B',
    targetHostId: 'host-C',
    payload: { agentId: 'agent-y', teamId: 'team-2' },
    requestedBy: 'agent-admin@host-B',
  })
  const rejectedReq = makeRequest({
    id: 'req-rejected',
    status: 'rejected',
    sourceHostId: 'host-A',
    targetHostId: 'host-C',
    payload: { agentId: 'agent-z', teamId: 'team-3' },
    requestedBy: 'agent-x',
  })

  beforeEach(() => {
    seedRequestsFile(makeRequestsFile([pendingReq, executedReq, rejectedReq]))
  })

  it('returns all requests when no filter', () => {
    /** Verifies that calling with no filter returns the complete request list */
    const result = listGovernanceRequests()

    expect(result).toHaveLength(3)
    expect(result.map(r => r.id)).toEqual(['req-pending', 'req-executed', 'req-rejected'])
  })

  it('filters by status', () => {
    /** Verifies that filtering by status returns only matching requests */
    const result = listGovernanceRequests({ status: 'executed' })

    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('req-executed')
  })

  it('filters by hostId (source or target)', () => {
    /** Verifies hostId filter matches either sourceHostId or targetHostId */
    // host-A is source of pendingReq and rejectedReq
    const resultA = listGovernanceRequests({ hostId: 'host-A' })
    expect(resultA).toHaveLength(2)
    expect(resultA.map(r => r.id)).toEqual(['req-pending', 'req-rejected'])

    // host-C is target of executedReq and rejectedReq
    const resultC = listGovernanceRequests({ hostId: 'host-C' })
    expect(resultC).toHaveLength(2)
    expect(resultC.map(r => r.id)).toEqual(['req-executed', 'req-rejected'])
  })

  it('filters by agentId (payload or requestedBy)', () => {
    /** Verifies agentId filter matches either payload.agentId or requestedBy */
    // agent-x is both payload.agentId of pendingReq AND requestedBy of rejectedReq
    const result = listGovernanceRequests({ agentId: 'agent-x' })
    expect(result).toHaveLength(2)
    expect(result.map(r => r.id)).toEqual(['req-pending', 'req-rejected'])
  })

  it('filters by type', () => {
    /** NT-005: Verifies that filtering by request type returns only matching requests */
    // All three requests in the beforeEach fixture use default type 'add-to-team'.
    // Override one to a different type to test filtering.
    seedRequestsFile(makeRequestsFile([
      makeRequest({ id: 'req-add', type: 'add-to-team', status: 'pending' }),
      makeRequest({ id: 'req-config', type: 'configure-agent', status: 'pending' }),
      makeRequest({ id: 'req-transfer', type: 'transfer-agent', status: 'pending' }),
    ]))

    const configOnly = listGovernanceRequests({ type: 'configure-agent' })
    expect(configOnly).toHaveLength(1)
    expect(configOnly[0].id).toBe('req-config')

    const addOnly = listGovernanceRequests({ type: 'add-to-team' })
    expect(addOnly).toHaveLength(1)
    expect(addOnly[0].id).toBe('req-add')

    // Non-existent type returns empty
    const noMatch = listGovernanceRequests({ type: 'assign-cos' })
    expect(noMatch).toHaveLength(0)
  })
})

// ============================================================================
// createGovernanceRequest
// ============================================================================

describe('createGovernanceRequest', () => {
  it('creates request with UUID and pending status', async () => {
    /** Verifies that a new request gets a UUID, pending status, and correct fields */
    seedRequestsFile(makeRequestsFile([]))

    const result = await createGovernanceRequest({
      type: 'add-to-team',
      sourceHostId: 'host-alpha',
      targetHostId: 'host-beta',
      requestedBy: 'agent-mgr@host-alpha',
      requestedByRole: 'manager',
      payload: { agentId: 'agent-new', teamId: 'team-main' },
    })

    expect(result.id).toBe('uuid-0001')
    expect(result.status).toBe('pending')
    expect(result.type).toBe('add-to-team')
    expect(result.sourceHostId).toBe('host-alpha')
    expect(result.targetHostId).toBe('host-beta')
    expect(result.requestedBy).toBe('agent-mgr@host-alpha')
    expect(result.requestedByRole).toBe('manager')
    expect(result.payload.agentId).toBe('agent-new')
    expect(result.payload.teamId).toBe('team-main')
    expect(result.approvals).toEqual({})
    expect(result.createdAt).toBeDefined()
    expect(result.updatedAt).toBeDefined()
    expect(result.note).toBeUndefined()
  })

  it('persists request to file', async () => {
    /** Verifies that the created request is written to disk and can be loaded back */
    seedRequestsFile(makeRequestsFile([]))

    await createGovernanceRequest({
      type: 'assign-cos',
      sourceHostId: 'host-1',
      targetHostId: 'host-2',
      requestedBy: 'agent-boss@host-1',
      requestedByRole: 'manager',
      payload: { agentId: 'agent-cos-candidate', teamId: 'team-ops' },
    })

    // Load from disk to verify persistence
    const loaded = loadGovernanceRequests()
    expect(loaded.requests).toHaveLength(1)
    expect(loaded.requests[0].id).toBe('uuid-0001')
    expect(loaded.requests[0].type).toBe('assign-cos')
    expect(loaded.requests[0].payload.agentId).toBe('agent-cos-candidate')
  })

  it('includes note when provided', async () => {
    /** Verifies that the optional note field is stored on the request */
    seedRequestsFile(makeRequestsFile([]))

    const result = await createGovernanceRequest({
      type: 'transfer-agent',
      sourceHostId: 'host-src',
      targetHostId: 'host-dst',
      requestedBy: 'agent-mgr@host-src',
      requestedByRole: 'chief-of-staff',
      payload: { agentId: 'agent-moving', fromTeamId: 'team-old', toTeamId: 'team-new' },
      note: 'Urgently needed for the new project team',
    })

    expect(result.note).toBe('Urgently needed for the new project team')
  })
})

// ============================================================================
// approveGovernanceRequest
// ============================================================================

describe('approveGovernanceRequest', () => {
  it('records sourceCOS approval', async () => {
    /** Verifies that sourceCOS approval is recorded with correct agent and timestamp */
    const req = makeRequest({ id: 'req-approve-1', status: 'pending' })
    seedRequestsFile(makeRequestsFile([req]))

    const result = await approveGovernanceRequest('req-approve-1', 'agent-cos-src', 'sourceCOS')

    expect(result).not.toBeNull()
    expect(result!.approvals.sourceCOS).toBeDefined()
    expect(result!.approvals.sourceCOS!.approved).toBe(true)
    expect(result!.approvals.sourceCOS!.agentId).toBe('agent-cos-src')
    expect(result!.approvals.sourceCOS!.at).toBeDefined()
  })

  it('records targetManager approval', async () => {
    /** Verifies that targetManager approval is recorded correctly */
    const req = makeRequest({ id: 'req-approve-2', status: 'pending' })
    seedRequestsFile(makeRequestsFile([req]))

    const result = await approveGovernanceRequest('req-approve-2', 'agent-mgr-tgt', 'targetManager')

    expect(result).not.toBeNull()
    expect(result!.approvals.targetManager).toBeDefined()
    expect(result!.approvals.targetManager!.approved).toBe(true)
    expect(result!.approvals.targetManager!.agentId).toBe('agent-mgr-tgt')
  })

  it('sets status to remote-approved with source-only approval', async () => {
    /** Verifies that only source-side approval results in remote-approved status */
    const req = makeRequest({ id: 'req-remote', status: 'pending' })
    seedRequestsFile(makeRequestsFile([req]))

    const result = await approveGovernanceRequest('req-remote', 'agent-cos-src', 'sourceCOS')

    expect(result!.status).toBe('remote-approved')
  })

  it('sets status to local-approved with target-only approval', async () => {
    /** Verifies that only target-side approval results in local-approved status */
    const req = makeRequest({ id: 'req-local', status: 'pending' })
    seedRequestsFile(makeRequestsFile([req]))

    const result = await approveGovernanceRequest('req-local', 'agent-mgr-tgt', 'targetManager')

    expect(result!.status).toBe('local-approved')
  })

  it('sets status to executed when both managers approve', async () => {
    /** Verifies auto-execute: when both sourceManager and targetManager approve, status becomes executed */
    const req = makeRequest({
      id: 'req-both',
      status: 'pending',
      approvals: {
        sourceManager: { approved: true, agentId: 'agent-mgr-src', at: '2025-06-01T12:00:00Z' },
      },
    })
    seedRequestsFile(makeRequestsFile([req]))

    // Now add targetManager approval -- both managers should trigger auto-execute
    const result = await approveGovernanceRequest('req-both', 'agent-mgr-tgt', 'targetManager')

    expect(result!.status).toBe('executed')
    expect(result!.approvals.sourceManager!.approved).toBe(true)
    expect(result!.approvals.targetManager!.approved).toBe(true)
  })

  it('returns null for unknown request ID', async () => {
    /** Verifies that approving a non-existent request returns null */
    seedRequestsFile(makeRequestsFile([]))

    const result = await approveGovernanceRequest('req-ghost', 'agent-x', 'sourceCOS')

    expect(result).toBeNull()
  })

  it('does not modify rejected request', async () => {
    /** Verifies that a rejected request is returned unchanged when approval is attempted */
    const req = makeRequest({
      id: 'req-rejected',
      status: 'rejected',
      rejectReason: 'Policy violation',
    })
    seedRequestsFile(makeRequestsFile([req]))

    const result = await approveGovernanceRequest('req-rejected', 'agent-mgr', 'sourceManager')

    expect(result).not.toBeNull()
    expect(result!.status).toBe('rejected')
    // Approval should NOT have been recorded
    expect(result!.approvals.sourceManager).toBeUndefined()
  })

  it('does not modify already executed request', async () => {
    /** Verifies that an executed request is returned unchanged when approval is attempted */
    const req = makeRequest({
      id: 'req-done',
      status: 'executed',
      approvals: {
        sourceManager: { approved: true, agentId: 'agent-mgr-1', at: '2025-06-01T12:00:00Z' },
        targetManager: { approved: true, agentId: 'agent-mgr-2', at: '2025-06-01T12:01:00Z' },
      },
    })
    seedRequestsFile(makeRequestsFile([req]))

    const result = await approveGovernanceRequest('req-done', 'agent-new', 'targetCOS')

    expect(result).not.toBeNull()
    expect(result!.status).toBe('executed')
    // targetCOS should NOT have been added
    expect(result!.approvals.targetCOS).toBeUndefined()
  })
})

// ============================================================================
// rejectGovernanceRequest
// ============================================================================

describe('rejectGovernanceRequest', () => {
  it('sets status to rejected with reason', async () => {
    /** Verifies that rejection records the status and reason correctly */
    const req = makeRequest({ id: 'req-reject-1', status: 'pending' })
    seedRequestsFile(makeRequestsFile([req]))

    const result = await rejectGovernanceRequest('req-reject-1', 'agent-mgr-tgt', 'Agent is not qualified')

    expect(result).not.toBeNull()
    expect(result!.status).toBe('rejected')
    expect(result!.rejectReason).toBe('Agent is not qualified')
    expect(result!.updatedAt).toBeDefined()
  })

  it('cannot reject already executed request', async () => {
    /** Verifies that an executed request is returned unchanged when rejection is attempted */
    const req = makeRequest({ id: 'req-exec-no-reject', status: 'executed' })
    seedRequestsFile(makeRequestsFile([req]))

    const result = await rejectGovernanceRequest('req-exec-no-reject', 'agent-mgr', 'Too late')

    expect(result).not.toBeNull()
    expect(result!.status).toBe('executed')
    expect(result!.rejectReason).toBeUndefined()
  })
})

// ============================================================================
// executeGovernanceRequest
// ============================================================================

describe('executeGovernanceRequest', () => {
  it('sets status to executed', async () => {
    /** Verifies that a pending request can be manually set to executed */
    const req = makeRequest({ id: 'req-manual-exec', status: 'remote-approved' })
    seedRequestsFile(makeRequestsFile([req]))

    const result = await executeGovernanceRequest('req-manual-exec')

    expect(result).not.toBeNull()
    expect(result!.status).toBe('executed')
    expect(result!.updatedAt).toBeDefined()
  })

  it('cannot execute rejected request', async () => {
    /** Verifies that a rejected request is returned unchanged when execution is attempted */
    const req = makeRequest({
      id: 'req-rejected-no-exec',
      status: 'rejected',
      rejectReason: 'Denied by policy',
    })
    seedRequestsFile(makeRequestsFile([req]))

    const result = await executeGovernanceRequest('req-rejected-no-exec')

    expect(result).not.toBeNull()
    expect(result!.status).toBe('rejected')
    expect(result!.rejectReason).toBe('Denied by policy')
  })
})

// ============================================================================
// purgeOldRequests (NT-006)
// ============================================================================

describe('purgeOldRequests', () => {
  it('purges old executed/rejected requests and returns PurgeResult', async () => {
    /** NT-006: Verifies that terminal-state requests older than maxAgeDays are removed */
    const oldDate = new Date(Date.now() - 60 * 86_400_000).toISOString() // 60 days ago
    const recentDate = new Date(Date.now() - 5 * 86_400_000).toISOString() // 5 days ago

    seedRequestsFile(makeRequestsFile([
      makeRequest({ id: 'req-old-executed', status: 'executed', updatedAt: oldDate }),
      makeRequest({ id: 'req-old-rejected', status: 'rejected', updatedAt: oldDate }),
      makeRequest({ id: 'req-recent-executed', status: 'executed', updatedAt: recentDate }),
      makeRequest({ id: 'req-pending-active', status: 'pending', createdAt: recentDate, updatedAt: recentDate }),
    ]))

    const result = await purgeOldRequests(30)

    expect(result.purged).toBe(2) // old executed + old rejected
    expect(result.expired).toBe(0) // pending is recent, not expired

    // Verify persisted state: only recent executed and pending remain
    const loaded = loadGovernanceRequests()
    expect(loaded.requests).toHaveLength(2)
    expect(loaded.requests.map(r => r.id)).toEqual(['req-recent-executed', 'req-pending-active'])
  })

  it('also expires stale pending requests via 7-day TTL', async () => {
    /** NT-006: Verifies that purge also auto-rejects pending requests older than 7 days */
    const stalePendingDate = new Date(Date.now() - 10 * 86_400_000).toISOString() // 10 days ago
    const freshPendingDate = new Date(Date.now() - 2 * 86_400_000).toISOString() // 2 days ago

    seedRequestsFile(makeRequestsFile([
      makeRequest({ id: 'req-stale-pending', status: 'pending', createdAt: stalePendingDate, updatedAt: stalePendingDate }),
      makeRequest({ id: 'req-fresh-pending', status: 'pending', createdAt: freshPendingDate, updatedAt: freshPendingDate }),
    ]))

    const result = await purgeOldRequests(30)

    expect(result.purged).toBe(0) // no terminal-state old requests
    expect(result.expired).toBe(1) // stale pending was expired

    // Verify the stale pending was auto-rejected
    const loaded = loadGovernanceRequests()
    const stale = loaded.requests.find(r => r.id === 'req-stale-pending')
    expect(stale!.status).toBe('rejected')
    expect(stale!.rejectReason).toContain('expired')

    // Fresh pending is untouched
    const fresh = loaded.requests.find(r => r.id === 'req-fresh-pending')
    expect(fresh!.status).toBe('pending')
  })
})

// ============================================================================
// expirePendingRequests (NT-006)
// ============================================================================

describe('expirePendingRequests', () => {
  it('expires pending requests older than TTL days', async () => {
    /** NT-006: Verifies that pending requests older than the specified TTL are auto-rejected */
    const oldDate = new Date(Date.now() - 15 * 86_400_000).toISOString() // 15 days ago
    const recentDate = new Date(Date.now() - 2 * 86_400_000).toISOString() // 2 days ago

    seedRequestsFile(makeRequestsFile([
      makeRequest({ id: 'req-old-pending', status: 'pending', createdAt: oldDate }),
      makeRequest({ id: 'req-recent-pending', status: 'pending', createdAt: recentDate }),
      makeRequest({ id: 'req-executed', status: 'executed', createdAt: oldDate }),
    ]))

    const expired = await expirePendingRequests(7)

    expect(expired).toBe(1) // only the old pending request

    // Verify the old pending was rejected with TTL reason
    const loaded = loadGovernanceRequests()
    const oldReq = loaded.requests.find(r => r.id === 'req-old-pending')
    expect(oldReq!.status).toBe('rejected')
    expect(oldReq!.rejectReason).toContain('TTL')

    // Recent pending untouched
    const recentReq = loaded.requests.find(r => r.id === 'req-recent-pending')
    expect(recentReq!.status).toBe('pending')

    // Executed request untouched (not a pending request)
    const execReq = loaded.requests.find(r => r.id === 'req-executed')
    expect(execReq!.status).toBe('executed')
  })

  it('returns 0 when no pending requests exceed TTL', async () => {
    /** NT-006: Verifies that no expiration occurs when all pending requests are within TTL */
    const recentDate = new Date(Date.now() - 1 * 86_400_000).toISOString() // 1 day ago

    seedRequestsFile(makeRequestsFile([
      makeRequest({ id: 'req-fresh', status: 'pending', createdAt: recentDate }),
    ]))

    const expired = await expirePendingRequests(7)

    expect(expired).toBe(0)
    const loaded = loadGovernanceRequests()
    expect(loaded.requests[0].status).toBe('pending')
  })
})
