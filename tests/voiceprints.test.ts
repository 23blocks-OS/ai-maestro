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
  cancelAgentDeviceVoice: vi.fn(async (...args: any[]) => { device.calls.push(['cancel', ...args]); return { data: { cancelled: true }, status: 200 } }),
}))
vi.mock('@/lib/speech-local.mjs', () => ({
  voiceprintReady: () => model.ready,
  embedVoice: vi.fn(async () => ({ embedding: model.vectors.shift(), speech: model.speech })),
}))

import { cancelVoiceSample, recordVoiceSample, removeVoiceprint, renameVoiceprint, voiceprintStatus, updateConsentText } from '@/services/voiceprints-service'
import { combine, loadVoiceprint, saveVoiceprint, bestMatch, identifySpeaker, DEFAULT_CONSENT, MODEL, printsOf, listVoiceprints } from '@/lib/voiceprints.mjs'

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
  it('keeps one print per microphone: a second microphone adds one, the same one again replaces it', async () => {
    const run = async (extra: (i: number) => Record<string, unknown>) => {
      model.vectors = [0, 1, 2, 3].map(near)
      for (let i = 0; i < 4; i++) expect((await recordVoiceSample('person-a', { name: 'Alice', index: i, ...(i === 0 ? { consent: true } : {}), ...extra(i) })).status).toBe(200)
    }
    await run(() => ({ audio: wavOf() }))
    await run(() => ({ agentId: 'agent-1', deviceKey: 'kiosk-1' }))
    expect(printsOf(loadVoiceprint('person-a')).map((p: any) => p.source)).toEqual(['dashboard', 'device:kiosk-1'])
    await run(() => ({ audio: wavOf() }))
    expect(printsOf(loadVoiceprint('person-a')).map((p: any) => p.source)).toEqual(['device:kiosk-1', 'dashboard'])
    expect(listVoiceprints()[0].microphones).toEqual(['device:kiosk-1', 'dashboard'])
  })

  const wavOf = (rate = 16000, channels = 1) => {
    const pcm = Buffer.alloc(rate * 2), h = Buffer.alloc(44)
    h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVEfmt ', 8); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20)
    h.writeUInt16LE(channels, 22); h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2 * channels, 28); h.writeUInt16LE(2 * channels, 32)
    h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40)
    return Buffer.concat([h, pcm]).toString('base64')
  }
  const dash = (index: number, extra: Record<string, unknown> = {}) => ({ name: 'Alice', audio: wavOf(), index, ...extra })

  it('enrolls from the dashboard microphone without any device', async () => {
    for (let i = 0; i < 4; i++) expect((await recordVoiceSample('person-a', dash(i, i === 0 ? { consent: true } : {}))).status).toBe(200)
    expect(device.calls).toEqual([])
    expect(loadVoiceprint('person-a')).toMatchObject({ device: { dashboard: true } })
  })

  it('refuses a dashboard recording that is not 16 kHz mono 16-bit, and a switch of source mid-way', async () => {
    expect((await recordVoiceSample('person-a', { ...dash(0, { consent: true }), audio: wavOf(48000) })).status).toBe(400)
    expect((await recordVoiceSample('person-a', { ...dash(0, { consent: true }), audio: 'bm90IGEgd2F2' })).status).toBe(400)
    await recordVoiceSample('person-a', dash(0, { consent: true }))
    expect((await recordVoiceSample('person-a', body(1))).status).toBe(409)
  })

  it('cancel forgets the enrollment and frees the device it waits on', async () => {
    await recordVoiceSample('person-a', body(0, { consent: true }))
    expect((await cancelVoiceSample('person-a')).data).toEqual({ cancelled: true })
    expect(device.calls.at(-1)).toEqual(['cancel', 'agent-1', 'kiosk-1'])
    // the next sentence has no enrollment to join: start again
    expect((await recordVoiceSample('person-a', body(1))).status).toBe(409)
    // nothing pending: nothing to free
    expect((await cancelVoiceSample('person-a')).data).toEqual({ cancelled: false })
  })

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

describe('voiceprints: one per microphone', () => {
  const rec = (personId: string, prints: number[][]) => ({ personId, name: personId, embedding: prints[0], prints: prints.map((e, i) => ({ source: `m${i}`, embedding: e })) })

  it('a person scores as their closest microphone', () => {
    const laptop = unit([1, 0, 0, 0]), board = unit([0, 1, 0, 0])
    const heard = unit([0.1, 1, 0, 0])
    expect(bestMatch(heard, [rec('alice', [laptop])])).toBeNull()
    expect(bestMatch(heard, [rec('alice', [laptop, board])])).toMatchObject({ id: 'alice' })
  })

  it('"too close to tell" compares people, never one person\'s own prints', () => {
    const a = unit([0, 1, 0, 0]), b = unit([0, 1, 0.02, 0])
    expect(bestMatch(unit([0, 1, 0.01, 0]), [rec('alice', [a, b])])).toMatchObject({ id: 'alice' })
    expect(bestMatch(unit([0, 1, 0.01, 0]), [rec('alice', [a]), rec('bob', [b])])).toBeNull()
  })

  it('reads a file from before prints as one print', () => {
    expect(printsOf({ embedding: [1, 0], device: { deviceKey: 'k' } })).toEqual([{ source: 'device:k', embedding: [1, 0], enrolledAt: undefined }])
    expect(printsOf({ embedding: [1, 0], device: { dashboard: true } })[0].source).toBe('dashboard')
  })
})
