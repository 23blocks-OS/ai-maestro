/**
 * Unit tests for lib/governance-peers.ts
 *
 * Coverage: 20 tests across 8 exported functions
 * - loadPeerGovernance: load from disk, missing file, corrupted JSON
 * - savePeerGovernance: write to disk atomically
 * - deletePeerGovernance: remove file, no-op when missing
 * - getAllPeerGovernance: list all, filter expired TTL, skip corrupt files
 * - isManagerOnAnyHost: local match, peer match, empty agentId, no match
 * - isChiefOfStaffOnAnyHost: local COS, peer COS, empty agentId
 * - getTeamFromAnyHost: local team, peer team, not found
 * - getPeerTeamsForAgent: peer teams, empty agentId, no matches
 *
 * Mocking strategy:
 * - fs (external I/O) -- mocked with in-memory fsStore
 * - @/lib/governance (isManager, getManagerId) -- mocked to control local governance answers
 * - @/lib/team-registry (loadTeams) -- mocked to control local team answers
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import path from 'path'
import os from 'os'

// ============================================================================
// In-memory filesystem mock
// ============================================================================

let fsStore: Record<string, string> = {}

vi.mock('fs', () => ({
  // Named exports (used by governance-peers.ts via `import { readFileSync, ... } from 'fs'`)
  existsSync: vi.fn((filePath: string) => filePath in fsStore),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn((filePath: string) => {
    if (filePath in fsStore) return fsStore[filePath]
    throw new Error(`ENOENT: no such file or directory, open '${filePath}'`)
  }),
  writeFileSync: vi.fn((filePath: string, data: string) => {
    fsStore[filePath] = data
  }),
  renameSync: vi.fn((oldPath: string, newPath: string) => {
    // Atomic write support: move tmp file to final destination in the in-memory store
    if (oldPath in fsStore) {
      fsStore[newPath] = fsStore[oldPath]
      delete fsStore[oldPath]
    }
  }),
  readdirSync: vi.fn((dirPath: string) => {
    // Return filenames whose full path starts with dirPath
    const prefix = dirPath.endsWith('/') ? dirPath : dirPath + '/'
    return Object.keys(fsStore)
      .filter(k => k.startsWith(prefix) && !k.slice(prefix.length).includes('/'))
      .map(k => k.slice(prefix.length))
  }),
  unlinkSync: vi.fn((filePath: string) => {
    delete fsStore[filePath]
  }),
  // Default export (for modules that use `import fs from 'fs'`)
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
    renameSync: vi.fn((oldPath: string, newPath: string) => {
      if (oldPath in fsStore) {
        fsStore[newPath] = fsStore[oldPath]
        delete fsStore[oldPath]
      }
    }),
    readdirSync: vi.fn((dirPath: string) => {
      const prefix = dirPath.endsWith('/') ? dirPath : dirPath + '/'
      return Object.keys(fsStore)
        .filter(k => k.startsWith(prefix) && !k.slice(prefix.length).includes('/'))
        .map(k => k.slice(prefix.length))
    }),
    unlinkSync: vi.fn((filePath: string) => {
      delete fsStore[filePath]
    }),
  },
}))

// ============================================================================
// Mock local governance and team-registry (external to the module under test)
// ============================================================================

vi.mock('@/lib/governance', () => ({
  isManager: vi.fn(() => false),
  getManagerId: vi.fn(() => null),
}))

vi.mock('@/lib/team-registry', () => ({
  loadTeams: vi.fn(() => []),
}))

// ============================================================================
// Import module under test (after mocks are declared)
// ============================================================================

import {
  loadPeerGovernance,
  savePeerGovernance,
  deletePeerGovernance,
  getAllPeerGovernance,
  isManagerOnAnyHost,
  isChiefOfStaffOnAnyHost,
  getTeamFromAnyHost,
  getPeerTeamsForAgent,
} from '@/lib/governance-peers'
import { isManager } from '@/lib/governance'
import { loadTeams } from '@/lib/team-registry'
import type { GovernancePeerState, PeerTeamSummary } from '@/types/governance'

// ============================================================================
// Test helpers
// ============================================================================

const PEERS_DIR = path.join(os.homedir(), '.aimaestro', 'governance-peers')

/** Build a valid GovernancePeerState with sensible defaults and optional overrides */
function makePeerState(overrides: Partial<GovernancePeerState> = {}): GovernancePeerState {
  return {
    hostId: 'peer-host-1',
    managerId: null,
    managerName: null,
    teams: [],
    lastSyncAt: new Date().toISOString(),
    ttl: 300,
    ...overrides,
  }
}

