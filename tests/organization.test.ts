import { describe, it, expect } from 'vitest'
import { buildOrganizations, tagValues, NO_ORG, type OrgAgentInput, type OrgCardInput, type OrgProjectInput } from '@/lib/organization'

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

  it('puts an agent with two orgs in both, and one with none under NO_ORG, last', () => {
    const orgs = buildOrganizations(agents, [], [])
    expect(orgs.find(o => o.id === 'acme')!.agents.map(a => a.id)).toEqual(['free'])
    expect(orgs[orgs.length - 1].id).toBe(NO_ORG)
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
    expect(orgs.find(o => o.id === NO_ORG)!.projects.map(p => p.id)).toEqual(['p1'])
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

  it('shows a card of an agent no host lists under NO_ORG instead of dropping it', () => {
    const orgs = buildOrganizations(agents, [card('c1', 'unknown-agent')], [])
    expect(orgs.find(o => o.id === NO_ORG)!.cards.map(c => c.id)).toEqual(['c1'])
  })
})
