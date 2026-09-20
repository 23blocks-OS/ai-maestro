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

const { mockNotify, mockIdle, mockQueue } = vi.hoisted(() => ({
  mockNotify: { notifyAgent: vi.fn() },
  mockIdle: { isSessionIdle: vi.fn(), msSinceActivity: vi.fn(), IDLE_THRESHOLD_MS: 30000 },
  mockQueue: { getMessage: vi.fn() },
}))

vi.mock('@/lib/notification-service', () => mockNotify)
vi.mock('@/lib/session-idle', () => mockIdle)
// wake-queue now re-checks unread status before RE-delivering (see the
// stillNeedsDelivery tests below); it reads that through getMessage.
vi.mock('@/lib/messageQueue', () => mockQueue)

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
  mockQueue.getMessage.mockResolvedValue({ id: 'msg-1', status: 'unread' })
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

      await vi.advanceTimersByTimeAsync(11 * 60 * 1000) // past the 10 min TTL
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

      await vi.advanceTimersByTimeAsync(31_000)
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
        await vi.advanceTimersByTimeAsync(11 * 60 * 1000 - 1) // past any backoff, under the TTL
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

      await vi.advanceTimersByTimeAsync(31_000) // serve the first retry backoff
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

describe('a retry must not re-fire a message the agent already read', () => {
  // pas-lola, 2026-09-20: one message landed as a prompt SIX times across three
  // minutes, long after she had replied to it. The wake queue re-delivers when
  // readback could not PROVE the last send landed, and readback is fragile — so
  // an answered message kept being retyped. Verification answers "did my
  // keystrokes land", never "does this still need delivering".
  const first = () => wake({ messageId: 'msg-refire', attempts: 0 })

  it('still delivers the FIRST attempt even though it checks nothing', async () => {
    // attempts === 0: unread by definition, must always go.
    mockIdle.isSessionIdle.mockReturnValue(true)
    enqueueWake(first())
    await flushDueWakes()
    expect(mockNotify.notifyAgent).toHaveBeenCalledTimes(1)
    expect(mockQueue.getMessage).not.toHaveBeenCalled()
  })

  it('re-delivers a retry while the message is STILL unread', async () => {
    mockIdle.isSessionIdle.mockReturnValue(true)
    mockQueue.getMessage.mockResolvedValue({ id: 'msg-refire', status: 'unread' })
    // Simulate a queued retry (attempts already made, backoff served).
    enqueueWake({ ...first(), attempts: 1, notBefore: Date.now() - 1 } as any)
    await flushDueWakes()
    expect(mockNotify.notifyAgent).toHaveBeenCalledTimes(1)
  })

  it('DROPS a retry once the message has been read — the actual bug', async () => {
    mockIdle.isSessionIdle.mockReturnValue(true)
    mockQueue.getMessage.mockResolvedValue({ id: 'msg-refire', status: 'read' })
    enqueueWake({ ...first(), attempts: 1, notBefore: Date.now() - 1 } as any)
    await flushDueWakes()
    expect(mockNotify.notifyAgent).not.toHaveBeenCalled()
    expect(pendingWakeCount('agent-1')).toBe(0)
  })

  it('DROPS a retry when the message is gone (deleted/moved)', async () => {
    mockIdle.isSessionIdle.mockReturnValue(true)
    mockQueue.getMessage.mockResolvedValue(null)
    enqueueWake({ ...first(), attempts: 1, notBefore: Date.now() - 1 } as any)
    await flushDueWakes()
    expect(mockNotify.notifyAgent).not.toHaveBeenCalled()
  })

  it('DELIVERS a retry when the status cannot be read, rather than dropping it', async () => {
    // A duplicate is recoverable; a dropped real message is not. Fail open.
    mockIdle.isSessionIdle.mockReturnValue(true)
    mockQueue.getMessage.mockRejectedValue(new Error('disk error'))
    enqueueWake({ ...first(), attempts: 1, notBefore: Date.now() - 1 } as any)
    await flushDueWakes()
    expect(mockNotify.notifyAgent).toHaveBeenCalledTimes(1)
  })

  it('stops the six-fire loop: a read message is not retried again and again', async () => {
    // Reproduce the shape of the measured symptom — the same message keeps
    // coming back unconfirmed — but with the agent having read it after the
    // first landing. Old code: N re-fires. New code: at most one more.
    mockIdle.isSessionIdle.mockReturnValue(true)
    mockNotify.notifyAgent.mockResolvedValue({ success: true, notified: true, verified: false })
    mockQueue.getMessage.mockResolvedValue({ id: 'msg-refire', status: 'read' })
    enqueueWake({ ...first(), attempts: 2, notBefore: Date.now() - 1 } as any)
    await flushDueWakes()
    await flushDueWakes()
    await flushDueWakes()
    expect(mockNotify.notifyAgent).not.toHaveBeenCalled()
  })
})

describe('stillNeedsDelivery (unit)', () => {
  it('always true for a first attempt', async () => {
    const { stillNeedsDelivery } = await import('@/lib/wake-queue')
    expect(await stillNeedsDelivery({ agentId: 'a', messageId: 'm', attempts: 0 } as any)).toBe(true)
  })

  it('true for an unread retry, false for a read one', async () => {
    const { stillNeedsDelivery } = await import('@/lib/wake-queue')
    mockQueue.getMessage.mockResolvedValueOnce({ id: 'm', status: 'unread' })
    expect(await stillNeedsDelivery({ agentId: 'a', messageId: 'm', attempts: 1 } as any)).toBe(true)
    mockQueue.getMessage.mockResolvedValueOnce({ id: 'm', status: 'read' })
    expect(await stillNeedsDelivery({ agentId: 'a', messageId: 'm', attempts: 1 } as any)).toBe(false)
  })
})
