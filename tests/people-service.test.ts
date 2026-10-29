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

import { createPerson, listPeople, getPersonById, updatePerson, deletePerson, normalizePhone } from '@/services/people-service'
import { collectPeople } from '@/lib/people-fanout'

const person = (r: any) => r.data.person

beforeEach(() => {
  for (const k of Object.keys(fsStore)) delete fsStore[k]
  n = 0
})

describe('people records', () => {
  it('adds a person, stamped with this host, and lists them', () => {
    const r = createPerson({ displayName: ' Ana Ruiz ', title: 'Support lead', phone: '+34 600-111-222', email: 'ana@example.com' })
    expect(r.status).toBe(201)
    expect(person(r)).toMatchObject({ id: 'id-1', displayName: 'Ana Ruiz', phone: '+34600111222', source: 'manual', active: true, hostId: 'self-host' })
    expect((listPeople().data as any).people.map((p: any) => p.displayName)).toEqual(['Ana Ruiz'])
  })

  it('refuses an empty name, a phone that is not international, and a bad email', () => {
    expect(createPerson({ displayName: '  ' }).status).toBe(400)
    expect(createPerson({ displayName: 'A', phone: '600111222' }).status).toBe(400)
    expect(createPerson({ displayName: 'A', email: 'nope' }).status).toBe(400)
    expect((listPeople().data as any).people).toEqual([])
  })

  it('edits fields and clears an optional one with an empty string', () => {
    createPerson({ displayName: 'Ana', phone: '+34600111222' })
    const r = updatePerson('id-1', { title: 'CTO', phone: '' })
    expect(person(r).title).toBe('CTO')
    expect(person(r).phone).toBeUndefined()
    expect(updatePerson('missing', { title: 'x' }).status).toBe(404)
  })

  it('deactivating keeps an id and a tombstone but drops phone and email; it can be brought back', () => {
    createPerson({ displayName: 'Ana', phone: '+34600111222', email: 'ana@example.com' })
    const d = deletePerson('id-1')
    expect(person(d)).toMatchObject({ active: false })
    expect(person(d).phone).toBeUndefined()
    expect(person(d).email).toBeUndefined()
    expect(person(d).deactivatedAt).toBeTruthy()
    expect((listPeople().data as any).people).toEqual([])
    expect((listPeople({ includeInactive: true }).data as any).people).toHaveLength(1)
    const back = updatePerson('id-1', { active: true } as any)
    expect(person(back).active).toBe(true)
    expect(person(back).deactivatedAt).toBeUndefined()
  })

  it('purge removes the record; an unsafe id is a 404, never a path', () => {
    createPerson({ displayName: 'Ana' })
    expect(deletePerson('id-1', { purge: true }).status).toBe(200)
    expect(getPersonById('id-1').status).toBe(404)
    expect(getPersonById('../etc/passwd').status).toBe(404)
  })

  it('normalizes phones to E.164', () => {
    expect(normalizePhone('+1 (415) 555-0100')).toBe('+14155550100')
    expect(normalizePhone('0034600111222')).toBeNull()
  })
})

describe('people across hosts', () => {
  const rec = (id: string, displayName: string, hostId: string) => ({ id, displayName, hostId, source: 'manual', active: true, createdAt: '', updatedAt: '' })
  const ok = (people: unknown[]) => ({ ok: true, status: 200, json: async () => ({ people }) })
  const targets = [
    { base: '', hostId: 'a', hostName: 'Alpha' },
    { base: 'http://b:23000', hostId: 'b', hostName: 'Beta' },
    { base: 'http://c:23000', hostId: 'c', hostName: 'Gamma' },
    { base: 'http://d:23000', hostId: 'd', hostName: 'Delta' },
  ]

  it('lists every host\'s people with the host named; a host that is down is named; an old host holds none', async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url.startsWith('/api')) return ok([rec('1', 'Zoe', 'a')])
      if (url.startsWith('http://b')) return ok([rec('2', 'Ana', 'b')])
      if (url.startsWith('http://c')) throw new Error('timeout')
      return { ok: false, status: 404, json: async () => ({}) }
    })
    const r = await collectPeople(targets, fetcher as any)
    expect(r.people.map(p => `${p.displayName}@${p.hostName}`)).toEqual(['Ana@Beta', 'Zoe@Alpha'])
    expect(r.unreachable).toEqual(['Gamma'])
    expect(r.people[0].hostBase).toBe('http://b:23000')
  })

  it('asks for deactivated people only when told to', async () => {
    const fetcher = vi.fn(async () => ok([]))
    await collectPeople([targets[1]], fetcher as any, true)
    expect(fetcher).toHaveBeenCalledWith('http://b:23000/api/people?includeInactive=1')
  })
})
