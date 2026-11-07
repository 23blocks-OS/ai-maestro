/**
 * What a person said at a device, from ElevenLabs Scribe (docs/SPEC-ELEVENLABS-HEARING.md). One request per clip:
 * the device sends one finished WAV per turn. The language is told, never guessed (B036).
 */
import { elevenLabsKey, request } from './speech-elevenlabs.mjs'
import { HEARING_LANGUAGE } from './speech-local.mjs'

const API = 'https://api.elevenlabs.io'
const MODEL = 'scribe_v2'

export async function transcribe(audio, { getKey = elevenLabsKey, fetcher = fetch, language = HEARING_LANGUAGE } = {}) {
  const key = await getKey()
  if (!key) throw new Error('no ELEVENLABS_API_KEY on this host')
  const form = () => {
    const body = new FormData()
    body.append('model_id', MODEL)
    body.append('language_code', language)
    body.append('file', new Blob([audio], { type: 'audio/wav' }), 'speech.wav')
    return body
  }
  const res = await request(`${API}/v1/speech-to-text`, { method: 'POST', headers: { 'xi-api-key': key }, body: form }, fetcher, new AbortController().signal)
  const { text = '' } = await res.json()
  return String(text).trim()
}
