/**
 * B011 #2: a wake deferred behind a stuck 'active' hook report must outlive that
 * report. The report is honoured for HOOK_STATUS_TTL_MS (15 min); the queue used to
 * drop the wake at 10 min, so a killed agent's wakes were lost five minutes before the
 * status that deferred them could expire and the session fall back to terminal recency.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { mockNotify, mockQueue } = vi.hoisted(() => ({
  mockNotify: { notifyAgent: vi.fn() },
  mockQueue: { getMessage: vi.fn() },
}))
vi.mock('@/lib/notification-service', () => mockNotify)
vi.mock('@/lib/messageQueue', () => mockQueue)

import { enqueueWake, flushDueWakes, pendingWakeCount, __resetWakeQueue, QUEUE_TTL_MS } from '@/lib/wake-queue'
import { HOOK_STATUS_TTL_MS } from '@/lib/session-idle'
import { hookStatus, sessionActivity } from '@/services/shared-state'

const wake = () => ({
  agentId: 'agent-1', agentName: 'receiver', sessionName: 'receiver', injectBody: 'body',
  senderName: 'sender', senderHost: 'local', subject: 'subj', messageId: 'msg-1',
})

beforeEach(() => {
  vi.clearAllMocks()
  __resetWakeQueue()
  hookStatus.clear()
  sessionActivity.clear()
  mockNotify.notifyAgent.mockResolvedValue({ success: true, notified: true, verified: true })
  mockQueue.getMessage.mockResolvedValue({ id: 'msg-1', status: 'unread' })
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-09T12:00:00Z'))
})
afterEach(() => {
  vi.useRealTimers()
  __resetWakeQueue()
  hookStatus.clear()
})

describe('wake queue TTL vs hook status TTL', () => {
  it('a queued wake outlives the hook status it can be waiting on', () => {
    expect(QUEUE_TTL_MS).toBeGreaterThan(HOOK_STATUS_TTL_MS)
  })

  it('a wake deferred behind a stuck active is still queued when that status expires, then delivered', async () => {
    hookStatus.set('receiver', { status: 'active', at: Date.now() }) // agent killed mid-turn: never cleared
    enqueueWake(wake())

    vi.setSystemTime(Date.now() + 12 * 60 * 1000) // past the old 10 min TTL, status still honoured
    await flushDueWakes()
    expect(pendingWakeCount('agent-1')).toBe(1)
    expect(mockNotify.notifyAgent).not.toHaveBeenCalled()

    vi.setSystemTime(Date.now() + 3.5 * 60 * 1000) // 15.5 min: the status has expired, PTY says idle
    await flushDueWakes()
    expect(mockNotify.notifyAgent).toHaveBeenCalledTimes(1)
    expect(pendingWakeCount('agent-1')).toBe(0)
  })

  it('still gives up eventually', async () => {
    hookStatus.set('receiver', { status: 'permission_request', at: Date.now() })
    sessionActivity.set('receiver', Date.now()) // keeps the PTY fallback busy too
    enqueueWake(wake())
    vi.setSystemTime(Date.now() + QUEUE_TTL_MS + 1000)
    await flushDueWakes()
    expect(pendingWakeCount('agent-1')).toBe(0)
  })
})
