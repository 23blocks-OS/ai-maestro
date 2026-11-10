import { describe, it, expect, afterEach } from 'vitest'
import http from 'http'
import { createMesh, diffItems, applyMeshMessage } from '@/lib/mesh-sync.mjs'

const wait = (ms: number) => new Promise(r => setTimeout(r, ms))
async function until(fn: () => boolean, ms = 3000) {
  const end = Date.now() + ms
  while (!fn()) { if (Date.now() > end) throw new Error('timed out'); await wait(20) }
}

describe('diff and apply', () => {
  it('diffs changed, new and removed agents', () => {
    expect(diffItems({ a: { status: 'idle' }, b: { status: 'idle' } }, { a: { status: 'active' }, c: { status: 'idle' } }))
      .toEqual([['a', { status: 'active' }], ['c', { status: 'idle' }], ['b', null]])
  })

  it('asks for a full list on a sequence gap', () => {
    const copy = { items: {}, seq: 0 }
    applyMeshMessage(copy, { type: 'full', seq: 4, items: { a: { status: 'idle' } } })
    expect(applyMeshMessage(copy, { type: 'change', seq: 6, key: 'a', info: { status: 'active' } })).toBe('resync')
    expect(applyMeshMessage(copy, { type: 'change', seq: 5, key: 'a', info: null })).toEqual([['a', null]])
    expect(copy.items).toEqual({})
  })
})

describe('two hosts over /mesh', () => {
  const cleanups: Array<() => void> = []
  afterEach(() => { cleanups.splice(0).forEach(f => f()) })

  async function host(id: string, local: Record<string, any>, peers: () => Array<{ id: string; url: string }>, agents: Record<string, any> = {}) {
    const peerActivity = new Map()
    const peerAgents = new Map()
    const remote: Array<[string, string, any]> = []
    const flags: Record<string, boolean> = {}
    const mesh = createMesh({
      selfId: id, version: 't', getPeers: peers, log: () => {},
      feeds: { status: { pollMs: 60_000, get: async () => ({ ...local }) }, agents: { pollMs: 60_000, get: async () => ({ ...agents }) } },
      copies: { status: peerActivity, agents: peerAgents },
      onRemoteChange: (feed: string, h: string, n: string, i: any, l: boolean) => { if (feed === 'status') { remote.push([h, n, i]); flags[n] = l } },
    } as any)
    const server = http.createServer()
    server.on('upgrade', (req, sock, head) => mesh.handleUpgrade(req, sock, head))
    await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()))
    const url = `http://127.0.0.1:${(server.address() as any).port}`
    cleanups.push(() => { mesh.stop(); server.close() })
    return { mesh, url, local, agents, peerActivity, peerAgents, remote, flags, server }
  }

  it('a change on one host reaches the other at once; a local agent with the same name wins', async () => {
    const b = await host('b', { dahlia: { status: 'idle' }, same: { status: 'active' } }, () => [])
    const a = await host('a', { same: { status: 'idle' } }, () => [{ id: 'b', url: b.url }])
    await a.mesh.refresh()
    a.mesh.start()
    await until(() => a.peerActivity.get('b')?.connected)
    expect(a.peerActivity.get('b').items.dahlia).toEqual({ status: 'idle' })
    // 'same' is local on a too: forwarded, marked local, so a broadcasts only `same@b`
    expect(a.flags).toEqual({ dahlia: false, same: true })

    b.local.dahlia = { status: 'active' }
    b.mesh.notify()
    await until(() => a.peerActivity.get('b').items.dahlia.status === 'active', 1500)
    expect(a.remote.at(-1)).toEqual(['b', 'dahlia', { status: 'active' }])
  })

  it('drops a host that goes away and takes it back when it returns', async () => {
    const b = await host('b', { dahlia: { status: 'active' } }, () => [])
    const a = await host('a', {}, () => [{ id: 'b', url: b.url }])
    a.mesh.start()
    await until(() => a.peerActivity.get('b')?.connected)
    b.mesh.stop() // closes b's subscribers
    await until(() => !a.peerActivity.get('b').connected)
    expect(a.peerActivity.get('b').items).toEqual({})
    expect(a.remote.at(-1)).toEqual(['b', 'dahlia', null])
  })
})

describe('the agents feed rides the same socket', () => {
  const cleanups: Array<() => void> = []
  afterEach(() => { cleanups.splice(0).forEach(f => f()) })

  it('carries a peer\'s agent list, and a change to one agent', async () => {
    const mk = async (id: string, agents: Record<string, any>, peers: () => any[]) => {
      const copies = { status: new Map(), agents: new Map() }
      const mesh = createMesh({ selfId: id, version: 't', getPeers: peers, log: () => {}, onRemoteChange: () => {},
        feeds: { status: { pollMs: 60_000, get: async () => ({}) }, agents: { pollMs: 60_000, get: async () => ({ ...agents }) } }, copies } as any)
      const server = http.createServer()
      server.on('upgrade', (req, sock, head) => mesh.handleUpgrade(req, sock, head))
      await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()))
      cleanups.push(() => { mesh.stop(); server.close() })
      return { mesh, copies, agents, url: `http://127.0.0.1:${(server.address() as any).port}` }
    }
    const b = await mk('b', { id1: { id: 'id1', name: 'dahlia', session: { status: 'offline' } } }, () => [])
    const a = await mk('a', {}, () => [{ id: 'b', url: b.url }])
    a.mesh.start()
    await until(() => a.copies.agents.get('b')?.connected)
    expect(a.copies.agents.get('b').items.id1.name).toBe('dahlia')
    b.agents.id1 = { id: 'id1', name: 'dahlia', session: { status: 'online' } }
    b.mesh.notify()
    await until(() => a.copies.agents.get('b').items.id1.session.status === 'online', 1500)
  })
})

describe('a peer on another protocol', () => {
  const cleanups: Array<() => void> = []
  afterEach(() => cleanups.splice(0).forEach(f => f()))
  it('is marked with its version on the status copy, so pages can say "old version"', async () => {
    const { WebSocketServer } = await import('ws')
    const server = http.createServer()
    const wss = new WebSocketServer({ server })
    wss.on('connection', ws => ws.send(JSON.stringify({ type: 'hello', hostId: 'old', version: '0.106.100', protocol: 1 })))
    await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()))
    const peerActivity = new Map()
    const mesh = createMesh({
      selfId: 'a', version: 't', log: () => {}, onRemoteChange: () => {},
      getPeers: () => [{ id: 'old', url: `http://127.0.0.1:${(server.address() as any).port}` }],
      feeds: { status: { pollMs: 60_000, get: async () => ({}) } },
      copies: { status: peerActivity },
    } as any)
    cleanups.push(() => { mesh.stop(); wss.close(); server.close() })
    mesh.start()
    await until(() => !!peerActivity.get('old')?.oldVersion)
    expect(peerActivity.get('old')).toMatchObject({ oldVersion: '0.106.100', connected: false })
  })
})
