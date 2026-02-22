import { describe, it, expect, vi, beforeEach } from 'vitest'
import path from 'path'
import os from 'os'

// ============================================================================
// Mocks
// ============================================================================

// In-memory filesystem store (keyed by absolute file path)
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
    // MF-024: Support atomic write pattern (write to .tmp then rename)
    renameSync: vi.fn((src: string, dest: string) => {
      if (src in fsStore) {
        fsStore[dest] = fsStore[src]
        delete fsStore[src]
      }
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

// Mock file-lock so withLock just executes the callback directly
vi.mock('@/lib/file-lock', () => ({
  withLock: vi.fn((_name: string, fn: () => unknown) => Promise.resolve(fn())),
}))

// ============================================================================
// Import module under test (after mocks are declared)
// ============================================================================

import {
  loadDocuments,
  saveDocuments,
  getDocument,
  createDocument,
  updateDocument,
  deleteDocument,
} from '@/lib/document-registry'
import type { TeamDocument } from '@/types/document'

// ============================================================================
// Test helpers
// ============================================================================

const TEAMS_DIR = path.join(os.homedir(), '.aimaestro', 'teams')

// Valid UUID constants for test team IDs (docsFilePath requires strict UUID format)
const TEAM_1 = '00000000-0000-4000-8000-000000000001'
const TEAM_2 = '00000000-0000-4000-8000-000000000002'
const TEAM_A = '00000000-0000-4000-8000-00000000000a'
const TEAM_B = '00000000-0000-4000-8000-00000000000b'
const TEAM_EMPTY = '00000000-0000-4000-8000-0000000000ee'

function docsFilePath(teamId: string): string {
  return path.join(TEAMS_DIR, `docs-${teamId}.json`)
}

/** Build a TeamDocument object with sensible defaults. */
function makeDoc(overrides: Partial<TeamDocument> = {}): TeamDocument {
  return {
    id: `doc-${++uuidCounter}`,
    teamId: TEAM_1,
    title: 'Default Doc',
    content: 'Some content',
    pinned: false,
    tags: [],
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  }
}

// ============================================================================
// Setup / teardown
// ============================================================================

beforeEach(() => {
  fsStore = {}
  uuidCounter = 0
  vi.clearAllMocks()
})

// ============================================================================
// loadDocuments
// ============================================================================

describe('loadDocuments', () => {
  it('returns empty array when file does not exist', () => {
    const docs = loadDocuments(TEAM_1)
    expect(docs).toEqual([])
  })

  it('returns documents from an existing file', () => {
    const doc = makeDoc({ id: 'doc-a', teamId: TEAM_1 })
    fsStore[docsFilePath(TEAM_1)] = JSON.stringify({ version: 1, documents: [doc] })

    const docs = loadDocuments(TEAM_1)
    expect(docs).toHaveLength(1)
    expect(docs[0].id).toBe('doc-a')
  })

  it('returns empty array when file contains invalid JSON', () => {
    fsStore[docsFilePath(TEAM_1)] = '{ broken json'

    const docs = loadDocuments(TEAM_1)
    expect(docs).toEqual([])
  })

  it('returns empty array when documents property is not an array', () => {
    fsStore[docsFilePath(TEAM_1)] = JSON.stringify({ version: 1, documents: 'not-an-array' })

    const docs = loadDocuments(TEAM_1)
    expect(docs).toEqual([])
  })
})

// ============================================================================
// saveDocuments
// ============================================================================

describe('saveDocuments', () => {
  it('writes documents to the correct file path with version wrapper', () => {
    const doc = makeDoc({ id: 'doc-s1', teamId: TEAM_2 })
    const result = saveDocuments(TEAM_2, [doc])

    expect(result).toBe(true)
    const written = JSON.parse(fsStore[docsFilePath(TEAM_2)])
    expect(written.version).toBe(1)
    expect(written.documents).toHaveLength(1)
    expect(written.documents[0].id).toBe('doc-s1')
  })

  it('round-trips with loadDocuments', () => {
    const doc = makeDoc({ id: 'doc-rt', teamId: TEAM_1, title: 'Round Trip' })
    saveDocuments(TEAM_1, [doc])

    const loaded = loadDocuments(TEAM_1)
    expect(loaded).toHaveLength(1)
    expect(loaded[0].title).toBe('Round Trip')
  })
})

// ============================================================================
// createDocument
// ============================================================================

describe('createDocument', () => {
  it('creates a document with provided fields', async () => {
    const doc = await createDocument({ teamId: TEAM_1, title: 'New Doc', content: 'Hello' })

    expect(doc.title).toBe('New Doc')
    expect(doc.content).toBe('Hello')
    expect(doc.teamId).toBe(TEAM_1)
  })

  it('generates a UUID for the document id', async () => {
    const doc = await createDocument({ teamId: TEAM_1, title: 'UUID Test', content: '' })

    expect(doc.id).toMatch(/^uuid-/)
  })

  it('sets createdAt and updatedAt to the same ISO timestamp', async () => {
    const doc = await createDocument({ teamId: TEAM_1, title: 'Timestamp Test', content: '' })

    expect(doc.createdAt).toBe(doc.updatedAt)
    expect(new Date(doc.createdAt).toISOString()).toBe(doc.createdAt)
  })

  it('persists the document to storage', async () => {
    await createDocument({ teamId: TEAM_1, title: 'Persisted Doc', content: 'data' })

    const loaded = loadDocuments(TEAM_1)
    expect(loaded).toHaveLength(1)
    expect(loaded[0].title).toBe('Persisted Doc')
  })

  it('defaults pinned to false when not provided', async () => {
    const doc = await createDocument({ teamId: TEAM_1, title: 'No Pin', content: '' })
    expect(doc.pinned).toBe(false)
  })

  it('defaults tags to empty array when not provided', async () => {
    const doc = await createDocument({ teamId: TEAM_1, title: 'No Tags', content: '' })
    expect(doc.tags).toEqual([])
  })

  it('preserves pinned and tags when provided', async () => {
    const doc = await createDocument({
      teamId: TEAM_1,
      title: 'Full Doc',
      content: 'body',
      pinned: true,
      tags: ['api', 'design'],
    })

    expect(doc.pinned).toBe(true)
    expect(doc.tags).toEqual(['api', 'design'])
  })

  it('appends to existing documents', async () => {
    await createDocument({ teamId: TEAM_1, title: 'First', content: '' })
    await createDocument({ teamId: TEAM_1, title: 'Second', content: '' })

    const loaded = loadDocuments(TEAM_1)
    expect(loaded).toHaveLength(2)
    expect(loaded[0].title).toBe('First')
    expect(loaded[1].title).toBe('Second')
  })
})

// ============================================================================
// getDocument
// ============================================================================

describe('getDocument', () => {
  it('returns the document when it exists', async () => {
    await createDocument({ teamId: TEAM_1, title: 'Find Me', content: 'here' })
    const docs = loadDocuments(TEAM_1)
    const docId = docs[0].id

    const found = getDocument(TEAM_1, docId)
    expect(found).not.toBeNull()
    expect(found!.title).toBe('Find Me')
  })

  it('returns null for a non-existent document ID', async () => {
    await createDocument({ teamId: TEAM_1, title: 'Exists', content: '' })

    const found = getDocument(TEAM_1, 'non-existent-id')
    expect(found).toBeNull()
  })

  it('returns null when team has no documents file', () => {
    const found = getDocument(TEAM_EMPTY, 'any-id')
    expect(found).toBeNull()
  })
})

// ============================================================================
// updateDocument
// ============================================================================

describe('updateDocument', () => {
  it('returns null when document does not exist', async () => {
    const result = await updateDocument(TEAM_1, 'non-existent', { title: 'Updated' })
    expect(result).toBeNull()
  })

  it('updates the title and sets updatedAt', async () => {
    const created = await createDocument({ teamId: TEAM_1, title: 'Original', content: '' })
    const updated = await updateDocument(TEAM_1, created.id, { title: 'Updated' })

    expect(updated).not.toBeNull()
    expect(updated!.title).toBe('Updated')
    expect(updated!.updatedAt).toBeDefined()
    expect(new Date(updated!.updatedAt).toISOString()).toBe(updated!.updatedAt)
  })

  it('updates content while preserving other fields', async () => {
    const created = await createDocument({ teamId: TEAM_1, title: 'Keep Title', content: 'old', pinned: true })
    const updated = await updateDocument(TEAM_1, created.id, { content: 'new' })

    expect(updated!.content).toBe('new')
    expect(updated!.title).toBe('Keep Title')
    expect(updated!.pinned).toBe(true)
  })

  it('updates pinned status', async () => {
    const created = await createDocument({ teamId: TEAM_1, title: 'Pin Me', content: '' })
    expect(created.pinned).toBe(false)

    const updated = await updateDocument(TEAM_1, created.id, { pinned: true })
    expect(updated!.pinned).toBe(true)
  })

  it('updates tags', async () => {
    const created = await createDocument({ teamId: TEAM_1, title: 'Tag Me', content: '', tags: ['old'] })
    const updated = await updateDocument(TEAM_1, created.id, { tags: ['new', 'updated'] })

    expect(updated!.tags).toEqual(['new', 'updated'])
  })

  it('persists updates to storage', async () => {
    const created = await createDocument({ teamId: TEAM_1, title: 'Persist Update', content: '' })
    await updateDocument(TEAM_1, created.id, { title: 'Persisted' })

    const loaded = loadDocuments(TEAM_1)
    expect(loaded[0].title).toBe('Persisted')
  })
})

// ============================================================================
// deleteDocument
// ============================================================================

describe('deleteDocument', () => {
  it('removes the document and returns true', async () => {
    const doc = await createDocument({ teamId: TEAM_1, title: 'Delete Me', content: '' })

    const result = await deleteDocument(TEAM_1, doc.id)
    expect(result).toBe(true)

    const remaining = loadDocuments(TEAM_1)
    expect(remaining).toHaveLength(0)
  })

  it('returns false when document does not exist', async () => {
    const result = await deleteDocument(TEAM_1, 'non-existent')
    expect(result).toBe(false)
  })

  it('preserves other documents when deleting one', async () => {
    const doc1 = await createDocument({ teamId: TEAM_1, title: 'Keep', content: '' })
    const doc2 = await createDocument({ teamId: TEAM_1, title: 'Delete', content: '' })

    await deleteDocument(TEAM_1, doc2.id)

    const remaining = loadDocuments(TEAM_1)
    expect(remaining).toHaveLength(1)
    expect(remaining[0].id).toBe(doc1.id)
  })

  it('works across different team IDs', async () => {
    const doc1 = await createDocument({ teamId: TEAM_A, title: 'Team A Doc', content: '' })
    await createDocument({ teamId: TEAM_B, title: 'Team B Doc', content: '' })

    await deleteDocument(TEAM_A, doc1.id)

    expect(loadDocuments(TEAM_A)).toHaveLength(0)
    expect(loadDocuments(TEAM_B)).toHaveLength(1)
  })
})
