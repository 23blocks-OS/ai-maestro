import { describe, it, expect } from 'vitest'
import type { OrganizationRecord } from '@/types/org'
import { buildOrganizations, tagValues, DEFAULT_ORG, type OrgAgentInput, type OrgCardInput, type OrgProjectInput } from '@/lib/organization'

const agent = (id: string, hostId: string, tags: string[], label?: string): OrgAgentInput => ({ id, name: id, label, hostId, tags })
const card = (id: string, agentId: string, extra: Partial<OrgCardInput> = {}): OrgCardInput => ({ id, subject: id, status: 'pending', agentId, ...extra })

const agents = [
  agent('gm', 'mac-mini', ['org:3metas', 'kind:employee', 'role:gm'], 'Emilia'),
  agent('web', 'mac-mini', ['ORG:3Metas', 'kind:employee', 'role:web']),
  agent('lola', 'mini-lola', ['kind:holding', 'role:chief-of-staff'], 'Lola'),
  agent('free', 'local', ['org:acme', 'org:3metas', 'kind:freelancer']),
  agent('loner', 'local', []),
]

describe('tagValues', () => {
  it('reads lowercased values, ignores other prefixes and repeats', () => {
    expect(tagValues(['ORG:3Metas', 'org:3metas', 'role:gm', 'organic'], 'org')).toEqual(['3metas'])
  })
})

