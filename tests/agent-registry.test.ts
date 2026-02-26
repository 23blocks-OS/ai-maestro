import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ============================================================================
// Mocks (must be declared before imports)
// ============================================================================

// Predictable UUID sequence
let uuidCounter = 0
vi.mock('uuid', () => ({
  v4: () => `00000000-0000-0000-0000-${String(++uuidCounter).padStart(12, '0')}`,
}))

vi.mock('@/lib/hosts-config', () => ({
  getSelfHost: () => ({ id: 'test-host', name: 'Test Host', url: 'http://test-host:23000' }),
  getSelfHostId: () => 'test-host',
}))

vi.mock('@/lib/amp-inbox-writer', () => ({
  renameInIndex: vi.fn(),
  removeFromIndex: vi.fn(),
}))

// Mock child_process to prevent tmux commands
// Must include exec, execSync, execFile, execFileSync (used by agent-runtime.ts and agent-registry.ts)
vi.mock('child_process', () => ({
  exec: vi.fn((cmd: string, cb: Function) => cb(null, '', '')),
  execSync: vi.fn(),
  execFile: vi.fn((_file: string, _args: string[], cb: Function) => cb(null, '', '')),
  execFileSync: vi.fn(() => ''),
}))

// In-memory filesystem mock
let fileStore: Record<string, string> = {}
let fileMtimes: Record<string, number> = {}
let dirStore: Set<string> = new Set()
let mtimeCounter = 0

// SF-032: Named export aliases alongside default export ensure the mock works
// regardless of whether the source uses `import fs from 'fs'` (default) or
// `import { readFileSync } from 'fs'` (named).
// MF-027: Added renameSync so atomic write operations are properly tested.
vi.mock('fs', () => {
  const existsSync = (p: string) => {
    return dirStore.has(p) || fileStore[p] !== undefined
  }
  const mkdirSync = (p: string, _opts?: any) => {
    dirStore.add(p)
  }
  const readFileSync = (p: string, _encoding?: string) => {
    if (fileStore[p] === undefined) {
      throw new Error(`ENOENT: no such file or directory, open '${p}'`)
    }
    return fileStore[p]
  }
  const writeFileSync = (p: string, data: string, _encoding?: string) => {
    fileStore[p] = data
    fileMtimes[p] = ++mtimeCounter
  }
  const statSync = (p: string) => {
    if (fileStore[p] === undefined) {
      throw new Error(`ENOENT: no such file or directory, stat '${p}'`)
    }
    return { mtimeMs: fileMtimes[p] || 0 }
  }
  const rmSync = (_p: string, _opts?: any) => {
    // no-op for delete operations in tests
  }
  // MF-027: renameSync enables testing of atomic write pattern (write .tmp then rename)
  const renameSync = (oldPath: string, newPath: string) => {
    if (fileStore[oldPath] === undefined) {
      throw new Error(`ENOENT: no such file or directory, rename '${oldPath}'`)
    }
    fileStore[newPath] = fileStore[oldPath]
    delete fileStore[oldPath]
    fileMtimes[newPath] = fileMtimes[oldPath] || ++mtimeCounter
    delete fileMtimes[oldPath]
  }
  const copyFileSync = (src: string, dest: string) => {
    if (fileStore[src] === undefined) {
      throw new Error(`ENOENT: no such file or directory, copyfile '${src}'`)
    }
    fileStore[dest] = fileStore[src]
  }

  return {
    default: { existsSync, mkdirSync, readFileSync, writeFileSync, statSync, rmSync, renameSync, copyFileSync },
    // SF-032: Named exports mirror default for compatibility with named imports
    existsSync, mkdirSync, readFileSync, writeFileSync, statSync, rmSync, renameSync, copyFileSync,
  }
})

// ============================================================================
// Imports (after mocks)
// ============================================================================

import {
  loadAgents,
  saveAgents,
  getAgent,
  getAgentByName,
  createAgent,
  updateAgent,
  deleteAgent,
  linkSession,
  unlinkSession,
  searchAgents,
  updateAgentStatus,
  resolveAlias,
  normalizeHostId,
  needsHostIdNormalization,
  listAgents,
  renameAgent,
  getAgentBySession,
  addSessionToAgent,
  incrementAgentMetric,
} from '@/lib/agent-registry'
import path from 'path'
import os from 'os'
import type { Agent, CreateAgentRequest } from '@/types/agent'

// ============================================================================
// Test Helpers
// ============================================================================

