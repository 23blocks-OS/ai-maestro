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
vi.mock('@/lib/agent-registry', () => ({ getAgent: (id: string) => (id === 'agent-1' ? { id, name: 'titania' } : null) }))

import { pairDevice, listDevices } from '@/services/person-devices-service'
import { getDevice } from '@/lib/person-devices-registry'
import { pushNeedsYou, pushCall, COOLDOWN_MS } from '@/lib/push-expo'

const TOKEN = 'ExponentPushToken[abcdefghijklmnop]'
const P1 = 'f3b1c2d4-0000-4000-8000-000000000001'
const pair = (id: string, extra: Record<string, unknown> = {}) => pairDevice(id, { personId: P1, ...extra })
const ok = (n = 1) => ({ ok: true, json: async () => ({ data: Array.from({ length: n }, (_, i) => ({ status: 'ok', id: `t${i}` })) }) })

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

describe('push fields on the paired device', () => {
  it('stores the token and types, and never returns the token', () => {
    const r = pair('device-ana-1', { pushToken: TOKEN, pushTypes: ['needs_you'] })
    expect(r.status).toBe(200)
    expect((r as any).data.device).toMatchObject({ pushEnabled: true, pushTypes: ['needs_you'] })
    expect(JSON.stringify(listDevices())).not.toContain('abcdefghijklmnop')
    expect(getDevice('device-ana-1')!.pushToken).toBe(TOKEN)
  })

  it('a heartbeat without push fields keeps what is stored', () => {
    pair('device-ana-1', { pushToken: TOKEN, pushTypes: ['needs_you'] })
    pair('device-ana-1')
    expect(getDevice('device-ana-1')).toMatchObject({ pushToken: TOKEN, pushTypes: ['needs_you'] })
  })

  it('null token clears both; empty types clears the token', () => {
    pair('device-ana-1', { pushToken: TOKEN, pushTypes: ['needs_you'] })
    pair('device-ana-1', { pushToken: null, pushTypes: [] })
    expect(getDevice('device-ana-1')!.pushToken).toBeUndefined()
    expect(getDevice('device-ana-1')!.pushTypes).toBeUndefined()
    pair('device-ana-1', { pushToken: TOKEN, pushTypes: ['needs_you'] })
    pair('device-ana-1', { pushTypes: [] })
    expect(getDevice('device-ana-1')!.pushToken).toBeUndefined()
  })

  it('refuses a token that is not Expo\'s and unknown types', () => {
    expect(pair('device-ana-1', { pushToken: 'abc' }).status).toBe(400)
    expect(pair('device-ana-1', { pushToken: 42 }).status).toBe(400)
    expect(pair('device-ana-1', { pushTypes: ['spam'] }).status).toBe(400)
    expect(pair('device-ana-1', { pushTypes: 'needs_you' }).status).toBe(400)
  })
})

