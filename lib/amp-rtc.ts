/**
 * AMP-RTC v1 call lifecycle — pure, transport-independent state transitions.
 * This module is NOT a call server, media adapter, push gateway or authorization
 * boundary. Callers must authenticate AMP messages and persist/arbitrate state.
 */
export const RTC_EVENT_TYPES = [
  'rtc:invite', 'rtc:ringing', 'rtc:accept', 'rtc:reject',
  'rtc:cancel', 'rtc:connected', 'rtc:end', 'rtc:failed',
] as const

export type RTCEventType = typeof RTC_EVENT_TYPES[number]
export type RTCCallState =
  | 'inviting' | 'ringing' | 'accepted' | 'connected'
  | 'rejected' | 'canceled' | 'ended' | 'failed' | 'timed_out'

export interface RTCCall {
  callId: string
  caller: string
  callee: string
  state: RTCCallState
  expiresAt: string
  acceptedBy?: string
  seenEventIds: readonly string[]
}

export interface RTCEvent {
  type: RTCEventType
  callId: string
  eventId: string
  actor: string
  deviceId?: string
}

export type RTCTransition =
  | { ok: true; call: RTCCall; duplicate?: boolean }
  | { ok: false; reason: 'invalid_event' | 'wrong_call' | 'unauthorized_actor' | 'expired' | 'terminal' | 'invalid_transition' | 'wrong_device' }

const TERMINAL = new Set<RTCCallState>(['rejected', 'canceled', 'ended', 'failed', 'timed_out'])

const NEXT: Record<RTCCallState, Partial<Record<RTCEventType, RTCCallState>>> = {
  inviting: { 'rtc:ringing': 'ringing', 'rtc:accept': 'accepted', 'rtc:reject': 'rejected', 'rtc:cancel': 'canceled', 'rtc:failed': 'failed' },
  ringing: { 'rtc:accept': 'accepted', 'rtc:reject': 'rejected', 'rtc:cancel': 'canceled', 'rtc:failed': 'failed' },
  accepted: { 'rtc:connected': 'connected', 'rtc:end': 'ended', 'rtc:failed': 'failed' },
  connected: { 'rtc:end': 'ended', 'rtc:failed': 'failed' },
  rejected: {}, canceled: {}, ended: {}, failed: {}, timed_out: {},
}

/**
 * Deterministic state transition for a single authoritative call record.
 * IMPORTANT: multi-device first-answer-wins requires an atomic database
 * compare-and-swap around this function. Do not use in-memory state as the
 * source of truth in a distributed deployment.
 */
export function transitionRTCCall(call: RTCCall, event: RTCEvent, nowMs: number): RTCTransition {
  if (!RTC_EVENT_TYPES.includes(event.type) || !event.eventId) return { ok: false, reason: 'invalid_event' }
  if (event.callId !== call.callId) return { ok: false, reason: 'wrong_call' }
  if (call.seenEventIds.includes(event.eventId)) return { ok: true, call, duplicate: true }
  if (TERMINAL.has(call.state)) return { ok: false, reason: 'terminal' }

  const isCaller = event.actor === call.caller
  const isCallee = event.actor === call.callee
  const callerOnly = event.type === 'rtc:cancel'
  const calleeOnly = ['rtc:ringing', 'rtc:accept', 'rtc:reject'].includes(event.type)
  if ((callerOnly && !isCaller) || (calleeOnly && !isCallee) || (!callerOnly && !calleeOnly && !isCaller && !isCallee)) {
    return { ok: false, reason: 'unauthorized_actor' }
  }

  const expires = Date.parse(call.expiresAt)
  if (!Number.isFinite(expires)) return { ok: false, reason: 'invalid_event' }
  if (nowMs >= expires && (call.state === 'inviting' || call.state === 'ringing')) {
    return { ok: false, reason: 'expired' }
  }

  const state = NEXT[call.state][event.type]
  if (!state) return { ok: false, reason: 'invalid_transition' }
  if (call.acceptedBy && event.deviceId && event.deviceId !== call.acceptedBy && event.type === 'rtc:connected') {
    return { ok: false, reason: 'wrong_device' }
  }
  if (event.type === 'rtc:accept' && !event.deviceId) return { ok: false, reason: 'invalid_event' }

  return {
    ok: true,
    call: {
      ...call,
      state,
      acceptedBy: event.type === 'rtc:accept' ? event.deviceId : call.acceptedBy,
      seenEventIds: [...call.seenEventIds, event.eventId],
    },
  }
}

export function expireRTCCall(call: RTCCall, nowMs: number): RTCCall {
  const expires = Date.parse(call.expiresAt)
  if (Number.isFinite(expires) && nowMs >= expires && (call.state === 'inviting' || call.state === 'ringing')) {
    return { ...call, state: 'timed_out' }
  }
  return call
}