function makeCreateRequest(overrides: Partial<CreateAgentRequest> = {}): CreateAgentRequest {
  return {
    name: 'test-agent',
    program: 'Claude Code',
    taskDescription: 'Test task',
    ...overrides,
  }
}

/**
 * Invalidate the mtime-based cache inside agent-registry by forcing a fresh
 * state. We do this by clearing the in-memory store, which makes existsSync
 * return false for the registry file, effectively resetting cache.
 */
function resetStore() {
  fileStore = {}
  fileMtimes = {}
  dirStore = new Set()
  mtimeCounter = 0
  uuidCounter = 0
}

// ============================================================================
// Tests
// ============================================================================

beforeEach(() => {
  resetStore()
  vi.clearAllMocks()
})

// ============================================================================
// loadAgents / saveAgents
// ============================================================================

describe('loadAgents', () => {
  it('returns an empty array when registry file does not exist', () => {
    const agents = loadAgents()
    expect(agents).toEqual([])
  })

  it('returns an empty array when registry file contains invalid JSON', () => {
    // Manually seed a file with bad JSON
    const dir = path.join(os.homedir(), '.aimaestro', 'agents')
    const file = path.join(dir, 'registry.json')
    dirStore.add(dir)
    fileStore[file] = '{{not json}}'
    fileMtimes[file] = ++mtimeCounter

    const agents = loadAgents()
    expect(agents).toEqual([])
  })

  it('returns an empty array when registry file contains a non-array', () => {
    const file = path.join(os.homedir(), '.aimaestro', 'agents', 'registry.json')
    dirStore.add(path.dirname(file))
    fileStore[file] = JSON.stringify({ notAnArray: true })
    fileMtimes[file] = ++mtimeCounter

    const agents = loadAgents()
    expect(agents).toEqual([])
  })
})

describe('saveAgents / loadAgents round-trip', () => {
  it('persists and retrieves agents correctly', async () => {
    const agent = await createAgent(makeCreateRequest({ name: 'round-trip' }))
    const loaded = loadAgents()
    expect(loaded).toHaveLength(1)
    expect(loaded[0].name).toBe('round-trip')
    expect(loaded[0].id).toBe(agent.id)
  })

  it('invalidates cache after saveAgents', async () => {
    const agent1 = await createAgent(makeCreateRequest({ name: 'agent-one' }))
    const firstLoad = loadAgents()
    expect(firstLoad).toHaveLength(1)

    // Create a second agent (which calls saveAgents internally)
    await createAgent(makeCreateRequest({ name: 'agent-two' }))
    const secondLoad = loadAgents()
    expect(secondLoad).toHaveLength(2)
  })
})

// ============================================================================
// getAgent
// ============================================================================

describe('getAgent', () => {
  it('returns agent by ID', async () => {
    const created = await createAgent(makeCreateRequest({ name: 'lookup-by-id' }))
    const found = getAgent(created.id)
    expect(found).not.toBeNull()
    expect(found!.id).toBe(created.id)
    expect(found!.name).toBe('lookup-by-id')
  })

  it('returns null for non-existent ID', () => {
    const found = getAgent('nonexistent-uuid')
    expect(found).toBeNull()
  })
})

// ============================================================================
// getAgentByName
// ============================================================================

describe('getAgentByName', () => {
  it('finds agent by exact name (case-insensitive)', async () => {
    await createAgent(makeCreateRequest({ name: 'My-Agent' }))
    const found = getAgentByName('my-agent')
    expect(found).not.toBeNull()
    expect(found!.name).toBe('my-agent')
  })

  it('finds agent with uppercase query', async () => {
    await createAgent(makeCreateRequest({ name: 'lowercase-agent' }))
    const found = getAgentByName('LOWERCASE-AGENT')
    expect(found).not.toBeNull()
  })

  it('returns null when name does not exist', () => {
    const found = getAgentByName('ghost')
    expect(found).toBeNull()
  })

  it('scopes lookup to specified hostId', async () => {
    await createAgent(makeCreateRequest({ name: 'host-scoped' }))
    // The agent was created on test-host. Searching on a different host should not find it.
    const foundOnOther = getAgentByName('host-scoped', 'other-host')
    expect(foundOnOther).toBeNull()
    // But searching on the correct host should find it.
    const foundOnSelf = getAgentByName('host-scoped', 'test-host')
    expect(foundOnSelf).not.toBeNull()
  })
})