/** Build a PeerTeamSummary with sensible defaults */
function makeTeamSummary(overrides: Partial<PeerTeamSummary> = {}): PeerTeamSummary {
  return {
    id: 'team-1',
    name: 'Alpha Team',
    type: 'closed',
    chiefOfStaffId: null,
    agentIds: [],
    ...overrides,
  }
}

/** Seed a peer state file directly in the in-memory fs */
function seedPeer(hostId: string, state: GovernancePeerState): void {
  fsStore[path.join(PEERS_DIR, `${hostId}.json`)] = JSON.stringify(state, null, 2)
}

// ============================================================================
// Setup
// ============================================================================

beforeEach(() => {
  fsStore = {}
  vi.clearAllMocks()
  // Reset default mock return values
  vi.mocked(isManager).mockReturnValue(false)
  vi.mocked(loadTeams).mockReturnValue([])
})

// ============================================================================
// loadPeerGovernance
// ============================================================================

describe('loadPeerGovernance', () => {
  it('returns null when no file exists for the given hostId', () => {
    /** Verifies that querying an unknown peer returns null without throwing */
    const result = loadPeerGovernance('nonexistent-host')
    expect(result).toBeNull()
  })

  it('loads and returns a valid peer state from disk', () => {
    /** Verifies correct deserialization of a peer governance JSON file */
    const state = makePeerState({
      hostId: 'macbook-pro',
      managerId: 'agent-mgr-42',
      managerName: 'Boss Agent',
      teams: [makeTeamSummary({ id: 'team-alpha', name: 'Alpha', agentIds: ['a1', 'a2'] })],
    })
    seedPeer('macbook-pro', state)

    const result = loadPeerGovernance('macbook-pro')

    expect(result).not.toBeNull()
    expect(result!.hostId).toBe('macbook-pro')
    expect(result!.managerId).toBe('agent-mgr-42')
    expect(result!.managerName).toBe('Boss Agent')
    expect(result!.teams).toHaveLength(1)
    expect(result!.teams[0].id).toBe('team-alpha')
    expect(result!.teams[0].agentIds).toEqual(['a1', 'a2'])
  })

  it('returns null when file contains corrupted JSON', () => {
    /** Verifies graceful degradation when peer file has invalid JSON content */
    const filePath = path.join(PEERS_DIR, 'corrupt-host.json')
    fsStore[filePath] = '{not-valid-json!!!}'

    const result = loadPeerGovernance('corrupt-host')

    expect(result).toBeNull()
  })
})

// ============================================================================
// savePeerGovernance
// ============================================================================

describe('savePeerGovernance', () => {
  it('writes peer state to disk and can be read back', () => {
    /** Verifies round-trip: save then load returns identical data */
    const state = makePeerState({
      hostId: 'remote-server',
      managerId: 'agent-remote-mgr',
      teams: [
        makeTeamSummary({ id: 'team-r1', name: 'Remote Team', chiefOfStaffId: 'agent-cos-r1', agentIds: ['a1', 'a2', 'a3'] }),
      ],
    })

    savePeerGovernance('remote-server', state)

    const loaded = loadPeerGovernance('remote-server')
    expect(loaded).not.toBeNull()
    expect(loaded!.hostId).toBe('remote-server')
    expect(loaded!.managerId).toBe('agent-remote-mgr')
    expect(loaded!.teams[0].chiefOfStaffId).toBe('agent-cos-r1')
    expect(loaded!.teams[0].agentIds).toEqual(['a1', 'a2', 'a3'])
  })

})

// ============================================================================
// deletePeerGovernance
// ============================================================================

describe('deletePeerGovernance', () => {
  it('removes the peer state file from disk', () => {
    /** Verifies that delete actually removes the file so load returns null */
    const state = makePeerState({ hostId: 'doomed-host' })
    seedPeer('doomed-host', state)
    expect(loadPeerGovernance('doomed-host')).not.toBeNull()

    deletePeerGovernance('doomed-host')

    expect(loadPeerGovernance('doomed-host')).toBeNull()
  })

})

// ============================================================================
// getAllPeerGovernance
// ============================================================================

