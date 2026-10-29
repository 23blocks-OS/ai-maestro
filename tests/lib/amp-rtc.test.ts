import { describe, expect, it } from 'vitest'
import { expireRTCCall, transitionRTCCall, type RTCCall, type RTCEvent } from '@/lib/amp-rtc'

const now = Date.parse('2026-10-28T19:00:00Z')
const initial = (): RTCCall => ({
  callId: 'call-1', caller: 'lola@team.aimaestro.local',
  callee: 'juan@team.aimaestro.local', state: 'inviting',
  expiresAt: new Date(now + 30_000).toISOString(), seenEventIds: [],
})
const event = (type: RTCEvent['type'], actor = initial().callee, deviceId?: string): RTCEvent =>
  ({ type, actor, deviceId, callId: 'call-1', eventId: type })

describe('AMP-RTC call lifecycle', () => {
  it('rings, accepts, connects and ends', () => {
    const ringing = transitionRTCCall(initial(), event('rtc:ringing'), now)
    expect(ringing.ok).toBe(true)
    if (!ringing.ok) return
    const accepted = transitionRTCCall(ringing.call, event('rtc:accept', initial().callee, 'iphone'), now)
    expect(accepted.ok).toBe(true)
    if (!accepted.ok) return
    expect(accepted.call.acceptedBy).toBe('iphone')
    const connected = transitionRTCCall(accepted.call, event('rtc:connected', initial().callee, 'iphone'), now)
    expect(connected.ok).toBe(true)
    if (!connected.ok) return
    const ended = transitionRTCCall(connected.call, event('rtc:end'), now)
    expect(ended.ok && ended.call.state).toBe('ended')
  })

  it('deduplicates by event id', () => {
    const first = transitionRTCCall(initial(), event('rtc:ringing'), now)
    if (!first.ok) throw new Error('unexpected')
    expect(transitionRTCCall(first.call, event('rtc:ringing'), now)).toEqual({ ok: true, call: first.call, duplicate: true })
  })

  it('rejects untrusted callers and premature connection', () => {
    expect(transitionRTCCall(initial(), event('rtc:accept', 'attacker@other.provider', 'x'), now)).toEqual({ ok: false, reason: 'unauthorized_actor' })
    expect(transitionRTCCall(initial(), event('rtc:connected'), now)).toEqual({ ok: false, reason: 'invalid_transition' })
  })

  it('rejects late acceptance and expires unanswered calls', () => {
    expect(transitionRTCCall(initial(), event('rtc:accept', initial().callee, 'iphone'), now + 30_000)).toEqual({ ok: false, reason: 'expired' })
    expect(expireRTCCall(initial(), now + 30_000).state).toBe('timed_out')
  })

  it('does not allow a second device to connect', () => {
    const accepted = transitionRTCCall(initial(), event('rtc:accept', initial().callee, 'iphone'), now)
    if (!accepted.ok) throw new Error('unexpected')
    expect(transitionRTCCall(accepted.call, event('rtc:connected', initial().callee, 'ipad'), now)).toEqual({ ok: false, reason: 'wrong_device' })
    expect(transitionRTCCall(accepted.call, { ...event('rtc:accept', initial().callee, 'ipad'), eventId: 'second' }, now)).toEqual({ ok: false, reason: 'invalid_transition' })
  })

  it('allows the caller to cancel before acceptance', () => {
    const result = transitionRTCCall(initial(), event('rtc:cancel', initial().caller), now)
    expect(result.ok && result.call.state).toBe('canceled')
  })
})
