/**
 * Staging: where each agent stands on its island and what it is doing there. Pure, so the layout
 * rules (nobody off the island, nobody on top of anybody) are tested without a canvas.
 *
 * The island is read like a small office, back to front, so the status is a place as well as a colour:
 *   back   resting   (offline: standing, greyed, a small zz; never lying down)
 *          working   at a desk (typing)
 *          ready     standing, idle
 *   front  needs you at the plaza on the doorstep, waving at you (the camera looks from the front)
 * Agents fill a grid of cells inside the island, bands in that order; the grid is as coarse as the
 * crowd allows, so a 3-agent island is spacious and a 66-agent one is still a clean grid.
 */

import type { AgentPresence } from '@/lib/agent-presence'

export type Pose = 'typing' | 'standing' | 'waving' | 'resting'

export interface StageInput {
  id: string
  presence: AgentPresence
}

export interface StagedFigure {
  id: string
  presence: AgentPresence
  pose: Pose
  /** Island-local position (the island's centre is 0,0; +z is the front, towards the viewer) */
  x: number
  z: number
  /** Whether a desk stands in front of it */
  desk: boolean
}

const POSE: Record<AgentPresence, Pose> = {
  offline: 'resting',
  working: 'typing',
  ready: 'standing',
  'needs-you': 'waving',
}
/** Back to front */
const ORDER: AgentPresence[] = ['offline', 'working', 'ready', 'needs-you']

/** Grid steps tried from roomy to tight; below the smallest the island is simply full */
const STEPS = [1.3, 1.1, 0.95, 0.8, 0.7, 0.6, 0.5, 0.42, 0.36]
/** Agents keep inside this share of the island's radius */
const FIT = 0.86
/** Desks need this much room between agents */
const DESK_STEP = 0.8

function cells(radius: number, step: number): Array<[number, number]> {
  const limit = radius * FIT
  const out: Array<[number, number]> = []
  const n = Math.floor(limit / step)
  for (let iz = -n; iz <= n; iz++) {
    for (let ix = -n; ix <= n; ix++) {
      const x = ix * step
      const z = iz * step
      if (Math.hypot(x, z) <= limit) out.push([x, z])
    }
  }
  // Back to front, left to right
  return out.sort((a, b) => a[1] - b[1] || a[0] - b[0])
}

export function stageFigures(figures: StageInput[], radius: number): { figures: StagedFigure[]; step: number } {
  const total = figures.length
  if (total === 0) return { figures: [], step: STEPS[0] }
  let step = STEPS[STEPS.length - 1]
  let grid = cells(radius, step)
  for (const s of STEPS) {
    const g = cells(radius, s)
    if (g.length >= total) { step = s; grid = g; break }
  }

  // Bands back to front: the first cells go to the sleepers, the last to those who need you.
  const sorted = [...figures].sort((a, b) =>
    ORDER.indexOf(a.presence) - ORDER.indexOf(b.presence) || a.id.localeCompare(b.id))
  // Spread the used cells evenly through the grid (rather than packing the back rows)
  // by taking every k-th cell, so the crowd fills the island and bands still run back to front.
  const pick = (i: number) => grid[Math.min(grid.length - 1, Math.floor(((i + 0.5) * grid.length) / total))]
  const desks = step >= DESK_STEP
  return {
    step,
    figures: sorted.map((f, i) => {
      const [x, z] = pick(i)
      return { id: f.id, presence: f.presence, pose: POSE[f.presence], x, z, desk: desks && f.presence === 'working' }
    }),
  }
}
