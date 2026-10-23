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
