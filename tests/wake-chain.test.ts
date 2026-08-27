/**
 * Tests for lib/wake-chain.ts.
 *
 * The invariant under test: only a CONFIRMED outcome stops the chain. A `sent`
 * outcome — handed off but unproven — must let the next route run, because an
 * unproven wake is worth nothing to an agent that is waiting on it. This is the
 * generalisation of the v0.36.37 bug, where an unproven channel push suppressed
 * the pane fallback and the message was lost with no delivery at all.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.mock is hoisted above const declarations, so the mock objects have to be
// hoisted too or the factories close over an uninitialised binding.
const { mockChannel, mockStream, mockNotify, mockIdle, mockQueue } = vi.hoisted(() => ({
  mockIdle: { isSessionIdle: vi.fn(), msSinceActivity: vi.fn(), IDLE_THRESHOLD_MS: 30000 },
  mockQueue: { enqueueWake: vi.fn(() => 1) },
  mockChannel: {
    pushToChannel: vi.fn(),
    isChannelVerified: vi.fn(),
  },
  mockStream: {
    pushToStreamSession: vi.fn(),
    hasStreamSession: vi.fn(),
  },
  mockNotify: { notifyAgent: vi.fn() },
}))

vi.mock('@/lib/channel-bridge.mjs', () => mockChannel)
vi.mock('@/lib/streaming-bridge.mjs', () => mockStream)
vi.mock('@/lib/notification-service', () => mockNotify)
vi.mock('@/lib/session-idle', () => mockIdle)
vi.mock('@/lib/wake-queue', () => mockQueue)

import {
  runWakeChain,
  describeWakeResult,
  streamAdapter,
  channelAdapter,
  paneAdapter,
  DEFAULT_WAKE_CHAIN,
  type WakeAdapter,
  type WakeStatus,
} from '@/lib/wake-chain'

const CTX = {
  agentId: 'agent-1',
  agentName: 'receiver',
  injectText: '[AMP #abc12345] New message from sender',
  injectBody: 'the body',
  senderName: 'sender',
  senderHost: 'local',
  subject: 'subj',
  messageId: 'abc12345-dead-beef',
}

/** Adapter that records that it ran and returns a fixed status. */
function fake(name: string, status: WakeStatus, ran: string[]): WakeAdapter {
  return {
    name,
    proof: 'test',
    deliver: async () => {
      ran.push(name)
      return { adapter: name, status }
    },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockStream.hasStreamSession.mockReturnValue(false)
  mockStream.pushToStreamSession.mockReturnValue(false)
  mockChannel.pushToChannel.mockResolvedValue(false)
  mockChannel.isChannelVerified.mockReturnValue(false)
  mockNotify.notifyAgent.mockResolvedValue({ success: true, notified: false, reason: 'No sessions' })
  mockIdle.isSessionIdle.mockReturnValue(true)
  mockQueue.enqueueWake.mockReturnValue(1)
})

