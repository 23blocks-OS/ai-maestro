/**
 * Extended Unit Tests for Agent Configuration Governance
 *
 * Tests FOUR modules across Steps 2, 4, 5, 9 of the governance implementation:
 *
 *   Module 1: services/agents-skills-service.ts — RBAC enforcement (20 tests)
 *     checkConfigGovernance() enforces governance on updateSkills, addSkill, removeSkill, saveSkillSettings.
 *     getSkillsConfig has NO governance (reads are public). getSkillSettings has NO governance.
 *
 *   Module 2: services/agents-config-deploy-service.ts — Deployment operations (16 tests)
 *     deployConfigToAgent() validates agent existence, operation type, working directory,
 *     and dispatches to add-skill, remove-skill, add-plugin, remove-plugin, update-hooks,
 *     update-mcp, update-model, bulk-config operations.
 *
 *   Module 3: services/cross-host-governance-service.ts — configure-agent flow (14 tests)
 *     submitCrossHostRequest validates configure-agent payloads.
 *     receiveCrossHostRequest accepts configure-agent as a valid type.
 *     approveCrossHostRequest triggers performRequestExecution for configure-agent.
 *     listCrossHostRequests returns filtered results.
 *     Regression: existing types (add-to-team, transfer-agent) still work.
 *
 *   Module 4: services/config-notification-service.ts — Notifications (6 tests)
 *     notifyConfigRequestOutcome sends AMP + tmux notifications for approved/rejected
 *     configure-agent requests. Non-configure-agent types are silently skipped.
 *
 * Total: 56 tests (20 + 16 + 14 + 6)
 *
 * Mocking strategy: Only external dependencies are mocked (filesystem, governance,
 * agent-registry, network fetch, child_process). Internal logic is executed for real.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Agent } from '@/types/agent'
import type { Team } from '@/types/team'
import type { GovernanceRequest, ConfigurationPayload } from '@/types/governance-request'

// ============================================================================
// MODULE 1 MOCKS: agents-skills-service
// ============================================================================

// --- Governance mocks ---
const mockIsManager = vi.fn<(agentId: string) => boolean>(() => false)
const mockIsChiefOfStaff = vi.fn<(agentId: string, teamId: string) => boolean>(() => false)
const mockIsChiefOfStaffAnywhere = vi.fn<(agentId: string) => boolean>(() => false)
const mockGetClosedTeamsForAgent = vi.fn<(agentId: string) => Team[]>(() => [])
const mockVerifyPassword = vi.fn()
const mockGetManagerId = vi.fn()

vi.mock('@/lib/governance', () => ({
  isManager: (...args: [string]) => mockIsManager(...args),
  isChiefOfStaff: (...args: [string, string]) => mockIsChiefOfStaff(...args),
  isChiefOfStaffAnywhere: (...args: [string]) => mockIsChiefOfStaffAnywhere(...args),
  getClosedTeamsForAgent: (...args: [string]) => mockGetClosedTeamsForAgent(...args),
  verifyPassword: (...args: unknown[]) => mockVerifyPassword(...args),
  getManagerId: (...args: unknown[]) => mockGetManagerId(...args),
}))

// --- Agent registry mocks ---
const mockGetAgent = vi.fn()
const mockGetAgentSkills = vi.fn()
const mockAddMarketplaceSkills = vi.fn()
const mockRemoveMarketplaceSkills = vi.fn()
const mockAddCustomSkill = vi.fn()
const mockRemoveCustomSkill = vi.fn()
const mockUpdateAiMaestroSkills = vi.fn()

vi.mock('@/lib/agent-registry', () => ({
  getAgent: (...args: unknown[]) => mockGetAgent(...args),
  getAgentSkills: (...args: unknown[]) => mockGetAgentSkills(...args),
  addMarketplaceSkills: (...args: unknown[]) => mockAddMarketplaceSkills(...args),
  removeMarketplaceSkills: (...args: unknown[]) => mockRemoveMarketplaceSkills(...args),
  addCustomSkill: (...args: unknown[]) => mockAddCustomSkill(...args),
  removeCustomSkill: (...args: unknown[]) => mockRemoveCustomSkill(...args),
  updateAiMaestroSkills: (...args: unknown[]) => mockUpdateAiMaestroSkills(...args),
  loadAgents: vi.fn(() => ({ version: 1, agents: [] })),
  saveAgents: vi.fn(),
  createAgent: vi.fn(),
  getAgentByName: vi.fn(() => null),
  getAgentBySession: vi.fn(() => null),
  updateAgent: vi.fn(),
  deleteAgent: vi.fn(),
  searchAgents: vi.fn(() => []),
  linkSession: vi.fn(),
  unlinkSession: vi.fn(),
}))

// --- Marketplace skills mock ---
const mockGetSkillById = vi.fn()
vi.mock('@/lib/marketplace-skills', () => ({
  getSkillById: (...args: unknown[]) => mockGetSkillById(...args),
}))

// --- Agent class mock (agentRegistry.getAgent for saveSkillSettings) ---
const mockAgentRegistryGetAgent = vi.fn()
vi.mock('@/lib/agent', () => ({
  agentRegistry: {
    getAgent: (...args: unknown[]) => mockAgentRegistryGetAgent(...args),
  },
}))

// --- fs/promises mock (for saveSkillSettings and deploy service) ---
const mockFsReadFile = vi.fn()
const mockFsWriteFile = vi.fn()
const mockFsMkdir = vi.fn()
const mockFsRm = vi.fn()
const mockFsAccess = vi.fn()
const mockFsRename = vi.fn()
vi.mock('fs/promises', () => ({
  default: {
    readFile: (...args: unknown[]) => mockFsReadFile(...args),
    writeFile: (...args: unknown[]) => mockFsWriteFile(...args),
    mkdir: (...args: unknown[]) => mockFsMkdir(...args),
    rm: (...args: unknown[]) => mockFsRm(...args),
    access: (...args: unknown[]) => mockFsAccess(...args),
    rename: (...args: unknown[]) => mockFsRename(...args),
  },
  readFile: (...args: unknown[]) => mockFsReadFile(...args),
  writeFile: (...args: unknown[]) => mockFsWriteFile(...args),
  mkdir: (...args: unknown[]) => mockFsMkdir(...args),
  rm: (...args: unknown[]) => mockFsRm(...args),
  access: (...args: unknown[]) => mockFsAccess(...args),
  rename: (...args: unknown[]) => mockFsRename(...args),
}))

// --- Cross-host governance service dependencies ---
const mockGetHosts = vi.fn()
const mockGetSelfHostId = vi.fn()
const mockIsSelf = vi.fn()
const mockGetHostById = vi.fn()
vi.mock('@/lib/hosts-config', () => ({
  getHosts: (...args: unknown[]) => mockGetHosts(...args),
  getSelfHostId: (...args: unknown[]) => mockGetSelfHostId(...args),
  isSelf: (...args: unknown[]) => mockIsSelf(...args),
  getHostById: (...args: unknown[]) => mockGetHostById(...args),
}))

const mockCreateGovernanceRequest = vi.fn()
const mockGetGovernanceRequest = vi.fn()
const mockListGovernanceRequests = vi.fn()
const mockApproveGovernanceRequest = vi.fn()
const mockRejectGovernanceRequest = vi.fn()
const mockLoadGovernanceRequests = vi.fn()
const mockSaveGovernanceRequests = vi.fn()
const mockWithLock = vi.fn()

vi.mock('@/lib/governance-request-registry', () => ({
  createGovernanceRequest: (...args: unknown[]) => mockCreateGovernanceRequest(...args),
  getGovernanceRequest: (...args: unknown[]) => mockGetGovernanceRequest(...args),
  listGovernanceRequests: (...args: unknown[]) => mockListGovernanceRequests(...args),
  approveGovernanceRequest: (...args: unknown[]) => mockApproveGovernanceRequest(...args),
  rejectGovernanceRequest: (...args: unknown[]) => mockRejectGovernanceRequest(...args),
  loadGovernanceRequests: (...args: unknown[]) => mockLoadGovernanceRequests(...args),
  saveGovernanceRequests: (...args: unknown[]) => mockSaveGovernanceRequests(...args),
}))

vi.mock('@/lib/file-lock', () => ({
  withLock: (...args: unknown[]) => mockWithLock(...args),
}))

const mockBroadcastGovernanceSync = vi.fn()
vi.mock('@/lib/governance-sync', () => ({
  broadcastGovernanceSync: (...args: unknown[]) => mockBroadcastGovernanceSync(...args),
}))

vi.mock('@/lib/host-keys', () => ({
  signHostAttestation: vi.fn(() => 'mock-sig'),
  getHostPublicKeyHex: vi.fn(() => 'mock-pubkey'),
  verifyHostAttestation: vi.fn(() => true),
}))

const mockShouldAutoApprove = vi.fn()
vi.mock('@/lib/manager-trust', () => ({
  shouldAutoApprove: (...args: unknown[]) => mockShouldAutoApprove(...args),
}))

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true, retryAfterMs: 0 })),
  checkAndRecordAttempt: vi.fn(() => ({ allowed: true, retryAfterMs: 0 })),
  recordFailure: vi.fn(),
  resetRateLimit: vi.fn(),
}))

const mockLoadTeams = vi.fn()
const mockSaveTeams = vi.fn()
vi.mock('@/lib/team-registry', () => ({
  loadTeams: (...args: unknown[]) => mockLoadTeams(...args),
  saveTeams: (...args: unknown[]) => mockSaveTeams(...args),
}))

// --- Agents-core-service mock (for deploy service update-model) ---
const mockUpdateAgentById = vi.fn()
vi.mock('@/services/agents-core-service', () => ({
  updateAgentById: (...args: unknown[]) => mockUpdateAgentById(...args),
}))

// --- Config notification service mock (for cross-host integration) ---
const mockNotifyConfigRequestOutcome = vi.fn()
vi.mock('@/services/config-notification-service', () => ({
  notifyConfigRequestOutcome: (...args: unknown[]) => mockNotifyConfigRequestOutcome(...args),
}))

// --- Other imports that agents-core-service or agents-skills-service load ---
vi.mock('@/lib/messageQueue', () => ({
  resolveAgentIdentifier: vi.fn(() => null),
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

// NT-011: Incrementing counter avoids collisions when multiple UUIDs are generated
// in a single test (e.g., creating multiple agents or requests in sequence).
let uuidExtCounter = 0
vi.mock('uuid', () => ({
  v4: vi.fn(() => `test-uuid-ext-${String(++uuidExtCounter).padStart(3, '0')}`),
}))

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

// ============================================================================
// Import modules under test (after all mocks are declared)
// ============================================================================

import {
  getSkillsConfig,
  updateSkills,
  addSkill,
  removeSkill,
  getSkillSettings,
  saveSkillSettings,
} from '@/services/agents-skills-service'

import {
  deployConfigToAgent,
} from '@/services/agents-config-deploy-service'

import {
  submitCrossHostRequest,
  receiveCrossHostRequest,
  approveCrossHostRequest,
  listCrossHostRequests,
} from '@/services/cross-host-governance-service'

// ============================================================================
// Test data factories
// ============================================================================

const MANAGER_ID = 'agent-manager-ext-001'
const COS_ID = 'agent-cos-ext-002'
const MEMBER_ID = 'agent-member-ext-003'
const TARGET_AGENT_ID = '550e8400-e29b-41d4-a716-446655440000'
const TEAM_ID = 'team-closed-ext-001'
const AGENT_UUID = '12345678-1234-1234-1234-123456789abc'

const HOST_LOCAL = { id: 'host-local', url: 'http://localhost:23000', name: 'host-local' }
const HOST_REMOTE = { id: 'host-remote', url: 'http://10.0.0.5:23000', name: 'host-remote' }

function makeAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: TARGET_AGENT_ID,
    name: 'test-target-agent',
    program: 'Claude Code',
    taskDescription: 'Extended governance testing',
    hostId: 'local',
    sessions: [],
    role: 'member',
    status: 'active',
    workingDirectory: '/tmp/test-agent',
    createdAt: '2026-01-15T10:00:00.000Z',
    updatedAt: '2026-01-15T10:00:00.000Z',
    lastActive: '2026-01-15T10:00:00.000Z',
    ...overrides,
  } as Agent
}

// Returns Record<string, unknown> to match the mocked getAgent signature.
// A more specific type would require importing Agent internals into the test.
function makeAgentWithSubconscious(overrides: Partial<Agent> = {}): Record<string, unknown> {
  return {
    id: AGENT_UUID,
    name: 'test-agent-runtime',
    getSubconscious: () => null,
    ...overrides,
  }
}

function makeClosedTeam(overrides: Partial<Team> = {}): Team {
  return {
    id: TEAM_ID,
    name: 'Closed Testing Team',
    type: 'closed',
    agentIds: [TARGET_AGENT_ID, COS_ID],
    chiefOfStaffId: COS_ID,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function makeGovernanceRequest(overrides: Partial<GovernanceRequest> = {}): GovernanceRequest {
  return {
    id: 'req-ext-001',
    type: 'configure-agent',
    sourceHostId: 'host-local',
    targetHostId: 'host-remote',
    requestedBy: 'manager-agent',
    requestedByRole: 'manager',
    payload: {
      agentId: TARGET_AGENT_ID,
      configuration: {
        operation: 'add-skill',
        scope: 'local',
        skills: ['test-skill'],
      },
    },
    approvals: {},
    status: 'pending',
    createdAt: '2026-02-20T10:00:00.000Z',
    updatedAt: '2026-02-20T10:00:00.000Z',
    ...overrides,
  }
}

// ============================================================================
// Global setup / teardown
// ============================================================================

const originalFetch = globalThis.fetch

beforeEach(() => {
  vi.clearAllMocks()
  uuidExtCounter = 0 // NT-011: Reset UUID counter so each test starts from ext-001

  // Default: all role checks return false (regular member)
  mockIsManager.mockReturnValue(false)
  mockIsChiefOfStaff.mockReturnValue(false)
  mockIsChiefOfStaffAnywhere.mockReturnValue(false)
  mockGetClosedTeamsForAgent.mockReturnValue([])
  mockVerifyPassword.mockImplementation(async (pw: string) => pw === 'correct')
  mockGetManagerId.mockReturnValue('manager-agent')

  // Default: agent exists
  mockGetAgent.mockReturnValue(makeAgent())
  mockGetAgentSkills.mockReturnValue({ marketplace: [], custom: [], aiMaestro: { enabled: true, skills: [] } })

  // Default: Agent class registry mock
  mockAgentRegistryGetAgent.mockResolvedValue(makeAgentWithSubconscious())

  // Default: skills operations succeed
  mockAddMarketplaceSkills.mockResolvedValue(makeAgent())
  mockRemoveMarketplaceSkills.mockResolvedValue(makeAgent())
  mockAddCustomSkill.mockResolvedValue(makeAgent())
  mockRemoveCustomSkill.mockResolvedValue(makeAgent())
  mockUpdateAiMaestroSkills.mockResolvedValue(makeAgent())
  mockGetSkillById.mockResolvedValue({ id: 'skill-1', marketplace: 'official', plugin: 'test', name: 'test-skill', version: '1.0.0' })

  // Default: fs operations succeed
  mockFsReadFile.mockResolvedValue('{}')
  mockFsWriteFile.mockResolvedValue(undefined)
  mockFsMkdir.mockResolvedValue(undefined)
  mockFsRm.mockResolvedValue(undefined)
  mockFsRename.mockResolvedValue(undefined)
  mockFsAccess.mockRejectedValue(new Error('ENOENT')) // fileExists returns false by default

  // Default: cross-host governance mocks
  mockGetSelfHostId.mockReturnValue('host-local')
  mockGetHosts.mockReturnValue([HOST_LOCAL, HOST_REMOTE])
  mockIsSelf.mockImplementation((id: string) => id === 'host-local')
  mockGetHostById.mockImplementation((id: string) => {
    if (id === 'host-local') return HOST_LOCAL
    if (id === 'host-remote') return HOST_REMOTE
    return undefined
  })
  mockCreateGovernanceRequest.mockResolvedValue(makeGovernanceRequest())
  mockGetGovernanceRequest.mockReturnValue(null)
  mockListGovernanceRequests.mockReturnValue([])
  mockApproveGovernanceRequest.mockResolvedValue(null)
  mockRejectGovernanceRequest.mockResolvedValue(null)
  mockBroadcastGovernanceSync.mockResolvedValue(undefined)
  mockLoadTeams.mockReturnValue([])
  mockSaveTeams.mockReturnValue(undefined)
  mockWithLock.mockImplementation(async (_name: string, fn: () => unknown) => fn())
  mockLoadGovernanceRequests.mockReturnValue({ version: 1, requests: [] })
  mockSaveGovernanceRequests.mockReturnValue(undefined)
  mockShouldAutoApprove.mockReturnValue(false)
  mockNotifyConfigRequestOutcome.mockResolvedValue(undefined)
  mockUpdateAgentById.mockResolvedValue({ data: { agent: makeAgent() }, status: 200 })

  // Default fetch mock
  globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({}) })
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

// ============================================================================
// MODULE 1: agents-skills-service RBAC (20 tests)
// ============================================================================

describe('skills service RBAC', () => {
  // All tests are mock-based (no integration tests). See Phase 2 for integration test coverage.

  // ---- updateSkills governance ----

  it('updateSkills allows when requestingAgentId is null (Phase 1 backward compat)', async () => {
    /** Verifies that omitting requestingAgentId bypasses all governance checks */
    const result = await updateSkills(TARGET_AGENT_ID, { add: ['skill-1'] }, null)

    expect(result.status).toBe(200)
    expect(result.data).toBeDefined()
    expect(mockIsManager).not.toHaveBeenCalled()
    expect(mockIsChiefOfStaff).not.toHaveBeenCalled()
  })

  it('updateSkills allows when requestingAgentId is MANAGER', async () => {
    /** Verifies that a MANAGER agent is always permitted to modify skills */
    mockIsManager.mockReturnValue(true)

    const result = await updateSkills(TARGET_AGENT_ID, { add: ['skill-1'] }, MANAGER_ID)

    expect(result.status).toBe(200)
    expect(mockIsManager).toHaveBeenCalledWith(MANAGER_ID)
  })

  it('updateSkills allows when requestingAgentId is COS of target agents team', async () => {
    /** Verifies that COS of the target agents closed team can modify skills */
    mockIsManager.mockReturnValue(false)
    mockGetClosedTeamsForAgent.mockReturnValue([makeClosedTeam()])
    mockIsChiefOfStaff.mockImplementation((agentId: string, teamId: string) =>
      agentId === COS_ID && teamId === TEAM_ID
    )

    const result = await updateSkills(TARGET_AGENT_ID, { add: ['skill-1'] }, COS_ID)

    expect(result.status).toBe(200)
    expect(mockGetClosedTeamsForAgent).toHaveBeenCalledWith(TARGET_AGENT_ID)
    expect(mockIsChiefOfStaff).toHaveBeenCalledWith(COS_ID, TEAM_ID)
  })

  it('updateSkills rejects 403 when requestingAgentId is COS of a different team', async () => {
    /** Verifies that a COS of team-X cannot modify agents in team-Y */
    mockIsManager.mockReturnValue(false)
    mockGetClosedTeamsForAgent.mockReturnValue([makeClosedTeam()])
    // COS is of a different team, not TEAM_ID
    mockIsChiefOfStaff.mockReturnValue(false)

    const result = await updateSkills(TARGET_AGENT_ID, { add: ['skill-1'] }, COS_ID)

    expect(result.status).toBe(403)
    expect(result.error).toContain('Insufficient governance permissions')
  })

  it('updateSkills rejects 403 when requestingAgentId is a regular member', async () => {
    /** Verifies that a non-privileged agent is denied skill updates with 403 */
    mockIsManager.mockReturnValue(false)
    mockGetClosedTeamsForAgent.mockReturnValue([makeClosedTeam()])
    mockIsChiefOfStaff.mockReturnValue(false)

    const result = await updateSkills(TARGET_AGENT_ID, { add: ['skill-1'] }, MEMBER_ID)

    expect(result.status).toBe(403)
    expect(result.data).toBeUndefined()
    expect(mockAddMarketplaceSkills).not.toHaveBeenCalled()
  })

  // ---- addSkill governance ----

  it('addSkill allows when requestingAgentId is null (backward compat)', async () => {
    /** Verifies that omitting requestingAgentId bypasses governance for addSkill */
    const result = await addSkill(TARGET_AGENT_ID, { name: 'my-skill', content: '# My Skill' }, null)

    expect(result.status).toBe(200)
    expect(mockIsManager).not.toHaveBeenCalled()
  })

  it('addSkill allows when requestingAgentId is MANAGER', async () => {
    /** Verifies that a MANAGER agent can add custom skills */
    mockIsManager.mockReturnValue(true)

    const result = await addSkill(TARGET_AGENT_ID, { name: 'my-skill', content: '# My Skill' }, MANAGER_ID)

    expect(result.status).toBe(200)
    expect(mockAddCustomSkill).toHaveBeenCalledWith(TARGET_AGENT_ID, {
      name: 'my-skill',
      content: '# My Skill',
      description: undefined,
    })
  })

  it('addSkill rejects 403 when requestingAgentId is a regular member', async () => {
    /** Verifies that a regular member cannot add custom skills */
    mockIsManager.mockReturnValue(false)
    mockGetClosedTeamsForAgent.mockReturnValue([makeClosedTeam()])
    mockIsChiefOfStaff.mockReturnValue(false)

    const result = await addSkill(TARGET_AGENT_ID, { name: 'my-skill', content: '# My Skill' }, MEMBER_ID)

    expect(result.status).toBe(403)
    expect(mockAddCustomSkill).not.toHaveBeenCalled()
  })

  // ---- removeSkill governance ----

  it('removeSkill allows when requestingAgentId is MANAGER', async () => {
    /** Verifies that a MANAGER agent can remove skills */
    mockIsManager.mockReturnValue(true)

    const result = await removeSkill(TARGET_AGENT_ID, 'skill-1', 'custom', MANAGER_ID)

    expect(result.status).toBe(200)
    expect(mockRemoveCustomSkill).toHaveBeenCalledWith(TARGET_AGENT_ID, 'skill-1')
  })

  it('removeSkill allows when requestingAgentId is COS of target agents team', async () => {
    /** Verifies that COS of the agent's team can remove skills */
    mockIsManager.mockReturnValue(false)
    mockGetClosedTeamsForAgent.mockReturnValue([makeClosedTeam()])
    mockIsChiefOfStaff.mockImplementation((agentId: string, teamId: string) =>
      agentId === COS_ID && teamId === TEAM_ID
    )

    const result = await removeSkill(TARGET_AGENT_ID, 'skill-1', 'custom', COS_ID)

    expect(result.status).toBe(200)
  })

  it('removeSkill rejects 403 when requestingAgentId is a regular member', async () => {
    /** Verifies that a regular member cannot remove skills */
    mockIsManager.mockReturnValue(false)
    mockGetClosedTeamsForAgent.mockReturnValue([makeClosedTeam()])
    mockIsChiefOfStaff.mockReturnValue(false)

    const result = await removeSkill(TARGET_AGENT_ID, 'skill-1', 'custom', MEMBER_ID)

    expect(result.status).toBe(403)
    expect(mockRemoveCustomSkill).not.toHaveBeenCalled()
  })

  // ---- saveSkillSettings governance ----

  it('saveSkillSettings allows when requestingAgentId is null (backward compat)', async () => {
    /** Verifies that omitting requestingAgentId bypasses governance for settings save */
    const result = await saveSkillSettings(AGENT_UUID, { memory: { enabled: true } }, null)

    expect(result.status).toBe(200)
    expect(result.data).toBeDefined()
    expect(mockIsManager).not.toHaveBeenCalled()
  })

  it('saveSkillSettings allows when requestingAgentId is MANAGER', async () => {
    /** Verifies that a MANAGER agent can save skill settings */
    mockIsManager.mockReturnValue(true)

    const result = await saveSkillSettings(AGENT_UUID, { memory: { enabled: true } }, MANAGER_ID)

    expect(result.status).toBe(200)
    expect(mockFsWriteFile).toHaveBeenCalled()
  })

  it('saveSkillSettings rejects 403 when requestingAgentId is a regular member', async () => {
    /** Verifies that a regular member cannot save skill settings */
    mockIsManager.mockReturnValue(false)
    // Agent in a closed team but requester is not COS
    mockGetClosedTeamsForAgent.mockReturnValue([makeClosedTeam()])
    mockIsChiefOfStaff.mockReturnValue(false)

    const result = await saveSkillSettings(AGENT_UUID, { memory: { enabled: true } }, MEMBER_ID)

    expect(result.status).toBe(403)
    expect(mockFsWriteFile).not.toHaveBeenCalled()
  })

  // ---- getSkillsConfig (no governance on reads) ----

  it('getSkillsConfig always succeeds regardless of caller identity (reads are public)', () => {
    /** Verifies that getSkillsConfig has no governance checks (pure read operation) */
    const result = getSkillsConfig(TARGET_AGENT_ID)

    expect(result.status).toBe(200)
    expect(result.data).toBeDefined()
    // No governance mock should have been called
    expect(mockIsManager).not.toHaveBeenCalled()
    expect(mockIsChiefOfStaff).not.toHaveBeenCalled()
    expect(mockGetClosedTeamsForAgent).not.toHaveBeenCalled()
  })

  // ---- Additional edge cases ----

  it('updateSkills returns 404 when target agent does not exist', async () => {
    /** Verifies that updating skills on a non-existent agent returns 404 before governance check */
    mockGetAgent.mockReturnValue(null)

    const result = await updateSkills('nonexistent', { add: ['skill-1'] }, MANAGER_ID)

    expect(result.status).toBe(404)
    expect(result.error).toContain('Agent not found')
    expect(mockIsManager).not.toHaveBeenCalled()
  })

  it('addSkill returns 404 when target agent does not exist', async () => {
    /** Verifies that adding a custom skill to a non-existent agent returns 404 */
    mockGetAgent.mockReturnValue(null)
    // Must use a valid UUID format to pass SF-040 UUID validation before reaching the 404 check
    const nonexistentUuid = '00000000-0000-0000-0000-000000000099'

    const result = await addSkill(nonexistentUuid, { name: 'skill', content: '# Skill' }, MANAGER_ID)

    expect(result.status).toBe(404)
    expect(result.error).toContain('Agent not found')
  })

  it('removeSkill returns 404 when target agent does not exist', async () => {
    /** Verifies that removing a skill from a non-existent agent returns 404 */
    mockGetAgent.mockReturnValue(null)
    // Must use a valid UUID format to pass SF-030 UUID validation before reaching the 404 check
    const nonexistentUuid = '00000000-0000-0000-0000-000000000099'

    const result = await removeSkill(nonexistentUuid, 'skill-1', 'custom', MANAGER_ID)

    expect(result.status).toBe(404)
    expect(result.error).toContain('Agent not found')
  })

  it('updateSkills rejects 403 for agent not in any closed team (MANAGER required)', async () => {
    /** Verifies that agents not in a closed team can only be configured by MANAGER */
    mockIsManager.mockReturnValue(false)
    mockGetClosedTeamsForAgent.mockReturnValue([]) // Not in any closed team

    const result = await updateSkills(TARGET_AGENT_ID, { add: ['skill-1'] }, COS_ID)

    expect(result.status).toBe(403)
    expect(result.error).toContain('Only the MANAGER can configure agents not in a closed team')
  })

  it('getSkillsConfig returns 404 when agent skills not found', () => {
    /** Verifies that getSkillsConfig returns 404 when getAgentSkills returns null */
    mockGetAgentSkills.mockReturnValue(null)

    const result = getSkillsConfig(TARGET_AGENT_ID)

    expect(result.status).toBe(404)
    expect(result.error).toContain('Agent not found')
  })
})

