/**
 * Avatar motion model — what makes an agent look alive on a call.
 *
 * Deliberately pure: `advance()` takes a delta and returns numbers. No DOM, no
 * canvas, no timers. The renderer owns pixels, this owns behaviour, and the
 * behaviour is the part worth testing — a mouth that opens is easy, a face that
 * doesn't look dead between sentences is not.
 *
 * The mouth is the smaller half of the problem. A still photo with a perfectly
 * synced mouth still reads as a corpse, because humans key on blink cadence and
 * micro-motion long before they inspect lips. So idle life comes first here and
 * runs whether or not anything is speaking.
 *
 * Everything is delta-time driven, never frame-counted: a 120Hz display and a
 * throttled background tab must produce the same behaviour at different sample
 * rates, and a dropped frame must not skip a blink.
 */

import { AVATAR_ANCHORS } from '@/lib/avatar-rigs.generated'

/** What the agent is doing. Drives posture, gaze and blink cadence. */
export type FaceActivity = 'idle' | 'active' | 'thinking' | 'waiting' | 'offline'

/**
 * Where the features sit in a given avatar image, in normalised 0..1
 * coordinates.
 *
 * These vary by avatar set — the `men` renders are framed tighter than `women`
 * and `robots`, which carry a border — so the rig is per-set with a per-avatar
 * override, rather than one global guess. Imprecision here is survivable by
 * design: the renderer warps a soft band, so an anchor a few percent off still
 * reads as talking. A hard-edged mouth sprite in the same position would read
 * as broken, which is the main reason this approach was chosen over sprites.
 */
export interface FaceRig {
  /** Vertical centre of the mouth. */
  mouthY: number
  /** Horizontal centre of the mouth. */
  mouthX: number
  /** Mouth width, as a fraction of image width. */
  mouthWidth: number
  /** Vertical centre of the eyes — where the lids close. */
  eyeY: number
  /**
   * Centre-to-centre distance between the eyes, as a fraction of image width.
   *
   * Blinking needs this because a lid drawn across the FULL width smears a strip
   * of forehead over the hair, the ears and the background — which is what the
   * first render actually did, and it looked like a video glitch rather than a
   * blink. Lids are drawn only over the eyes.
   */
  eyeSeparation: number
  /** Width of one eye, as a fraction of image width. */
  eyeWidth: number
  /**
   * Top of the moving jaw. Everything above this is rigid; below it is
   * displaced when the mouth opens. Placing it just under the nose keeps the
   * nose and eyes still, which is what stops a jaw drop from looking like the
   * whole face is melting.
   */
  jawTop: number
  /**
   * How much of the jaw warp this set can carry, 0..1.
   *
   * Skin deforms; brushed aluminium does not. Calibrating against the shipped
   * renders showed the robot set is far more varied than the human ones — some
   * faces have a hinged jaw, others a fixed grille or a visor and no mouth at
   * all — and stretching a rigid faceplate reads as a rendering bug rather than
   * as speech. Robots therefore get a damped warp and lean on the inner-mouth
   * shadow and head motion instead, which stay believable on a face that
   * physically cannot open.
   */
  jawScale: number
}

/**
 * Per-set defaults, measured off the shipped renders rather than guessed.
 *
 * Method: overlay a 5% ruler on four samples per set and read the eye line,
 * nose base and mouth. The human sets came back tight enough that one rig
 * serves the whole set; the robot set did not, which is why it is damped.
 */
export const FACE_RIGS: Record<string, FaceRig> = {
  men: { mouthY: 0.55, mouthX: 0.5, mouthWidth: 0.16, eyeY: 0.38, eyeSeparation: 0.16, eyeWidth: 0.105, jawTop: 0.50, jawScale: 1 },
  women: { mouthY: 0.56, mouthX: 0.5, mouthWidth: 0.14, eyeY: 0.41, eyeSeparation: 0.155, eyeWidth: 0.10, jawTop: 0.515, jawScale: 1 },
  // Robots are measured by hand: Haar detects 1 of 45, which is expected —
  // many have visors, lenses, or no face at all. Their eyes also sit much
  // further apart than a human's, so a wider lid is needed to cover the lens.
  robots: { mouthY: 0.545, mouthX: 0.5, mouthWidth: 0.22, eyeY: 0.365, eyeSeparation: 0.29, eyeWidth: 0.14, jawTop: 0.485, jawScale: 0.55 },
}

/** Fallback for an avatar we have no rig for (uploaded image, unknown set). */
export const DEFAULT_FACE_RIG: FaceRig = FACE_RIGS.men

