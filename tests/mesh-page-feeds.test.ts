import { describe, it, expect, vi, afterEach } from 'vitest'

vi.mock('@/services/projects-service', () => ({ listProjects: () => ({ data: { projects: [{ id: 'p1' }] }, status: 200 }) }))
vi.mock('@/services/agent-tasks-service', () => ({ getOpenTasks: () => ({ data: { cards: [] }, status: 200 }), getTaskSummary: () => ({ data: { agents: { a1: { open: 1, waiting: 0, waitingOnJuan: 0 } } }, status: 200 }) }))
vi.mock('@/services/orgs-service', () => ({ listOrgs: () => ({ data: { organizations: [], defaultOrg: 'x' }, status: 200 }) }))
vi.mock('@/services/teams-service', () => ({ listAllTeams: () => ({ data: { teams: [] }, status: 200 }) }))

const { meshFeedView, localFeed, PAGE_FEEDS } = await import('@/services/mesh-feeds-service')
const { peerFeed } = await import('@/services/shared-state')
const { fetchFeedFromHosts } = await import('@/lib/mesh-fetch')

afterEach(() => { for (const f of PAGE_FEEDS) peerFeed(f).clear(); vi.unstubAllGlobals() })

describe('page feeds over /mesh', () => {
  it('publishes this host\'s whole answer as one item, and serves it with the connected peers\' copies', async () => {
    expect(await localFeed('projects')).toEqual({ all: { projects: [{ id: 'p1' }] } })
    peerFeed('projects').set('mac-mini', { items: { all: { projects: [{ id: 'p2' }] } }, seq: 1, okAt: 1, connected: true })
    peerFeed('projects').set('down', { items: { all: { projects: [{ id: 'p3' }] } }, seq: 1, okAt: 1, connected: false })
    expect((await meshFeedView('projects')).data).toEqual({ self: { projects: [{ id: 'p1' }] }, peers: [{ hostId: 'mac-mini', data: { projects: [{ id: 'p2' }] } }] })
    expect((await meshFeedView('nope')).status).toBe(404)
  })

  it('the page asks its own host once and only the hosts missing from the answer', async () => {
    const hosts: any[] = [{ id: 'me', name: 'me', url: 'http://me', isSelf: true }, { id: 'mac-mini', name: 'mini', url: 'http://mini/' }, { id: 'lola', name: 'lola', url: 'http://lola' }, { id: 'off', url: 'http://off', enabled: false }]
    const f = vi.fn(async (url: string) => {
      if (url === '/api/mesh/projects') return { ok: true, status: 200, json: async () => ({ self: { projects: ['p1'] }, peers: [{ hostId: 'mac-mini', data: { projects: ['p2'] } }] }) }
      if (url === 'http://lola/api/projects') return { ok: true, status: 200, json: async () => ({ projects: ['p3'] }) }
      throw new Error('unexpected ' + url)
    })
    vi.stubGlobal('fetch', f)
    const r = await fetchFeedFromHosts<any>(hosts, 'projects', '/api/projects')
    expect(r.map(a => [a.host.id, a.ok, a.base, a.data?.projects])).toEqual([['me', true, '', ['p1']], ['mac-mini', true, 'http://mini', ['p2']], ['lola', true, 'http://lola', ['p3']]])
    expect(f).toHaveBeenCalledTimes(2)
  })

  it('a host without the route counts as empty when asked (orgs), and an unreachable one as down', async () => {
    const hosts: any[] = [{ id: 'old', name: 'old', url: 'http://old' }, { id: 'dead', name: 'dead', url: 'http://dead' }]
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.startsWith('/api/mesh')) throw new Error('own host down')
      if (url.startsWith('http://old')) return { ok: false, status: 404, json: async () => ({}) }
      throw new Error('down')
    }))
    const r = await fetchFeedFromHosts<any>(hosts, 'orgs', '/api/orgs', 1000, { missingIsEmpty: true })
    expect(r.map(a => [a.host.id, a.ok])).toEqual([['old', true], ['dead', false]])
  })
})
