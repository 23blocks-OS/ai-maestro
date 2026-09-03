'use client'

import { useEffect, useRef } from 'react'
import { FaceMotion, rigForAvatar, type FaceActivity, type FaceFrame, type FaceRig } from '@/lib/avatar-motion'

interface AgentFaceProps {
  /** Avatar image URL. Emoji and initials are handled by the caller. */
  src: string
  /** Rendered width in CSS pixels. */
  width: number
  /** Rendered height in CSS pixels. Defaults to width (square). */
  height?: number
  /** What the agent is doing. Drives idle behaviour, gaze and posture. */
  activity: FaceActivity
  /** Pull current speech energy, 0..1. Called once per frame. */
  readLevel?: () => number
  className?: string
  /** Accessible description; the canvas is decorative without it. */
  alt?: string
}

/**
 * A still portrait, animated.
 *
 * The technique is a soft jaw warp rather than mouth sprites. The image is
 * drawn in three horizontal bands — rigid above the jaw, a stretched band
 * across the mouth, and the chin displaced downward — plus an inner-mouth
 * shadow that deepens with the opening.
 *
 * Sprites would be sharper and are wrong here. They need an exact mouth
 * position per avatar, and there are 245 avatars across three sets whose
 * framing is only approximately consistent. A hard-edged sprite three percent
 * out of place looks broken; a soft band three percent out of place still reads
 * as talking. Picking the technique that degrades well is what makes this
 * shippable across the whole set instead of a hand-tuned handful.
 *
 * Everything else — blink, breathing, sway, gaze — comes from FaceMotion, which
 * is pure and tested. This file only turns numbers into pixels.
 */
export default function AgentFace({ src, width, height, activity, readLevel, className, alt }: AgentFaceProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)
  const motionRef = useRef<FaceMotion | null>(null)
  const rigRef = useRef<FaceRig>(rigForAvatar(src))
  const readLevelRef = useRef(readLevel)
  const rafRef = useRef<number>(0)

  const w = width
  const h = height ?? width

  readLevelRef.current = readLevel
  rigRef.current = rigForAvatar(src)

  // Activity is pushed imperatively rather than through the effect, so a state
  // change never interrupts a blink or resets the breathing phase.
  if (!motionRef.current) motionRef.current = new FaceMotion()
  motionRef.current.setActivity(activity)

  useEffect(() => {
    const img = new Image()
    img.decoding = 'async'
    img.src = src
    img.onload = () => {
      imageRef.current = img
    }
    return () => { imageRef.current = null }
  }, [src])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Render at device resolution. A 1024² portrait shown at 96px is
    // unforgiving of a soft canvas, and blur is the first thing that makes this
    // read as a cheap effect rather than a face.
    const dpr = Math.min(window.devicePixelRatio || 1, 3)
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    let last = performance.now()

    const draw = (now: number) => {
      rafRef.current = requestAnimationFrame(draw)
      const dt = (now - last) / 1000
      last = now

      const img = imageRef.current
      const motion = motionRef.current
      if (!img || !motion || !img.naturalWidth) return

      const level = readLevelRef.current?.() ?? 0
      const frame = motion.advance(dt, level)
      paintFace(ctx, img, w, h, rigRef.current, frame)
    }

    rafRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(rafRef.current)
  }, [w, h])

  return (
    <canvas
      ref={canvasRef}
      role={alt ? 'img' : 'presentation'}
      aria-label={alt}
      className={className}
      style={{ width: w, height: h, display: 'block' }}
    />
  )
}

/**
 * Chin travel at a full mouth opening, as a fraction of face height.
 *
 * Started at 0.028 and it was far too timid: rendering the extremes side by
 * side, "closed" and "fully open" were nearly indistinguishable — the face just
 * got fractionally longer. A real jaw drops roughly 5% of face height on an
 * open vowel, and at small avatar sizes it needs to be at least that to read at
 * all.
 */
const JAW_TRAVEL = 0.055
/** How much the head lifts on an inhale, as a fraction of face height. */
const BREATH_LIFT = 0.0035
/** Maximum head roll in degrees. */
const MAX_TILT_DEG = 1.4
/**
 * Eye box height as a multiple of eye width. Tuned by rendering: taller boxes
 * reach the eyebrow and drag it into the blink.
 */
