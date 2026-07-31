/**
 * Tests for lib/streaming-bridge.mjs
 *
 * The bridge is how the AMP delivery layer pushes a message into a live
 * streaming (Agent SDK) session that lives in server.mjs's module graph. It
 * reads the shared globalThis._streamSessions map, so these tests drive that
 * map directly with fake sessions.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { pushToStreamSession, hasStreamSession } from '@/lib/streaming-bridge.mjs'

interface FakeSession {
  closed: boolean
  exited: boolean
  push: (t: string) => void
  _pushed: string[]
}

function fakeSession(over: Partial<FakeSession> = {}): FakeSession {
  const pushed: string[] = []
  return { closed: false, exited: false, push: (t: string) => pushed.push(t), _pushed: pushed, ...over }
}

function setMap(entries: [string, unknown][] = []) {
  ;(globalThis as any)._streamSessions = new Map(entries)
}

describe('streaming-bridge', () => {
  beforeEach(() => setMap())

  it('returns false when the session map does not exist yet', () => {
    delete (globalThis as any)._streamSessions
    expect(pushToStreamSession('a', 'x')).toBe(false)
    expect(hasStreamSession('a')).toBe(false)
  })

  it('returns false for an unknown agent', () => {
    expect(pushToStreamSession('nobody', 'x')).toBe(false)
    expect(hasStreamSession('nobody')).toBe(false)
  })

  it('pushes text into a live session and reports it', () => {
    const s = fakeSession()
    setMap([['a1', s]])
    expect(pushToStreamSession('a1', 'hello')).toBe(true)
    expect(s._pushed).toEqual(['hello'])
    expect(hasStreamSession('a1')).toBe(true)
  })

  it('coerces a numeric agentKey to string', () => {
    const s = fakeSession()
    setMap([['42', s]])
    expect(pushToStreamSession(42 as unknown as string, 'hi')).toBe(true)
    expect(s._pushed).toEqual(['hi'])
  })

  it('skips closed sessions', () => {
    const s = fakeSession({ closed: true })
    setMap([['a2', s]])
    expect(pushToStreamSession('a2', 'x')).toBe(false)
    expect(hasStreamSession('a2')).toBe(false)
    expect(s._pushed).toEqual([])
  })

  it('skips exited sessions', () => {
    const s = fakeSession({ exited: true })
    setMap([['a3', s]])
    expect(pushToStreamSession('a3', 'x')).toBe(false)
    expect(hasStreamSession('a3')).toBe(false)
  })

  it('ignores empty agentKey or text', () => {
    const s = fakeSession()
    setMap([['a4', s]])
    expect(pushToStreamSession('', 'x')).toBe(false)
    expect(pushToStreamSession('a4', '')).toBe(false)
    expect(s._pushed).toEqual([])
  })

  it('swallows a throwing push and returns false', () => {
    setMap([['a5', { closed: false, exited: false, push() { throw new Error('boom') } }]])
    expect(pushToStreamSession('a5', 'x')).toBe(false)
  })
})
