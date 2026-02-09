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

import { createTeam } from '@/lib/team-registry'
import { createDocument, loadDocuments } from '@/lib/document-registry'
import { GET as listDocuments, POST as createDocumentRoute } from '@/app/api/teams/[id]/documents/route'
import { GET as getDocumentRoute, PUT as updateDocumentRoute, DELETE as deleteDocumentRoute } from '@/app/api/teams/[id]/documents/[docId]/route'
import { NextRequest } from 'next/server'

// ============================================================================
// Helpers
// ============================================================================

function makeRequest(url: string, options: Record<string, unknown> = {}): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost:23000'), options as any)
}

function makeParams(id: string, docId?: string) {
  if (docId) {
    return { params: Promise.resolve({ id, docId }) }
  }
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
// GET /api/teams/[id]/documents - List documents
// ============================================================================

describe('GET /api/teams/[id]/documents', () => {
  it('returns 404 when team does not exist', async () => {
    const req = makeRequest('/api/teams/non-existent/documents')
    const res = await listDocuments(req, makeParams('non-existent') as any)

    expect(res.status).toBe(404)
    const data = await res.json()
    expect(data.error).toBe('Team not found')
  })

  it('returns empty documents array for team with no docs', async () => {
    const team = createTeam({ name: 'Test Team', agentIds: [] })

    const req = makeRequest(`/api/teams/${team.id}/documents`)
    const res = await listDocuments(req, makeParams(team.id) as any)

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.documents).toEqual([])
  })

  it('returns documents for a team', async () => {
    const team = createTeam({ name: 'Docs Team', agentIds: [] })
    createDocument({ teamId: team.id, title: 'Doc 1', content: 'Content 1' })
    createDocument({ teamId: team.id, title: 'Doc 2', content: 'Content 2' })

    const req = makeRequest(`/api/teams/${team.id}/documents`)
    const res = await listDocuments(req, makeParams(team.id) as any)

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.documents).toHaveLength(2)
    expect(data.documents[0].title).toBe('Doc 1')
    expect(data.documents[1].title).toBe('Doc 2')
  })
})

// ============================================================================
// POST /api/teams/[id]/documents - Create document
// ============================================================================

describe('POST /api/teams/[id]/documents', () => {
  it('returns 404 when team does not exist', async () => {
    const req = makeRequest('/api/teams/non-existent/documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Test', content: 'body' }),
    })
    const res = await createDocumentRoute(req, makeParams('non-existent') as any)

    expect(res.status).toBe(404)
  })

  it('returns 400 when title is missing', async () => {
    const team = createTeam({ name: 'Test Team', agentIds: [] })

    const req = makeRequest(`/api/teams/${team.id}/documents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'body' }),
    })
    const res = await createDocumentRoute(req, makeParams(team.id) as any)

    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toBe('title is required')
  })

  it('creates a document with 201 status', async () => {
    const team = createTeam({ name: 'Create Team', agentIds: [] })

    const req = makeRequest(`/api/teams/${team.id}/documents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'New Doc', content: 'Hello world', pinned: true, tags: ['api'] }),
    })
    const res = await createDocumentRoute(req, makeParams(team.id) as any)

    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.document.title).toBe('New Doc')
    expect(data.document.content).toBe('Hello world')
    expect(data.document.pinned).toBe(true)
    expect(data.document.tags).toEqual(['api'])
  })

  it('persists created document', async () => {
    const team = createTeam({ name: 'Persist Team', agentIds: [] })

    const req = makeRequest(`/api/teams/${team.id}/documents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Persisted', content: 'data' }),
    })
    await createDocumentRoute(req, makeParams(team.id) as any)

    const docs = loadDocuments(team.id)
    expect(docs).toHaveLength(1)
    expect(docs[0].title).toBe('Persisted')
  })

  it('defaults content to empty string when not provided', async () => {
    const team = createTeam({ name: 'Default Content', agentIds: [] })

    const req = makeRequest(`/api/teams/${team.id}/documents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'No Content' }),
    })
    const res = await createDocumentRoute(req, makeParams(team.id) as any)

    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.document.content).toBe('')
  })
})

// ============================================================================
// GET /api/teams/[id]/documents/[docId] - Get single document
// ============================================================================

