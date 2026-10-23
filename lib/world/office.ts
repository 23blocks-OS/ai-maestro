/**
 * The 2D office's geometry: pure, so framing and sizing are tested without a browser.
 * World units are the same as the 3D map's (an island's radius, a room's half-width), seen from above:
 * x to the right, y down the page (the 3D map's z, so the front of a room is at the bottom).
 */

export interface Box { x: number; y: number; w: number; h: number }

/**
 * The view box that shows a rectangle (centre cx,cy, half sizes) in a container of the given aspect
 * (width / height) with nothing cut off: grown on the shorter side so the aspect matches exactly.
 */
export function fitBox(cx: number, cy: number, halfW: number, halfH: number, aspect: number): Box {
  const a = aspect > 0 && Number.isFinite(aspect) ? aspect : 1
  let w = halfW * 2
  let h = halfH * 2
  if (w / h < a) w = h * a
  else h = w / a
  return { x: cx - w / 2, y: cy - h / 2, w, h }
}

/** A character shrinks in a crowded room so neighbours do not hide each other (1 at a roomy 0.9 step or more) */
export function spriteScale(step: number): number {
  return Math.min(1, Math.max(0.55, step / 0.9))
}

/** Ease-out for the camera flight */
export const easeOut = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3)

/** Linear blend of two boxes */
export function mixBox(a: Box, b: Box, t: number): Box {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, w: a.w + (b.w - a.w) * t, h: a.h + (b.h - a.h) * t }
}

export const boxToViewBox = (b: Box) => `${b.x.toFixed(3)} ${b.y.toFixed(3)} ${b.w.toFixed(3)} ${b.h.toFixed(3)}`
