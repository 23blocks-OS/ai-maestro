/**
 * Where the islands go: pure, so the no-overlap rule is tested without a canvas.
 */

import type { WorldGroup } from '@/lib/world/grouping'

/** An island grows with its agent count (a 3-agent island is 2.8 wide, a 66-agent one 5.7) */
export const islandRadius = (count: number) => 2 + Math.sqrt(count) * 0.45

/**
 * Islands on a grid whose cells fit the largest island, so none overlaps its neighbour.
 * `extent` is the half-width of the grid, which the camera uses to see all of it.
 */
export function layoutIslands(groups: Pick<WorldGroup, 'counts'>[]): { positions: Array<[number, number]>; extent: number } {
  const total = groups.length
  const cols = Math.max(1, Math.ceil(Math.sqrt(total)))
  const rows = Math.max(1, Math.ceil(total / cols))
  const spacing = 2 * Math.max(2, ...groups.map(g => islandRadius(g.counts.total))) + 1.5
  const positions = groups.map((_, i): [number, number] => [
    (i % cols - (cols - 1) / 2) * spacing,
    (Math.floor(i / cols) - (rows - 1) / 2) * spacing,
  ])
  return { positions, extent: (Math.max(cols, rows) * spacing) / 2 }
}

/** One building on an island's skyline, island-local (the island's centre is 0,0; +z is the front) */
export interface SkylineBox {
  /** Index into the list that was laid out */
  index: number
  x: number
  z: number
  w: number
  d: number
  h: number
}

/** A building grows with the agents inside it: wider and taller, but never a needle or a slab */
export function buildingSize(count: number): { w: number; d: number; h: number } {
  const r = Math.sqrt(Math.max(count, 1))
  return { w: Math.min(2.6, 1.1 + r * 0.28), d: Math.min(1.8, 0.95 + r * 0.08), h: Math.min(6.5, 1.1 + r * 0.78) }
}

/**
 * The skyline: the island's buildings standing in a row across the back of the island, the biggest in
 * the middle and the smaller ones stepping down to the sides, facing the viewer. A crowd of buildings
 * wraps onto a second row in front of the first. Every building stands inside the island
 * (nothing near the rim). Pure, so "nothing overlaps and nothing hangs over the edge" is tested.
 */
export function layoutSkyline(counts: number[], radius: number): SkylineBox[] {
  const n = counts.length
  if (n === 0) return []
  // Biggest in the middle, then alternately right and left outwards
  const order = [...counts.keys()].sort((a, b) => counts[b] - counts[a] || a - b)
  const arranged: number[] = []
  order.forEach((idx, i) => { if (i % 2 === 0) arranged.push(idx); else arranged.unshift(idx) })
  // Put the largest back in the middle of the row
  const mid = Math.floor(arranged.length / 2)
  const big = arranged.indexOf(order[0])
  if (big !== mid) { const t = arranged[mid]; arranged[mid] = arranged[big]; arranged[big] = t }

  const GAP = 0.4
  const limit = radius * 0.8
  const sizes = counts.map(buildingSize)
  const boxes: SkylineBox[] = []
  let rowZ = -radius * 0.42
  let row: number[] = []
  const rowWidth = (r: number[]) => r.reduce((t, i) => t + sizes[i].w, 0) + GAP * Math.max(0, r.length - 1)
  const flush = () => {
    if (!row.length) return
    const depth = Math.max(...row.map(i => sizes[i].d))
    let x = -rowWidth(row) / 2
    for (const i of row) {
      boxes.push({ index: i, x: x + sizes[i].w / 2, z: rowZ, w: sizes[i].w, d: sizes[i].d, h: sizes[i].h })
      x += sizes[i].w + GAP
    }
    rowZ += depth + 0.9
    row = []
  }
  for (const i of arranged) {
    // How wide the island is at this row (a chord of the circle), less a margin
    const chord = 2 * Math.sqrt(Math.max(0, limit * limit - rowZ * rowZ))
    if (row.length && rowWidth([...row, i]) > chord) flush()
    row.push(i)
  }
  flush()
  return boxes
}