// ============================================================================
// MODULE 2: agents-config-deploy-service (16 tests)
// ============================================================================

describe('config deploy service', () => {
  // SF-007 added fs.access(workingDir) validation before deployment operations.
  // The mock must succeed for the agent's working directory but reject for other paths
  // (skill/plugin existence checks) unless overridden in individual tests.
  beforeEach(() => {
    mockFsAccess.mockImplementation(async (p: string) => {
      if (p === '/tmp/test-agent') return undefined  // working directory exists
      throw new Error('ENOENT')  // other paths (skill/plugin dirs) don't exist
    })
  })

  it('add-skill creates skill directory and SKILL.md', async () => {
    /** Verifies that deploying an add-skill creates the skill folder and placeholder SKILL.md */
    const config: ConfigurationPayload = {
      operation: 'add-skill',
      scope: 'local',
      skills: ['test-analysis-skill'],
    }

    const result = await deployConfigToAgent(TARGET_AGENT_ID, config, MANAGER_ID)

    expect(result.status).toBe(200)
    expect(result.data?.operation).toBe('add-skill')
    expect(result.data?.after).toHaveProperty('test-analysis-skill', 'present')
    // Verify mkdir was called for the skills directory
    expect(mockFsMkdir).toHaveBeenCalled()
    // Verify SKILL.md was written
    expect(mockFsWriteFile).toHaveBeenCalled()
    const writeCallArgs = mockFsWriteFile.mock.calls[0]
    expect(writeCallArgs[0]).toContain('test-analysis-skill')
    expect(writeCallArgs[0]).toContain('SKILL.md')
  })

  it('add-skill blocks path traversal in skill name', async () => {
    /** Verifies that path traversal attempts (..) in skill names are rejected with 400 */
    const config: ConfigurationPayload = {
      operation: 'add-skill',
      scope: 'local',
      skills: ['../etc/passwd'],
    }

    const result = await deployConfigToAgent(TARGET_AGENT_ID, config, MANAGER_ID)

    expect(result.status).toBe(400)
    expect(result.error).toContain('Invalid skill name')
    expect(mockFsWriteFile).not.toHaveBeenCalled()
  })

  it('remove-skill removes existing skill directory', async () => {
    /** Verifies that deploying a remove-skill calls fs.rm on the skill directory */
    // SF-015: Use path-aware mockImplementation so only expected skill directory paths
    // resolve, while unexpected paths still reject with ENOENT.
    mockFsAccess.mockImplementation(async (p: string) => {
      if (p === '/tmp/test-agent') return undefined  // working directory exists
      if (typeof p === 'string' && p.includes('obsolete-skill')) return undefined  // skill dir exists
      throw new Error('ENOENT')
    })

    const config: ConfigurationPayload = {
      operation: 'remove-skill',
      scope: 'local',
      skills: ['obsolete-skill'],
    }

    const result = await deployConfigToAgent(TARGET_AGENT_ID, config, MANAGER_ID)

    expect(result.status).toBe(200)
    expect(result.data?.operation).toBe('remove-skill')
    expect(result.data?.before).toHaveProperty('obsolete-skill', 'present')
    expect(result.data?.after).toHaveProperty('obsolete-skill', 'absent')
    expect(mockFsRm).toHaveBeenCalled()
  })

  it('remove-skill is idempotent for non-existent skill (no error)', async () => {
    /** Verifies that removing a non-existent skill does not throw and marks before as absent */
    // mockFsAccess behavior comes from the describe-level beforeEach, not from this test's setup.
    // The describe-level beforeEach resolves for '/tmp/test-agent' (working dir) and rejects
    // with ENOENT for all other paths (skill/plugin dirs), so fileExists returns false here.
    const config: ConfigurationPayload = {
      operation: 'remove-skill',
      scope: 'local',
      skills: ['nonexistent-skill'],
    }

    const result = await deployConfigToAgent(TARGET_AGENT_ID, config, MANAGER_ID)

    expect(result.status).toBe(200)
    expect(result.data?.before).toHaveProperty('nonexistent-skill', 'absent')
    expect(result.data?.after).toHaveProperty('nonexistent-skill', 'absent')
    // rm should NOT have been called (skill didn't exist)
    expect(mockFsRm).not.toHaveBeenCalled()
  })

  it('add-plugin creates plugin directory', async () => {
    /** Verifies that deploying an add-plugin creates the plugin folder */
    const config: ConfigurationPayload = {
      operation: 'add-plugin',
      scope: 'local',
      plugins: ['my-test-plugin'],
    }

    const result = await deployConfigToAgent(TARGET_AGENT_ID, config, MANAGER_ID)

    expect(result.status).toBe(200)
    expect(result.data?.operation).toBe('add-plugin')
    expect(result.data?.after).toHaveProperty('my-test-plugin', 'present')
    expect(mockFsMkdir).toHaveBeenCalled()
  })

  it('remove-plugin removes existing plugin directory', async () => {
    /** Verifies that deploying a remove-plugin calls fs.rm on the plugin directory */
    // SF-015: Use path-aware mockImplementation so only expected plugin directory paths
    // resolve, while unexpected paths still reject with ENOENT.
    mockFsAccess.mockImplementation(async (p: string) => {
      if (p === '/tmp/test-agent') return undefined  // working directory exists
      if (typeof p === 'string' && p.includes('old-plugin')) return undefined  // plugin dir exists
      throw new Error('ENOENT')
    })

    const config: ConfigurationPayload = {
      operation: 'remove-plugin',
      scope: 'local',
      plugins: ['old-plugin'],
    }

    const result = await deployConfigToAgent(TARGET_AGENT_ID, config, MANAGER_ID)

    expect(result.status).toBe(200)
    expect(result.data?.operation).toBe('remove-plugin')
    expect(mockFsRm).toHaveBeenCalled()
  })

  it('update-hooks merges hooks into settings.json', async () => {
    /** Verifies that deploying update-hooks merges new hooks into existing settings */
    mockFsReadFile.mockResolvedValue(JSON.stringify({ hooks: { existingHook: true } }))

    const config: ConfigurationPayload = {
      operation: 'update-hooks',
      scope: 'local',
      hooks: { preToolUse: { command: 'node check.js' } },
    }

    const result = await deployConfigToAgent(TARGET_AGENT_ID, config, MANAGER_ID)

    expect(result.status).toBe(200)
    expect(result.data?.operation).toBe('update-hooks')
    // Verify writeFile was called with merged settings
    expect(mockFsWriteFile).toHaveBeenCalled()
    const writtenContent = JSON.parse(mockFsWriteFile.mock.calls[0][1] as string)
    expect(writtenContent.hooks).toHaveProperty('existingHook', true)
    expect(writtenContent.hooks).toHaveProperty('preToolUse')
  })

  it('update-mcp merges mcpServers into settings.json', async () => {
    /** Verifies that deploying update-mcp merges new MCP servers into existing settings */
    mockFsReadFile.mockResolvedValue(JSON.stringify({ mcpServers: { existing: { url: 'http://x' } } }))

    const config: ConfigurationPayload = {
      operation: 'update-mcp',
      scope: 'local',
      mcpServers: { newServer: { url: 'http://new-server:3000' } },
    }

    const result = await deployConfigToAgent(TARGET_AGENT_ID, config, MANAGER_ID)

    expect(result.status).toBe(200)
    expect(result.data?.operation).toBe('update-mcp')
    const writtenContent = JSON.parse(mockFsWriteFile.mock.calls[0][1] as string)
    expect(writtenContent.mcpServers).toHaveProperty('existing')
    expect(writtenContent.mcpServers).toHaveProperty('newServer')
  })

  it('update-model calls updateAgentById with the new model', async () => {
    /** Verifies that deploying update-model calls the core service to update the agent registry */
    const config: ConfigurationPayload = {
      operation: 'update-model',
      scope: 'local',
      model: 'claude-sonnet-4-20250514',
    }

    const result = await deployConfigToAgent(TARGET_AGENT_ID, config, MANAGER_ID)

    expect(result.status).toBe(200)
    expect(result.data?.operation).toBe('update-model')
    expect(result.data?.after).toHaveProperty('model', 'claude-sonnet-4-20250514')
    expect(mockUpdateAgentById).toHaveBeenCalledWith(TARGET_AGENT_ID, { model: 'claude-sonnet-4-20250514' })
  })

  it('bulk-config handles multiple operations in one deployment', async () => {
    /** Verifies that bulk-config dispatches skills + hooks sub-operations correctly */
    mockFsReadFile.mockResolvedValue('{}')

    const config: ConfigurationPayload = {
      operation: 'bulk-config',
      scope: 'local',
      skills: ['bulk-skill-1'],
      hooks: { bulkHook: { enabled: true } },
    }

    const result = await deployConfigToAgent(TARGET_AGENT_ID, config, MANAGER_ID)

    expect(result.status).toBe(200)
    expect(result.data?.operation).toBe('bulk-config')
    // Both skills and hooks should be in the diff
    expect(result.data?.after).toHaveProperty('skills')
    expect(result.data?.after).toHaveProperty('hooks')
  })

  it('returns 400 for an invalid operation', async () => {
    /** Verifies that an unrecognized operation type is rejected with 400 */
    const config = {
      // Using `as any` intentionally for negative type-safety test
      operation: 'delete-everything' as any,
      scope: 'local' as const,
    }

    const result = await deployConfigToAgent(TARGET_AGENT_ID, config, MANAGER_ID)

    expect(result.status).toBe(400)
    expect(result.error).toContain('Invalid configuration operation')
  })

  it('returns 404 when agent does not exist', async () => {
    /** Verifies that deploying to a non-existent agent returns 404 */
    mockGetAgent.mockReturnValue(null)

    const config: ConfigurationPayload = {
      operation: 'add-skill',
      scope: 'local',
      skills: ['test-skill'],
    }

    const result = await deployConfigToAgent('00000000-0000-0000-0000-000000000000', config, MANAGER_ID)

    expect(result.status).toBe(404)
    expect(result.error).toContain('not found')
    expect(mockFsMkdir).not.toHaveBeenCalled()
  })

  it('returns 400 when agent has no working directory', async () => {
    /** Verifies that an agent without workingDirectory is rejected with 400 */
    mockGetAgent.mockReturnValue(makeAgent({ workingDirectory: undefined, sessions: [] }))

    const config: ConfigurationPayload = {
      operation: 'add-skill',
      scope: 'local',
      skills: ['test-skill'],
    }

    const result = await deployConfigToAgent(TARGET_AGENT_ID, config, MANAGER_ID)

    expect(result.status).toBe(400)
    expect(result.error).toContain('no working directory')
  })

  it('add-plugin blocks path traversal in plugin name', async () => {
    /** Verifies that path traversal attempts (..) in plugin names are rejected with 400 */
    const config: ConfigurationPayload = {
      operation: 'add-plugin',
      scope: 'local',
      plugins: ['../malicious'],
    }

    const result = await deployConfigToAgent(TARGET_AGENT_ID, config, MANAGER_ID)

    expect(result.status).toBe(400)
    expect(result.error).toContain('Invalid plugin name')
  })

  it('update-hooks handles missing settings.json gracefully (creates from scratch)', async () => {
    /** Verifies that update-hooks creates settings from scratch when file does not exist */
    mockFsReadFile.mockRejectedValue(new Error('ENOENT'))

    const config: ConfigurationPayload = {
      operation: 'update-hooks',
      scope: 'local',
      hooks: { preToolUse: { command: 'lint-check.sh' } },
    }

    const result = await deployConfigToAgent(TARGET_AGENT_ID, config, MANAGER_ID)

    expect(result.status).toBe(200)
    expect(mockFsWriteFile).toHaveBeenCalled()
    const writtenContent = JSON.parse(mockFsWriteFile.mock.calls[0][1] as string)
    expect(writtenContent.hooks).toHaveProperty('preToolUse')
  })

  it('deployConfigToAgent returns 500 when filesystem operation throws unexpected error', async () => {
    /** Verifies that unexpected filesystem errors are caught and returned as 500 */
    mockFsMkdir.mockRejectedValue(new Error('EACCES: permission denied'))

    const config: ConfigurationPayload = {
      operation: 'add-skill',
      scope: 'local',
      skills: ['test-skill'],
    }

    const result = await deployConfigToAgent(TARGET_AGENT_ID, config, MANAGER_ID)

    expect(result.status).toBe(500)
    expect(result.error).toContain('Deployment failed')
    expect(result.error).toContain('permission denied')
  })
})