// ============================================================================
// getAgentBySession
// ============================================================================

describe('getAgentBySession', () => {
  it('resolves session name to agent (index 0 - bare name)', async () => {
    await createAgent(makeCreateRequest({ name: 'website' }))
    const found = getAgentBySession('website')
    expect(found).not.toBeNull()
    expect(found!.name).toBe('website')
  })

  it('resolves session name with index suffix', async () => {
    await createAgent(makeCreateRequest({ name: 'backend' }))
    const found = getAgentBySession('backend_1')
    expect(found).not.toBeNull()
    expect(found!.name).toBe('backend')
  })

  it('returns null for unknown session name', () => {
    const found = getAgentBySession('nonexistent_0')
    expect(found).toBeNull()
  })
})

// ============================================================================
// createAgent
// ============================================================================

describe('createAgent', () => {
  it('creates an agent with all required fields', async () => {
    const agent = await createAgent(makeCreateRequest({
      name: 'new-agent',
      workingDirectory: '/tmp/work',
      tags: ['backend', 'api'],
    }))

    expect(agent.id).toBeDefined()
    expect(agent.name).toBe('new-agent')
    expect(agent.workingDirectory).toBe('/tmp/work')
    expect(agent.hostId).toBe('test-host')
    expect(agent.hostUrl).toBe('http://test-host:23000')
    expect(agent.status).toBe('offline')
    expect(agent.tags).toEqual(['backend', 'api'])
    expect(agent.metrics).toBeDefined()
    expect(agent.createdAt).toBeDefined()
  })

  it('normalizes agent name to lowercase', async () => {
    const agent = await createAgent(makeCreateRequest({ name: 'UpperCase-Agent' }))
    expect(agent.name).toBe('uppercase-agent')
  })

  it('throws when name is missing', async () => {
    await expect(createAgent({
      name: '',
      program: 'test',
      taskDescription: 'test',
    })).rejects.toThrow('Agent name is required')
  })

  it('throws when duplicate name exists on the same host', async () => {
    await createAgent(makeCreateRequest({ name: 'unique-agent' }))
    await expect(createAgent(makeCreateRequest({ name: 'unique-agent' }))).rejects.toThrow(
      /already exists on host/
    )
  })

  it('auto-generates label when not provided', async () => {
    const agent = await createAgent(makeCreateRequest({ name: 'auto-label' }))
    expect(agent.label).toBeDefined()
    expect(typeof agent.label).toBe('string')
    expect(agent.label!.length).toBeGreaterThan(0)
  })

  it('uses provided label instead of auto-generating', async () => {
    const agent = await createAgent(makeCreateRequest({ name: 'custom-label', label: 'Custom Name' }))
    expect(agent.label).toBe('Custom Name')
  })

  it('auto-generates avatar when not provided', async () => {
    const agent = await createAgent(makeCreateRequest({ name: 'auto-avatar' }))
    expect(agent.avatar).toMatch(/^\/avatars\/(men|women)_\d{2}\.png$/)
  })

  it('uses provided avatar instead of auto-generating', async () => {
    const agent = await createAgent(makeCreateRequest({ name: 'custom-avatar', avatar: '/custom.png' }))
    expect(agent.avatar).toBe('/custom.png')
  })

  it('creates initial session when createSession is true', async () => {
    const agent = await createAgent(makeCreateRequest({
      name: 'with-session',
      createSession: true,
      workingDirectory: '/tmp/session',
    }))
    expect(agent.sessions).toHaveLength(1)
    expect(agent.sessions[0].index).toBe(0)
    expect(agent.sessions[0].status).toBe('offline')
    expect(agent.sessions[0].workingDirectory).toBe('/tmp/session')
  })

  it('creates empty sessions array when createSession is false', async () => {
    const agent = await createAgent(makeCreateRequest({ name: 'no-session' }))
    expect(agent.sessions).toHaveLength(0)
  })

  it('normalizes tags to lowercase', async () => {
    const agent = await createAgent(makeCreateRequest({ name: 'tagged', tags: ['Backend', 'API'] }))
    expect(agent.tags).toEqual(['backend', 'api'])
  })

  it('supports deprecated alias field as name fallback', async () => {
    const agent = await createAgent({
      alias: 'legacy-alias',
      program: 'test',
      taskDescription: 'test',
    } as CreateAgentRequest)
    expect(agent.name).toBe('legacy-alias')
  })
})

// ============================================================================
// updateAgent
// ============================================================================

