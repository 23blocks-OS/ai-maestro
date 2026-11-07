/**
 * Speech from ElevenLabs (docs/SPEC-ELEVENLABS-VOICE.md). The host holds the key and asks for one sentence at a time.
 * It yields the same WAV as Kokoro, 16-bit mono at 24 kHz, so nothing after this file knows which engine spoke.
 */
import fs from 'fs'
import os from 'os'
import path from 'path'
import { getBackend } from './secret-vault.mjs'

const API = 'https://api.elevenlabs.io'
const MODEL = 'eleven_flash_v2_5' // a constant, not a setting: an agent sounds the same on every host
const RATE = 24000
const MAX_PCM = 8 * RATE * 2 // speaker.play takes 384 KiB: 8 s of 16-bit mono
const REQUEST_MS = 20_000
const KEY_MS = 60_000
export const KEY_NAME = 'ELEVENLABS_API_KEY'

/** Read from the vault at most once a minute, so a key added with aim-secret works with no restart. */
export async function elevenLabsKey() {
  const cached = globalThis._elevenLabsKey
  if (cached && Date.now() - cached.at < KEY_MS) return cached.value
  let value = null
  try {
    value = await getBackend().get(KEY_NAME)
  } catch (err) {
    console.error(`[Voice] Could not read ${KEY_NAME}: ${err.message}`)
  }
  globalThis._elevenLabsKey = { value, at: Date.now() }
  return value
}

export const splitSentences = (text) => text.trim().split(/(?<=[.!?…])\s+/).filter(Boolean)

export function wavFrom(pcm) {
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(pcm.length + 36, 4)
  header.write('WAVEfmt ', 8)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20) // PCM
  header.writeUInt16LE(1, 22) // mono
  header.writeUInt32LE(RATE, 24)
  header.writeUInt32LE(RATE * 2, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36)
  header.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([header, pcm])
}

async function request(url, init, fetcher, signal) {
  for (let attempt = 0; ; attempt++) {
    let res
    try {
      res = await fetcher(url, { ...init, signal: AbortSignal.any([signal, AbortSignal.timeout(REQUEST_MS)]) })
    } catch (err) {
      if (signal.aborted || attempt) throw new Error(`ElevenLabs did not answer: ${err.message}`)
      continue
    }
    if (res.ok) return res
    if (attempt || (res.status !== 429 && res.status < 500)) throw new Error(`ElevenLabs answered ${res.status}`)
  }
}

/**
 * Yields one WAV path per sentence, or several for a sentence over 8 s. It asks for the next sentence while one plays,
 * and never further: a person may interrupt, and audio nobody hears is still paid for. A failure carries `.rest`,
 * the text not yet spoken, so another engine can finish the reply.
 */
export async function* synthesize(text, voiceId, { getKey = elevenLabsKey, fetcher = fetch } = {}) {
  const key = await getKey()
  if (!key) throw Object.assign(new Error(`no ${KEY_NAME} on this host`), { rest: text })
  if (!voiceId) throw Object.assign(new Error('no ElevenLabs voice chosen'), { rest: text })
  const sentences = splitSentences(text)
  const stop = new AbortController()
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'aim-eleven-'))
  const ask = async (i) => {
    const res = await request(`${API}/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=pcm_${RATE}`, {
      method: 'POST',
      headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: sentences[i], model_id: MODEL, previous_text: sentences[i - 1], next_text: sentences[i + 1] }),
    }, fetcher, stop.signal)
    return Buffer.from(await res.arrayBuffer())
  }
  const start = (i) => {
    if (i >= sentences.length) return null
    const asked = ask(i)
    asked.catch(() => {}) // read when its turn comes; stopping early must not leave it unhandled
    return asked
  }
  let number = 0
  let i = 0
  try {
    let next = start(0)
    for (; i < sentences.length; i++) {
      const pcm = await next
      if (!pcm.length) throw new Error('ElevenLabs sent no audio')
      next = start(i + 1)
      for (let at = 0; at < pcm.length; at += MAX_PCM) {
        const file = path.join(out, `${String(++number).padStart(3, '0')}.wav`)
        fs.writeFileSync(file, wavFrom(pcm.subarray(at, at + MAX_PCM)))
        yield file
      }
    }
  } catch (err) {
    err.rest = sentences.slice(i).join(' ')
    throw err
  } finally {
    stop.abort()
    fs.rmSync(out, { recursive: true, force: true })
  }
}

/** The voices this key can use. */
export async function listVoices({ getKey = elevenLabsKey, fetcher = fetch } = {}) {
  const key = await getKey()
  if (!key) return null
  // shortcut: first 100 voices only; add next_page_token if an account holds more
  const res = await request(`${API}/v2/voices?page_size=100&include_total_count=false`, { headers: { 'xi-api-key': key } }, fetcher, new AbortController().signal)
  const { voices = [] } = await res.json()
  return voices.map((v) => ({ id: v.voice_id, name: v.name, category: v.category, previewUrl: v.preview_url, labels: v.labels }))
}
