import { describe, it, expect, vi, beforeEach } from 'vitest'
import path from 'path'
import os from 'os'

// ============================================================================
// Mocks
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
    copyFileSync: vi.fn((src: string, dest: string) => {
      if (src in fsStore) fsStore[dest] = fsStore[src]
      else throw new Error(`ENOENT: no such file or directory, copy '${src}'`)
    }),
  },
}))

let uuidCounter = 0
vi.mock('uuid', () => ({
  v4: vi.fn(() => {
    uuidCounter++
    return `uuid-${uuidCounter}`
  }),
}))

// Note: Mock uses simple string comparison, not constant-time comparison like real bcrypt.
// This is acceptable for Phase 1 (localhost-only) — timing-attack resistance is not tested here.
vi.mock('bcryptjs', () => ({
  default: {
    hash: vi.fn((plain: string, _rounds: number) => Promise.resolve(`hashed:${plain}`)),
    compare: vi.fn((plain: string, hash: string) => Promise.resolve(hash === `hashed:${plain}`)),
  },
}))

vi.mock('@/lib/file-lock', () => ({
  withLock: vi.fn((_name: string, fn: () => unknown) => Promise.resolve(fn())),
}))

vi.mock('@/lib/team-registry', () => ({
  loadTeams: vi.fn(() => [] as Array<Record<string, unknown>>),
  getTeam: vi.fn(() => null),
}))

// ============================================================================
// Import module under test (after mocks)
// ============================================================================

import {
  loadGovernance,
  setPassword,
  verifyPassword,
  setManager,
  getManagerId,
  removeManager,
  isManager,
  isChiefOfStaffAnywhere,
} from '@/lib/governance'
import { loadTeams } from '@/lib/team-registry'
import type { GovernanceConfig } from '@/types/governance'
import { DEFAULT_GOVERNANCE_CONFIG } from '@/types/governance'

// ============================================================================
// Test helpers
// ============================================================================

const GOVERNANCE_FILE = path.join(os.homedir(), '.aimaestro', 'governance.json')

