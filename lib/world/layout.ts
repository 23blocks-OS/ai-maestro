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
