/**
 * Call lifecycle: pure state transitions for one call, independent of transport and media.
 *
 * Based on the state machine in draft PR #701 (AMP-RTC), with the two fixes found in review
 * (F051): `rtc:connected` must name the device that accepted, and a call stuck in `accepted`
 * (the phone answered, the media never came up) times out. The list of seen event ids is bounded.
 *
 * This is not a call server, a media adapter or an authorization boundary. The caller
 * authenticates the sender and stores the record; first-answer-wins across devices needs the
 * store to apply a transition atomically (compare the state it read, then write).
 */
export const RTC_EVENT_TYPES = [
  'rtc:invite', 'rtc:ringing', 'rtc:accept', 'rtc:reject',
  'rtc:cancel', 'rtc:connected', 'rtc:end', 'rtc:failed',
] as const

export type RTCEventType = typeof RTC_EVENT_TYPES[number]
export type RTCCallState =
  | 'inviting' | 'ringing' | 'accepted' | 'connected'
  | 'rejected' | 'canceled' | 'ended' | 'failed' | 'timed_out'

/** How long an answered call may wait for its media before it counts as lost */
export const ACCEPT_TO_CONNECT_MS = 15_000
/** A connected call nobody ended (the phone died, the tab closed) is over after this */
export const MAX_CONNECTED_MS = 4 * 60 * 60 * 1000
/** Event ids remembered per call for duplicate detection */
export const MAX_SEEN_EVENTS = 64

export interface RTCCall {
  callId: string
  caller: string
  callee: string
  state: RTCCallState
  /** The invitation lapses at this time (inviting, ringing) */
  expiresAt: string
  acceptedBy?: string
  acceptedAt?: string
  connectedAt?: string
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

/** Has this call's time run out? Inviting and ringing wait for an answer, accepted for media, connected for an end. */
function lapsed(call: RTCCall, nowMs: number): boolean {
  if (call.state === 'inviting' || call.state === 'ringing') {
    const expires = Date.parse(call.expiresAt)
    return Number.isFinite(expires) && nowMs >= expires
  }
  if (call.state === 'accepted') {
    const accepted = Date.parse(call.acceptedAt || '')
    return Number.isFinite(accepted) && nowMs - accepted >= ACCEPT_TO_CONNECT_MS
  }
  if (call.state === 'connected') {
    const connected = Date.parse(call.connectedAt || '')
    return Number.isFinite(connected) && nowMs - connected >= MAX_CONNECTED_MS
  }
  return false
}

/** Deterministic transition for one call record. Does not mutate its input. */
export function transitionRTCCall(call: RTCCall, event: RTCEvent, nowMs: number): RTCTransition {
  if (!RTC_EVENT_TYPES.includes(event.type) || !event.eventId) return { ok: false, reason: 'invalid_event' }
  if (event.callId !== call.callId) return { ok: false, reason: 'wrong_call' }
  if (call.seenEventIds.includes(event.eventId)) return { ok: true, call, duplicate: true }
  if (TERMINAL.has(call.state)) return { ok: false, reason: 'terminal' }

  const isCaller = event.actor === call.caller
  const isCallee = event.actor === call.callee
  const callerOnly = event.type === 'rtc:cancel'
  const calleeOnly = event.type === 'rtc:ringing' || event.type === 'rtc:accept' || event.type === 'rtc:reject'
  if ((callerOnly && !isCaller) || (calleeOnly && !isCallee) || (!callerOnly && !calleeOnly && !isCaller && !isCallee)) {
    return { ok: false, reason: 'unauthorized_actor' }
  }

  if (!Number.isFinite(Date.parse(call.expiresAt))) return { ok: false, reason: 'invalid_event' }
  // A call whose time ran out can still be ended or failed, but nothing can move it forward
  if (lapsed(call, nowMs) && event.type !== 'rtc:end' && event.type !== 'rtc:failed') return { ok: false, reason: 'expired' }

  const state = NEXT[call.state][event.type]
  if (!state) return { ok: false, reason: 'invalid_transition' }
  if (event.type === 'rtc:accept' && !event.deviceId) return { ok: false, reason: 'invalid_event' }
  // The media must come up on the device that answered, and the event must say which device it is
  if (event.type === 'rtc:connected' && (!event.deviceId || event.deviceId !== call.acceptedBy)) {
    return { ok: false, reason: event.deviceId ? 'wrong_device' : 'invalid_event' }
  }

  const accepting = event.type === 'rtc:accept'
  return {
    ok: true,
    call: {
      ...call,
      state,
      acceptedBy: accepting ? event.deviceId : call.acceptedBy,
      acceptedAt: accepting ? new Date(nowMs).toISOString() : call.acceptedAt,
      connectedAt: event.type === 'rtc:connected' ? new Date(nowMs).toISOString() : call.connectedAt,
      seenEventIds: [...call.seenEventIds, event.eventId].slice(-MAX_SEEN_EVENTS),
    },
  }
}

/** Move a call whose waiting time ran out to `timed_out` (a timer or a read calls this). */
export function expireRTCCall(call: RTCCall, nowMs: number): RTCCall {
  return lapsed(call, nowMs) ? { ...call, state: 'timed_out' } : call
}
