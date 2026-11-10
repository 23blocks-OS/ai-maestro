import { describe, it, expect, vi, afterEach } from 'vitest'

vi.mock('@/lib/person-devices-registry', () => ({ findDeviceKey: () => null }))
vi.mock('@/lib/hosts-config', () => ({
  getHostById: (id: string) => ({ id, url: `http://${id}` }),
  getPeerHosts: () => [{ id: 'mac-mini', url: 'http://mini' }, { id: 'lola', url: 'http://lola' }],
}))

const { personHostFor, personKeyFor } = await import('@/lib/person-keys')
const { peerPeople } = await import('@/services/shared-state')

afterEach(() => { peerPeople.clear(); vi.unstubAllGlobals() })

describe('person keys and hosts over /mesh', () => {
  it('finds the person\'s host in a peer\'s people copy, asking only the peers not on the mesh', async () => {
    peerPeople.set('mac-mini', { items: { p1: { id: 'p1', displayName: 'Ana', active: false } }, seq: 1, okAt: 1, connected: true })
    const f = vi.fn(async () => ({ ok: false }))
    vi.stubGlobal('fetch', f)
    expect(await personHostFor('p1')).toMatchObject({ id: 'mac-mini' })
    expect(f).not.toHaveBeenCalled()
    expect(await personHostFor('p2')).toBeNull()
    expect(f).toHaveBeenCalledTimes(1)
    expect((f.mock.calls[0] as any)[0]).toContain('http://lola/')
  })

  it('always asks the forwarding host for a device key (a revocation must count at once)', async () => {
    peerPeople.set('mac-mini', { items: { p1: { id: 'p1' } }, seq: 1, okAt: 1, connected: true })
    const f = vi.fn(async () => ({ ok: true, json: async () => ({ devices: [{ personId: 'p1', key: { keyId: 'k1', publicKey: 'pk', status: 'revoked' } }] }) }))
    vi.stubGlobal('fetch', f)
    expect(await personKeyFor('k1', 'mac-mini')).toMatchObject({ status: 'revoked' })
    expect(f).toHaveBeenCalledTimes(1)
  })
})