describe('updateAgent', () => {
  it('updates specified fields while preserving others', async () => {
    const agent = await createAgent(makeCreateRequest({
      name: 'update-me',
      workingDirectory: '/original',
    }))

    const updated = await updateAgent(agent.id, { taskDescription: 'New task' })
    expect(updated).not.toBeNull()
    expect(updated!.taskDescription).toBe('New task')
    expect(updated!.name).toBe('update-me')
    expect(updated!.workingDirectory).toBe('/original')
  })

  it('returns null for non-existent agent', async () => {
    const result = await updateAgent('nonexistent-id', { taskDescription: 'update' })
    expect(result).toBeNull()
  })

  it('rejects duplicate name on same host', async () => {
    await createAgent(makeCreateRequest({ name: 'agent-alpha' }))
    const beta = await createAgent(makeCreateRequest({ name: 'agent-beta' }))

    await expect(updateAgent(beta.id, { name: 'agent-alpha' })).rejects.toThrow(
      /already exists on host/
    )
  })

  it('allows updating to the same name (no-op rename)', async () => {
    const agent = await createAgent(makeCreateRequest({ name: 'same-name' }))
    const updated = await updateAgent(agent.id, { name: 'same-name' })
    expect(updated).not.toBeNull()
    expect(updated!.name).toBe('same-name')
  })

  it('updates lastActive timestamp', async () => {
    const agent = await createAgent(makeCreateRequest({ name: 'ts-agent' }))

    const updated = await updateAgent(agent.id, { taskDescription: 'changed' })
    expect(updated!.lastActive).toBeDefined()
    // Verify lastActive is a valid ISO timestamp (updateAgent always refreshes it)
    expect(new Date(updated!.lastActive).toISOString()).toBe(updated!.lastActive)
  })

  it('merges documentation fields', async () => {
    const agent = await createAgent(makeCreateRequest({ name: 'doc-agent' }))
    await updateAgent(agent.id, { documentation: { description: 'Hello' } })
    const updated = await updateAgent(agent.id, { documentation: { notes: 'World' } })
    expect(updated!.documentation?.description).toBe('Hello')
    expect(updated!.documentation?.notes).toBe('World')
  })

  it('merges preferences fields', async () => {
    const agent = await createAgent(makeCreateRequest({ name: 'pref-agent' }))
    await updateAgent(agent.id, { preferences: { autoStart: true } })
    const updated = await updateAgent(agent.id, { preferences: { notificationLevel: 'urgent' } })
    expect(updated!.preferences?.autoStart).toBe(true)
    expect(updated!.preferences?.notificationLevel).toBe('urgent')
  })
})

// ============================================================================
// deleteAgent
// ============================================================================

describe('deleteAgent', () => {
  it('soft-deletes agent by default (marks deletedAt, keeps in registry)', async () => {
    const agent = await createAgent(makeCreateRequest({ name: 'delete-me' }))
    expect(loadAgents()).toHaveLength(1)

    const result = await deleteAgent(agent.id)
    expect(result).toBe(true)
    // Soft-delete keeps agent in array but marks it deleted
    const agents = loadAgents()
    expect(agents).toHaveLength(1)
    expect(agents[0].deletedAt).toBeDefined()
    expect(agents[0].status).toBe('deleted')
  })

  it('hard-deletes agent when hard=true (removes from registry)', async () => {
    const agent = await createAgent(makeCreateRequest({ name: 'hard-delete-me' }))
    expect(loadAgents()).toHaveLength(1)

    const result = await deleteAgent(agent.id, true)
    expect(result).toBe(true)
    expect(loadAgents()).toHaveLength(0)
  })

  it('returns false for non-existent agent', async () => {
    const result = await deleteAgent('nonexistent-id')
    expect(result).toBe(false)
  })

  it('soft-deletes the correct agent when multiple exist', async () => {
    const a1 = await createAgent(makeCreateRequest({ name: 'keep-me' }))
    const a2 = await createAgent(makeCreateRequest({ name: 'delete-me' }))

    await deleteAgent(a2.id)
    const remaining = loadAgents()
    // Both agents still in array, but a2 is soft-deleted
    expect(remaining).toHaveLength(2)
    const kept = remaining.find(a => a.id === a1.id)
    const deleted = remaining.find(a => a.id === a2.id)
    expect(kept!.deletedAt).toBeUndefined()
    expect(deleted!.deletedAt).toBeDefined()
    expect(deleted!.status).toBe('deleted')
  })

  it('hard-deletes the correct agent when multiple exist', async () => {
    const a1 = await createAgent(makeCreateRequest({ name: 'keep-me' }))
    const a2 = await createAgent(makeCreateRequest({ name: 'delete-me' }))

    await deleteAgent(a2.id, true)
    const remaining = loadAgents()
    expect(remaining).toHaveLength(1)
    expect(remaining[0].id).toBe(a1.id)
  })
})

