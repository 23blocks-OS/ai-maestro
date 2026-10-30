import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { fsStore } = vi.hoisted(() => ({ fsStore: {} as Record<string, string> }))

vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn((p: string) => p in fsStore || Object.keys(fsStore).some(k => k.startsWith(p + '/'))),
    mkdirSync: vi.fn(),
    readFileSync: vi.fn((p: string) => { if (p in fsStore) return fsStore[p]; throw new Error('ENOENT') }),
    writeFileSync: vi.fn((p: string, d: string) => { fsStore[p] = d }),
    readdirSync: vi.fn((p: string) => Object.keys(fsStore).filter(k => k.startsWith(p + '/')).map(k => k.slice(p.length + 1))),
  },
}))

import { startCall, sendCallEvent, getCallById, getCalls } from '@/services/calls-service'

const JUAN = 'person:juan-1'
const LOLA = 'agent:lola'
const call = (r: any) => r.data.call
let n = 0
const send = (id: string, type: string, actor: string, deviceId?: string, eventId = `e${++n}`) => sendCallEvent(id, { type, actor, deviceId, eventId })
const begin = (ttlSeconds?: number) => call(startCall({ caller: LOLA, callee: JUAN, ttlSeconds }))

beforeEach(() => {
  for (const k of Object.keys(fsStore)) delete fsStore[k]
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-29T20:00:00Z'))
})
afterEach(() => vi.useRealTimers())

describe('starting a call', () => {
  it('creates an inviting call that expires', () => {
    const r = startCall({ caller: LOLA, callee: JUAN })
    expect(r.status).toBe(201)
    expect(call(r)).toMatchObject({ caller: LOLA, callee: JUAN, state: 'inviting', expiresAt: '2026-10-29T20:00:30.000Z' })
    expect(getCallById(call(r).callId).status).toBe(200)
    expect((getCalls().data as any).calls).toHaveLength(1)
  })

  it('refuses missing, unsafe or equal parties and a silly ttl', () => {
    expect(startCall({ callee: JUAN }).status).toBe(400)
    expect(startCall({ caller: LOLA }).status).toBe(400)
    expect(startCall({ caller: '../x', callee: JUAN }).status).toBe(400)
    expect(startCall({ caller: LOLA, callee: LOLA }).status).toBe(400)
    expect(startCall({ caller: LOLA, callee: JUAN, ttlSeconds: 0 }).status).toBe(400)
    expect(startCall({ caller: LOLA, callee: JUAN, ttlSeconds: 9999 }).status).toBe(400)
    expect((getCalls().data as any).calls).toEqual([])
  })

  it('an unknown or hostile id is 404 or 400, never a throw', () => {
    expect(getCallById('12345678-aaaa').status).toBe(404)
    expect(getCallById('../../etc/passwd').status).toBe(404)
    expect(sendCallEvent('../../etc/passwd', { type: 'rtc:end', actor: JUAN, eventId: 'x' }).status).toBe(400)
  })
})

describe('a call through its events', () => {
  it('rings, is answered, connects and ends', () => {
    const { callId } = begin()
    expect(call(send(callId, 'rtc:ringing', JUAN)).state).toBe('ringing')
    expect(call(send(callId, 'rtc:accept', JUAN, 'iphone')).state).toBe('accepted')
    expect(call(send(callId, 'rtc:connected', JUAN, 'iphone')).state).toBe('connected')
    expect(call(send(callId, 'rtc:end', LOLA)).state).toBe('ended')
    expect(call(getCallById(callId)).state).toBe('ended')
  })

  it('two phones answer together: the first wins, the second is refused with 409', () => {
    const { callId } = begin()
    expect(send(callId, 'rtc:accept', JUAN, 'iphone').status).toBe(200)
    const second = send(callId, 'rtc:accept', JUAN, 'ipad')
    expect(second.status).toBe(409)
    expect(call(getCallById(callId)).acceptedBy).toBe('iphone')
    expect(send(callId, 'rtc:connected', JUAN, 'ipad').status).toBe(409)
  })

  it('repeating an event id is safe', () => {
    const { callId } = begin()
    send(callId, 'rtc:ringing', JUAN, undefined, 'same')
    const again = send(callId, 'rtc:ringing', JUAN, undefined, 'same')
    expect(again.status).toBe(200)
    expect((again.data as any).duplicate).toBe(true)
  })

  it('refuses an outsider with 403 and a bad event with 400', () => {
    const { callId } = begin()
    expect(send(callId, 'rtc:accept', 'person:mallory', 'x').status).toBe(403)
    expect(send(callId, 'rtc:accept', JUAN).status).toBe(400)
    expect(sendCallEvent(callId, { type: 'rtc:bogus', actor: JUAN, eventId: 'z' }).status).toBe(400)
    expect(sendCallEvent(callId, { type: 'rtc:invite', actor: LOLA, eventId: 'z' }).status).toBe(400)
    expect(sendCallEvent(callId, { type: 'rtc:end', actor: JUAN }).status).toBe(400)
    expect(call(getCallById(callId)).state).toBe('inviting')
  })
})

describe('time running out', () => {
  it('a late answer is 410 and the call is recorded as timed out', () => {
    const { callId } = begin(10)
    vi.advanceTimersByTime(10_000)
    const late = send(callId, 'rtc:accept', JUAN, 'iphone')
    expect(late.status).toBe(410)
    expect(call(getCallById(callId)).state).toBe('timed_out')
  })

  it('an answered call whose media never comes up times out', () => {
    const { callId } = begin()
    send(callId, 'rtc:accept', JUAN, 'iphone')
    vi.advanceTimersByTime(15_000)
    expect(call(getCallById(callId)).state).toBe('timed_out')
    expect(send(callId, 'rtc:connected', JUAN, 'iphone').status).toBe(410)
  })
})
