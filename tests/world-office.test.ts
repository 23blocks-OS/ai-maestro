import { describe, it, expect } from 'vitest'
import { fitBox, spriteScale, mixBox, easeOut, boxToViewBox } from '@/lib/world/office'
import { lookOf, SKIN, HAIR } from '@/lib/world/look'

describe('fitBox', () => {
  it('keeps the whole rectangle in view, centred, at the container aspect', () => {
    for (const aspect of [0.5, 1, 1.6, 3]) {
      const b = fitBox(10, -4, 6, 3, aspect)
      expect(b.w / b.h).toBeCloseTo(aspect, 6)
      expect(b.x).toBeLessThanOrEqual(10 - 6 + 1e-9)
      expect(b.x + b.w).toBeGreaterThanOrEqual(10 + 6 - 1e-9)
      expect(b.y).toBeLessThanOrEqual(-4 - 3 + 1e-9)
      expect(b.y + b.h).toBeGreaterThanOrEqual(-4 + 3 - 1e-9)
      expect(b.x + b.w / 2).toBeCloseTo(10, 6)
      expect(b.y + b.h / 2).toBeCloseTo(-4, 6)
    }
  })
  it('falls back to a square for a nonsense aspect', () => {
    expect(fitBox(0, 0, 2, 2, NaN).w).toBeCloseTo(4)
    expect(fitBox(0, 0, 2, 2, 0).h).toBeCloseTo(4)
  })
})

describe('spriteScale', () => {
  it('is 1 in a roomy room and shrinks (never below a floor) in a crowd', () => {
    expect(spriteScale(1.3)).toBe(1)
    expect(spriteScale(0.9)).toBe(1)
    expect(spriteScale(0.6)).toBeCloseTo(0.667, 2)
    expect(spriteScale(0.2)).toBe(0.55)
  })
})

describe('camera maths', () => {
  it('mixes boxes linearly and eases out', () => {
    const a = { x: 0, y: 0, w: 10, h: 10 }, b = { x: 10, y: 20, w: 20, h: 30 }
    expect(mixBox(a, b, 0)).toEqual(a)
    expect(mixBox(a, b, 1)).toEqual(b)
    expect(mixBox(a, b, 0.5)).toEqual({ x: 5, y: 10, w: 15, h: 20 })
    expect(easeOut(0)).toBe(0)
    expect(easeOut(1)).toBe(1)
    expect(easeOut(0.5)).toBeGreaterThan(0.5)
    expect(easeOut(-1)).toBe(0)
  })
  it('formats a view box', () => {
    expect(boxToViewBox({ x: 1, y: 2, w: 3, h: 4 })).toBe('1.000 2.000 3.000 4.000')
  })
})

describe('lookOf', () => {
  it('gives an agent the same face every time, from the shared palettes', () => {
    const a = lookOf('8d92cd08-c3c9-4374-b9cd-713fe1cdbe3f')
    expect(lookOf('8d92cd08-c3c9-4374-b9cd-713fe1cdbe3f')).toEqual(a)
    expect(SKIN).toContain(a.skin)
    expect(HAIR).toContain(a.hair)
    expect(a.phase).toBeGreaterThanOrEqual(0)
    expect(a.phase).toBeLessThan(6.3)
  })
  it('varies between agents', () => {
    const seen = new Set(Array.from({ length: 40 }, (_, i) => lookOf(`agent-${i}`).skin + lookOf(`agent-${i}`).hair))
    expect(seen.size).toBeGreaterThan(5)
  })
})
