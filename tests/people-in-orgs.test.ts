/** People in organizations: added by hand, or through the agents that report to them; people report to people. */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { fsStore } = vi.hoisted(() => ({ fsStore: {} as Record<string, string> }))
vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn((p: string) => p in fsStore || Object.keys(fsStore).some(k => k.startsWith(p + '/'))),
    mkdirSync: vi.fn(),
    readFileSync: vi.fn((p: string) => { if (p in fsStore) return fsStore[p]; throw new Error('ENOENT') }),
    writeFileSync: vi.fn((p: string, d: string) => { fsStore[p] = d }),
    readdirSync: vi.fn((p: string) => Object.keys(fsStore).filter(k => k.startsWith(p + '/')).map(k => k.slice(p.length + 1))),
    rmSync: vi.fn((p: string) => { delete fsStore[p] }),
  },
}))
let n = 0
vi.mock('uuid', () => ({ v4: () => `id-${++n}` }))
vi.mock('@/lib/hosts-config', () => ({ getSelfHostId: () => 'self-host' }))

import { createPerson, updatePerson } from '@/services/people-service'
import { buildOrganizations, type OrgAgentInput, type OrgPersonInput } from '@/lib/organization'

const person = (r: any) => r.data.person

beforeEach(() => {
  for (const k of Object.keys(fsStore)) delete fsStore[k]
  n = 0
})

describe('person fields', () => {
  it('stores organizations by hand, lowercased and without repeats; an empty list clears them', () => {
    const ana = person(createPerson({ displayName: 'Ana', orgs: ['Acme', 'acme', ' labs '] }))
    expect(ana.orgs).toEqual(['acme', 'labs'])
    expect(person(updatePerson(ana.id, { orgs: [] })).orgs).toBeUndefined()
  })

  it('refuses organization ids that could not be tags, and too many', () => {
    expect(createPerson({ displayName: 'Ana', orgs: ['acme corp'] }).status).toBe(400)
    expect(createPerson({ displayName: 'Ana', orgs: 'acme' }).status).toBe(400)
    expect(createPerson({ displayName: 'Ana', orgs: Array.from({ length: 21 }, (_, i) => `o${i}`) }).status).toBe(400)
  })

  it('a person reports to another person; not to themselves; null clears it', () => {
    const boss = person(createPerson({ displayName: 'Boss' }))
    const ana = person(createPerson({ displayName: 'Ana' }))
    expect(person(updatePerson(ana.id, { managerPersonId: boss.id })).managerPersonId).toBe(boss.id)
    expect(updatePerson(ana.id, { managerPersonId: ana.id }).status).toBe(400)
    expect(updatePerson(ana.id, { managerPersonId: '../etc' }).status).toBe(400)
    expect(person(updatePerson(ana.id, { managerPersonId: null })).managerPersonId).toBeUndefined()
  })

  it('a manager stored on another host is accepted: only its shape can be checked here', () => {
    const ana = person(createPerson({ displayName: 'Ana' }))
    expect(person(updatePerson(ana.id, { managerPersonId: 'f3b1c2d4-0000-4000-8000-000000000009' })).managerPersonId).toBe('f3b1c2d4-0000-4000-8000-000000000009')
  })
})

describe('people in buildOrganizations', () => {
  const agents: OrgAgentInput[] = [
    { id: 'a1', name: 'lead', hostId: 'h1', tags: ['org:acme'], humanManager: 'p-ana' },
    { id: 'a2', name: 'worker', hostId: 'h1', tags: ['org:acme', 'org:labs'], humanManager: 'p-ana', managerAgentId: 'A1' },
    { id: 'a3', name: 'solo', hostId: 'h2', tags: ['org:labs'], humanManager: 'Some Text' },
  ]
  const people: OrgPersonInput[] = [
    { id: 'p-ana', displayName: 'Ana', hostId: 'h1', orgs: ['acme'], managerPersonId: 'p-boss' },
    { id: 'p-boss', displayName: 'Boss', hostId: 'h2', orgs: ['acme'] },
    { id: 'p-new', displayName: 'Newcomer', hostId: 'h1' },
    { id: 'p-ana', displayName: 'Ana (second host copy)', hostId: 'h2' },
  ]
  const orgs = buildOrganizations(agents, [], [], [], 'personal', people)
  const org = (id: string) => orgs.find(o => o.id === id)!

  it('a person is in an organization by hand, through their agents, or both', () => {
    expect(org('acme').people.map(p => [p.display, p.membership, p.reports])).toEqual([
      ['Ana', 'both', ['a1', 'a2']],
      ['Boss', 'member', []],
    ])
    expect(org('labs').people.map(p => [p.display, p.membership, p.reports])).toEqual([['Ana', 'manages', ['a2']]])
    expect(org('acme').stats.people).toBe(2)
  })

  it('a person in no organization and managing no agent is in none; a duplicate from a second host counts once', () => {
    expect(orgs.flatMap(o => o.people).some(p => p.id === 'p-new')).toBe(false)
    expect(org('acme').people.filter(p => p.id === 'p-ana')).toHaveLength(1)
  })

  it('carries the managers the chart needs', () => {
    expect(org('acme').people.find(p => p.id === 'p-ana')!.managerPersonId).toBe('p-boss')
    const worker = org('acme').agents.find(a => a.id === 'a2')!
    expect(worker).toMatchObject({ humanManager: 'p-ana', managerAgentId: 'a1' })
  })
})
