/**
 * Same class as the 2026-10-29 incident, found by the audit after it: a host must never forward a
 * request to itself, and a health check must not make the peer ask all of its own peers.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const SELF_URL = 'http://100.64.0.1:23000'
const { hibernateAgent, getAgent } = vi.hoisted(() => ({
  hibernateAgent: vi.fn().mockResolvedValue({ data: { ok: true }, status: 200 }),
  getAgent: vi.fn(),
}))
vi.mock('@/services/agents-core-service', () => ({ wakeAgent: vi.fn(), hibernateAgent }))
vi.mock('@/lib/agent-registry', () => ({ getAgent }))
vi.mock('@/lib/hosts-config', () => ({
  // Like the real one: the current hostname, or a URL whose host is one of our IPs
  isSelf: (id: string) => id === 'new-name' || id === SELF_URL,
}))

const { hibernateAgentRequest } = await import('@/services/agents-wake-service')

beforeEach(() => {
  hibernateAgent.mockClear()
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) }))
})
afterEach(() => vi.unstubAllGlobals())

describe('hibernate', () => {
  it('a stale hostId with hostUrl pointing here is local, not a proxy to itself', async () => {
    getAgent.mockReturnValue({ id: 'a1', hostId: 'old-name', hostUrl: SELF_URL })
    await hibernateAgentRequest('a1', {})
    expect(hibernateAgent).toHaveBeenCalledWith('a1', { sessionIndex: 0 })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('an agent on another host is still proxied there', async () => {
    getAgent.mockReturnValue({ id: 'a2', hostId: 'mac-mini', hostUrl: 'http://100.64.0.2:23000' })
    await hibernateAgentRequest('a2', {})
    expect(hibernateAgent).not.toHaveBeenCalled()
    expect((fetch as any).mock.calls[0][0]).toContain('http://100.64.0.2:23000/api/agents/a2/hibernate')
  })
})
