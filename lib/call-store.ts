/**
 * Call store: one JSON file per call.
 * Storage: ~/.aimaestro/calls/{callId}.json, on the host that arbitrates the call.
 *
 * `applyCallEvent` reads, transitions and writes with synchronous file calls and no await in
 * between, so two answers arriving at the same moment are applied one after the other and the
 * second sees the first (first answer wins). That holds for one server process, which is how a
 * host runs; shortcut: no cross-process lock, add a lock file if a host ever runs several
 * AI Maestro processes on one home directory.
 */

import fs from 'fs'
import path from 'path'
import os from 'os'
import { v4 as uuidv4 } from 'uuid'
import { expireRTCCall, transitionRTCCall, type RTCCall, type RTCEvent, type RTCTransition } from '@/lib/amp-rtc'

const CALLS_DIR = path.join(os.homedir(), '.aimaestro', 'calls')

export const CALL_ID = /^[A-Za-z0-9][A-Za-z0-9-]{7,63}$/
export const isCallId = (id: unknown): id is string => typeof id === 'string' && CALL_ID.test(id)

const file = (id: string) => {
  if (!isCallId(id)) throw new Error('Invalid call id')
  return path.join(CALLS_DIR, `${id}.json`)
}

function save(call: RTCCall) {
  fs.mkdirSync(CALLS_DIR, { recursive: true })
  fs.writeFileSync(file(call.callId), JSON.stringify(call, null, 2), 'utf-8')
}

/** Read a call, moving it to `timed_out` (and saving that) if its waiting time has run out */
export function getCall(id: string, now = Date.now()): RTCCall | null {
  if (!isCallId(id)) return null
  try {
    if (!fs.existsSync(file(id))) return null
    const call = JSON.parse(fs.readFileSync(file(id), 'utf-8')) as RTCCall
    if (!call || typeof call.state !== 'string') return null
    const current = expireRTCCall(call, now)
    if (current !== call) save(current)
    return current
  } catch (error) {
    console.error(`Failed to read call ${id}:`, error)
    return null
  }
}

export function listCalls(now = Date.now()): RTCCall[] {
  try {
    if (!fs.existsSync(CALLS_DIR)) return []
    return fs.readdirSync(CALLS_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => getCall(f.slice(0, -5), now))
      .filter((c): c is RTCCall => c !== null)
      .sort((a, b) => b.expiresAt.localeCompare(a.expiresAt))
  } catch (error) {
    console.error('Failed to list calls:', error)
    return []
  }
}

export function createCall(caller: string, callee: string, ttlMs: number, now = Date.now()): RTCCall {
  const call: RTCCall = {
    callId: uuidv4(), caller, callee, state: 'inviting',
    expiresAt: new Date(now + ttlMs).toISOString(), seenEventIds: [],
  }
  save(call)
  return call
}

/** Apply one event to a stored call. A refusal because time ran out also records the timeout. */
export function applyCallEvent(id: string, event: RTCEvent, now = Date.now()): RTCTransition | { ok: false; reason: 'not_found' } {
  const call = getCall(id, now)
  if (!call) return { ok: false, reason: 'not_found' }
  const result = transitionRTCCall(call, { ...event, callId: id }, now)
  // The read above already recorded the timeout; to the sender it is still "too late", not "finished"
  if (!result.ok && result.reason === 'terminal' && call.state === 'timed_out') return { ok: false, reason: 'expired' }
  if (result.ok && !result.duplicate) save(result.call)
  return result
}
