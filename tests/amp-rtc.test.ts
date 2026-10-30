import { describe, expect, it } from 'vitest'
import { ACCEPT_TO_CONNECT_MS, MAX_SEEN_EVENTS, expireRTCCall, transitionRTCCall, type RTCCall, type RTCEvent } from '@/lib/amp-rtc'

const now = Date.parse('2026-10-28T19:00:00Z')
const initial = (): RTCCall => ({
  callId: 'call-1', caller: 'lola@team.aimaestro.local',
  callee: 'juan@team.aimaestro.local', state: 'inviting',
  expiresAt: new Date(now + 30_000).toISOString(), seenEventIds: [],
})
const event = (type: RTCEvent['type'], actor = initial().callee, deviceId?: string, eventId: string = type): RTCEvent =>
  ({ type, actor, deviceId, callId: 'call-1', eventId })
const ok = (t: ReturnType<typeof transitionRTCCall>) => { if (!t.ok) throw new Error(`unexpected ${t.reason}`); return t.call }
const accepted = () => ok(transitionRTCCall(initial(), event('rtc:accept', initial().callee, 'iphone'), now))

describe('call lifecycle', () => {
  it('rings, accepts, connects and ends', () => {
    const ringing = ok(transitionRTCCall(initial(), event('rtc:ringing'), now))
    const acc = ok(transitionRTCCall(ringing, event('rtc:accept', initial().callee, 'iphone'), now))
    expect(acc.acceptedBy).toBe('iphone')
    const connected = ok(transitionRTCCall(acc, event('rtc:connected', initial().callee, 'iphone'), now))
    expect(ok(transitionRTCCall(connected, event('rtc:end'), now)).state).toBe('ended')
  })

  it('deduplicates by event id and does not mutate', () => {
    const first = ok(transitionRTCCall(initial(), event('rtc:ringing'), now))
    expect(transitionRTCCall(first, event('rtc:ringing'), now)).toEqual({ ok: true, call: first, duplicate: true })
    expect(initial().state).toBe('inviting')
  })

  it('rejects other senders and premature connection', () => {
    expect(transitionRTCCall(initial(), event('rtc:accept', 'attacker@other.provider', 'x'), now)).toEqual({ ok: false, reason: 'unauthorized_actor' })
    expect(transitionRTCCall(initial(), event('rtc:connected'), now)).toEqual({ ok: false, reason: 'invalid_transition' })
    expect(transitionRTCCall(initial(), event('rtc:accept'), now)).toEqual({ ok: false, reason: 'invalid_event' })
  })

  it('only the caller cancels and only the callee answers', () => {
    expect(ok(transitionRTCCall(initial(), event('rtc:cancel', initial().caller), now)).state).toBe('canceled')
    expect(transitionRTCCall(initial(), event('rtc:cancel'), now)).toEqual({ ok: false, reason: 'unauthorized_actor' })
    expect(transitionRTCCall(initial(), event('rtc:reject', initial().caller), now)).toEqual({ ok: false, reason: 'unauthorized_actor' })
  })

  it('nothing moves a finished call', () => {
    const done = ok(transitionRTCCall(initial(), event('rtc:reject'), now))
    expect(transitionRTCCall(done, event('rtc:accept', initial().callee, 'iphone', 'again'), now)).toEqual({ ok: false, reason: 'terminal' })
  })
})

describe('first answer wins', () => {
  it('a second device cannot accept or connect', () => {
    const acc = accepted()
    expect(transitionRTCCall(acc, event('rtc:accept', initial().callee, 'ipad', 'second'), now)).toEqual({ ok: false, reason: 'invalid_transition' })
    expect(transitionRTCCall(acc, event('rtc:connected', initial().callee, 'ipad'), now)).toEqual({ ok: false, reason: 'wrong_device' })
  })

  // Review fix 1: the old check only ran when the event carried a device id
  it('connected without a device id is refused', () => {
    expect(transitionRTCCall(accepted(), event('rtc:connected'), now)).toEqual({ ok: false, reason: 'invalid_event' })
  })
})

describe('time limits', () => {
  it('refuses a late answer and expires an unanswered call', () => {
    expect(transitionRTCCall(initial(), event('rtc:accept', initial().callee, 'iphone'), now + 30_000)).toEqual({ ok: false, reason: 'expired' })
    expect(expireRTCCall(initial(), now + 30_000).state).toBe('timed_out')
    expect(expireRTCCall(initial(), now + 29_999).state).toBe('inviting')
  })

  // Review fix 2: a call stuck in accepted lived forever
  it('an answered call whose media never comes up times out', () => {
    const acc = accepted()
    const late = now + ACCEPT_TO_CONNECT_MS
    expect(expireRTCCall(acc, late - 1).state).toBe('accepted')
    expect(expireRTCCall(acc, late).state).toBe('timed_out')
    expect(transitionRTCCall(acc, event('rtc:connected', initial().callee, 'iphone'), late)).toEqual({ ok: false, reason: 'expired' })
  })

  it('a timed-out call can still be ended or failed by its parties, and a connected call never lapses', () => {
    const acc = accepted()
    expect(ok(transitionRTCCall(acc, event('rtc:failed', initial().caller), now + 60_000)).state).toBe('failed')
    const connected = ok(transitionRTCCall(acc, event('rtc:connected', initial().callee, 'iphone'), now))
    expect(expireRTCCall(connected, now + 3_600_000).state).toBe('connected')
  })
})

describe('bounded history', () => {
  it('keeps only the last event ids, still catching a recent duplicate', () => {
    let call = ok(transitionRTCCall(initial(), event('rtc:ringing'), now))
    call = { ...call, seenEventIds: Array.from({ length: MAX_SEEN_EVENTS }, (_, i) => `old-${i}`) }
    call = ok(transitionRTCCall(call, event('rtc:accept', initial().callee, 'iphone', 'new'), now))
    expect(call.seenEventIds).toHaveLength(MAX_SEEN_EVENTS)
    expect(call.seenEventIds.at(-1)).toBe('new')
    expect(transitionRTCCall(call, event('rtc:accept', initial().callee, 'iphone', 'new'), now)).toMatchObject({ ok: true, duplicate: true })
  })
})
