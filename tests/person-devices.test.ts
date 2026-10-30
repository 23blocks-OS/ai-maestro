import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

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
vi.mock('@/lib/hosts-config', () => ({ getSelfHostId: () => 'self-host' }))

import { pairDevice, listDevices, unpairDevice } from '@/services/person-devices-service'
import { collectDevices, onlineHostsByPerson } from '@/lib/people-fanout'

const dev = (r: any) => r.data.device
const list = (r: any) => r.data.devices

beforeEach(() => {
  for (const k of Object.keys(fsStore)) delete fsStore[k]
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-29T20:00:00Z'))
})
afterEach(() => vi.useRealTimers())

describe('pairing an app to a person', () => {
  it('pairs a device, even when this host does not hold the person record', () => {
    const r = pairDevice('device-ana-1', { personId: 'f3b1c2d4-0000-4000-8000-000000000001', personName: 'Ana', platform: 'ios', appVersion: '1.0.0' })
    expect(r.status).toBe(200)
    expect(dev(r)).toMatchObject({ deviceId: 'device-ana-1', personId: 'f3b1c2d4-0000-4000-8000-000000000001', personName: 'Ana', hostId: 'self-host', online: true })
  })

  it('refuses a missing or unsafe person id and a bad device id', () => {
    expect(pairDevice('device-ana-1', {}).status).toBe(400)
    expect(pairDevice('device-ana-1', { personId: '../etc' }).status).toBe(400)
    expect(pairDevice('x', { personId: 'p1' }).status).toBe(400)
    expect(pairDevice('../../etc/passwd', { personId: 'p1' }).status).toBe(400)
    expect(list(listDevices())).toEqual([])
  })

  it('a repeat is a heartbeat: firstSeenAt stays, lastSeenAt moves, and the device can change person', () => {
    pairDevice('device-ana-1', { personId: 'p1' })
    vi.setSystemTime(new Date('2026-10-29T20:00:30Z'))
    const again = dev(pairDevice('device-ana-1', { personId: 'p2' }))
    expect(again.firstSeenAt).toBe('2026-10-29T20:00:00.000Z')
    expect(again.lastSeenAt).toBe('2026-10-29T20:00:30.000Z')
    expect(again.personId).toBe('p2')
    expect(list(listDevices())).toHaveLength(1)
  })

  it('goes offline after 90 seconds without a heartbeat, and can be filtered by person', () => {
    pairDevice('device-ana-1', { personId: 'p1' })
    pairDevice('device-bob-1', { personId: 'p2' })
    vi.setSystemTime(new Date('2026-10-29T20:01:31Z'))
    expect(list(listDevices()).every((d: any) => !d.online)).toBe(true)
    expect(list(listDevices({ personId: 'p1' })).map((d: any) => d.deviceId)).toEqual(['device-ana-1'])
  })

  it('unpairs; an unknown or unsafe device is 404', () => {
    pairDevice('device-ana-1', { personId: 'p1' })
    expect(unpairDevice('device-ana-1').status).toBe(200)
    expect(unpairDevice('device-ana-1').status).toBe(404)
    expect(unpairDevice('../x').status).toBe(404)
  })
})

describe('devices across hosts', () => {
  const d = (deviceId: string, personId: string, online: boolean, hostId: string) => ({ deviceId, personId, online, hostId, firstSeenAt: '', lastSeenAt: '' })
  const ok = (devices: unknown[]) => ({ ok: true, status: 200, json: async () => ({ devices }) })
  const targets = [
    { base: '', hostId: 'a', hostName: 'Alpha' },
    { base: 'http://b:23000', hostId: 'b', hostName: 'Beta' },
    { base: 'http://c:23000', hostId: 'c', hostName: 'Gamma' },
    { base: 'http://d:23000', hostId: 'd', hostName: 'Delta' },
  ]

  it('a person is online when ANY host sees their app; a host that is down is named; an old host holds none', async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url.startsWith('/api')) return ok([d('d1', 'ana', false, 'a')])
      if (url.startsWith('http://b')) return ok([d('d1', 'ana', true, 'b'), d('d2', 'bob', true, 'b')])
      if (url.startsWith('http://c')) throw new Error('timeout')
      return { ok: false, status: 404, json: async () => ({}) }
    })
    const r = await collectDevices(targets, fetcher as any)
    expect(r.unreachable).toEqual(['Gamma'])
    const online = onlineHostsByPerson(r.devices)
    expect(online.get('ana')).toEqual(['Beta'])
    expect(online.get('bob')).toEqual(['Beta'])
    expect(online.has('cara')).toBe(false)
  })

  it('lists every host where the app is connected', () => {
    const online = onlineHostsByPerson([
      { ...d('d1', 'ana', true, 'a'), hostName: 'Alpha' }, { ...d('d1', 'ana', true, 'b'), hostName: 'Beta' }, { ...d('d1', 'ana', true, 'b'), hostName: 'Beta' },
    ] as any)
    expect(online.get('ana')).toEqual(['Alpha', 'Beta'])
  })
})
