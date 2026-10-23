'use client'

/**
 * The 2D office: the same world as the 3D map, seen from above in plain SVG. It takes exactly the props
 * the 3D scene takes (same groups, same figures, same lenses, same pulses), so the page swaps one for
 * the other with a toggle. An island is a floor, a building is a room, an agent is a small person at a
 * desk. No WebGL, no assets, no dependencies: it runs on a phone, and only the selected room draws people.
 *
 *   overview   every island's floor with its rooms (a dot per agent, in the status colours)
 *   island     the floor close up, its rooms named
 *   room       the room, its people at desks, standing, away, or waving with a speech bubble
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { WorldBuilding, WorldGroup } from '@/lib/world/grouping'
import { buildingSize, islandRadius, layoutIslands, layoutSkyline } from '@/lib/world/layout'
import { stageFigures } from '@/lib/world/stage'
import type { Pose } from '@/lib/world/stage'
import { PULSE_MS, type WorldPulse } from '@/lib/world/pulse'
import { lookOf } from '@/lib/world/look'
import { boxToViewBox, easeOut, fitBox, mixBox, spriteScale, type Box } from '@/lib/world/office'
import type { AgentTie, GroupArc, TieKind, WorkSummary } from '@/lib/world/relations'
import type { AgentPresence } from '@/lib/agent-presence'
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion'
import type { WorldFigure, WorldLens, WorldTies } from '@/components/world/WorldScene'

// The status colours, as in the 3D map and PRESENCE_STYLE (lib/agent-presence.ts)
const HEX: Record<AgentPresence, string> = { working: '#10b981', 'needs-you': '#f97316', ready: '#facc15', offline: '#6b7280' }
const TIE_HEX = { talk: '#fbbf24', task: '#38bdf8', both: '#c084fc' }
const tieColor = (kinds: TieKind[]) => (kinds.length > 1 ? TIE_HEX.both : TIE_HEX[kinds[0]])

/** Half the width of a room, as in the 3D map */
function roomHalf(agentCount: number, islandR: number): number {
  return Math.min(islandRadius(agentCount) * 0.9, islandR * 0.68)
}

