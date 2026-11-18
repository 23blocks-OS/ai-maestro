import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import { tmpdir } from 'os'

const { home, device, model } = vi.hoisted(() => ({
  home: { dir: '' },
  device: { result: null as any, calls: [] as any[] },
  model: { ready: true, speech: 4, vectors: [] as number[][] },
}))

vi.mock('os', async (orig) => {
  const real = await orig<typeof import('os')>()
  return { ...real, default: { ...real, homedir: () => home.dir } }
})
vi.mock('@/services/agent-devices-service', () => ({
  recordAgentDeviceVoice: vi.fn(async (...args: any[]) => { device.calls.push(args); return device.result }),
}))
vi.mock('@/lib/speech-local.mjs', () => ({
  voiceprintReady: () => model.ready,
  embedVoice: vi.fn(async () => ({ embedding: model.vectors.shift(), speech: model.speech })),
}))

import { recordVoiceSample, removeVoiceprint, renameVoiceprint, voiceprintStatus, updateConsentText } from '@/services/voiceprints-service'
import { combine, loadVoiceprint, saveVoiceprint, bestMatch, identifySpeaker, DEFAULT_CONSENT, MODEL } from '@/lib/voiceprints.mjs'

const unit = (v: number[]) => { const n = Math.hypot(...v); return v.map(x => x / n) }
const near = (i: number) => unit([1, 0.1 * i, 0.05, 0]) // one person: four close vectors
const body = (index: number, extra: Record<string, unknown> = {}) => ({ name: 'Alice', agentId: 'agent-1', deviceKey: 'kiosk-1', index, ...extra })
const root = fs.mkdtempSync(path.join(tmpdir(), 'aim-voiceprints-'))

beforeEach(() => {
  home.dir = fs.mkdtempSync(path.join(root, 'home-'))
  device.result = { data: { wav: Buffer.from('RIFF') }, status: 200 }
  device.calls = []
  model.ready = true
  model.speech = 4
  model.vectors = [0, 1, 2, 3].map(near)
  ;(globalThis as any)._voiceEnrollments = undefined
})
afterAll(() => fs.rmSync(root, { recursive: true, force: true }))

const enroll = async () => {
  for (let i = 0; i < 4; i++) {
    const r = await recordVoiceSample('person-a', body(i, i === 0 ? { consent: true } : {}))
    expect(r.status).toBe(200)
  }
}