describe('runWakeChain — stopping rules', () => {
  it('stops at the first confirmed adapter', async () => {
    const ran: string[] = []
    const res = await runWakeChain(CTX, [
      fake('a', 'unavailable', ran),
      fake('b', 'confirmed', ran),
      fake('c', 'confirmed', ran),
    ])

    expect(ran).toEqual(['a', 'b'])
    expect(res.confirmed).toBe(true)
    expect(res.confirmedBy).toBe('b')
    expect(res.notified).toBe(true)
  })

  it('does NOT stop on sent — the whole point of the four statuses', async () => {
    const ran: string[] = []
    const res = await runWakeChain(CTX, [
      fake('a', 'sent', ran),
      fake('b', 'sent', ran),
      fake('c', 'confirmed', ran),
    ])

    expect(ran).toEqual(['a', 'b', 'c'])
    expect(res.confirmedBy).toBe('c')
  })

  it('reports notified-but-unconfirmed when only sent outcomes occur', async () => {
    const ran: string[] = []
    const res = await runWakeChain(CTX, [fake('a', 'unavailable', ran), fake('b', 'sent', ran)])

    expect(res.confirmed).toBe(false)
    expect(res.notified).toBe(true)
    expect(res.confirmedBy).toBeUndefined()
  })

  it('reports not-notified when nothing sent or confirmed', async () => {
    const ran: string[] = []
    const res = await runWakeChain(CTX, [
      fake('a', 'unavailable', ran),
      fake('b', 'failed', ran),
    ])

    expect(res.confirmed).toBe(false)
    expect(res.notified).toBe(false)
  })

  it('records a throwing adapter as failed and keeps going', async () => {
    const ran: string[] = []
    const boom: WakeAdapter = {
      name: 'boom',
      proof: 'test',
      deliver: async () => {
        throw new Error('kaboom')
      },
    }
    const res = await runWakeChain(CTX, [boom, fake('after', 'confirmed', ran)])

    expect(ran).toEqual(['after'])
    expect(res.attempts[0]).toMatchObject({ adapter: 'boom', status: 'failed', detail: 'kaboom' })
    expect(res.confirmed).toBe(true)
  })

  it('records every attempt in order', async () => {
    const ran: string[] = []
    const res = await runWakeChain(CTX, [
      fake('a', 'unavailable', ran),
      fake('b', 'sent', ran),
      fake('c', 'confirmed', ran),
    ])

    expect(res.attempts.map((x) => `${x.adapter}:${x.status}`)).toEqual([
      'a:unavailable',
      'b:sent',
      'c:confirmed',
    ])
    expect(describeWakeResult(res)).toBe('a:unavailable → b:sent → c:confirmed')
  })

  it('handles an empty chain without claiming anything', async () => {
    const res = await runWakeChain(CTX, [])
    expect(res).toMatchObject({ confirmed: false, notified: false, attempts: [] })
  })
})

describe('streamAdapter', () => {
  it('is unavailable with no live session, and does not push', async () => {
    mockStream.hasStreamSession.mockReturnValue(false)
    const out = await streamAdapter.deliver(CTX)
    expect(out.status).toBe('unavailable')
    expect(mockStream.pushToStreamSession).not.toHaveBeenCalled()
  })

  it('confirms on a successful in-process push', async () => {
    mockStream.hasStreamSession.mockReturnValue(true)
    mockStream.pushToStreamSession.mockReturnValue(true)
    expect((await streamAdapter.deliver(CTX)).status).toBe('confirmed')
  })

  it('fails when a live session rejects the push', async () => {
    mockStream.hasStreamSession.mockReturnValue(true)
    mockStream.pushToStreamSession.mockReturnValue(false)
    expect((await streamAdapter.deliver(CTX)).status).toBe('failed')
  })
})

describe('channelAdapter', () => {
  it('is unavailable when no channel is registered', async () => {
    mockChannel.pushToChannel.mockResolvedValue(false)
    expect((await channelAdapter.deliver(CTX)).status).toBe('unavailable')
  })

  it('reports SENT (not confirmed) for a push into an unverified channel', async () => {
    mockChannel.pushToChannel.mockResolvedValue(true)
    mockChannel.isChannelVerified.mockReturnValue(false)

    const out = await channelAdapter.deliver(CTX)

    // This is the v0.36.37 bug in miniature: the push succeeded, and that must
    // not be reported as arrival.
    expect(out.status).toBe('sent')
    expect(out.detail).toMatch(/unverified/i)
  })

  it('confirms only once the session has acked', async () => {
    mockChannel.pushToChannel.mockResolvedValue(true)
    mockChannel.isChannelVerified.mockReturnValue(true)
    expect((await channelAdapter.deliver(CTX)).status).toBe('confirmed')
  })
})

