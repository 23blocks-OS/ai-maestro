/**
 * Tests for lib/avatar-motion.ts.
 *
 * The behaviour is the part worth pinning. A mouth that opens with the audio is
 * easy to eyeball; a face that still looks alive during the four seconds
 * between sentences is not, and it is what the feature is actually for.
 *
 * These run the model at a fixed step and assert on cadence, so a regression
 * shows up as a number rather than as "it looks a bit dead now".
 */

import { describe, it, expect } from 'vitest'
import {
  FaceMotion,
  rigForAvatar,
  rigFromAnchors,
  activityForAgentStatus,
  FACE_RIGS,
  DEFAULT_FACE_RIG,
} from '@/lib/avatar-motion'

/** Deterministic rng so blink and saccade timing are reproducible. */
function seeded(seed = 1) {
  let s = seed
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648
    return s / 2147483648
  }
}

/** Run the model for `seconds` at 60fps, collecting every frame. */
function run(m: FaceMotion, seconds: number, level: number | ((t: number) => number) = 0) {
  const dt = 1 / 60
  const frames = []
  for (let t = 0; t < seconds; t += dt) {
    frames.push(m.advance(dt, typeof level === 'function' ? level(t) : level))
  }
  return frames
}

/** Count blinks as rising edges through the half-closed mark. */
function countBlinks(frames: { blink: number }[]): number {
  let n = 0
  let closed = false
  for (const f of frames) {
    if (!closed && f.blink > 0.5) { n++; closed = true }
    else if (closed && f.blink < 0.1) closed = false
  }
  return n
}

describe('idle life — what runs when nothing is speaking', () => {
  it('blinks at a human cadence, not a metronome', () => {
    const m = new FaceMotion({ random: seeded() })
    const frames = run(m, 60)
    const blinks = countBlinks(frames)
    // Resting human blink is roughly every 4s; allow a wide band because the
    // period is deliberately jittered.
    expect(blinks).toBeGreaterThan(8)
    expect(blinks).toBeLessThan(28)
  })

  it('does not blink at a fixed interval', () => {
    // Evenly spaced blinks are the single most legible "this is a machine" tell.
    const m = new FaceMotion({ random: seeded(7) })
    const dt = 1 / 60
    const times: number[] = []
    let t = 0
    let closed = false
    for (let i = 0; i < 60 * 90; i++) {
      const f = m.advance(dt)
      t += dt
      if (!closed && f.blink > 0.5) { times.push(t); closed = true }
      else if (closed && f.blink < 0.1) closed = false
    }
    const gaps = times.slice(1).map((v, i) => v - times[i])
    const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length
    const spread = Math.max(...gaps) - Math.min(...gaps)
    expect(spread).toBeGreaterThan(mean * 0.3)
  })

  it('closes the eyes fully and reopens them', () => {
    const m = new FaceMotion({ random: seeded(3) })
    const frames = run(m, 30)
    expect(Math.max(...frames.map(f => f.blink))).toBeGreaterThan(0.95)
    expect(frames[frames.length - 1].blink).toBeLessThan(1)
  })

  it('breathes continuously', () => {
    const m = new FaceMotion({ random: seeded() })
    const frames = run(m, 10)
    const values = frames.map(f => f.breathe)
    expect(Math.max(...values)).toBeGreaterThan(0.9)
    expect(Math.min(...values)).toBeLessThan(-0.9)
  })

  it('sways without visibly repeating', () => {
    // Summed incommensurable frequencies: the trace must not be periodic over a
    // short window, or the loop becomes obvious within seconds of watching.
    const m = new FaceMotion({ random: seeded() })
    const frames = run(m, 20)
    const xs = frames.map(f => f.swayX)
    const firstHalf = xs.slice(0, xs.length / 2)
    const secondHalf = xs.slice(xs.length / 2)
    const diff = firstHalf.reduce((acc, v, i) => acc + Math.abs(v - secondHalf[i]), 0)
    expect(diff).toBeGreaterThan(0)
  })

  it('keeps sway small enough to read as micro-motion', () => {
    const m = new FaceMotion({ random: seeded() })
    const frames = run(m, 20)
    // A few percent of image size. Larger and the head bobs like a toy.
    expect(Math.max(...frames.map(f => Math.abs(f.swayX)))).toBeLessThan(0.03)
    expect(Math.max(...frames.map(f => Math.abs(f.swayY)))).toBeLessThan(0.03)
  })
})

describe('offline is frozen, and that is deliberate', () => {
  it('does not breathe, blink or sway when the agent is not running', () => {
    // A breathing avatar for an agent that is not running would be the same
    // class of lie as a delivery report nothing verified.
    const m = new FaceMotion({ random: seeded() })
    m.setActivity('offline')
    const frames = run(m, 30)
    expect(countBlinks(frames)).toBe(0)
    expect(Math.max(...frames.map(f => Math.abs(f.breathe)))).toBe(0)
    expect(Math.max(...frames.map(f => Math.abs(f.swayX)))).toBe(0)
    expect(frames[frames.length - 1].presence).toBe(0)
  })

  it('comes back to life when the agent does', () => {
    const m = new FaceMotion({ random: seeded() })
    m.setActivity('offline')
    run(m, 5)
    m.setActivity('idle')
    const frames = run(m, 30)
    expect(countBlinks(frames)).toBeGreaterThan(2)
    expect(frames[frames.length - 1].presence).toBe(1)
  })
})

