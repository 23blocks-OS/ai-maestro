'use client'

/**
 * The world, in three levels. The overview is the archipelago: one island per group, each with its
 * skyline of buildings (an org island has a building per host its agents run on). Select an island and
 * you see just its buildings, close up. Select a building and you are inside it: a room with its agents
 * at desks, standing, waving, or away.
 *
 * LOD rule: figures are drawn only inside the selected building, so the overview never draws 160+
 * people at once.
 */

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { XR, createXRStore } from '@react-three/xr'
import { QuadraticBezierCurve3, TubeGeometry, Vector3, type Group } from 'three'
import { OrbitControls as OrbitControlsImpl } from 'three/examples/jsm/controls/OrbitControls.js'
import type { WorldBuilding, WorldGroup } from '@/lib/world/grouping'
import { buildingSize, islandRadius, layoutIslands, layoutSkyline } from '@/lib/world/layout'
import { stageFigures } from '@/lib/world/stage'
import type { AgentTie, GroupArc, TieKind, WorkSummary } from '@/lib/world/relations'
import { PULSE_MS, type WorldPulse } from '@/lib/world/pulse'
import Character from '@/components/world/Character'
import Label from '@/components/world/Label'
import type { AgentPresence } from '@/lib/agent-presence'
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion'

/**
 * Orbit controls from three's own examples (no extra dep): orbit/pan/zoom, no roll.
 * The canvas renders on demand, so the controls ask for a frame only when they move
 * and an idle map costs no GPU. `extent` is the layout's half-width: the camera is
 * placed to see all of it whenever the set of islands changes.
 */
/** Where the camera goes: a point on the map, how wide a view to give it, and how tall the thing there is */
interface Focus { x: number; z: number; radius: number; height: number }

function Controls({ extent, focus, enabled }: { extent: number; focus: Focus | null; enabled: boolean }) {
  const camera = useThree(s => s.camera)
  const gl = useThree(s => s.gl)
  const get = useThree(s => s.get)
  const invalidate = useThree(s => s.invalidate)
  const controls = useMemo(() => {
    const c = new OrbitControlsImpl(camera, gl.domElement)
    c.maxPolarAngle = Math.PI / 2.2
    c.minDistance = 3
    return c
  }, [camera, gl])

  // Where the camera should be: a view of the whole map, or close over the selected island
  const overview = useMemo(() => {
    const reach = Math.max(extent, 8)
    return { reach, y: reach * 0.9 + 4, z: reach * 1.1 + 6 }
  }, [extent])
  const flight = useRef<{ target: [number, number, number]; cam: [number, number, number] } | null>(null)
  const aspect = () => { const { width, height } = get().size; return width / Math.max(height, 1) }

  useEffect(() => {
    const onChange = () => invalidate()
    // The person grabbing the camera ends any flight in progress
    const onStart = () => { flight.current = null }
    controls.addEventListener('change', onChange)
    controls.addEventListener('start', onStart)
    return () => {
      controls.removeEventListener('change', onChange)
      controls.removeEventListener('start', onStart)
      controls.dispose()
    }
  }, [controls, invalidate])

  // A narrow canvas (a phone) sees less sideways, so back the camera off to keep everything in view
  useEffect(() => {
    controls.maxDistance = Math.max(45, overview.reach * 4)
    const k = Math.max(1, 1.7 / aspect())
    camera.position.set(0, overview.y * k, overview.z * k)
    controls.target.set(0, 0, 0)
    controls.update()
    invalidate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controls, camera, overview, invalidate])

  // Fly to the selected island (close enough to see its people), or back out to the whole map.
  const fx = focus?.x, fz = focus?.z, fr = focus?.radius, fh = focus?.height
  useEffect(() => {
    const k = Math.max(1, 1.7 / aspect())
    if (fx === undefined || fz === undefined || fr === undefined || fh === undefined) {
      flight.current = { target: [0, 0, 0], cam: [0, overview.y * k, overview.z * k] }
    } else {
      const kk = Math.max(1, 1.2 / aspect())
      // Look at the middle of what is there (a tall skyline is looked at, not from above) and stand back far enough to see it all
      flight.current = { target: [fx, fh * 0.4, fz], cam: [fx, (fr * 0.8 + 2 + fh * 0.5) * kk, fz + (fr * 1.2 + 3.5 + fh * 0.5) * kk] }
    }
    invalidate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fx, fz, fr, fh, overview, invalidate])

  // In a headset the headset is the camera: the orbit controls step aside
  useEffect(() => { controls.enabled = enabled; if (!enabled) flight.current = null }, [controls, enabled])

  useFrame(() => {
    const f = flight.current
    if (!f || !enabled) return
    const k = 0.12
    let moving = false
    const t = controls.target
    const c = camera.position
    for (const [cur, goal, axis] of [[t, f.target, 'x'], [t, f.target, 'y'], [t, f.target, 'z'], [c, f.cam, 'x'], [c, f.cam, 'y'], [c, f.cam, 'z']] as const) {
      const i = axis === 'x' ? 0 : axis === 'y' ? 1 : 2
      const d = goal[i] - cur[axis]
      if (Math.abs(d) > 0.01) { cur[axis] += d * k; moving = true }
    }
    controls.update()
    if (moving) invalidate()
    else flight.current = null
  })
  return null
}

