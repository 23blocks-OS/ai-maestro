'use client'

/**
 * The world itself: one low-poly island per group, buildings sized by the
 * group's agent count, and agent figures only on the selected island.
 *
 * LOD rule: the overview renders islands + counts only — it never draws 160+
 * figures at once; full figures appear for the selected group alone.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { CanvasTexture, LinearFilter, type Group } from 'three'
import { OrbitControls as OrbitControlsImpl } from 'three/examples/jsm/controls/OrbitControls.js'
import type { WorldGroup } from '@/lib/world/grouping'
import { islandRadius, layoutIslands } from '@/lib/world/layout'
import { stageFigures } from '@/lib/world/stage'
import { PULSE_MS, type WorldPulse } from '@/lib/world/pulse'
import Character from '@/components/world/Character'
import type { AgentPresence } from '@/lib/agent-presence'

/**
 * Orbit controls from three's own examples (no extra dep): orbit/pan/zoom, no roll.
 * The canvas renders on demand, so the controls ask for a frame only when they move
 * and an idle map costs no GPU. `extent` is the layout's half-width: the camera is
 * placed to see all of it whenever the set of islands changes.
 */
function Controls({ extent, focus }: { extent: number; focus: { x: number; z: number; radius: number } | null }) {
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
  const fx = focus?.x, fz = focus?.z, fr = focus?.radius
  useEffect(() => {
    const k = Math.max(1, 1.7 / aspect())
    if (fx === undefined || fz === undefined || fr === undefined) {
      flight.current = { target: [0, 0, 0], cam: [0, overview.y * k, overview.z * k] }
    } else {
      const kk = Math.max(1, 1.2 / aspect())
      flight.current = { target: [fx, 0, fz], cam: [fx, (fr * 0.9 + 2.6) * kk, fz + (fr * 1.05 + 3.8) * kk] }
    }
    invalidate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fx, fz, fr, overview, invalidate])

  useFrame(() => {
    const f = flight.current
    if (!f) return
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

/** The operating system's "reduce motion" setting: with it on, characters hold their pose */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const q = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => setReduced(q.matches)
    sync()
    q.addEventListener('change', sync)
    return () => q.removeEventListener('change', sync)
  }, [])
  return reduced
}

/** A name floating over an island, drawn once into a texture (no font or text dependency) */
function IslandLabel({ text, y, dim }: { text: string; y: number; dim: boolean }) {
  const { texture, aspect } = useMemo(() => {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')!
    const font = '600 44px system-ui, -apple-system, sans-serif'
    ctx.font = font
    const w = Math.ceil(ctx.measureText(text).width) + 40
    canvas.width = w
    canvas.height = 80
    ctx.font = font
    ctx.fillStyle = 'rgba(3, 7, 18, 0.72)'
    ctx.beginPath()
    ctx.roundRect(0, 8, w, 64, 32)
    ctx.fill()
    ctx.fillStyle = '#e5e7eb'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, 20, 41)
    const t = new CanvasTexture(canvas)
    t.minFilter = LinearFilter
    return { texture: t, aspect: w / 80 }
  }, [text])
  useEffect(() => () => texture.dispose(), [texture])
  return (
    <sprite position={[0, y, 0]} scale={[1.1 * aspect, 1.1, 1]}>
      <spriteMaterial map={texture} transparent depthTest={false} opacity={dim ? 0.35 : 1} />
    </sprite>
  )
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
}

interface WorldSceneProps {
  groups: WorldGroup[]
  selectedKey: string | null
  onSelect: (key: string) => void
  /** Agents of the selected group, drawn as figures on its island */
  figures: WorldFigure[]
  /** Messages in flight: a gold orb arcs from the sender's island to the recipient's */
  pulses?: WorldPulse[]
  /** Islands drawn dim: every island but the selected one, or those with no agent matching the search or filter */
  dimmed?: Set<string>
}

