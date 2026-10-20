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
vi.mock('@/lib/agent-registry', () => ({
  loadAgents: () => [{ id: 'a1', name: 'alpha' }],
  getAgent: (id: string) => (id === 'a1' ? { id, name: 'alpha' } : null),
}))
vi.mock('@/lib/team-registry', () => ({ loadTeams: () => [], getTeam: () => null }))
vi.mock('@/lib/hosts-config', () => ({ getHosts: () => [], getSelfHostId: () => 'self-host', isSelf: (id: string) => id === 'self-host' }))
vi.mock('@/services/agents-chat-service', () => ({ injectMeetingPrompt: vi.fn() }))

import { createOrg, listOrgs, getOrgById, updateOrg, deleteOrg, setDefault, getDefault } from '@/services/orgs-service'
import { createAgentTask, updateAgentTask, listAgentTasks } from '@/services/agent-tasks-service'

const org = (r: any) => r.data.organization

beforeEach(() => {
  for (const k of Object.keys(fsStore)) delete fsStore[k]
  n = 0
})

describe('organization records', () => {
  it('creates one with an id taken from the name, and lists it with its host', () => {
    const r = createOrg({ name: '3Metas', description: 'Salesland and friends' })
    expect(r.status).toBe(201)
    expect(org(r)).toMatchObject({ id: '3metas', name: '3Metas', description: 'Salesland and friends', hostId: 'self-host' })
    expect(listOrgs().data!.organizations.map(o => o.id)).toEqual(['3metas'])
  })

  it('takes an explicit id (the org: tag value), lowercased', () => {
    expect(org(createOrg({ id: 'Acme-Co', name: 'Acme' })).id).toBe('acme-co')
  })

  it('refuses an id that is not a tag-safe slug, an empty name, and a duplicate', () => {
    expect(createOrg({ id: 'has space', name: 'x' }).status).toBe(400)
    expect(createOrg({ id: '../etc', name: 'x' }).status).toBe(400)
    expect(createOrg({ name: '   ' }).status).toBe(400)
    createOrg({ name: 'Acme' })
    expect(createOrg({ name: 'Acme' }).status).toBe(409)
  })

  it('updates the name and description, never the id', () => {
    createOrg({ name: 'Acme' })
    const r = updateOrg('acme', { name: 'Acme Inc', description: 'Customer' })
    expect(org(r)).toMatchObject({ id: 'acme', name: 'Acme Inc', description: 'Customer' })
    expect(updateOrg('nope', { name: 'x' }).status).toBe(404)
  })

  it('deletes only the record', () => {
    createOrg({ name: 'Acme' })
    expect(deleteOrg('acme').status).toBe(200)
    expect(getOrgById('acme').status).toBe(404)
    expect(deleteOrg('acme').status).toBe(404)
  })
})

describe('a company label on a card', () => {
  const cards = () => (listAgentTasks('a1').data as any).tasks as Array<{ id: string; org?: string }>

  it('is saved on create, normalised to lowercase, and shows when the cards are read', () => {
    const r = createAgentTask('a1', { subject: 'Invoice', org: ' ACME ' })
    expect(r.status).toBe(201)
    expect((r.data as any).task.org).toBe('acme')
    expect(cards()[0].org).toBe('acme')
  })

  it('can be changed and cleared with null', () => {
    const id = ((createAgentTask('a1', { subject: 'x' }).data as any).task as { id: string }).id
    expect(cards()[0].org).toBeUndefined()
    expect(updateAgentTask('a1', id, { org: 'acme' }).status).toBe(200)
    expect(cards()[0].org).toBe('acme')
    expect(updateAgentTask('a1', id, { org: null }).status).toBe(200)
    expect(cards()[0].org).toBeUndefined()
  })

  it('refuses a value that is not an organization id', () => {
    expect(createAgentTask('a1', { subject: 'x', org: 'Not a slug!' }).status).toBe(400)
    expect(createAgentTask('a1', { subject: 'x', org: 7 as any }).status).toBe(400)
  })
})

describe('the default organization', () => {
  it('is "personal" until one is chosen, then the chosen one, listed with the records', () => {
    expect(getDefault().data).toEqual({ defaultOrg: 'personal' })
    expect(listOrgs().data!.defaultOrg).toBe('personal')
    expect(setDefault({ id: ' Home ' }).data).toEqual({ defaultOrg: 'home' })
    expect(getDefault().data).toEqual({ defaultOrg: 'home' })
    expect(listOrgs().data!.defaultOrg).toBe('home')
  })

  it('refuses a value that is not an organization id, and the reserved word', () => {
    expect(setDefault({ id: 'not a slug' }).status).toBe(400)
    expect(setDefault({}).status).toBe(400)
    expect(setDefault({ id: 'default' }).status).toBe(400)
    expect(createOrg({ id: 'default', name: 'x' }).status).toBe(400)
  })
})
