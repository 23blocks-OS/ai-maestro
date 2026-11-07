import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

const agents = new Map<string, any>()
vi.mock('@/lib/agent-registry', () => ({ getAgent: (id: string) => agents.get(id) ?? null }))
vi.mock('@/lib/hosts-config', () => ({ isSelf: (id: string) => id === 'here' }))

const { speakForAgent, joinWavs } = await import('@/services/agent-speech-service')

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aim-speech-api-'))
const wav = (name: string, fill: number) => {
  const b = Buffer.alloc(44 + 8, fill)
  b.write('RIFF', 0, 'latin1'); b.write('data', 36, 'latin1')
  const f = path.join(dir, name); fs.writeFileSync(f, b); return f
}
const speech = (files: string[]) => ({ ready: () => true, synthesize: async function* () { yield* files } }) as any

beforeEach(() => {
  agents.clear()
  agents.set('lola', { id: 'lola', voice: { engine: 'local', voiceId: 'af_heart' } })
})

describe('POST /api/agents/[id]/speech', () => {
  it('answers a WAV, and one WAV for a sentence that came in parts', async () => {
    const one = await speakForAgent('lola', { text: 'Hello.' }, speech([wav('a.wav', 1)]))
    expect(one.status).toBe(200)
    expect((one.data as any).audio.subarray(0, 4).toString()).toBe('RIFF')
    const two = await speakForAgent('lola', { text: 'Hello.' }, speech([wav('a.wav', 1), wav('b.wav', 2)]))
    const audio = (two.data as any).audio as Buffer
    expect(audio.length).toBe(44 + 16)
    expect(audio.readUInt32LE(40)).toBe(16)
    expect(audio.readUInt32LE(4)).toBe(44 + 16 - 8)
  })

  it('no voice is 409 no_voice, so the app uses the phone voice', async () => {
    agents.set('plain', { id: 'plain' })
    agents.set('paid', { id: 'paid', voice: { engine: 'elevenlabs' } })
    expect(await speakForAgent('plain', { text: 'Hi' }, speech([]))).toMatchObject({ status: 409, data: { error: 'no_voice' } })
    expect(await speakForAgent('paid', { text: 'Hi' }, speech([]))).toMatchObject({ status: 409, data: { error: 'no_voice' } })
    expect(await speakForAgent('lola', { text: 'Hi' }, { ready: () => false, synthesize: speech([]).synthesize })).toMatchObject({ status: 409 })
  })

  it('refuses bad text, an unknown agent, and an agent on another host', async () => {
    for (const body of [{}, { text: '' }, { text: '   ' }, { text: 7 }, { text: 'x'.repeat(501) }]) {
      expect((await speakForAgent('lola', body as any, speech([]))).status, JSON.stringify(body)).toBe(400)
    }
    expect((await speakForAgent('nobody', { text: 'Hi' }, speech([]))).status).toBe(404)
    agents.set('away', { id: 'away', hostId: 'there', voice: { engine: 'local' } })
    expect((await speakForAgent('away', { text: 'Hi' }, speech([]))).status).toBe(409)
  })

  it('a failed run says why, and no speech at all is an error, not an empty answer', async () => {
    const broken = { ready: () => true, synthesize: async function* () { throw new Error('speech_failed: no model') } } as any
    expect(await speakForAgent('lola', { text: 'Hi' }, broken)).toMatchObject({ status: 500, data: { error: 'speech_failed' } })
    expect((await speakForAgent('lola', { text: 'Hi' }, speech([]))).status).toBe(500)
  })
})

it('joinWavs leaves one file as it is', () => {
  const b = Buffer.alloc(50)
  expect(joinWavs([b])).toBe(b)
})
