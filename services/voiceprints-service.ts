/**
 * Voice enrollment (#78), on the host whose kiosk hears people. The operator records consent in the dashboard, then
 * the person reads four sentences at the kiosk; only the combined voiceprint is kept, with that consent.
 *
 *   GET    /api/voiceprints                      { ready, consentText, sentences, voiceprints }
 *   PUT    /api/voiceprints                      { consentText }: '' restores the default
 *   POST   /api/voiceprints/[personId]/samples   { name, agentId, deviceKey, index, consent }: records sentence `index`
 *                                                 at the device; or { name, audio, index, consent }: `audio` is the
 *                                                 sentence recorded in the dashboard (base64 WAV, 16 kHz mono 16-bit)
 *   DELETE /api/voiceprints/[personId]/samples   cancels the enrollment, and a board's wait for its next clip
 *   PATCH  /api/voiceprints/[personId]          { name }: the person was renamed
 *   DELETE /api/voiceprints/[personId]
 *
 * The person record can be stored on another host, so the dashboard sends the name it shows.
 */

import {
  SENTENCES, SAMPLE_SECONDS, MIN_SPEECH, MODEL, MAX_CONSENT,
  consentText, setConsentText, listVoiceprints, loadVoiceprint, saveVoiceprint, deleteVoiceprint, combine,
} from '@/lib/voiceprints.mjs'
import { embedVoice, voiceprintReady } from '@/lib/speech-local.mjs'
import { cancelAgentDeviceVoice, recordAgentDeviceVoice } from '@/services/agent-devices-service'
import { isPersonId } from '@/lib/people-registry'
import { type ServiceResult, invalidField, missingField, notFound, serviceError } from '@/services/service-errors'

const PENDING_MS = 10 * 60_000
// 20 s of 16 kHz mono 16-bit, in base64
const MAX_AUDIO_B64 = Math.ceil(((44 + 20 * 16000 * 2) * 4) / 3) + 4