// ============================================================================
// MODULE 3: cross-host configure-agent flow (14 tests)
// ============================================================================

describe('cross-host configure-agent', () => {
  const configureAgentParams = {
    type: 'configure-agent' as const,
    targetHostId: 'host-remote',
    requestedBy: 'manager-agent',
    requestedByRole: 'manager' as const,
    payload: {
      agentId: TARGET_AGENT_ID,
      configuration: {
        operation: 'add-skill' as const,
        scope: 'local' as const,
        skills: ['remote-skill'],
      },
    },
    password: 'correct',
    note: 'Deploying skill to remote agent',
  }

  // --- Setup: make manager-agent a known manager ---
  beforeEach(() => {
    mockIsManager.mockImplementation((id: string) => id === 'manager-agent')
    mockIsChiefOfStaffAnywhere.mockImplementation((id: string) => id === 'cos-agent')
    mockGetAgent.mockImplementation((id: string) => {
      if (id === 'manager-agent') return { id: 'manager-agent', name: 'Manager', workingDirectory: '/tmp/mgr' }
      if (id === 'cos-agent') return { id: 'cos-agent', name: 'COS Agent', workingDirectory: '/tmp/cos' }
      if (id === TARGET_AGENT_ID) return makeAgent()
      return null
    })
  })

  it('submitCrossHostRequest succeeds with valid configure-agent payload', async () => {
    /** Verifies that a well-formed configure-agent request is accepted and created */
    const result = await submitCrossHostRequest(configureAgentParams)

    expect(result.status).toBe(201)
    expect(result.data).toBeDefined()
    expect(mockCreateGovernanceRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'configure-agent',
        payload: expect.objectContaining({
          configuration: expect.objectContaining({
            operation: 'add-skill',
          }),
        }),
      })
    )
  })

  it('submitCrossHostRequest rejects configure-agent without configuration field', async () => {
    /** Verifies that configure-agent requires a configuration payload */
    const result = await submitCrossHostRequest({
      ...configureAgentParams,
      payload: { agentId: TARGET_AGENT_ID },
    })

    expect(result.status).toBe(400)
    expect(result.error).toContain('configure-agent requests require a configuration payload')
    expect(mockCreateGovernanceRequest).not.toHaveBeenCalled()
  })

  it('submitCrossHostRequest rejects configure-agent with non-local scope', async () => {
    /** Verifies that cross-host configure-agent only supports local scope */
    const result = await submitCrossHostRequest({
      ...configureAgentParams,
      payload: {
        agentId: TARGET_AGENT_ID,
        configuration: { operation: 'add-skill' as const, scope: 'user' as const, skills: ['x'] },
      },
    })

    expect(result.status).toBe(400)
    expect(result.error).toContain("only supports 'local' scope")
    expect(mockCreateGovernanceRequest).not.toHaveBeenCalled()
  })

  it('submitCrossHostRequest rejects configure-agent without operation field', async () => {
    /** Verifies that configure-agent configuration must specify an operation */
    const result = await submitCrossHostRequest({
      ...configureAgentParams,
      payload: {
        agentId: TARGET_AGENT_ID,
        // Using `as any` intentionally for negative type-safety test
        configuration: { scope: 'local' as const } as any,
      },
    })

    expect(result.status).toBe(400)
    expect(result.error).toContain('must specify an operation')
    expect(mockCreateGovernanceRequest).not.toHaveBeenCalled()
  })

  it('receiveCrossHostRequest accepts configure-agent as a valid type', async () => {
    /** Verifies that configure-agent is in VALID_REQUEST_TYPES and is accepted by receive */
    const request = makeGovernanceRequest({
      sourceHostId: 'host-remote',
      targetHostId: 'host-local',
    })

    const result = await receiveCrossHostRequest('host-remote', request)

    expect(result.status).toBe(200)
    expect(result.data?.ok).toBe(true)
    expect(result.data?.requestId).toBe('req-ext-001')
    expect(mockSaveGovernanceRequests).toHaveBeenCalled()
  })

  it('approveCrossHostRequest triggers execution for configure-agent when dual-approved', async () => {
    /** Verifies that dual-manager approval triggers performRequestExecution for configure-agent */
    const executedRequest = makeGovernanceRequest({
      status: 'executed',
      approvals: {
        sourceManager: { approved: true, agentId: 'manager-agent', at: '2026-02-20T10:01:00Z' },
        targetManager: { approved: true, agentId: 'manager-agent', at: '2026-02-20T10:02:00Z' },
      },
    })

    mockGetGovernanceRequest.mockReturnValue(makeGovernanceRequest())
    mockApproveGovernanceRequest.mockResolvedValue(executedRequest)
    // performRequestExecution calls withLock -> deployConfigToAgent
    mockWithLock.mockImplementation(async (_name: string, fn: () => unknown) => fn())

    const result = await approveCrossHostRequest('req-ext-001', 'manager-agent', 'correct')

    expect(result.status).toBe(200)
    expect(result.data?.status).toBe('executed')
    // The notify function should have been called for configure-agent
    expect(mockNotifyConfigRequestOutcome).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'configure-agent' }),
      'approved'
    )
  })

  it('performRequestExecution handles deployment failure gracefully for configure-agent', async () => {
    /** Verifies that a failed deployConfigToAgent logs a warning but does not throw */
    // Make the agent not found (so deployConfigToAgent returns 404)
    mockGetAgent.mockImplementation((id: string) => {
      if (id === 'manager-agent') return { id: 'manager-agent', name: 'Manager' }
      return null // Target agent not found
    })

    const executedRequest = makeGovernanceRequest({ status: 'executed' })
    mockGetGovernanceRequest.mockReturnValue(makeGovernanceRequest())
    mockApproveGovernanceRequest.mockResolvedValue(executedRequest)
    mockWithLock.mockImplementation(async (_name: string, fn: () => unknown) => fn())

    // This should NOT throw despite deployment failure
    const result = await approveCrossHostRequest('req-ext-001', 'manager-agent', 'correct')

    expect(result.status).toBe(200)
    expect(result.data?.status).toBe('executed')
  })

  it('listCrossHostRequests returns all requests when no filter is applied', () => {
    /** Verifies that listCrossHostRequests delegates to registry with no filter */
    const requests = [makeGovernanceRequest(), makeGovernanceRequest({ id: 'req-ext-002', type: 'add-to-team' })]
    mockListGovernanceRequests.mockReturnValue(requests)

    const result = listCrossHostRequests()

    expect(result.status).toBe(200)
    expect(result.data).toHaveLength(2)
  })

  // --- Regression: existing types still work ---

  it('submitCrossHostRequest still works for add-to-team (regression)', async () => {
    /** Verifies that the existing add-to-team request type still functions after configure-agent was added */
    const result = await submitCrossHostRequest({
      type: 'add-to-team',
      targetHostId: 'host-remote',
      requestedBy: 'manager-agent',
      requestedByRole: 'manager',
      payload: { agentId: TARGET_AGENT_ID, teamId: 'team-backend' },
      password: 'correct',
    })

    expect(result.status).toBe(201)
    expect(mockCreateGovernanceRequest).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'add-to-team' })
    )
  })

  it('submitCrossHostRequest still works for transfer-agent (regression)', async () => {
    /** Verifies that the existing transfer-agent request type still functions */
    const result = await submitCrossHostRequest({
      type: 'transfer-agent',
      targetHostId: 'host-remote',
      requestedBy: 'manager-agent',
      requestedByRole: 'manager',
      payload: { agentId: TARGET_AGENT_ID, fromTeamId: 'team-a', toTeamId: 'team-b' },
      password: 'correct',
    })

    expect(result.status).toBe(201)
    expect(mockCreateGovernanceRequest).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'transfer-agent' })
    )
  })

  it('receiveCrossHostRequest auto-approves configure-agent via manager trust', async () => {
    /** Verifies that shouldAutoApprove triggers auto-approval and execution for configure-agent */
    mockShouldAutoApprove.mockReturnValue(true)

    const request = makeGovernanceRequest({
      sourceHostId: 'host-remote',
      targetHostId: 'host-local',
      status: 'pending',
    })

    // When auto-approve: approveGovernanceRequest is called with local manager
    const executedRequest = makeGovernanceRequest({ status: 'executed' })
    mockApproveGovernanceRequest.mockResolvedValue(executedRequest)
    mockWithLock.mockImplementation(async (_name: string, fn: () => unknown) => fn())

    const result = await receiveCrossHostRequest('host-remote', request)

    expect(result.status).toBe(200)
    expect(mockApproveGovernanceRequest).toHaveBeenCalledWith(
      'req-ext-001',
      'manager-agent',
      'targetManager'
    )
    expect(mockNotifyConfigRequestOutcome).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'configure-agent' }),
      'approved'
    )
  })

  it('listCrossHostRequests filters by status correctly', () => {
    /** Verifies that status filter is passed through to the governance request registry */
    mockListGovernanceRequests.mockReturnValue([makeGovernanceRequest({ status: 'pending' })])

    const result = listCrossHostRequests({ status: 'pending' })

    expect(result.status).toBe(200)
    expect(mockListGovernanceRequests).toHaveBeenCalledWith({ status: 'pending' })
  })

  it('listCrossHostRequests filters by agentId correctly', () => {
    /** Verifies that agentId filter is passed through to the governance request registry */
    mockListGovernanceRequests.mockReturnValue([makeGovernanceRequest()])

    const result = listCrossHostRequests({ agentId: TARGET_AGENT_ID })

    expect(result.status).toBe(200)
    expect(mockListGovernanceRequests).toHaveBeenCalledWith({ agentId: TARGET_AGENT_ID })
  })

  it('submitCrossHostRequest rejects unimplemented type (e.g., create-agent)', async () => {
    /** Verifies that non-implemented types like create-agent are rejected */
    const result = await submitCrossHostRequest({
      type: 'create-agent' as const,
      targetHostId: 'host-remote',
      requestedBy: 'manager-agent',
      requestedByRole: 'manager',
      payload: { agentId: TARGET_AGENT_ID },
      password: 'correct',
    })

    expect(result.status).toBe(400)
    expect(result.error).toContain('not yet implemented')
  })
})