// ============================================================================
// Soft-delete filtering
// ============================================================================

describe('soft-delete filtering', () => {
  it('getAgent() returns null for soft-deleted agent', async () => {
    const agent = await createAgent(makeCreateRequest({ name: 'soft-del-lookup' }))
    await deleteAgent(agent.id) // soft-delete (default)

    const found = getAgent(agent.id)
    expect(found).toBeNull()
  })

  it('getAgent() returns soft-deleted agent with includeDeleted=true', async () => {
    const agent = await createAgent(makeCreateRequest({ name: 'soft-del-include' }))
    await deleteAgent(agent.id) // soft-delete

    const found = getAgent(agent.id, true)
    expect(found).not.toBeNull()
    expect(found!.id).toBe(agent.id)
    expect(found!.deletedAt).toBeDefined()
    expect(found!.status).toBe('deleted')
  })

  it('getAgentByName() excludes soft-deleted agents', async () => {
    const agent = await createAgent(makeCreateRequest({ name: 'soft-del-byname' }))
    expect(getAgentByName('soft-del-byname')).not.toBeNull()

    await deleteAgent(agent.id) // soft-delete

    const found = getAgentByName('soft-del-byname')
    expect(found).toBeNull()
  })

  it('listAgents() excludes soft-deleted agents', async () => {
    const a1 = await createAgent(makeCreateRequest({ name: 'list-keep' }))
    const a2 = await createAgent(makeCreateRequest({ name: 'list-delete' }))

    await deleteAgent(a2.id) // soft-delete a2

    const listed = listAgents()
    expect(listed).toHaveLength(1)
    expect(listed[0].id).toBe(a1.id)
    expect(listed[0].name).toBe('list-keep')
  })

  it('searchAgents() excludes soft-deleted agents', async () => {
    const agent = await createAgent(makeCreateRequest({ name: 'searchable-soft-del', tags: ['findme'] }))
    // Verify searchAgents finds it before deletion
    const beforeDelete = searchAgents('searchable')
    expect(beforeDelete).toHaveLength(1)
    expect(beforeDelete[0].id).toBe(agent.id)

    // Soft-delete the agent
    await deleteAgent(agent.id)

    // searchAgents must no longer return the soft-deleted agent
    const afterDelete = searchAgents('searchable')
    expect(afterDelete).toHaveLength(0)

    // Also verify searching by tag yields nothing
    const byTag = searchAgents('findme')
    expect(byTag).toHaveLength(0)
  })

  it('createAgent() succeeds with same name as soft-deleted agent', async () => {
    const original = await createAgent(makeCreateRequest({ name: 'name-reuse-test' }))
    const originalId = original.id

    // Soft-delete the original agent
    await deleteAgent(originalId)

    // Creating a new agent with the same name should NOT throw
    const reused = await createAgent(makeCreateRequest({ name: 'name-reuse-test' }))

    // New agent must have a different ID
    expect(reused.id).not.toBe(originalId)
    expect(reused.name).toBe('name-reuse-test')
    expect(reused.deletedAt).toBeUndefined()
    expect(reused.status).toBe('offline')

    // getAgentByName must return the NEW agent, not the deleted one
    const lookup = getAgentByName('name-reuse-test')
    expect(lookup).not.toBeNull()
    expect(lookup!.id).toBe(reused.id)
    expect(lookup!.id).not.toBe(originalId)
  })

  it('listAgents(true) includes soft-deleted agents', async () => {
    const a1 = await createAgent(makeCreateRequest({ name: 'listall-keep' }))
    const a2 = await createAgent(makeCreateRequest({ name: 'listall-delete' }))

    await deleteAgent(a2.id) // soft-delete a2

    const listed = listAgents(true)
    expect(listed).toHaveLength(2)

    const kept = listed.find(a => a.id === a1.id)
    const deleted = listed.find(a => a.id === a2.id)
    expect(kept).toBeDefined()
    expect(kept!.deletedAt).toBeUndefined()
    expect(deleted).toBeDefined()
    expect(deleted!.deletedAt).toBeDefined()
    expect(deleted!.name).toBe('listall-delete')
  })
})

