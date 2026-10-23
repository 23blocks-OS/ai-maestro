'use client'

/**
 * An agent as a small low-poly person, built from primitives (no model files to download or license).
 * Its status is a pose and a place, not only a colour:
 *   typing    seated at a desk, hands on the keys (Working)
 *   standing  idle, breathing (Ready)
 *   waving    at the plaza, one arm up, a beacon bobbing over its head (Needs you)
 *   resting   standing, greyed out, head bowed, a small zz over it (Offline). Never lying down: an offline
 *             agent is away, not dead.
 */

import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { CanvasTexture, LinearFilter, type Group } from 'three'
import type { Pose } from '@/lib/world/stage'
import Label from '@/components/world/Label'
import { lookOf } from '@/lib/world/look'

let zzTexture: CanvasTexture | null = null
/** One small "zz" texture shared by every resting agent (a texture each would be hundreds of canvases) */
function zzMap(): CanvasTexture {
  if (!zzTexture) {
    const c = document.createElement('canvas')
    c.width = 128
    c.height = 128
    const ctx = c.getContext('2d')!
    ctx.fillStyle = '#9ca3af'
    ctx.font = '700 70px system-ui, sans-serif'
    ctx.fillText('z', 18, 100)
    ctx.font = '700 46px system-ui, sans-serif'
    ctx.fillText('z', 66, 62)
    zzTexture = new CanvasTexture(c)
    zzTexture.minFilter = LinearFilter
  }
  return zzTexture
}

/** The "away" marker over a resting agent */
function RestBadge() {
  const map = useMemo(zzMap, [])
  return (
    <sprite position={[0.12, 1.22, 0]} scale={[0.34, 0.34, 1]} raycast={() => null}>
      <spriteMaterial map={map} transparent depthTest={false} opacity={0.85} />
    </sprite>
  )
}

interface CharacterProps {
  id: string
  pose: Pose
  /** The presence colour, worn as the shirt */
  color: string
  position: [number, number]
  desk: boolean
  animate: boolean
  /** The agent whose card is open: ringed and named */
  selected?: boolean
  name?: string
  onSelect?: () => void
  /** Out of the spotlight (a search, a filter or a team is on and this agent is not in it): greyed, nothing over it */
  dim?: boolean
  /** A speech bubble over the head: what it is waiting on you for */
  say?: string
  /** A small tag beside it (its open cards in the work lens) */
  badge?: { text: string; late: boolean }
}