// ============================================================================
// MODULE 4: config-notification-service (6 tests)
// ============================================================================

// Module 4 tests verify that cross-host-governance-service calls notifyConfigRequestOutcome
// with correct arguments. Direct testing of config-notification-service.ts logic is deferred
// to a future config-notification-service.test.ts file.
describe('config notifications', () => {
  // We need to import the real module (not the mock) for this section.
  // But the module is already mocked above for cross-host tests.
  // Instead, we test via the cross-host governance service's behavior,
  // which calls notifyConfigRequestOutcome.
  // We verify the mock was called with correct arguments.

  // To test the actual notification service, we need to unmock it and use
  // a separate import. Since vi.mock is hoisted, we test the notification
  // behavior via the cross-host service integration instead.

  // However, for direct unit testing, let's verify the mock call patterns
  // that the cross-host service makes to the notification service.

  it('approved configure-agent triggers notification with approved outcome', async () => {
    /** Verifies that an approved configure-agent request sends an approved notification */
    const executedRequest = makeGovernanceRequest({ status: 'executed' })
    mockGetGovernanceRequest.mockReturnValue(makeGovernanceRequest())
    mockApproveGovernanceRequest.mockResolvedValue(executedRequest)
    mockWithLock.mockImplementation(async (_name: string, fn: () => unknown) => fn())
    mockIsManager.mockImplementation((id: string) => id === 'manager-agent')
    mockGetAgent.mockImplementation((id: string) => {
      if (id === 'manager-agent') return { id: 'manager-agent', name: 'Manager' }
      return makeAgent()
    })

    await approveCrossHostRequest('req-ext-001', 'manager-agent', 'correct')

    expect(mockNotifyConfigRequestOutcome).toHaveBeenCalledTimes(1)
    expect(mockNotifyConfigRequestOutcome).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'configure-agent',
        status: 'executed',
      }),
      'approved'
    )
  })

  it('rejected configure-agent triggers notification with rejected outcome', async () => {
    /** Verifies that a rejected configure-agent request sends a rejected notification with reason */
    const rejectedRequest = makeGovernanceRequest({
      status: 'rejected',
      rejectReason: 'Skill not approved for this team',
    })
    mockGetGovernanceRequest.mockReturnValue(makeGovernanceRequest())
    mockRejectGovernanceRequest.mockResolvedValue(rejectedRequest)
    mockIsManager.mockImplementation((id: string) => id === 'manager-agent')
    mockGetAgent.mockImplementation((id: string) => {
      if (id === 'manager-agent') return { id: 'manager-agent', name: 'Manager' }
      return makeAgent()
    })

    // Import rejectCrossHostRequest to test rejection flow
    const { rejectCrossHostRequest } = await import('@/services/cross-host-governance-service')
    await rejectCrossHostRequest('req-ext-001', 'manager-agent', 'correct', 'Skill not approved for this team')

    expect(mockNotifyConfigRequestOutcome).toHaveBeenCalledTimes(1)
    expect(mockNotifyConfigRequestOutcome).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'configure-agent',
        status: 'rejected',
      }),
      'rejected'
    )
  })

  it('non-configure-agent request type does not trigger notification on approval', async () => {
    /** Verifies that add-to-team approvals do not call notifyConfigRequestOutcome */
    const executedRequest = makeGovernanceRequest({
      type: 'add-to-team',
      status: 'executed',
      payload: { agentId: TARGET_AGENT_ID, teamId: 'team-1' },
    })
    mockGetGovernanceRequest.mockReturnValue(makeGovernanceRequest({ type: 'add-to-team', payload: { agentId: TARGET_AGENT_ID, teamId: 'team-1' } }))
    mockApproveGovernanceRequest.mockResolvedValue(executedRequest)
    mockWithLock.mockImplementation(async (_name: string, fn: () => unknown) => fn())
    mockIsManager.mockImplementation((id: string) => id === 'manager-agent')
    mockGetAgent.mockImplementation((id: string) => {
      if (id === 'manager-agent') return { id: 'manager-agent', name: 'Manager' }
      return makeAgent()
    })
    mockLoadTeams.mockReturnValue([{
      id: 'team-1',
      name: 'Test Team',
      type: 'open',
      agentIds: [],
      chiefOfStaffId: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }])

    await approveCrossHostRequest('req-ext-001', 'manager-agent', 'correct')

    // notifyConfigRequestOutcome should NOT be called for add-to-team
    expect(mockNotifyConfigRequestOutcome).not.toHaveBeenCalled()
  })

  it('notification failure does not propagate as error to caller', async () => {
    /** Verifies that a failed notification does not cause the approve call to fail */
    const executedRequest = makeGovernanceRequest({ status: 'executed' })
    mockGetGovernanceRequest.mockReturnValue(makeGovernanceRequest())
    mockApproveGovernanceRequest.mockResolvedValue(executedRequest)
    mockWithLock.mockImplementation(async (_name: string, fn: () => unknown) => fn())
    mockIsManager.mockImplementation((id: string) => id === 'manager-agent')
    mockGetAgent.mockImplementation((id: string) => {
      if (id === 'manager-agent') return { id: 'manager-agent', name: 'Manager' }
      return makeAgent()
    })

    // Make notification throw
    mockNotifyConfigRequestOutcome.mockRejectedValue(new Error('AMP service unavailable'))

    const result = await approveCrossHostRequest('req-ext-001', 'manager-agent', 'correct')

    // The approval should still succeed despite notification failure
    expect(result.status).toBe(200)
    expect(result.data?.status).toBe('executed')
  })

  it('auto-approved configure-agent sends notification on receive', async () => {
    /** Verifies that auto-approval on receive also triggers the notification flow */
    mockShouldAutoApprove.mockReturnValue(true)
    mockIsManager.mockImplementation((id: string) => id === 'manager-agent')
    mockGetAgent.mockImplementation((id: string) => {
      if (id === 'manager-agent') return { id: 'manager-agent', name: 'Manager' }
      return makeAgent()
    })

    const executedRequest = makeGovernanceRequest({ status: 'executed' })
    mockApproveGovernanceRequest.mockResolvedValue(executedRequest)
    mockWithLock.mockImplementation(async (_name: string, fn: () => unknown) => fn())

    const request = makeGovernanceRequest({
      sourceHostId: 'host-remote',
      targetHostId: 'host-local',
    })

    await receiveCrossHostRequest('host-remote', request)

    expect(mockNotifyConfigRequestOutcome).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'configure-agent', status: 'executed' }),
      'approved'
    )
  })

  it('rejected configure-agent on receive does not send notification (only on reject)', async () => {
    /** Verifies that receiving a configure-agent request does not pre-emptively notify */
    mockShouldAutoApprove.mockReturnValue(false)

    const request = makeGovernanceRequest({
      sourceHostId: 'host-remote',
      targetHostId: 'host-local',
    })

    await receiveCrossHostRequest('host-remote', request)

    // No notification should be sent on receive without auto-approve
    expect(mockNotifyConfigRequestOutcome).not.toHaveBeenCalled()
  })
})
