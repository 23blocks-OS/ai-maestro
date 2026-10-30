/**
 * Calls Service
 *
 * A call between a caller and a callee (a person or an agent) moves through the states in
 * lib/amp-rtc.ts. This service creates calls and applies events to them; the store arbitrates
 * who answered first. No media here: a call is signalling only until the audio layer exists
 * (F052). No login, by design: `actor` is claimed by whoever sends the event, as everywhere in
 * AI Maestro the network is the trust boundary.
 */

import { createCall, getCall, listCalls, applyCallEvent, isCallId } from '@/lib/call-store'
import { pushCall } from '@/lib/push-expo'
import { RTC_EVENT_TYPES, type RTCCall, type RTCEvent } from '@/lib/amp-rtc'
import { type ServiceResult, missingField, invalidField, notFound, serviceError, operationFailed } from '@/services/service-errors'

const PARTY = /^[A-Za-z0-9][A-Za-z0-9@._:-]{0,127}$/
const DEFAULT_TTL_S = 30
const MAX_TTL_S = 120

const party = (v: unknown) => typeof v === 'string' && PARTY.test(v)

const LIVE = new Set(['inviting', 'ringing', 'accepted', 'connected'])

/** The app polls this for its own calls: ?callee=person:<id>&active=1 */
export function getCalls(opts: { caller?: string | null; callee?: string | null; active?: boolean } = {}): ServiceResult<{ calls: RTCCall[] }> {
  const calls = listCalls()
    .filter(c => !opts.caller || c.caller === opts.caller)
    .filter(c => !opts.callee || c.callee === opts.callee)
    .filter(c => !opts.active || LIVE.has(c.state))
  return { data: { calls }, status: 200 }
}

export function getCallById(id: string): ServiceResult<{ call: RTCCall }> {
  const call = getCall(id)
  return call ? { data: { call }, status: 200 } : notFound('Call', id)
}

export function startCall(params: Record<string, unknown>): ServiceResult<{ call: RTCCall }> {
  if (params.caller === undefined || params.caller === '') return missingField('caller')
  if (params.callee === undefined || params.callee === '') return missingField('callee')
  if (!party(params.caller)) return invalidField('caller', 'caller must be an id or address of letters, digits and @ . _ : -')
  if (!party(params.callee)) return invalidField('callee', 'callee must be an id or address of letters, digits and @ . _ : -')
  if (params.caller === params.callee) return invalidField('callee', 'a call needs two parties')
  const ttl = params.ttlSeconds ?? DEFAULT_TTL_S
  if (typeof ttl !== 'number' || !Number.isFinite(ttl) || ttl < 1 || ttl > MAX_TTL_S) return invalidField('ttlSeconds', `ttlSeconds must be 1 to ${MAX_TTL_S}`)
  try {
    const call = createCall(params.caller as string, params.callee as string, ttl * 1000)
    // Ring the callee's phone. Fire-and-forget: a push must never delay or fail starting the call.
    pushCall(call).catch(err => console.warn('[Push] call push failed:', err))
    return { data: { call }, status: 201 }
  } catch (error) {
    return operationFailed('start call', (error as Error).message)
  }
}

// 410: the call ran out of time; 409: the call is not in a state that takes this event
const REFUSED: Record<string, [number, string]> = {
  invalid_event: [400, 'invalid_request'],
  unauthorized_actor: [403, 'forbidden'],
  expired: [410, 'gone'],
  terminal: [409, 'invalid_state'],
  invalid_transition: [409, 'invalid_state'],
  wrong_device: [409, 'invalid_state'],
}

export function sendCallEvent(id: string, params: Record<string, unknown>): ServiceResult<{ call: RTCCall; duplicate?: boolean }> {
  if (!isCallId(id)) return invalidField('id', 'not a call id')
  if (!(RTC_EVENT_TYPES as readonly unknown[]).includes(params.type) || params.type === 'rtc:invite') return invalidField('type', `type must be one of: ${RTC_EVENT_TYPES.filter(t => t !== 'rtc:invite').join(', ')}`)
  if (typeof params.eventId !== 'string' || !params.eventId || params.eventId.length > 128) return invalidField('eventId', 'eventId is required (up to 128 characters), repeat it to retry safely')
  if (!party(params.actor)) return invalidField('actor', 'actor is required')
  if (params.deviceId !== undefined && !party(params.deviceId)) return invalidField('deviceId', 'deviceId must be letters, digits and @ . _ : -')
  const event: RTCEvent = { type: params.type as RTCEvent['type'], callId: id, eventId: params.eventId, actor: params.actor as string, deviceId: params.deviceId as string | undefined }
  const result = applyCallEvent(id, event)
  if (result.ok) return { data: { call: result.call, ...(result.duplicate ? { duplicate: true } : {}) }, status: 200 }
  if (result.reason === 'not_found') return notFound('Call', id)
  const [status, code] = REFUSED[result.reason] || [409, 'invalid_state']
  return serviceError(code as 'invalid_state', `The call did not accept ${event.type}: ${result.reason}`, status, { details: { reason: result.reason } })
}