// Mirrors PRESENCE_STYLE (lib/agent-presence.ts) as hex for the canvas
const PRESENCE_HEX: Record<AgentPresence, string> = {
  working: '#10b981',
  'needs-you': '#f97316',
  ready: '#facc15',
  offline: '#6b7280',
}

export interface WorldFigure {
  id: string
  presence: AgentPresence
  /** Out of the spotlight: greyed, no bubble */
  dim?: boolean
}

/** What the world is showing: the status of everyone, what is on their plate, or who works with whom */
export type WorldLens = 'status' | 'work' | 'relations'

/** The ties to draw in the relations lens, at the level you are looking at */
export interface WorldTies {
  /** Between islands (the overview) */
  islandArcs: GroupArc[]
  /** Between the buildings of the selected island, keyed by building */
  buildingArcs: GroupArc[]
  /** Between the people in the building you are inside */
  agentTies: AgentTie[]
}

interface WorldSceneProps {
  groups: WorldGroup[]
  /** The island you are at, and the building you are inside (both null in the overview) */
  selectedKey: string | null
  selectedBuildingKey?: string | null
  onSelect: (key: string) => void
  onSelectBuilding?: (key: string) => void
  /** Agents of the selected building, drawn as people inside it */
  figures: WorldFigure[]
  /** Leave the selected island (the in-headset "all islands" button) */
  onBack?: () => void
  /** The agent whose card is open (ringed and named), and how to open one */
  selectedAgentId?: string | null
  onSelectAgent?: (id: string) => void
  /** Names to show over the selected agent */
  names?: Map<string, string>
  /** Messages in flight: a gold orb arcs from the sender's island to the recipient's */
  pulses?: WorldPulse[]
  /** Islands drawn dim: every island but the selected one, or those with no agent matching the search or filter */
  dimmed?: Set<string>
  /** Buildings of the selected island drawn dim (no agent in the spotlight) */
  dimmedBuildings?: Set<string>
  lens?: WorldLens
  /** What each agent has on its plate; an agent with a card waiting on you gets a speech bubble in every lens */
  work?: Map<string, WorkSummary>
  ties?: WorldTies
}

/** Half the width of the room inside a building: big enough for its agents, small enough to sit well inside the island */
export function roomHalf(agentCount: number, islandR: number): number {
  return Math.min(islandRadius(agentCount) * 0.9, islandR * 0.68)
}