/**
 * Anthropometric ratios, all relative to INTER-OCULAR DISTANCE.
 *
 * IOD is the scale every other facial measurement is quoted against, and
 * crucially it is invariant to how tightly a portrait is cropped — which is
 * exactly the variable that broke the first attempt at per-set anchors.
 *
 * Validated against hand-measured mouths on four faces spanning the framing
 * range: (mouthY - eyeY) / IOD came out 1.06, 0.99, 1.09 and 1.03. The derived
 * mouth positions land within one percent of the measured ones.
 */
const MOUTH_BELOW_EYES = 1.04
/** Nose base, which is where the jaw hinge is placed. */
const NOSE_BELOW_EYES = 0.72
/**
 * Lip width ≈ IOD is the standard proportion, but this drives the DARK OPENING,
 * which is much narrower than the lips. Rendering it at full lip width produced
 * a cartoon gaping "O" rather than a mouth.
 */
const MOUTH_WIDTH_IOD = 0.62
/**
 * Lid width. Sized to over-cover: a lid slightly larger than the eye reads as a
 * closed eye, whereas one slightly smaller leaves a sliver of iris showing and
 * reads as a broken render — which is exactly what 0.42 did.
 */
const EYE_WIDTH_IOD = 0.56

/** Build a rig from measured eye anchors. */
export function rigFromAnchors(eyeX: number, eyeY: number, iod: number, jawScale = 1): FaceRig {
  return {
    mouthX: eyeX,
    mouthY: eyeY + MOUTH_BELOW_EYES * iod,
    mouthWidth: MOUTH_WIDTH_IOD * iod,
    eyeY,
    eyeSeparation: iod,
    eyeWidth: EYE_WIDTH_IOD * iod,
    jawTop: eyeY + NOSE_BELOW_EYES * iod,
    jawScale,
  }
}

/**
 * Pick a rig for an avatar.
 *
 * Order: measured anchors for this exact image, then the set default, then the
 * global default.
 *
 * The per-image table exists because per-set anchors were not good enough. The
 * `women` set alone spans an eye line from 0.337 to 0.411 of image height, and
 * at the wrong end of that range the mouth shadow lands on the chin and the
 * eyelids draw below the eyes. That is not a subtle degradation — it looks
 * broken — and softening the warp does not hide it.
 *
 * Unknown avatars still animate rather than freezing: a slightly misplaced jaw
 * band on a stranger's uploaded photo is a much better failure than a dead
 * face, and the soft warp survives being a few percent out.
 */
export function rigForAvatar(avatarUrl: string | null | undefined): FaceRig {
  if (!avatarUrl) return DEFAULT_FACE_RIG
  const match = /\/avatars\/(([a-z]+)_\d+\.(?:png|jpg|jpeg|webp))$/i.exec(avatarUrl)
  if (!match) return DEFAULT_FACE_RIG

  const [, file, rawSet] = match
  const set = rawSet.toLowerCase()
  const anchors = AVATAR_ANCHORS[file]
  if (anchors) {
    return rigFromAnchors(anchors[0], anchors[1], anchors[2], FACE_RIGS[set]?.jawScale ?? 1)
  }
  return FACE_RIGS[set] || DEFAULT_FACE_RIG
}

/** Everything the renderer needs for one frame. All values are 0..1 or -1..1. */
export interface FaceFrame {
  /** 0 = eyes open, 1 = fully closed. */
  blink: number
  /** 0 = closed, 1 = widest. Drives the jaw band and the inner-mouth shadow. */
  mouthOpen: number
  /** Chest/shoulder rise, -1..1. */
  breathe: number
  /** Head offset as a fraction of image size, -1..1. */
  swayX: number
  swayY: number
  /** Head roll, -1..1, scaled to a couple of degrees by the renderer. */
  tilt: number
  /** Eye offset, -1..1. Gaze away reads as thought; gaze to camera as attention. */
  gazeX: number
  gazeY: number
  /** 0..1 overall liveliness. The renderer fades saturation with it when offline. */
  presence: number
}

interface ActivityProfile {
  /** Seconds between blinks, before jitter. */
  blinkPeriod: number
  /** Breaths per minute. */
  breathRate: number
  /** Multiplier on sway amplitude. */
  swayScale: number
  /** Seconds between gaze saccades. 0 disables them. */
  saccadePeriod: number
  /** How far the gaze wanders. 0 keeps it locked on the camera. */
  gazeRange: number
  /** Bias applied to vertical gaze; negative looks up, which reads as thinking. */
  gazeBiasY: number
  presence: number
}

