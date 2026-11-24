/**
 * Voiceprints (#78): who is probably talking to a kiosk. Identification, never authentication: a match names a
 * person and grants nothing. Stored on the host whose devices hear people, one file per person, readable only by
 * this user: ~/.aimaestro/voiceprints/<personId>.json. Only the vector is kept, with the consent the person gave;
 * never the audio.
 */
import fs from 'fs'
import os from 'os'
import path from 'path'
import { embedVoice, voiceprintReady } from './speech-local.mjs'

export const MODEL = 'wespeaker-voxceleb-resnet34'
export const SAMPLE_SECONDS = 5
/** Spike on public LibriSpeech audio: same person 0.61 to 0.89, different people 0.42 at most. Tune on kiosk audio. */
export const MATCH = 0.5
/** Seconds of speech a sample needs; the spike's shortest reliable clip was 3 s, of which some is pauses */
export const MIN_SPEECH = 2
/** Read aloud, about 4 s each: varied sounds, nothing personal */
export const SENTENCES = [
  'The quick brown fox jumps over the lazy dog by the river.',
  'On sunny mornings we walk to the market for bread and fruit.',
  'Please bring three small boxes and a blue chair from the hall.',
  'This kiosk listens for my voice so it knows who is speaking.',
]
export const DEFAULT_CONSENT =
  'I agree that this kiosk keeps a voiceprint of my voice: a list of numbers made from four sentences I read, not a recording. ' +
  'It is used only to tell the agent who is probably speaking, and it never unlocks or approves anything. ' +
  'I can ask for it to be deleted at any time.'
export const MAX_CONSENT = 2000

const ID = /^[A-Za-z0-9][A-Za-z0-9-]{0,63}$/
const dir = () => path.join(os.homedir(), '.aimaestro', 'voiceprints')
const fileOf = (personId) => {
  if (!ID.test(personId)) throw new Error('Invalid person id')
  return path.join(dir(), `${personId}.json`)
}

function writePrivate(file, value) {
  fs.mkdirSync(dir(), { recursive: true, mode: 0o700 })
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(value), { mode: 0o600 })
  fs.renameSync(tmp, file)
}

export function consentText() {
  try {
    const text = JSON.parse(fs.readFileSync(path.join(dir(), 'settings.json'), 'utf-8')).consentText
    if (typeof text === 'string' && text.trim()) return text
  } catch { /* none yet */ }
  return DEFAULT_CONSENT
}

/** Empty restores the default */
export function setConsentText(text) {
  writePrivate(path.join(dir(), 'settings.json'), { consentText: text.trim() })
  return consentText()
}

/**
 * A person's prints, one per microphone (`dashboard`, or `device:<key>`): a small board's microphone sounds unlike a
 * laptop's, so a voice enrolled on one scored 0.2 to 0.45 on the other (2026-11-23). A file from before has one.
 */
export function printsOf(record) {
  if (Array.isArray(record?.prints) && record.prints.length) return record.prints
  const d = record?.device
  return record?.embedding ? [{ source: d?.deviceKey ? `device:${d.deviceKey}` : 'dashboard', embedding: record.embedding, enrolledAt: record.enrolledAt }] : []
}

/** The record with this microphone's print added, or replaced if the microphone had one */
export function withPrint(existing, source, embedding, enrolledAt) {
  const others = existing ? printsOf(existing).filter((p) => p.source !== source) : []
  return [...others, { source, embedding, enrolledAt }]
}

const isRecord = (r) => r && typeof r.personId === 'string' && Array.isArray(r.embedding) && typeof r.consentAt === 'string'

export function loadVoiceprint(personId) {
  try {
    const record = JSON.parse(fs.readFileSync(fileOf(personId), 'utf-8'))
    return isRecord(record) ? record : null
  } catch {
    return null
  }
}

/** Who is enrolled here, without the vectors */
export function listVoiceprints() {
  if (!fs.existsSync(dir())) return []
  return fs.readdirSync(dir())
    .filter((f) => f.endsWith('.json') && f !== 'settings.json')
    .map((f) => loadVoiceprint(f.slice(0, -5)))
    .filter(Boolean)
    .map((r) => ({ personId: r.personId, name: r.name, consentAt: r.consentAt, enrolledAt: r.enrolledAt, model: r.model, microphones: printsOf(r).map((p) => p.source) }))
}

export function saveVoiceprint(record) {
  writePrivate(fileOf(record.personId), record)
}

export function deleteVoiceprint(personId) {
  const file = fileOf(personId)
  if (!fs.existsSync(file)) return false
  fs.rmSync(file)
  return true
}

export const cosine = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0)

/** The mean direction of unit vectors, as a unit vector */
export function centroid(vectors) {
  const sum = vectors[0].map((_, i) => vectors.reduce((s, v) => s + v[i], 0))
  const norm = Math.hypot(...sum)
  return sum.map((v) => v / norm)
}

/** One voiceprint from the samples, or null when one of them does not sound like the others (a second person, noise). */
export function combine(samples) {
  const center = centroid(samples)
  return samples.every((s) => cosine(s, center) >= MATCH) ? center.map((v) => Math.round(v * 1e6) / 1e6) : null
}

/** Top two closer than this: the voice sounds like two people, so it names neither */
export const AMBIGUOUS = 0.05

/**
 * Who a voice probably is, as ADP's `speaker` ({id, name, confidence}), or null when nobody is a clear match: under
 * MATCH, or two people too close to tell apart. Null means the agent gets no name, which is the safe default.
 */
export function bestMatch(embedding, prints) {
  // A person scores as their closest microphone; "too close to tell" compares people, never one person's prints
  const [first, second] = prints
    .map((p) => ({ p, score: Math.max(...printsOf(p).map((x) => cosine(embedding, x.embedding))) }))
    .sort((a, b) => b.score - a.score)
  if (!first || first.score < MATCH || (second && first.score - second.score < AMBIGUOUS)) return null
  return { id: first.p.personId, name: first.p.name, confidence: Math.round(Math.min(first.score, 1) * 100) / 100 }
}

/**
 * The voice match on a clip a device heard, or null: no voiceprints or model here, too little speech, nobody clear.
 * Never throws, so hearing works as before. The audio is only embedded, not kept.
 */
export async function identifySpeaker(audio, { ready = voiceprintReady, embed = embedVoice } = {}) {
  try {
    const prints = listVoiceprints().map(({ personId }) => loadVoiceprint(personId)).filter((p) => p.model === MODEL)
    // A clip shorter than MIN_SPEECH (16 kHz 16-bit: 32000 bytes a second) cannot pass; skip the model, whose error would also restart the voice worker
    if (!prints.length || audio.length < 44 + 32000 * MIN_SPEECH || !ready()) return null
    const voice = await embed(audio)
    return voice && voice.speech >= MIN_SPEECH ? bestMatch(voice.embedding, prints) : null
  } catch (err) {
    console.error(`[Voice] Could not match the speaker: ${err.message}`)
    return null
  }
}
