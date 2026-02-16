import { vi, describe, it, expect, beforeEach } from 'vitest'

// ============================================================================
// Mocks — only external dependency: @/lib/governance
// ============================================================================

const mockIsManager = vi.fn(() => false)
const mockIsChiefOfStaffAnywhere = vi.fn(() => false)
const mockGetClosedTeamsForAgent = vi.fn(() => [] as ReturnType<typeof makeClosedTeam>[])

vi.mock('@/lib/governance', () => ({
  isManager: (...args: unknown[]) => mockIsManager(...args),
  isChiefOfStaffAnywhere: (...args: unknown[]) => mockIsChiefOfStaffAnywhere(...args),
  getClosedTeamsForAgent: (...args: unknown[]) => mockGetClosedTeamsForAgent(...args),
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

// ============================================================================
// Tests — 10 scenarios covering all branches of checkMessageAllowed
// ============================================================================

describe('checkMessageAllowed', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.restoreAllMocks()
    mockIsManager.mockReturnValue(false)
    mockIsChiefOfStaffAnywhere.mockReturnValue(false)
    mockGetClosedTeamsForAgent.mockReturnValue([])
  })

  it('allows mesh-forwarded messages when senderAgentId is null', () => {
    /** Mesh-forwarded messages (null sender) are always trusted — step 1 of algorithm */
    const result = checkMessageAllowed({
      senderAgentId: null,
      recipientAgentId: 'agent-recipient-01',
    })
    expect(result.allowed).toBe(true)
    expect(result.reason).toBeUndefined()
    // governance functions should not be called at all for null sender
    expect(mockGetClosedTeamsForAgent).not.toHaveBeenCalled()
    expect(mockIsManager).not.toHaveBeenCalled()
  })

  it('allows messages when neither sender nor recipient is in a closed team', () => {
    /** Open world: both agents outside closed teams can message freely — step 2 (R6.4) */
    mockGetClosedTeamsForAgent.mockReturnValue([])

    const result = checkMessageAllowed({
      senderAgentId: 'open-agent-A',
      recipientAgentId: 'open-agent-B',
    })
    expect(result.allowed).toBe(true)
    expect(result.reason).toBeUndefined()
    // Both agents were queried for team membership
    expect(mockGetClosedTeamsForAgent).toHaveBeenCalledWith('open-agent-A')
    expect(mockGetClosedTeamsForAgent).toHaveBeenCalledWith('open-agent-B')
  })

  it('allows messages when sender is MANAGER regardless of teams', () => {
    /** MANAGER can message anyone — step 3 (R6.3) */
    const teamAlpha = makeClosedTeam('alpha', ['cos-alpha', 'member-1'], 'cos-alpha')

    mockGetClosedTeamsForAgent.mockImplementation((id: string) => {
      if (id === 'member-1') return [teamAlpha]
      return []
    })
    mockIsManager.mockImplementation((id: string) => id === 'manager-01')

    const result = checkMessageAllowed({
      senderAgentId: 'manager-01',
      recipientAgentId: 'member-1',
    })
    expect(result.allowed).toBe(true)
    expect(result.reason).toBeUndefined()
    expect(mockIsManager).toHaveBeenCalledWith('manager-01')
  })

  it('allows COS to message the MANAGER', () => {
    /** Chief-of-Staff can always reach the MANAGER — step 4, branch 1 (R6.2) */
    const teamAlpha = makeClosedTeam('alpha', ['cos-alpha', 'member-1'], 'cos-alpha')

    mockGetClosedTeamsForAgent.mockImplementation((id: string) => {
      if (id === 'cos-alpha') return [teamAlpha]
      return []
    })
    mockIsChiefOfStaffAnywhere.mockImplementation((id: string) => id === 'cos-alpha')
    mockIsManager.mockImplementation((id: string) => id === 'manager-01')

    const result = checkMessageAllowed({
      senderAgentId: 'cos-alpha',
      recipientAgentId: 'manager-01',
    })
    expect(result.allowed).toBe(true)
    expect(result.reason).toBeUndefined()
  })

  it('allows COS to message another COS (COS-to-COS bridge)', () => {
    /** Any COS can message any other COS — step 4, branch 2 (R6.2) */
    const teamAlpha = makeClosedTeam('alpha', ['cos-alpha', 'member-a1'], 'cos-alpha')
    const teamBeta = makeClosedTeam('beta', ['cos-beta', 'member-b1'], 'cos-beta')

    mockGetClosedTeamsForAgent.mockImplementation((id: string) => {
      if (id === 'cos-alpha') return [teamAlpha]
      if (id === 'cos-beta') return [teamBeta]
      return []
    })
    mockIsChiefOfStaffAnywhere.mockImplementation(
      (id: string) => id === 'cos-alpha' || id === 'cos-beta'
    )

    const result = checkMessageAllowed({
      senderAgentId: 'cos-alpha',
      recipientAgentId: 'cos-beta',
    })
    expect(result.allowed).toBe(true)
    expect(result.reason).toBeUndefined()
  })

  it('allows COS to message a member of their own closed team', () => {
    /** COS can reach members of any of their closed teams — step 4, branch 3 (R6.7) */
    const teamAlpha = makeClosedTeam('alpha', ['cos-alpha', 'member-a1', 'member-a2'], 'cos-alpha')

    mockGetClosedTeamsForAgent.mockImplementation((id: string) => {
      if (id === 'cos-alpha') return [teamAlpha]
      if (id === 'member-a1') return [teamAlpha]
      return []
    })
    mockIsChiefOfStaffAnywhere.mockImplementation((id: string) => id === 'cos-alpha')

    const result = checkMessageAllowed({
      senderAgentId: 'cos-alpha',
      recipientAgentId: 'member-a1',
    })
    expect(result.allowed).toBe(true)
    expect(result.reason).toBeUndefined()
  })

  it('denies COS messaging an agent outside all their teams', () => {
    /** COS cannot reach agents not in any of their teams — step 4, denial branch (R6.2) */
    const teamAlpha = makeClosedTeam('alpha', ['cos-alpha', 'member-a1'], 'cos-alpha')

    mockGetClosedTeamsForAgent.mockImplementation((id: string) => {
      if (id === 'cos-alpha') return [teamAlpha]
      if (id === 'outsider-agent') return [] // not in any closed team
      return []
    })
    mockIsChiefOfStaffAnywhere.mockImplementation((id: string) => id === 'cos-alpha')

    const result = checkMessageAllowed({
      senderAgentId: 'cos-alpha',
      recipientAgentId: 'outsider-agent',
    })
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('Chief-of-Staff')
    expect(result.reason).toContain('own team members')
  })

  it('allows a normal closed-team member to message a teammate in the same team', () => {
    /** Normal member can message within same closed team — step 5 (R6.1) */
    const teamAlpha = makeClosedTeam('alpha', ['cos-alpha', 'member-a1', 'member-a2'], 'cos-alpha')

    mockGetClosedTeamsForAgent.mockImplementation((id: string) => {
      if (id === 'member-a1' || id === 'member-a2') return [teamAlpha]
      return []
    })

    const result = checkMessageAllowed({
      senderAgentId: 'member-a1',
      recipientAgentId: 'member-a2',
    })
    expect(result.allowed).toBe(true)
    expect(result.reason).toBeUndefined()
  })

  it('denies a normal closed-team member messaging an agent outside their team', () => {
    /** Normal member cannot reach agents outside their closed team — step 5 denial (R6.1) */
    const teamAlpha = makeClosedTeam('alpha', ['cos-alpha', 'member-a1'], 'cos-alpha')
    const teamBeta = makeClosedTeam('beta', ['cos-beta', 'member-b1'], 'cos-beta')

    mockGetClosedTeamsForAgent.mockImplementation((id: string) => {
      if (id === 'member-a1') return [teamAlpha]
      if (id === 'member-b1') return [teamBeta]
      return []
    })

    const result = checkMessageAllowed({
      senderAgentId: 'member-a1',
      recipientAgentId: 'member-b1',
    })
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('Closed team members')
    expect(result.reason).toContain('within their team')
  })

  it('denies an outside sender messaging a recipient inside a closed team', () => {
    /** Outside agents cannot message into closed teams — step 6 (R6.5) */
    const teamAlpha = makeClosedTeam('alpha', ['cos-alpha', 'member-a1'], 'cos-alpha')

    mockGetClosedTeamsForAgent.mockImplementation((id: string) => {
      if (id === 'outside-sender') return [] // not in any closed team
      if (id === 'member-a1') return [teamAlpha]
      return []
    })

    const result = checkMessageAllowed({
      senderAgentId: 'outside-sender',
      recipientAgentId: 'member-a1',
    })
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('Cannot message agents in closed teams from outside')
  })
})
