/**
 * Managers against the People directory: the mobile app finds "agents that report to you" by comparing an
 * agent's humanManager with the person's id, so free text has to become person ids where it is unambiguous.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { personByText, agentByText, managerName, planManagerLinks, type AgentLite, type PersonLite } from '@/lib/manager-links'
import { suggestManager } from '@/lib/agent-manager'

const ANA: PersonLite = { id: 'p-ana-0001', displayName: 'Ana Ruiz', email: 'ana@acme.com' }
const BOB: PersonLite = { id: 'p-bob-0001', displayName: 'Bob', email: 'bob@acme.com' }
const BOB2: PersonLite = { id: 'p-bob-0002', displayName: 'bob' }
const LOLA = '11111111-1111-4111-8111-111111111111'
const GM = '22222222-2222-4222-8222-222222222222'
const A1 = '33333333-3333-4333-8333-333333333333'

describe('finding people and agents by text', () => {
  it('matches a name or an email exactly, ignoring case, and only when one person matches', () => {
    expect(personByText(' ana ruiz ', [ANA, BOB])).toBe(ANA)
    expect(personByText('ANA@acme.com', [ANA, BOB])).toBe(ANA)
    expect(personByText('Ana', [ANA, BOB])).toBeNull()
    expect(personByText('bob', [ANA, BOB, BOB2])).toBeNull() // two people answer to it: no guess
    expect(personByText('', [ANA])).toBeNull()
  })

  it('matches an agent by name, alias or label', () => {
    const agents: AgentLite[] = [{ id: LOLA, name: 'pas-lola', label: 'Lola' }]
    expect(agentByText('PAS-LOLA', agents)?.id).toBe(LOLA)
    expect(agentByText('lola', agents)?.id).toBe(LOLA)
    expect(agentByText('nobody', agents)).toBeNull()
  })

  it('shows a person id as the name and free text as itself', () => {
    expect(managerName('p-ana-0001', [ANA])).toBe('Ana Ruiz')
    expect(managerName('someone@else.com', [ANA])).toBe('someone@else.com')
    expect(managerName(undefined, [ANA])).toBeUndefined()
  })
})

describe('planManagerLinks', () => {
  const others: AgentLite[] = [{ id: LOLA, name: 'pas-lola' }, { id: GM, name: 'tct-gm' }]

  it('links a free-text manager to the one person it names', () => {
    const { links } = planManagerLinks([{ id: A1, name: 'a1', humanManager: 'ana@acme.com' }], [ANA], others)
    expect(links).toEqual([expect.objectContaining({ agentId: A1, from: 'humanManager', patch: { humanManager: 'p-ana-0001' }, to: 'Ana Ruiz (person)' })])
  })

  it('moves a manager that names an agent to the agent field', () => {
    const { links } = planManagerLinks([{ id: A1, name: 'a1', humanManager: 'pas-lola' }], [ANA], others)
    expect(links[0].patch).toEqual({ humanManager: null, managerAgentId: LOLA })
  })

  it('links the owner of an agent that has no manager, but never to itself', () => {
    const plan = planManagerLinks([
      { id: A1, name: 'a1', owner: 'Ana Ruiz' },
      { id: '44444444-4444-4444-8444-444444444444', name: 'self-owned', owner: 'self-owned' },
      { id: '55555555-5555-4555-8555-555555555555', name: 'sys', owner: 'system' },
    ], [ANA], others)
    expect(plan.links).toEqual([expect.objectContaining({ agentId: A1, from: 'owner', patch: { humanManager: 'p-ana-0001' } })])
    expect(plan.unmatched).toEqual([])
  })

  it('leaves agents already linked to a person alone', () => {
    expect(planManagerLinks([{ id: A1, humanManager: 'p-ana-0001', owner: 'Bob' }], [ANA, BOB], others)).toEqual({ links: [], unmatched: [] })
  })

  it('lists what it cannot link instead of guessing', () => {
    const plan = planManagerLinks([
      { id: A1, name: 'a1', humanManager: 'bob' },                   // two people called bob
      { id: GM, name: 'tct-gm', humanManager: 'pas-lola', managerAgentId: A1 }, // already reports to another agent
    ], [BOB, BOB2], [...others, { id: A1, name: 'a1' }])
    expect(plan.links).toEqual([])
    expect(plan.unmatched.map(u => u.agentId)).toEqual([A1, GM])
  })

  it('refuses a link that would make a loop of managers', () => {
    // lola already reports to a1; a1's manager text names lola
    const all: AgentLite[] = [{ id: LOLA, name: 'pas-lola', managerAgentId: A1 }, { id: A1, name: 'a1', humanManager: 'pas-lola' }]
    const plan = planManagerLinks([all[1]], [], all)
    expect(plan.links).toEqual([])
    expect(plan.unmatched[0].reason).toContain('loop')
  })
})

describe('suggestManager with the directory', () => {
  it('suggests the person id when the owner names one person, and keeps the old behaviour otherwise', () => {
    expect(suggestManager({ id: A1, owner: 'Ana Ruiz' }, [], [ANA])).toEqual({ humanManager: 'p-ana-0001', from: 'owner' })
    expect(suggestManager({ id: A1, owner: 'Someone Else' }, [], [ANA])).toEqual({ humanManager: 'Someone Else', from: 'owner' })
    expect(suggestManager({ id: A1, owner: 'pas-lola' }, [{ id: LOLA, name: 'pas-lola' }], [ANA])).toEqual({ managerAgentId: LOLA, from: 'owner' })
  })
})

// --- the service: dry run, apply, unreachable peers ---
const { updateAgentById, local, peerHosts } = vi.hoisted(() => ({
  updateAgentById: vi.fn(() => ({ data: { agent: {} }, status: 200 })),
  local: { agents: [] as unknown[], people: [] as unknown[] },
  peerHosts: [] as unknown[],
}))
vi.mock('@/lib/agent-registry', () => ({ loadAgents: () => local.agents }))
vi.mock('@/lib/people-registry', () => ({ loadPeople: () => local.people }))
vi.mock('@/lib/hosts-config', () => ({ getHosts: () => peerHosts, isSelfHost: (h: { id: string }) => h.id === 'self' }))
vi.mock('@/services/agents-core-service', () => ({ updateAgentById }))

describe('linkAgentManagers', () => {
  beforeEach(() => {
    updateAgentById.mockClear()
    local.agents = [{ id: A1, name: 'a1', humanManager: 'ana@acme.com' }, { id: GM, name: 'tct-gm', owner: 'Ghost' }]
    local.people = []
    peerHosts.length = 0
    peerHosts.push({ id: 'self', name: 'self', url: 'http://self:23000' }, { id: 'mini', name: 'mini', url: 'http://mini:23000' }, { id: 'down', name: 'down', url: 'http://down:23000' })
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.startsWith('http://down')) throw new Error('timeout')
      if (url.endsWith('/api/people')) return { ok: true, json: async () => ({ people: [{ ...ANA, active: true }] }) }
      return { ok: true, json: async () => ({ agents: [] }) }
    }))
  })

  it('a dry run lists links, unmatched agents and unreachable hosts, and changes nothing', async () => {
    const { linkAgentManagers } = await import('@/services/agents-manager-links-service')
    const r = await linkAgentManagers()
    expect(r.data).toMatchObject({ applied: false, unreachable: ['down'] })
    expect(r.data!.links.map(l => l.agentId)).toEqual([A1])
    expect(r.data!.unmatched.map(u => u.agentId)).toEqual([GM])
    expect(updateAgentById).not.toHaveBeenCalled()
    // never asks itself
    expect((fetch as any).mock.calls.some((c: string[]) => c[0].startsWith('http://self'))).toBe(false)
  })

  it('apply goes through the normal agent update, so its validation still holds', async () => {
    const { linkAgentManagers } = await import('@/services/agents-manager-links-service')
    updateAgentById.mockReturnValueOnce({ data: { message: 'nope' }, status: 400 } as any)
    const r = await linkAgentManagers({ apply: true })
    expect(updateAgentById).toHaveBeenCalledWith(A1, { humanManager: 'p-ana-0001' })
    expect(r.data!.links[0].error).toBe('nope')
  })
})
