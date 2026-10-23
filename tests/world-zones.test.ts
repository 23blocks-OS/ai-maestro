import { describe, it, expect } from 'vitest'
import { bestZoneMode, togetherGroups, zoneAgents, OTHER_KEY, MAX_SHARE } from '@/lib/world/zones'
import { layoutZones, stageRoom, ZONE_LABEL } from '@/lib/world/rooms'
import { stageFigures } from '@/lib/world/stage'

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const ag = (id: string, extra: Record<string, unknown> = {}) => ({ id, ...extra })
const talk = (a: string, b: string, weight = 5) => ({ a: a < b ? a : b, b: a < b ? b : a, kind: 'talk' as const, weight })

describe('zoneAgents by manager', () => {
  const lola = U(1)
  const agents = [
    ag('a', { managerAgentId: lola }), ag('b', { managerAgentId: lola }), ag('c', { managerAgentId: lola }),
    ag('d', { humanManager: 'Ana' }), ag('e', { humanManager: 'ana' }),
    ag('f', { humanManager: 'Raul' }), ag('g'), ag('h'),
  ]
  const nameOf = (id: string) => (id === lola ? 'Lola' : id)
  it('puts an agent manager\'s reports in one room, and a person\'s in another (ignoring case)', () => {
    const z = zoneAgents(agents, 'manager', { nameOf })
    expect(z.map(r => r.label)).toEqual(["Lola's team", "Ana's team", 'Other'])
    expect(z[0].ids).toEqual(['a', 'b', 'c'])
  })
  it('lets the agent manager win when an agent has both', () => {
    const both = [...agents, ag('i', { managerAgentId: lola, humanManager: 'Ana' })]
    const z = zoneAgents(both, 'manager', { nameOf })
    expect(z[0].ids).toContain('i')
  })
  it('folds a lone report and the unmanaged into Other', () => {
    const z = zoneAgents(agents, 'manager', { nameOf })
    expect(z[z.length - 1].key).toBe(OTHER_KEY)
    expect(z[z.length - 1].ids.sort()).toEqual(['f', 'g', 'h'])
  })
  it('gives nothing when one person manages almost everyone (a split that says nothing)', () => {
    const all = Array.from({ length: 10 }, (_, i) => ag(`x${i}`, { humanManager: i < 9 ? 'Juan' : 'Zoe' }))
    expect(zoneAgents(all, 'manager')).toEqual([])
    expect(MAX_SHARE).toBeLessThan(0.9)
  })
})

