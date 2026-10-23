import { describe, it, expect } from 'vitest'
import { AWAY_FOLD_MIN, splitAway, stageFigures } from '@/lib/world/stage'
import { islandRadius } from '@/lib/world/layout'
import type { AgentPresence } from '@/lib/agent-presence'

const mk = (counts: Partial<Record<AgentPresence, number>>) => {
  const out: Array<{ id: string; presence: AgentPresence }> = []
  let n = 0
  for (const [presence, c] of Object.entries(counts) as Array<[AgentPresence, number]>) {
    for (let i = 0; i < (c || 0); i++) out.push({ id: `a${n++}`, presence })
  }
  return out
}

describe('stageFigures', () => {
  const cases = [
    { working: 3 }, { 'needs-you': 1 }, { working: 5, ready: 14, offline: 28, 'needs-you': 1 },
    { working: 1, ready: 14, offline: 51 }, { offline: 200 },
  ]

  it('stands every agent exactly once, inside the island, and never two on one spot', () => {
    for (const c of cases) {
      const input = mk(c as Partial<Record<AgentPresence, number>>)
      const radius = islandRadius(input.length)
      const { figures } = stageFigures(input, radius)
      expect(figures.map(f => f.id).sort()).toEqual(input.map(f => f.id).sort())
      const spots = new Set(figures.map(f => `${f.x.toFixed(3)},${f.z.toFixed(3)}`))
      if (input.length <= 120) expect(spots.size).toBe(input.length)
      for (const f of figures) expect(Math.hypot(f.x, f.z)).toBeLessThanOrEqual(radius)
    }
  })

  it('reads back to front: the resting behind, workers, then the ready, with those who need you in front', () => {
    const input = mk({ 'needs-you': 3, ready: 4, working: 4, offline: 4 })
    const { figures } = stageFigures(input, islandRadius(input.length))
    const meanZ = (p: AgentPresence) => {
      const z = figures.filter(f => f.presence === p).map(f => f.z)
      return z.reduce((a, b) => a + b, 0) / z.length
    }
    expect(meanZ('offline')).toBeLessThan(meanZ('working'))
    expect(meanZ('working')).toBeLessThan(meanZ('ready'))
    expect(meanZ('ready')).toBeLessThan(meanZ('needs-you'))
  })

  it('gives each status its pose, and desks only to workers with room for them', () => {
    const small = stageFigures(mk({ working: 2, offline: 1, ready: 1, 'needs-you': 1 }), islandRadius(5)).figures
    const pose = (p: AgentPresence) => small.find(f => f.presence === p)!.pose
    expect([pose('working'), pose('ready'), pose('needs-you'), pose('offline')]).toEqual(['typing', 'standing', 'waving', 'resting'])
    expect(small.filter(f => f.desk).length).toBe(2)
    expect(small.filter(f => f.presence !== 'working').some(f => f.desk)).toBe(false)
    const crowd = stageFigures(mk({ working: 100 }), 4).figures
    expect(crowd.some(f => f.desk)).toBe(false)
  })

  it('is deterministic and handles no agents', () => {
    const input = mk({ working: 6, ready: 6 })
    expect(stageFigures(input, 4)).toEqual(stageFigures([...input].reverse(), 4))
    expect(stageFigures([], 4).figures).toEqual([])
  })
})

describe('splitAway', () => {
  it('folds the offline agents into the lounge once there are enough of them', () => {
    const figs = mk({ working: 3, ready: 5, offline: AWAY_FOLD_MIN })
    const r = splitAway(figs, false)
    expect(r.folded).toBe(true)
    expect(r.shown).toHaveLength(8)
    expect(r.shown.every(f => f.presence !== 'offline')).toBe(true)
    expect(r.away).toHaveLength(AWAY_FOLD_MIN)
  })
  it('leaves a handful of sleepers where they are', () => {
    const figs = mk({ working: 3, offline: AWAY_FOLD_MIN - 1 })
    const r = splitAway(figs, false)
    expect(r.folded).toBe(false)
    expect(r.shown).toHaveLength(figs.length)
  })
  it('puts everyone back when expanded, and keeps the away list either way', () => {
    const figs = mk({ ready: 2, offline: 20 })
    const r = splitAway(figs, true)
    expect(r.folded).toBe(false)
    expect(r.shown).toHaveLength(22)
    expect(r.away).toHaveLength(20)
  })
  it('can fold everyone: a building that is all away is an empty room with a lounge', () => {
    const r = splitAway(mk({ offline: 12 }), false)
    expect(r.shown).toHaveLength(0)
    expect(r.folded).toBe(true)
  })
})
