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
/** Finished calls are deleted after this; and at most this many call files are kept */
export const FINISHED_CALL_TTL_MS = 24 * 60 * 60 * 1000
export const MAX_CALLS = 1_000
const LIVE = new Set(['inviting', 'ringing', 'accepted', 'connected'])
export const isCallId = (id: unknown): id is string => typeof id === 'string' && CALL_ID.test(id)

const file = (id: string) => {
  if (!isCallId(id)) throw new Error('Invalid call id')
  return path.join(CALLS_DIR, `${id}.json`)
}

function save(call: RTCCall) {
  fs.mkdirSync(CALLS_DIR, { recursive: true })
  fs.writeFileSync(file(call.callId), JSON.stringify(call, null, 2), 'utf-8')
}

function readRaw(id: string): RTCCall | null {
  if (!isCallId(id)) return null
  try {
    if (!fs.existsSync(file(id))) return null
    const call = JSON.parse(fs.readFileSync(file(id), 'utf-8')) as RTCCall
    return call && typeof call.state === 'string' ? call : null
  } catch (error) {
    console.error(`Failed to read call ${id}:`, error)
    return null
  }
}

/** Read a call, moving it to `timed_out` (and saving that) if its time has run out */
export function getCall(id: string, now = Date.now()): RTCCall | null {
  const call = readRaw(id)
  if (!call) return null
  const current = expireRTCCall(call, now)
  if (current !== call) save(current)
  return current
}

/** When a call ended: its last activity we know of */
const endedAt = (c: RTCCall) => Math.max(...[c.expiresAt, c.acceptedAt, c.connectedAt].map(t => Date.parse(t || '')).filter(Number.isFinite))

/** Calls newest first. Finished calls older than a day are deleted, and the total is capped. */
export function listCalls(now = Date.now()): RTCCall[] {
  try {
    if (!fs.existsSync(CALLS_DIR)) return []
    const all = fs.readdirSync(CALLS_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => getCall(f.slice(0, -5), now))
      .filter((c): c is RTCCall => c !== null)
      .sort((a, b) => b.expiresAt.localeCompare(a.expiresAt))
    const keep = all.filter((c, i) => i < MAX_CALLS && (LIVE.has(c.state) || now - endedAt(c) < FINISHED_CALL_TTL_MS))
    for (const c of all) if (!keep.includes(c)) fs.rmSync(file(c.callId), { force: true })
    return keep
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
  // The stored record, not the expired view: a lapsed call can still be ended or failed by its parties
  const call = readRaw(id)
  if (!call) return { ok: false, reason: 'not_found' }
  const result = transitionRTCCall(call, { ...event, callId: id }, now)
  if (result.ok && !result.duplicate) save(result.call)
  else if (!result.ok && result.reason === 'expired') save(expireRTCCall(call, now))
  // Already recorded as timed out by an earlier read: to the sender it is still "too late"
  if (!result.ok && result.reason === 'terminal' && call.state === 'timed_out') return { ok: false, reason: 'expired' }
  return result
}
