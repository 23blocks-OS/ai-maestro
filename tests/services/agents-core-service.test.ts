/**
 * Agents Core Service Tests
 *
 * Tests the pure business logic in services/agents-core-service.ts.
 * This is the largest/most complex service — agent CRUD, wake/hibernate,
 * session linking, unified multi-host queries.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeAgent, makeAgentSession, resetFixtureCounter } from '../test-utils/fixtures'

// ============================================================================
// Mocks — vi.hoisted() ensures availability before vi.mock() runs
// ============================================================================

const {
  mockRuntime,
  mockAgentRegistry,
  mockHostsConfig,
  mockSessionPersistence,
  mockAmpInboxWriter,
  mockSharedState,
  mockAgentStartup,
  mockMessageQueue,
  mockFs,
  mockUuid,
} = vi.hoisted(() => {
  const mockRuntime = {
    listSessions: vi.fn().mockResolvedValue([]),
    sessionExists: vi.fn().mockResolvedValue(false),
    createSession: vi.fn().mockResolvedValue(undefined),
    killSession: vi.fn().mockResolvedValue(undefined),
    renameSession: vi.fn().mockResolvedValue(undefined),
    sendKeys: vi.fn().mockResolvedValue(undefined),
    cancelCopyMode: vi.fn().mockResolvedValue(undefined),
    setEnvironment: vi.fn().mockResolvedValue(undefined),
    unsetEnvironment: vi.fn().mockResolvedValue(undefined),
  }

  let uuidCounter = 0

  return {
    mockRuntime,
    mockAgentRegistry: {
      loadAgents: vi.fn().mockReturnValue([]),
      saveAgents: vi.fn(),
      createAgent: vi.fn(),
      getAgent: vi.fn(),
      getAgentByName: vi.fn(),
      getAgentBySession: vi.fn(),
      updateAgent: vi.fn(),
      deleteAgent: vi.fn(),
      searchAgents: vi.fn().mockReturnValue([]),
      linkSession: vi.fn(),
      unlinkSession: vi.fn(),
    },
    mockHostsConfig: {
      getHosts: vi.fn().mockReturnValue([{ id: 'test-host', name: 'Test Host', url: 'http://localhost:23000' }]),
      getSelfHost: vi.fn().mockReturnValue({ id: 'test-host', name: 'Test Host', url: 'http://localhost:23000' }),
      getSelfHostId: vi.fn().mockReturnValue('test-host'),
      isSelf: vi.fn().mockReturnValue(true),
    },
    mockSessionPersistence: {
      persistSession: vi.fn(),
      unpersistSession: vi.fn(),
    },
    mockAmpInboxWriter: {
      initAgentAMPHome: vi.fn().mockResolvedValue(undefined),
      getAgentAMPDir: vi.fn().mockReturnValue('/tmp/amp/test'),
    },
    mockSharedState: {
      sessionActivity: new Map<string, number>(),
    },
    mockAgentStartup: {
      initializeAllAgents: vi.fn().mockResolvedValue({ initialized: [], failed: [] }),
      getStartupStatus: vi.fn().mockReturnValue({ initialized: true }),
    },
    mockMessageQueue: {
      resolveAgentIdentifier: vi.fn(),
    },
    mockFs: {
      default: {
        readFileSync: vi.fn().mockReturnValue('{}'),
        existsSync: vi.fn().mockReturnValue(false),
        readdirSync: vi.fn().mockReturnValue([]),
        mkdirSync: vi.fn(),
        writeFileSync: vi.fn(),
        unlinkSync: vi.fn(),
      },
    },
    mockUuid: {
      v4: vi.fn(() => `uuid-${++uuidCounter}`),
    },
  }
})

vi.mock('@/lib/agent-runtime', () => ({
  getRuntime: vi.fn().mockReturnValue(mockRuntime),
}))
vi.mock('@/lib/agent-registry', () => mockAgentRegistry)
vi.mock('@/lib/hosts-config', () => mockHostsConfig)
vi.mock('@/lib/session-persistence', () => mockSessionPersistence)
vi.mock('@/lib/amp-inbox-writer', () => mockAmpInboxWriter)
vi.mock('@/services/shared-state', () => mockSharedState)
vi.mock('@/lib/agent-startup', () => mockAgentStartup)
vi.mock('@/lib/messageQueue', () => mockMessageQueue)
vi.mock('fs', () => mockFs)
vi.mock('uuid', () => mockUuid)
vi.mock('child_process', () => ({
  exec: vi.fn((_cmd: string, cb: Function) => cb(null, { stdout: '', stderr: '' })),
  execSync: vi.fn().mockReturnValue(''),
}))

// ============================================================================
// Import module under test (after mocks)
// ============================================================================

import {
  listAgents,
  searchAgentsByQuery,
  createNewAgent,
  getAgentById,
  updateAgentById,
  deleteAgentById,
  registerAgent,
  lookupAgentByName,
  wakeAgent,
  hibernateAgent,
  sendAgentSessionCommand,
  linkAgentSession,
  unlinkOrDeleteAgentSession,
  getAgentSessionStatus,
  initializeStartup,
  getStartupInfo,
  proxyHealthCheck,
} from '@/services/agents-core-service'

// ============================================================================
// Setup
// ============================================================================

beforeEach(() => {
  vi.clearAllMocks()
  resetFixtureCounter()
  mockSharedState.sessionActivity.clear()
  mockRuntime.listSessions.mockResolvedValue([])
  mockRuntime.sessionExists.mockResolvedValue(false)
  mockRuntime.createSession.mockResolvedValue(undefined)
  mockAgentRegistry.loadAgents.mockReturnValue([])
  mockHostsConfig.getSelfHost.mockReturnValue({ id: 'test-host', name: 'Test Host', url: 'http://localhost:23000' })
  mockHostsConfig.getHosts.mockReturnValue([{ id: 'test-host', name: 'Test Host', url: 'http://localhost:23000' }])
  mockHostsConfig.isSelf.mockReturnValue(true)
})

// ============================================================================
// listAgents
// ============================================================================

describe('listAgents', () => {
  it('returns empty list when no agents and no sessions', async () => {
    const result = await listAgents()

    expect(result.status).toBe(200)
    expect(result.data?.agents).toEqual([])
    expect(result.data?.stats.total).toBe(0)
  })

  it('returns agents from registry with session status', async () => {
    const agent = makeAgent({ name: 'my-agent' })
    mockAgentRegistry.loadAgents.mockReturnValue([agent])
    mockRuntime.listSessions.mockResolvedValue([
      { name: 'my-agent', workingDirectory: '/home', createdAt: '2025-01-01T00:00:00Z', windows: 1 },
    ])

    const result = await listAgents()

    expect(result.status).toBe(200)
    expect(result.data?.agents).toHaveLength(1)
    expect(result.data?.agents[0].name).toBe('my-agent')
  })

  it('creates orphan agents for sessions without registry entries', async () => {
    mockAgentRegistry.loadAgents.mockReturnValue([])
    mockRuntime.listSessions.mockResolvedValue([
      { name: 'orphan-session', workingDirectory: '/home', createdAt: '2025-01-01T00:00:00Z', windows: 1 },
    ])

    const result = await listAgents()

    expect(result.data?.agents).toHaveLength(1)
    expect(result.data?.agents[0].isOrphan).toBe(true)
    expect(result.data?.stats.orphans).toBe(1)
    // Orphan should be saved to registry
    expect(mockAgentRegistry.saveAgents).toHaveBeenCalled()
  })

  it('marks agents offline when no matching tmux session', async () => {
    const agent = makeAgent({ name: 'offline-agent', sessions: [makeAgentSession()] })
    mockAgentRegistry.loadAgents.mockReturnValue([agent])
    mockRuntime.listSessions.mockResolvedValue([])

    const result = await listAgents()

    expect(result.data?.agents[0].status).toBe('offline')
    expect(result.data?.agents[0].session?.status).toBe('offline')
  })

  it('marks agents active when matching tmux session exists', async () => {
    const agent = makeAgent({ name: 'active-agent' })
    mockAgentRegistry.loadAgents.mockReturnValue([agent])
    mockRuntime.listSessions.mockResolvedValue([
      { name: 'active-agent', workingDirectory: '/home', createdAt: '2025-01-01T00:00:00Z', windows: 1 },
    ])

    const result = await listAgents()

    expect(result.data?.agents[0].status).toBe('active')
    expect(result.data?.agents[0].session?.status).toBe('online')
  })

  it('sorts online agents before offline', async () => {
    const offlineAgent = makeAgent({ name: 'aaa-offline' })
    const onlineAgent = makeAgent({ name: 'zzz-online' })
    mockAgentRegistry.loadAgents.mockReturnValue([offlineAgent, onlineAgent])
    mockRuntime.listSessions.mockResolvedValue([
      { name: 'zzz-online', workingDirectory: '/home', createdAt: '2025-01-01T00:00:00Z', windows: 1 },
    ])

    const result = await listAgents()

    expect(result.data?.agents[0].name).toBe('zzz-online')
    expect(result.data?.agents[1].name).toBe('aaa-offline')
  })

  it('includes host info in response', async () => {
    const result = await listAgents()

    expect(result.data?.hostInfo).toEqual({
      id: 'test-host',
      name: 'Test Host',
      url: 'http://localhost:23000',
      isSelf: true,
    })
  })

  it('returns 500 on unexpected error', async () => {
    mockAgentRegistry.loadAgents.mockImplementation(() => { throw new Error('disk error') })

    const result = await listAgents()

    expect(result.status).toBe(500)
  })
})

// ============================================================================
// searchAgentsByQuery
// ============================================================================

describe('searchAgentsByQuery', () => {
  it('returns matching agents', () => {
    const agents = [makeAgent({ name: 'backend-api' })]
    mockAgentRegistry.searchAgents.mockReturnValue(agents)

    const result = searchAgentsByQuery('backend')

    expect(result.status).toBe(200)
    expect(result.data?.agents).toHaveLength(1)
    expect(mockAgentRegistry.searchAgents).toHaveBeenCalledWith('backend')
  })

  it('returns empty list when no matches', () => {
    mockAgentRegistry.searchAgents.mockReturnValue([])

    const result = searchAgentsByQuery('nonexistent')

    expect(result.status).toBe(200)
    expect(result.data?.agents).toEqual([])
  })
})

// ============================================================================
// createNewAgent
// ============================================================================

describe('createNewAgent', () => {
  it('creates agent successfully', () => {
    const agent = makeAgent({ name: 'new-agent' })
    mockAgentRegistry.createAgent.mockReturnValue(agent)

    const result = createNewAgent({
      name: 'new-agent',
      program: 'claude-code',
      taskDescription: 'Test agent',
    })

    expect(result.status).toBe(201)
    expect(result.data?.agent.name).toBe('new-agent')
  })

  it('returns 400 when createAgent throws (e.g., duplicate name)', () => {
    mockAgentRegistry.createAgent.mockImplementation(() => { throw new Error('Agent name already exists') })

    const result = createNewAgent({
      name: 'duplicate',
      program: 'claude-code',
      taskDescription: 'Test',
    })

    expect(result.status).toBe(400)
    expect(result.error).toMatch(/already exists/i)
  })
})

// ============================================================================
// getAgentById
// ============================================================================

describe('getAgentById', () => {
  it('returns agent when found', () => {
    const agent = makeAgent({ id: 'agent-1', name: 'found' })
    mockAgentRegistry.getAgent.mockReturnValue(agent)

    const result = getAgentById('agent-1')

    expect(result.status).toBe(200)
    expect(result.data?.agent.name).toBe('found')
  })

  it('returns 404 when agent not found', () => {
    mockAgentRegistry.getAgent.mockReturnValue(null)

    const result = getAgentById('nonexistent')

    expect(result.status).toBe(404)
  })

  it('returns 500 on unexpected error', () => {
    mockAgentRegistry.getAgent.mockImplementation(() => { throw new Error('read error') })

    const result = getAgentById('agent-1')

    expect(result.status).toBe(500)
  })
})

// ============================================================================
// updateAgentById
// ============================================================================

describe('updateAgentById', () => {
  it('updates agent successfully', () => {
    const agent = makeAgent({ id: 'agent-1' })
    const updated = { ...agent, taskDescription: 'Updated task' }
    mockAgentRegistry.getAgent.mockReturnValue(agent)
    mockAgentRegistry.updateAgent.mockReturnValue(updated)

    const result = updateAgentById('agent-1', { taskDescription: 'Updated task' })

    expect(result.status).toBe(200)
    expect(result.data?.agent.taskDescription).toBe('Updated task')
  })

  it('returns 404 when agent not found', () => {
    mockAgentRegistry.getAgent.mockReturnValue(null)

    const result = updateAgentById('nonexistent', { taskDescription: 'X' })

    expect(result.status).toBe(404)
  })

  it('returns 410 when agent is soft-deleted', () => {
    const deleted = makeAgent({ id: 'agent-1', deletedAt: '2025-01-01T00:00:00Z' })
    mockAgentRegistry.getAgent.mockReturnValue(deleted)

    const result = updateAgentById('agent-1', { taskDescription: 'X' })

    expect(result.status).toBe(410)
    expect(result.error).toMatch(/deleted/i)
  })

  it('returns 400 when updateAgent throws (e.g., duplicate name)', () => {
    const agent = makeAgent({ id: 'agent-1' })
    mockAgentRegistry.getAgent.mockReturnValue(agent)
    mockAgentRegistry.updateAgent.mockImplementation(() => { throw new Error('Name taken') })

    const result = updateAgentById('agent-1', { name: 'taken' })

    expect(result.status).toBe(400)
    expect(result.error).toBe('Name taken')
  })
})

// ============================================================================
// deleteAgentById
// ============================================================================

describe('deleteAgentById', () => {
  it('soft deletes agent', () => {
    const agent = makeAgent({ id: 'agent-1' })
    mockAgentRegistry.getAgent.mockReturnValue(agent)
    mockAgentRegistry.deleteAgent.mockReturnValue(true)

    const result = deleteAgentById('agent-1', false)

    expect(result.status).toBe(200)
    expect(result.data?.success).toBe(true)
    expect(result.data?.hard).toBe(false)
  })

  it('hard deletes agent', () => {
    const agent = makeAgent({ id: 'agent-1' })
    mockAgentRegistry.getAgent.mockReturnValue(agent)
    mockAgentRegistry.deleteAgent.mockReturnValue(true)

    const result = deleteAgentById('agent-1', true)

    expect(result.status).toBe(200)
    expect(result.data?.hard).toBe(true)
  })

  it('returns 404 when agent not found', () => {
    mockAgentRegistry.getAgent.mockReturnValue(null)

    const result = deleteAgentById('nonexistent', false)

    expect(result.status).toBe(404)
  })

  it('returns 410 when already soft-deleted and not hard deleting', () => {
    const deleted = makeAgent({ id: 'agent-1', deletedAt: '2025-01-01T00:00:00Z' })
    mockAgentRegistry.getAgent.mockReturnValue(deleted)

    const result = deleteAgentById('agent-1', false)

    expect(result.status).toBe(410)
    expect(result.error).toMatch(/already deleted/i)
  })

  it('allows hard delete of already soft-deleted agent', () => {
    const deleted = makeAgent({ id: 'agent-1', deletedAt: '2025-01-01T00:00:00Z' })
    mockAgentRegistry.getAgent.mockReturnValue(deleted)
    mockAgentRegistry.deleteAgent.mockReturnValue(true)

    const result = deleteAgentById('agent-1', true)

    expect(result.status).toBe(200)
  })
})

// ============================================================================
// registerAgent
// ============================================================================

describe('registerAgent', () => {
  it('registers agent from session name', () => {
    mockAgentRegistry.getAgentBySession.mockReturnValue(null)
    mockAgentRegistry.createAgent.mockReturnValue(makeAgent({ id: 'new-id', name: 'my-agent' }))
    mockFs.default.existsSync.mockReturnValue(false)

    const result = registerAgent({ sessionName: 'my-agent', workingDirectory: '/home' })

    expect(result.status).toBe(200)
    expect(result.data?.success).toBe(true)
    expect(result.data?.agentId).toBe('my-agent')
  })

  it('links existing agent when found by session', () => {
    const existing = makeAgent({ id: 'existing-id', name: 'my-agent' })
    mockAgentRegistry.getAgentBySession.mockReturnValue(existing)
    mockFs.default.existsSync.mockReturnValue(false)

    const result = registerAgent({ sessionName: 'my-agent' })

    expect(result.status).toBe(200)
    expect(mockAgentRegistry.linkSession).toHaveBeenCalledWith('existing-id', 'my-agent', expect.any(String))
    expect(result.data?.registryAgent?.id).toBe('existing-id')
  })

  it('registers cloud agent with websocket URL', () => {
    mockFs.default.existsSync.mockReturnValue(false)

    const result = registerAgent({
      id: 'cloud-agent',
      deployment: { cloud: { websocketUrl: 'wss://agent.cloud.com/term' } },
    })

    expect(result.status).toBe(200)
    expect(result.data?.agentId).toBe('cloud-agent')
  })

  it('returns 400 when session name is missing (worktree format)', () => {
    const result = registerAgent({ sessionName: '' })

    // The code checks `!body.sessionName` which is falsy for empty string
    // It falls through to the cloud path and fails there
    expect(result.status).toBe(400)
  })

  it('returns 400 when cloud agent missing required fields', () => {
    const result = registerAgent({ id: 'cloud', deployment: {} as any })

    expect(result.status).toBe(400)
    expect(result.error).toMatch(/missing/i)
  })

  it('saves agent config to file', () => {
    mockAgentRegistry.getAgentBySession.mockReturnValue(null)
    mockAgentRegistry.createAgent.mockReturnValue(makeAgent())
    mockFs.default.existsSync.mockReturnValue(false)

    registerAgent({ sessionName: 'agent' })

    expect(mockFs.default.writeFileSync).toHaveBeenCalled()
  })
})

// ============================================================================
// lookupAgentByName
// ============================================================================

describe('lookupAgentByName', () => {
  it('returns agent when resolved and found', () => {
    mockMessageQueue.resolveAgentIdentifier.mockReturnValue({ agentId: 'agent-1' })
    mockAgentRegistry.getAgent.mockReturnValue(makeAgent({ id: 'agent-1', name: 'my-agent' }))

    const result = lookupAgentByName('my-agent')

    expect(result.status).toBe(200)
    expect(result.data?.exists).toBe(true)
    expect(result.data?.agent?.name).toBe('my-agent')
  })

  it('returns exists=false when agent not resolved', () => {
    mockMessageQueue.resolveAgentIdentifier.mockReturnValue(null)

    const result = lookupAgentByName('unknown')

    expect(result.status).toBe(200)
    expect(result.data?.exists).toBe(false)
  })

  it('returns exists=false when resolved but not in registry', () => {
    mockMessageQueue.resolveAgentIdentifier.mockReturnValue({ agentId: 'gone' })
    mockAgentRegistry.getAgent.mockReturnValue(null)

    const result = lookupAgentByName('gone-agent')

    expect(result.status).toBe(200)
    expect(result.data?.exists).toBe(false)
  })
})

// ============================================================================
// wakeAgent
// ============================================================================

describe('wakeAgent', () => {
  it('wakes a hibernated agent', async () => {
    const agent = makeAgent({ id: 'agent-1', name: 'my-agent', workingDirectory: '/home' })
    mockAgentRegistry.getAgent.mockReturnValue(agent)
    mockRuntime.sessionExists.mockResolvedValue(false)
    // loadAgents for updateAgentSessionInRegistry
    mockAgentRegistry.loadAgents.mockReturnValue([agent])

    const result = await wakeAgent('agent-1', { startProgram: false })

    expect(result.status).toBe(200)
    expect(result.data?.woken).toBe(true)
    expect(result.data?.sessionName).toBe('my-agent')
    expect(mockRuntime.createSession).toHaveBeenCalledWith('my-agent', '/home')
  })

  it('returns already running when session exists', async () => {
    const agent = makeAgent({ id: 'agent-1', name: 'my-agent' })
    mockAgentRegistry.getAgent.mockReturnValue(agent)
    mockRuntime.sessionExists.mockResolvedValue(true)
    mockAgentRegistry.loadAgents.mockReturnValue([agent])

    const result = await wakeAgent('agent-1', {})

    expect(result.status).toBe(200)
    expect(result.data?.alreadyRunning).toBe(true)
    expect(mockRuntime.createSession).not.toHaveBeenCalled()
  })

  it('returns 404 when agent not found', async () => {
    mockAgentRegistry.getAgent.mockReturnValue(null)

    const result = await wakeAgent('nonexistent', {})

    expect(result.status).toBe(404)
  })

  it('returns 400 when agent has no name', async () => {
    const agent = makeAgent({ id: 'agent-1', name: '' })
    mockAgentRegistry.getAgent.mockReturnValue(agent)

    const result = await wakeAgent('agent-1', {})

    expect(result.status).toBe(400)
  })

  it('persists session metadata on wake', async () => {
    const agent = makeAgent({ id: 'agent-1', name: 'my-agent' })
    mockAgentRegistry.getAgent.mockReturnValue(agent)
    mockRuntime.sessionExists.mockResolvedValue(false)
    mockAgentRegistry.loadAgents.mockReturnValue([agent])

    await wakeAgent('agent-1', { startProgram: false })

    expect(mockSessionPersistence.persistSession).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'my-agent', agentId: 'agent-1' })
    )
  })

  it('sets up AMP for the session', async () => {
    const agent = makeAgent({ id: 'agent-1', name: 'my-agent' })
    mockAgentRegistry.getAgent.mockReturnValue(agent)
    mockRuntime.sessionExists.mockResolvedValue(false)
    mockAgentRegistry.loadAgents.mockReturnValue([agent])

    await wakeAgent('agent-1', { startProgram: false })

    expect(mockAmpInboxWriter.initAgentAMPHome).toHaveBeenCalledWith('my-agent', 'agent-1')
  })

  it('uses session index for multi-brain sessions', async () => {
    const agent = makeAgent({ id: 'agent-1', name: 'my-agent' })
    mockAgentRegistry.getAgent.mockReturnValue(agent)
    mockRuntime.sessionExists.mockResolvedValue(false)
    mockAgentRegistry.loadAgents.mockReturnValue([agent])

    const result = await wakeAgent('agent-1', { sessionIndex: 2, startProgram: false })

    expect(result.data?.sessionName).toBe('my-agent_2')
    expect(result.data?.sessionIndex).toBe(2)
  })

  it('returns 500 when tmux session creation fails', async () => {
    const agent = makeAgent({ id: 'agent-1', name: 'my-agent' })
    mockAgentRegistry.getAgent.mockReturnValue(agent)
    mockRuntime.sessionExists.mockResolvedValue(false)
    mockRuntime.createSession.mockRejectedValue(new Error('tmux error'))

    const result = await wakeAgent('agent-1', { startProgram: false })

    expect(result.status).toBe(500)
  })
})

// ============================================================================
// hibernateAgent
// ============================================================================

describe('hibernateAgent', () => {
  it('hibernates an active agent', async () => {
    const agent = makeAgent({ id: 'agent-1', name: 'my-agent' })
    mockAgentRegistry.getAgent.mockReturnValue(agent)
    mockRuntime.sessionExists.mockResolvedValue(true)
    mockAgentRegistry.loadAgents.mockReturnValue([agent])

    const result = await hibernateAgent('agent-1', {})

    expect(result.status).toBe(200)
    expect(result.data?.hibernated).toBe(true)
    expect(mockRuntime.killSession).toHaveBeenCalledWith('my-agent')
  })

  it('handles agent with no active session gracefully', async () => {
    const agent = makeAgent({ id: 'agent-1', name: 'my-agent' })
    mockAgentRegistry.getAgent.mockReturnValue(agent)
    mockRuntime.sessionExists.mockResolvedValue(false)
    mockAgentRegistry.loadAgents.mockReturnValue([agent])

    const result = await hibernateAgent('agent-1', {})

    expect(result.status).toBe(200)
    expect(result.data?.hibernated).toBe(true)
    expect(result.data?.message).toMatch(/already terminated/i)
  })

  it('returns 404 when agent not found', async () => {
    mockAgentRegistry.getAgent.mockReturnValue(null)

    const result = await hibernateAgent('nonexistent', {})

    expect(result.status).toBe(404)
  })

  it('returns 400 when agent has no name', async () => {
    const agent = makeAgent({ id: 'agent-1', name: '' })
    mockAgentRegistry.getAgent.mockReturnValue(agent)

    const result = await hibernateAgent('agent-1', {})

    expect(result.status).toBe(400)
  })

  it('unpersists session after hibernate', async () => {
    const agent = makeAgent({ id: 'agent-1', name: 'my-agent' })
    mockAgentRegistry.getAgent.mockReturnValue(agent)
    mockRuntime.sessionExists.mockResolvedValue(true)
    mockAgentRegistry.loadAgents.mockReturnValue([agent])

    await hibernateAgent('agent-1', {})

    expect(mockSessionPersistence.unpersistSession).toHaveBeenCalledWith('my-agent')
  })

  it('attempts graceful shutdown before kill', async () => {
    const agent = makeAgent({ id: 'agent-1', name: 'my-agent' })
    mockAgentRegistry.getAgent.mockReturnValue(agent)
    mockRuntime.sessionExists.mockResolvedValue(true)
    mockAgentRegistry.loadAgents.mockReturnValue([agent])

    await hibernateAgent('agent-1', {})

    // Should send Ctrl-C then "exit" before kill
    expect(mockRuntime.sendKeys).toHaveBeenCalledWith('my-agent', 'C-c')
    expect(mockRuntime.sendKeys).toHaveBeenCalledWith('my-agent', '"exit"', { enter: true })
  })
})

// ============================================================================
// sendAgentSessionCommand
// ============================================================================

describe('sendAgentSessionCommand', () => {
  it('sends command to idle session', async () => {
    const agent = makeAgent({ id: 'agent-1', name: 'my-agent' })
    mockAgentRegistry.getAgent.mockReturnValue(agent)
    mockRuntime.sessionExists.mockResolvedValue(true)

    const result = await sendAgentSessionCommand('agent-1', { command: 'ls -la' })

    expect(result.status).toBe(200)
    expect(result.data?.success).toBe(true)
    expect(result.data?.commandSent).toBe('ls -la')
    expect(result.data?.sessionName).toBe('my-agent')
  })

  it('returns 409 when session is busy', async () => {
    const agent = makeAgent({ id: 'agent-1', name: 'my-agent' })
    mockAgentRegistry.getAgent.mockReturnValue(agent)
    mockRuntime.sessionExists.mockResolvedValue(true)
    mockSharedState.sessionActivity.set('my-agent', Date.now())

    const result = await sendAgentSessionCommand('agent-1', { command: 'ls' })

    expect(result.status).toBe(409)
    expect(result.error).toMatch(/not idle/i)
  })

  it('allows command when requireIdle is false', async () => {
    const agent = makeAgent({ id: 'agent-1', name: 'my-agent' })
    mockAgentRegistry.getAgent.mockReturnValue(agent)
    mockRuntime.sessionExists.mockResolvedValue(true)
    mockSharedState.sessionActivity.set('my-agent', Date.now())

    const result = await sendAgentSessionCommand('agent-1', { command: 'ls', requireIdle: false })

    expect(result.status).toBe(200)
  })

  it('returns 404 when agent not found', async () => {
    mockAgentRegistry.getAgent.mockReturnValue(null)

    const result = await sendAgentSessionCommand('nonexistent', { command: 'ls' })

    expect(result.status).toBe(404)
  })

  it('returns 400 when command is missing', async () => {
    const agent = makeAgent({ id: 'agent-1', name: 'my-agent' })
    mockAgentRegistry.getAgent.mockReturnValue(agent)

    const result = await sendAgentSessionCommand('agent-1', { command: '' })

    expect(result.status).toBe(400)
  })

  it('returns 404 when tmux session not found', async () => {
    const agent = makeAgent({ id: 'agent-1', name: 'my-agent' })
    mockAgentRegistry.getAgent.mockReturnValue(agent)
    mockRuntime.sessionExists.mockResolvedValue(false)

    const result = await sendAgentSessionCommand('agent-1', { command: 'ls' })

    expect(result.status).toBe(404)
  })

  it('cancels copy mode before sending command', async () => {
    const agent = makeAgent({ id: 'agent-1', name: 'my-agent' })
    mockAgentRegistry.getAgent.mockReturnValue(agent)
    mockRuntime.sessionExists.mockResolvedValue(true)

    await sendAgentSessionCommand('agent-1', { command: 'ls' })

    expect(mockRuntime.cancelCopyMode).toHaveBeenCalledWith('my-agent')
  })

  it('updates activity timestamp', async () => {
    const agent = makeAgent({ id: 'agent-1', name: 'my-agent' })
    mockAgentRegistry.getAgent.mockReturnValue(agent)
    mockRuntime.sessionExists.mockResolvedValue(true)

    await sendAgentSessionCommand('agent-1', { command: 'ls' })

    expect(mockSharedState.sessionActivity.get('my-agent')).toBeDefined()
  })

  it('returns 400 when agent has no name', async () => {
    const agent = makeAgent({ id: 'agent-1', name: '' })
    mockAgentRegistry.getAgent.mockReturnValue(agent)

    const result = await sendAgentSessionCommand('agent-1', { command: 'ls' })

    expect(result.status).toBe(400)
    expect(result.error).toMatch(/no name/i)
  })
})

// ============================================================================
// linkAgentSession
// ============================================================================

describe('linkAgentSession', () => {
  it('links session to agent', () => {
    mockAgentRegistry.linkSession.mockReturnValue(true)

    const result = linkAgentSession('agent-1', { sessionName: 'my-session' })

    expect(result.status).toBe(200)
    expect(result.data?.success).toBe(true)
  })

  it('returns 400 when sessionName is missing', () => {
    const result = linkAgentSession('agent-1', { sessionName: '' })

    expect(result.status).toBe(400)
  })

  it('returns 404 when agent not found', () => {
    mockAgentRegistry.linkSession.mockReturnValue(false)

    const result = linkAgentSession('nonexistent', { sessionName: 'my-session' })

    expect(result.status).toBe(404)
  })
})

// ============================================================================
// unlinkOrDeleteAgentSession
// ============================================================================

describe('unlinkOrDeleteAgentSession', () => {
  it('unlinks session from agent', async () => {
    const agent = makeAgent({ id: 'agent-1', name: 'my-agent' })
    mockAgentRegistry.getAgent.mockReturnValue(agent)
    mockAgentRegistry.unlinkSession.mockReturnValue(true)

    const result = await unlinkOrDeleteAgentSession('agent-1', {})

    expect(result.status).toBe(200)
    expect(result.data?.sessionUnlinked).toBe(true)
  })

  it('kills session and unlinks when kill=true', async () => {
    const agent = makeAgent({ id: 'agent-1', name: 'my-agent' })
    mockAgentRegistry.getAgent.mockReturnValue(agent)
    mockAgentRegistry.unlinkSession.mockReturnValue(true)
    mockRuntime.sessionExists.mockResolvedValue(true)

    const result = await unlinkOrDeleteAgentSession('agent-1', { kill: true })

    expect(result.status).toBe(200)
    expect(result.data?.sessionKilled).toBe(true)
    expect(mockRuntime.killSession).toHaveBeenCalledWith('my-agent')
  })

  it('deletes agent when deleteAgent=true', async () => {
    const agent = makeAgent({ id: 'agent-1', name: 'my-agent' })
    mockAgentRegistry.getAgent.mockReturnValue(agent)
    mockAgentRegistry.deleteAgent.mockReturnValue(true)

    const result = await unlinkOrDeleteAgentSession('agent-1', { deleteAgent: true })

    expect(result.status).toBe(200)
    expect(result.data?.deleted).toBe(true)
    expect(mockAgentRegistry.deleteAgent).toHaveBeenCalledWith('agent-1', true)
  })

  it('returns 404 when agent not found', async () => {
    mockAgentRegistry.getAgent.mockReturnValue(null)

    const result = await unlinkOrDeleteAgentSession('nonexistent', {})

    expect(result.status).toBe(404)
  })

  it('returns 404 when unlink fails', async () => {
    const agent = makeAgent({ id: 'agent-1', name: 'my-agent' })
    mockAgentRegistry.getAgent.mockReturnValue(agent)
    mockAgentRegistry.unlinkSession.mockReturnValue(false)

    const result = await unlinkOrDeleteAgentSession('agent-1', {})

    expect(result.status).toBe(404)
  })
})

// ============================================================================
// getAgentSessionStatus
// ============================================================================

describe('getAgentSessionStatus', () => {
  it('returns session status for agent with tmux session', async () => {
    const agent = makeAgent({ id: 'agent-1', name: 'my-agent' })
    mockAgentRegistry.getAgent.mockReturnValue(agent)
    mockRuntime.sessionExists.mockResolvedValue(true)

    const result = await getAgentSessionStatus('agent-1')

    expect(result.status).toBe(200)
    expect(result.data?.hasSession).toBe(true)
    expect(result.data?.exists).toBe(true)
  })

  it('returns hasSession=false when agent has no name', async () => {
    const agent = makeAgent({ id: 'agent-1', name: '' })
    mockAgentRegistry.getAgent.mockReturnValue(agent)

    const result = await getAgentSessionStatus('agent-1')

    expect(result.status).toBe(200)
    expect(result.data?.hasSession).toBe(false)
  })

  it('returns 404 when agent not found', async () => {
    mockAgentRegistry.getAgent.mockReturnValue(null)

    const result = await getAgentSessionStatus('nonexistent')

    expect(result.status).toBe(404)
  })

  it('returns idle status based on activity', async () => {
    const agent = makeAgent({ id: 'agent-1', name: 'my-agent' })
    mockAgentRegistry.getAgent.mockReturnValue(agent)
    mockRuntime.sessionExists.mockResolvedValue(true)
    // No activity = idle

    const result = await getAgentSessionStatus('agent-1')

    expect(result.data?.idle).toBe(true)
  })
})

// ============================================================================
// initializeStartup
// ============================================================================

describe('initializeStartup', () => {
  it('initializes all agents', async () => {
    mockAgentStartup.initializeAllAgents.mockResolvedValue({
      initialized: ['agent-1', 'agent-2'],
      failed: [],
    })

    const result = await initializeStartup()

    expect(result.status).toBe(200)
    expect(result.data?.initialized).toHaveLength(2)
    expect(result.data?.failed).toHaveLength(0)
  })

  it('reports partial failures', async () => {
    mockAgentStartup.initializeAllAgents.mockResolvedValue({
      initialized: ['agent-1'],
      failed: [{ agentId: 'agent-2', error: 'no session' }],
    })

    const result = await initializeStartup()

    expect(result.status).toBe(200)
    expect(result.data?.failed).toHaveLength(1)
  })

  it('returns 500 on unexpected error', async () => {
    mockAgentStartup.initializeAllAgents.mockRejectedValue(new Error('init failed'))

    const result = await initializeStartup()

    expect(result.status).toBe(500)
  })
})

// ============================================================================
// getStartupInfo
// ============================================================================

describe('getStartupInfo', () => {
  it('returns startup status', () => {
    mockAgentStartup.getStartupStatus.mockReturnValue({ initialized: true, agents: 5 })

    const result = getStartupInfo()

    expect(result.status).toBe(200)
    expect(result.data?.initialized).toBe(true)
  })

  it('returns 500 on error', () => {
    mockAgentStartup.getStartupStatus.mockImplementation(() => { throw new Error('fail') })

    const result = getStartupInfo()

    expect(result.status).toBe(500)
  })
})

// ============================================================================
// proxyHealthCheck
// ============================================================================

describe('proxyHealthCheck', () => {
  it('returns 400 when URL is missing', async () => {
    const result = await proxyHealthCheck('')

    expect(result.status).toBe(400)
  })

  it('returns 400 when URL is not a string', async () => {
    const result = await proxyHealthCheck(null as any)

    expect(result.status).toBe(400)
  })
})