describe('paneAdapter', () => {
  it('confirms when the notification was read back off the pane', async () => {
    mockNotify.notifyAgent.mockResolvedValue({ success: true, notified: true, verified: true })
    expect((await paneAdapter.deliver(CTX)).status).toBe('confirmed')
  })

  it('reports sent when the runtime cannot be captured', async () => {
    mockNotify.notifyAgent.mockResolvedValue({
      success: true, notified: true, verified: false, reason: 'Runtime cannot verify',
    })
    const out = await paneAdapter.deliver(CTX)
    expect(out.status).toBe('sent')
    expect(out.detail).toMatch(/cannot verify/i)
  })

  it('is unavailable when the agent has no session', async () => {
    mockNotify.notifyAgent.mockResolvedValue({
      success: true, notified: false, reason: 'Session not active',
    })
    expect((await paneAdapter.deliver(CTX)).status).toBe('unavailable')
  })

  it('passes the body through so the pane carries the message', async () => {
    mockNotify.notifyAgent.mockResolvedValue({ success: true, notified: true, verified: true })
    await paneAdapter.deliver(CTX)
    expect(mockNotify.notifyAgent).toHaveBeenCalledWith(
      expect.objectContaining({ body: 'the body', messageId: CTX.messageId })
    )
  })
})

describe('paneAdapter — idle gate', () => {
  it('defers instead of typing into a busy pane', async () => {
    mockIdle.isSessionIdle.mockReturnValue(false)

    const out = await paneAdapter.deliver(CTX)

    expect(out.status).toBe('deferred')
    expect(out.detail).toMatch(/busy/i)
    // The whole point: nothing was typed into the churn.
    expect(mockNotify.notifyAgent).not.toHaveBeenCalled()
    expect(mockQueue.enqueueWake).toHaveBeenCalledWith(
      expect.objectContaining({ messageId: CTX.messageId, injectBody: CTX.injectBody })
    )
  })

  it('sends normally when the pane is idle', async () => {
    mockIdle.isSessionIdle.mockReturnValue(true)
    mockNotify.notifyAgent.mockResolvedValue({ success: true, notified: true, verified: true })

    expect((await paneAdapter.deliver(CTX)).status).toBe('confirmed')
    expect(mockQueue.enqueueWake).not.toHaveBeenCalled()
  })

  it('a deferred wake is never counted as notified', async () => {
    mockIdle.isSessionIdle.mockReturnValue(false)
    mockChannel.pushToChannel.mockResolvedValue(false)

    const res = await runWakeChain(CTX)

    expect(res.deferred).toBe(true)
    expect(res.confirmed).toBe(false)
    expect(res.notified).toBe(false)
  })
})

describe('DEFAULT_WAKE_CHAIN', () => {
  it('orders routes strongest-proof first, universal fallback last', () => {
    expect(DEFAULT_WAKE_CHAIN.map((a) => a.name)).toEqual(['stream', 'channel', 'pane'])
  })

  it('falls through an unverified channel to the pane end to end', async () => {
    mockStream.hasStreamSession.mockReturnValue(false)
    mockChannel.pushToChannel.mockResolvedValue(true)
    mockChannel.isChannelVerified.mockReturnValue(false)
    mockNotify.notifyAgent.mockResolvedValue({ success: true, notified: true, verified: true })

    const res = await runWakeChain(CTX)

    expect(describeWakeResult(res)).toBe('stream:unavailable → channel:sent → pane:confirmed')
    expect(res.confirmedBy).toBe('pane')
    // The regression guard: the pane was NOT skipped by the unproven channel.
    expect(mockNotify.notifyAgent).toHaveBeenCalled()
  })

  it('skips the pane once the channel is verified', async () => {
    mockChannel.pushToChannel.mockResolvedValue(true)
    mockChannel.isChannelVerified.mockReturnValue(true)

    const res = await runWakeChain(CTX)

    expect(res.confirmedBy).toBe('channel')
    expect(mockNotify.notifyAgent).not.toHaveBeenCalled()
  })
})
