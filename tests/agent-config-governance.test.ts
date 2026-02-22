/**
 * Unit tests for Layer 5: Agent Configuration Governance
 *
 * Tests the governance enforcement added to three functions in
 * services/agents-core-service.ts:
 *   - createNewAgent(body, requestingAgentId?)
 *   - updateAgentById(id, body, requestingAgentId?)
 *   - deleteAgentById(id, hard, requestingAgentId?)
 *
 * Coverage: 16 tests across 3 functions
 *   - createNewAgent: 4 tests (no auth, manager, COS, regular member)
 *   - updateAgentById: 7 tests (no auth, manager, COS, self-update, owning COS, non-owning regular, 404)
 *   - deleteAgentById: 5 tests (no auth, manager, COS rejected, regular rejected, 404)
 *
 * Mocking strategy:
 *   - @/lib/governance: isManager, isChiefOfStaffAnywhere (governance role checks)
 *   - @/lib/team-registry: loadTeams (team membership for owning-COS check)
 *   - @/lib/agent-registry: createAgent, getAgent, updateAgent, deleteAgent, searchAgents,
 *     plus other exports that the module imports at load time
 *   - External I/O modules: fs, uuid, hosts-config, session-persistence, amp-inbox-writer,
 *     agent-startup, shared-state, agent-runtime, messageQueue (all stubbed to prevent real I/O)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Agent, CreateAgentRequest, UpdateAgentRequest } from '@/types/agent'
import type { Team } from '@/types/team'

// ============================================================================
// Mocks — all external dependencies stubbed before module import
// ============================================================================

// --- fs: prevent any real filesystem access ---
vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(() => false),
    mkdirSync: vi.fn(),
    readFileSync: vi.fn(() => '{}'),
    writeFileSync: vi.fn(),
    renameSync: vi.fn(),
    copyFileSync: vi.fn(),
  },
  existsSync: vi.fn(() => false),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(() => '{}'),
  writeFileSync: vi.fn(),
  renameSync: vi.fn(),
  copyFileSync: vi.fn(),
}))

// --- uuid: deterministic IDs ---
let uuidCounter = 0
vi.mock('uuid', () => ({
  v4: vi.fn(() => `test-uuid-${++uuidCounter}`),
}))

// --- Governance: isManager and isChiefOfStaffAnywhere are the core of Layer 5 ---
const mockIsManager = vi.fn<(agentId: string) => boolean>(() => false)
const mockIsChiefOfStaffAnywhere = vi.fn<(agentId: string) => boolean>(() => false)
vi.mock('@/lib/governance', () => ({
  isManager: (...args: [string]) => mockIsManager(...args),
  isChiefOfStaffAnywhere: (...args: [string]) => mockIsChiefOfStaffAnywhere(...args),
}))

// --- Team registry: loadTeams returns array of Team objects ---
const mockLoadTeams = vi.fn<() => Team[]>(() => [])
vi.mock('@/lib/team-registry', () => ({
  loadTeams: () => mockLoadTeams(),
}))

// --- Agent registry: CRUD operations ---
const mockCreateAgent = vi.fn<(body: CreateAgentRequest) => Agent>()
const mockGetAgent = vi.fn<(id: string, includeDeleted?: boolean) => Agent | null>(() => null)
const mockUpdateAgent = vi.fn<(id: string, body: UpdateAgentRequest) => Agent | null>()
const mockDeleteAgent = vi.fn<(id: string, hard: boolean) => boolean>(() => true)
const mockSearchAgents = vi.fn(() => [])

vi.mock('@/lib/agent-registry', () => ({
  loadAgents: vi.fn(() => ({ version: 1, agents: [] })),
  saveAgents: vi.fn(),
  createAgent: (...args: [CreateAgentRequest]) => mockCreateAgent(...args),
  getAgent: (...args: [string, boolean?]) => mockGetAgent(...args),
  getAgentByName: vi.fn(() => null),
  getAgentBySession: vi.fn(() => null),
  updateAgent: (...args: [string, UpdateAgentRequest]) => mockUpdateAgent(...args),
  deleteAgent: (...args: [string, boolean]) => mockDeleteAgent(...args),
  searchAgents: (...args: unknown[]) => mockSearchAgents(...args),
  linkSession: vi.fn(),
  unlinkSession: vi.fn(),
}))

// --- Other imports the service module requires at load time ---
vi.mock('@/lib/messageQueue', () => ({
  resolveAgentIdentifier: vi.fn(() => null),
}))

vi.mock('@/lib/hosts-config', () => ({
  getHosts: vi.fn(() => []),
  getSelfHost: vi.fn(() => ({ id: 'local', name: 'local', url: 'http://localhost:23000' })),
  getSelfHostId: vi.fn(() => 'local'),
  isSelf: vi.fn(() => true),
}))

vi.mock('@/lib/session-persistence', () => ({
  persistSession: vi.fn(),
  unpersistSession: vi.fn(),
}))

vi.mock('@/lib/amp-inbox-writer', () => ({
  initAgentAMPHome: vi.fn(),
  getAgentAMPDir: vi.fn(() => '/tmp/amp'),
}))

vi.mock('@/lib/agent-startup', () => ({
  initializeAllAgents: vi.fn(),
  getStartupStatus: vi.fn(() => ({ status: 'idle' })),
}))

vi.mock('@/services/shared-state', () => ({
  sessionActivity: new Map(),
}))

vi.mock('@/lib/agent-runtime', () => ({
  getRuntime: vi.fn(() => null),
}))

vi.mock('@/lib/file-lock', () => ({
  withLock: vi.fn((_name: string, fn: () => unknown) => Promise.resolve(fn())),
}))

// ============================================================================
// Import module under test (after all mocks are declared)
// ============================================================================

import {
  createNewAgent,
  updateAgentById,
  deleteAgentById,
} from '@/services/agents-core-service'

// ============================================================================
// Test helpers
// ============================================================================

const MANAGER_ID = 'agent-manager-001'
const COS_ID = 'agent-cos-002'
const MEMBER_ID = 'agent-member-003'
const TARGET_AGENT_ID = 'agent-target-004'
const OWNING_COS_ID = 'agent-owning-cos-005'

/** Build a realistic Agent object with sensible defaults */
function makeAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: TARGET_AGENT_ID,
    name: 'test-target-agent',
    program: 'Claude Code',
    taskDescription: 'Testing governance enforcement',
    hostId: 'local',
    sessions: [],
    role: 'member',
    status: 'active',
    createdAt: '2026-01-15T10:00:00.000Z',
    updatedAt: '2026-01-15T10:00:00.000Z',
    lastActive: '2026-01-15T10:00:00.000Z',
    ...overrides,
  } as Agent
}