function Island({ group, position, selected, dim, figures, animate, onSelect }: {
  group: WorldGroup
  position: [number, number]
  selected: boolean
  dim: boolean
  figures: WorldFigure[]
  animate: boolean
  onSelect: () => void
}) {
  const [x, z] = position
  const count = group.counts.total
  const radius = islandRadius(count)
  const buildings = Math.min(5, Math.max(1, Math.ceil(count / 8)))
  const staged = useMemo(() => (selected ? stageFigures(figures, radius).figures : []), [selected, figures, radius])
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
      {/* Buildings: boxes whose height grows with the group's fleet share */}
      {!selected && Array.from({ length: buildings }, (_, i) => {
        const angle = (i / buildings) * Math.PI * 2
        const bx = Math.cos(angle) * radius * 0.72
        const bz = Math.sin(angle) * radius * 0.72
        const h = 0.8 + ((count + i * 3) % 5) * 0.35
        return (
          <mesh key={i} position={[bx, h / 2, bz]}>
            <boxGeometry args={[0.9, h, 0.9]} />
            <meshStandardMaterial color={group.offline || dim ? '#374151' : '#99f6e4'} emissive={group.offline || dim ? '#000000' : '#115e59'} emissiveIntensity={0.4} />
          </mesh>
        )
      })}
      <IslandLabel text={group.label} y={Math.max(3.9, radius * 0.5 + 3)} dim={dim} />
      {/* Needs-you beacon over the island */}
      {group.counts.needsYou > 0 && (
        <mesh position={[0, 3.2, 0]}>
          <octahedronGeometry args={[0.35]} />
          <meshStandardMaterial color={PRESENCE_HEX['needs-you']} emissive={PRESENCE_HEX['needs-you']} emissiveIntensity={0.8} />
        </mesh>
      )}
      {/* Agents as people, on the selected island only (see the LOD rule above) */}
      {selected && staged.map(f => (
        <Character
          key={f.id}
          id={f.id}
          pose={f.pose}
          color={PRESENCE_HEX[f.presence]}
          position={[f.x, f.z]}
          desk={f.desk}
          animate={animate}
        />
      ))}
    </group>
  )
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

export default function WorldScene({ groups, selectedKey, onSelect, figures, dimmed, pulses = [] }: WorldSceneProps) {
  const { positions, extent } = useMemo(() => layoutIslands(groups), [groups])
  const selectedIndex = groups.findIndex(g => g.key === selectedKey)
  const focus = useMemo(
    () => (selectedIndex >= 0 ? { x: positions[selectedIndex][0], z: positions[selectedIndex][1], radius: islandRadius(groups[selectedIndex].counts.total) } : null),
    [selectedIndex, positions, groups],
  )
  const reduced = usePrefersReducedMotion()
  // Characters move, so the canvas draws continuously while a populated island is selected;
  // otherwise (the overview, or reduced motion) it draws on demand and an idle map costs no GPU.
  const animate = !reduced && selectedIndex >= 0 && figures.length > 0
  // Pulses are motion too, so they ask for continuous frames while any is in flight
  const drawing = animate || pulses.length > 0
  const indexByKey = useMemo(() => new Map(groups.map((g, i) => [g.key, i])), [groups])
  return (
    <Canvas frameloop={drawing ? 'always' : 'demand'} camera={{ position: [0, 15, 17], fov: 45 }} style={{ background: '#030712' }}>
      <ambientLight intensity={0.7} />
      <directionalLight position={[8, 14, 6]} intensity={1.4} />
      {groups.map((g, i) => (
        <Island
          key={g.key}
          group={g}
          position={positions[i]}
          selected={g.key === selectedKey}
          dim={dimmed?.has(g.key) ?? false}
          figures={g.key === selectedKey ? figures : []}
          animate={animate}
          onSelect={() => onSelect(g.key)}
        />
      ))}
      {pulses.map(p => {
        const a = indexByKey.get(p.from)
        const b = indexByKey.get(p.to)
        if (a === undefined || b === undefined) return null
        return <Pulse key={p.id} pulse={p} from={positions[a]} to={positions[b]} />
      })}
      <Controls extent={extent} focus={focus} />
    </Canvas>
  )
}
