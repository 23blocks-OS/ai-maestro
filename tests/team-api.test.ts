import { describe, it, expect, vi, beforeEach } from 'vitest'

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

// ============================================================================
// Imports (after mocks)
// ============================================================================

import { createTeam, loadTeams } from '@/lib/team-registry'
import { GET as getTeamRoute, PUT as updateTeamRoute, DELETE as deleteTeamRoute } from '@/app/api/teams/[id]/route'
import { GET as listTeamsRoute, POST as createTeamRoute } from '@/app/api/teams/route'
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
    createTeam({ name: 'Team A', agentIds: [] })
    createTeam({ name: 'Team B', agentIds: [] })

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
})

// ============================================================================
// GET /api/teams/[id] - Get single team
// ============================================================================

describe('GET /api/teams/[id]', () => {
  it('returns 404 for non-existent team', async () => {
    const req = makeRequest('/api/teams/non-existent')
    const res = await getTeamRoute(req, makeParams('non-existent') as any)

    expect(res.status).toBe(404)
  })

  it('returns team when it exists', async () => {
    const team = createTeam({ name: 'Find Me', agentIds: [] })

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
    const team = createTeam({ name: 'Original', agentIds: [] })

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
    const team = createTeam({ name: 'Instructions Team', agentIds: [] })

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
    const team = createTeam({ name: 'Activity Team', agentIds: [] })
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
    const team = createTeam({ name: 'Persist', agentIds: [] })

    const req = makeRequest(`/api/teams/${team.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instructions: 'Saved' }),
    })
    await updateTeamRoute(req, makeParams(team.id) as any)

    const teams = loadTeams()
    expect(teams[0].instructions).toBe('Saved')
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
    const team = createTeam({ name: 'Delete Me', agentIds: [] })

    const req = makeRequest(`/api/teams/${team.id}`, { method: 'DELETE' })
    const res = await deleteTeamRoute(req, makeParams(team.id) as any)

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBe(true)
    expect(loadTeams()).toHaveLength(0)
  })
})
