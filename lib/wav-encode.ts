/**
 * Microphone samples (Float32, the browser's rate) to the WAV the speaker model takes: 16 kHz, mono, 16-bit
 * (scripts/voice/serve.py). Used by voice enrollment in the dashboard.
 */
export const SAMPLE_RATE = 16000

/** Down to 16 kHz by averaging each output sample's span of input: a box filter, enough for speech */
export function downsample(input: Float32Array, fromRate: number, toRate = SAMPLE_RATE): Float32Array {
  if (fromRate === toRate) return input
  const ratio = fromRate / toRate
  const out = new Float32Array(Math.floor(input.length / ratio))
  for (let i = 0; i < out.length; i++) {
    const start = Math.floor(i * ratio), end = Math.min(input.length, Math.floor((i + 1) * ratio))
    let sum = 0
    for (let j = start; j < end; j++) sum += input[j]
    out[i] = end > start ? sum / (end - start) : 0
  }
  return out
}

/** 16-bit PCM WAV bytes */
export function encodeWav(samples: Float32Array, rate = SAMPLE_RATE): Uint8Array {
  const bytes = new Uint8Array(44 + samples.length * 2)
  const v = new DataView(bytes.buffer)
  const text = (at: number, s: string) => { for (let i = 0; i < s.length; i++) bytes[at + i] = s.charCodeAt(i) }
  text(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); text(8, 'WAVEfmt ')
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true)
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true)
  text(36, 'data'); v.setUint32(40, samples.length * 2, true)
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }
  return bytes
}

export function toBase64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

/**
 * Records the computer's microphone until stop(). level() is 0..1 for a meter. The browser asks the person for
 * the microphone the first time; it works only on localhost or HTTPS.
 */
export async function startRecording(): Promise<{ level: () => number; stop: () => Promise<string>; cancel: () => void }> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('This browser gives no microphone here. Open AI Maestro at http://localhost:23000 on this computer, or over HTTPS')
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1 } })
  const ctx = new AudioContext()
  const source = ctx.createMediaStreamSource(stream)
  const analyser = ctx.createAnalyser()
  analyser.fftSize = 1024
  // shortcut: ScriptProcessorNode is deprecated but needs no worklet file; move to an AudioWorklet if it is removed
  const tap = ctx.createScriptProcessor(4096, 1, 1)
  const chunks: Float32Array[] = []
  tap.onaudioprocess = (e) => { chunks.push(new Float32Array(e.inputBuffer.getChannelData(0))) }
  source.connect(analyser)
  source.connect(tap)
  tap.connect(ctx.destination)
  const buf = new Float32Array(analyser.fftSize)
  const end = () => {
    tap.disconnect(); source.disconnect()
    stream.getTracks().forEach(t => t.stop())
    ctx.close().catch(() => {})
  }
  return {
    level: () => {
      analyser.getFloatTimeDomainData(buf)
      let sum = 0
      for (const x of buf) sum += x * x
      return Math.min(1, Math.sqrt(sum / buf.length) * 4)
    },
    stop: async () => {
      const rate = ctx.sampleRate
      end()
      const all = new Float32Array(chunks.reduce((n, c) => n + c.length, 0))
      let at = 0
      for (const c of chunks) { all.set(c, at); at += c.length }
      return toBase64(encodeWav(downsample(all, rate)))
    },
    cancel: end,
  }
}
