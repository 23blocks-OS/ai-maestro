/**
 * Unit tests for sanitizeTeamName and validateTeamMutation from lib/team-registry.ts
 *
 * Coverage: 18 tests covering name sanitization, name validation, duplicate checks,
 * type validation, COS rules, COS removal guard, and multi-closed-team constraints.
 *
 * These are PURE functions - no I/O. Only module-level imports (fs, uuid, file-lock)
 * need mocking to allow the module to load.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ============================================================================
// Mocks — needed for module loading, not for the functions under test
// ============================================================================

vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(() => false),
    mkdirSync: vi.fn(),
    readFileSync: vi.fn(() => { throw new Error('not found') }),
    writeFileSync: vi.fn(),
  },
}))

vi.mock('uuid', () => ({ v4: vi.fn(() => 'test-uuid') }))

vi.mock('@/lib/file-lock', () => ({
  withLock: vi.fn((_name: string, fn: () => unknown) => Promise.resolve(fn())),
}))

// ============================================================================
// Import functions under test (after mocks)
// ============================================================================

import { sanitizeTeamName, validateTeamMutation } from '@/lib/team-registry'
import type { Team } from '@/types/team'

// ============================================================================
// Test helpers
// ============================================================================

/** Build a Team object with sensible defaults, overridable for each scenario */
function makeTeam(overrides: Partial<Team> = {}): Team {
  return {
    id: 'team-default',
    name: 'Default Team',
    type: 'closed' as const,
    agentIds: [],
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  }
}

// ============================================================================
// Cleanup
// ============================================================================

beforeEach(() => {
  vi.clearAllMocks()
})

// ============================================================================
// sanitizeTeamName (3 tests)
// ============================================================================

describe('sanitizeTeamName', () => {
  it('strips control characters and trims leading/trailing whitespace', () => {
    /** Verifies that ASCII control chars (0x00-0x1F, 0x7F) are removed and edges trimmed */
    const input = '  \x00Hello\x1FWorld\x7F  '
    const result = sanitizeTeamName(input)
    expect(result).toBe('HelloWorld')
  })

  it('collapses multiple spaces into a single space', () => {
    /** Verifies internal whitespace runs (spaces, tabs, newlines) become one space */
    const input = 'Alpha   \t  Beta  \n  Gamma'
    const result = sanitizeTeamName(input)
    expect(result).toBe('Alpha Beta Gamma')
  })

  it('returns empty string for whitespace-only input', () => {
    /** Verifies that input with only spaces/tabs/newlines collapses to empty after trim */
    const result = sanitizeTeamName('   \t  \n  ')
    expect(result).toBe('')
  })
})

// ============================================================================
// validateTeamMutation (12 tests)
// ============================================================================

