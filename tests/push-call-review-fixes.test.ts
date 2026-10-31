/** Fixes from the review of the 2026-10-29 push and call changes (#714-#718). */
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
vi.mock('@/lib/agent-registry', () => ({ getAgent: (id: string) => (id === 'ghost' ? null : { id, name: id }), getAgentBySession: () => null }))
vi.mock('@/lib/people-registry', () => ({
  getPerson: (id: string) => (id === 'p-ana' ? { id, displayName: 'Ana' } : null),
  isPersonId: (id: unknown) => typeof id === 'string' && /^[A-Za-z0-9][A-Za-z0-9-]{0,63}$/.test(id),
}))

import fs from 'fs'
import { pairDevice } from '@/services/person-devices-service'
import { getDevice, loadDevices, DEVICE_MAX_AGE_MS } from '@/lib/person-devices-registry'
import { pushNeedsYou, pushCall, CALL_COOLDOWN_MS } from '@/lib/push-expo'
import { createCall, listCalls, applyCallEvent, getCall, FINISHED_CALL_TTL_MS } from '@/lib/call-store'
import { MAX_CONNECTED_MS, ACCEPT_TO_CONNECT_MS } from '@/lib/amp-rtc'
import { POST as postCall } from '@/app/api/calls/route'

const OLD = 'ExponentPushToken[oldoldoldoldoldo]'
const NEW = 'ExponentPushToken[newnewnewnewnewn]'
const P1 = 'p-ana'
const ok = (ids: string[]) => ({ ok: true, json: async () => ({ data: ids.map(id => ({ status: 'ok', id })) }) })
const deadReceipt = (id: string) => ({ ok: true, json: async () => ({ data: { [id]: { status: 'error', details: { error: 'DeviceNotRegistered' } } } }) })

beforeEach(() => {
  for (const k of Object.keys(fsStore)) delete fsStore[k]
  ;(globalThis as any)._pushLastSent?.clear()
  ;(globalThis as any)._pushOfflineLogged = false
  const q = (globalThis as any)._pushReceipts
  if (q) { clearTimeout(q.timer); q.timer = null; q.pending.length = 0 }
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-29T20:00:00Z'))
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('push tokens', () => {
  it('a late dead-receipt for the old token does not clear the new one', async () => {
    pairDevice('device-ana-1', { personId: P1, pushToken: OLD, pushTypes: ['needs_you'] })
    const fetchMock = vi.fn().mockResolvedValueOnce(ok(['t-old'])).mockResolvedValueOnce(deadReceipt('t-old'))
    vi.stubGlobal('fetch', fetchMock)
    await pushNeedsYou('lola', 'lola')
    pairDevice('device-ana-1', { personId: P1, pushToken: NEW, pushTypes: ['needs_you'] }) // new phone, same app id
    await vi.advanceTimersByTimeAsync(15 * 60_000 + 1)
    expect(fetchMock.mock.calls[1][0]).toContain('getReceipts')
    expect(getDevice('device-ana-1')!.pushToken).toBe(NEW)
  })

  it('receipts for many sends go in one request after 15 minutes', async () => {
    pairDevice('device-ana-1', { personId: P1, pushToken: OLD, pushTypes: ['needs_you'] })
    const fetchMock = vi.fn().mockResolvedValueOnce(ok(['a'])).mockResolvedValueOnce(ok(['b'])).mockResolvedValue({ ok: true, json: async () => ({ data: {} }) })
    vi.stubGlobal('fetch', fetchMock)
    await pushNeedsYou('lola', 'lola')
    await pushNeedsYou('other', 'other')
    await vi.advanceTimersByTimeAsync(15 * 60_000 + 1)
    const receiptCalls = fetchMock.mock.calls.filter(c => String(c[0]).includes('getReceipts'))
    expect(receiptCalls).toHaveLength(1)
    expect(JSON.parse(receiptCalls[0][1].body).ids).toEqual(['a', 'b'])
  })

  it('needs-you checks its cooldown before reading any device file', async () => {
    pairDevice('device-ana-1', { personId: P1, pushToken: OLD, pushTypes: ['needs_you'] })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok(['x'])))
    await pushNeedsYou('lola', 'lola')
    const reads = (fs.readdirSync as any).mock.calls.length
    await pushNeedsYou('lola', 'lola')
    expect((fs.readdirSync as any).mock.calls.length).toBe(reads)
  })

  it('after an outage and a success, the next outage is logged again', async () => {
    pairDevice('device-ana-1', { personId: P1, pushToken: OLD, pushTypes: ['needs_you'] })
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce(ok(['y'])).mockRejectedValueOnce(new Error('down again')))
    await pushNeedsYou('a', 'a'); await pushNeedsYou('b', 'b'); await pushNeedsYou('c', 'c')
    expect(log.mock.calls.filter(c => String(c[0]).includes('unreachable'))).toHaveLength(2)
    log.mockRestore()
  })
})

