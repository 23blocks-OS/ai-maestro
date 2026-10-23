'use client'

/**
 * The world itself: one low-poly island per group, buildings sized by the
 * group's agent count, and agent figures only on the selected island.
 *
 * LOD rule: the overview renders islands + counts only — it never draws 160+
 * figures at once; full figures appear for the selected group alone.
 */

import { useEffect, useMemo } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls as OrbitControlsImpl } from 'three/examples/jsm/controls/OrbitControls.js'
import type { WorldGroup } from '@/lib/world/grouping'
import { islandRadius, layoutIslands } from '@/lib/world/layout'
import type { AgentPresence } from '@/lib/agent-presence'

/**
 * Orbit controls from three's own examples (no extra dep): orbit/pan/zoom, no roll.
 * The canvas renders on demand, so the controls ask for a frame only when they move
 * and an idle map costs no GPU. `extent` is the layout's half-width: the camera is
 * placed to see all of it whenever the set of islands changes.
 */
function Controls({ extent }: { extent: number }) {
  const camera = useThree(s => s.camera)
  const gl = useThree(s => s.gl)
  const invalidate = useThree(s => s.invalidate)
  const get = useThree(s => s.get)
  const controls = useMemo(() => {
    const c = new OrbitControlsImpl(camera, gl.domElement)
    c.maxPolarAngle = Math.PI / 2.2
    c.minDistance = 5
    return c
  }, [camera, gl])
  useEffect(() => {
    const onChange = () => invalidate()
    controls.addEventListener('change', onChange)
    return () => { controls.removeEventListener('change', onChange); controls.dispose() }
  }, [controls, invalidate])
  useEffect(() => {
    // A narrow canvas (a phone) sees less sideways, so back the camera off to keep every island in view
    const { width, height } = get().size
    const reach = Math.max(extent, 8) * Math.max(1, 1.7 / (width / Math.max(height, 1)))
    controls.maxDistance = Math.max(45, reach * 4)
    camera.position.set(0, reach * 0.9 + 4, reach * 1.1 + 6)
    controls.target.set(0, 0, 0)
    controls.update()
    invalidate()
  }, [controls, camera, extent, invalidate, get])
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
}

interface WorldSceneProps {
  groups: WorldGroup[]
  selectedKey: string | null
  onSelect: (key: string) => void
  /** Agents of the selected group, drawn as figures on its island */
  figures: WorldFigure[]
}

function Island({ group, position, selected, figures, onSelect }: {
  group: WorldGroup
  position: [number, number]
  selected: boolean
  figures: WorldFigure[]
  onSelect: () => void
}) {
  const [x, z] = position
  const count = group.counts.total
  const radius = islandRadius(count)
  const buildings = Math.min(5, Math.max(1, Math.ceil(count / 8)))
  const base = group.offline ? '#1f2937' : selected ? '#0f766e' : '#134e4a'

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
      {Array.from({ length: buildings }, (_, i) => {
        const angle = (i / buildings) * Math.PI * 2
        const bx = Math.cos(angle) * radius * 0.72
        const bz = Math.sin(angle) * radius * 0.72
        const h = 0.8 + ((count + i * 3) % 5) * 0.35
        return (
          <mesh key={i} position={[bx, h / 2, bz]}>
            <boxGeometry args={[0.9, h, 0.9]} />
            <meshStandardMaterial color={group.offline ? '#374151' : '#99f6e4'} emissive={group.offline ? '#000000' : '#115e59'} emissiveIntensity={0.4} />
          </mesh>
        )
      })}
      {/* Needs-you beacon over the island */}
      {group.counts.needsYou > 0 && (
        <mesh position={[0, 3.2, 0]}>
          <octahedronGeometry args={[0.35]} />
          <meshStandardMaterial color={PRESENCE_HEX['needs-you']} emissive={PRESENCE_HEX['needs-you']} emissiveIntensity={0.8} />
        </mesh>
      )}
      {/* Agent figures — selected island only (see LOD rule above) */}
      {selected && figures.map((f, i) => {
        const cols = Math.max(1, Math.ceil(Math.sqrt(figures.length)))
        // Fit the grid inside the ring of buildings, however many agents stand here
        const step = Math.min(0.85, (radius * 1.0) / cols)
        const fx = (i % cols - (cols - 1) / 2) * step
        const fz = (Math.floor(i / cols) - (Math.ceil(figures.length / cols) - 1) / 2) * step
        return (
          <group key={f.id} position={[fx, 0, fz]}>
            <mesh position={[0, 0.55, 0]}>
              <capsuleGeometry args={[0.16, 0.45, 4, 8]} />
              <meshStandardMaterial color={PRESENCE_HEX[f.presence]} />
            </mesh>
            {f.presence === 'needs-you' && (
              <mesh position={[0, 1.35, 0]}>
                <octahedronGeometry args={[0.14]} />
                <meshStandardMaterial color={PRESENCE_HEX['needs-you']} emissive={PRESENCE_HEX['needs-you']} emissiveIntensity={1} />
              </mesh>
            )}
          </group>
        )
      })}
    </group>
  )
}

export default function WorldScene({ groups, selectedKey, onSelect, figures }: WorldSceneProps) {
  const { positions, extent } = useMemo(() => layoutIslands(groups), [groups])
  return (
    <Canvas frameloop="demand" camera={{ position: [0, 15, 17], fov: 45 }} style={{ background: '#030712' }}>
      <ambientLight intensity={0.7} />
      <directionalLight position={[8, 14, 6]} intensity={1.4} />
      {groups.map((g, i) => (
        <Island
          key={g.key}
          group={g}
          position={positions[i]}
          selected={g.key === selectedKey}
          figures={g.key === selectedKey ? figures : []}
          onSelect={() => onSelect(g.key)}
        />
      ))}
      <Controls extent={extent} />
    </Canvas>
  )
}
