/**
 * Tests for lib/session-idle.ts.
 *
 * The wake path asks one question here — "safe to type into this pane right
 * now?" — and two mistakes are possible with very different costs:
 *
 *   deferring a genuinely idle agent  → the wake waits one tick
 *   injecting into a permission modal → the text ANSWERS the modal
 *
 * So the hook's reported state is trusted only where we positively recognise
 * it as waiting, and everything else defers.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { sessionActivity, hookStatus } from '@/services/shared-state'
import {
  isSessionIdle,
  msSinceActivity,
  idleSource,
  IDLE_THRESHOLD_MS,
  HOOK_STATUS_TTL_MS,
} from '@/lib/session-idle'

const S = 'agent-session'

function reportHook(status: string, notificationType?: string, ageMs = 0) {
  hookStatus.set(S, { status, notificationType, at: Date.now() - ageMs })
}

beforeEach(() => {
  sessionActivity.clear()
  hookStatus.clear()
})

describe('hook status (authoritative signal)', () => {
  it('treats a completed turn as idle', () => {
    reportHook('idle')
    expect(isSessionIdle(S)).toBe(true)
    expect(idleSource(S)).toBe('hook')
  })

  it('treats an active agent as busy', () => {
    reportHook('active')
    expect(isSessionIdle(S)).toBe(false)
  })

  it('NEVER reports idle during a permission request', () => {
    // Typing here would answer the modal.
    reportHook('permission_request')
    expect(isSessionIdle(S)).toBe(false)
  })

  it('treats an idle prompt as idle', () => {
    reportHook('waiting_for_input', 'idle_prompt')
    expect(isSessionIdle(S)).toBe(true)
  })

  it('does NOT treat a permission prompt notification as idle', () => {
    reportHook('waiting_for_input', 'permission_prompt')
    expect(isSessionIdle(S)).toBe(false)
  })

  it('defers on an unrecognised state rather than guessing', () => {
    reportHook('something-new-from-a-future-hook')
    expect(isSessionIdle(S)).toBe(false)
  })

  it('overrides PTY recency while fresh', () => {
    // PTY says busy (output 1s ago) but the hook says the turn ended.
    sessionActivity.set(S, Date.now() - 1000)
    reportHook('idle')
    expect(isSessionIdle(S)).toBe(true)
  })
})

describe('hook status expiry', () => {
  it('stops trusting a stale report so a dead agent cannot block wakes forever', () => {
    // An agent that died mid-turn would otherwise stay "active" permanently.
    reportHook('active', undefined, HOOK_STATUS_TTL_MS + 1000)
    expect(idleSource(S)).not.toBe('hook')
    expect(isSessionIdle(S)).toBe(true) // falls back; no PTY data ⇒ idle
  })

  it('falls back to PTY recency once the hook report expires', () => {
    reportHook('idle', undefined, HOOK_STATUS_TTL_MS + 1000)
    sessionActivity.set(S, Date.now()) // output right now ⇒ busy
    expect(isSessionIdle(S)).toBe(false)
    expect(idleSource(S)).toBe('pty')
  })
})

describe('PTY fallback', () => {
  it('reports busy while output is recent', () => {
    sessionActivity.set(S, Date.now())
    expect(isSessionIdle(S)).toBe(false)
    expect(idleSource(S)).toBe('pty')
  })

  it('reports idle once output goes quiet past the threshold', () => {
    sessionActivity.set(S, Date.now() - (IDLE_THRESHOLD_MS + 1000))
    expect(isSessionIdle(S)).toBe(true)
  })

  it('reports idle — and says so — when there is no signal at all', () => {
    expect(msSinceActivity(S)).toBeNull()
    expect(isSessionIdle(S)).toBe(true)
    // This is the coverage hole the hook signal closes: an unwatched agent
    // with no hook report is indistinguishable from an idle one.
    expect(idleSource(S)).toBe('none')
  })
})
