import { describe, it, expect, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import { listVoices, splitSentences, synthesize, wavFrom } from '@/lib/speech-elevenlabs.mjs'
import { speakWith, voiceReady } from '@/lib/speech.mjs'

const KEY = 'sk_secret_key_value'
const pcm = (bytes: number) => new Response(new Uint8Array(bytes))
const options = (fetcher: any, key: string | null = KEY) => ({ getKey: async () => key, fetcher })
const all = async (source: AsyncIterable<string>) => { const got: Buffer[] = []; for await (const f of source) got.push(fs.readFileSync(f)); return got }

describe('the audio', () => {
  it('is the WAV Kokoro makes: 16-bit mono at 24 kHz, 44-byte header', () => {
    const wav = wavFrom(Buffer.alloc(100))
    expect(wav.length).toBe(144)
    expect(wav.toString('ascii', 0, 4)).toBe('RIFF')
    expect(wav.readUInt16LE(22)).toBe(1)
    expect(wav.readUInt32LE(24)).toBe(24000)
    expect(wav.readUInt16LE(34)).toBe(16)
    expect(wav.readUInt32LE(40)).toBe(100)
  })

  it('cuts a long sentence at 8 seconds, which speaker.play can take', async () => {
    const got = await all(synthesize('One long sentence.', 'v', options(async () => pcm(400_000))))
    expect(got.map(w => w.length)).toEqual([384_044, 16_044])
    expect(got[0].length).toBeLessThanOrEqual(384 * 1024)
  })
})

describe('asking for speech', () => {
  it('sends one sentence at a time, with the ones around it, for the voice asked', async () => {
    const fetcher = vi.fn(async () => pcm(10))
    await all(synthesize('Hello there. How are you? Fine.', 'voice/1', options(fetcher)))
    expect(fetcher).toHaveBeenCalledTimes(3)
    const [url, init] = fetcher.mock.calls[1] as any
    expect(url).toBe('https://api.elevenlabs.io/v1/text-to-speech/voice%2F1?output_format=pcm_24000')
    expect(init.headers['xi-api-key']).toBe(KEY)
    expect(JSON.parse(init.body)).toMatchObject({ text: 'How are you?', previous_text: 'Hello there.', next_text: 'Fine.' })
  })

  it('the first sentence comes alone, and the rest is joined into fewer clips', async () => {
    const fetcher = vi.fn(async (_url: string, init: any) => pcm(JSON.parse(init.body).text.length * 1000))
    const got = await all(synthesize('Clean again. Fast speech, no errors. Enough testing. Ready for calls.', 'v', options(fetcher)))
    expect(fetcher).toHaveBeenCalledTimes(4)
    // 'Clean again.' alone, then the other three sentences in one clip
    expect(got.map(w => w.length)).toEqual([12_044, (23 + 15 + 16) * 1000 + 44])
  })

  it('asks ahead by about one clip of text, never the whole reply', async () => {
    const long = Array.from({ length: 12 }, (_, i) => `This is sentence number ${i + 1} of a long answer.`).join(' ')
    const fetcher = vi.fn(async () => pcm(10))
    const files = synthesize(long, 'v', options(fetcher))
    await files.next()
    await new Promise(r => setTimeout(r, 10))
    expect(fetcher.mock.calls.length).toBeGreaterThan(1)
    expect(fetcher.mock.calls.length).toBeLessThan(6)
    await files.return(undefined)
  })

  it('stopping early aborts the request in flight and removes the files', async () => {
    let aborted = false
    const fetcher = vi.fn(async (_url: string, init: any) => {
      if (fetcher.mock.calls.length === 1) return pcm(10)
      init.signal.addEventListener('abort', () => { aborted = true })
      return new Promise<Response>(() => {})
    })
    const files = synthesize('A. B.', 'v', options(fetcher))
    const { value } = await files.next()
    await files.return(undefined)
    expect(aborted).toBe(true)
    expect(fs.existsSync(path.dirname(value as string))).toBe(false)
  })

  it.each([429, 500])('tries once more after %i', async (status) => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response('', { status })).mockResolvedValueOnce(pcm(10))
    expect(await all(synthesize('Hi.', 'v', options(fetcher)))).toHaveLength(1)
  })

  it.each([401, 422])('does not retry %i', async (status) => {
    const fetcher = vi.fn(async () => new Response('', { status }))
    await expect(all(synthesize('Hi.', 'v', options(fetcher)))).rejects.toThrow(`ElevenLabs answered ${status}`)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('a failure names what was not said, and never the key', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(pcm(10)).mockResolvedValue(new Response('', { status: 401 }))
    const err: any = await all(synthesize('First. Second. Third.', 'v', options(fetcher))).catch(e => e)
    expect(err.rest).toBe('Second. Third.')
    expect(JSON.stringify({ message: err.message, rest: err.rest })).not.toContain(KEY)
  })

  it('no key or no voice is a failure with all the text left', async () => {
    const noKey: any = await all(synthesize('Hi.', 'v', options(vi.fn(), null))).catch(e => e)
    expect(noKey.rest).toBe('Hi.')
    const noVoice: any = await all(synthesize('Hi.', undefined, options(vi.fn()))).catch(e => e)
    expect(noVoice.rest).toBe('Hi.')
  })

  it('splits sentences as the local engine does', () => {
    expect(splitSentences(' One. Two! Three? Four… ')).toEqual(['One.', 'Two!', 'Three?', 'Four…'])
  })
})