describe('validateTeamMutation', () => {
  // --- Name validation (4 tests) ---

  describe('name validation', () => {
    it('rejects names shorter than 4 characters after sanitization', () => {
      /** Names under 4 chars violate the TEAM_NAME_MIN_LENGTH constant */
      const result = validateTeamMutation([], null, { name: 'AB' }, null)
      expect(result).toEqual({
        valid: false,
        error: 'Team name must be at least 4 characters',
        code: 400,
      })
    })

    it('rejects names longer than 64 characters', () => {
      /** Names over 64 chars violate the TEAM_NAME_MAX_LENGTH constant */
      const longName = 'A' + 'x'.repeat(64) // 65 chars total
      const result = validateTeamMutation([], null, { name: longName }, null)
      expect(result).toEqual({
        valid: false,
        error: 'Team name must be at most 64 characters',
        code: 400,
      })
    })

    it('rejects names not starting with a letter or number', () => {
      /** First character must match /^[a-zA-Z0-9]/ after sanitization */
      const result = validateTeamMutation([], null, { name: '-InvalidStart' }, null)
      expect(result).toEqual({
        valid: false,
        error: 'Team name must start with a letter or number',
        code: 400,
      })
    })

    it('rejects names with invalid characters like angle brackets', () => {
      /** Only letters, digits, spaces, hyphens, underscores, dots, ampersands, parens are allowed */
      const result = validateTeamMutation([], null, { name: 'Team<script>' }, null)
      expect(result).toEqual({
        valid: false,
        error: expect.stringContaining('invalid characters'),
        code: 400,
      })
    })
  })

  // --- Duplicate checks (2 tests) ---

  describe('duplicate checks', () => {
    it('rejects duplicate team name with case-insensitive comparison (R2.1/R2.3)', () => {
      /** A team named "Alpha Squad" already exists, creating "alpha squad" should fail */
      const existingTeams = [makeTeam({ id: 'team-1', name: 'Alpha Squad' })]
      const result = validateTeamMutation(existingTeams, null, { name: 'alpha squad' }, null)
      expect(result).toEqual({
        valid: false,
        error: 'A team named "Alpha Squad" already exists',
        code: 409,
      })
    })

    it('rejects team name that collides with a reserved agent name', () => {
      /** reservedNames parameter blocks team names that match existing agent names */
      const reservedNames = ['backend-api', 'Frontend Worker']
      const result = validateTeamMutation(
        [],
        null,
        { name: 'Backend-API' },
        null,
        reservedNames,
      )
      expect(result).toEqual({
        valid: false,
        error: 'Name "backend-api" is already used by an agent',
        code: 409,
      })
    })
  })

  // --- Type validation (2 tests) ---

  describe('type validation', () => {
    it('ignores invalid team type values after governance simplification (type field is ignored)', () => {
      /** Type field is ignored post-simplification — all teams are closed regardless of input */
      const result = validateTeamMutation([], null, { name: 'ValidTeam', type: 'hybrid' }, null)
      expect(result).toEqual({
        valid: true,
        sanitized: { name: 'ValidTeam' },
      })
    })

    it('accepts closed team without COS (all teams are closed after governance simplification)', () => {
      /** All teams are now closed by default - no auto-downgrade to open */
      const result = validateTeamMutation(
        [],
        null,
        { name: 'SecureTeam', type: 'closed', agentIds: ['agent-1'] },
        null,
      )
      expect(result).toEqual({
        valid: true,
        sanitized: {
          name: 'SecureTeam',
        },
      })
    })
  })

  // --- COS rules (2 tests) ---

  describe('COS rules', () => {
    it('accepts assigning a COS on a closed team', () => {
      /** All teams are closed now; COS assignment should be valid. Sanitized includes chiefOfStaffId (SF-034). */
      const result = validateTeamMutation(
        [],
        null,
        { name: 'ClosedTeam', type: 'closed', chiefOfStaffId: 'agent-cos' },
        null,
      )
      expect(result).toEqual({
        valid: true,
        sanitized: {
          name: 'ClosedTeam',
          agentIds: ['agent-cos'],
          chiefOfStaffId: 'agent-cos',
        },
      })
    })

    it('auto-adds COS to agentIds in the sanitized output when COS is not a member (R4.6)', () => {
      /** If COS is not in agentIds, validateTeamMutation should add them via sanitized.agentIds. Sanitized includes chiefOfStaffId (SF-034). */
      const result = validateTeamMutation(
        [],
        null,
        {
          name: 'ClosedTeam',
          type: 'closed',
          chiefOfStaffId: 'agent-cos',
          agentIds: ['agent-1', 'agent-2'],
        },
        null,
      )
      expect(result).toEqual({
        valid: true,
        sanitized: {
          name: 'ClosedTeam',
          agentIds: ['agent-1', 'agent-2', 'agent-cos'],
          chiefOfStaffId: 'agent-cos',
        },
      })
    })
  })

  // --- COS removal guard (1 test) ---

  describe('COS removal guard', () => {
    it('rejects removing the COS from agentIds without removing the COS role first (R4.7)', () => {
      /** An update that drops the COS agent from agentIds while keeping chiefOfStaffId must fail */
      const existingTeams = [
        makeTeam({
          id: 'team-closed',
          name: 'Closed Team',
          type: 'closed',
          chiefOfStaffId: 'cos-agent-id',
          agentIds: ['cos-agent-id', 'agent-1', 'agent-2'],
        }),
      ]
      // Update agentIds to exclude the COS but do NOT change chiefOfStaffId
      const result = validateTeamMutation(
        existingTeams,
        'team-closed',
        { agentIds: ['agent-1', 'agent-2'] },
        null,
      )
      expect(result).toEqual({
        valid: false,
        error: expect.stringContaining('Cannot remove the Chief-of-Staff from team members'),
        code: 400,
      })
    })
  })

  // --- Multi-closed-team constraint (4 tests) ---

  describe('multi-closed-team constraint', () => {
    it('rejects a normal agent that is already in another team (R4.1, single-team membership)', () => {
      /** Normal agents can only belong to one team at a time (all teams are closed after governance simplification) */
      const existingTeams = [
        makeTeam({
          id: 'team-existing',
          name: 'Existing Closed',
          type: 'closed',
          chiefOfStaffId: 'agent-cos-existing',
          agentIds: ['agent-cos-existing', 'agent-normal'],
        }),
      ]
      const result = validateTeamMutation(
        existingTeams,
        null,
        {
          name: 'New Closed Team',
          type: 'closed',
          chiefOfStaffId: 'agent-cos-new',
          agentIds: ['agent-cos-new', 'agent-normal'],
        },
        null,
      )
      expect(result).toEqual({
        valid: false,
        error: 'Agent agent-normal is already in team "Existing Closed". Remove from that team first.',
        code: 409,
      })
    })

    it('allows the MANAGER agent to be in multiple teams (R4.3)', () => {
      /** MANAGER role is exempt from the single-team membership constraint. Sanitized includes chiefOfStaffId (SF-034). */
      const managerId = 'agent-manager'
      const existingTeams = [
        makeTeam({
          id: 'team-existing',
          name: 'Existing Closed',
          type: 'closed',
          chiefOfStaffId: 'agent-cos-existing',
          agentIds: ['agent-cos-existing', managerId],
        }),
      ]
      const result = validateTeamMutation(
        existingTeams,
        null,
        {
          name: 'New Closed Team',
          type: 'closed',
          chiefOfStaffId: 'agent-cos-new',
          agentIds: ['agent-cos-new', managerId],
        },
        managerId,
      )
      expect(result).toEqual({
        valid: true,
        sanitized: { name: 'New Closed Team', chiefOfStaffId: 'agent-cos-new' },
      })
    })

    it('rejects COS agent already in another team (G2: single-team membership, v2 Rule 21)', () => {
      /** G2: COS is NOT exempt from single-team membership constraint — max 1 team */
      const cosAgentId = 'agent-promoted-cos'
      const existingTeams = [
        makeTeam({
          id: 'team-existing',
          name: 'Existing Closed',
          type: 'closed',
          chiefOfStaffId: 'agent-cos-existing',
          agentIds: ['agent-cos-existing', cosAgentId],
        }),
      ]
      const result = validateTeamMutation(
        existingTeams,
        null,
        {
          name: 'New Closed Team',
          type: 'closed',
          chiefOfStaffId: cosAgentId,
          agentIds: [cosAgentId, 'agent-other'],
        },
        null,
      )
      expect(result).toEqual({
        valid: false,
        error: 'Agent agent-promoted-cos is already in team "Existing Closed". Remove from that team first.',
        code: 409,
      })
    })

    it('rejects agent who is COS elsewhere from joining a new team (G2: single-team membership)', () => {
      /** G2: An agent already COS of one team cannot join another team (single-team membership) */
      const cosElsewhere = 'agent-cos-elsewhere'
      const existingTeams = [
        makeTeam({
          id: 'team-other',
          name: 'Other Closed',
          type: 'closed',
          chiefOfStaffId: cosElsewhere,
          agentIds: [cosElsewhere],
        }),
      ]
      const result = validateTeamMutation(
        existingTeams,
        null,
        {
          name: 'New Closed Team',
          type: 'closed',
          chiefOfStaffId: 'agent-new-cos',
          agentIds: ['agent-new-cos', cosElsewhere],
        },
        null,
      )
      expect(result).toEqual({
        valid: false,
        error: 'Agent agent-cos-elsewhere is already in team "Other Closed". Remove from that team first.',
        code: 409,
      })
    })
  })
})
