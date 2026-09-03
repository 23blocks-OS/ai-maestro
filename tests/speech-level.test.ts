/**
 * Tests for lib/speech-level.ts — turning audio into a number a jaw can follow.
 *
 * The curve matters more than it looks. Speech RMS sits around 0.05–0.25, so a
 * naive pass-through gives a barely-parted lip; and without a noise floor, room
 * tone and codec hiss hold the mouth slightly open through every silence, which
 * reads as a face chewing rather than a face listening.
 */

import { describe, it, expect } from 'vitest'
import {
  rms,
  levelFromRms,
  syntheticLevel,
  SPEECH_NOISE_FLOOR,
} from '@/lib/speech-level'

/** A sine at a given amplitude — a stand-in for a steady vowel. */
function tone(amplitude: number, samples = 1024) {
  return Array.from({ length: samples }, (_, i) => amplitude * Math.sin((i / samples) * Math.PI * 2 * 8))
}

describe('rms', () => {
  it('is zero for silence', () => {
    expect(rms(new Float32Array(512))).toBe(0)
  })

  it('is the classic 1/√2 of amplitude for a sine', () => {
    expect(rms(tone(1))).toBeCloseTo(1 / Math.SQRT2, 2)
  })

  it('ignores sign — a jaw cannot open negatively', () => {
    expect(rms([-0.5, 0.5, -0.5, 0.5])).toBeCloseTo(0.5, 6)
  })

  it('handles an empty buffer rather than dividing by zero', () => {
    expect(rms([])).toBe(0)
  })

  it('tracks perceived loudness, not transients', () => {
    // One loud spike in an otherwise quiet buffer must not open the mouth as
    // much as sustained speech does. Peak detection would; RMS does not.
    const spike = new Array(1024).fill(0.01)
    spike[500] = 1
    expect(rms(spike)).toBeLessThan(rms(tone(0.2)))
  })
})

describe('levelFromRms', () => {
  it('gates out silence and room tone', () => {
    expect(levelFromRms(0)).toBe(0)
    expect(levelFromRms(SPEECH_NOISE_FLOOR)).toBe(0)
    expect(levelFromRms(SPEECH_NOISE_FLOOR * 0.9)).toBe(0)
  })

  it('opens the mouth usefully at ordinary speech levels', () => {
    // The whole point of the gain: 0.12 RMS is normal conversational speech and
    // must produce a clearly open mouth, not a 12% twitch.
    const level = levelFromRms(0.12)
    expect(level).toBeGreaterThan(0.35)
    expect(level).toBeLessThan(1)
  })

  it('is monotonic', () => {
    let previous = -1
    for (let v = 0; v <= 1; v += 0.02) {
      const level = levelFromRms(v)
      expect(level).toBeGreaterThanOrEqual(previous)
      previous = level
    }
  })

  it('never exceeds a fully open mouth', () => {
    expect(levelFromRms(1)).toBeLessThanOrEqual(1)
    expect(levelFromRms(50)).toBeLessThanOrEqual(1)
  })

  it('compresses the top so shouts do not pin the jaw open', () => {
    // Without the soft knee, everything above a moderate level saturates and
    // all the detail between syllables is lost.
    const loud = levelFromRms(0.4)
    const louder = levelFromRms(0.8)
    expect(louder).toBeGreaterThan(loud)
    expect(louder - loud).toBeLessThan(0.25)
  })
})

describe('syntheticLevel — the honest fallback', () => {
  // Used only when the provider gives us no audio to analyse. web-speech
  // renders straight to the output device and exposes no stream, so the choice
  // there is a plausible envelope or a frozen mouth.

  it('stays in range', () => {
    for (let t = 0; t < 10; t += 0.01) {
      const v = syntheticLevel(t)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
    }
  })

  it('moves at a syllable rate rather than a hum', () => {
    // Count peaks over a second; ordinary speech is 4–6 syllables/sec.
    let peaks = 0
    let rising = false
    let previous = syntheticLevel(0)
    for (let t = 0.005; t < 1; t += 0.005) {
      const v = syntheticLevel(t)
      if (v > previous && !rising) rising = true
      else if (v < previous && rising) { peaks++; rising = false }
      previous = v
    }
    expect(peaks).toBeGreaterThanOrEqual(3)
    expect(peaks).toBeLessThanOrEqual(12)
  })

  it('actually closes between syllables', () => {
    // A mouth that only ever varies between half and fully open looks like
    // chewing, not speech.
    const samples = Array.from({ length: 400 }, (_, i) => syntheticLevel(i * 0.01))
    expect(Math.min(...samples)).toBeLessThan(0.15)
    expect(Math.max(...samples)).toBeGreaterThan(0.7)
  })

  it('does not repeat on a short obvious loop', () => {
    // Two detuned oscillators, so the pattern should not be identical one
    // second apart — a visible loop is what gives a fake envelope away.
    const a = Array.from({ length: 100 }, (_, i) => syntheticLevel(i * 0.01))
    const b = Array.from({ length: 100 }, (_, i) => syntheticLevel(1 + i * 0.01))
    const diff = a.reduce((acc, v, i) => acc + Math.abs(v - b[i]), 0)
    expect(diff).toBeGreaterThan(1)
  })

  it('is deterministic, so it can be reasoned about', () => {
    expect(syntheticLevel(1.234)).toBe(syntheticLevel(1.234))
  })
})
