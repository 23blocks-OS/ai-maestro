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
  },
}))

let uuidCounter = 0
vi.mock('uuid', () => ({
  v4: vi.fn(() => {
    uuidCounter++
    return `uuid-${uuidCounter}`
  }),
}))

vi.mock('@/lib/file-lock', () => ({
  withLock: vi.fn((_name: string, fn: () => any) => Promise.resolve(fn())),
}))

// ============================================================================
// Import module under test (after mocks)
// ============================================================================

import {
  loadTeams,
  saveTeams,
  getTeam,
  createTeam,
  updateTeam,
  deleteTeam,
} from '@/lib/team-registry'
import type { Team } from '@/types/team'

// ============================================================================
// Test helpers
// ============================================================================

const TEAMS_DIR = path.join(os.homedir(), '.aimaestro', 'teams')
const TEAMS_FILE = path.join(TEAMS_DIR, 'teams.json')

function makeTeam(overrides: Partial<Team> = {}): Team {
  return {
    id: `team-${++uuidCounter}`,
    name: 'Default Team',
    agentIds: [],
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  }
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
// loadTeams
// ============================================================================

describe('loadTeams', () => {
  it('returns empty array when file does not exist', () => {
    expect(loadTeams()).toEqual([])
  })

  it('returns teams from an existing file', () => {
    const team = makeTeam({ id: 'team-a', name: 'Alpha' })
    fsStore[TEAMS_FILE] = JSON.stringify({ version: 1, teams: [team] })

    const teams = loadTeams()
    expect(teams).toHaveLength(1)
    expect(teams[0].name).toBe('Alpha')
  })

  it('returns empty array for invalid JSON', () => {
    fsStore[TEAMS_FILE] = '{ broken'
    expect(loadTeams()).toEqual([])
  })
})

// ============================================================================
// createTeam
// ============================================================================

describe('createTeam', () => {
  it('creates a team with name and agentIds', async () => {
    const team = await createTeam({ name: 'New Team', agentIds: ['a1'] })

    expect(team.name).toBe('New Team')
    expect(team.agentIds).toEqual(['a1'])
    expect(team.id).toMatch(/^uuid-/)
  })

  it('creates a team with empty agentIds', async () => {
    const team = await createTeam({ name: 'Empty', agentIds: [] })

    expect(team.agentIds).toEqual([])
  })

  it('sets optional description', async () => {
    const team = await createTeam({ name: 'Described', description: 'A description', agentIds: [] })
    expect(team.description).toBe('A description')
  })

  it('persists to storage', async () => {
    await createTeam({ name: 'Persisted', agentIds: [] })

    const teams = loadTeams()
    expect(teams).toHaveLength(1)
    expect(teams[0].name).toBe('Persisted')
  })
})

// ============================================================================
// updateTeam - extended fields (instructions, lastActivityAt)
// ============================================================================

describe('updateTeam', () => {
  it('updates name and description', async () => {
    const team = await createTeam({ name: 'Original', agentIds: [] })
    const updated = await updateTeam(team.id, { name: 'Updated', description: 'New desc' })

    expect(updated).not.toBeNull()
    expect(updated!.name).toBe('Updated')
    expect(updated!.description).toBe('New desc')
  })

  it('updates agentIds', async () => {
    const team = await createTeam({ name: 'Agents', agentIds: ['a1'] })
    const updated = await updateTeam(team.id, { agentIds: ['a1', 'a2', 'a3'] })

    expect(updated!.agentIds).toEqual(['a1', 'a2', 'a3'])
  })

  it('updates instructions field', async () => {
    const team = await createTeam({ name: 'Instructions Team', agentIds: [] })
    const updated = await updateTeam(team.id, { instructions: '# Team Guidelines\n\nBe nice.' })

    expect(updated!.instructions).toBe('# Team Guidelines\n\nBe nice.')
  })

  it('updates lastActivityAt field', async () => {
    const team = await createTeam({ name: 'Activity Team', agentIds: [] })
    const ts = '2025-06-15T10:30:00.000Z'
    const updated = await updateTeam(team.id, { lastActivityAt: ts })

    expect(updated!.lastActivityAt).toBe(ts)
  })

  it('updates lastMeetingAt field', async () => {
    const team = await createTeam({ name: 'Meeting Team', agentIds: [] })
    const ts = '2025-06-15T10:30:00.000Z'
    const updated = await updateTeam(team.id, { lastMeetingAt: ts })

    expect(updated!.lastMeetingAt).toBe(ts)
  })

  it('sets updatedAt to a valid ISO timestamp', async () => {
    const team = await createTeam({ name: 'Timestamp', agentIds: [] })

    const updated = await updateTeam(team.id, { name: 'Changed' })

    expect(updated!.updatedAt).toBeDefined()
    expect(new Date(updated!.updatedAt).toISOString()).toBe(updated!.updatedAt)
  })

  it('returns null for non-existent team', async () => {
    const result = await updateTeam('non-existent', { name: 'Nope' })
    expect(result).toBeNull()
  })

  it('persists instructions to storage', async () => {
    const team = await createTeam({ name: 'Persist Instructions', agentIds: [] })
    await updateTeam(team.id, { instructions: 'Saved instructions' })

    const loaded = loadTeams()
    expect(loaded[0].instructions).toBe('Saved instructions')
  })

  it('can clear instructions by setting to empty string', async () => {
    const team = await createTeam({ name: 'Clear Instructions', agentIds: [] })
    await updateTeam(team.id, { instructions: '# Rules' })
    await updateTeam(team.id, { instructions: '' })

    const loaded = loadTeams()
    expect(loaded[0].instructions).toBe('')
  })
})

// ============================================================================
// getTeam
// ============================================================================

describe('getTeam', () => {
  it('returns team when it exists', async () => {
    const team = await createTeam({ name: 'Find Me', agentIds: [] })
    const found = getTeam(team.id)

    expect(found).not.toBeNull()
    expect(found!.name).toBe('Find Me')
  })

  it('returns null for non-existent id', () => {
    expect(getTeam('non-existent')).toBeNull()
  })
})

// ============================================================================
// deleteTeam
// ============================================================================

describe('deleteTeam', () => {
  it('deletes team and returns true', async () => {
    const team = await createTeam({ name: 'Delete Me', agentIds: [] })
    const result = await deleteTeam(team.id)

    expect(result).toBe(true)
    expect(loadTeams()).toHaveLength(0)
  })

  it('returns false for non-existent team', async () => {
    expect(await deleteTeam('non-existent')).toBe(false)
  })

  it('preserves other teams', async () => {
    const team1 = await createTeam({ name: 'Keep', agentIds: [] })
    const team2 = await createTeam({ name: 'Delete', agentIds: [] })

    await deleteTeam(team2.id)

    const remaining = loadTeams()
    expect(remaining).toHaveLength(1)
    expect(remaining[0].id).toBe(team1.id)
  })
})