describe('voices', () => {
  it('lists what the key can use, and null with no key', async () => {
    const fetcher = async () => Response.json({ voices: [{ voice_id: 'a', name: 'Rachel', category: 'premade', preview_url: 'https://x/p.mp3', labels: {} }] })
    expect(await listVoices(options(fetcher))).toEqual([{ id: 'a', name: 'Rachel', category: 'premade', previewUrl: 'https://x/p.mp3', labels: {} }])
    expect(await listVoices(options(fetcher, null))).toBeNull()
  })
})

describe('picking the engine', () => {
  const engines = (over = {}) => ({
    localReady: () => true,
    elevenLabsKey: async () => KEY,
    local: async function* (text: string, voice?: string) { yield `local:${voice ?? 'default'}:${text}` },
    elevenLabs: async function* (text: string) { yield `eleven:${text}` },
    ...over,
  }) as any
  const list = async (source: AsyncIterable<string>) => { const got: string[] = []; for await (const f of source) got.push(f); return got }

  it('a local voice behaves as before', async () => {
    expect(await list(speakWith('Hi.', { engine: 'local', voiceId: 'af_heart' }, engines()))).toEqual(['local:af_heart:Hi.'])
  })

  it('an ElevenLabs voice uses ElevenLabs', async () => {
    expect(await list(speakWith('Hi.', { engine: 'elevenlabs', voiceId: 'v' }, engines()))).toEqual(['eleven:Hi.'])
  })

  it('local speech finishes the reply when ElevenLabs fails midway, in its own default voice', async () => {
    const failing = engines({ elevenLabs: async function* () { yield 'eleven:First.'; throw Object.assign(new Error('ElevenLabs answered 401'), { rest: 'Second.' }) } })
    vi.spyOn(console, 'error').mockImplementationOnce(() => {})
    expect(await list(speakWith('First. Second.', { engine: 'elevenlabs', voiceId: 'v' }, failing))).toEqual(['eleven:First.', 'local:default:Second.'])
  })

  it('with no local speech the failure is an answer', async () => {
    const failing = engines({ localReady: () => false, elevenLabs: async function* () { throw new Error('down') } })
    vi.spyOn(console, 'error').mockImplementationOnce(() => {})
    await expect(list(speakWith('Hi.', { engine: 'elevenlabs', voiceId: 'v' }, failing))).rejects.toThrow('speech_failed: down')
  })

  it('is ready when it can speak somehow, and never with no voice', async () => {
    const noLocal = { localReady: () => false }
    expect(await voiceReady(undefined, engines())).toBe(false)
    expect(await voiceReady({ engine: 'elevenlabs', voiceId: 'v' }, engines(noLocal))).toBe(true)
    expect(await voiceReady({ engine: 'elevenlabs' }, engines(noLocal))).toBe(false)
    expect(await voiceReady({ engine: 'elevenlabs', voiceId: 'v' }, engines({ ...noLocal, elevenLabsKey: async () => null }))).toBe(false)
    expect(await voiceReady({ engine: 'elevenlabs' }, engines())).toBe(true)
  })
})

