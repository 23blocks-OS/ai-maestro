/**
 * Unit tests for lib/manager-trust.ts
 *
 * Coverage: 15 tests across 6 exported functions
 * - loadManagerTrust: missing file defaults, existing file read, corrupted JSON
 * - saveManagerTrust: atomic write via temp+rename
 * - addTrustedManager: new record, update existing, autoApprove default
 * - removeTrustedManager: removes and returns true, returns false when not found
 * - isTrustedManager: true for match, false for wrong managerId, false for unknown host
 * - shouldAutoApprove: true when trusted+autoApprove, false when autoApprove off, false for untrusted
 *
 * Mocking strategy:
 * - fs (external I/O) -- mocked with in-memory fsStore
 * - @/lib/file-lock -- withLock executes callback immediately (no real locking)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import path from 'path'
import os from 'os'

// ============================================================================
// In-memory filesystem mock (same pattern as governance-request-registry.test.ts)
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
// Import module under test (after mocks are declared)
// ============================================================================

import {
  loadManagerTrust,
  saveManagerTrust,
  addTrustedManager,
  removeTrustedManager,
  isTrustedManager,
  shouldAutoApprove,
} from '@/lib/manager-trust'

import type { ManagerTrustFile, ManagerTrust } from '@/lib/manager-trust'
import type { GovernanceRequest } from '@/types/governance-request'

// ============================================================================
// Test helpers
// ============================================================================

const AIMAESTRO_DIR = path.join(os.homedir(), '.aimaestro')
const TRUST_FILE = path.join(AIMAESTRO_DIR, 'manager-trust.json')

/** Build a valid ManagerTrustFile with optional trust list */
function makeTrustFile(trustedManagers: ManagerTrust[] = []): ManagerTrustFile {
  return { version: 1, trustedManagers }
}

/** Build a valid ManagerTrust record with sensible defaults and optional overrides */
function makeTrust(overrides: Partial<ManagerTrust> = {}): ManagerTrust {
  return {
    hostId: 'host-remote',
    managerId: 'manager-uuid',
    managerName: 'Remote Manager',
    trustedAt: '2026-01-01T00:00:00.000Z',
    autoApprove: true,
    ...overrides,
  }
}

/** Seed the trust file directly into in-memory fs */
function seedTrustFile(file: ManagerTrustFile): void {
  fsStore[TRUST_FILE] = JSON.stringify(file, null, 2)
}