// ============================================================================
// linkSession / unlinkSession
// ============================================================================

describe('linkSession', () => {
  it('links a session to an agent and sets status to active', async () => {
    const agent = await createAgent(makeCreateRequest({ name: 'link-agent' }))
    const result = await linkSession(agent.id, 'link-agent', '/tmp/work')

    expect(result).toBe(true)
    const updated = getAgent(agent.id)
    expect(updated!.sessions).toHaveLength(1)
    expect(updated!.sessions[0].status).toBe('online')
    expect(updated!.sessions[0].index).toBe(0)
    expect(updated!.sessions[0].workingDirectory).toBe('/tmp/work')
    expect(updated!.status).toBe('active')
  })

  it('links a session with a specific index', async () => {
    const agent = await createAgent(makeCreateRequest({ name: 'indexed-agent' }))
    const result = await linkSession(agent.id, 'indexed-agent_2', '/tmp/work')

    expect(result).toBe(true)
    const updated = getAgent(agent.id)
    expect(updated!.sessions[0].index).toBe(2)
  })

  it('returns false for non-existent agent', async () => {
    const result = await linkSession('nonexistent', 'session', '/tmp')
    expect(result).toBe(false)
  })

  it('replaces existing session at the same index', async () => {
    const agent = await createAgent(makeCreateRequest({ name: 'replace-session' }))
    await linkSession(agent.id, 'replace-session', '/tmp/first')
    await linkSession(agent.id, 'replace-session', '/tmp/second')

    const updated = getAgent(agent.id)
    expect(updated!.sessions).toHaveLength(1)
    expect(updated!.sessions[0].workingDirectory).toBe('/tmp/second')
  })

  it('sets agent workingDirectory if not already set', async () => {
    const agent = await createAgent(makeCreateRequest({ name: 'wd-agent' }))
    // Clear the working directory to test the auto-set
    const agents = loadAgents()
    const idx = agents.findIndex(a => a.id === agent.id)
    agents[idx].workingDirectory = undefined as any
    saveAgents(agents)

    await linkSession(agent.id, 'wd-agent', '/tmp/linked')
    const updated = getAgent(agent.id)
    expect(updated!.workingDirectory).toBe('/tmp/linked')
  })
})

describe('unlinkSession', () => {
  it('marks specific session as offline', async () => {
    const agent = await createAgent(makeCreateRequest({ name: 'unlink-agent' }))
    await linkSession(agent.id, 'unlink-agent', '/tmp')

    const result = await unlinkSession(agent.id, 0)
    expect(result).toBe(true)

    const updated = getAgent(agent.id)
    expect(updated!.sessions[0].status).toBe('offline')
    expect(updated!.status).toBe('offline')
  })

  it('marks all sessions offline when no index is provided', async () => {
    const agent = await createAgent(makeCreateRequest({ name: 'unlink-all' }))
    await linkSession(agent.id, 'unlink-all', '/tmp')
    await linkSession(agent.id, 'unlink-all_1', '/tmp')

    await unlinkSession(agent.id)
    const updated = getAgent(agent.id)
    expect(updated!.sessions.every(s => s.status === 'offline')).toBe(true)
    expect(updated!.status).toBe('offline')
  })

  it('returns false for non-existent agent', async () => {
    const result = await unlinkSession('nonexistent')
    expect(result).toBe(false)
  })

  it('keeps agent active if other sessions are still online', async () => {
    const agent = await createAgent(makeCreateRequest({ name: 'partial-unlink' }))
    await linkSession(agent.id, 'partial-unlink', '/tmp')
    await linkSession(agent.id, 'partial-unlink_1', '/tmp')

    await unlinkSession(agent.id, 1) // Only unlink session index 1
    const updated = getAgent(agent.id)
    expect(updated!.status).toBe('active')
    expect(updated!.sessions.find(s => s.index === 0)!.status).toBe('online')
    expect(updated!.sessions.find(s => s.index === 1)!.status).toBe('offline')
  })
})

// ============================================================================
// searchAgents
// ============================================================================

