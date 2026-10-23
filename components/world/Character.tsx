'use client'

/**
 * An agent as a small low-poly person, built from primitives (no model files to download or license).
 * Its status is a pose and a place, not only a colour:
 *   typing    seated at a desk, hands on the keys (Working)
 *   standing  idle, breathing (Ready)
 *   waving    at the plaza, one arm up, a beacon bobbing over its head (Needs you)
 *   sleeping  lying down, with a Z (Offline)
 */

import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import type { Pose } from '@/lib/world/stage'
import Label from '@/components/world/Label'

const SKIN = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac', '#d9a066']
const HAIR = ['#1f1a17', '#3b2f2f', '#6b4423', '#a0522d', '#d2b48c', '#444444']

/** A small stable number from an id, so an agent keeps its look and its animation phase */
function hash(id: string): number {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
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
}

export default function Character({ id, pose, color, position, desk, animate, selected = false, name, onSelect }: CharacterProps) {
  const h = useMemo(() => hash(id), [id])
  const skin = SKIN[h % SKIN.length]
  const hair = HAIR[(h >> 3) % HAIR.length]
  const phase = (h % 628) / 100

  const root = useRef<Group>(null)
  const armL = useRef<Group>(null)
  const armR = useRef<Group>(null)
  const beacon = useRef<Group>(null)

  const sleeping = pose === 'sleeping'
  const typing = pose === 'typing'
  const waving = pose === 'waving'

  useFrame(({ clock }) => {
    const t = animate ? clock.elapsedTime : 0
    if (root.current) {
      // Breathing; a sleeper rises and falls slowly
      const breathe = Math.sin(t * (sleeping ? 1.2 : 2) + phase) * (sleeping ? 0.012 : 0.01)
      root.current.position.y = (sleeping ? 0.14 : typing ? -0.1 : 0) + breathe
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

      <group ref={root} rotation={sleeping ? [-Math.PI / 2, 0, 0] : [0, 0, 0]}>
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
          <meshStandardMaterial color={color} emissive={waving ? color : '#000000'} emissiveIntensity={waving ? 0.25 : 0} />
        </mesh>
        {/* Head and hair */}
        <mesh position={[0, 0.88, 0]}>
          <sphereGeometry args={[0.115, 12, 10]} />
          <meshStandardMaterial color={skin} />
        </mesh>
        <mesh position={[0, 0.93, -0.02]}>
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
      {sleeping && (
        <mesh position={[0.18, 0.5, 0]}>
          <torusGeometry args={[0.05, 0.015, 6, 12]} />
          <meshStandardMaterial color="#9ca3af" emissive="#9ca3af" emissiveIntensity={0.4} />
        </mesh>
      )}
    </group>
  )
}