const EYE_BOX_ASPECT = 0.45
/** Fraction of the eye box reused as upper-lid skin. */
const EYE_LID_SLIVER = 0.08

/**
 * `object-fit: cover` as numbers.
 *
 * The same component has to serve a 96px circle and a full-bleed phone screen,
 * so mapping is computed rather than assumed square. Rig fractions stay
 * relative to the SOURCE image and are projected through this transform, which
 * keeps the rig measurements valid at any aspect ratio.
 */
function coverTransform(img: HTMLImageElement, dw: number, dh: number) {
  const scale = Math.max(dw / img.naturalWidth, dh / img.naturalHeight)
  return {
    scale,
    offsetX: (dw - img.naturalWidth * scale) / 2,
    offsetY: (dh - img.naturalHeight * scale) / 2,
  }
}

function paintFace(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  dw: number,
  dh: number,
  rig: FaceRig,
  f: FaceFrame
) {
  const iw = img.naturalWidth
  const ih = img.naturalHeight
  const { scale, offsetX, offsetY } = coverTransform(img, dw, dh)
  const faceH = ih * scale

  ctx.clearRect(0, 0, dw, dh)
  ctx.save()

  // ── Whole-head motion ──
  // Sway, breath lift and roll apply to everything, so the head moves as one
  // object. Applying them per-band instead is what makes cheap 2D rigs look
  // like a face sliding apart.
  const cx = dw / 2
  const cy = dh / 2
  ctx.translate(cx + f.swayX * dw, cy + (f.swayY * dh) - f.breathe * BREATH_LIFT * faceH)
  ctx.rotate((f.tilt * MAX_TILT_DEG * Math.PI) / 180)
  // Breathing scales fractionally too — the chest rises so the framing grows a
  // hair. Below ~0.4% it is invisible; above ~1% it reads as a zoom pulse.
  const breathScale = 1 + f.breathe * 0.004
  ctx.scale(breathScale, breathScale)
  ctx.translate(-cx, -cy)

  if (f.presence < 1) {
    // Offline drains the colour rather than dimming. Grey reads as "not
    // running"; dim just reads as a styling choice.
    ctx.filter = `saturate(${0.15 + f.presence * 0.85}) brightness(${0.55 + f.presence * 0.45})`
  }

  /** Source Y (image px) → destination Y (css px). */
  const toDst = (srcY: number) => offsetY + srcY * scale

  const drop = f.mouthOpen * JAW_TRAVEL * faceH * rig.jawScale
  const jawTopSrc = rig.jawTop * ih
  const mouthBottomSrc = (rig.mouthY + 0.045) * ih

  // Bands overlap by a pixel. Adjacent drawImage calls at fractional
  // coordinates do not meet exactly — the rounding leaves a hairline gap that
  // shows as a dark seam straight across the face, and it is visible even when
  // the mouth is fully closed.
  const SEAM = 1

  // ── Band 1: above the jaw, rigid ──
  ctx.drawImage(
    img,
    0, 0, iw, jawTopSrc,
    offsetX, toDst(0), iw * scale, jawTopSrc * scale + SEAM
  )

  // ── Band 2: the mouth band, stretched vertically ──
  // Stretching rather than translating is what opens the mouth: the lips move
  // apart while the nose above and the chin below stay attached to it.
  const bandSrcH = mouthBottomSrc - jawTopSrc
  ctx.drawImage(
    img,
    0, jawTopSrc, iw, bandSrcH,
    offsetX, toDst(jawTopSrc), iw * scale, bandSrcH * scale + drop + SEAM
  )

  // ── Band 3: chin and below, displaced by the full drop ──
  ctx.drawImage(
    img,
    0, mouthBottomSrc, iw, ih - mouthBottomSrc,
    offsetX, toDst(mouthBottomSrc) + drop, iw * scale, (ih - mouthBottomSrc) * scale
  )

  // ── Inner mouth ──
  // A soft dark ellipse where the lips part. This is what sells the opening:
  // stretching alone BRIGHTENS the mouth region, because it smears lip pixels
  // rather than revealing a dark cavity behind them.
  if (f.mouthOpen > 0.02) {
    const mw = rig.mouthWidth * iw * scale * (0.72 + f.mouthOpen * 0.28)
    // Deliberately NOT damped by jawScale. On a rigid face the shadow is the
    // only thing left doing the work, so damping it too would leave the robot
    // set with no mouth movement at all.
    const mh = Math.max(f.mouthOpen * JAW_TRAVEL * faceH * 0.8, 1)
    const mx = offsetX + rig.mouthX * iw * scale
    const my = toDst(rig.mouthY * ih) + drop * 0.5
    // An open mouth is genuinely dark. The first version faded to transparent
    // so gently that it vanished entirely against skin — and on a bearded face
    // it was invisible even at full opening. Hold the centre nearly opaque and
    // feather only at the rim.
    const gradient = ctx.createRadialGradient(mx, my, 0, mx, my, Math.max(mw / 2, mh))
    const alpha = Math.min(1, f.mouthOpen * 1.5)
    gradient.addColorStop(0, `rgba(22, 8, 10, ${0.82 * alpha})`)
    gradient.addColorStop(0.55, `rgba(26, 10, 12, ${0.6 * alpha})`)
    gradient.addColorStop(1, 'rgba(30, 14, 16, 0)')
    ctx.beginPath()
    ctx.ellipse(mx, my, mw / 2, mh, 0, 0, Math.PI * 2)
    ctx.fillStyle = gradient
    ctx.fill()
  }

  // ── Blink ──
  // Lids drawn by sampling skin from just above the eyes and pulling it down.
  // Far more convincing than a flat colour, and — the reason it is done this
  // way — it carries the right tone for every avatar without the code knowing
  // any of their palettes, which is what lets photoreal faces and robots share
  // one implementation.
  if (f.blink > 0.01) {
    // Blinking by SQUASHING the eye, not by painting over it.
    //
    // Four approaches were built and rendered before this one stuck:
    //   1. copy a full-width strip of brow over the eye line — painted over the
    //      hair and background too, and read as a video glitch;
    //   2. clip that strip to an ellipse — drew a duplicate EYEBROW inside each
    //      lid and left a hard scalloped edge;
    //   3. fill a soft ellipse with sampled skin — flat beige discs stuck on
    //      the face;
    //   4. squash the eye and fill from just ABOVE the eye box — grabbed the
    //      eyebrow again, because on these portraits there is almost no lid
    //      space between eye and brow.
    //
    // This one compresses the eye box toward the lower lid and fills the
    // vacated space from the box's OWN top sliver, so it can never reach the
    // brow. It imports no foreign pixels and needs no palette knowledge, which
    // is what lets photoreal faces and robot lenses share one implementation.
    //
    // Worth recording how the earlier versions were rejected: they were judged
    // at 5x zoom, where every seam is glaring. At the sizes this actually
    // renders — a 96px circle, a 160px call avatar — the remaining artifacts
    // are a pixel or two and invisible, and the blink reads correctly. Verify
    // at display size, not at zoom.
    const eyeW = rig.eyeWidth * iw * scale
    const eyeH = eyeW * EYE_BOX_ASPECT
    const srcEyeW = rig.eyeWidth * iw
    const srcEyeH = srcEyeW * EYE_BOX_ASPECT
    // Never fully close. The last few percent is where the box edges start to
    // show, and at blink speed nobody can tell the difference.
    const blink = Math.min(f.blink, 0.85)

    for (const side of [-1, 1]) {
      const ecxSrc = (rig.mouthX + (side * rig.eyeSeparation) / 2) * iw
      const ecx = offsetX + ecxSrc * scale
      const eyeCy = toDst(rig.eyeY * ih)
      const sx = ecxSrc - srcEyeW / 2
      const syTop = rig.eyeY * ih - srcEyeH / 2
      const dstX = ecx - eyeW / 2
      const dstTop = eyeCy - eyeH / 2
      const dstBottom = eyeCy + eyeH / 2
      const remaining = Math.max(1, (1 - blink * 0.92) * eyeH)

      // The eye, compressed downward onto the lower lid.
      ctx.drawImage(img, sx, syTop, srcEyeW, srcEyeH, dstX, dstBottom - remaining, eyeW, remaining)

      // The upper lid: the box's own top sliver, stretched down to fill.
      const fill = dstBottom - remaining - dstTop
      if (fill > 0) {
        ctx.drawImage(
          img,
          sx, syTop, srcEyeW, srcEyeH * EYE_LID_SLIVER,
          dstX, dstTop, eyeW, fill + 1
        )
      }
    }
  }

  ctx.restore()
  ctx.filter = 'none'
}
