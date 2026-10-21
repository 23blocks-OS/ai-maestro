import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import http from 'http'
import type { AddressInfo } from 'net'
import { fetchSharedCards, dedupeCards } from '@/lib/task-client'

// Fake peers: real HTTP servers answering GET /api/tasks/shared, so the address, the query the board
// builds, and the way a host that is down or answers an error are all exercised, not mocked away.
interface Peer { server: http.Server; base: string; seen: string[]; respond: (url: URL) => { code: number; body: unknown } }
const peers: Record<string, Peer> = {}

async function startPeer(respond: Peer['respond']): Promise<Peer> {
  const peer = { seen: [] as string[], respond } as Peer
  peer.server = http.createServer((req, res) => {
    peer.seen.push(req.url || '')
    const r = peer.respond(new URL(req.url || '/', 'http://x'))
    res.writeHead(r.code, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(r.body))
  })
  await new Promise<void>(r => peer.server.listen(0, '127.0.0.1', r))
  peer.base = `http://127.0.0.1:${(peer.server.address() as AddressInfo).port}`
  return peer
}

const card = (id: string, extra: Record<string, unknown> = {}) => ({ id, subject: `Card ${id}`, status: 'pending', ...extra })

beforeAll(async () => {
  peers.mini = await startPeer(() => ({ code: 200, body: { cards: [card('c-mini', { scope: 'agent', ownerAgentId: 'x1' }), card('c-both')] } }))
  peers.lola = await startPeer(() => ({ code: 200, body: { cards: [card('c-lola', { scope: 'team', teamId: 't9' }), card('c-both', { subject: 'Card c-both (lola copy)' })] } }))
  peers.broken = await startPeer(() => ({ code: 500, body: { error: 'boom' } }))
  peers.own = await startPeer(() => ({ code: 200, body: { cards: [card('c-own')] } }))
})
afterAll(() => { for (const p of Object.values(peers)) p.server.close() })
beforeEach(() => { for (const p of Object.values(peers)) p.seen.length = 0 })

describe('fetchSharedCards: the agent\'s board asks the other hosts', () => {
  it('asks each other host for this agent and marks each card shared, with the host that holds it', async () => {
    const out = await fetchSharedCards('a2', ['beta', 'Ana'], [peers.mini.base, peers.lola.base], peers.own.base)
    expect(out.map(c => c.id).sort()).toEqual(['c-both', 'c-both', 'c-lola', 'c-mini'])
    expect(out.every(c => c.shared === true)).toBe(true)
    expect(out.find(c => c.id === 'c-mini')!.hostBase).toBe(peers.mini.base)
    expect(out.find(c => c.id === 'c-lola')!.hostBase).toBe(peers.lola.base)
    // the query carries the agent id and the names it is also known by
    expect(peers.mini.seen).toHaveLength(1)
    const u = new URL(peers.mini.seen[0], 'http://x')
    expect(u.pathname).toBe('/api/tasks/shared')
    expect(u.searchParams.get('agent')).toBe('a2')
    expect(u.searchParams.get('as')).toBe('beta,Ana')
  })

  it('does not ask the agent\'s own host again (its board answer already has its local shared cards)', async () => {
    await fetchSharedCards('a2', [], [peers.mini.base, peers.own.base], `${peers.own.base}/`)
    expect(peers.own.seen).toHaveLength(0)
    expect(peers.mini.seen).toHaveLength(1)
  })

  it('a host that is down or answers an error adds nothing and does not break the others', async () => {
    const dead = peers.own.base.replace(/:\d+$/, ':1') // nothing listens on port 1
    const out = await fetchSharedCards('a2', [], [dead, peers.broken.base, peers.mini.base], 'http://elsewhere')
    expect(out.map(c => c.id).sort()).toEqual(['c-both', 'c-mini'])
    expect(peers.broken.seen).toHaveLength(1)
  })

  it('this host is asked with an empty address (a relative URL), not skipped, when the agent lives elsewhere', async () => {
    const calls: string[] = []
    const fake = (async (url: string) => { calls.push(String(url)); return new Response(JSON.stringify({ cards: [card('c-local')] }), { status: 200 }) }) as unknown as typeof fetch
    const out = await fetchSharedCards('a2', [], ['', peers.mini.base], peers.mini.base, fake)
    expect(calls).toEqual(['/api/tasks/shared?agent=a2'])
    expect(out).toEqual([{ ...card('c-local'), shared: true, hostBase: '' }])
  })

  it('encodes the agent id and names', async () => {
    await fetchSharedCards('a b&c', ['x y'], [peers.mini.base], 'http://elsewhere')
    const u = new URL(peers.mini.seen[0], 'http://x')
    expect(u.searchParams.get('agent')).toBe('a b&c')
    expect(u.searchParams.get('as')).toBe('x y')
  })

  it('answers with no cards when no host answers', async () => {
    expect(await fetchSharedCards('a2', [], [], '')).toEqual([])
  })
})

describe('the same card from two hosts is listed once', () => {
  it('dedupeCards keeps the first copy: the board\'s own, then project cards, then the shared ones in host order', async () => {
    const shared = await fetchSharedCards('a2', [], [peers.mini.base, peers.lola.base], 'http://elsewhere')
    const own = [card('c-both', { subject: 'Card c-both (own board)' })]
    const merged = dedupeCards([...own, ...shared])
    expect(merged.filter(c => c.id === 'c-both')).toHaveLength(1)
    expect(merged.find(c => c.id === 'c-both')!.subject).toBe('Card c-both (own board)')
    expect(merged.map(c => c.id).sort()).toEqual(['c-both', 'c-lola', 'c-mini'])
  })

  it('two shared answers with the same id: the first host listed wins', async () => {
    const shared = await fetchSharedCards('a2', [], [peers.mini.base, peers.lola.base], 'http://elsewhere')
    const merged = dedupeCards(shared) as Array<{ id: string; hostBase: string }>
    expect(merged.find(c => c.id === 'c-both')!.hostBase).toBe(peers.mini.base)
  })
})

describe('GET /api/tasks/shared', () => {
  it('is never prerendered, and is served by the headless router too', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const route = fs.readFileSync(path.join(__dirname, '../app/api/tasks/shared/route.ts'), 'utf8')
    expect(route).toMatch(/export const dynamic = 'force-dynamic'/)
    const headless = fs.readFileSync(path.join(__dirname, '../services/headless-router.ts'), 'utf8')
    expect(headless).toContain('getSharedTasks')
    expect(headless).toContain('/^\\/api\\/tasks\\/shared$/')
  })

  it('answers 400 without an agent and with the cards for one', async () => {
    vi.resetModules()
    vi.doMock('@/services/agent-tasks-service', () => ({
      getSharedTasks: (agent: string, names: string[]) => (agent ? { data: { cards: [{ id: 'c1', asked: agent, names }] }, status: 200 } : { error: 'missing_field', message: 'agent is required', status: 400 }),
    }))
    const { GET } = await import('@/app/api/tasks/shared/route')
    const bad = await GET(new Request('http://x/api/tasks/shared') as never)
    expect(bad.status).toBe(400)
    const good = await GET(new Request('http://x/api/tasks/shared?agent=a2&as=beta,%20Ana,') as never)
    expect(good.status).toBe(200)
    expect(await good.json()).toEqual({ cards: [{ id: 'c1', asked: 'a2', names: ['beta', 'Ana'] }] })
    vi.doUnmock('@/services/agent-tasks-service')
  })
})