describe('GET /api/teams/[id]/documents/[docId]', () => {
  it('returns 404 when team does not exist', async () => {
    const req = makeRequest('/api/teams/non-existent/documents/doc-1')
    const res = await getDocumentRoute(req, makeParams('non-existent', 'doc-1') as any)

    expect(res.status).toBe(404)
    const data = await res.json()
    expect(data.error).toBe('Team not found')
  })

  it('returns 404 when document does not exist', async () => {
    const team = createTeam({ name: 'Test Team', agentIds: [] })

    const req = makeRequest(`/api/teams/${team.id}/documents/non-existent`)
    const res = await getDocumentRoute(req, makeParams(team.id, 'non-existent') as any)

    expect(res.status).toBe(404)
    const data = await res.json()
    expect(data.error).toBe('Document not found')
  })

  it('returns the document when it exists', async () => {
    const team = createTeam({ name: 'Get Team', agentIds: [] })
    const doc = createDocument({ teamId: team.id, title: 'Find Me', content: 'Here I am' })

    const req = makeRequest(`/api/teams/${team.id}/documents/${doc.id}`)
    const res = await getDocumentRoute(req, makeParams(team.id, doc.id) as any)

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.document.title).toBe('Find Me')
    expect(data.document.content).toBe('Here I am')
  })
})

// ============================================================================
// PUT /api/teams/[id]/documents/[docId] - Update document
// ============================================================================

describe('PUT /api/teams/[id]/documents/[docId]', () => {
  it('returns 404 when document does not exist', async () => {
    const req = makeRequest('/api/teams/team-1/documents/non-existent', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Updated' }),
    })
    const res = await updateDocumentRoute(req, makeParams('team-1', 'non-existent') as any)

    expect(res.status).toBe(404)
  })

  it('updates document title', async () => {
    const team = createTeam({ name: 'Update Team', agentIds: [] })
    const doc = createDocument({ teamId: team.id, title: 'Original', content: '' })

    const req = makeRequest(`/api/teams/${team.id}/documents/${doc.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Updated Title' }),
    })
    const res = await updateDocumentRoute(req, makeParams(team.id, doc.id) as any)

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.document.title).toBe('Updated Title')
  })

  it('updates document content', async () => {
    const team = createTeam({ name: 'Content Team', agentIds: [] })
    const doc = createDocument({ teamId: team.id, title: 'Stable', content: 'old' })

    const req = makeRequest(`/api/teams/${team.id}/documents/${doc.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'new content' }),
    })
    const res = await updateDocumentRoute(req, makeParams(team.id, doc.id) as any)

    const data = await res.json()
    expect(data.document.content).toBe('new content')
    expect(data.document.title).toBe('Stable')
  })

  it('updates pinned status', async () => {
    const team = createTeam({ name: 'Pin Team', agentIds: [] })
    const doc = createDocument({ teamId: team.id, title: 'Pin Me', content: '' })

    const req = makeRequest(`/api/teams/${team.id}/documents/${doc.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pinned: true }),
    })
    const res = await updateDocumentRoute(req, makeParams(team.id, doc.id) as any)

    const data = await res.json()
    expect(data.document.pinned).toBe(true)
  })
})

// ============================================================================
// DELETE /api/teams/[id]/documents/[docId] - Delete document
// ============================================================================

describe('DELETE /api/teams/[id]/documents/[docId]', () => {
  it('returns 404 when document does not exist', async () => {
    const req = makeRequest('/api/teams/team-1/documents/non-existent', { method: 'DELETE' })
    const res = await deleteDocumentRoute(req, makeParams('team-1', 'non-existent') as any)

    expect(res.status).toBe(404)
  })

  it('deletes document and returns success', async () => {
    const team = createTeam({ name: 'Delete Team', agentIds: [] })
    const doc = createDocument({ teamId: team.id, title: 'Delete Me', content: '' })

    const req = makeRequest(`/api/teams/${team.id}/documents/${doc.id}`, { method: 'DELETE' })
    const res = await deleteDocumentRoute(req, makeParams(team.id, doc.id) as any)

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBe(true)

    const remaining = loadDocuments(team.id)
    expect(remaining).toHaveLength(0)
  })
})
