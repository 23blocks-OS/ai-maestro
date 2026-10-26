/**
 * Where everyone stands in a room that has rooms inside it. Pure: the zone rectangles and the staging inside
 * them are tested without a canvas, and both renderers (3D and 2D) read the same numbers.
 *
 * Room coordinates are the room's own: the room is the square [-half, half] on both axes, x to the right and
 * z towards the viewer (the front), as lib/world/stage.ts has them.
 */

import { stageFigures, type StageInput, type StagedFigure } from '@/lib/world/stage'
import type { AgentPresence } from '@/lib/agent-presence'
import type { Zone } from '@/lib/world/zones'

export interface ZoneRect {
  key: string
  label: string
  x: number
  z: number
  w: number
  d: number
  count: number
}

/** Space reserved at the top of a zone for its name */
export const ZONE_LABEL = 0.55
/** Gap between neighbouring zones */
const GAP = 0.14

interface Item { key: string; label: string; n: number }

/**
 * Cut the room into one rectangle per zone, bigger for bigger zones: the list is split in two halves of
 * about equal weight, and the rectangle is cut along its longer side in that proportion, recursively.
 * Every rectangle stays inside the room and none overlaps another.
 */
export function layoutZones(items: Item[], half: number): ZoneRect[] {
  const weight = (i: Item) => i.n + 2.5
  const out: ZoneRect[] = []
  const place = (list: Item[], x: number, z: number, w: number, d: number) => {
    if (list.length === 1) {
      const i = list[0]
      out.push({ key: i.key, label: i.label, x: x + GAP / 2, z: z + GAP / 2, w: Math.max(0.2, w - GAP), d: Math.max(0.2, d - GAP), count: i.n })
      return
    }
    const total = list.reduce((t, i) => t + weight(i), 0)
    let acc = 0
    let cut = 1
    let best = Infinity
    for (let k = 1; k < list.length; k++) {
      acc += weight(list[k - 1])
      const diff = Math.abs(total / 2 - acc)
      if (diff < best) { best = diff; cut = k }
    }
    const a = list.slice(0, cut), b = list.slice(cut)
    const share = a.reduce((t, i) => t + weight(i), 0) / total
    if (w >= d) {
      place(a, x, z, w * share, d)
      place(b, x + w * share, z, w * (1 - share), d)
    } else {
      place(a, x, z, w, d * share)
      place(b, x, z + d * share, w, d * (1 - share))
    }
  }
  if (items.length > 0) place([...items].sort((p, q) => q.n - p.n), -half, -half, half * 2, half * 2)
  return out
}

/** Grid steps tried from roomy to tight (the same ladder as the circular staging) */
const STEPS = [1.3, 1.1, 0.95, 0.8, 0.7, 0.6, 0.5, 0.42, 0.36]
const DESK_STEP = 0.8
const ORDER: AgentPresence[] = ['offline', 'working', 'ready', 'needs-you']
const POSE: Record<AgentPresence, StagedFigure['pose']> = { offline: 'resting', working: 'typing', ready: 'standing', 'needs-you': 'waving' }

/** Stand a zone's people on a grid inside its rectangle (below the name), the quietest at the back */
function stageInRect(figs: StageInput[], r: ZoneRect): { figures: StagedFigure[]; step: number } {
  const n = figs.length
  if (n === 0) return { figures: [], step: STEPS[0] }
  const top = r.z + ZONE_LABEL + 0.15
  const h = Math.max(0.3, r.d - ZONE_LABEL - 0.2)
  const w = Math.max(0.3, r.w - 0.2)
  let step = STEPS[STEPS.length - 1]
  for (const s of STEPS) {
    if (Math.max(1, Math.floor(w / s)) * Math.max(1, Math.floor(h / s)) >= n) { step = s; break }
  }
  const cols = Math.max(1, Math.floor(w / step))
  const rows = Math.max(1, Math.ceil(n / cols))
  // Centre the block in the rectangle; a crowd that does not fit spills downwards rather than overlapping a neighbour sideways
  const gridW = Math.min(cols, n) * step
  const x0 = r.x + 0.1 + (w - gridW) / 2 + step / 2
  const z0 = top + Math.min(Math.max(0, (h - rows * step) / 2), 0.4) + step / 2
  const sorted = [...figs].sort((a, b) => ORDER.indexOf(a.presence) - ORDER.indexOf(b.presence) || a.id.localeCompare(b.id))
  const desks = step >= DESK_STEP
  return {
    step,
    figures: sorted.map((f, i) => ({
      id: f.id,
      presence: f.presence,
      pose: POSE[f.presence],
      x: x0 + (i % cols) * step,
      z: z0 + Math.floor(i / cols) * step,
      desk: desks && f.presence === 'working',
    })),
  }
}

export interface StagedRoom {
  figures: StagedFigure[]
  step: number
  zones: ZoneRect[]
}

/**
 * The people of a room, standing: in rooms of their own when `zones` split them, else as one crowd in the
 * circle `stageFigures` has always used. Anyone the zones do not name stands in the last zone.
 */
export function stageRoom(figures: StageInput[], half: number, zones: Zone[] = []): StagedRoom {
  if (zones.length < 2) {
    const s = stageFigures(figures, half / 0.86)
    return { figures: s.figures, step: s.step, zones: [] }
  }
  const byId = new Map(figures.map(f => [f.id, f]))
  const assigned = new Set<string>()
  const members = zones.map(z => {
    const m = z.ids.map(id => byId.get(id)).filter((f): f is StageInput => !!f && !assigned.has(f.id))
    m.forEach(f => assigned.add(f.id))
    return m
  })
  const stray = figures.filter(f => !assigned.has(f.id))
  members[members.length - 1] = [...members[members.length - 1], ...stray]
  const rects = layoutZones(zones.map((z, i) => ({ key: z.key, label: z.label, n: members[i].length })), half)
  const rectOf = new Map(rects.map(r => [r.key, r]))
  const staged: StagedFigure[] = []
  let step = STEPS[0]
  zones.forEach((z, i) => {
    const r = rectOf.get(z.key)
    if (!r) return
    const s = stageInRect(members[i], r)
    staged.push(...s.figures)
    step = Math.min(step, s.step)
  })
  return { figures: staged, step, zones: rects }
}
