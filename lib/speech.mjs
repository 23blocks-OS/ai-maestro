/** Picks the engine for an agent's voice. Every caller goes through here; hearing stays in speech-local.mjs. */
import { localSpeechReady, synthesize as local } from './speech-local.mjs'
import { elevenLabsKey, synthesize as elevenLabs } from './speech-elevenlabs.mjs'

const ENGINES = { localReady: localSpeechReady, local, elevenLabsKey, elevenLabs }

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