describe('voice enrollment', () => {
  it('records nothing before consent', async () => {
    const r = await recordVoiceSample('person-a', body(0))
    expect(r.status).toBe(400)
    expect(device.calls).toHaveLength(0)
  })

  it('stores one private voiceprint with the consent, after four sentences', async () => {
    await enroll()
    const saved = loadVoiceprint('person-a')
    expect(saved.consentText).toBe(DEFAULT_CONSENT)
    expect(saved.consentAt).toMatch(/^\d{4}-/)
    expect(saved.embedding).toHaveLength(4)
    expect(Math.hypot(...saved.embedding)).toBeCloseTo(1, 5)
    const file = path.join(home.dir, '.aimaestro', 'voiceprints', 'person-a.json')
    expect(fs.statSync(file).mode & 0o777).toBe(0o600)
    // Each sentence is shown on the kiosk while it records
    expect(device.calls.map(c => c[2])).toEqual(expect.arrayContaining([expect.stringContaining('quick brown fox')]))
    expect((voiceprintStatus().data as any).voiceprints).toEqual([expect.objectContaining({ personId: 'person-a', name: 'Alice' })])
    expect(JSON.stringify(voiceprintStatus().data)).not.toContain('embedding')
  })

  it('asks for the same sentence again when it heard too little speech', async () => {
    await recordVoiceSample('person-a', body(0, { consent: true }))
    model.speech = 0.5
    const quiet = await recordVoiceSample('person-a', body(1))
    expect(quiet.status).toBe(422)
    model.speech = 4
    model.vectors.unshift(near(1))
    expect((await recordVoiceSample('person-a', body(1))).data).toMatchObject({ count: 2 })
  })

  it('refuses a sentence out of step, or from another device', async () => {
    expect((await recordVoiceSample('person-a', body(2))).status).toBe(409)
    await recordVoiceSample('person-a', body(0, { consent: true }))
    expect((await recordVoiceSample('person-a', body(1, { deviceKey: 'kiosk-2' }))).status).toBe(409)
  })

  it('keeps nothing when the four recordings are not one person', async () => {
    model.vectors = [near(0), near(1), near(2), unit([-1, 0, 0, 1])]
    await recordVoiceSample('person-a', body(0, { consent: true }))
    await recordVoiceSample('person-a', body(1))
    await recordVoiceSample('person-a', body(2))
    expect((await recordVoiceSample('person-a', body(3))).status).toBe(422)
    expect(loadVoiceprint('person-a')).toBeNull()
  })

  it('passes on what the device answered, and needs the model', async () => {
    device.result = { data: { error: 'device_unreachable', message: 'offline' }, status: 502 }
    expect((await recordVoiceSample('person-a', body(0, { consent: true }))).status).toBe(502)
    model.ready = false
    expect((await recordVoiceSample('person-a', body(0, { consent: true }))).status).toBe(503)
  })

  it('renames a voiceprint, keeping the voice and the consent', async () => {
    await enroll()
    const before = loadVoiceprint('person-a')!
    expect(renameVoiceprint('person-a', { name: ' Alice Smith ' }).status).toBe(200)
    const after = loadVoiceprint('person-a')!
    expect(after.name).toBe('Alice Smith')
    expect(after.embedding).toEqual(before.embedding)
    expect(after.consentAt).toBe(before.consentAt)
    expect(renameVoiceprint('person-a', { name: '' }).status).toBe(400)
    expect(renameVoiceprint('person-b', { name: 'Bob' }).status).toBe(404)
    expect(renameVoiceprint('../registry', { name: 'Bob' }).status).toBe(400)
  })

  it('deletes a voiceprint, and rejects ids that are not person ids', async () => {
    await enroll()
    expect(removeVoiceprint('person-a').status).toBe(200)
    expect(loadVoiceprint('person-a')).toBeNull()
    expect(removeVoiceprint('person-a').status).toBe(404)
    expect(removeVoiceprint('../registry').status).toBe(400)
    expect((await recordVoiceSample('../x', body(0, { consent: true }))).status).toBe(400)
  })

  it('keeps the operator consent text, and an empty one restores the default', () => {
    expect((updateConsentText({ consentText: 'Acme may keep my voiceprint.' }).data as any).consentText).toBe('Acme may keep my voiceprint.')
    expect((voiceprintStatus().data as any).consentText).toBe('Acme may keep my voiceprint.')
    expect((updateConsentText({ consentText: '' }).data as any).consentText).toBe(DEFAULT_CONSENT)
    expect(updateConsentText({ consentText: 'x'.repeat(2001) }).status).toBe(400)
  })

  it('combine refuses an outlier', () => {
    expect(combine([near(0), near(1)])).not.toBeNull()
    expect(combine([near(0), unit([-1, 0, 0, 0])])).toBeNull()
  })
})

describe('voice matching', () => {
  const print = (personId: string, name: string, embedding: number[]) => ({ personId, name, embedding, model: MODEL, consentAt: 'now' })
  const alice = print('p-alice', 'Alice', unit([1, 0, 0, 0]))
  const bob = print('p-bob', 'Bob', unit([0, 1, 0, 0]))

  it('names the clear best match, as a guess with its score', () => {
    expect(bestMatch(unit([1, 0.3, 0, 0]), [bob, alice])).toEqual({ id: 'p-alice', name: 'Alice', confidence: 0.96 })
  })

  it('names nobody under the threshold, with no prints, or when two people are too close', () => {
    expect(bestMatch(unit([0.4, 0.3, 1, 0]), [alice, bob])).toBeNull()
    expect(bestMatch(unit([1, 0, 0, 0]), [])).toBeNull()
    expect(bestMatch(unit([1, 0.96, 0, 0]), [alice, bob])).toBeNull()
  })

  it('identifySpeaker matches only with voiceprints, the model and enough speech, and never throws', async () => {
    const embed = vi.fn(async () => ({ embedding: unit([1, 0.2, 0, 0]), speech: 3 }))
    const audio = Buffer.alloc(44 + 32000 * 3)
    expect(await identifySpeaker(audio, { ready: () => true, embed })).toBeNull()
    expect(embed).not.toHaveBeenCalled()
    saveVoiceprint(alice)
    saveVoiceprint(bob)
    expect(await identifySpeaker(audio, { ready: () => false, embed })).toBeNull()
    expect(await identifySpeaker(audio, { ready: () => true, embed })).toMatchObject({ id: 'p-alice', name: 'Alice' })
    expect(await identifySpeaker(Buffer.alloc(44 + 32000), { ready: () => true, embed })).toBeNull()
    expect(embed).toHaveBeenCalledTimes(1)
    embed.mockResolvedValueOnce({ embedding: unit([1, 0, 0, 0]), speech: 1 })
    expect(await identifySpeaker(audio, { ready: () => true, embed })).toBeNull()
    embed.mockRejectedValueOnce(new Error('bad wav'))
    expect(await identifySpeaker(audio, { ready: () => true, embed })).toBeNull()
  })
})
