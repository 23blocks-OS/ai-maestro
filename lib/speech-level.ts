/**
 * Speech energy → a number the face can be driven by.
 *
 * Two sources, and the difference between them is not a detail:
 *
 *   analysed  — a Web Audio AnalyserNode tapping the real <audio> element.
 *               The mouth moves with the actual waveform.
 *   synthetic — a plausible speech envelope generated from nothing.
 *               Used only when the provider cannot supply audio at all.
 *
 * `web-speech` is the reason the second mode exists. SpeechSynthesis renders
 * straight to the output device and exposes no stream, so there is nothing to
 * analyse — the choice is a synthetic envelope or a frozen mouth. The mode is
 * reported rather than hidden, because a synthetic mouth is an animation and an
 * analysed one is a measurement, and callers deserve to know which they have.
 *
 * DOM-free maths lives here so it can be tested; the React wiring is in
 * hooks/useSpeechLevel.ts.
 */

/** Where a level came from. Never collapse these into one number silently. */
export type SpeechLevelMode = 'analysed' | 'synthetic' | 'silent'

/**
 * Root-mean-square of a time-domain buffer, normalised to roughly 0..1.
 *
 * RMS rather than peak: peak jumps on every transient and produces a mouth that
 * twitches, where RMS tracks perceived loudness, which is what a jaw follows.
 *
 * @param samples time-domain samples in -1..1 (AnalyserNode float output)
 */
export function rms(samples: ArrayLike<number>): number {
  if (samples.length === 0) return 0
  let sum = 0
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i]
  return Math.sqrt(sum / samples.length)
}

/**
 * Map RMS onto mouth opening.
 *
 * Speech RMS sits far below 1.0 — normal speech lands around 0.05–0.25 — so
 * feeding it straight to the mouth produces a barely-parted lip. The curve
 * below applies a noise gate, then a gain, then a soft knee.
 *
 * The gate matters more than the gain: room tone and codec noise sit just above
 * zero, and without a floor the mouth hums open during silence, which reads as
 * a face chewing.
 */
export const SPEECH_NOISE_FLOOR = 0.012
export const SPEECH_GAIN = 13.5

export function levelFromRms(value: number): number {
  if (value <= SPEECH_NOISE_FLOOR) return 0
  const gated = (value - SPEECH_NOISE_FLOOR) * SPEECH_GAIN
  // Soft knee that asymptotes to 1 and never reaches it.
  //
  // The obvious form, `min(1, g / (1 + g * k))`, is a trap: with k < 1 the
  // curve crosses 1 at a finite input and everything above it CLIPS. At k=0.45
  // that happened at 0.36 RMS — ordinary loud speech — so every syllable above
  // conversational volume pinned the jaw fully open and held it there, losing
  // exactly the detail the mouth is supposed to show. `g / (1 + g)` approaches
  // 1 asymptotically, so the curve stays monotonic at any input.
  return gated / (1 + gated)
}

/**
 * A believable speech envelope for providers that give us no audio.
 *
 * Ordinary speech runs about 4–6 syllables per second. Two detuned oscillators
 * at that rate, plus a slow amplitude drift for phrasing, gives something that
 * reads as talking without pretending to be synchronised with anything. It is
 * an animation, and it is labelled as one.
 *
 * @param t seconds since this utterance started
 */
export function syntheticLevel(t: number): number {
  const syllable = Math.sin(t * Math.PI * 2 * 4.7)
  const detune = Math.sin(t * Math.PI * 2 * 3.1 + 1.3)
  // Fold to positive: a mouth cannot open negatively, and rectifying rather
  // than offsetting keeps the closures between syllables.
  const carrier = Math.abs(syllable * 0.65 + detune * 0.35)
  // Phrase-level swell so it does not sound like a machine gun.
  const phrase = 0.72 + 0.28 * Math.sin(t * Math.PI * 2 * 0.31)
  return Math.min(1, carrier * phrase)
}
