import { describe, it, expect } from 'vitest'
import { folderClusters, zoneAgents, OTHER_KEY, MIN_FOLDER_CLUSTER } from '@/lib/world/zones'
import { layoutZones, stageRoom, ZONE_LABEL } from '@/lib/world/rooms'
import { stageFigures } from '@/lib/world/stage'

const ag = (id: string, workingDirectory?: string, tags?: string[]) => ({ id, workingDirectory, tags })
const blocks = ['gateway', 'crm', 'forms', 'jarvis', 'sales', 'files'].map((b, i) => ag(`b${i}`, `/Users/juan/23blocks/blocks/${b}/api`))

describe('folderClusters', () => {
  it('puts sibling service folders in the room of their shared parent', () => {
    const c = folderClusters(blocks)
    expect([...new Set(c.values())]).toEqual(['/Users/juan/23blocks/blocks'])
  })
  it('puts agents in one repo in that repo, deeper than a shared parent', () => {
    const agents = [...blocks, ...[1, 2, 3].map(i => ag(`w${i}`, '/Users/juan/23blocks/webApps/agents-web'))]
    const c = folderClusters(agents)
    expect(c.get('w1')).toBe('/Users/juan/23blocks/webApps/agents-web')
    expect(c.get('b0')).toBe('/Users/juan/23blocks/blocks')
  })
  it('needs enough agents to name a room, ignores home folders and temp folders, and skips agents with no folder', () => {
    const few = [ag('x1', '/Users/juan/a/b'), ag('x2', '/Users/juan/a/c')]
    expect(MIN_FOLDER_CLUSTER).toBe(3)
    expect(folderClusters(few).size).toBe(0)
    const home = [1, 2, 3, 4].map(i => ag(`h${i}`, '/Users/juan'))
    expect(folderClusters(home).size).toBe(0)
    const tmp = [1, 2, 3].map(i => ag(`t${i}`, '/private/tmp/scratch'))
    expect(folderClusters(tmp).size).toBe(0)
    expect(folderClusters([ag('n1'), ag('n2'), ag('n3')]).size).toBe(0)
  })
})

describe('zoneAgents', () => {
  it('splits by folder, biggest first, with the strays in "Other" last', () => {
    const agents = [...blocks, ...[1, 2, 3].map(i => ag(`w${i}`, '/Users/juan/23blocks/webApps/agents-web')), ag('lone', '/Users/juan/3Metas/x/y'), ag('nodir')]
    const z = zoneAgents(agents, 'folder')
    expect(z.map(r => r.label)).toEqual(['blocks', 'agents-web', 'Other'])
    expect(z[0].ids).toHaveLength(6)
    expect(z[2].key).toBe(OTHER_KEY)
    expect(z[2].ids.sort()).toEqual(['lone', 'nodir'])
  })
  it('names two rooms with the same last folder by their parent too', () => {
    const a = [1, 2, 3].map(i => ag(`a${i}`, '/Users/juan/x/api'))
    const b = [1, 2, 3].map(i => ag(`b${i}`, '/Users/juan/y/api'))
    expect(zoneAgents([...a, ...b], 'folder').map(r => r.label).sort()).toEqual(['x/api', 'y/api'])
  })
  it('splits by role tag', () => {
    const agents = [ag('a', undefined, ['role:gm']), ag('b', undefined, ['role:gm']), ag('c', undefined, ['role:cmo']), ag('d', undefined, ['role:cmo']), ag('e')]
    const z = zoneAgents(agents, 'role')
    expect(z.map(r => r.label)).toEqual(['cmo', 'gm', 'Other'])
  })
  it('splits by the biggest team an agent is on', () => {
    const agents = ['a', 'b', 'c', 'd', 'e', 'f'].map(id => ag(id))
    const teams = [{ id: 't1', name: 'Big', agentIds: ['a', 'b', 'c', 'd'] }, { id: 't2', name: 'Small', agentIds: ['c', 'd', 'e', 'f'] }, { id: 't3', name: 'Tiny', agentIds: ['a'] }]
    const z = zoneAgents(agents, 'team', teams)
    expect(z.find(r => r.label === 'Big')!.ids.sort()).toEqual(['a', 'b', 'c', 'd'])
    expect(z.find(r => r.label === 'Small')!.ids.sort()).toEqual(['e', 'f'])
  })
  it('gives nothing when the mode is none, the crowd is tiny, or it would be one room', () => {
    expect(zoneAgents(blocks, 'none')).toEqual([])
    expect(zoneAgents([ag('a'), ag('b'), ag('c')], 'folder')).toEqual([])
    expect(zoneAgents(blocks, 'folder')).toEqual([])
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
