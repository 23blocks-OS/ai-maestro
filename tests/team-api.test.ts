import { describe, it, expect, vi, beforeEach } from 'vitest'

// Note: team-api tests mock 'fs' directly at the module level below, not via
// team-registry — the fs mock intercepts all filesystem calls from any module
// (including team-registry) that the route handlers import.

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

// Mock governance module - getManagerId returns null (no manager configured) for basic tests
vi.mock('@/lib/governance', () => ({
  getManagerId: vi.fn(() => null),
  isManager: vi.fn(() => false),
  loadGovernance: vi.fn(() => ({ managerId: null, passwordHash: null, createdAt: null, updatedAt: null })),
  verifyPassword: vi.fn(() => false),
}))

// Mock team-acl module - checkTeamAccess allows all access by default in tests
vi.mock('@/lib/team-acl', () => ({
  checkTeamAccess: vi.fn(() => ({ allowed: true })),
}))

// Mock agent-registry module - loadAgents returns empty array for basic team tests
vi.mock('@/lib/agent-registry', () => ({
  loadAgents: vi.fn(() => []),
}))

// Mock validation module - isValidUuid accepts synthetic test UUIDs (uuid-1, uuid-2, etc.)
vi.mock('@/lib/validation', () => ({
  isValidUuid: vi.fn(() => true),
}))

// ============================================================================
// Imports (after mocks)
// ============================================================================

import { createTeam, loadTeams, updateTeam, getTeam } from '@/lib/team-registry'
import { GET as getTeamRoute, PUT as updateTeamRoute, DELETE as deleteTeamRoute } from '@/app/api/teams/[id]/route'
import { GET as listTeamsRoute, POST as createTeamRoute } from '@/app/api/teams/route'
import { getManagerId, isManager } from '@/lib/governance'
import { isValidUuid } from '@/lib/validation'
import { NextRequest } from 'next/server'

// ============================================================================
// Helpers
// ============================================================================

function makeRequest(url: string, options: Record<string, unknown> = {}): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost:23000'), options as any)
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
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
// GET /api/teams - List all teams
// ============================================================================

describe('GET /api/teams', () => {
  it('returns empty array when no teams', async () => {
    const res = await listTeamsRoute()

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.teams).toEqual([])
  })

  it('returns all teams', async () => {
    await createTeam({ name: 'Team A', agentIds: [] })
    await createTeam({ name: 'Team B', agentIds: [] })

    const res = await listTeamsRoute()
    const data = await res.json()
    expect(data.teams).toHaveLength(2)
  })
})

// ============================================================================
// POST /api/teams - Create team
// ============================================================================

describe('POST /api/teams', () => {
  it('creates team with name and agents', async () => {
    const req = makeRequest('/api/teams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'New Team', agentIds: ['a1', 'a2'] }),
    })
    const res = await createTeamRoute(req)

    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.team.name).toBe('New Team')
    expect(data.team.agentIds).toEqual(['a1', 'a2'])
  })

  it('creates team with empty agentIds', async () => {
    const req = makeRequest('/api/teams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Empty Team', agentIds: [] }),
    })
    const res = await createTeamRoute(req)

    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.team.agentIds).toEqual([])
  })

  it('creates team without agentIds field (defaults to empty)', async () => {
    const req = makeRequest('/api/teams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'No Agents Field' }),
    })
    const res = await createTeamRoute(req)

    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.team.agentIds).toEqual([])
  })

  it('returns 400 when name is missing', async () => {
    const req = makeRequest('/api/teams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentIds: ['a1'] }),
    })
    const res = await createTeamRoute(req)

    expect(res.status).toBe(400)
  })

  it('returns 400 when agentIds is not an array', async () => {
    const req = makeRequest('/api/teams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Bad', agentIds: 'not-array' }),
    })
    const res = await createTeamRoute(req)

    expect(res.status).toBe(400)
  })

  // CC-004: Verify managerId is passed through to createTeam when getManagerId returns a value
  it('passes managerId from governance to createTeam', async () => {
    vi.mocked(getManagerId).mockReturnValue('manager-uuid')
    // vi.spyOn on dynamic import works in Vitest because await import() returns
    // the same module instance as the route's static import when vi.mock is active.
    const spy = vi.spyOn(await import('@/lib/team-registry'), 'createTeam')

    const req = makeRequest('/api/teams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Managed Team', agentIds: [] }),
    })
    const res = await createTeamRoute(req)

    expect(res.status).toBe(201)
    // createTeam should have received managerId as its second argument
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0][1]).toBe('manager-uuid')

    spy.mockRestore()
    vi.mocked(getManagerId).mockReturnValue(null)
  })
})

