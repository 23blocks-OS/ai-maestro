/**
 * The agent's own voice, on request: for a client that is not one of its devices, such as the phone app (F096).
 * A device gets the same speech pushed to it with speaker.play.
 *
 *   POST /api/agents/[id]/speech   { text }   -> audio/wav, 16-bit mono
 */
import fs from 'fs'
import { getAgent } from '@/lib/agent-registry'
import { isSelf } from '@/lib/hosts-config'
import { speakWith, voiceReady } from '@/lib/speech.mjs'
import { listVoices } from '@/lib/speech-elevenlabs.mjs'
import type { ServiceResult } from '@/services/service-errors'

/** speaker.say's limit: one rule for what an agent may say */
const MAX_TEXT = 500
const WAV_HEADER = 44

const fail = (status: number, error: string, message: string): ServiceResult<any> => ({ data: { error, message }, status })

/** A long sentence comes as several files: one answer is easier for a client, so they become one WAV. */
export function joinWavs(files: Buffer[]): Buffer {
  if (files.length === 1) return files[0]
  const pcm = Buffer.concat(files.map(f => f.subarray(WAV_HEADER)))
  const header = Buffer.from(files[0].subarray(0, WAV_HEADER))
  header.writeUInt32LE(pcm.length + WAV_HEADER - 8, 4)
  header.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([header, pcm])
}

export async function speakForAgent(agentId: string, body: { text?: unknown }, speech = { ready: voiceReady, synthesize: speakWith }): Promise<ServiceResult<{ audio: Buffer }>> {
  const agent = getAgent(agentId)
  if (!agent || agent.deletedAt) return fail(404, 'not_found', `Unknown agent ${agentId}`)
  if (agent.hostId && !isSelf(agent.hostId)) return fail(409, 'other_host', `This agent lives on ${agent.hostId}. Ask that host.`)
  const text = body?.text
  if (typeof text !== 'string' || !text.trim() || Buffer.byteLength(text) > MAX_TEXT) return fail(400, 'invalid_request', `text must be 1 to ${MAX_TEXT} bytes`)
  if (!agent.voice || !(await speech.ready(agent.voice))) return fail(409, 'no_voice', 'This agent has no voice on this host')
  try {
    const files: Buffer[] = []
    for await (const file of speech.synthesize(text, agent.voice)) files.push(fs.readFileSync(file))
    if (!files.length) return fail(500, 'speech_failed', 'No speech was made')
    return { data: { audio: joinWavs(files) }, status: 200 }
  } catch (err) {
    return fail(500, 'speech_failed', (err as Error).message)
  }
}

export async function elevenLabsVoices(list = listVoices): Promise<ServiceResult<any>> {
  try {
    const voices = await list()
    if (!voices) return fail(409, 'no_key', 'This host has no ElevenLabs key')
    return { data: { voices }, status: 200 }
  } catch (err) {
    return fail(502, 'provider_failed', (err as Error).message)
  }
}