describe('getAllPeerGovernance', () => {
  it('returns all non-expired peer states from disk', () => {
    /** Verifies that fresh peer states are returned from the directory listing */
    const peerA = makePeerState({ hostId: 'host-a', managerId: 'mgr-a', lastSyncAt: new Date().toISOString(), ttl: 600 })
    const peerB = makePeerState({ hostId: 'host-b', managerId: 'mgr-b', lastSyncAt: new Date().toISOString(), ttl: 600 })
    seedPeer('host-a', peerA)
    seedPeer('host-b', peerB)

    const all = getAllPeerGovernance()

    expect(all).toHaveLength(2)
    const hostIds = all.map(s => s.hostId)
    expect(hostIds).toContain('host-a')
    expect(hostIds).toContain('host-b')
  })

  it('filters out peer states whose TTL has expired', () => {
    /** Verifies that stale peer states (older than TTL seconds) are excluded */
    const freshPeer = makePeerState({ hostId: 'fresh-host', lastSyncAt: new Date().toISOString(), ttl: 600 })
    // Expired: lastSyncAt is 10 minutes ago but TTL is only 60 seconds
    const expiredTime = new Date(Date.now() - 10 * 60 * 1000).toISOString()
    const stalePeer = makePeerState({ hostId: 'stale-host', lastSyncAt: expiredTime, ttl: 60 })
    seedPeer('fresh-host', freshPeer)
    seedPeer('stale-host', stalePeer)

    const all = getAllPeerGovernance()

    expect(all).toHaveLength(1)
    expect(all[0].hostId).toBe('fresh-host')
  })

  it('skips files with corrupted JSON content', () => {
    /** Verifies that corrupt files do not crash the listing and are silently skipped */
    const validPeer = makePeerState({ hostId: 'valid-host', lastSyncAt: new Date().toISOString(), ttl: 600 })
    seedPeer('valid-host', validPeer)
    fsStore[path.join(PEERS_DIR, 'bad-host.json')] = '{{broken json'

    const all = getAllPeerGovernance()

    expect(all).toHaveLength(1)
    expect(all[0].hostId).toBe('valid-host')
  })

  it('filters out entries with unparseable lastSyncAt timestamps', () => {
    /** Verifies that invalid date strings in lastSyncAt cause the entry to be skipped */
    const badDate = makePeerState({ hostId: 'bad-date-host', lastSyncAt: 'not-a-date', ttl: 600 })
    seedPeer('bad-date-host', badDate)

    const all = getAllPeerGovernance()

    expect(all).toHaveLength(0)
  })
})

// ============================================================================
// isManagerOnAnyHost
// ============================================================================

describe('isManagerOnAnyHost', () => {
  it('returns true when agent is local manager', () => {
    /** Verifies fast-path: local governance isManager returns true */
    vi.mocked(isManager).mockReturnValue(true)

    expect(isManagerOnAnyHost('agent-local-mgr')).toBe(true)
  })

  it('returns true when agent is manager on a peer host', () => {
    /** Verifies that the function finds the agent in a peer state's managerId */
    const peer = makePeerState({ hostId: 'remote-1', managerId: 'agent-remote-mgr', lastSyncAt: new Date().toISOString(), ttl: 600 })
    seedPeer('remote-1', peer)

    expect(isManagerOnAnyHost('agent-remote-mgr')).toBe(true)
  })

  it('returns false when agent is not manager anywhere', () => {
    /** Verifies false is returned when the agent is neither local nor peer manager */
    const peer = makePeerState({ hostId: 'remote-1', managerId: 'someone-else', lastSyncAt: new Date().toISOString(), ttl: 600 })
    seedPeer('remote-1', peer)

    expect(isManagerOnAnyHost('agent-nobody')).toBe(false)
  })

})

// ============================================================================
// isChiefOfStaffOnAnyHost
// ============================================================================

describe('isChiefOfStaffOnAnyHost', () => {
  it('returns true when agent is COS in a local team', () => {
    /** Verifies local team COS check (fast-path before peer lookup) */
    vi.mocked(loadTeams).mockReturnValue([
      {
        id: 'local-team-1',
        name: 'Local Team',
        type: 'closed',
        chiefOfStaffId: 'agent-local-cos',
        agentIds: ['agent-local-cos', 'agent-member'],
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
      },
    ])

    expect(isChiefOfStaffOnAnyHost('agent-local-cos')).toBe(true)
  })

  it('returns true when agent is COS in a peer team', () => {
    /** Verifies peer team COS lookup across non-expired peers */
    const peer = makePeerState({
      hostId: 'remote-2',
      lastSyncAt: new Date().toISOString(),
      ttl: 600,
      teams: [
        makeTeamSummary({ id: 'peer-team-1', chiefOfStaffId: 'agent-peer-cos', agentIds: ['agent-peer-cos', 'agent-x'] }),
      ],
    })
    seedPeer('remote-2', peer)

    expect(isChiefOfStaffOnAnyHost('agent-peer-cos')).toBe(true)
  })

})