describe('activity changes how the face behaves', () => {
  it('thinking looks away and up', () => {
    const m = new FaceMotion({ random: seeded(11) })
    m.setActivity('thinking')
    const frames = run(m, 20)
    // Negative Y is up in the gaze convention.
    const meanY = frames.reduce((a, f) => a + f.gazeY, 0) / frames.length
    expect(meanY).toBeLessThan(-0.1)
  })

  it('waiting holds eye contact instead of wandering', () => {
    // Blocked on a human is the one state where the agent should look at you.
    const m = new FaceMotion({ random: seeded(5) })
    m.setActivity('waiting')
    const frames = run(m, 20).slice(60) // let the gaze settle
    expect(Math.max(...frames.map(f => Math.abs(f.gazeX)))).toBeLessThan(0.05)
  })

  it('active breathes faster than idle', () => {
    const count = (activity: 'idle' | 'active') => {
      const m = new FaceMotion({ random: seeded() })
      m.setActivity(activity)
      const frames = run(m, 60)
      let crossings = 0
      for (let i = 1; i < frames.length; i++) {
        if (frames[i - 1].breathe < 0 && frames[i].breathe >= 0) crossings++
      }
      return crossings
    }
    expect(count('active')).toBeGreaterThan(count('idle'))
  })

  it('re-aims immediately on a state change rather than waiting out the timer', () => {
    const m = new FaceMotion({ random: seeded(2) })
    m.setActivity('thinking')
    run(m, 10)
    m.setActivity('waiting')
    const frames = run(m, 1)
    // Attention should look prompt: within a second the gaze is back on camera.
    expect(Math.abs(frames[frames.length - 1].gazeX)).toBeLessThan(0.05)
  })
})

describe('mouth envelope', () => {
  it('opens when there is speech energy', () => {
    const m = new FaceMotion({ random: seeded() })
    const frames = run(m, 1, 0.8)
    expect(frames[frames.length - 1].mouthOpen).toBeGreaterThan(0.7)
  })

  it('stays shut in silence', () => {
    const m = new FaceMotion({ random: seeded() })
    const frames = run(m, 2, 0)
    expect(frames[frames.length - 1].mouthOpen).toBe(0)
  })

  it('opens fast — speech onsets are sharp', () => {
    const m = new FaceMotion({ random: seeded() })
    const frames = run(m, 0.1, 0.9)
    expect(frames[frames.length - 1].mouthOpen).toBeGreaterThan(0.5)
  })

  it('closes slower than it opens, so it does not flicker between syllables', () => {
    // The single thing that most makes amplitude-driven lips look mechanical is
    // a mouth that snaps shut in every inter-syllable dip.
    const m = new FaceMotion({ random: seeded() })
    run(m, 0.5, 1)
    const closing = run(m, 0.06, 0)
    expect(closing[closing.length - 1].mouthOpen).toBeGreaterThan(0.4)
  })

  it('rides a syllable-rate signal without chattering shut', () => {
    const m = new FaceMotion({ random: seeded() })
    // ~5Hz syllables, the rate of ordinary speech.
    const frames = run(m, 2, t => (Math.sin(t * Math.PI * 2 * 5) > 0 ? 0.9 : 0.05))
    const settled = frames.slice(60)
    expect(Math.min(...settled.map(f => f.mouthOpen))).toBeGreaterThan(0.05)
    expect(Math.max(...settled.map(f => f.mouthOpen))).toBeGreaterThan(0.6)
  })

  it('clamps out-of-range levels', () => {
    const m = new FaceMotion({ random: seeded() })
    const frames = run(m, 1, 5)
    expect(frames[frames.length - 1].mouthOpen).toBeLessThanOrEqual(1)
  })
})

describe('frame-rate independence', () => {
  it('produces the same breathing phase at 30fps and 120fps', () => {
    // A 120Hz display and a throttled tab must behave the same.
    const at = (fps: number) => {
      const m = new FaceMotion({ random: seeded() })
      const dt = 1 / fps
      let last = 0
      for (let t = 0; t < 5; t += dt) last = m.advance(dt).breathe
      return last
    }
    expect(Math.abs(at(30) - at(120))).toBeLessThan(0.05)
  })

  it('does not fast-forward through blinks after a backgrounded tab', () => {
    // A hidden tab hands back a multi-second dt. Without clamping, the face
    // would burn through several blinks the instant it became visible.
    const m = new FaceMotion({ random: seeded() })
    const frames = [m.advance(30), m.advance(1 / 60)]
    expect(Math.max(...frames.map(f => f.blink))).toBeLessThanOrEqual(1)
    const after = run(m, 10)
    expect(countBlinks(after)).toBeLessThan(8)
  })
})

