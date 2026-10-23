'use client'

import { useEffect, useMemo } from 'react'
import { CanvasTexture, LinearFilter } from 'three'

/** A name floating in the world, drawn once into a texture (no font or text dependency) */
export default function Label({ text, y, dim = false, scale = 1.1 }: { text: string; y: number; dim?: boolean; scale?: number }) {
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
    <sprite position={[0, y, 0]} scale={[scale * aspect, scale, 1]}>
      <spriteMaterial map={texture} transparent depthTest={false} opacity={dim ? 0.35 : 1} />
    </sprite>
  )
}
