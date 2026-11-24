import { describe, it, expect } from 'vitest'
import { downsample, encodeWav, toBase64 } from '@/lib/wav-encode'

describe('dashboard voice recording: WAV for the speaker model', () => {
  it('downsamples 48 kHz to 16 kHz by averaging', () => {
    const out = downsample(new Float32Array([0, 0.3, 0.6, 0.3, 0.3, 0.3]), 48000)
    expect(out.length).toBe(2)
    expect(out[0]).toBeCloseTo(0.3)
    expect(out[1]).toBeCloseTo(0.3)
  })

  it('writes a 16 kHz, mono, 16-bit PCM WAV, clipping out-of-range samples', () => {
    const wav = Buffer.from(encodeWav(new Float32Array([0, 1, -1, 2])))
    expect(wav.toString('ascii', 0, 4)).toBe('RIFF')
    expect(wav.toString('ascii', 8, 16)).toBe('WAVEfmt ')
    expect(wav.readUInt16LE(20)).toBe(1)
    expect(wav.readUInt16LE(22)).toBe(1)
    expect(wav.readUInt32LE(24)).toBe(16000)
    expect(wav.readUInt16LE(34)).toBe(16)
    expect(wav.readUInt32LE(40)).toBe(8)
    expect([0, 1, 2, 3].map(i => wav.readInt16LE(44 + i * 2))).toEqual([0, 32767, -32768, 32767])
    expect(Buffer.from(toBase64(new Uint8Array(wav)), 'base64').equals(wav)).toBe(true)
  })
})
