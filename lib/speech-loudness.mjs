/**
 * Speech for small speakers (backlog F131): low cut, compressor, limiter. A board's speaker is quiet and distorts
 * when its volume goes up; speech that is loud on average plays louder at the same volume. Measured on a XIAO with a
 * MAX98357A (2026-11-23): ElevenLabs speech went from -22.5 to about -15 dBFS on average, clean at the board's 12%.
 * The same chain as `highpass=180,acompressor=threshold=-30dB:ratio=6:attack=3:release=60:makeup=10,alimiter=0.89`
 * (ffmpeg's compressor follows the RMS level, and its makeup is a linear factor).
 */
const CUT_HZ = 180
const THRESHOLD_DB = -30
const RATIO = 6
const ATTACK_MS = 3
const RELEASE_MS = 60
const MAKEUP_DB = 20 // ffmpeg's makeup=10 is a linear factor: x10, +20 dB
const CEILING = 0.89 // -1 dBFS
const LOOKAHEAD_MS = 2
const LIMIT_RELEASE_MS = 40

/** Finds a chunk of a RIFF/WAVE buffer: its start and size, or null. */
function chunk(wav, id) {
  for (let at = 12; at + 8 <= wav.length; ) {
    const size = wav.readUInt32LE(at + 4)
    if (wav.toString('ascii', at, at + 4) === id) return at + 8 + size <= wav.length ? { at: at + 8, size } : null
    at += 8 + size + (size & 1)
  }
  return null
}

/** A louder copy of a 16-bit mono PCM WAV; anything else comes back unchanged. */
export function louder(wav) {
  if (wav.length < 44 || wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE') return wav
  const fmt = chunk(wav, 'fmt '), data = chunk(wav, 'data')
  if (!fmt || !data || fmt.size < 16) return wav
  const format = wav.readUInt16LE(fmt.at), channels = wav.readUInt16LE(fmt.at + 2)
  const rate = wav.readUInt32LE(fmt.at + 4), bits = wav.readUInt16LE(fmt.at + 14)
  if (format !== 1 || channels !== 1 || bits !== 16 || rate < 8000) return wav
  const n = Math.floor(data.size / 2)
  const x = new Float32Array(n)
  for (let i = 0; i < n; i++) x[i] = wav.readInt16LE(data.at + 2 * i) / 32768

  // Low cut: RBJ high-pass biquad, Q 0.707. A small speaker cannot play this range; it only uses up the headroom.
  const w = (2 * Math.PI * CUT_HZ) / rate, alpha = Math.sin(w) / (2 * Math.SQRT1_2), cos = Math.cos(w), a0 = 1 + alpha
  const b0 = (1 + cos) / 2 / a0, b1 = -(1 + cos) / a0, b2 = b0, a1 = (-2 * cos) / a0, a2 = (1 - alpha) / a0
  for (let i = 0, x1 = 0, x2 = 0, y1 = 0, y2 = 0; i < n; i++) {
    const y = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
    x2 = x1; x1 = x[i]; y2 = y1; y1 = y
    x[i] = y
  }

  // Compressor: an RMS envelope with attack and release; above the threshold, 6:1; then the makeup gain
  const att = Math.exp(-1 / ((ATTACK_MS / 1000) * rate)), rel = Math.exp(-1 / ((RELEASE_MS / 1000) * rate))
  for (let i = 0, env = 0; i < n; i++) {
    const power = x[i] * x[i]
    env = power > env ? att * env + (1 - att) * power : rel * env + (1 - rel) * power
    const over = 10 * Math.log10(env + 1e-12) - THRESHOLD_DB
    const gainDb = (over > 0 ? -over * (1 - 1 / RATIO) : 0) + MAKEUP_DB
    x[i] *= 10 ** (gainDb / 20)
  }

  // Limiter: the gain each sample needs to stay under the ceiling, the smallest over a short look ahead, released
  // slowly. The final clamp only catches rounding.
  const ahead = Math.max(1, Math.round((LOOKAHEAD_MS / 1000) * rate))
  const need = new Float32Array(n)
  for (let i = 0; i < n; i++) need[i] = Math.min(1, CEILING / (Math.abs(x[i]) + 1e-9))
  const lrel = 1 - Math.exp(-1 / ((LIMIT_RELEASE_MS / 1000) * rate))
  const out = Buffer.from(wav)
  for (let i = 0, g = 1; i < n; i++) {
    let low = need[i]
    for (let k = 1; k < ahead && i + k < n; k++) if (need[i + k] < low) low = need[i + k]
    g = Math.min(low, g + lrel * (1 - g))
    const v = Math.max(-CEILING, Math.min(CEILING, x[i] * g))
    out.writeInt16LE(Math.round(v * 32767), data.at + 2 * i)
  }
  return out
}
