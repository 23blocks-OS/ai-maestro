import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { islandRadius, layoutIslands } from '@/lib/world/layout'
import { EXPERIMENT_KEYS, readExperiment } from '@/lib/experiments'

const groupOf = (total: number) => ({ counts: { total, working: 0, needsYou: 0, ready: 0, offline: 0 } })

describe('world layout', () => {
  it('never overlaps two islands, whatever their sizes (the real fleet: 66, 48, 26, 12, 10, 3)', () => {
    for (const sizes of [[66, 48, 26, 12, 10, 3], [1], [200, 1, 1, 1, 1], Array.from({ length: 23 }, (_, i) => i * 7 + 1)]) {
      const { positions } = layoutIslands(sizes.map(groupOf))
      for (let i = 0; i < sizes.length; i++) {
        for (let j = i + 1; j < sizes.length; j++) {
          const d = Math.hypot(positions[i][0] - positions[j][0], positions[i][1] - positions[j][1])
          expect(d).toBeGreaterThanOrEqual(islandRadius(sizes[i]) + islandRadius(sizes[j]))
        }
      }
    }
  })

  it('keeps every island inside the extent the camera fits', () => {
    const sizes = [66, 48, 26, 12, 10, 3]
    const { positions, extent } = layoutIslands(sizes.map(groupOf))
    positions.forEach(([x, z]) => {
      expect(Math.abs(x)).toBeLessThanOrEqual(extent)
      expect(Math.abs(z)).toBeLessThanOrEqual(extent)
    })
  })

  it('handles no islands', () => {
    expect(layoutIslands([])).toEqual({ positions: [], extent: expect.any(Number) })
  })
})

describe('experiment flag', () => {
  const store = new Map<string, string>()
  beforeEach(() => {
    store.clear()
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('is off by default and on only for the exact string "true"', () => {
    expect(readExperiment('world-view')).toBe(false)
    store.set(EXPERIMENT_KEYS['world-view'], 'false')
    expect(readExperiment('world-view')).toBe(false)
    store.set(EXPERIMENT_KEYS['world-view'], 'true')
    expect(readExperiment('world-view')).toBe(true)
  })

  it('is off when storage throws (private window, blocked site data)', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked') } })
    expect(readExperiment('world-view')).toBe(false)
  })
})

import { buildingSize, layoutSkyline } from '@/lib/world/layout'

describe('skyline', () => {
  const overlap = (a: { x: number; z: number; w: number; d: number }, b: { x: number; z: number; w: number; d: number }) =>
    Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.z - b.z) < (a.d + b.d) / 2

  it('keeps every building inside the island, never at the rim, and none on top of another', () => {
    const cases: Array<{ counts: number[]; radius: number }> = [
      { counts: [55, 12, 3], radius: islandRadius(70) },
      { counts: [1], radius: islandRadius(1) },
      { counts: [10, 10, 10, 10, 10, 10, 10, 10], radius: islandRadius(80) },
      { counts: [66, 48, 26, 12, 10, 3, 1, 1], radius: islandRadius(167) },
    ]
    for (const { counts, radius } of cases) {
      const boxes = layoutSkyline(counts, radius)
      expect(boxes.map(b => b.index).sort()).toEqual(counts.map((_, i) => i))
      for (const b of boxes) {
        for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
          expect(Math.hypot(b.x + (dx * b.w) / 2, b.z + (dz * b.d) / 2)).toBeLessThanOrEqual(radius * 0.95)
        }
      }
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) expect(overlap(boxes[i], boxes[j])).toBe(false)
    }
  })

  it('puts the biggest building in the middle of the row, at the back, facing out', () => {
    const boxes = layoutSkyline([2, 30, 5], islandRadius(37))
    const big = boxes.find(b => b.index === 1)!
    expect(Math.abs(big.x)).toBeLessThan(1.5)
    expect(big.z).toBeLessThan(0)
    expect(Math.max(...boxes.map(b => b.h))).toBe(big.h)
  })

  it('sizes a building by its agents, within sane bounds', () => {
    expect(buildingSize(1).h).toBeLessThan(buildingSize(50).h)
    for (const n of [0, 1, 7, 500]) { const s = buildingSize(n); expect(s.h).toBeLessThanOrEqual(6.5); expect(s.w).toBeLessThanOrEqual(2.6) }
    expect(layoutSkyline([], 4)).toEqual([])
  })
})
