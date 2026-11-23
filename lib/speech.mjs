/** Picks the engine for an agent's voice, speaking and hearing. Every caller goes through here. */
import { localSpeechReady, synthesize as local, transcribe as localHear } from './speech-local.mjs'
import { elevenLabsKey, synthesize as elevenLabs } from './speech-elevenlabs.mjs'
import { transcribe as scribe } from './hearing-elevenlabs.mjs'
import { louder } from './speech-loudness.mjs'
import fs from 'fs'
import os from 'os'
import path from 'path'

const ENGINES = { localReady: localSpeechReady, local, elevenLabsKey, elevenLabs, localHear, scribe }

export async function voiceReady(voice, engines = ENGINES) {
  if (voice?.engine === 'local') return engines.localReady()
  if (voice?.engine !== 'elevenlabs') return false
  return engines.localReady() || (!!voice.voiceId && !!(await engines.elevenLabsKey()))
}

/**
 * Yields one WAV path at a time in the agent's voice. When ElevenLabs fails, local speech finishes the reply (Juan,
 * 2026-11-07): in the agent's own backup voice (`voice.localVoiceId`), else the local default. The agent keeps talking.
 */
/**
 * One voice for an agent on every medium (phone, meeting, kiosk, board): the same engine, the same fallback, the same
 * loudness (louder on average for small speakers, never clipped; F131), and speech made ahead. Yields one WAV path at a
 * time; a path is valid until the next one is asked for.
 */
export async function* speakWith(text, voice, engines = ENGINES) {
  const key = aheadKey(text, voice)
  const made = ahead.get(key)?.engines === engines ? ahead.get(key) : undefined
  if (made) ahead.delete(key)
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aim-voice-'))
  try {
    let n = 0
    const out = (wav) => {
      const file = path.join(dir, `${String(++n).padStart(3, '0')}.wav`)
      fs.writeFileSync(file, wav)
      return file
    }
    const clips = made ? await made.clips.catch(() => null) : null
    if (clips) {
      for (const wav of clips) yield out(wav)
      return
    }
    for await (const file of rawSpeech(text, voice, engines)) yield out(louder(fs.readFileSync(file)))
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

/** Speech made ahead: the next sentence is ready while the one before it plays. Keyed by voice and text. */
const ahead = new Map()
const AHEAD_MAX = 16
const AHEAD_MS = 60_000
const aheadKey = (text, voice) => JSON.stringify([voice?.engine, voice?.voiceId, voice?.localVoiceId, text])

/** Starts making a sentence now, so speakWith(text, voice) has it at once. Unused speech is dropped after a minute. */
export function prefetchSpeech(text, voice, engines = ENGINES) {
  const key = aheadKey(text, voice)
  if (ahead.has(key) || !text?.trim()) return
  for (const [k, v] of ahead) if (Date.now() - v.at > AHEAD_MS || ahead.size >= AHEAD_MAX) ahead.delete(k)
  const clips = (async () => {
    const all = []
    for await (const file of rawSpeech(text, voice, engines)) all.push(louder(fs.readFileSync(file)))
    return all
  })()
  clips.catch(() => {}) // a failure here just means speakWith makes it again when asked
  ahead.set(key, { clips, engines, at: Date.now() })
}

/** The engine choice alone: which engine speaks, and the fallback (raw WAV paths, as each engine makes them) */
export async function* rawSpeech(text, voice, engines = ENGINES) {
  if (voice?.engine !== 'elevenlabs') {
    yield* engines.local(text, voice?.voiceId)
    return
  }
  try {
    yield* engines.elevenLabs(text, voice.voiceId)
  } catch (err) {
    console.error(`[Voice] ElevenLabs failed, ${engines.localReady() ? 'using local speech' : 'and there is no local speech'}: ${err.message}`)
    if (!engines.localReady()) throw new Error(`speech_failed: ${err.message}`)
    yield* engines.local(err.rest ?? text, voice.localVoiceId)
  }
}

/**
 * Who hears an agent's devices when it is not this host: ElevenLabs for an agent whose voice is ElevenLabs, when the
 * host has the key. Per agent, never per host: an agent on local voice keeps its people's voices on the network.
 */
export async function hearingBy(voice, engines = ENGINES) {
  return voice?.engine === 'elevenlabs' && (await engines.elevenLabsKey()) ? 'ElevenLabs' : null
}

/** The language the agent hears, from its voice settings (BCP 47, such as "en" or "es"); English when unset */
export function hearingLanguage(voice) {
  const l = voice?.hearingLanguage
  return typeof l === 'string' && /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/.test(l) ? l : 'en'
}

/** What a person said at a device, as text. Local hearing is the fallback when Scribe fails. */
export async function hear(audio, voice, engines = ENGINES) {
  const started = Date.now()
  if (await hearingBy(voice, engines)) {
    try {
      const text = await engines.scribe(audio, { language: hearingLanguage(voice) })
      console.log(`[Voice] Heard in ${Date.now() - started} ms (ElevenLabs)`)
      return text
    } catch (err) {
      console.error(`[Voice] ElevenLabs could not hear it, using local hearing: ${err.message}`)
    }
  }
  const text = await engines.localHear(audio, { language: hearingLanguage(voice) })
  console.log(`[Voice] Heard in ${Date.now() - started} ms (local)`)
  return text
}
