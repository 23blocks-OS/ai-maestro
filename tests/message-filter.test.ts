import { vi, describe, it, expect, beforeEach } from 'vitest'

// ============================================================================
// Mocks — external dependencies: @/lib/governance and @/lib/team-registry
// ============================================================================

const mockLoadGovernance = vi.fn(() => ({
  version: 1 as const,
  managerId: null as string | null,
  passwordHash: null as string | null,
  passwordSetAt: null as string | null,
}))

const mockLoadTeams = vi.fn(() => [] as ReturnType<typeof makeClosedTeam>[])

vi.mock('@/lib/governance', () => ({
  loadGovernance: () => mockLoadGovernance(),
}))

vi.mock('@/lib/team-registry', () => ({
  loadTeams: () => mockLoadTeams(),
}))

// ============================================================================
// Import module under test (after mocks)
// ============================================================================

import { checkMessageAllowed } from '@/lib/message-filter'

// ============================================================================
// Helpers
// ============================================================================

/** Build a minimal closed-team object for mock return values */
function makeClosedTeam(id: string, agentIds: string[], cosId?: string) {
  return {
    id,
    name: `Team ${id}`,
    type: 'closed' as const,
    agentIds,
    chiefOfStaffId: cosId || null,
    createdAt: '',
    updatedAt: '',
  }
}

// UUID-like agent identifiers — required because Step 1b rejects non-UUID
// recipients from closed-team senders to prevent alias-based bypass.
const MANAGER    = 'a0000000-0000-0000-0000-000000000001'
const COS_ALPHA  = 'b0000000-0000-0000-0000-000000000001'
const COS_BETA   = 'b0000000-0000-0000-0000-000000000002'
const COS_MULTI  = 'b0000000-0000-0000-0000-000000000003'
const MEMBER_A1  = 'c0000000-0000-0000-0000-000000000001'
const MEMBER_A2  = 'c0000000-0000-0000-0000-000000000002'
const MEMBER_B1  = 'c0000000-0000-0000-0000-000000000003'
const AGENT_X    = 'c0000000-0000-0000-0000-000000000004'
const AGENT_Y    = 'c0000000-0000-0000-0000-000000000005'
const OUTSIDER   = 'd0000000-0000-0000-0000-000000000001'
const OPEN_A     = 'e0000000-0000-0000-0000-000000000001'
const OPEN_B     = 'e0000000-0000-0000-0000-000000000002'
const OUTSIDE_SENDER = 'f0000000-0000-0000-0000-000000000001'

// ============================================================================
// Tests — 15 scenarios covering all branches of checkMessageAllowed
// ============================================================================

