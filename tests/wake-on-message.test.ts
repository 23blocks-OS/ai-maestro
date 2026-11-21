/**
 * F073: a message to a hibernated agent that has preferences.wakeOnMessage starts it, then the wake chain runs.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { agent, sessionExists, wakeAgent, runWakeChain } = vi.hoisted(() => ({
  agent: { current: null as any },
  sessionExists: vi.fn(),
  wakeAgent: vi.fn(),
  runWakeChain: vi.fn(),
}))

vi.mock('@/lib/agent-registry', () => ({ getAgent: () => agent.current }))
vi.mock('@/lib/agent-runtime', () => ({ getRuntime: () => ({ sessionExists }) }))
vi.mock('@/lib/streaming-bridge.mjs', () => ({ hasStreamSession: () => false }))
vi.mock('@/services/agents-core-service', () => ({ wakeAgent }))
vi.mock('@/lib/amp-inbox-writer', () => ({ writeToAMPInbox: async () => '/tmp/inbox/msg.json' }))
vi.mock('@/lib/amp-websocket', () => ({ isAgentConnectedViaWS: () => false, deliverViaWebSocket: () => false }))
vi.mock('@/lib/wake-chain', () => ({ runWakeChain, describeWakeResult: () => '' }))
vi.mock('@/lib/wake-queue', () => ({ enqueueWake: vi.fn() }))
vi.mock('@/lib/wake-state', () => ({ recordWake: vi.fn() }))

import { deliver } from '@/lib/message-delivery'

const input = () => ({
  envelope: { id: 'msg_1', from: 'alice@acme.aimaestro.local', to: 'bob@acme.aimaestro.local' },
  payload: { type: 'notification', message: 'hello' },
  recipientAgentName: 'bob', recipientAgentId: 'bob-id', senderName: 'alice', subject: 'hi',
} as any)

beforeEach(() => {
  vi.clearAllMocks()
  runWakeChain.mockResolvedValue({ notified: true, confirmed: true, confirmedBy: 'pane', attempts: [] })
  wakeAgent.mockResolvedValue({ status: 200, data: { woken: true } })
})

describe('wake on message', () => {
  it('starts an asleep agent that asked for it, before the wake chain', async () => {
    agent.current = { id: 'bob-id', name: 'bob', preferences: { wakeOnMessage: true } }
    sessionExists.mockResolvedValue(false)
    await deliver(input())
    expect(wakeAgent).toHaveBeenCalledWith('bob-id', { startProgram: true })
    expect(wakeAgent.mock.invocationCallOrder[0]).toBeLessThan(runWakeChain.mock.invocationCallOrder[0])
  })

  it('leaves a running agent, and an agent without the preference, alone', async () => {
    agent.current = { id: 'bob-id', name: 'bob', preferences: { wakeOnMessage: true } }
    sessionExists.mockResolvedValue(true)
    await deliver(input())
    agent.current = { id: 'bob-id', name: 'bob' }
    sessionExists.mockResolvedValue(false)
    await deliver(input())
    expect(wakeAgent).not.toHaveBeenCalled()
    expect(runWakeChain).toHaveBeenCalledTimes(2)
  })

  it('still delivers when the start fails', async () => {
    agent.current = { id: 'bob-id', name: 'bob', preferences: { wakeOnMessage: true } }
    sessionExists.mockResolvedValue(false)
    wakeAgent.mockRejectedValue(new Error('no program'))
    const r = await deliver(input())
    expect(r.delivered).toBe(true)
    expect(runWakeChain).toHaveBeenCalled()
  })
})
