'use client'

import { useEffect, useMemo } from 'react'
import { CanvasTexture, LinearFilter } from 'three'

/** A name floating in the world, drawn once into a texture (no font or text dependency) */
export default function Label({ text, y, dim = false, scale = 1.1, maxWidth = 6, onClick, position }: { text: string; y: number; dim?: boolean; scale?: number; maxWidth?: number; onClick?: () => void; position?: [number, number, number] }) {
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
  // A long name is made smaller, not wider than the island it labels
  const sc = Math.min(scale, maxWidth / aspect)
  const at: [number, number, number] = position ? [position[0], y + position[1], position[2]] : [0, y, 0]
  // A button (the in-headset "all islands") is a plane that faces the person standing in front of it, so a
  // controller's ray can hit it; a plain name is a camera-facing sprite that rays pass through (a sprite
  // cannot be raycast without the camera, which the headset's pointer does not supply).
  if (onClick) {
    return (
      <mesh position={at} onClick={e => { e.stopPropagation(); onClick() }}>
        <planeGeometry args={[sc * aspect, sc]} />
        <meshBasicMaterial map={texture} transparent depthTest={false} opacity={dim ? 0.35 : 1} />
      </mesh>
    )
  }
  return (
    <sprite position={at} scale={[sc * aspect, sc, 1]} raycast={() => null}>
      <spriteMaterial map={texture} transparent depthTest={false} opacity={dim ? 0.35 : 1} />
    </sprite>
  )
}