/** The status mix of a building as stacked bands on its front, so its state reads from across the island */
function StatusBands({ b, w, h, d }: { b: WorldBuilding; w: number; h: number; d: number }) {
  const total = Math.max(1, b.counts.total)
  const bands: Array<[number, string]> = [
    [b.counts.needsYou, PRESENCE_HEX['needs-you']],
    [b.counts.working, PRESENCE_HEX.working],
    [b.counts.ready, PRESENCE_HEX.ready],
    [b.counts.offline, PRESENCE_HEX.offline],
  ]
  const usable = h * 0.8
  let y = h * 0.1
  return (
    <>
      {bands.map(([n, color], i) => {
        if (n === 0) return null
        const bh = (n / total) * usable
        const el = (
          <mesh key={i} position={[0, y + bh / 2, d / 2 + 0.02]}>
            <boxGeometry args={[w * 0.7, bh, 0.04]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.35} />
          </mesh>
        )
        y += bh
        return el
      })}
    </>
  )
}

const asksIn = (b: WorldBuilding, work?: Map<string, WorkSummary>) => (work ? b.agents.reduce((n, a) => n + (work.get(a.id)?.waitingOnYou ? 1 : 0), 0) : 0)
const openIn = (b: WorldBuilding, work?: Map<string, WorkSummary>) => (work ? b.agents.reduce((n, a) => n + (work.get(a.id)?.open ?? 0), 0) : 0)

function Building({ b, box, dim, islandSelected, onClick, asks, open }: {
  b: WorldBuilding
  box: { x: number; z: number; w: number; d: number; h: number }
  dim: boolean
  islandSelected: boolean
  onClick: () => void
  /** Cards waiting on you in this building, and (work lens) all its open cards */
  asks: number
  open: number | null
}) {
  const off = b.offline || dim
  return (
    <group
      position={[box.x, 0, box.z]}
      onClick={e => {
        e.stopPropagation()
        // A drag that ends over a building is an orbit, not a selection
        if (e.delta > 4) return
        onClick()
      }}
      onPointerOver={e => { if (islandSelected) { e.stopPropagation(); document.body.style.cursor = 'pointer' } }}
      onPointerOut={() => { document.body.style.cursor = '' }}
    >
      <mesh position={[0, box.h / 2, 0]}>
        <boxGeometry args={[box.w, box.h, box.d]} />
        <meshStandardMaterial color={off ? '#374151' : '#99f6e4'} emissive={off ? '#000000' : '#115e59'} emissiveIntensity={0.4} />
      </mesh>
      {!off && <StatusBands b={b} w={box.w} h={box.h} d={box.d} />}
      {/* A flat roof slab so the skyline reads as buildings, not boxes */}
      <mesh position={[0, box.h + 0.04, 0]}>
        <boxGeometry args={[box.w + 0.12, 0.08, box.d + 0.12]} />
        <meshStandardMaterial color={off ? '#1f2937' : '#0f766e'} />
      </mesh>
      {b.counts.needsYou > 0 && !dim && (
        <mesh position={[0, box.h + 0.7, 0]}>
          <octahedronGeometry args={[0.24]} />
          <meshStandardMaterial color={PRESENCE_HEX['needs-you']} emissive={PRESENCE_HEX['needs-you']} emissiveIntensity={1} />
        </mesh>
      )}
      {asks > 0 && !dim && (
        <mesh position={[b.counts.needsYou > 0 ? 0.45 : 0, box.h + 0.7, 0]} rotation={[0.6, 0.6, 0]}>
          <boxGeometry args={[0.28, 0.28, 0.28]} />
          <meshStandardMaterial color="#38bdf8" emissive="#0ea5e9" emissiveIntensity={1} />
        </mesh>
      )}
      {islandSelected && (
        <Label
          text={`${b.label} · ${b.counts.total}${open !== null ? ` · ${open} open` : ''}${asks > 0 ? ` · ${asks} for you` : ''}`}
          y={box.h + (b.counts.needsYou > 0 || asks > 0 ? 1.45 : 0.9)} scale={0.5} dim={dim}
        />
      )}
    </group>
  )
}