describe('togetherGroups and zoneAgents by who works together', () => {
  // two chatty groups {a,b,c} and {d,e,f}, one weak link between them, and a loner
  const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g']
  const ties = [talk('a', 'b', 9), talk('b', 'c', 8), talk('a', 'c', 7), talk('d', 'e', 9), talk('e', 'f', 8), talk('d', 'f', 7), talk('c', 'd', 1)]
  it('finds the two groups the messages make', () => {
    const g = togetherGroups(ids, ties)
    expect(g.get('a')).toBe(g.get('b'))
    expect(g.get('b')).toBe(g.get('c'))
    expect(g.get('d')).toBe(g.get('e'))
    expect(g.get('e')).toBe(g.get('f'))
    expect(g.get('a')).not.toBe(g.get('d'))
  })
  it('is the same every time', () => {
    expect([...togetherGroups(ids, ties)]).toEqual([...togetherGroups([...ids].reverse(), ties)].sort((x, y) => x[0].localeCompare(y[0])))
  })
  it('names each room for its centre and puts the loner in Other', () => {
    const z = zoneAgents(ids.map(id => ag(id)), 'together', { talk: ties, nameOf: id => id.toUpperCase() })
    expect(z.map(r => r.ids.slice().sort().join(''))).toEqual(['abc', 'def', 'g'])
    expect(z[0].label).toMatch(/'s circle$/)
    expect(z[2].key).toBe(OTHER_KEY)
  })
  it('ignores ties to agents outside the building and ties that are not messages', () => {
    const g = togetherGroups(['a', 'b'], [talk('a', 'z', 9), { a: 'a', b: 'b', kind: 'task' as const, weight: 9 }])
    expect(g.get('a')).not.toBe(g.get('b'))
  })
})

describe('zoneAgents by role and team', () => {
  it('splits by role tag', () => {
    const agents = [ag('a', { tags: ['role:gm'] }), ag('b', { tags: ['role:gm'] }), ag('c', { tags: ['role:cmo'] }), ag('d', { tags: ['role:cmo'] }), ag('e')]
    expect(zoneAgents(agents, 'role').map(r => r.label)).toEqual(['cmo', 'gm', 'Other'])
  })
  it('splits by the biggest team an agent is on', () => {
    const agents = ['a', 'b', 'c', 'd', 'e', 'f'].map(id => ag(id))
    const teams = [{ id: 't1', name: 'Big', agentIds: ['a', 'b', 'c', 'd'] }, { id: 't2', name: 'Small', agentIds: ['c', 'd', 'e', 'f'] }, { id: 't3', name: 'Tiny', agentIds: ['a'] }]
    const z = zoneAgents(agents, 'team', { teams })
    expect(z.find(r => r.label === 'Big')!.ids.sort()).toEqual(['a', 'b', 'c', 'd'])
    expect(z.find(r => r.label === 'Small')!.ids.sort()).toEqual(['e', 'f'])
  })
  it('gives nothing for none, a tiny crowd, or nothing to split by', () => {
    expect(zoneAgents([ag('a'), ag('b'), ag('c'), ag('d')], 'none')).toEqual([])
    expect(zoneAgents([ag('a'), ag('b'), ag('c')], 'role')).toEqual([])
    expect(zoneAgents(Array.from({ length: 8 }, (_, i) => ag(`x${i}`)), 'role')).toEqual([])
  })
})

describe('bestZoneMode', () => {
  it('picks the first mode that puts most of the building in real rooms, else none', () => {
    const agents = Array.from({ length: 10 }, (_, i) => ag(`x${i}`, { managerAgentId: i < 5 ? U(1) : U(2) }))
    expect(bestZoneMode(agents)).toBe('manager')
    expect(bestZoneMode(Array.from({ length: 10 }, (_, i) => ag(`y${i}`)))).toBe('none')
  })
  it('skips a mode whose rooms cover too little of the building', () => {
    const agents = Array.from({ length: 10 }, (_, i) => ag(`z${i}`, i < 4 ? { managerAgentId: i < 2 ? U(1) : U(2) } : {}))
    expect(bestZoneMode(agents)).toBe('none')
  })
})

describe('layoutZones', () => {
  const items = [{ key: 'a', label: 'a', n: 30 }, { key: 'b', label: 'b', n: 12 }, { key: 'c', label: 'c', n: 6 }, { key: 'd', label: 'd', n: 2 }]
  const half = 4
  const rects = layoutZones(items, half)
  it('gives every zone a rectangle inside the room', () => {
    expect(rects).toHaveLength(4)
    for (const r of rects) {
      expect(r.x).toBeGreaterThanOrEqual(-half - 1e-9)
      expect(r.z).toBeGreaterThanOrEqual(-half - 1e-9)
      expect(r.x + r.w).toBeLessThanOrEqual(half + 1e-9)
      expect(r.z + r.d).toBeLessThanOrEqual(half + 1e-9)
    }
  })
  it('overlaps none of them', () => {
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i], b = rects[j]
      const apart = a.x + a.w <= b.x + 1e-9 || b.x + b.w <= a.x + 1e-9 || a.z + a.d <= b.z + 1e-9 || b.z + b.d <= a.z + 1e-9
      expect(apart).toBe(true)
    }
  })
  it('gives a bigger zone a bigger rectangle', () => {
    const area = (k: string) => { const r = rects.find(x => x.key === k)!; return r.w * r.d }
    expect(area('a')).toBeGreaterThan(area('b'))
    expect(area('b')).toBeGreaterThan(area('d'))
  })
})

describe('stageRoom', () => {
  const figs = Array.from({ length: 20 }, (_, i) => ({ id: `f${i}`, presence: (['working', 'ready', 'offline', 'needs-you'] as const)[i % 4] }))
  const zones = [
    { key: 'z1', label: 'one', ids: figs.slice(0, 12).map(f => f.id) },
    { key: 'z2', label: 'two', ids: figs.slice(12, 18).map(f => f.id) },
    { key: '~other', label: 'Other', ids: [] as string[] },
  ]
  it('without zones is the circular staging it always was', () => {
    const r = stageRoom(figs, 4)
    expect(r.zones).toEqual([])
    expect(r.figures).toEqual(stageFigures(figs, 4 / 0.86).figures)
  })
  it('stands everyone in their zone, below its name, and exactly once', () => {
    const r = stageRoom(figs, 4, zones)
    expect(r.figures).toHaveLength(20)
    expect(new Set(r.figures.map(f => f.id)).size).toBe(20)
    for (const z of zones.slice(0, 2)) {
      const rect = r.zones.find(x => x.key === z.key)!
      for (const id of z.ids) {
        const f = r.figures.find(x => x.id === id)!
        expect(f.x).toBeGreaterThan(rect.x - 1e-9)
        expect(f.x).toBeLessThan(rect.x + rect.w + 1e-9)
        expect(f.z).toBeGreaterThanOrEqual(rect.z + ZONE_LABEL - 1e-9)
      }
    }
  })
  it('puts anyone the zones do not name in the last zone', () => {
    const r = stageRoom(figs, 4, zones)
    const other = r.zones.find(x => x.key === '~other')!
    for (const id of ['f18', 'f19']) {
      const f = r.figures.find(x => x.id === id)!
      expect(f.x).toBeGreaterThan(other.x - 1e-9)
      expect(f.x).toBeLessThan(other.x + other.w + 1e-9)
    }
  })
})