/** Build a mock GovernanceRequest for shouldAutoApprove tests */
function makeGovernanceRequest(overrides: Partial<GovernanceRequest> = {}): GovernanceRequest {
  return {
    id: 'req-1',
    type: 'add-to-team',
    sourceHostId: 'host-remote',
    targetHostId: 'host-local',
    requestedBy: 'manager-uuid',
    requestedByRole: 'manager',
    payload: { agentId: 'agent-1' },
    approvals: {},
    status: 'pending',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

// ============================================================================
// Setup
// ============================================================================

beforeEach(() => {
  fsStore = {}
  vi.clearAllMocks()
})

// ============================================================================
// loadManagerTrust
// ============================================================================

describe('loadManagerTrust', () => {
  it('returns defaults when file is missing', () => {
    /** Verifies that a missing trust file results in default empty structure being created */
    const result = loadManagerTrust()

    expect(result.version).toBe(1)
    expect(result.trustedManagers).toEqual([])
    // Verify the file was written to disk (first-time initialization)
    expect(fsStore[TRUST_FILE]).toBeDefined()
    const written = JSON.parse(fsStore[TRUST_FILE])
    expect(written.version).toBe(1)
    expect(written.trustedManagers).toEqual([])
  })

  it('reads existing file correctly', () => {
    /** Verifies correct deserialization of an existing manager trust JSON file */
    const trust1 = makeTrust({ hostId: 'host-alpha', managerId: 'mgr-1', managerName: 'Alpha Manager' })
    const trust2 = makeTrust({ hostId: 'host-beta', managerId: 'mgr-2', managerName: 'Beta Manager', autoApprove: false })
    seedTrustFile(makeTrustFile([trust1, trust2]))

    const result = loadManagerTrust()

    expect(result.version).toBe(1)
    expect(result.trustedManagers).toHaveLength(2)
    expect(result.trustedManagers[0].hostId).toBe('host-alpha')
    expect(result.trustedManagers[0].managerId).toBe('mgr-1')
    expect(result.trustedManagers[0].managerName).toBe('Alpha Manager')
    expect(result.trustedManagers[1].hostId).toBe('host-beta')
    expect(result.trustedManagers[1].autoApprove).toBe(false)
  })

  it('handles corrupted JSON gracefully', () => {
    /** Verifies graceful degradation: corrupted file is backed up, defaults are returned */
    fsStore[TRUST_FILE] = '{this-is-not-valid-json!!!'

    const result = loadManagerTrust()

    expect(result.version).toBe(1)
    expect(result.trustedManagers).toEqual([])
    // Verify a backup was created
    const backupKeys = Object.keys(fsStore).filter(k => k.includes('.corrupted.'))
    expect(backupKeys.length).toBe(1)
    expect(fsStore[backupKeys[0]]).toBe('{this-is-not-valid-json!!!')
    // Verify file was healed with defaults
    const healed = JSON.parse(fsStore[TRUST_FILE])
    expect(healed.version).toBe(1)
    expect(healed.trustedManagers).toEqual([])
  })
})

// ============================================================================
// saveManagerTrust
// ============================================================================

describe('saveManagerTrust', () => {
  it('writes atomically via temp+rename', () => {
    /** Verifies the atomic write pattern: write to .tmp first, then rename to final */
    const file = makeTrustFile([makeTrust({ hostId: 'host-atomic' })])

    saveManagerTrust(file)

    // The .tmp file should no longer exist (it was renamed)
    const tmpFile = TRUST_FILE + '.tmp'
    expect(fsStore[tmpFile]).toBeUndefined()
    // The final file should exist with correct content
    expect(fsStore[TRUST_FILE]).toBeDefined()
    const written = JSON.parse(fsStore[TRUST_FILE])
    expect(written.trustedManagers[0].hostId).toBe('host-atomic')
  })
})

// ============================================================================
// addTrustedManager
// ============================================================================

describe('addTrustedManager', () => {
  it('creates new trust record', async () => {
    /** Verifies that adding a trust for a new host creates the record correctly */
    seedTrustFile(makeTrustFile([]))

    const result = await addTrustedManager({
      hostId: 'host-new',
      managerId: 'mgr-new-id',
      managerName: 'New Manager',
      autoApprove: false,
    })

    expect(result.hostId).toBe('host-new')
    expect(result.managerId).toBe('mgr-new-id')
    expect(result.managerName).toBe('New Manager')
    expect(result.autoApprove).toBe(false)
    expect(result.trustedAt).toBeDefined()
    // Verify persistence
    const loaded = loadManagerTrust()
    expect(loaded.trustedManagers).toHaveLength(1)
    expect(loaded.trustedManagers[0].hostId).toBe('host-new')
  })

  it('updates existing trust record for same hostId', async () => {
    /** Verifies that adding trust for an already-trusted host updates the existing record in place */
    const existing = makeTrust({
      hostId: 'host-existing',
      managerId: 'old-mgr',
      managerName: 'Old Manager',
      autoApprove: false,
    })
    seedTrustFile(makeTrustFile([existing]))

    const result = await addTrustedManager({
      hostId: 'host-existing',
      managerId: 'new-mgr',
      managerName: 'New Manager',
      autoApprove: true,
    })

    expect(result.hostId).toBe('host-existing')
    expect(result.managerId).toBe('new-mgr')
    expect(result.managerName).toBe('New Manager')
    expect(result.autoApprove).toBe(true)
    // Should still have exactly 1 record, not 2
    const loaded = loadManagerTrust()
    expect(loaded.trustedManagers).toHaveLength(1)
    expect(loaded.trustedManagers[0].managerId).toBe('new-mgr')
  })

  it('defaults autoApprove to false for safety', async () => {
    /** Verifies that omitting autoApprove results in false (safer default — explicit opt-in required) */
    seedTrustFile(makeTrustFile([]))

    const result = await addTrustedManager({
      hostId: 'host-default',
      managerId: 'mgr-default',
      managerName: 'Default Manager',
      // autoApprove intentionally omitted — should default to false
    })

    expect(result.autoApprove).toBe(false)
  })
})

// ============================================================================
// removeTrustedManager
// ============================================================================

describe('removeTrustedManager', () => {
  it('removes trust record and returns true', async () => {
    /** Verifies that removing a trusted host deletes the record and returns true */
    const trust = makeTrust({ hostId: 'host-remove-me' })
    seedTrustFile(makeTrustFile([trust]))

    const result = await removeTrustedManager('host-remove-me')

    expect(result).toBe(true)
    // Verify the record is gone from disk
    const loaded = loadManagerTrust()
    expect(loaded.trustedManagers).toHaveLength(0)
  })

  it('returns false when hostId not found', async () => {
    /** Verifies that removing a non-existent hostId returns false without modifying file */
    const trust = makeTrust({ hostId: 'host-keep' })
    seedTrustFile(makeTrustFile([trust]))

    const result = await removeTrustedManager('host-not-found')

    expect(result).toBe(false)
    // Existing record should remain untouched
    const loaded = loadManagerTrust()
    expect(loaded.trustedManagers).toHaveLength(1)
    expect(loaded.trustedManagers[0].hostId).toBe('host-keep')
  })
})

// ============================================================================
// isTrustedManager
// ============================================================================

describe('isTrustedManager', () => {
  it('returns true for matching hostId+managerId', () => {
    /** Verifies positive match when both hostId and managerId correspond to a trust record */
    seedTrustFile(makeTrustFile([
      makeTrust({ hostId: 'host-trusted', managerId: 'mgr-abc' }),
    ]))

    const result = isTrustedManager('host-trusted', 'mgr-abc')

    expect(result).toBe(true)
  })

  it('returns false for wrong managerId', () => {
    /** Verifies that a correct hostId with wrong managerId is not trusted */
    seedTrustFile(makeTrustFile([
      makeTrust({ hostId: 'host-trusted', managerId: 'mgr-abc' }),
    ]))

    const result = isTrustedManager('host-trusted', 'mgr-wrong')

    expect(result).toBe(false)
  })

  it('returns false for unknown hostId', () => {
    /** Verifies that an unknown hostId is not trusted regardless of managerId */
    seedTrustFile(makeTrustFile([
      makeTrust({ hostId: 'host-known', managerId: 'mgr-abc' }),
    ]))

    const result = isTrustedManager('host-unknown', 'mgr-abc')

    expect(result).toBe(false)
  })
})

// ============================================================================
// shouldAutoApprove
// ============================================================================

describe('shouldAutoApprove', () => {
  it('returns true for trusted manager with autoApprove enabled', () => {
    /** Verifies auto-approval when sourceHostId is trusted, managerId matches requestedBy, and autoApprove is true */
    seedTrustFile(makeTrustFile([
      makeTrust({ hostId: 'host-remote', managerId: 'manager-uuid', autoApprove: true }),
    ]))
    const request = makeGovernanceRequest({
      sourceHostId: 'host-remote',
      requestedBy: 'manager-uuid',
    })

    const result = shouldAutoApprove(request)

    expect(result).toBe(true)
  })

  it('returns false when autoApprove is false', () => {
    /** Verifies that a trusted manager with autoApprove disabled does NOT auto-approve */
    seedTrustFile(makeTrustFile([
      makeTrust({ hostId: 'host-remote', managerId: 'manager-uuid', autoApprove: false }),
    ]))
    const request = makeGovernanceRequest({
      sourceHostId: 'host-remote',
      requestedBy: 'manager-uuid',
    })

    const result = shouldAutoApprove(request)

    expect(result).toBe(false)
  })

  it('returns false for untrusted host', () => {
    /** Verifies that a request from an untrusted host is never auto-approved */
    seedTrustFile(makeTrustFile([
      makeTrust({ hostId: 'host-other', managerId: 'manager-uuid', autoApprove: true }),
    ]))
    const request = makeGovernanceRequest({
      sourceHostId: 'host-unknown',
      requestedBy: 'manager-uuid',
    })

    const result = shouldAutoApprove(request)

    expect(result).toBe(false)
  })
})