/** Build a realistic CreateAgentRequest */
function makeCreateRequest(overrides: Partial<CreateAgentRequest> = {}): CreateAgentRequest {
  return {
    name: 'new-test-agent',
    program: 'Claude Code',
    taskDescription: 'A new agent for governance testing',
    ...overrides,
  }
}

/** Build a realistic UpdateAgentRequest */
function makeUpdateRequest(overrides: Partial<UpdateAgentRequest> = {}): UpdateAgentRequest {
  return {
    taskDescription: 'Updated task description for governance testing',
    ...overrides,
  }
}

/** Build a Team object for owning-COS tests */
function makeClosedTeam(overrides: Partial<Team> = {}): Team {
  return {
    id: 'team-closed-001',
    name: 'Closed Backend Team',
    type: 'closed',
    agentIds: [TARGET_AGENT_ID, OWNING_COS_ID],
    chiefOfStaffId: OWNING_COS_ID,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

// ============================================================================
// Setup
// ============================================================================

beforeEach(() => {
  vi.clearAllMocks()
  uuidCounter = 0

  // Default: all role checks return false (regular member)
  mockIsManager.mockReturnValue(false)
  mockIsChiefOfStaffAnywhere.mockReturnValue(false)
  mockLoadTeams.mockReturnValue([])

  // Default: agent exists and is not deleted
  mockGetAgent.mockReturnValue(makeAgent())

  // Default: CRUD operations succeed
  mockCreateAgent.mockImplementation((body) => makeAgent({ name: body.name }))
  mockUpdateAgent.mockImplementation((id, body) => makeAgent({ id, ...body }))
  mockDeleteAgent.mockReturnValue(true)
})

// ============================================================================
// createNewAgent — 4 tests
// ============================================================================

describe('createNewAgent governance', () => {
  it('allows creation when requestingAgentId is null (backward compatibility)', async () => {
    /** Verifies that omitting requestingAgentId skips all governance checks */
    const result = await createNewAgent(makeCreateRequest())

    expect(result.status).toBe(201)
    expect(result.data?.agent).toBeDefined()
    expect(result.data?.agent.name).toBe('new-test-agent')
    // Governance functions should NOT have been called
    expect(mockIsManager).not.toHaveBeenCalled()
    expect(mockIsChiefOfStaffAnywhere).not.toHaveBeenCalled()
  })

  it('allows creation when requestingAgentId is MANAGER', async () => {
    /** Verifies that a MANAGER role agent is permitted to create new agents */
    mockIsManager.mockReturnValue(true)

    const result = await createNewAgent(makeCreateRequest(), MANAGER_ID)

    expect(result.status).toBe(201)
    expect(result.data?.agent).toBeDefined()
    expect(mockIsManager).toHaveBeenCalledWith(MANAGER_ID)
  })

  it('allows creation when requestingAgentId is Chief-of-Staff', async () => {
    /** Verifies that a COS role agent is permitted to create new agents */
    mockIsManager.mockReturnValue(false)
    mockIsChiefOfStaffAnywhere.mockReturnValue(true)

    const result = await createNewAgent(makeCreateRequest(), COS_ID)

    expect(result.status).toBe(201)
    expect(result.data?.agent).toBeDefined()
    expect(mockIsManager).toHaveBeenCalledWith(COS_ID)
    expect(mockIsChiefOfStaffAnywhere).toHaveBeenCalledWith(COS_ID)
  })

  it('rejects creation when requestingAgentId is a regular member', async () => {
    /** Verifies that a non-MANAGER, non-COS agent is denied agent creation with 403 */
    mockIsManager.mockReturnValue(false)
    mockIsChiefOfStaffAnywhere.mockReturnValue(false)

    const result = await createNewAgent(makeCreateRequest(), MEMBER_ID)

    expect(result.status).toBe(403)
    expect(result.error).toContain('Only MANAGER or Chief-of-Staff can create agents')
    expect(result.data).toBeUndefined()
    // createAgent should NOT have been called
    expect(mockCreateAgent).not.toHaveBeenCalled()
  })
})

// ============================================================================
// updateAgentById — 7 tests
// ============================================================================

describe('updateAgentById governance', () => {
  it('allows update when requestingAgentId is null (backward compatibility)', async () => {
    /** Verifies that omitting requestingAgentId skips all governance checks */
    const result = await updateAgentById(TARGET_AGENT_ID, makeUpdateRequest())

    expect(result.status).toBe(200)
    expect(result.data?.agent).toBeDefined()
    expect(mockIsManager).not.toHaveBeenCalled()
    expect(mockIsChiefOfStaffAnywhere).not.toHaveBeenCalled()
  })

  it('allows update when requestingAgentId is MANAGER', async () => {
    /** Verifies that a MANAGER role agent is permitted to update any agent */
    mockIsManager.mockReturnValue(true)

    const result = await updateAgentById(TARGET_AGENT_ID, makeUpdateRequest(), MANAGER_ID)

    expect(result.status).toBe(200)
    expect(result.data?.agent).toBeDefined()
    expect(mockIsManager).toHaveBeenCalledWith(MANAGER_ID)
  })

  it('allows update when requestingAgentId is Chief-of-Staff', async () => {
    /** Verifies that a COS role agent is permitted to update agents */
    mockIsManager.mockReturnValue(false)
    mockIsChiefOfStaffAnywhere.mockReturnValue(true)

    const result = await updateAgentById(TARGET_AGENT_ID, makeUpdateRequest(), COS_ID)

    expect(result.status).toBe(200)
    expect(result.data?.agent).toBeDefined()
    expect(mockIsChiefOfStaffAnywhere).toHaveBeenCalledWith(COS_ID)
  })

  it('allows self-update when requestingAgentId equals target agent id', async () => {
    /** Verifies that an agent can always update itself regardless of role */
    mockIsManager.mockReturnValue(false)
    mockIsChiefOfStaffAnywhere.mockReturnValue(false)
    // getAgent must return the target with matching id
    mockGetAgent.mockReturnValue(makeAgent({ id: TARGET_AGENT_ID }))

    const result = await updateAgentById(TARGET_AGENT_ID, makeUpdateRequest(), TARGET_AGENT_ID)

    expect(result.status).toBe(200)
    expect(result.data?.agent).toBeDefined()
    // loadTeams should NOT be called because self-update short-circuits
    expect(mockLoadTeams).not.toHaveBeenCalled()
  })

  it('allows update when requestingAgentId is COS of a closed team the target belongs to', async () => {
    /** Verifies that the COS of a closed team containing the target agent can update it */
    mockIsManager.mockReturnValue(false)
    mockIsChiefOfStaffAnywhere.mockReturnValue(false)
    // The requesting agent is the owning COS, not the global COS check
    mockLoadTeams.mockReturnValue([
      makeClosedTeam({
        agentIds: [TARGET_AGENT_ID, OWNING_COS_ID],
        chiefOfStaffId: OWNING_COS_ID,
      }),
    ])

    const result = await updateAgentById(TARGET_AGENT_ID, makeUpdateRequest(), OWNING_COS_ID)

    expect(result.status).toBe(200)
    expect(result.data?.agent).toBeDefined()
    expect(mockLoadTeams).toHaveBeenCalled()
  })

  it('rejects update when requestingAgentId is a regular member (not self, not owning COS)', async () => {
    /** Verifies that a non-privileged agent that is not updating itself is denied with 403 */
    mockIsManager.mockReturnValue(false)
    mockIsChiefOfStaffAnywhere.mockReturnValue(false)
    // No closed teams contain this member as COS
    mockLoadTeams.mockReturnValue([
      makeClosedTeam({
        agentIds: [TARGET_AGENT_ID, OWNING_COS_ID],
        chiefOfStaffId: OWNING_COS_ID,
      }),
    ])

    const result = await updateAgentById(TARGET_AGENT_ID, makeUpdateRequest(), MEMBER_ID)

    expect(result.status).toBe(403)
    expect(result.error).toContain('Only MANAGER, owning Chief-of-Staff, or the agent itself can update')
    expect(result.data).toBeUndefined()
    // updateAgent should NOT have been called
    expect(mockUpdateAgent).not.toHaveBeenCalled()
  })

  it('returns 404 when target agent does not exist', async () => {
    /** Verifies that attempting to update a non-existent agent returns 404 before governance check */
    mockGetAgent.mockReturnValue(null)

    const result = await updateAgentById('nonexistent-agent', makeUpdateRequest(), MANAGER_ID)

    expect(result.status).toBe(404)
    expect(result.error).toContain('Agent not found')
    // Governance checks should not be reached
    expect(mockIsManager).not.toHaveBeenCalled()
  })
})

// ============================================================================
// deleteAgentById — 5 tests
// ============================================================================

describe('deleteAgentById governance', () => {
  it('allows deletion when requestingAgentId is null (backward compatibility)', async () => {
    /** Verifies that omitting requestingAgentId skips all governance checks */
    const result = await deleteAgentById(TARGET_AGENT_ID, false)

    expect(result.status).toBe(200)
    expect(result.data?.success).toBe(true)
    expect(mockIsManager).not.toHaveBeenCalled()
  })

  it('allows deletion when requestingAgentId is MANAGER', async () => {
    /** Verifies that only MANAGER role is permitted to delete agents */
    mockIsManager.mockReturnValue(true)

    const result = await deleteAgentById(TARGET_AGENT_ID, false, MANAGER_ID)

    expect(result.status).toBe(200)
    expect(result.data?.success).toBe(true)
    expect(mockIsManager).toHaveBeenCalledWith(MANAGER_ID)
  })

  it('rejects deletion when requestingAgentId is Chief-of-Staff', async () => {
    /** Verifies that COS cannot delete agents -- only MANAGER has delete authority */
    mockIsManager.mockReturnValue(false)
    mockIsChiefOfStaffAnywhere.mockReturnValue(true)

    const result = await deleteAgentById(TARGET_AGENT_ID, false, COS_ID)

    expect(result.status).toBe(403)
    expect(result.error).toContain('Only MANAGER can delete agents')
    expect(result.data).toBeUndefined()
    // deleteAgent should NOT have been called
    expect(mockDeleteAgent).not.toHaveBeenCalled()
  })

  it('rejects deletion when requestingAgentId is a regular member', async () => {
    /** Verifies that a regular member agent is denied agent deletion with 403 */
    mockIsManager.mockReturnValue(false)
    mockIsChiefOfStaffAnywhere.mockReturnValue(false)

    const result = await deleteAgentById(TARGET_AGENT_ID, false, MEMBER_ID)

    expect(result.status).toBe(403)
    expect(result.error).toContain('Only MANAGER can delete agents')
    expect(result.data).toBeUndefined()
    expect(mockDeleteAgent).not.toHaveBeenCalled()
  })

  it('returns 404 when target agent does not exist', async () => {
    /** Verifies that deleting a non-existent agent returns 404 before governance check */
    mockGetAgent.mockReturnValue(null)

    const result = await deleteAgentById('nonexistent-agent', false, MANAGER_ID)

    expect(result.status).toBe(404)
    expect(result.error).toContain('Agent not found')
    // Governance check should not be reached for delete since 404 comes first
    expect(mockDeleteAgent).not.toHaveBeenCalled()
  })
})