export default function Character({ id, pose, color, position, desk, animate, selected = false, name, onSelect, dim = false, say, badge }: CharacterProps) {
  const { skin, hair, phase } = useMemo(() => lookOf(id), [id])

  const root = useRef<Group>(null)
  const armL = useRef<Group>(null)
  const armR = useRef<Group>(null)
  const beacon = useRef<Group>(null)

  const resting = pose === 'resting'
  const typing = pose === 'typing'
  const waving = pose === 'waving' && !dim
  const shirt = dim ? '#374151' : color

  useFrame(({ clock }) => {
    const t = animate ? clock.elapsedTime : 0
    if (root.current) {
      // Breathing, slower when resting
      const breathe = Math.sin(t * (resting ? 1.2 : 2) + phase) * (resting ? 0.008 : 0.01)
      root.current.position.y = (typing ? -0.1 : 0) + breathe
    }
    if (armL.current && armR.current) {
      if (typing) {
        // Hands forward on the keys, fingers busy
        armL.current.rotation.x = -1.25 + Math.sin(t * 13 + phase) * 0.12
        armR.current.rotation.x = -1.25 + Math.sin(t * 11 + phase + 1.7) * 0.12
      } else if (waving) {
        armL.current.rotation.x = 0
        armR.current.rotation.x = 0
        armR.current.rotation.z = -2.6 + Math.sin(t * 7 + phase) * 0.35
      } else {
        armL.current.rotation.x = Math.sin(t * 2 + phase) * 0.04
        armR.current.rotation.x = -Math.sin(t * 2 + phase) * 0.04
      }
    }
    if (beacon.current) beacon.current.position.y = 1.5 + Math.abs(Math.sin(t * 4 + phase)) * 0.18
  })

  return (
    <group
      position={[position[0], 0, position[1]]}
      onClick={e => { e.stopPropagation(); if (e.delta > 4) return; onSelect?.() }}
      onPointerOver={e => { e.stopPropagation(); document.body.style.cursor = 'pointer' }}
      onPointerOut={() => { document.body.style.cursor = '' }}
    >
      {selected && (
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.3, 0.38, 24]} />
          <meshBasicMaterial color="#5eead4" />
        </mesh>
      )}
      {selected && name && <Label text={name} y={1.75} scale={0.42} />}
      {say && !dim && !selected && <Label text={say} y={2.0} scale={0.3} maxWidth={2.4} bg="rgba(194, 65, 12, 0.94)" fg="#ffffff" />}
      {badge && !dim && <Label text={badge.text} y={1.1} position={[0.42, 0, 0]} scale={0.2} maxWidth={0.9} bg={badge.late ? 'rgba(153, 27, 27, 0.94)' : 'rgba(30, 64, 175, 0.94)'} fg="#ffffff" />}
      {desk && (
        <group position={[0, 0, 0.36]}>
          <mesh position={[0, 0.36, 0]}>
            <boxGeometry args={[0.62, 0.04, 0.32]} />
            <meshStandardMaterial color="#6b7280" />
          </mesh>
          <mesh position={[-0.27, 0.18, 0]}>
            <boxGeometry args={[0.04, 0.36, 0.28]} />
            <meshStandardMaterial color="#4b5563" />
          </mesh>
          <mesh position={[0.27, 0.18, 0]}>
            <boxGeometry args={[0.04, 0.36, 0.28]} />
            <meshStandardMaterial color="#4b5563" />
          </mesh>
          {/* The screen glows while it is being worked on */}
          <mesh position={[0, 0.52, -0.05]}>
            <boxGeometry args={[0.26, 0.17, 0.02]} />
            <meshStandardMaterial color="#0f172a" emissive="#34d399" emissiveIntensity={0.9} />
          </mesh>
        </group>
      )}

      <group ref={root}>
        {/* Legs (folded under the desk when typing) */}
        {!typing && (
          <>
            <mesh position={[-0.07, 0.17, 0]}>
              <boxGeometry args={[0.1, 0.34, 0.1]} />
              <meshStandardMaterial color="#374151" />
            </mesh>
            <mesh position={[0.07, 0.17, 0]}>
              <boxGeometry args={[0.1, 0.34, 0.1]} />
              <meshStandardMaterial color="#374151" />
            </mesh>
          </>
        )}
        {/* Torso in the status colour */}
        <mesh position={[0, 0.52, 0]}>
          <capsuleGeometry args={[0.13, 0.22, 4, 8]} />
          <meshStandardMaterial color={shirt} emissive={waving ? color : '#000000'} emissiveIntensity={waving ? 0.25 : 0} />
        </mesh>
        {/* Head and hair */}
        <mesh position={[0, resting ? 0.85 : 0.88, resting ? 0.03 : 0]}>
          <sphereGeometry args={[0.115, 12, 10]} />
          <meshStandardMaterial color={skin} />
        </mesh>
        <mesh position={[0, resting ? 0.9 : 0.93, resting ? 0.01 : -0.02]}>
          <sphereGeometry args={[0.12, 12, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color={hair} />
        </mesh>
        {/* Arms, hinged at the shoulder */}
        <group ref={armL} position={[-0.18, 0.7, 0]}>
          <mesh position={[0, -0.14, 0]}>
            <capsuleGeometry args={[0.04, 0.2, 3, 6]} />
            <meshStandardMaterial color={skin} />
          </mesh>
        </group>
        <group ref={armR} position={[0.18, 0.7, 0]}>
          <mesh position={[0, -0.14, 0]}>
            <capsuleGeometry args={[0.04, 0.2, 3, 6]} />
            <meshStandardMaterial color={skin} />
          </mesh>
        </group>
      </group>

      {waving && (
        <group ref={beacon} position={[0, 1.5, 0]}>
          <mesh>
            <octahedronGeometry args={[0.13]} />
            <meshStandardMaterial color="#f97316" emissive="#f97316" emissiveIntensity={1} />
          </mesh>
        </group>
      )}
      {resting && <RestBadge />}
    </group>
  )
}