describe('checkMessageAllowed', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.restoreAllMocks()
    mockLoadGovernance.mockReturnValue({ version: 1 as const, managerId: null, passwordHash: null, passwordSetAt: null })
    mockLoadTeams.mockReturnValue([])
  })

  it('allows mesh-forwarded messages when senderAgentId is null and recipient not in closed team', () => {
    /** Mesh-forwarded messages (null sender) to open-world recipients are trusted — step 1 */
    const result = checkMessageAllowed({
      senderAgentId: null,
      recipientAgentId: OPEN_A,
    })
    expect(result.allowed).toBe(true)
    expect(result.reason).toBeUndefined()
  })

  it('allows messages when neither sender nor recipient is in a closed team', () => {
    /** Open world: both agents outside closed teams can message freely — step 2 (R6.4) */
    mockLoadTeams.mockReturnValue([])

    const result = checkMessageAllowed({
      senderAgentId: OPEN_A,
      recipientAgentId: OPEN_B,
    })
    expect(result.allowed).toBe(true)
    expect(result.reason).toBeUndefined()
  })

  it('allows messages when sender is MANAGER regardless of teams', () => {
    /** MANAGER can message anyone — step 3 (R6.3) */
    const teamAlpha = makeClosedTeam('alpha', [COS_ALPHA, MEMBER_A1], COS_ALPHA)

    mockLoadTeams.mockReturnValue([teamAlpha])
    mockLoadGovernance.mockReturnValue({ version: 1 as const, managerId: MANAGER, passwordHash: null, passwordSetAt: null })

    const result = checkMessageAllowed({
      senderAgentId: MANAGER,
      recipientAgentId: MEMBER_A1,
    })
    expect(result.allowed).toBe(true)
    expect(result.reason).toBeUndefined()
  })

  it('allows COS to message the MANAGER', () => {
    /** Chief-of-Staff can always reach the MANAGER — step 4, branch 1 (R6.2) */
    const teamAlpha = makeClosedTeam('alpha', [COS_ALPHA, MEMBER_A1], COS_ALPHA)

    mockLoadTeams.mockReturnValue([teamAlpha])
    mockLoadGovernance.mockReturnValue({ version: 1 as const, managerId: MANAGER, passwordHash: null, passwordSetAt: null })

    const result = checkMessageAllowed({
      senderAgentId: COS_ALPHA,
      recipientAgentId: MANAGER,
    })
    expect(result.allowed).toBe(true)
    expect(result.reason).toBeUndefined()
  })

  it('allows COS to message another COS (COS-to-COS bridge)', () => {
    /** Any COS can message any other COS — step 4, branch 2 (R6.2) */
    const teamAlpha = makeClosedTeam('alpha', [COS_ALPHA, MEMBER_A1], COS_ALPHA)
    const teamBeta = makeClosedTeam('beta', [COS_BETA, MEMBER_B1], COS_BETA)

    mockLoadTeams.mockReturnValue([teamAlpha, teamBeta])
    mockLoadGovernance.mockReturnValue({ version: 1 as const, managerId: null, passwordHash: null, passwordSetAt: null })

    const result = checkMessageAllowed({
      senderAgentId: COS_ALPHA,
      recipientAgentId: COS_BETA,
    })
    expect(result.allowed).toBe(true)
    expect(result.reason).toBeUndefined()
  })

  it('allows COS to message a member of their own closed team', () => {
    /** COS can reach members of any of their closed teams — step 4, branch 3 (R6.7) */
    const teamAlpha = makeClosedTeam('alpha', [COS_ALPHA, MEMBER_A1, MEMBER_A2], COS_ALPHA)

    mockLoadTeams.mockReturnValue([teamAlpha])
    mockLoadGovernance.mockReturnValue({ version: 1 as const, managerId: null, passwordHash: null, passwordSetAt: null })

    const result = checkMessageAllowed({
      senderAgentId: COS_ALPHA,
      recipientAgentId: MEMBER_A1,
    })
    expect(result.allowed).toBe(true)
    expect(result.reason).toBeUndefined()
  })

  // ---------------------------------------------------------------------------
  // CC-006: COS sender identified via chiefOfStaffId but NOT in agentIds
  // ---------------------------------------------------------------------------
  it('allows COS sender who is chiefOfStaffId but not in agentIds to message team members', () => {
    /**
     * COS_ALPHA is chiefOfStaffId of teamAlpha but is NOT listed in agentIds
     * (data corruption edge case — validateTeamMutation normally auto-adds COS).
     * COS_ALPHA messages MEMBER_A1 who IS in agentIds.
     * The defense-in-depth path (senderCosTeams via chiefOfStaffId) must detect
     * the COS role and allow the message — step 4, branch 3 (R6.7).
     */
    const teamAlpha = makeClosedTeam('alpha', [MEMBER_A1, MEMBER_A2], COS_ALPHA)

    mockLoadTeams.mockReturnValue([teamAlpha])
    mockLoadGovernance.mockReturnValue({ version: 1 as const, managerId: null, passwordHash: null, passwordSetAt: null })

    const result = checkMessageAllowed({
      senderAgentId: COS_ALPHA,
      recipientAgentId: MEMBER_A1,
    })
    expect(result.allowed).toBe(true)
    expect(result.reason).toBeUndefined()
  })

  it('denies COS messaging an agent outside all their teams', () => {
    /** COS cannot reach agents not in any of their teams — step 4, denial branch (R6.2) */
    const teamAlpha = makeClosedTeam('alpha', [COS_ALPHA, MEMBER_A1], COS_ALPHA)

    mockLoadTeams.mockReturnValue([teamAlpha])
    mockLoadGovernance.mockReturnValue({ version: 1 as const, managerId: null, passwordHash: null, passwordSetAt: null })

    const result = checkMessageAllowed({
      senderAgentId: COS_ALPHA,
      recipientAgentId: OUTSIDER,
    })
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('Chief-of-Staff')
    expect(result.reason).toContain('own team members')
  })

  it('allows a normal closed-team member to message a teammate in the same team', () => {
    /** Normal member can message within same closed team — step 5 (R6.1) */
    const teamAlpha = makeClosedTeam('alpha', [COS_ALPHA, MEMBER_A1, MEMBER_A2], COS_ALPHA)

    mockLoadTeams.mockReturnValue([teamAlpha])
    mockLoadGovernance.mockReturnValue({ version: 1 as const, managerId: null, passwordHash: null, passwordSetAt: null })

    const result = checkMessageAllowed({
      senderAgentId: MEMBER_A1,
      recipientAgentId: MEMBER_A2,
    })
    expect(result.allowed).toBe(true)
    expect(result.reason).toBeUndefined()
  })

  // Defensive test: validates filter handles COS-not-in-agentIds edge case.
  // In production, validateTeamMutation auto-adds COS to agentIds (R4.6),
  // so this scenario represents data corruption, not normal operation.
  it('allows a normal member to message the COS of their team (COS is not a peer teammate)', () => {
    /**
     * A normal closed-team member messages the COS of their own team.
     * The COS is NOT listed in agentIds (i.e. not a peer teammate) but IS
     * the chiefOfStaffId — the canReachCOS branch (step 5) must allow this.
     * Validates R6.1: members can always reach their own COS.
     */
    const teamAlpha = makeClosedTeam('alpha', [MEMBER_A1, MEMBER_A2], COS_ALPHA)

    mockLoadTeams.mockReturnValue([teamAlpha])
    mockLoadGovernance.mockReturnValue({ version: 1 as const, managerId: null, passwordHash: null, passwordSetAt: null })

    const result = checkMessageAllowed({
      senderAgentId: MEMBER_A1,
      recipientAgentId: COS_ALPHA,
    })
    expect(result.allowed).toBe(true)
    expect(result.reason).toBeUndefined()
  })

  it('denies a normal closed-team member messaging an agent outside their team', () => {
    /** Normal member cannot reach agents outside their closed team — step 5 denial (R6.1) */
    const teamAlpha = makeClosedTeam('alpha', [COS_ALPHA, MEMBER_A1], COS_ALPHA)
    const teamBeta = makeClosedTeam('beta', [COS_BETA, MEMBER_B1], COS_BETA)

    mockLoadTeams.mockReturnValue([teamAlpha, teamBeta])
    mockLoadGovernance.mockReturnValue({ version: 1 as const, managerId: null, passwordHash: null, passwordSetAt: null })

    const result = checkMessageAllowed({
      senderAgentId: MEMBER_A1,
      recipientAgentId: MEMBER_B1,
    })
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('Closed team members')
    expect(result.reason).toContain('within their team')
  })

  // ---------------------------------------------------------------------------
  // CC-010: Multi-team COS messaging member of second team (R6.7)
  // ---------------------------------------------------------------------------
  it('allows COS managing two closed teams to message a member of the second team', () => {
    /**
     * COS is chiefOfStaffId in closedTeamA AND closedTeamB.
     * Agent-X is a member of closedTeamB only.
     * COS messages Agent-X — must be allowed because R6.7 checks ALL
     * teams the COS manages, not just the first one found.
     */
    const closedTeamA = makeClosedTeam('team-a', [COS_MULTI, MEMBER_A1], COS_MULTI)
    const closedTeamB = makeClosedTeam('team-b', [COS_MULTI, MEMBER_B1, AGENT_X], COS_MULTI)

    mockLoadTeams.mockReturnValue([closedTeamA, closedTeamB])
    mockLoadGovernance.mockReturnValue({ version: 1 as const, managerId: null, passwordHash: null, passwordSetAt: null })

    const result = checkMessageAllowed({
      senderAgentId: COS_MULTI,
      recipientAgentId: AGENT_X,
    })
    expect(result.allowed).toBe(true)
    expect(result.reason).toBeUndefined()
  })

  // ---------------------------------------------------------------------------
  // Null sender (mesh-forwarded) to closed-team recipient — must be denied
  // ---------------------------------------------------------------------------
  it('denies mesh-forwarded (null sender) messages to closed-team recipients', () => {
    /**
     * Agent-Y is in a closed team. Sender is null (mesh-forwarded).
     * Mesh messages to closed-team recipients are DENIED because the
     * sender identity is unverified (step 1 of algorithm).
     */
    const teamGamma = makeClosedTeam('gamma', [COS_ALPHA, AGENT_Y], COS_ALPHA)

    mockLoadTeams.mockReturnValue([teamGamma])
    mockLoadGovernance.mockReturnValue({ version: 1 as const, managerId: null, passwordHash: null, passwordSetAt: null })

    const result = checkMessageAllowed({
      senderAgentId: null,
      recipientAgentId: AGENT_Y,
    })
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('Mesh message denied')
    expect(result.reason).toContain('closed team')
  })

  // ---------------------------------------------------------------------------
  // Alias bypass guard — non-UUID recipient from closed-team sender
  // ---------------------------------------------------------------------------
  it('denies closed-team sender messaging a non-UUID alias recipient', () => {
    /**
     * MEMBER_A1 is a member of a closed team. The recipient identifier
     * is "some-alias" (not a UUID), which cannot be resolved to an
     * agentIds entry. Step 1b denies this to prevent governance bypass
     * via alias that skips agentIds membership checks.
     */
    const teamDelta = makeClosedTeam('delta', [COS_ALPHA, MEMBER_A1], COS_ALPHA)

    mockLoadTeams.mockReturnValue([teamDelta])
    mockLoadGovernance.mockReturnValue({ version: 1 as const, managerId: null, passwordHash: null, passwordSetAt: null })

    const result = checkMessageAllowed({
      senderAgentId: MEMBER_A1,
      recipientAgentId: 'some-alias',
    })
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('unresolved recipient')
    expect(result.reason).toContain('closed team')
  })

  it('denies an outside sender messaging a recipient inside a closed team', () => {
    /** Outside agents cannot message into closed teams — step 6 (R6.5) */
    const teamAlpha = makeClosedTeam('alpha', [COS_ALPHA, MEMBER_A1], COS_ALPHA)

    mockLoadTeams.mockReturnValue([teamAlpha])
    mockLoadGovernance.mockReturnValue({ version: 1 as const, managerId: null, passwordHash: null, passwordSetAt: null })

    const result = checkMessageAllowed({
      senderAgentId: OUTSIDE_SENDER,
      recipientAgentId: MEMBER_A1,
    })
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('Cannot message agents in closed teams from outside')
  })
})
