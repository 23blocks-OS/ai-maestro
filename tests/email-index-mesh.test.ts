import { describe, it, expect, vi, afterEach } from 'vitest'

vi.mock('@/lib/agent-registry', () => ({
  getAgent: () => null, getAgentAMPAddresses: () => [], addAMPAddress: vi.fn(), removeAMPAddress: vi.fn(), updateAMPAddress: vi.fn(),
  getAgentEmailAddresses: () => [], addEmailAddress: vi.fn(), removeEmailAddress: vi.fn(), updateEmailAddress: vi.fn(),
  getEmailIndex: () => ({ 'lola@here.com': { agentId: 'l1', agentName: 'local', hostId: 'me', primary: true } }),
  findAgentByEmail: () => null,
}))
vi.mock('@/lib/hosts-config', () => ({
  getHosts: () => [{ id: 'me', url: 'http://me', enabled: true }, { id: 'mac-mini', url: 'http://mini', enabled: true }, { id: 'lola', url: 'http://lola', enabled: true }],
  getSelfHostId: () => 'me', isSelf: (id: string) => id === 'me',
}))
vi.mock('@/lib/host-sync', () => ({ getPublicUrl: () => 'http://me' }))
vi.mock('@/lib/webhook-service', () => ({ emitEmailChanged: vi.fn() }))

const { queryEmailIndex } = await import('@/services/agents-messaging-service')
const { peerFeed } = await import('@/services/shared-state')

afterEach(() => { peerFeed('emails').clear(); vi.unstubAllGlobals() })

describe('federated email index over /mesh', () => {
  it('reads a connected peer from its copy and asks only the hosts off the mesh', async () => {
    peerFeed('emails').set('mac-mini', { items: { 'ops@ciao.com': { agentId: 'r1', agentName: 'ops', hostId: 'mac-mini', primary: true } }, seq: 1, okAt: 1, connected: true })
    const f = vi.fn(async () => ({ ok: true, json: async () => ({ 'x@lola.com': { agentId: 'r2', agentName: 'x', hostId: 'lola', primary: true } }) }))
    vi.stubGlobal('fetch', f)
    const r: any = await queryEmailIndex({ federated: true })
    expect(Object.keys(r.data.emails).sort()).toEqual(['lola@here.com', 'ops@ciao.com', 'x@lola.com'])
    expect(r.data.emails['ops@ciao.com'].hostUrl).toBe('http://mini')
    expect(f).toHaveBeenCalledTimes(1)
    expect((f.mock.calls[0] as any)[0]).toContain('http://lola/')
    expect(r.data.meta.hostsSucceeded).toBe(3)
  })

  it('filters the copy by the address asked for', async () => {
    peerFeed('emails').set('mac-mini', { items: { 'ops@ciao.com': { agentId: 'r1', agentName: 'ops', hostId: 'mac-mini', primary: true }, 'b@ciao.com': { agentId: 'r3', agentName: 'b', hostId: 'mac-mini', primary: true } }, seq: 1, okAt: 1, connected: true })
    peerFeed('emails').set('lola', { items: {}, seq: 1, okAt: 1, connected: true })
    const f = vi.fn(); vi.stubGlobal('fetch', f)
    const r: any = await queryEmailIndex({ federated: true, addressQuery: 'OPS@ciao.com' })
    expect(Object.keys(r.data.emails)).toEqual(['ops@ciao.com'])
    expect(f).not.toHaveBeenCalled()
  })
})
