/**
 * How an agent looks: skin, hair and animation phase, derived from its id so it keeps the same
 * face in every renderer (the 3D map and the 2D office) and on every visit. Pure.
 */

export const SKIN = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac', '#d9a066']
export const HAIR = ['#1f1a17', '#3b2f2f', '#6b4423', '#a0522d', '#d2b48c', '#444444']

/** A small stable number from an id */
export function hash(id: string): number {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}

export interface Look {
  skin: string
  hair: string
  /** 0..2π, so the crowd does not breathe and type in step */
  phase: number
}

export function lookOf(id: string): Look {
  const h = hash(id)
  return { skin: SKIN[h % SKIN.length], hair: HAIR[(h >>> 3) % HAIR.length], phase: (h % 628) / 100 }
}
