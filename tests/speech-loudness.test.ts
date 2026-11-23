import { describe, it, expect } from 'vitest'
// @ts-expect-error plain ESM module
import { louder } from '../lib/speech-loudness.mjs'
// @ts-expect-error plain ESM module
import { wavFrom } from '../lib/speech-elevenlabs.mjs'

// Speech-like: syllables of a few tones, loud and quiet, with pauses; average far below the peaks
function speech(seconds = 3, rate = 24000) {
  const pcm = Buffer.alloc(seconds * rate * 2)
  for (let i = 0; i < seconds * rate; i++) {
    const t = i / rate, syllable = Math.floor(t / 0.25)
    const amp = [0.5, 0.02, 0.08, 0, 0.3, 0.01, 0.04, 0][syllable % 8]
    const v = amp * Math.sin(2 * Math.PI * (400 + 80 * (syllable % 3)) * t) * (0.6 + 0.4 * Math.sin(2 * Math.PI * 900 * t))
    pcm.writeInt16LE(Math.round(v * 32767), i * 2)
  }
  return wavFrom(pcm)
}
const levels = (wav: Buffer) => {
  let peak = 0, sum = 0
  const n = (wav.length - 44) / 2
  for (let i = 0; i < n; i++) {
    const v = wav.readInt16LE(44 + 2 * i) / 32768
    peak = Math.max(peak, Math.abs(v))
    sum += v * v
  }
  return { peak: 20 * Math.log10(peak), rms: 10 * Math.log10(sum / n) }
}

describe('speech for small speakers (F131)', () => {
  it('is much louder on average and never above -1 dBFS', () => {
    const before = levels(speech()), after = levels(louder(speech()))
    expect(after.peak).toBeLessThanOrEqual(-0.99)
    expect(after.rms - before.rms).toBeGreaterThan(3) // steady test tones; real ElevenLabs speech gained about 7 dB
  })

  it('keeps the header and the length', () => {
    const wav = speech(1), out = louder(wav)
    expect(out.length).toBe(wav.length)
    expect(out.subarray(0, 44).equals(wav.subarray(0, 44))).toBe(true)
  })

  it('leaves silence silent and anything that is not 16-bit mono PCM unchanged', () => {
    const silent = wavFrom(Buffer.alloc(24000 * 2))
    expect(levels(louder(silent)).peak).toBe(-Infinity)
    const stereo = Buffer.from(speech(1)); stereo.writeUInt16LE(2, 22)
    expect(louder(stereo)).toBe(stereo)
    const junk = Buffer.from('not a wav at all, just some bytes here for the test')
    expect(louder(junk)).toBe(junk)
  })
})
