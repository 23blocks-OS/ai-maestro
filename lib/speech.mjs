/** Picks the engine for an agent's voice, speaking and hearing. Every caller goes through here. */
import { localSpeechReady, synthesize as local, transcribe as localHear } from './speech-local.mjs'
import { elevenLabsKey, synthesize as elevenLabs } from './speech-elevenlabs.mjs'
import { transcribe as scribe } from './hearing-elevenlabs.mjs'

const ENGINES = { localReady: localSpeechReady, local, elevenLabsKey, elevenLabs, localHear, scribe }

export async function voiceReady(voice, engines = ENGINES) {
  if (voice?.engine === 'local') return engines.localReady()
  if (voice?.engine !== 'elevenlabs') return false
  return engines.localReady() || (!!voice.voiceId && !!(await engines.elevenLabsKey()))
}

/**
 * Yields one WAV path at a time in the agent's voice. When ElevenLabs fails, local speech finishes the reply in its
 * default voice (Juan, 2026-11-07): a different voice, but the agent keeps talking.
 */
export async function* speakWith(text, voice, engines = ENGINES) {
  if (voice?.engine !== 'elevenlabs') {
    yield* engines.local(text, voice?.voiceId)
    return
  }
  try {
    yield* engines.elevenLabs(text, voice.voiceId)
  } catch (err) {
    console.error(`[Voice] ElevenLabs failed, ${engines.localReady() ? 'using local speech' : 'and there is no local speech'}: ${err.message}`)
    if (!engines.localReady()) throw new Error(`speech_failed: ${err.message}`)
    yield* engines.local(err.rest ?? text)
  }
}

/**
 * Who hears an agent's devices when it is not this host: ElevenLabs for an agent whose voice is ElevenLabs, when the
 * host has the key. Per agent, never per host: an agent on local voice keeps its people's voices on the network.
 */
export async function hearingBy(voice, engines = ENGINES) {
  return voice?.engine === 'elevenlabs' && (await engines.elevenLabsKey()) ? 'ElevenLabs' : null
}

/** What a person said at a device, as text. Local hearing is the fallback when Scribe fails. */
export async function hear(audio, voice, engines = ENGINES) {
  const started = Date.now()
  if (await hearingBy(voice, engines)) {
    try {
      const text = await engines.scribe(audio)
      console.log(`[Voice] Heard in ${Date.now() - started} ms (ElevenLabs)`)
      return text
    } catch (err) {
      console.error(`[Voice] ElevenLabs could not hear it, using local hearing: ${err.message}`)
    }
  }
  const text = await engines.localHear(audio)
  console.log(`[Voice] Heard in ${Date.now() - started} ms (local)`)
  return text
}