describe('rig selection', () => {
  it('prefers anchors measured for that exact image over the set default', () => {
    // Per-set anchors were tried first and were not good enough: the `women`
    // set alone spans an eye line from 0.337 to 0.411 of image height, and at
    // the wrong end of that range the mouth shadow lands on the chin.
    const a = rigForAvatar('/avatars/women_07.png')
    const b = rigForAvatar('/avatars/women_21.png')
    expect(a.eyeY).not.toBe(b.eyeY)
    expect(Math.abs(a.eyeY - b.eyeY)).toBeGreaterThan(0.03)
  })

  it('derives every anchor from the measured eyes', () => {
    const rig = rigForAvatar('/avatars/men_00.png')
    // Cross-checked against a hand-measured mouth on this exact image (0.535).
    expect(rig.mouthY).toBeGreaterThan(0.52)
    expect(rig.mouthY).toBeLessThan(0.55)
    expect(rig.eyeY).toBeGreaterThan(0.36)
    expect(rig.eyeY).toBeLessThan(0.39)
  })

  it('falls back to the set default for an avatar with no anchors', () => {
    // Haar detects 1 of 45 robots, which is expected — many have visors,
    // lenses, or no face at all.
    expect(rigForAvatar('/avatars/robots_03.png')).toBe(FACE_RIGS.robots)
  })

  it('falls back rather than refusing to animate an unknown avatar', () => {
    // A slightly misplaced jaw band on a stranger's photo beats a frozen face,
    // and the warp is soft enough to survive being wrong.
    expect(rigForAvatar('https://example.com/me.jpg')).toBe(DEFAULT_FACE_RIG)
    expect(rigForAvatar(null)).toBe(DEFAULT_FACE_RIG)
    expect(rigForAvatar('🤖')).toBe(DEFAULT_FACE_RIG)
  })

  it('keeps every rig inside the image and anatomically ordered', () => {
    for (const rig of Object.values(FACE_RIGS)) {
      // eyes above the jaw hinge, hinge above the mouth. Getting this order
      // wrong inverts the warp and the chin travels upward.
      expect(rig.eyeY).toBeLessThan(rig.jawTop)
      expect(rig.jawTop).toBeLessThan(rig.mouthY)
      expect(rig.mouthWidth).toBeGreaterThan(0)
      expect(rig.mouthWidth).toBeLessThan(1)
      for (const v of [rig.mouthY, rig.mouthX, rig.eyeY, rig.jawTop]) {
        expect(v).toBeGreaterThan(0)
        expect(v).toBeLessThan(1)
      }
    }
  })

  it('scales every feature with inter-ocular distance', () => {
    // IOD is the anthropometric scale and, crucially, is invariant to how
    // tightly a portrait is cropped — the exact variable that broke per-set
    // anchors. A face at twice the scale must produce twice the offsets.
    const small = rigFromAnchors(0.5, 0.35, 0.10)
    const large = rigFromAnchors(0.5, 0.35, 0.20)
    expect(large.mouthY - large.eyeY).toBeCloseTo((small.mouthY - small.eyeY) * 2, 6)
    expect(large.mouthWidth).toBeCloseTo(small.mouthWidth * 2, 6)
    expect(large.eyeWidth).toBeCloseTo(small.eyeWidth * 2, 6)
  })

  it('keeps the mouth about one IOD below the eyes', () => {
    // Measured: (mouthY - eyeY) / IOD came out 1.06, 0.99, 1.09, 1.03 across
    // four faces spanning the framing range.
    const rig = rigFromAnchors(0.5, 0.37, 0.15)
    expect((rig.mouthY - rig.eyeY) / 0.15).toBeGreaterThan(0.95)
    expect((rig.mouthY - rig.eyeY) / 0.15).toBeLessThan(1.15)
  })

  it('damps the jaw warp for rigid faces', () => {
    // Skin deforms, brushed aluminium does not. Several robot avatars have a
    // fixed grille or a visor and no mouth at all, and stretching a rigid
    // faceplate reads as a rendering bug rather than as speech.
    expect(FACE_RIGS.robots.jawScale).toBeLessThan(FACE_RIGS.men.jawScale)
    expect(FACE_RIGS.robots.jawScale).toBeGreaterThan(0)
    expect(FACE_RIGS.men.jawScale).toBe(1)
    expect(FACE_RIGS.women.jawScale).toBe(1)
  })
})

describe('agent status → face activity', () => {
  it('treats a blocked agent as waiting, so it looks at you', () => {
    expect(activityForAgentStatus('permission_request', true)).toBe('waiting')
    expect(activityForAgentStatus('waiting_for_input', true)).toBe('waiting')
  })

  it('maps working states to active', () => {
    expect(activityForAgentStatus('active', true)).toBe('active')
    expect(activityForAgentStatus('running', true)).toBe('active')
  })

  it('offline beats every other status', () => {
    expect(activityForAgentStatus('active', false)).toBe('offline')
    expect(activityForAgentStatus('permission_request', false)).toBe('offline')
  })

  it('falls back to idle for an unknown status', () => {
    expect(activityForAgentStatus('something-new', true)).toBe('idle')
    expect(activityForAgentStatus(null, true)).toBe('idle')
  })
})