/** Inside a building: a room open to the front, its agents at desks, standing, waving or away */
const clip = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1)}…` : t)

function Room({ building, half, figures, animate, selectedAgentId, onSelectAgent, names, lens, work }: {
  building: WorldBuilding
  half: number
  figures: WorldFigure[]
  animate: boolean
  selectedAgentId: string | null
  onSelectAgent?: (id: string) => void
  names?: Map<string, string>
  lens: WorldLens
  work?: Map<string, WorkSummary>
}) {
  const staged = useMemo(() => stageFigures(figures, half / 0.86).figures, [figures, half])
  const dimById = useMemo(() => new Set(figures.filter(f => f.dim).map(f => f.id)), [figures])
  const wall = '#134e4a'
  return (
    <group>
      <mesh position={[0, 0.03, 0]}>
        <boxGeometry args={[half * 2, 0.06, half * 2]} />
        <meshStandardMaterial color="#1e3a3a" />
      </mesh>
      <mesh position={[0, 0.8, -half]}>
        <boxGeometry args={[half * 2, 1.6, 0.14]} />
        <meshStandardMaterial color={wall} />
      </mesh>
      <mesh position={[-half, 0.8, 0]}>
        <boxGeometry args={[0.14, 1.6, half * 2]} />
        <meshStandardMaterial color={wall} />
      </mesh>
      <mesh position={[half, 0.8, 0]}>
        <boxGeometry args={[0.14, 1.6, half * 2]} />
        <meshStandardMaterial color={wall} />
      </mesh>
      <Label text={`${building.label} · ${building.counts.total}`} y={2.3} scale={0.55} position={[0, 0, -half + 0.2]} />
      {staged.map(f => {
        const w = work?.get(f.id)
        const say = w?.ask ? clip(w.ask.subject, 34) : f.presence === 'needs-you' ? 'needs you' : undefined
        const badge = lens === 'work' && w && w.open > 0 ? { text: `${w.open}${w.overdue > 0 ? ` · ${w.overdue} late` : ''}`, late: w.overdue > 0 } : undefined
        return (
        <Character
          key={f.id}
          id={f.id}
          pose={f.pose}
          color={PRESENCE_HEX[f.presence]}
          position={[f.x, f.z]}
          desk={f.desk}
          animate={animate}
          selected={f.id === selectedAgentId}
          name={names?.get(f.id)}
          onSelect={() => onSelectAgent?.(f.id)}
          dim={dimById.has(f.id)}
          say={say}
          badge={badge}
        />
        )
      })}
    </group>
  )
}

function Island({ group, position, selected, buildingKey, dim, dimmedBuildings, figures, animate, onSelect, onSelectBuilding, selectedAgentId, onSelectAgent, names, lens, work }: {
  group: WorldGroup
  position: [number, number]
  selected: boolean
  buildingKey: string | null
  dim: boolean
  dimmedBuildings?: Set<string>
  lens: WorldLens
  work?: Map<string, WorkSummary>
  figures: WorldFigure[]
  animate: boolean
  onSelect: () => void
  onSelectBuilding?: (key: string) => void
  selectedAgentId: string | null
  onSelectAgent?: (id: string) => void
  names?: Map<string, string>
}) {
  const [x, z] = position
  const radius = islandRadius(group.counts.total)
  const skyline = useMemo(() => layoutSkyline(group.buildings.map(b => b.agents.length), radius), [group.buildings, radius])
  const tallest = skyline.reduce((m, b) => Math.max(m, b.h), 0)
  const inside = selected && buildingKey !== null ? group.buildings.find(b => b.key === buildingKey) ?? null : null
  const base = group.offline || dim ? '#1f2937' : selected ? '#0f766e' : '#134e4a'

  return (
    <group position={[x, 0, z]} onClick={e => {
      e.stopPropagation()
      // A drag that ends over an island is an orbit, not a selection
      if (e.delta > 4) return
      onSelect()
    }}>
      {/* Island */}
      <mesh position={[0, -0.3, 0]}>
        <cylinderGeometry args={[radius, radius * 0.8, 0.6, 24]} />
        <meshStandardMaterial color={base} emissive={selected ? '#0d9488' : '#000000'} emissiveIntensity={selected ? 0.35 : 0} />
      </mesh>
      {/* The island's name: big for the overview, small and above the skyline once you are on it */}
      {!inside && <Label text={clip(group.label, 24)} y={selected ? tallest + 2.4 : Math.max(3.9, radius * 0.5 + 3)} scale={selected ? 0.6 : 1.1} dim={dim} />}
      {/* The skyline: the island's buildings, in a row across the back (hidden while you are inside one) */}
      {!inside && skyline.map(box => (
        <Building
          key={group.buildings[box.index].key}
          b={group.buildings[box.index]}
          box={box}
          dim={dim || (dimmedBuildings?.has(group.buildings[box.index].key) ?? false)}
          islandSelected={selected}
          onClick={() => (selected ? onSelectBuilding?.(group.buildings[box.index].key) : onSelect())}
          asks={asksIn(group.buildings[box.index], work)}
          open={lens === 'work' ? openIn(group.buildings[box.index], work) : null}
        />
      ))}
      {/* Inside the selected building: its room and its people (the only place people are drawn) */}
      {inside && (
        <Room
          building={inside}
          half={roomHalf(inside.agents.length, radius)}
          figures={figures}
          animate={animate}
          selectedAgentId={selectedAgentId}
          onSelectAgent={onSelectAgent}
          names={names}
          lens={lens}
          work={work}
        />
      )}
    </group>
  )
}

const XR_EMULATE = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('emulate-vr')

/** Whether this browser can start an immersive VR session (a Quest browser, a PC with a headset) */
function useVRSupported(emulated: boolean): boolean {
  const [supported, setSupported] = useState(false)
  useEffect(() => {
    let live = true
    if (emulated) {
      // `?emulate-vr`: a Quest 3 in software (Meta's IWER), for trying the VR view without a headset.
      // It replaces the browser's own WebXR, so it is loaded only on request.
      import('iwer')
        .then(({ XRDevice, metaQuest3 }) => {
          new XRDevice(metaQuest3).installRuntime({ forceInstall: true })
          if (live) setSupported(true)
        })
        .catch(() => {})
      return () => { live = false }
    }
    navigator.xr?.isSessionSupported('immersive-vr').then(ok => { if (live) setSupported(ok) }).catch(() => {})
    return () => { live = false }
  }, [emulated])
  return supported
}

/**
 * In a headset the map becomes a place. Overview: the archipelago as a table-top model in front of you
 * (about a metre and a half across, at table height). Island selected: life-size, with you standing at
 * its doorstep facing in, so the people stand at human scale and the ones who need you wave at you.
 */
function VRRig({ presenting, extent, focus, children }: {
  presenting: boolean
  extent: number
  focus: Focus | null
  children: React.ReactNode
}) {
  if (!presenting) return <>{children}</>
  if (!focus) {
    const scale = 1.5 / (2 * Math.max(extent, 6))
    return <group position={[0, 0.9, -1.4]} scale={scale}>{children}</group>
  }
  return <group position={[-focus.x, 0, 2.4 - focus.z - focus.radius]}>{children}</group>
}

/** One gold orb arcing from island to island (or rising over one island for a message within it) */
function Pulse({ pulse, from, to }: { pulse: WorldPulse; from: [number, number]; to: [number, number] }) {
  const orb = useRef<Group>(null)
  useFrame(() => {
    const g = orb.current
    if (!g) return
    const p = Math.min(1, Math.max(0, (Date.now() - pulse.t0) / PULSE_MS))
    const same = from[0] === to[0] && from[1] === to[1]
    const dist = Math.hypot(to[0] - from[0], to[1] - from[1])
    g.position.set(
      from[0] + (to[0] - from[0]) * p,
      same ? 0.5 + Math.sin(Math.PI * p) * 3.2 : 0.8 + Math.sin(Math.PI * p) * (1.5 + dist * 0.25),
      from[1] + (to[1] - from[1]) * p,
    )
    g.scale.setScalar(0.7 + Math.sin(Math.PI * p) * 0.5)
    g.visible = p < 1
  })
  return (
    <group ref={orb}>
      <mesh>
        <sphereGeometry args={[0.28, 12, 10]} />
        <meshStandardMaterial color="#fbbf24" emissive="#f59e0b" emissiveIntensity={1.6} />
      </mesh>
      <pointLight color="#fbbf24" intensity={6} distance={6} />
    </group>
  )
}

const TIE_HEX = { talk: '#fbbf24', task: '#38bdf8', both: '#c084fc' }
const tieColor = (kinds: TieKind[]) => (kinds.length > 1 ? TIE_HEX.both : TIE_HEX[kinds[0]])

interface ArcItem { key: string; from: [number, number, number]; to: [number, number, number]; color: string; weight: number; scale: number }

/** One tie as a glowing arc between two points: thicker for more messages or cards behind it */
function Arc({ item }: { item: ArcItem }) {
  const geometry = useMemo(() => {
    const a = new Vector3(...item.from)
    const b = new Vector3(...item.to)
    const mid = a.clone().add(b).multiplyScalar(0.5)
    mid.y += Math.max(0.5, a.distanceTo(b) * 0.3)
    const radius = (0.03 + Math.min(item.weight, 40) * 0.005) * item.scale
    return new TubeGeometry(new QuadraticBezierCurve3(a, mid, b), 24, radius, 6, false)
  }, [item])
  useEffect(() => () => geometry.dispose(), [geometry])
  return (
    <mesh geometry={geometry} raycast={() => null}>
      <meshBasicMaterial color={item.color} transparent opacity={0.8} />
    </mesh>
  )
}

/**
 * The relations lens: who works with whom, at the level you are on. The overview joins islands, an
 * island joins its buildings, and inside a building the people who message each other or share cards
 * are joined. Amber = messages, blue = cards, violet = both.
 */
function Ties({ ties, groups, positions, selectedIndex, selectedBuildingKey, figures }: {
  ties: WorldTies
  groups: WorldGroup[]
  positions: Array<[number, number]>
  selectedIndex: number
  selectedBuildingKey: string | null
  figures: WorldFigure[]
}) {
  const items = useMemo(() => {
    const out: ArcItem[] = []
    if (selectedIndex < 0) {
      const at = new Map(groups.map((g, i) => [g.key, positions[i]]))
      for (const a of ties.islandArcs) {
        const p = at.get(a.from), q = at.get(a.to)
        if (p && q) out.push({ key: `${a.from}|${a.to}`, from: [p[0], 1, p[1]], to: [q[0], 1, q[1]], color: tieColor(a.kinds), weight: a.weight, scale: 1 })
      }
      return out
    }
    const g = groups[selectedIndex]
    const [px, pz] = positions[selectedIndex]
    const radius = islandRadius(g.counts.total)
    if (!selectedBuildingKey) {
      const skyline = layoutSkyline(g.buildings.map(b => b.agents.length), radius)
      const box = new Map(skyline.map(b => [g.buildings[b.index].key, b]))
      for (const a of ties.buildingArcs) {
        const p = box.get(a.from), q = box.get(a.to)
        if (p && q) out.push({ key: `${a.from}|${a.to}`, from: [px + p.x, p.h + 0.3, pz + p.z], to: [px + q.x, q.h + 0.3, pz + q.z], color: tieColor(a.kinds), weight: a.weight, scale: 0.6 })
      }
      return out
    }
    const b = g.buildings.find(x => x.key === selectedBuildingKey)
    if (!b) return out
    const spot = new Map(stageFigures(figures, roomHalf(b.agents.length, radius) / 0.86).figures.map(f => [f.id, f]))
    for (const t of ties.agentTies) {
      const p = spot.get(t.a), q = spot.get(t.b)
      if (p && q) out.push({ key: `${t.a}|${t.b}|${t.kind}`, from: [px + p.x, 1, pz + p.z], to: [px + q.x, 1, pz + q.z], color: TIE_HEX[t.kind], weight: t.weight, scale: 0.3 })
    }
    return out
  }, [ties, groups, positions, selectedIndex, selectedBuildingKey, figures])
  return <>{items.map(item => <Arc key={item.key} item={item} />)}</>
}

export default function WorldScene({ groups, selectedKey, selectedBuildingKey = null, onSelect, onSelectBuilding, figures, dimmed, dimmedBuildings, lens = 'status', work, ties, pulses = [], selectedAgentId = null, onSelectAgent, names, onBack }: WorldSceneProps) {
  const { positions, extent } = useMemo(() => layoutIslands(groups), [groups])
  const selectedIndex = groups.findIndex(g => g.key === selectedKey)
  // Where the camera goes: the whole island, or (inside a building) its room
  const focus = useMemo(() => {
    if (selectedIndex < 0) return null
    const g = groups[selectedIndex]
    const r = islandRadius(g.counts.total)
    const b = selectedBuildingKey ? g.buildings.find(x => x.key === selectedBuildingKey) : null
    const tallest = Math.max(...g.buildings.map(x => buildingSize(x.agents.length).h))
    return { x: positions[selectedIndex][0], z: positions[selectedIndex][1], radius: b ? roomHalf(b.agents.length, r) * 1.25 : r, height: b ? 2 : tallest + 1.5 }
  }, [selectedIndex, selectedBuildingKey, positions, groups])
  const reduced = usePrefersReducedMotion()
  // Characters move, so the canvas draws continuously while a populated island is selected;
  // otherwise (the overview, or reduced motion) it draws on demand and an idle map costs no GPU.
  const animate = !reduced && selectedIndex >= 0 && selectedBuildingKey !== null && figures.length > 0
  // Pulses are motion too, so they ask for continuous frames while any is in flight
  const store = useMemo(() => createXRStore({ emulate: false }), [])
  const presenting = useSyncExternalStore(store.subscribe, () => store.getState().session != null, () => false)
  const vrSupported = useVRSupported(XR_EMULATE)
  // A headset draws every frame itself; pulses and characters are motion too
  const drawing = animate || pulses.length > 0 || presenting
  const indexByKey = useMemo(() => new Map(groups.map((g, i) => [g.key, i])), [groups])
  return (
    <>
    <Canvas frameloop={drawing ? 'always' : 'demand'} camera={{ position: [0, 15, 17], fov: 45 }} style={{ background: '#030712' }}>
      <XR store={store}>
      <ambientLight intensity={0.7} />
      <directionalLight position={[8, 14, 6]} intensity={1.4} />
      <VRRig presenting={presenting} extent={extent} focus={focus}>
      {groups.map((g, i) => (
        <Island
          key={g.key}
          group={g}
          position={positions[i]}
          selected={g.key === selectedKey}
          buildingKey={g.key === selectedKey ? selectedBuildingKey : null}
          dim={dimmed?.has(g.key) ?? false}
          dimmedBuildings={g.key === selectedKey ? dimmedBuildings : undefined}
          lens={lens}
          work={work}
          figures={g.key === selectedKey ? figures : []}
          animate={animate}
          onSelect={() => onSelect(g.key)}
          onSelectBuilding={onSelectBuilding}
          selectedAgentId={selectedAgentId}
          onSelectAgent={onSelectAgent}
          names={names}
        />
      ))}
      {lens === 'relations' && ties && (
        <Ties ties={ties} groups={groups} positions={positions} selectedIndex={selectedIndex} selectedBuildingKey={selectedBuildingKey} figures={figures} />
      )}
      {pulses.map(p => {
        const a = indexByKey.get(p.from)
        const b = indexByKey.get(p.to)
        if (a === undefined || b === undefined) return null
        return <Pulse key={p.id} pulse={p} from={positions[a]} to={positions[b]} />
      })}
      {presenting && focus && onBack && (
        <Label text={selectedBuildingKey ? "← back to the island" : "← all islands"} y={2.2} scale={0.3} onClick={onBack} position={[focus.x, 0, focus.z + focus.radius * 0.95]} />
      )}
      </VRRig>
      </XR>
      <Controls extent={extent} focus={focus} enabled={!presenting} />
    </Canvas>
    {vrSupported && (
      <button
        onClick={() => (presenting ? store.getState().session?.end() : store.enterVR())}
        className="absolute bottom-3 right-3 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white shadow-lg transition-colors hover:bg-violet-700"
        title={XR_EMULATE ? 'Emulated headset (no real device needed)' : 'Walk into the map with a VR headset'}
      >
        {presenting ? 'Exit VR' : XR_EMULATE ? 'Enter VR (emulated)' : 'Enter VR'}
      </button>
    )}
    </>
  )
}