function seedGovernance(overrides: Partial<GovernanceConfig> = {}): void {
  const config: GovernanceConfig = { ...DEFAULT_GOVERNANCE_CONFIG, ...overrides }
  fsStore[GOVERNANCE_FILE] = JSON.stringify(config, null, 2)
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
// loadGovernance
// ============================================================================

describe('loadGovernance', () => {
  it('returns defaults when no governance file exists on disk', async () => {
    /** Verifies that a fresh system with no governance.json returns the default config */
    const config = loadGovernance()

    expect(config).toEqual(DEFAULT_GOVERNANCE_CONFIG)
    expect(config.passwordHash).toBeNull()
    expect(config.managerId).toBeNull()
    // CC-003: Verify first-run initialization writes defaults to disk (saveGovernance is called for first-time init)
    const fsMock = (await import('fs')).default
    expect(fsMock.writeFileSync).toHaveBeenCalled()
  })

  it('reads and returns existing governance config from disk', () => {
    /** Verifies that an existing governance.json is read and parsed correctly */
    seedGovernance({
      passwordHash: 'hashed:secret123',
      passwordSetAt: '2025-06-01T12:00:00.000Z',
      managerId: 'agent-mgr-001',
    })

    const config = loadGovernance()

    expect(config.version).toBe(1)
    expect(config.passwordHash).toBe('hashed:secret123')
    expect(config.passwordSetAt).toBe('2025-06-01T12:00:00.000Z')
    expect(config.managerId).toBe('agent-mgr-001')
  })

  it('returns defaults and backs up when governance file contains invalid JSON', async () => {
    /** CC-015: Verifies that corrupted governance.json triggers fallback to defaults, backup of corrupt file, and self-healing write */
    // Seed with invalid JSON to simulate disk corruption
    fsStore[GOVERNANCE_FILE] = '{not-valid-json'

    const config = loadGovernance()

    // Must return DEFAULT_GOVERNANCE_CONFIG values
    expect(config.managerId).toBeNull()
    expect(config.passwordHash).toBeNull()
    expect(config.version).toBe(1)
    expect(config.passwordSetAt).toBeNull()

    // Verify corrupt file was backed up (copyFileSync called with governance file as source)
    const fsMock = (await import('fs')).default
    expect(fsMock.copyFileSync).toHaveBeenCalledWith(
      GOVERNANCE_FILE,
      expect.stringContaining('.corrupted.')
    )

    // Verify self-healing: defaults written back to disk after corruption
    expect(fsMock.writeFileSync).toHaveBeenCalled()
    const writtenData = JSON.parse(fsStore[GOVERNANCE_FILE])
    expect(writtenData.managerId).toBeNull()
    expect(writtenData.passwordHash).toBeNull()
    expect(writtenData.version).toBe(1)
  })
})

// ============================================================================
// setPassword
// ============================================================================

describe('setPassword', () => {
  it('hashes the plaintext password and persists it to governance config', async () => {
    /** Verifies that setPassword stores a bcrypt hash and timestamp in governance.json */
    await setPassword('my-governance-pass')

    const config = loadGovernance()

    expect(config.passwordHash).toBe('hashed:my-governance-pass')
    expect(config.passwordSetAt).toBeDefined()
    expect(typeof config.passwordSetAt).toBe('string')
    // Verify the timestamp is a valid ISO date
    expect(new Date(config.passwordSetAt!).toISOString()).toBe(config.passwordSetAt)
    // CC-002: Verify bcrypt.hash was called with the correct salt rounds (12)
    const bcrypt = await import('bcryptjs')
    expect(bcrypt.default.hash).toHaveBeenCalledWith('my-governance-pass', 12)
  })
})

// ============================================================================
// verifyPassword
// ============================================================================

describe('verifyPassword', () => {
  it('returns true for correct password and false for wrong password', async () => {
    /** Verifies password comparison against stored hash returns correct boolean */
    seedGovernance({ passwordHash: 'hashed:correctpass' })

    expect(await verifyPassword('correctpass')).toBe(true)
    expect(await verifyPassword('wrongpass')).toBe(false)
  })

  it('returns false when no password has been set', async () => {
    /** Verifies that verifyPassword returns false when passwordHash is null (no password configured) */
    seedGovernance({ passwordHash: null })

    expect(await verifyPassword('anypassword')).toBe(false)
  })
})

// ============================================================================
// setManager / getManagerId
// ============================================================================

describe('setManager / getManagerId', () => {
  it('sets the manager ID and retrieves it back', async () => {
    /** Verifies that setManager persists the manager UUID and getManagerId reads it */
    expect(getManagerId()).toBeNull()

    await setManager('agent-boss-42')

    expect(getManagerId()).toBe('agent-boss-42')
  })
})

// ============================================================================
// removeManager
// ============================================================================

describe('removeManager', () => {
  it('removes the previously set manager', async () => {
    /** Verifies that removeManager clears the managerId back to null */
    await setManager('agent-boss-42')
    expect(getManagerId()).toBe('agent-boss-42')

    await removeManager()

    expect(getManagerId()).toBeNull()
  })
})

// ============================================================================
// isManager
// ============================================================================

describe('isManager', () => {
  it('returns true only for the agent ID that matches the set manager', async () => {
    /** Verifies isManager is true for the exact manager UUID and false for others */
    await setManager('agent-boss-42')

    expect(isManager('agent-boss-42')).toBe(true)
    expect(isManager('agent-other-99')).toBe(false)
    expect(isManager('')).toBe(false)
  })

  it('returns false for empty string when no manager is set', () => {
    /** Verifies isManager returns false for empty string agentId when managerId is null (null !== '') */
    seedGovernance({ managerId: null })

    expect(isManager('')).toBe(false)
  })

  it('returns false when managerId is null and agentId is null', () => {
    /** CC-015: Guards against null === null being true — isManager must reject null agentId even when managerId is null */
    seedGovernance({ managerId: null })

    expect(isManager(null as any)).toBe(false)
  })
})

// ============================================================================
// isChiefOfStaffAnywhere
// ============================================================================

describe('isChiefOfStaffAnywhere', () => {
  it('returns true when the agent is chief-of-staff of a closed team', () => {
    /** Verifies that an agent designated as COS on a closed team is correctly identified */
    const mockedLoadTeams = vi.mocked(loadTeams)

    mockedLoadTeams.mockReturnValue([
      {
        id: 'team-open-1',
        name: 'Open Team',
        type: 'open',
        agentIds: ['agent-cos-1'],
        chiefOfStaffId: 'agent-cos-1',
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      },
      {
        id: 'team-closed-1',
        name: 'Closed Team',
        type: 'closed',
        agentIds: ['agent-cos-1', 'agent-member-2'],
        chiefOfStaffId: 'agent-cos-1',
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      },
    ])

    expect(isChiefOfStaffAnywhere('agent-cos-1')).toBe(true)
    expect(isChiefOfStaffAnywhere('agent-member-2')).toBe(false)
    expect(isChiefOfStaffAnywhere('agent-nobody')).toBe(false)
  })

  it('returns false when agent is COS only on open teams', () => {
    /** Verifies that COS designation on open teams does not count - COS is only valid on closed teams */
    const mockedLoadTeams = vi.mocked(loadTeams)

    mockedLoadTeams.mockReturnValue([
      {
        id: 'team-open-1',
        name: 'Open Team Alpha',
        type: 'open',
        agentIds: ['agent-cos-open'],
        chiefOfStaffId: 'agent-cos-open',
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      },
      {
        id: 'team-open-2',
        name: 'Open Team Beta',
        type: 'open',
        agentIds: ['agent-cos-open'],
        chiefOfStaffId: 'agent-cos-open',
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      },
    ])

    expect(isChiefOfStaffAnywhere('agent-cos-open')).toBe(false)
  })
})