const clip = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1)}…` : t)

/** The drawn size of a room on the island floor: never smaller than a label and a few dots need */
function roomSize(b: WorldBuilding): { w: number; d: number } {
  const size = buildingSize(b.agents.length)
  return { w: Math.max(size.w, 1.3), d: Math.max(size.d + 0.45, 1.25) }
}

interface Floor { x0: number; y0: number; x1: number; y1: number }

/**
 * The floor of an island, island-local. Inside a room it is the wide floor the room stands on; otherwise it
 * hugs the rooms (no empty front yard), with a margin for the island's name above and the counts below.
 */
function floorOf(g: WorldGroup, inside: boolean): Floor {
  const r = islandRadius(g.counts.total)
  if (inside) return { x0: -r, y0: -r * 0.85, x1: r, y1: r * 0.85 }
  const sky = layoutSkyline(g.buildings.map(b => b.agents.length), r)
  if (sky.length === 0) return { x0: -1.5, y0: -1, x1: 1.5, y1: 1 }
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
  for (const box of sky) {
    const { w, d } = roomSize(g.buildings[box.index])
    x0 = Math.min(x0, box.x - w / 2); x1 = Math.max(x1, box.x + w / 2)
    y0 = Math.min(y0, box.z - d / 2); y1 = Math.max(y1, box.z + d / 2)
  }
  const mx = 0.7
  x0 = Math.min(x0 - mx, -1.3); x1 = Math.max(x1 + mx, 1.3)
  return { x0, y0: y0 - 0.9, x1, y1: y1 + 0.85 }
}

/** The control point of an arc between two points: out to the side, up the page when it can be, so a vertical or level pair still curves */
function bulge(x1: number, y1: number, x2: number, y2: number, k = 0.25): [number, number] {
  const dx = x2 - x1, dy = y2 - y1
  const dist = Math.hypot(dx, dy) || 1
  let nx = -dy / dist, ny = dx / dist
  if (ny > 1e-6 || (Math.abs(ny) <= 1e-6 && nx < 0)) { nx = -nx; ny = -ny }
  return [(x1 + x2) / 2 + nx * dist * k, (y1 + y2) / 2 + ny * dist * k]
}

const CSS = `
.of-a{transform-box:fill-box;transform-origin:50% 0}
.of-b{transform-box:fill-box;transform-origin:50% 100%}
@keyframes of-breathe{0%,100%{transform:translateY(0)}50%{transform:translateY(-0.025px)}}
@keyframes of-type-l{0%,100%{transform:rotate(-4deg)}50%{transform:rotate(9deg)}}
@keyframes of-type-r{0%,100%{transform:rotate(5deg)}50%{transform:rotate(-8deg)}}
@keyframes of-wave{0%,100%{transform:rotate(-158deg)}50%{transform:rotate(-122deg)}}
@keyframes of-zz{0%{transform:translate(0,0);opacity:0}25%{opacity:.9}100%{transform:translate(0.1px,-0.3px);opacity:0}}
@keyframes of-glow{0%,100%{opacity:.45}50%{opacity:1}}
@keyframes of-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-0.07px)}}
@keyframes of-pop{from{transform:scale(.5);opacity:0}to{transform:scale(1);opacity:1}}
.of-breathe{animation:of-breathe 3.2s ease-in-out infinite}
.of-type-l{animation:of-type-l .5s ease-in-out infinite}
.of-type-r{animation:of-type-r .43s ease-in-out infinite}
.of-wave{animation:of-wave .9s ease-in-out infinite}
.of-zz{animation:of-zz 2.8s ease-out infinite}
.of-glow{animation:of-glow 1.6s ease-in-out infinite}
.of-bob{animation:of-bob 1.1s ease-in-out infinite}
.of-pop{transform-box:fill-box;transform-origin:50% 100%;animation:of-pop .25s ease-out}
.of-btn{cursor:pointer;outline:none}
.of-btn:focus-visible .of-focus{stroke:#5eead4;stroke-width:0.07}
@media (prefers-reduced-motion:reduce){.of-anim *{animation:none!important}}
`

// ---------------------------------------------------------------- small hooks

function useElementSize(ref: React.RefObject<HTMLElement>): { w: number; h: number } {
  const [size, setSize] = useState({ w: 0, h: 0 })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const read = () => setSize({ w: el.clientWidth, h: el.clientHeight })
    read()
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return size
}

/** The camera: a view box that flies to its target (snaps the first time, and with reduced motion) */
function useAnimatedBox(target: Box, ready: boolean, instant: boolean): Box {
  const [box, setBox] = useState(target)
  const cur = useRef(target)
  const seeded = useRef(false)
  useEffect(() => {
    if (!ready) return
    if (!seeded.current || instant) {
      seeded.current = true
      cur.current = target
      setBox(target)
      return
    }
    const from = cur.current
    const t0 = performance.now()
    let raf = 0
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / 520)
      const b = mixBox(from, target, easeOut(t))
      cur.current = b
      setBox(b)
      if (t < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.x, target.y, target.w, target.h, ready, instant])
  return box
}

// ---------------------------------------------------------------- pieces

function Pill({ x, y, text, size, bg, fg = '#fff' }: { x: number; y: number; text: string; size: number; bg: string; fg?: string }) {
  const w = text.length * size * 0.56 + size * 0.9
  return (
    <g pointerEvents="none">
      <rect x={x - w / 2} y={y - size * 0.85} width={w} height={size * 1.5} rx={size * 0.75} fill={bg} />
      <text x={x} y={y + size * 0.1} fontSize={size} textAnchor="middle" fill={fg} fontFamily="system-ui, sans-serif" fontWeight={600}>{text}</text>
    </g>
  )
}

/** One person, feet at the origin, about a unit tall */
function Person({ id, pose, color, desk, dim, selected, phase, skin, hair }: {
  id: string
  pose: Pose
  color: string
  desk: boolean
  dim: boolean
  selected: boolean
  phase: number
  skin: string
  hair: string
}) {
  const typing = pose === 'typing'
  const waving = pose === 'waving' && !dim
  const resting = pose === 'resting'
  const shirt = dim ? '#374151' : color
  const delay = { animationDelay: `${-phase}s` }
  const lift = typing ? 0.1 : 0
  return (
    <g opacity={dim ? 0.5 : 1}>
      <ellipse cx={0} cy={0.02} rx={0.24} ry={0.07} fill="#000" opacity={0.35} />
      {selected && <ellipse cx={0} cy={0.02} rx={0.34} ry={0.11} fill="none" stroke="#5eead4" strokeWidth={0.05} />}
      <g transform={`translate(0 ${lift})`} className="of-anim">
        <g className={resting ? '' : 'of-breathe'} style={delay}>
          {!typing && (
            <>
              <rect x={-0.12} y={-0.32} width={0.09} height={0.32} rx={0.03} fill="#374151" />
              <rect x={0.03} y={-0.32} width={0.09} height={0.32} rx={0.03} fill="#374151" />
            </>
          )}
          <rect x={-0.17} y={-0.7} width={0.34} height={0.42} rx={0.13} fill={shirt} />
          {waving && <rect x={-0.17} y={-0.7} width={0.34} height={0.42} rx={0.13} fill={color} opacity={0.35} />}
          {/* arms hang from the shoulders; the right one waves, both type */}
          <g transform="translate(-0.2 -0.64)"><rect className={`of-a ${typing ? 'of-type-l' : ''}`} style={typing ? delay : undefined} x={-0.04} y={0} width={0.08} height={0.3} rx={0.04} fill={skin} /></g>
          <g transform="translate(0.2 -0.64)"><rect className={`of-a ${waving ? 'of-wave' : typing ? 'of-type-r' : ''}`} style={waving || typing ? delay : undefined} x={-0.04} y={0} width={0.08} height={0.3} rx={0.04} fill={skin} /></g>
          <g transform={`translate(0 ${resting ? 0.03 : 0})`}>
            <circle cx={0} cy={-0.83} r={0.155} fill={skin} />
            <path d="M-0.16 -0.84 A0.16 0.16 0 0 1 0.16 -0.84 Z" fill={hair} />
            {resting ? (
              <>
                <line x1={-0.08} y1={-0.8} x2={-0.03} y2={-0.8} stroke="#1f2937" strokeWidth={0.02} />
                <line x1={0.03} y1={-0.8} x2={0.08} y2={-0.8} stroke="#1f2937" strokeWidth={0.02} />
              </>
            ) : (
              <>
                <circle cx={-0.055} cy={-0.81} r={0.019} fill="#1f2937" />
                <circle cx={0.055} cy={-0.81} r={0.019} fill="#1f2937" />
              </>
            )}
          </g>
        </g>
      </g>
      {desk && (
        <g>
          <rect x={-0.36} y={-0.36} width={0.72} height={0.24} rx={0.03} fill="#6b7280" />
          <rect x={-0.36} y={-0.36} width={0.72} height={0.05} rx={0.02} fill="#9ca3af" />
          <rect x={-0.15} y={-0.58} width={0.3} height={0.2} rx={0.025} fill="#0f172a" stroke="#34d399" strokeWidth={0.02} className="of-glow of-anim" style={delay} />
        </g>
      )}
      {resting && (
        <text className="of-zz of-anim" x={0.12} y={-1.0} fontSize={0.2} fill="#9ca3af" fontWeight={700} fontFamily="system-ui, sans-serif">zz</text>
      )}
      {waving && <path className="of-bob of-anim" style={delay} d="M0 -1.1 L0.09 -1.0 L0 -0.9 L-0.09 -1.0 Z" fill="#f97316" />}
      {/* a screen reader gets the name from the button around it */}
      <title>{id}</title>
    </g>
  )
}

interface RoomProps {
  building: WorldBuilding
  half: number
  figures: WorldFigure[]
  selectedAgentId: string | null
  onSelectAgent?: (id: string) => void
  names?: Map<string, string>
  lens: WorldLens
  work?: Map<string, WorkSummary>
  tieList: AgentTie[]
}

/** Inside a building: its floor, back wall, and people */
function Room({ building, half, figures, selectedAgentId, onSelectAgent, names, lens, work, tieList }: RoomProps) {
  const { figures: staged, step } = useMemo(() => stageFigures(figures, half / 0.86), [figures, half])
  const s = spriteScale(step)
  const dimById = useMemo(() => new Set(figures.filter(f => f.dim).map(f => f.id)), [figures])
  const ordered = useMemo(() => [...staged].sort((a, b) => a.z - b.z), [staged])
  const at = useMemo(() => new Map(staged.map(f => [f.id, f])), [staged])
  return (
    <g>
      {/* the back wall rises above the floor, so the back row stands against it */}
      <rect x={-half - 0.1} y={-half - 1.0} width={half * 2 + 0.2} height={1.1} rx={0.2} fill="#134e4a" />
      <rect x={-half} y={-half} width={half * 2} height={half * 2} rx={0.15} fill="#0f2f2e" stroke="#134e4a" strokeWidth={0.1} />
      <text x={0} y={-half - 0.55} fontSize={0.34} textAnchor="middle" fill="#99f6e4" fontFamily="system-ui, sans-serif" fontWeight={600}>{building.label} · {building.counts.total}</text>
      <g>
        {ordered.map(f => {
          const look = lookOf(f.id)
          const dim = dimById.has(f.id)
          const label = names?.get(f.id) ?? f.id
          return (
            <g
              key={f.id}
              transform={`translate(${f.x} ${f.z}) scale(${s})`}
              className="of-btn"
              role="button"
              tabIndex={0}
              aria-label={label}
              onClick={e => { e.stopPropagation(); onSelectAgent?.(f.id) }}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectAgent?.(f.id) } }}
            >
              <rect className="of-focus" x={-0.4} y={-1.15} width={0.8} height={1.25} fill="transparent" stroke="transparent" rx={0.1} />
              <Person id={label} pose={f.pose} color={HEX[f.presence]} desk={f.desk} dim={dim} selected={f.id === selectedAgentId} phase={look.phase} skin={look.skin} hair={look.hair} />
            </g>
          )
        })}
      </g>
      {/* the top layer: ties, then bubbles and tags, drawn unscaled so they stay readable in a crowd */}
      {lens === 'relations' && tieList.map(t => {
        const p = at.get(t.a), q = at.get(t.b)
        if (!p || !q) return null
        const [cx, cy] = bulge(p.x, p.z - 0.5 * s, q.x, q.z - 0.5 * s, 0.3)
        return <path key={`${t.a}|${t.b}|${t.kind}`} d={`M${p.x} ${p.z - 0.5 * s} Q${cx} ${cy} ${q.x} ${q.z - 0.5 * s}`} fill="none" stroke={TIE_HEX[t.kind]} strokeWidth={0.04 + Math.min(t.weight, 40) * 0.004} opacity={0.85} pointerEvents="none" />
      })}
      {ordered.map(f => {
        if (dimById.has(f.id)) return null
        const w = work?.get(f.id)
        const say = w?.ask ? clip(w.ask.subject, 30) : f.presence === 'needs-you' ? 'needs you' : null
        const badge = lens === 'work' && w && w.open > 0 ? `${w.open}${w.overdue > 0 ? ` · ${w.overdue} late` : ''}` : null
        return (
          <g key={`t-${f.id}`}>
            {say && f.id !== selectedAgentId && (
              <g className="of-pop of-anim"><Pill x={f.x} y={f.z - 1.2 * s - 0.05} text={say} size={0.17} bg="rgba(194,65,12,0.95)" /></g>
            )}
            {badge && <Pill x={f.x + 0.38 * s} y={f.z - 0.3 * s} text={badge} size={0.13} bg={w && w.overdue > 0 ? 'rgba(153,27,27,0.95)' : 'rgba(30,64,175,0.95)'} />}
            {f.id === selectedAgentId && names?.get(f.id) && <Pill x={f.x} y={f.z - 1.25 * s} text={names.get(f.id)!} size={0.2} bg="rgba(3,7,18,0.85)" fg="#e5e7eb" />}
          </g>
        )
      })}
    </g>
  )
}

/** A dot per agent in the status colours, in a grid inside a rectangle */
function Dots({ b, w, d }: { b: WorldBuilding; w: number; d: number }) {
  const n = b.counts.total
  if (n === 0) return null
  const colour: string[] = [
    ...Array(b.counts.needsYou).fill(HEX['needs-you']),
    ...Array(b.counts.working).fill(HEX.working),
    ...Array(b.counts.ready).fill(HEX.ready),
    ...Array(b.counts.offline).fill(HEX.offline),
  ]
  const innerW = w - 0.3, innerH = d - 0.55
  const cols = Math.max(1, Math.min(n, Math.ceil(Math.sqrt((n * innerW) / Math.max(innerH, 0.3)))))
  const rows = Math.ceil(n / cols)
  const step = Math.min(innerW / cols, innerH / rows, 0.26)
  const r = step * 0.36
  const x0 = -((cols - 1) * step) / 2
  const y0 = -((rows - 1) * step) / 2 + 0.12
  return (
    <>
      {colour.slice(0, n).map((c, i) => <circle key={i} cx={x0 + (i % cols) * step} cy={y0 + Math.floor(i / cols) * step} r={r} fill={c} />)}
    </>
  )
}

function Arc({ x1, y1, x2, y2, color, weight, k }: { x1: number; y1: number; x2: number; y2: number; color: string; weight: number; k: number }) {
  const [cx, cy] = bulge(x1, y1, x2, y2)
  return <path d={`M${x1} ${y1} Q${cx} ${cy} ${x2} ${y2}`} fill="none" stroke={color} strokeWidth={(0.05 + Math.min(weight, 40) * 0.01) * k} opacity={0.85} pointerEvents="none" strokeLinecap="round" />
}

/** A gold orb sliding along an arc from one island to another (or hopping over one island) */
function Pulses({ pulses, centres }: { pulses: WorldPulse[]; centres: Map<string, [number, number]> }) {
  const [, setTick] = useState(0)
  useEffect(() => {
    if (pulses.length === 0) return
    let raf = 0
    const loop = () => { setTick(t => (t + 1) % 1e6); raf = requestAnimationFrame(loop) }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [pulses.length])
  const now = Date.now()
  return (
    <g pointerEvents="none">
      {pulses.map(p => {
        const a = centres.get(p.from), b = centres.get(p.to)
        if (!a || !b) return null
        const t = Math.min(1, Math.max(0, (now - p.t0) / PULSE_MS))
        if (t >= 1) return null
        const same = Math.hypot(b[0] - a[0], b[1] - a[1]) < 0.01
        // a quadratic along the same bulge as the arcs; a message within one floor hops straight up
        const [cx, cy] = same ? [a[0], a[1] - 2.4] : bulge(a[0], a[1], b[0], b[1])
        const u = 1 - t
        const x = u * u * a[0] + 2 * u * t * cx + t * t * b[0]
        const y = u * u * a[1] + 2 * u * t * cy + t * t * b[1]
        const r = 0.22 + Math.sin(Math.PI * t) * 0.14
        return (
          <g key={p.id}>
            <circle cx={x} cy={y} r={r * 2.2} fill="#fbbf24" opacity={0.2} />
            <circle cx={x} cy={y} r={r} fill="#fbbf24" />
          </g>
        )
      })}
    </g>
  )
}

// ---------------------------------------------------------------- the view

export interface OfficeViewProps {
  groups: WorldGroup[]
  selectedKey: string | null
  selectedBuildingKey?: string | null
  onSelect: (key: string) => void
  onSelectBuilding?: (key: string) => void
  figures: WorldFigure[]
  onBack?: () => void
  selectedAgentId?: string | null
  onSelectAgent?: (id: string) => void
  names?: Map<string, string>
  pulses?: WorldPulse[]
  dimmed?: Set<string>
  dimmedBuildings?: Set<string>
  lens?: WorldLens
  work?: Map<string, WorkSummary>
  ties?: WorldTies
}

export default function OfficeView({
  groups, selectedKey, selectedBuildingKey = null, onSelect, onSelectBuilding, figures, onBack,
  selectedAgentId = null, onSelectAgent, names, pulses = [], dimmed, dimmedBuildings, lens = 'status', work, ties,
}: OfficeViewProps) {
  const wrap = useRef<HTMLDivElement>(null)
  const size = useElementSize(wrap)
  const reduced = usePrefersReducedMotion()
  const { positions } = useMemo(() => layoutIslands(groups), [groups])
  const aspect = size.w > 0 && size.h > 0 ? size.w / size.h : 1.6
  const selectedIndex = groups.findIndex(g => g.key === selectedKey)
  const selected = selectedIndex >= 0 ? groups[selectedIndex] : null

  const target = useMemo<Box>(() => {
    const MARGIN = 1.0
    if (!selected) {
      // Every floor, with its name above it
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
      groups.forEach((g, i) => {
        const f = floorOf(g, false)
        x0 = Math.min(x0, positions[i][0] + f.x0); x1 = Math.max(x1, positions[i][0] + f.x1)
        y0 = Math.min(y0, positions[i][1] + f.y0 - 0.9); y1 = Math.max(y1, positions[i][1] + f.y1)
      })
      if (!Number.isFinite(x0)) return fitBox(0, 0, 6, 4, aspect)
      return fitBox((x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / 2 + MARGIN, (y1 - y0) / 2 + MARGIN, aspect)
    }
    const [px, pz] = positions[selectedIndex]
    const r = islandRadius(selected.counts.total)
    const b = selectedBuildingKey ? selected.buildings.find(x => x.key === selectedBuildingKey) : null
    if (b) {
      const half = roomHalf(b.agents.length, r)
      // The room plus the back wall that rises above it
      return fitBox(px, pz - 0.45, half * 1.1, half * 1.1 + 0.5, aspect)
    }
    const f = floorOf(selected, false)
    return fitBox(px + (f.x0 + f.x1) / 2, pz + (f.y0 + f.y1) / 2 - 0.2, (f.x1 - f.x0) / 2 + MARGIN, (f.y1 - f.y0) / 2 + MARGIN, aspect)
  }, [groups, selected, selectedIndex, selectedBuildingKey, positions, aspect])
  const box = useAnimatedBox(target, size.w > 0, reduced)

  // Where arcs and pulses land: the middle of each island's floor
  const centres = useMemo(() => new Map(groups.map((g, i) => {
    const f = floorOf(g, false)
    return [g.key, [positions[i][0] + (f.x0 + f.x1) / 2, positions[i][1] + (f.y0 + f.y1) / 2] as [number, number]] as [string, [number, number]]
  })), [groups, positions])
  const inside = selected && selectedBuildingKey ? selected.buildings.find(b => b.key === selectedBuildingKey) ?? null : null

  // The island you are on: where its rooms stand (the 3D skyline, seen from above)
  const skylineOf = (g: WorldGroup) => layoutSkyline(g.buildings.map(b => b.agents.length), islandRadius(g.counts.total))

  return (
    <div ref={wrap} className="of-anim relative h-full w-full select-none" style={{ background: '#030712' }} data-renderer="2d">
      <style>{CSS}</style>
      <svg viewBox={boxToViewBox(box)} className="block h-full w-full" role="group" aria-label="The fleet as a floor plan: one floor per organization, one room per machine">
        {groups.map((g, i) => {
          const [px, pz] = positions[i]
          const r = islandRadius(g.counts.total)
          const isSel = g.key === selectedKey
          const dim = dimmed?.has(g.key) ?? false
          const showRooms = !(isSel && inside)
          const boxes = showRooms ? skylineOf(g) : []
          const floor = floorOf(g, isSel && !!inside)
          const fw = floor.x1 - floor.x0
          const fs = Math.min(0.75, Math.max(0.5, fw * 0.1))
          return (
            <g key={g.key} transform={`translate(${px} ${pz})`} opacity={dim ? 0.32 : 1}>
              <g
                className="of-btn"
                role="button"
                tabIndex={0}
                aria-label={`${g.label}, ${g.counts.total} agents${g.counts.needsYou ? `, ${g.counts.needsYou} need you` : ''}`}
                onClick={e => { e.stopPropagation(); if (!isSel) onSelect(g.key) }}
                onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && !isSel) { e.preventDefault(); onSelect(g.key) } }}
              >
                <rect className="of-focus" x={floor.x0} y={floor.y0} width={fw} height={floor.y1 - floor.y0} rx={Math.min(0.9, fw * 0.12)} fill={g.offline ? '#1f2937' : isSel ? '#115e59' : '#134e4a'} stroke={isSel ? '#2dd4bf' : '#0d9488'} strokeWidth={isSel ? 0.09 : 0.05} />
                {!inside || !isSel ? (
                  <text x={(floor.x0 + floor.x1) / 2} y={floor.y0 + 0.66} fontSize={isSel ? Math.min(fs, 0.55) : fs} textAnchor="middle" fill="#e5e7eb" fontFamily="system-ui, sans-serif" fontWeight={700}>{clip(g.label, 26)}</text>
                ) : null}
                {!isSel && g.counts.needsYou > 0 && <path d={`M${floor.x1 - 0.5} ${floor.y0 + 0.15} l0.28 0.3 l-0.28 0.3 l-0.28 -0.3 Z`} fill="#f97316" />}
              </g>
              {boxes.map(box2 => {
                const b = g.buildings[box2.index]
                const dimB = (dim || (isSel && (dimmedBuildings?.has(b.key) ?? false)))
                const asks = work ? b.agents.reduce((n, a) => n + (work.get(a.id)?.waitingOnYou ? 1 : 0), 0) : 0
                const open = lens === 'work' && work ? b.agents.reduce((n, a) => n + (work.get(a.id)?.open ?? 0), 0) : null
                const { w, d } = roomSize(b)
                const labelSize = Math.min(0.3, w * 0.12)
                return (
                  <g
                    key={b.key}
                    transform={`translate(${box2.x} ${box2.z})`}
                    opacity={dimB ? 0.35 : 1}
                    className="of-btn"
                    role="button"
                    tabIndex={0}
                    aria-label={`${b.label}, ${b.counts.total} agents`}
                    onClick={e => { e.stopPropagation(); if (isSel) onSelectBuilding?.(b.key); else onSelect(g.key) }}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (isSel) onSelectBuilding?.(b.key); else onSelect(g.key) } }}
                  >
                    <rect className="of-focus" x={-w / 2} y={-d / 2} width={w} height={d} rx={0.12} fill={b.offline ? '#1f2937' : '#0f2f2e'} stroke={b.offline ? '#374151' : '#2dd4bf'} strokeWidth={0.05} />
                    <rect x={-w / 2} y={-d / 2} width={w} height={0.34} rx={0.12} fill={b.offline ? '#374151' : '#0f766e'} />
                    <text x={0} y={-d / 2 + 0.24} fontSize={labelSize} textAnchor="middle" fill="#e2e8f0" fontFamily="system-ui, sans-serif" fontWeight={600}>{clip(b.label, 16)}</text>
                    {!b.offline && <Dots b={b} w={w} d={d} />}
                    {b.counts.needsYou > 0 && !dimB && <path d={`M${w / 2 - 0.1} ${-d / 2 - 0.05} l0.2 0.22 l-0.2 0.22 l-0.2 -0.22 Z`} fill="#f97316" />}
                    {asks > 0 && !dimB && <rect x={w / 2 - 0.62} y={-d / 2 - 0.13} width={0.22} height={0.22} rx={0.04} fill="#38bdf8" transform={`rotate(45 ${w / 2 - 0.51} ${-d / 2 - 0.02})`} />}
                    {isSel && (
                      <text x={0} y={d / 2 + 0.24} fontSize={0.24} textAnchor="middle" fill="#94a3b8" fontFamily="system-ui, sans-serif">
                        {b.counts.total}{open !== null ? ` · ${open} open` : ''}{asks > 0 ? ` · ${asks} for you` : ''}
                      </text>
                    )}
                  </g>
                )
              })}
              {isSel && inside && (
                <Room
                  building={inside}
                  half={roomHalf(inside.agents.length, r)}
                  figures={figures}
                  selectedAgentId={selectedAgentId}
                  onSelectAgent={onSelectAgent}
                  names={names}
                  lens={lens}
                  work={work}
                  tieList={ties?.agentTies ?? []}
                />
              )}
              {isSel && !inside && lens === 'relations' && ties && ties.buildingArcs.map(a => {
                const sky = skylineOf(g)
                const p = sky.find(s => g.buildings[s.index].key === a.from)
                const q = sky.find(s => g.buildings[s.index].key === a.to)
                if (!p || !q) return null
                return <Arc key={`${a.from}|${a.to}`} x1={p.x} y1={p.z} x2={q.x} y2={q.z} color={tieColor(a.kinds)} weight={a.weight} k={0.7} />
              })}
            </g>
          )
        })}
        {!selected && lens === 'relations' && ties?.islandArcs.map((a: GroupArc) => {
          const p = centres.get(a.from), q = centres.get(a.to)
          if (!p || !q) return null
          return <Arc key={`${a.from}|${a.to}`} x1={p[0]} y1={p[1]} x2={q[0]} y2={q[1]} color={tieColor(a.kinds)} weight={a.weight} k={1} />
        })}
        <Pulses pulses={pulses} centres={centres} />
      </svg>
      {selected && onBack && (
        <button
          onClick={onBack}
          className="absolute left-3 top-3 rounded-lg bg-gray-900/90 px-3 py-1.5 text-xs text-gray-200 shadow hover:bg-gray-800"
        >
          ← {selectedBuildingKey ? 'back to the floor' : 'all floors'}
        </button>
      )}
    </div>
  )
}