/**
 * Cadences chosen to be read, not measured.
 *
 * Resting human blink is roughly every 4s and breathing about 15/min; those are
 * the `idle` numbers. The others are deliberately exaggerated a little, because
 * a 96px avatar loses subtlety that a real face would carry.
 */
const PROFILES: Record<FaceActivity, ActivityProfile> = {
  idle: { blinkPeriod: 4.0, breathRate: 14, swayScale: 1.0, saccadePeriod: 5.0, gazeRange: 0.25, gazeBiasY: 0, presence: 1 },
  // Working: breathing a little quicker, eyes busier, more micro-motion.
  active: { blinkPeriod: 3.2, breathRate: 18, swayScale: 1.35, saccadePeriod: 2.6, gazeRange: 0.4, gazeBiasY: 0.1, presence: 1 },
  // Thinking: gaze drifts up and away, blinks slow down. This is the classic
  // "looking for the word" tell and it is the most legible of the four.
  thinking: { blinkPeriod: 5.5, breathRate: 12, swayScale: 0.7, saccadePeriod: 3.4, gazeRange: 0.55, gazeBiasY: -0.45, presence: 1 },
  // Blocked on the human: still, attentive, looking straight at the camera.
  waiting: { blinkPeriod: 3.6, breathRate: 15, swayScale: 0.45, saccadePeriod: 0, gazeRange: 0, gazeBiasY: 0, presence: 1 },
  // Offline: no life at all. Frozen and desaturated is honest; a breathing
  // avatar for an agent that is not running would be the same class of lie as
  // a delivery report nothing verified.
  offline: { blinkPeriod: 0, breathRate: 0, swayScale: 0, saccadePeriod: 0, gazeRange: 0, gazeBiasY: 0, presence: 0 },
}

/** Duration of one blink, eyes-open to eyes-open. */
const BLINK_DURATION = 0.14
/** How far a blink can land from its nominal period, as a fraction. */
const BLINK_JITTER = 0.55
/** Head sway amplitude as a fraction of image size, before the profile scale. */
const SWAY_AMPLITUDE = 0.012
const TILT_AMPLITUDE = 0.5
/** Seconds for the gaze to travel to a new target. */
const SACCADE_SPEED = 12

/**
 * Mouth envelope. Attack is near-instant because speech onsets are sharp;
 * release is slower so the mouth does not flicker shut between syllables, which
 * is the single thing that most makes amplitude-driven lips look mechanical.
 */
const MOUTH_ATTACK = 45
const MOUTH_RELEASE = 9

export interface FaceMotionOptions {
  /** Injected for deterministic tests. Defaults to Math.random. */
  random?: () => number
}

/**
 * Stateful motion driver. One per rendered face.
 *
 * Usage: construct, call `setActivity()` when the agent's state changes, feed
 * `advance(dt, level)` from a rAF loop, hand the result to the renderer.
 */
export class FaceMotion {
  private t = 0
  private blinkTimer: number
  private blinkPhase = -1
  private mouth = 0
  private gazeX = 0
  private gazeY = 0
  private targetGazeX = 0
  private targetGazeY = 0
  private saccadeTimer: number
  private activity: FaceActivity = 'idle'
  private random: () => number

  constructor(options: FaceMotionOptions = {}) {
    this.random = options.random ?? Math.random
    this.blinkTimer = this.nextBlinkDelay()
    this.saccadeTimer = this.nextSaccadeDelay()
  }

  setActivity(activity: FaceActivity): void {
    if (activity === this.activity) return
    const wasFrozen = PROFILES[this.activity].blinkPeriod <= 0
    this.activity = activity
    const isFrozen = PROFILES[activity].blinkPeriod <= 0

    if (isFrozen) {
      // Freeze now, including any blink already in flight. Letting the current
      // one finish would show a face that closes its eyes after going offline.
      this.blinkPhase = -1
      this.blinkTimer = Infinity
      this.mouth = 0
    } else if (wasFrozen || !Number.isFinite(this.blinkTimer)) {
      // Coming back from a frozen state, the timer is Infinity and would never
      // fire again — the face would return "online" and then never blink for
      // the rest of the session.
      this.blinkTimer = this.nextBlinkDelay()
    }

    // Re-aim immediately so a state change reads at once rather than waiting out
    // the current saccade timer. Attention should look prompt.
    this.saccadeTimer = 0
  }

  getActivity(): FaceActivity {
    return this.activity
  }

  private profile(): ActivityProfile {
    return PROFILES[this.activity]
  }