// ============================================================================
// GET /api/teams/[id] - Get single team
// ============================================================================

describe('GET /api/teams/[id]', () => {
  // CC-002: Verify the 400 response path when isValidUuid returns false
  it('returns 400 for invalid UUID format', async () => {
    vi.mocked(isValidUuid).mockReturnValueOnce(false)

    const req = makeRequest('/api/teams/not-a-valid-uuid')
    const res = await getTeamRoute(req, makeParams('not-a-valid-uuid') as any)

    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toContain('Invalid team ID format')
  })

  it('returns 404 for non-existent team', async () => {
    const req = makeRequest('/api/teams/non-existent')
    const res = await getTeamRoute(req, makeParams('non-existent') as any)

    expect(res.status).toBe(404)
  })

  it('returns team when it exists', async () => {
    const team = await createTeam({ name: 'Find Me', agentIds: [] })

    const req = makeRequest(`/api/teams/${team.id}`)
    const res = await getTeamRoute(req, makeParams(team.id) as any)

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.team.name).toBe('Find Me')
  })
})

// ============================================================================
// PUT /api/teams/[id] - Update team (including new fields)
// ============================================================================

describe('PUT /api/teams/[id]', () => {
  it('returns 404 for non-existent team', async () => {
    const req = makeRequest('/api/teams/non-existent', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Updated' }),
    })
    const res = await updateTeamRoute(req, makeParams('non-existent') as any)

    expect(res.status).toBe(404)
  })

  it('updates team name', async () => {
    const team = await createTeam({ name: 'Original', agentIds: [] })

    const req = makeRequest(`/api/teams/${team.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Updated' }),
    })
    const res = await updateTeamRoute(req, makeParams(team.id) as any)

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.team.name).toBe('Updated')
  })

  it('updates instructions via PUT', async () => {
    const team = await createTeam({ name: 'Instructions Team', agentIds: [] })

    const req = makeRequest(`/api/teams/${team.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instructions: '# Team Guidelines\n\nFollow these rules.' }),
    })
    const res = await updateTeamRoute(req, makeParams(team.id) as any)

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.team.instructions).toBe('# Team Guidelines\n\nFollow these rules.')
  })

  it('updates lastActivityAt via PUT', async () => {
    const team = await createTeam({ name: 'Activity Team', agentIds: [] })
    const ts = '2025-06-15T10:30:00.000Z'

    const req = makeRequest(`/api/teams/${team.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lastActivityAt: ts }),
    })
    const res = await updateTeamRoute(req, makeParams(team.id) as any)

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.team.lastActivityAt).toBe(ts)
  })

  it('persists instructions to storage', async () => {
    const team = await createTeam({ name: 'Persist', agentIds: [] })

    const req = makeRequest(`/api/teams/${team.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instructions: 'Saved' }),
    })
    await updateTeamRoute(req, makeParams(team.id) as any)

    const teams = loadTeams()
    expect(teams[0].instructions).toBe('Saved')
  })

  // CC-005: PUT must strip chiefOfStaffId and type from body (only dedicated endpoints can change these)
  it('ignores chiefOfStaffId and type in body', async () => {
    const team = await createTeam({ name: 'Original Team', agentIds: [], type: 'open' })
    // vi.spyOn on dynamic import works in Vitest because await import() returns
    // the same module instance as the route's static import when vi.mock is active.
    const spy = vi.spyOn(await import('@/lib/team-registry'), 'updateTeam')

    const req = makeRequest(`/api/teams/${team.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'closed', chiefOfStaffId: 'some-agent', name: 'Updated Name' }),
    })
    const res = await updateTeamRoute(req, makeParams(team.id) as any)

    expect(res.status).toBe(200)
    const data = await res.json()
    // Name should be updated
    expect(data.team.name).toBe('Updated Name')
    // type and chiefOfStaffId must NOT have been changed
    expect(data.team.type).toBe('open')
    expect(data.team.chiefOfStaffId).toBeUndefined()

    // Verify updateTeam was called WITHOUT type or chiefOfStaffId in the updates object
    expect(spy).toHaveBeenCalledTimes(1)
    const updateArgs = spy.mock.calls[0][1]
    expect(updateArgs).not.toHaveProperty('type')
    expect(updateArgs).not.toHaveProperty('chiefOfStaffId')

    spy.mockRestore()
  })
})

// ============================================================================
// DELETE /api/teams/[id] - Delete team
// ============================================================================

describe('DELETE /api/teams/[id]', () => {
  it('returns 404 for non-existent team', async () => {
    const req = makeRequest('/api/teams/non-existent', { method: 'DELETE' })
    const res = await deleteTeamRoute(req, makeParams('non-existent') as any)

    expect(res.status).toBe(404)
  })

  it('deletes team and returns success', async () => {
    const team = await createTeam({ name: 'Delete Me', agentIds: [] })

    const req = makeRequest(`/api/teams/${team.id}`, { method: 'DELETE' })
    const res = await deleteTeamRoute(req, makeParams(team.id) as any)

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBe(true)
    expect(loadTeams()).toHaveLength(0)
  })

  // CC-006: Closed team deletion guard - non-authorized agent gets 403
  it('returns 403 when non-authorized agent deletes closed team', async () => {
    const team = await createTeam({ name: 'Closed Team', agentIds: ['cos-agent'], type: 'closed', chiefOfStaffId: 'cos-agent' })
    vi.mocked(isManager).mockReturnValue(false)

    const req = makeRequest(`/api/teams/${team.id}`, {
      method: 'DELETE',
      headers: { 'X-Agent-Id': 'random-agent' },
    })
    const res = await deleteTeamRoute(req, makeParams(team.id) as any)

    expect(res.status).toBe(403)
    const data = await res.json()
    expect(data.error).toContain('MANAGER or the team Chief-of-Staff')
  })

  // CC-006: Closed team deletion guard - COS is allowed
  it('allows COS to delete closed team', async () => {
    const team = await createTeam({ name: 'COS Delete', agentIds: ['cos-agent'], type: 'closed', chiefOfStaffId: 'cos-agent' })
    vi.mocked(isManager).mockReturnValue(false)

    const req = makeRequest(`/api/teams/${team.id}`, {
      method: 'DELETE',
      headers: { 'X-Agent-Id': 'cos-agent' },
    })
    const res = await deleteTeamRoute(req, makeParams(team.id) as any)

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBe(true)
  })

  // CC-006: Closed team deletion guard - MANAGER is allowed
  it('allows MANAGER to delete closed team', async () => {
    const team = await createTeam({ name: 'Mgr Delete', agentIds: ['cos-agent'], type: 'closed', chiefOfStaffId: 'cos-agent' })
    // deleteTeamById checks getManagerId() === requestingAgentId, not isManager()
    vi.mocked(getManagerId).mockReturnValue('manager-agent')

    const req = makeRequest(`/api/teams/${team.id}`, {
      method: 'DELETE',
      headers: { 'X-Agent-Id': 'manager-agent' },
    })
    const res = await deleteTeamRoute(req, makeParams(team.id) as any)

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBe(true)

    // Restore default
    vi.mocked(getManagerId).mockReturnValue(null)
  })
})