describe('searchAgents', () => {
  beforeEach(async () => {
    await createAgent(makeCreateRequest({ name: 'backend-api', tags: ['typescript', 'rest'] }))
    await createAgent(makeCreateRequest({ name: 'frontend-web', tags: ['react', 'ui'] }))
    await createAgent(makeCreateRequest({ name: 'data-pipeline', tags: ['python', 'etl'] }))
  })

  it('finds agents by name substring', () => {
    const results = searchAgents('backend')
    expect(results).toHaveLength(1)
    expect(results[0].name).toBe('backend-api')
  })

  it('finds agents by tag', () => {
    const results = searchAgents('react')
    expect(results).toHaveLength(1)
    expect(results[0].name).toBe('frontend-web')
  })

  it('returns all matching agents for broad query', () => {
    const results = searchAgents('e')  // matches all three names
    expect(results.length).toBeGreaterThanOrEqual(2)
  })

  it('returns empty array when no match', () => {
    const results = searchAgents('zzz-nonexistent')
    expect(results).toHaveLength(0)
  })

  it('is case-insensitive', () => {
    const results = searchAgents('BACKEND')
    expect(results).toHaveLength(1)
  })
})

// ============================================================================
// updateAgentStatus
// ============================================================================

describe('updateAgentStatus', () => {
  it('updates agent status', async () => {
    const agent = await createAgent(makeCreateRequest({ name: 'status-agent' }))
    expect(agent.status).toBe('offline')

    const result = await updateAgentStatus(agent.id, 'active')
    expect(result).toBe(true)

    const updated = getAgent(agent.id)
    expect(updated!.status).toBe('active')
  })

  it('returns false for non-existent agent', async () => {
    const result = await updateAgentStatus('nonexistent', 'active')
    expect(result).toBe(false)
  })

  it('supports all valid status values', async () => {
    const agent = await createAgent(makeCreateRequest({ name: 'multi-status' }))

    await updateAgentStatus(agent.id, 'active')
    expect(getAgent(agent.id)!.status).toBe('active')

    await updateAgentStatus(agent.id, 'idle')
    expect(getAgent(agent.id)!.status).toBe('idle')

    await updateAgentStatus(agent.id, 'offline')
    expect(getAgent(agent.id)!.status).toBe('offline')
  })
})

// ============================================================================
// resolveAlias
// ============================================================================

describe('resolveAlias', () => {
  it('resolves agent name to ID on self host', async () => {
    const agent = await createAgent(makeCreateRequest({ name: 'resolve-me' }))
    const id = resolveAlias('resolve-me')
    expect(id).toBe(agent.id)
  })

  it('resolves name@host format', async () => {
    const agent = await createAgent(makeCreateRequest({ name: 'remote-agent' }))
    const id = resolveAlias('remote-agent@test-host')
    expect(id).toBe(agent.id)
  })

  it('resolves UUID directly', async () => {
    const agent = await createAgent(makeCreateRequest({ name: 'uuid-agent' }))
    const id = resolveAlias(agent.id)
    expect(id).toBe(agent.id)
  })

  it('returns null for unknown name', () => {
    const id = resolveAlias('nobody')
    expect(id).toBeNull()
  })

  it('returns null for name@wrong-host', async () => {
    await createAgent(makeCreateRequest({ name: 'host-bound' }))
    const id = resolveAlias('host-bound@wrong-host')
    expect(id).toBeNull()
  })
})

// ============================================================================
// normalizeHostId
// ============================================================================

describe('normalizeHostId', () => {
  it('returns self host ID for undefined', () => {
    expect(normalizeHostId(undefined)).toBe('test-host')
  })

  it('returns self host ID for empty string', () => {
    expect(normalizeHostId('')).toBe('test-host')
  })

  it('returns self host ID for "local"', () => {
    expect(normalizeHostId('local')).toBe('test-host')
  })

  it('strips .local suffix', () => {
    expect(normalizeHostId('my-machine.local')).toBe('my-machine')
  })

  it('lowercases host ID', () => {
    expect(normalizeHostId('My-Machine')).toBe('my-machine')
  })

  it('handles combined normalization (uppercase + .local)', () => {
    expect(normalizeHostId('Juans-MacBook-Pro.local')).toBe('juans-macbook-pro')
  })

  it('passes through already-normalized host ID', () => {
    expect(normalizeHostId('already-normal')).toBe('already-normal')
  })
})

// ============================================================================
// needsHostIdNormalization
// ============================================================================