describe('call pushes', () => {
  const call = (caller: string) => ({ callId: 'call-12345678', caller, callee: `person:${P1}`, expiresAt: '2026-10-29T20:00:30.000Z' })

  it('rings a callee at most once per window', async () => {
    pairDevice('device-ana-1', { personId: P1, pushToken: OLD, pushTypes: ['call'] })
    const fetchMock = vi.fn().mockResolvedValue(ok(['z']))
    vi.stubGlobal('fetch', fetchMock)
    await pushCall(call('agent:lola'))
    await pushCall(call('agent:lola'))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    vi.setSystemTime(Date.now() + CALL_COOLDOWN_MS + 1)
    await pushCall({ ...call('agent:lola'), expiresAt: new Date(Date.now() + 30_000).toISOString() })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('names only callers this host knows; anything else is "Someone"', async () => {
    pairDevice('device-ana-1', { personId: P1, pushToken: OLD, pushTypes: ['call'] })
    const fetchMock = vi.fn().mockResolvedValue(ok(['z']))
    vi.stubGlobal('fetch', fetchMock)
    const titles: string[] = []
    for (const caller of ['agent:lola', 'person:p-ana', 'ceo@bank', 'agent:ghost']) {
      ;(globalThis as any)._pushLastSent.clear()
      await pushCall(call(caller))
      titles.push(JSON.parse(fetchMock.mock.calls.at(-1)![1].body)[0].title)
    }
    expect(titles).toEqual(['lola is calling', 'Ana is calling', 'Someone is calling', 'Someone is calling'])
  })
})

describe('bounded files', () => {
  it('devices not seen for 30 days are forgotten', () => {
    pairDevice('device-old-1', { personId: P1 })
    vi.setSystemTime(Date.now() + DEVICE_MAX_AGE_MS / 2)
    pairDevice('device-new-1', { personId: P1 })
    vi.setSystemTime(Date.now() + DEVICE_MAX_AGE_MS / 2 + 1000)
    expect(loadDevices().map(d => d.deviceId)).toEqual(['device-new-1'])
    expect(getDevice('device-old-1')).toBeNull()
  })

  it('finished calls are deleted after a day; live calls are kept', () => {
    const done = createCall('agent:lola', `person:${P1}`, 30_000)
    applyCallEvent(done.callId, { type: 'rtc:reject', callId: done.callId, eventId: 'e1', actor: `person:${P1}` })
    vi.setSystemTime(Date.now() + FINISHED_CALL_TTL_MS + 60_000)
    const live = createCall('agent:lola', `person:${P1}`, 30_000)
    expect(listCalls().map(c => c.callId)).toEqual([live.callId])
    expect(getCall(done.callId)).toBeNull()
  })
})

describe('call lifecycle edges', () => {
  const party = `person:${P1}`
  it('a connected call nobody ended times out after the maximum', () => {
    const c = createCall('agent:lola', party, 30_000)
    applyCallEvent(c.callId, { type: 'rtc:accept', callId: c.callId, eventId: 'a', actor: party, deviceId: 'iphone' })
    applyCallEvent(c.callId, { type: 'rtc:connected', callId: c.callId, eventId: 'b', actor: party, deviceId: 'iphone' })
    vi.setSystemTime(Date.now() + MAX_CONNECTED_MS - 1000)
    expect(getCall(c.callId)!.state).toBe('connected')
    vi.setSystemTime(Date.now() + 2000)
    expect(getCall(c.callId)!.state).toBe('timed_out')
  })

  it('a stuck answered call can still be ended by its parties before anyone reads it', () => {
    const c = createCall('agent:lola', party, 30_000)
    applyCallEvent(c.callId, { type: 'rtc:accept', callId: c.callId, eventId: 'a', actor: party, deviceId: 'iphone' })
    vi.setSystemTime(Date.now() + ACCEPT_TO_CONNECT_MS + 1000)
    const r = applyCallEvent(c.callId, { type: 'rtc:end', callId: c.callId, eventId: 'z', actor: 'agent:lola' })
    expect(r).toMatchObject({ ok: true, call: { state: 'ended' } })
  })
})

describe('request bodies', () => {
  it('a JSON null body is a 400, not a 500', async () => {
    const res = await postCall(new Request('http://x/api/calls', { method: 'POST', body: 'null', headers: { 'Content-Type': 'application/json' } }) as any)
    expect(res.status).toBe(400)
  })
})