// ============================================================================
// getTeamFromAnyHost
// ============================================================================

describe('getTeamFromAnyHost', () => {
  it('finds a team in local teams and returns hostId as local', () => {
    /** Verifies local team lookup returns PeerTeamSummary shape with hostId = 'local' */
    vi.mocked(loadTeams).mockReturnValue([
      {
        id: 'local-team-42',
        name: 'Ops Team',
        type: 'open',
        chiefOfStaffId: null,
        agentIds: ['a1', 'a2'],
        createdAt: '2025-06-01T00:00:00Z',
        updatedAt: '2025-06-01T00:00:00Z',
      },
    ])

    const result = getTeamFromAnyHost('local-team-42')

    expect(result).not.toBeNull()
    expect(result!.hostId).toBe('local')
    expect(result!.team.id).toBe('local-team-42')
    expect(result!.team.name).toBe('Ops Team')
    expect(result!.team.agentIds).toEqual(['a1', 'a2'])
  })

  it('finds a team on a peer host and returns the correct hostId', () => {
    /** Verifies peer team lookup returns the peer hostId */
    const peer = makePeerState({
      hostId: 'remote-mac',
      lastSyncAt: new Date().toISOString(),
      ttl: 600,
      teams: [
        makeTeamSummary({ id: 'peer-team-99', name: 'Remote Ops', agentIds: ['r1', 'r2'] }),
      ],
    })
    seedPeer('remote-mac', peer)

    const result = getTeamFromAnyHost('peer-team-99')

    expect(result).not.toBeNull()
    expect(result!.hostId).toBe('remote-mac')
    expect(result!.team.id).toBe('peer-team-99')
    expect(result!.team.name).toBe('Remote Ops')
  })

  it('returns null when team is not found anywhere', () => {
    /** Verifies null return when team ID does not exist locally or on any peer */
    const result = getTeamFromAnyHost('nonexistent-team')
    expect(result).toBeNull()
  })
})

// ============================================================================
// getPeerTeamsForAgent
// ============================================================================

describe('getPeerTeamsForAgent', () => {
  it('returns peer teams that include the given agentId', () => {
    /** Verifies multi-peer lookup finds teams containing the agent across hosts */
    const peer1 = makePeerState({
      hostId: 'host-1',
      lastSyncAt: new Date().toISOString(),
      ttl: 600,
      teams: [
        makeTeamSummary({ id: 'team-p1', name: 'Team P1', agentIds: ['target-agent', 'other'] }),
        makeTeamSummary({ id: 'team-p2', name: 'Team P2', agentIds: ['other-only'] }),
      ],
    })
    const peer2 = makePeerState({
      hostId: 'host-2',
      lastSyncAt: new Date().toISOString(),
      ttl: 600,
      teams: [
        makeTeamSummary({ id: 'team-p3', name: 'Team P3', agentIds: ['target-agent', 'another'] }),
      ],
    })
    seedPeer('host-1', peer1)
    seedPeer('host-2', peer2)

    const results = getPeerTeamsForAgent('target-agent')

    expect(results).toHaveLength(2)
    const teamIds = results.map(t => t.id)
    expect(teamIds).toContain('team-p1')
    expect(teamIds).toContain('team-p3')
    // Verify hostId is augmented on each result
    expect(results.find(t => t.id === 'team-p1')!.hostId).toBe('host-1')
    expect(results.find(t => t.id === 'team-p3')!.hostId).toBe('host-2')
  })

  it('returns empty array for empty agentId', () => {
    /** Verifies that empty string agentId short-circuits to empty array */
    expect(getPeerTeamsForAgent('')).toEqual([])
  })

  it('returns empty array when no peer teams contain the agent', () => {
    /** Verifies empty result when agent is not a member of any peer team */
    const peer = makePeerState({
      hostId: 'host-lonely',
      lastSyncAt: new Date().toISOString(),
      ttl: 600,
      teams: [makeTeamSummary({ id: 'team-x', agentIds: ['not-me'] })],
    })
    seedPeer('host-lonely', peer)

    expect(getPeerTeamsForAgent('missing-agent')).toEqual([])
  })
})
