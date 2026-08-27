/**
 * Tests for lib/wake-queue.ts — idle-gated pane delivery.
 *
 * The behaviour under test: a wake for a BUSY pane is held, not sent. Typing
 * into a mid-render TUI is where notifications get eaten, so the queue waits
 * for the idle transition instead of sending harder.
 *
 * The honesty rule carries through: a queued wake is `deferred`, never `sent`.
 * It has not been delivered, and the inbox write is what keeps it from being
 * a loss.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { mockNotify, mockIdle } = vi.hoisted(() => ({
  mockNotify: { notifyAgent: vi.fn() },
  mockIdle: { isSessionIdle: vi.fn(), msSinceActivity: vi.fn(), IDLE_THRESHOLD_MS: 30000 },
}))

vi.mock('@/lib/notification-service', () => mockNotify)
vi.mock('@/lib/session-idle', () => mockIdle)

import {
  enqueueWake,
  flushDueWakes,
  pendingWakeCount,
  totalPendingWakes,
  __resetWakeQueue,
} from '@/lib/wake-queue'

function wake(over: Partial<Parameters<typeof enqueueWake>[0]> = {}) {
  return {
    agentId: 'agent-1',
    agentName: 'receiver',
    sessionName: 'receiver',
    injectBody: 'body',
    senderName: 'sender',
    senderHost: 'local',
    subject: 'subj',
    messageId: 'msg-1',
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  __resetWakeQueue()
  mockNotify.notifyAgent.mockResolvedValue({ success: true, notified: true, verified: true })
})

afterEach(() => __resetWakeQueue())

describe('enqueueWake', () => {
  it('holds the wake and reports queue depth', () => {
    expect(enqueueWake(wake())).toBe(1)
    expect(enqueueWake(wake({ messageId: 'msg-2' }))).toBe(2)
    expect(pendingWakeCount('agent-1')).toBe(2)
    expect(totalPendingWakes()).toBe(2)
  })

  it('does not notify on enqueue — queuing is not delivering', () => {
    enqueueWake(wake())
    expect(mockNotify.notifyAgent).not.toHaveBeenCalled()
  })

  it('keeps queues separate per agent', () => {
    enqueueWake(wake({ agentId: 'a' }))
    enqueueWake(wake({ agentId: 'b' }))
    expect(pendingWakeCount('a')).toBe(1)
    expect(pendingWakeCount('b')).toBe(1)
  })

  it('drops the OLDEST past the per-agent cap', () => {
    for (let i = 0; i < 25; i++) enqueueWake(wake({ messageId: `m${i}` }))
    expect(pendingWakeCount('agent-1')).toBe(20)

    mockIdle.isSessionIdle.mockReturnValue(true)
    return flushDueWakes().then(() => {
      // Oldest five were dropped, so the first flushed is m5 not m0.
      expect(mockNotify.notifyAgent).toHaveBeenCalledWith(
        expect.objectContaining({ messageId: 'm5' })
      )
    })
  })
})

describe('flushDueWakes', () => {
  it('holds everything while the pane is busy', async () => {
    mockIdle.isSessionIdle.mockReturnValue(false)
    enqueueWake(wake())

    await flushDueWakes()

    expect(mockNotify.notifyAgent).not.toHaveBeenCalled()
    expect(pendingWakeCount('agent-1')).toBe(1)
  })

  it('delivers once the pane goes idle', async () => {
    mockIdle.isSessionIdle.mockReturnValue(false)
    enqueueWake(wake())
    await flushDueWakes()
    expect(pendingWakeCount('agent-1')).toBe(1)

    mockIdle.isSessionIdle.mockReturnValue(true)
    await flushDueWakes()

    expect(mockNotify.notifyAgent).toHaveBeenCalledWith(
      expect.objectContaining({ messageId: 'msg-1', body: 'body' })
    )
    expect(pendingWakeCount('agent-1')).toBe(0)
  })

  it('delivers one per tick, oldest first', async () => {
    mockIdle.isSessionIdle.mockReturnValue(true)
    enqueueWake(wake({ messageId: 'first' }))
    enqueueWake(wake({ messageId: 'second' }))

    await flushDueWakes()
    expect(mockNotify.notifyAgent).toHaveBeenCalledTimes(1)
    expect(mockNotify.notifyAgent).toHaveBeenLastCalledWith(
      expect.objectContaining({ messageId: 'first' })
    )

    await flushDueWakes()
    expect(mockNotify.notifyAgent).toHaveBeenLastCalledWith(
      expect.objectContaining({ messageId: 'second' })
    )
    expect(pendingWakeCount('agent-1')).toBe(0)
  })

  it('expires stale wakes rather than interrupting long after the fact', async () => {
    vi.useFakeTimers()
    try {
      mockIdle.isSessionIdle.mockReturnValue(false)
      enqueueWake(wake())

      vi.advanceTimersByTime(11 * 60 * 1000) // past the 10 min TTL
      mockIdle.isSessionIdle.mockReturnValue(true)
      await flushDueWakes()

      expect(mockNotify.notifyAgent).not.toHaveBeenCalled()
      expect(pendingWakeCount('agent-1')).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not lose the queue when a flush throws', async () => {
    mockIdle.isSessionIdle.mockReturnValue(true)
    mockNotify.notifyAgent.mockRejectedValue(new Error('tmux gone'))
    enqueueWake(wake({ messageId: 'a' }))
    enqueueWake(wake({ messageId: 'b' }))

    await expect(flushDueWakes()).resolves.toBeUndefined()
    // 'a' was consumed by the failed attempt; 'b' survives for the next tick.
    expect(pendingWakeCount('agent-1')).toBe(1)
  })

  it('is a no-op with an empty queue', async () => {
    await expect(flushDueWakes()).resolves.toBeUndefined()
    expect(mockNotify.notifyAgent).not.toHaveBeenCalled()
  })
})