  private nextBlinkDelay(): number {
    const period = PROFILES[this.activity]?.blinkPeriod ?? PROFILES.idle.blinkPeriod
    if (period <= 0) return Infinity
    // Uniform jitter around the nominal period. Evenly spaced blinks are
    // instantly readable as a machine.
    return period * (1 - BLINK_JITTER + this.random() * BLINK_JITTER * 2)
  }

  private nextSaccadeDelay(): number {
    const period = PROFILES[this.activity]?.saccadePeriod ?? PROFILES.idle.saccadePeriod
    if (period <= 0) return Infinity
    return period * (0.5 + this.random())
  }

  /**
   * Advance the model.
   *
   * @param dt     seconds since the last frame
   * @param level  0..1 speech energy, or 0 when silent
   */
  advance(dt: number, level = 0): FaceFrame {
    // Clamp the step. A backgrounded tab can hand us a multi-second dt, and
    // without this the face would fast-forward through several blinks the
    // instant it becomes visible again.
    const step = Math.max(0, Math.min(dt, 0.1))
    const p = this.profile()
    this.t += step

    // ── Blink ──
    let blink = 0
    if (this.blinkPhase >= 0) {
      this.blinkPhase += step
      if (this.blinkPhase >= BLINK_DURATION) {
        this.blinkPhase = -1
        this.blinkTimer = this.nextBlinkDelay()
      } else {
        // Triangle: shut fast, open fast, no dwell. A sine here reads as a
        // slow sleepy blink.
        const half = BLINK_DURATION / 2
        blink = this.blinkPhase < half
          ? this.blinkPhase / half
          : 1 - (this.blinkPhase - half) / half
      }
    } else {
      this.blinkTimer -= step
      if (this.blinkTimer <= 0) this.blinkPhase = 0
    }

    // ── Breathing ──
    const breathe = p.breathRate > 0
      ? Math.sin((this.t * p.breathRate * Math.PI * 2) / 60)
      : 0

    // ── Sway ──
    // Two incommensurable frequencies per axis, so the loop never visibly
    // repeats. A single sine reads as a metronome within a few seconds.
    const swayX = (Math.sin(this.t * 0.37) * 0.6 + Math.sin(this.t * 0.23) * 0.4) * p.swayScale
    const swayY = (Math.sin(this.t * 0.29) * 0.5 + Math.sin(this.t * 0.19) * 0.5) * p.swayScale
    const tilt = Math.sin(this.t * 0.31) * p.swayScale

    // ── Gaze ──
    if (p.gazeRange > 0) {
      this.saccadeTimer -= step
      if (this.saccadeTimer <= 0) {
        this.targetGazeX = (this.random() * 2 - 1) * p.gazeRange
        this.targetGazeY = (this.random() * 2 - 1) * p.gazeRange * 0.6 + p.gazeBiasY
        this.saccadeTimer = this.nextSaccadeDelay()
      }
    } else {
      // Locked on the camera.
      this.targetGazeX = 0
      this.targetGazeY = p.gazeBiasY
    }
    // Saccades are ballistic — snap toward the target rather than easing, which
    // is how real eyes move.
    const gazeStep = Math.min(1, SACCADE_SPEED * step)
    this.gazeX += (this.targetGazeX - this.gazeX) * gazeStep
    this.gazeY += (this.targetGazeY - this.gazeY) * gazeStep

    // ── Mouth ──
    const target = Math.max(0, Math.min(1, level))
    const rate = target > this.mouth ? MOUTH_ATTACK : MOUTH_RELEASE
    this.mouth += (target - this.mouth) * Math.min(1, rate * step)
    if (this.mouth < 0.002) this.mouth = 0

    return {
      blink,
      mouthOpen: this.mouth,
      breathe,
      swayX: swayX * SWAY_AMPLITUDE,
      swayY: swayY * SWAY_AMPLITUDE,
      tilt: tilt * TILT_AMPLITUDE,
      gazeX: this.gazeX,
      gazeY: this.gazeY,
      presence: p.presence,
    }
  }
}

/**
 * Map the agent state the dashboard already computes onto a face activity.
 *
 * This is the whole reason the face can be more than decoration: the app
 * already knows whether an agent is working, blocked on a permission prompt, or
 * asleep, and until now spent that knowledge on a border glow.
 */
export function activityForAgentStatus(
  status: string | null | undefined,
  isOnline: boolean
): FaceActivity {
  if (!isOnline) return 'offline'
  switch (status) {
    case 'permission_request':
    case 'waiting_for_input':
      return 'waiting'
    case 'active':
    case 'running':
      return 'active'
    case 'thinking':
      return 'thinking'
    default:
      return 'idle'
  }
}
