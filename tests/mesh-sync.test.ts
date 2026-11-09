import { describe, it, expect, afterEach } from 'vitest'
import http from 'http'
import { createMesh, diffAgents, applyMeshMessage } from '@/lib/mesh-sync.mjs'

const wait = (ms: number) => new Promise(r => setTimeout(r, ms))
async function until(fn: () => boolean, ms = 3000) {
  const end = Date.now() + ms
  while (!fn()) { if (Date.now() > end) throw new Error('timed out'); await wait(20) }
}

describe('diff and apply', () => {
  it('diffs changed, new and removed agents', () => {
    expect(diffAgents({ a: { status: 'idle' }, b: { status: 'idle' } }, { a: { status: 'active' }, c: { status: 'idle' } }))
      .toEqual([['a', { status: 'active' }], ['c', { status: 'idle' }], ['b', null]])
  })

  it('asks for a full list on a sequence gap', () => {
    const copy = { agents: {}, seq: 0 }
    applyMeshMessage(copy, { type: 'full', seq: 4, agents: { a: { status: 'idle' } } })
    expect(applyMeshMessage(copy, { type: 'change', seq: 6, name: 'a', info: { status: 'active' } })).toBe('resync')
    expect(applyMeshMessage(copy, { type: 'change', seq: 5, name: 'a', info: null })).toEqual([['a', null]])
    expect(copy.agents).toEqual({})
  })
})

describe('two hosts over /mesh', () => {
  const cleanups: Array<() => void> = []
  afterEach(() => { cleanups.splice(0).forEach(f => f()) })

  async function host(id: string, local: Record<string, any>, peers: () => Array<{ id: string; url: string }>) {
    const peerActivity = new Map()
    const remote: Array<[string, string, any]> = []
    const mesh = createMesh({
      selfId: id, version: 't', getLocalActivity: async () => ({ ...local }), getPeers: peers,
      peerActivity, onRemoteChange: (h: string, n: string, i: any) => remote.push([h, n, i]), log: () => {},
    } as any)
    const server = http.createServer()
    server.on('upgrade', (req, sock, head) => mesh.handleUpgrade(req, sock, head))
    await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()))
    const url = `http://127.0.0.1:${(server.address() as any).port}`
    cleanups.push(() => { mesh.stop(); server.close() })
    return { mesh, url, local, peerActivity, remote, server }
  }

  it('a change on one host reaches the other at once; a local agent with the same name wins', async () => {
    const b = await host('b', { dahlia: { status: 'idle' }, same: { status: 'active' } }, () => [])
    const a = await host('a', { same: { status: 'idle' } }, () => [{ id: 'b', url: b.url }])
    await a.mesh.refresh()
    a.mesh.start()
    await until(() => a.peerActivity.get('b')?.connected)
    expect(a.peerActivity.get('b').agents.dahlia).toEqual({ status: 'idle' })
    expect(a.remote.map(r => r[1])).toEqual(['dahlia']) // 'same' is local on a: not forwarded

    b.local.dahlia = { status: 'active' }
    b.mesh.notify()
    await until(() => a.peerActivity.get('b').agents.dahlia.status === 'active', 1500)
    expect(a.remote.at(-1)).toEqual(['b', 'dahlia', { status: 'active' }])
  })

  it('drops a host that goes away and takes it back when it returns', async () => {
    const b = await host('b', { dahlia: { status: 'active' } }, () => [])
    const a = await host('a', {}, () => [{ id: 'b', url: b.url }])
    a.mesh.start()
    await until(() => a.peerActivity.get('b')?.connected)
    b.mesh.stop() // closes b's subscribers
    await until(() => !a.peerActivity.get('b').connected)
    expect(a.peerActivity.get('b').agents).toEqual({})
    expect(a.remote.at(-1)).toEqual(['b', 'dahlia', null])
  })
})
