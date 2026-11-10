import { describe, it, expect, vi, afterEach, afterAll } from 'vitest'
import fs from 'fs'
import nodeOs from 'os'
import path from 'path'

const home = fs.mkdtempSync(path.join(nodeOs.tmpdir(), 'world-mesh-'))
vi.mock('os', async (orig) => {
  const real: any = await orig()
  return { ...real, default: { ...real, homedir: () => home }, homedir: () => home }
})
vi.mock('@/lib/hosts-config', () => ({
  getHosts: () => [{ id: 'me', url: 'http://me' }, { id: 'mini', url: 'http://mini' }, { id: 'lola', url: 'http://lola' }],
  isSelf: (id: string) => id === 'me',
}))

const { getWorldEvents } = await import('@/services/world-events-service')
const { peerWorldEvents } = await import('@/services/shared-state')

afterAll(() => fs.rmSync(home, { recursive: true, force: true }))
afterEach(() => { peerWorldEvents.clear(); vi.unstubAllGlobals() })

describe('getWorldEvents over /mesh', () => {
  it('reads a peer on the mesh from its copy (recent only) and asks only the others', async () => {
    const now = Date.now()
    peerWorldEvents.set('mini', { items: {
      m1: { id: 'm1', ts: now - 1000, from: 'crab', toAgentId: 'x', hostId: 'mini' },
      old: { id: 'old', ts: now - 60 * 60_000, from: 'crab', toAgentId: 'x', hostId: 'mini' },
    }, seq: 1, okAt: 1, connected: true })
    const f = vi.fn(async () => ({ ok: true, json: async () => ({ events: [{ id: 'l1', ts: now - 500, from: 'lola', toAgentId: 'y', hostId: 'lola' }] }) }))
    vi.stubGlobal('fetch', f)
    const r: any = await getWorldEvents({ since: 0, localOnly: false, selfHostId: 'me' })
    expect(r.data.events.map((e: any) => e.id)).toEqual(['m1', 'l1'])
    expect(r.data.hosts).toBe(3)
    expect(f).toHaveBeenCalledTimes(1)
    expect((f.mock.calls[0] as any)[0]).toContain('http://lola/')
  })

  it('asks every peer for a day of history', async () => {
    peerWorldEvents.set('mini', { items: {}, seq: 1, okAt: 1, connected: true })
    const f = vi.fn(async () => ({ ok: true, json: async () => ({ events: [] }) }))
    vi.stubGlobal('fetch', f)
    await getWorldEvents({ since: 0, localOnly: false, selfHostId: 'me', history: true })
    expect(f).toHaveBeenCalledTimes(2)
  })
})