describe('pushNeedsYou', () => {
  it('sends a thin message to opted-in devices only', async () => {
    pair('device-ana-1', { pushToken: TOKEN, pushTypes: ['needs_you'] })
    pair('device-ana-2', { pushToken: 'ExponentPushToken[zzzzzzzzzzzzzzzz]', pushTypes: ['call'] })
    pair('device-ana-3')
    const fetchMock = vi.fn().mockResolvedValue(ok())
    vi.stubGlobal('fetch', fetchMock)
    await pushNeedsYou('agent-1', 'titania')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://exp.host/--/api/v2/push/send')
    const sent = JSON.parse(init.body)
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({
      to: TOKEN, title: 'titania needs you', channelId: 'needs_you', interruptionLevel: 'time-sensitive',
      data: { type: 'needs_you', agentId: 'agent-1', hostId: 'self-host' },
    })
  })

  it('does nothing, and makes no request, when no device opted in', async () => {
    pair('device-ana-1')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await pushNeedsYou('agent-1', 'titania')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sends once per agent per window', async () => {
    pair('device-ana-1', { pushToken: TOKEN, pushTypes: ['needs_you'] })
    const fetchMock = vi.fn().mockResolvedValue(ok())
    vi.stubGlobal('fetch', fetchMock)
    await pushNeedsYou('agent-1', 'titania')
    await pushNeedsYou('agent-1', 'titania')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await pushNeedsYou('agent-2', 'oberon')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(COOLDOWN_MS + 1)
    await pushNeedsYou('agent-1', 'titania')
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('drops a token Expo says is no longer registered', async () => {
    pair('device-ana-1', { pushToken: TOKEN, pushTypes: ['needs_you'] })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [{ status: 'error', details: { error: 'DeviceNotRegistered' } }] }) }))
    await pushNeedsYou('agent-1', 'titania')
    expect(getDevice('device-ana-1')!.pushToken).toBeUndefined()
    // lastSeenAt untouched: clearing a token must not make the device look online
    expect(getDevice('device-ana-1')!.lastSeenAt).toBe('2026-10-29T20:00:00.000Z')
  })

  it('drops a token that the receipt later reports as dead', async () => {
    pair('device-ana-1', { pushToken: TOKEN, pushTypes: ['needs_you'] })
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(ok())
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { t0: { status: 'error', details: { error: 'DeviceNotRegistered' } } } }) })
    vi.stubGlobal('fetch', fetchMock)
    await pushNeedsYou('agent-1', 'titania')
    await vi.advanceTimersByTimeAsync(15 * 60_000 + 1)
    expect(fetchMock.mock.calls[1][0]).toContain('getReceipts')
    expect(getDevice('device-ana-1')!.pushToken).toBeUndefined()
  })

  it('a host without internet skips quietly: no throw, one log line', async () => {
    pair('device-ana-1', { pushToken: TOKEN, pushTypes: ['needs_you'] })
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('getaddrinfo ENOTFOUND exp.host')))
    await expect(pushNeedsYou('agent-1', 'titania')).resolves.toBeUndefined()
    vi.advanceTimersByTime(COOLDOWN_MS + 1)
    await pushNeedsYou('agent-1', 'titania')
    expect(log.mock.calls.filter(c => String(c[0]).includes('[Push]'))).toHaveLength(1)
    expect(getDevice('device-ana-1')!.pushToken).toBe(TOKEN)
    log.mockRestore()
  })
})

describe('pushCall', () => {
  const ring = (over: Record<string, unknown> = {}) => ({ callId: 'call-12345678', caller: 'agent:agent-1', callee: `person:${P1}`, expiresAt: '2026-10-29T20:00:30.000Z', ...over })

  it('rings only the callee\'s phones that opted in to call, with a ttl matching the ringing time', async () => {
    pair('device-ana-1', { pushToken: TOKEN, pushTypes: ['call'] })
    pair('device-ana-2', { pushToken: 'ExponentPushToken[zzzzzzzzzzzzzzzz]', pushTypes: ['needs_you'] })
    pairDevice('device-bob-1', { personId: 'f3b1c2d4-0000-4000-8000-000000000002', pushToken: 'ExponentPushToken[bbbbbbbbbbbbbbbb]', pushTypes: ['call'] })
    const fetchMock = vi.fn().mockResolvedValue(ok())
    vi.stubGlobal('fetch', fetchMock)
    await pushCall(ring())
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ to: TOKEN, title: 'titania is calling', channelId: 'call', ttl: 30, data: { type: 'call', callId: 'call-12345678', hostId: 'self-host' } })
  })

  it('does nothing for an agent callee or a call that has already lapsed', async () => {
    pair('device-ana-1', { pushToken: TOKEN, pushTypes: ['call'] })
    const fetchMock = vi.fn().mockResolvedValue(ok())
    vi.stubGlobal('fetch', fetchMock)
    await pushCall(ring({ callee: 'agent:lola' }))
    await pushCall(ring({ expiresAt: '2026-10-29T19:59:59.000Z' }))
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