describe('buildOrganizations', () => {
  it('groups agents by org tag across hosts, with name and role', () => {
    const orgs = buildOrganizations(agents, [], [])
    const m = orgs.find(o => o.id === '3metas')!
    expect(m.agents.map(a => a.id).sort()).toEqual(['free', 'gm', 'web'])
    expect(m.agents.find(a => a.id === 'gm')).toMatchObject({ display: 'Emilia', role: 'gm', kind: 'employee', hostId: 'mac-mini' })
  })

  it('puts an agent with two orgs in both, and one with none under the default, which lists last', () => {
    const orgs = buildOrganizations(agents, [], [])
    expect(orgs.find(o => o.id === 'acme')!.agents.map(a => a.id)).toEqual(['free'])
    expect(orgs[orgs.length - 1].id).toBe(DEFAULT_ORG)
    expect(orgs[orgs.length - 1].agents.map(a => a.id).sort()).toEqual(['lola', 'loner'])
  })

  it('counts cards by the assignee, deduplicates a card reported by two hosts, and counts waiting on the operator', () => {
    const cards = [
      card('c1', 'gm'),
      card('c1', 'gm'),
      card('c2', 'web', { status: 'waiting', waitingOn: 'juan' }),
      card('c3', 'web', { isBlocked: true }),
    ]
    const m = buildOrganizations(agents, cards, []).find(o => o.id === '3metas')!
    expect(m.stats).toMatchObject({ open: 3, waiting: 1, blocked: 1, waitingOnOperator: 1 })
    expect(m.agents.find(a => a.id === 'web')).toMatchObject({ open: 2, waiting: 1, blocked: 1 })
  })

  it('matches a project card to its assignee on another host than the project', () => {
    const projects: OrgProjectInput[] = [{ id: 'p1', name: 'Launch', status: 'active', ownerAgentId: 'lola', hostId: 'mini-lola', counts: { open: 1, waiting: 0, total: 1 } }]
    const cards = [card('c1', 'gm', { scope: 'project', projectId: 'p1', projectName: 'Launch' })]
    const orgs = buildOrganizations(agents, cards, projects)
    // the card is the mac-mini agent's, although the project is on mini-lola
    expect(orgs.find(o => o.id === '3metas')!.cards.map(c => c.id)).toEqual(['c1'])
    // the project shows under its owner's group and under the group that has work on it
    expect(orgs.find(o => o.id === DEFAULT_ORG)!.projects.map(p => p.id)).toEqual(['p1'])
    expect(orgs.find(o => o.id === '3metas')!.projects.map(p => p.id)).toEqual(['p1'])
  })

  it('derives hand-offs, waits and blocks, and flags the ones that cross organizations', () => {
    const projects: OrgProjectInput[] = [{ id: 'p1', name: 'Launch', status: 'active', ownerAgentId: 'lola', hostId: 'mini-lola', counts: { open: 2, waiting: 0, total: 2 } }]
    const cards = [
      card('c1', 'gm', { projectId: 'p1' }),
      card('c2', 'gm', { projectId: 'p1' }),
      card('c3', 'web', { status: 'waiting', waitingOn: 'gm' }),
      card('c4', 'web', { blockedBy: ['c1'] }),
    ]
    const m = buildOrganizations(agents, cards, projects).find(o => o.id === '3metas')!
    const rel = (k: string, f: string, t: string) => m.relations.find(r => r.kind === k && r.from === f && r.to === t)
    expect(rel('hands-work-to', 'lola', 'gm')).toMatchObject({ count: 2, crossOrg: true })
    expect(rel('waits-on', 'web', 'gm')).toMatchObject({ count: 1, crossOrg: false })
    expect(rel('blocked-by', 'web', 'gm')).toMatchObject({ count: 1, crossOrg: false })
  })

  it('ignores a wait on the operator or an unknown agent, and a dependency that is done', () => {
    const cards = [
      card('c1', 'web', { status: 'waiting', waitingOn: 'juan' }),
      card('c2', 'web', { status: 'waiting', waitingOn: 'ghost' }),
      card('c3', 'gm', { status: 'completed' }),
      card('c4', 'web', { blockedBy: ['c3'] }),
    ]
    const m = buildOrganizations(agents, cards, []).find(o => o.id === '3metas')!
    expect(m.relations).toEqual([])
  })

  it('shows a card of an agent no host lists under DEFAULT_ORG instead of dropping it', () => {
    const orgs = buildOrganizations(agents, [card('c1', 'unknown-agent')], [])
    expect(orgs.find(o => o.id === DEFAULT_ORG)!.cards.map(c => c.id)).toEqual(['c1'])
  })

  describe('records and card labels', () => {
    const rec = (id: string, name: string, hostId: string, updatedAt: string, description?: string): OrganizationRecord =>
      ({ id, name, hostId, createdAt: updatedAt, updatedAt, ...(description ? { description } : {}) })

    it('names an organization from its record, and keeps one that only the tags name', () => {
      const orgs = buildOrganizations(agents, [], [], [rec('3metas', '3Metas', 'mac-mini', '2026-10-20', 'Salesland')])
      expect(orgs.find(o => o.id === '3metas')).toMatchObject({ name: '3Metas', description: 'Salesland', hasRecord: true, recordHostId: 'mac-mini' })
      expect(orgs.find(o => o.id === 'acme')).toMatchObject({ name: 'acme', hasRecord: false })
    })

    it('lists a record that no agent or card mentions yet', () => {
      const orgs = buildOrganizations(agents, [], [], [rec('newco', 'NewCo', 'local', '2026-10-20')])
      expect(orgs.find(o => o.id === 'newco')).toMatchObject({ name: 'NewCo', stats: expect.objectContaining({ agents: 0, open: 0 }) })
    })

    it('joins the same id from two hosts into one organization, newest record winning', () => {
      const orgs = buildOrganizations(agents, [], [], [rec('acme', 'Acme (old)', 'local', '2026-10-01'), rec('acme', 'Acme Inc', 'mac-mini', '2026-10-15')])
      expect(orgs.filter(o => o.id === 'acme')).toHaveLength(1)
      expect(orgs.find(o => o.id === 'acme')).toMatchObject({ name: 'Acme Inc', recordHostId: 'mac-mini' })
    })

    it('puts a labelled card under its organization, not its assignee\'s, so a freelancer\'s work for each company is separate', () => {
      const cards = [card('c1', 'free', { org: 'acme' }), card('c2', 'free', { org: '3metas' }), card('c3', 'free')]
      const orgs = buildOrganizations(agents, cards, [])
      expect(orgs.find(o => o.id === 'acme')!.cards.map(c => c.id)).toEqual(['c1', 'c3'])
      expect(orgs.find(o => o.id === '3metas')!.cards.map(c => c.id)).toEqual(['c2', 'c3'])
    })

    it('shows a card labelled for an organization that has no agents and no record', () => {
      const orgs = buildOrganizations(agents, [card('c1', 'gm', { org: 'ghost-co' })], [])
      expect(orgs.find(o => o.id === 'ghost-co')!.cards.map(c => c.id)).toEqual(['c1'])
      expect(orgs.find(o => o.id === '3metas')!.cards).toEqual([])
    })
  })

  describe('the default organization', () => {
    it('is "personal" and always listed, so someone working alone sees where their work is', () => {
      const solo = [agent('me', 'local', [])]
      const orgs = buildOrganizations(solo, [card('c1', 'me')], [])
      expect(orgs.map(o => o.id)).toEqual(['personal'])
      expect(orgs[0]).toMatchObject({ isDefault: true, cards: [expect.objectContaining({ id: 'c1' })], agents: [expect.objectContaining({ id: 'me' })] })
      expect(buildOrganizations([], [], []).map(o => o.id)).toEqual(['personal'])
    })

    it('can be another organization, which then takes the untagged agents and unlabelled cards', () => {
      const orgs = buildOrganizations(agents, [card('c1', 'loner')], [], [], 'home')
      const home = orgs.find(o => o.id === 'home')!
      expect(home.isDefault).toBe(true)
      expect(home.agents.map(a => a.id).sort()).toEqual(['lola', 'loner'])
      expect(home.cards.map(c => c.id)).toEqual(['c1'])
      expect(orgs.find(o => o.id === 'personal')).toBeUndefined()
    })

    it('does not take an agent that has its own organization, nor a card labelled for another', () => {
      const orgs = buildOrganizations(agents, [card('c1', 'loner', { org: 'acme' })], [])
      expect(orgs.find(o => o.id === 'personal')!.cards).toEqual([])
      expect(orgs.find(o => o.id === 'personal')!.agents.map(a => a.id)).not.toContain('gm')
    })
  })
})