/** A RIFF/WAVE with PCM 16 kHz, mono, 16-bit: what the speaker model takes (scripts/voice/serve.py) */
function isSampleWav(b: Buffer): boolean {
  if (b.length < 44 || b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WAVE') return false
  for (let at = 12; at + 8 <= b.length; at += 8 + b.readUInt32LE(at + 4) + (b.readUInt32LE(at + 4) & 1)) {
    if (b.toString('ascii', at, at + 4) !== 'fmt ') continue
    return b.readUInt16LE(at + 8) === 1 && b.readUInt16LE(at + 10) === 1 && b.readUInt32LE(at + 12) === 16000 && b.readUInt16LE(at + 22) === 16
  }
  return false
}
const MAX_NAME = 120

interface Enrollment { name: string; source: string; agentId?: string; deviceKey?: string; consentAt: string; consentText: string; samples: number[][]; at: number }

/** Per person, between one sentence and the next. On globalThis: the server and Next each load this module. */
const pending = (): Map<string, Enrollment> =>
  ((globalThis as unknown as { _voiceEnrollments?: Map<string, Enrollment> })._voiceEnrollments ??= new Map())

const conflict = (message: string): ServiceResult<never> => serviceError('invalid_state', message, 409)

export function voiceprintStatus(): ServiceResult<{ ready: boolean; consentText: string; sentences: string[]; voiceprints: ReturnType<typeof listVoiceprints> }> {
  return { data: { ready: voiceprintReady(), consentText: consentText(), sentences: SENTENCES, voiceprints: listVoiceprints() }, status: 200 }
}

export function updateConsentText(body: { consentText?: unknown }): ServiceResult<{ consentText: string }> {
  const text = body?.consentText
  if (typeof text !== 'string') return missingField('consentText')
  if (text.length > MAX_CONSENT) return invalidField('consentText', `consentText can be at most ${MAX_CONSENT} characters`)
  return { data: { consentText: setConsentText(text) }, status: 200 }
}

export async function recordVoiceSample(personId: string, body: Record<string, unknown>): Promise<ServiceResult<{ count: number; needed: number; enrolled: boolean }>> {
  if (!isPersonId(personId)) return invalidField('personId', 'personId must be a person id from GET /api/people')
  if (!voiceprintReady()) return serviceError('not_initialized', 'Voiceprints need the speaker model on this host: run scripts/install-voice.sh', 503)
  const { name, agentId, deviceKey, index, consent, audio } = body || {}
  if (typeof name !== 'string' || !name.trim() || name.length > MAX_NAME) return invalidField('name', `name must be text of at most ${MAX_NAME} characters`)
  // Recorded in the dashboard (the computer's microphone), or at a device of an agent on this host
  let wav: Buffer | null = null
  if (audio !== undefined) {
    if (typeof audio !== 'string' || audio.length > MAX_AUDIO_B64) return invalidField('audio', 'audio must be a base64 WAV of at most 20 seconds')
    wav = Buffer.from(audio, 'base64')
    if (!isSampleWav(wav)) return invalidField('audio', 'audio must be a WAV, 16 kHz, mono, 16-bit')
  } else {
    if (typeof agentId !== 'string' || !agentId) return missingField('agentId')
    if (typeof deviceKey !== 'string' || !deviceKey) return missingField('deviceKey')
  }
  const source = wav ? 'dashboard' : `${agentId}:${deviceKey}`
  if (!Number.isInteger(index) || (index as number) < 0 || (index as number) >= SENTENCES.length) return invalidField('index', `index must be 0 to ${SENTENCES.length - 1}`)

  const enrollments = pending()
  let enrollment = enrollments.get(personId)
  if (index === 0) {
    // Nothing is recorded before the operator confirms the person agreed to the text shown
    if (consent !== true) return invalidField('consent', 'consent must be true: the person agreed to the consent text')
    enrollment = { name: name.trim(), source, ...(wav ? {} : { agentId: agentId as string, deviceKey: deviceKey as string }), consentAt: new Date().toISOString(), consentText: consentText(), samples: [], at: Date.now() }
    enrollments.set(personId, enrollment)
  } else if (!enrollment || Date.now() - enrollment.at > PENDING_MS || enrollment.samples.length !== index || enrollment.source !== source) {
    enrollments.delete(personId)
    return conflict('This enrollment expired or is out of step. Start again from the first sentence')
  }

  if (!wav) {
    const recorded = await recordAgentDeviceVoice(agentId as string, deviceKey as string, `Please read aloud:\n"${SENTENCES[index as number]}"`, SAMPLE_SECONDS)
    if (recorded.status !== 200) return recorded as unknown as ServiceResult<never>
    const answer = recorded.data as { wav?: Buffer; error?: string }
    // A signed refusal (the person revoked the microphone, it is busy) comes back as 200 without audio
    if (!answer?.wav) return conflict(`The kiosk did not record: ${answer?.error ?? 'no audio'}`)
    wav = answer.wav
  }

  let voice
  try {
    voice = await embedVoice(wav)
  } catch (err) {
    return serviceError('operation_failed', `Could not make the voiceprint: ${(err as Error).message}`, 500)
  }
  if (!voice || voice.speech < MIN_SPEECH) {
    // The same sentence again: a pause or a quiet voice is not a reason to start over
    return serviceError('invalid_request', `Heard ${voice ? voice.speech.toFixed(1) : 0} s of speech. Read the sentence again, closer to the kiosk`, 422)
  }
  enrollment.samples.push(voice.embedding)
  enrollment.at = Date.now()
  if (enrollment.samples.length < SENTENCES.length) return { data: { count: enrollment.samples.length, needed: SENTENCES.length, enrolled: false }, status: 200 }

  enrollments.delete(personId)
  const embedding = combine(enrollment.samples)
  if (!embedding) return serviceError('invalid_request', 'The four recordings do not sound like one person. Start again, with only that person near the kiosk', 422)
  saveVoiceprint({
    personId, name: enrollment.name, model: MODEL, embedding, samples: SENTENCES.length,
    consentAt: enrollment.consentAt, consentText: enrollment.consentText, enrolledAt: new Date().toISOString(),
    device: enrollment.agentId ? { agentId: enrollment.agentId, deviceKey: enrollment.deviceKey } : { dashboard: true },
  })
  return { data: { count: SENTENCES.length, needed: SENTENCES.length, enrolled: true }, status: 200 }
}

/** The operator cancelled: forget the enrollment, and free the board so its next clip is talk again */
export async function cancelVoiceSample(personId: string): Promise<ServiceResult<{ cancelled: boolean }>> {
  if (!isPersonId(personId)) return invalidField('personId', 'personId must be a person id from GET /api/people')
  const enrollment = pending().get(personId)
  if (!enrollment) return { data: { cancelled: false }, status: 200 }
  pending().delete(personId)
  if (!enrollment.agentId || !enrollment.deviceKey) return { data: { cancelled: true }, status: 200 }
  return cancelAgentDeviceVoice(enrollment.agentId, enrollment.deviceKey)
}

/** The person was renamed where their record lives: the kiosk names them the new way from now on */
export function renameVoiceprint(personId: string, body: { name?: unknown }): ServiceResult<{ personId: string; name: string }> {
  if (!isPersonId(personId)) return invalidField('personId', 'personId must be a person id from GET /api/people')
  const name = body?.name
  if (typeof name !== 'string' || !name.trim() || name.length > MAX_NAME) return invalidField('name', `name must be text of at most ${MAX_NAME} characters`)
  const record = loadVoiceprint(personId)
  if (!record) return notFound('Voiceprint', personId)
  saveVoiceprint({ ...record, name: name.trim() })
  return { data: { personId, name: name.trim() }, status: 200 }
}

export function removeVoiceprint(personId: string): ServiceResult<{ deleted: true }> {
  if (!isPersonId(personId)) return invalidField('personId', 'personId must be a person id from GET /api/people')
  pending().delete(personId)
  return deleteVoiceprint(personId) ? { data: { deleted: true }, status: 200 } : notFound('Voiceprint', personId)
}
