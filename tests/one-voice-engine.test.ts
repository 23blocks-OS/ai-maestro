import { describe, it, expect } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
// @ts-expect-error plain ESM module
import { speakWith, prefetchSpeech } from '../lib/speech.mjs'
// @ts-expect-error plain ESM module
import { wavFrom } from '../lib/speech-elevenlabs.mjs'

// One voice for an agent on every medium: the same loudness, and speech made ahead so sentences have no gap
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'one-voice-'))
function clip() {
  const pcm = Buffer.alloc(24000 * 2)
  for (let i = 0; i < 24000; i++) pcm.writeInt16LE(Math.round((i % 8000 < 2000 ? 0.4 : 0.02) * 32767 * Math.sin(i / 3)), i * 2)
  return wavFrom(pcm)
}
function engines() {
  const calls: string[] = []
  return {
    calls,
    localReady: () => true,
    elevenLabsKey: async () => 'k',
    async *elevenLabs(text: string) { calls.push(text); const f = path.join(dir, `${calls.length}.wav`); fs.writeFileSync(f, clip()); yield f },
    async *local() { throw new Error('not used') },
  }
}
const peak = (wav: Buffer) => { let p = 0; for (let i = 44; i + 1 < wav.length; i += 2) p = Math.max(p, Math.abs(wav.readInt16LE(i))); return 20 * Math.log10(p / 32768) }
const read = async (it: AsyncIterable<string>) => { const out: Buffer[] = []; for await (const f of it) out.push(fs.readFileSync(f)); return out }

describe('one voice engine for every medium', () => {
  it('makes every clip louder and never above -1 dBFS', async () => {
    const e = engines()
    const [wav] = await read(speakWith('Hello.', { engine: 'elevenlabs', voiceId: 'v' }, e))
    expect(peak(wav)).toBeLessThanOrEqual(-0.99)
  })

  it('serves a sentence made ahead without asking the engine again', async () => {
    const e = engines()
    const voice = { engine: 'elevenlabs', voiceId: 'v' }
    prefetchSpeech('Made early.', voice, e)
    await new Promise((r) => setTimeout(r, 20))
    expect(e.calls).toEqual(['Made early.'])
    const out = await read(speakWith('Made early.', voice, e))
    expect(out.length).toBe(1)
    expect(e.calls).toEqual(['Made early.']) // not made twice
    await read(speakWith('Made early.', voice, e)) // used once: asked again, it is made again
    expect(e.calls).toEqual(['Made early.', 'Made early.'])
  })

  it('another voice does not get the speech made for this one', async () => {
    const e = engines()
    prefetchSpeech('Hi.', { engine: 'elevenlabs', voiceId: 'a' }, e)
    await read(speakWith('Hi.', { engine: 'elevenlabs', voiceId: 'b' }, e))
    await new Promise((r) => setTimeout(r, 20))
    expect(e.calls.length).toBe(2)
  })
})

// @ts-expect-error plain ESM module
import { hear, hearingLanguage } from '../lib/speech.mjs'

describe("the agent's hearing language, on every medium", () => {
  it('reaches both speech-to-text engines', async () => {
    const asked: any[] = []
    const engines = {
      localReady: () => true,
      elevenLabsKey: async () => 'k',
      scribe: async (_a: Buffer, o: any) => { asked.push(['scribe', o.language]); return 'hola' },
      localHear: async (_a: Buffer, o: any) => { asked.push(['local', o.language]); return 'hola' },
    }
    await hear(Buffer.alloc(10), { engine: 'elevenlabs', voiceId: 'v', hearingLanguage: 'es' }, engines)
    await hear(Buffer.alloc(10), { engine: 'local', hearingLanguage: 'pt-BR' }, engines)
    expect(asked).toEqual([['scribe', 'es'], ['local', 'pt-BR']])
  })

  it('is English when unset or not a language code', () => {
    expect(hearingLanguage(undefined)).toBe('en')
    expect(hearingLanguage({ hearingLanguage: 'Spanish; rm -rf /' })).toBe('en')
    expect(hearingLanguage({ hearingLanguage: 'es' })).toBe('es')
  })
})
