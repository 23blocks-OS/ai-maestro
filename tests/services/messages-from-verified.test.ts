import { describe, it, expect, vi } from 'vitest'

const { sendFromUI } = vi.hoisted(() => ({ sendFromUI: vi.fn(async (_opts: Record<string, unknown>) => ({ message: { id: 'm1' } })) }))
vi.mock('@/lib/message-send', () => ({ sendFromUI, forwardFromUI: vi.fn() }))
vi.mock('@/lib/messageQueue', () => ({}))
vi.mock('@/lib/agent-registry', () => ({ searchAgents: vi.fn(() => []), getAgent: vi.fn() }))
vi.mock('@/lib/owning-host', () => ({ findPeerHostUrl: vi.fn() }))
vi.mock('@/lib/hosts-config', () => ({ getSelfHostId: vi.fn(() => 'self'), getSelfHost: vi.fn(() => ({ id: 'self' })) }))

import { sendMessage } from '@/services/messages-service'

// A verified message skips the prompt-injection wrapper, so only the host may decide it, never the client
describe('POST /api/messages', () => {
  it('ignores a client-supplied fromVerified', async () => {
    await sendMessage({ from: 'anyone', to: 'lola', subject: 's', content: { type: 'notification', message: 'hi' }, fromVerified: true } as never)
    expect(sendFromUI).toHaveBeenCalledTimes(1)
    expect(sendFromUI.mock.calls[0][0]).not.toHaveProperty('fromVerified')
  })
})
