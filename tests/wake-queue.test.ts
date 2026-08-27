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
  pendingWakes,
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

    // A throwing attempt is an unconfirmed attempt: 'a' goes back for retry
    // rather than being dropped, and 'b' is untouched.
    expect(pendingWakeCount('agent-1')).toBe(2)
    const a = pendingWakes().find((r) => r.messageId === 'a')!
    expect(a).toMatchObject({ reason: 'unconfirmed', attempts: 1 })
  })

  it('is a no-op with an empty queue', async () => {
    await expect(flushDueWakes()).resolves.toBeUndefined()
    expect(mockNotify.notifyAgent).not.toHaveBeenCalled()
  })
})

describe('retry with backoff', () => {
  it('re-queues an unconfirmed flush instead of dropping it', async () => {
    mockIdle.isSessionIdle.mockReturnValue(true)
    mockNotify.notifyAgent.mockResolvedValue({
      success: true, notified: true, verified: false, reason: 'Not seen in pane after retries',
    })
    enqueueWake(wake())

    await flushDueWakes()

    // Attempted and unproven → back in the queue, not silently gone.
    expect(pendingWakeCount('agent-1')).toBe(1)
    expect(pendingWakes()[0]).toMatchObject({ reason: 'unconfirmed', attempts: 1 })
  })

  it('holds a retry until its backoff expires', async () => {
    vi.useFakeTimers()
    try {
      mockIdle.isSessionIdle.mockReturnValue(true)
      mockNotify.notifyAgent.mockResolvedValue({ success: true, notified: true, verified: false })
      enqueueWake(wake())

      await flushDueWakes()            // attempt 1 → requeued with 30s backoff
      expect(mockNotify.notifyAgent).toHaveBeenCalledTimes(1)

      await flushDueWakes()            // still inside the backoff window
      expect(mockNotify.notifyAgent).toHaveBeenCalledTimes(1)

      vi.advanceTimersByTime(31_000)
      await flushDueWakes()            // backoff served
      expect(mockNotify.notifyAgent).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('gives up after the last attempt rather than retrying forever', async () => {
    vi.useFakeTimers()
    try {
      mockIdle.isSessionIdle.mockReturnValue(true)
      mockNotify.notifyAgent.mockResolvedValue({ success: true, notified: true, verified: false })
      enqueueWake(wake())

      // 4 backoff slots = 4 attempts total.
      for (let i = 0; i < 6; i++) {
        vi.advanceTimersByTime(11 * 60 * 1000 - 1) // past any backoff, under the TTL
        await flushDueWakes()
      }

      expect(mockNotify.notifyAgent).toHaveBeenCalledTimes(4)
      expect(pendingWakeCount('agent-1')).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('stops retrying as soon as one attempt is confirmed', async () => {
    vi.useFakeTimers()
    try {
      mockIdle.isSessionIdle.mockReturnValue(true)
      mockNotify.notifyAgent
        .mockResolvedValueOnce({ success: true, notified: true, verified: false })
        .mockResolvedValue({ success: true, notified: true, verified: true })
      enqueueWake(wake())

      await flushDueWakes()
      expect(pendingWakeCount('agent-1')).toBe(1)

      vi.advanceTimersByTime(31_000) // serve the first retry backoff
      await flushDueWakes()

      expect(mockNotify.notifyAgent).toHaveBeenCalledTimes(2)
      expect(pendingWakeCount('agent-1')).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('pendingWakes — the operator surface', () => {
  it('reports what is waiting and why', () => {
    enqueueWake(wake({ messageId: 'm1', subject: 'hello' }))
    enqueueWake(wake({ agentId: 'agent-2', agentName: 'other', messageId: 'm2', reason: 'unconfirmed', attempts: 2 }))

    const rows = pendingWakes()

    expect(rows).toHaveLength(2)
    expect(rows.map((r) => r.reason).sort()).toEqual(['busy', 'unconfirmed'])
    const unconfirmed = rows.find((r) => r.reason === 'unconfirmed')!
    expect(unconfirmed).toMatchObject({ agentName: 'other', messageId: 'm2', attempts: 2 })
    expect(unconfirmed.retryInMs).toBeGreaterThan(0)
  })

  it('formats the sender with its host when remote', () => {
    enqueueWake(wake({ senderName: 'alice', senderHost: 'mac-mini' }))
    expect(pendingWakes()[0].from).toBe('alice@mac-mini')
  })

  it('is empty when nothing is waiting', () => {
    expect(pendingWakes()).toEqual([])
  })
})