describe('needsHostIdNormalization', () => {
  it('returns true for undefined', () => {
    expect(needsHostIdNormalization(undefined)).toBe(true)
  })

  it('returns true for "local"', () => {
    expect(needsHostIdNormalization('local')).toBe(true)
  })

  it('returns true for uppercase', () => {
    expect(needsHostIdNormalization('MyHost')).toBe(true)
  })

  it('returns true for .local suffix', () => {
    expect(needsHostIdNormalization('myhost.local')).toBe(true)
  })

  it('returns false for already-normalized ID', () => {
    expect(needsHostIdNormalization('myhost')).toBe(false)
  })
})

// ============================================================================
// listAgents
// ============================================================================

describe('listAgents', () => {
  it('returns summary objects for all agents', async () => {
    await createAgent(makeCreateRequest({ name: 'alpha' }))
    await createAgent(makeCreateRequest({ name: 'beta' }))

    const summaries = listAgents()
    expect(summaries).toHaveLength(2)
    expect(summaries[0].name).toBe('alpha')
    expect(summaries[1].name).toBe('beta')
    expect(summaries[0]).toHaveProperty('id')
    expect(summaries[0]).toHaveProperty('status')
    expect(summaries[0]).toHaveProperty('hostId')
  })

  it('returns empty array when no agents exist', () => {
    expect(listAgents()).toHaveLength(0)
  })
})

// ============================================================================
// renameAgent
// ============================================================================

describe('renameAgent', () => {
  it('renames an agent successfully', async () => {
    const agent = await createAgent(makeCreateRequest({ name: 'old-name' }))
    const result = await renameAgent(agent.id, 'new-name')
    expect(result).toBe(true)

    const updated = getAgent(agent.id)
    expect(updated!.name).toBe('new-name')
  })

  it('normalizes new name to lowercase', async () => {
    const agent = await createAgent(makeCreateRequest({ name: 'rename-case' }))
    await renameAgent(agent.id, 'UPPER-NAME')
    expect(getAgent(agent.id)!.name).toBe('upper-name')
  })

  it('rejects duplicate name on same host', async () => {
    await createAgent(makeCreateRequest({ name: 'existing-name' }))
    const agent = await createAgent(makeCreateRequest({ name: 'other-name' }))
    const result = await renameAgent(agent.id, 'existing-name')
    expect(result).toBe(false)
  })

  it('returns false for non-existent agent', async () => {
    const result = await renameAgent('nonexistent', 'new-name')
    expect(result).toBe(false)
  })
})

// ============================================================================
// addSessionToAgent
// ============================================================================

describe('addSessionToAgent', () => {
  it('adds a new session with next available index', async () => {
    const agent = await createAgent(makeCreateRequest({ name: 'multi-session', createSession: true }))
    const newIndex = await addSessionToAgent(agent.id, '/tmp/new')

    expect(newIndex).toBe(1)
    const updated = getAgent(agent.id)
    expect(updated!.sessions).toHaveLength(2)
    expect(updated!.sessions[1].index).toBe(1)
  })

  it('returns null for non-existent agent', async () => {
    const result = await addSessionToAgent('nonexistent')
    expect(result).toBeNull()
  })

  it('fills gaps in session indices', async () => {
    const agent = await createAgent(makeCreateRequest({ name: 'gap-session' }))
    // Manually create sessions at indices 0 and 2
    const agents = loadAgents()
    const idx = agents.findIndex(a => a.id === agent.id)
    agents[idx].sessions = [
      { index: 0, status: 'offline' },
      { index: 2, status: 'offline' },
    ]
    saveAgents(agents)

    const newIndex = await addSessionToAgent(agent.id)
    expect(newIndex).toBe(1) // Should fill the gap
  })
})

// ============================================================================
// incrementAgentMetric
// ============================================================================

describe('incrementAgentMetric', () => {
  it('increments a metric by 1 by default', async () => {
    const agent = await createAgent(makeCreateRequest({ name: 'metric-agent' }))
    const result = await incrementAgentMetric(agent.id, 'totalApiCalls')
    expect(result).toBe(true)

    const updated = getAgent(agent.id)
    expect(updated!.metrics!.totalApiCalls).toBe(1)
  })

  it('increments a metric by a custom amount', async () => {
    const agent = await createAgent(makeCreateRequest({ name: 'metric-custom' }))
    await incrementAgentMetric(agent.id, 'totalTokensUsed', 500)

    const updated = getAgent(agent.id)
    expect(updated!.metrics!.totalTokensUsed).toBe(500)
  })

  it('returns false for non-existent agent', async () => {
    const result = await incrementAgentMetric('nonexistent', 'totalApiCalls')
    expect(result).toBe(false)
  })
})