describe('hearing with Scribe (F099)', async () => {
  const { transcribe } = await import('@/lib/hearing-elevenlabs.mjs')
  const { hear, hearingBy } = await import('@/lib/speech.mjs')
  const wav = Buffer.from('RIFF....WAVE')

  it('sends one clip, told English, with the key only in the header', async () => {
    const fetcher = vi.fn(async (_url: string, _init: any) => Response.json({ text: ' Hey Lola. ', language_code: 'en' }))
    expect(await transcribe(wav, options(fetcher))).toBe('Hey Lola.')
    const [url, init] = fetcher.mock.calls[0] as any
    expect(url).toBe('https://api.elevenlabs.io/v1/speech-to-text')
    expect(init.headers['xi-api-key']).toBe(KEY)
    expect(init.body.get('model_id')).toBe('scribe_v2')
    expect(init.body.get('language_code')).toBe('en')
    expect(Buffer.from(await init.body.get('file').arrayBuffer()).equals(wav)).toBe(true)
  })

  it('sends the clip again on a retry', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response('', { status: 503 })).mockResolvedValueOnce(Response.json({ text: 'ok' }))
    expect(await transcribe(wav, options(fetcher))).toBe('ok')
    expect((fetcher.mock.calls[1] as any)[1].body.get('file')).toBeTruthy()
  })

  it('a failure never carries the key', async () => {
    const err: any = await transcribe(wav, options(async () => new Response('', { status: 401 }))).catch(e => e)
    expect(err.message).toBe('ElevenLabs answered 401')
    expect(String(err.stack)).not.toContain(KEY)
  })

  const engines = (over = {}) => ({
    elevenLabsKey: async () => KEY,
    scribe: vi.fn(async () => 'from scribe'),
    localHear: vi.fn(async () => 'from local'),
    ...over,
  }) as any
  const quiet = () => { vi.spyOn(console, 'log').mockImplementation(() => {}); vi.spyOn(console, 'error').mockImplementation(() => {}) }

  it('is per agent: an ElevenLabs voice is heard by Scribe, a local voice stays local on the same host', async () => {
    quiet()
    const e = engines()
    expect(await hear(wav, { engine: 'elevenlabs', voiceId: 'v' }, e)).toBe('from scribe')
    expect(await hear(wav, { engine: 'local' }, e)).toBe('from local')
    expect(await hear(wav, undefined, e)).toBe('from local')
    expect(e.scribe).toHaveBeenCalledTimes(1)
    vi.restoreAllMocks()
  })

  it('falls back to local hearing when Scribe fails, and with no key', async () => {
    quiet()
    expect(await hear(wav, { engine: 'elevenlabs' }, engines({ scribe: async () => { throw new Error('down') } }))).toBe('from local')
    expect(await hear(wav, { engine: 'elevenlabs' }, engines({ elevenLabsKey: async () => null }))).toBe('from local')
    vi.restoreAllMocks()
  })

  it('names who hears a device only when it leaves the host', async () => {
    expect(await hearingBy({ engine: 'elevenlabs' }, engines())).toBe('ElevenLabs')
    expect(await hearingBy({ engine: 'elevenlabs' }, engines({ elevenLabsKey: async () => null }))).toBeNull()
    expect(await hearingBy({ engine: 'local' }, engines())).toBeNull()
  })
})
