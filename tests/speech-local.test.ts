import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { synthesize, transcribe } from '@/lib/speech-local.mjs'

// A stand-in for scripts/voice/serve.py: the contract is one JSON request per line, JSON lines back
let dir: string
let script: string
const HEAD = `import json, os, sys, time\nfor line in sys.stdin:\n    r = json.loads(line)\n    say = lambda **f: print(json.dumps({"id": r.get("id"), **f}), flush=True)\n`
const fake = (body: string) => fs.writeFileSync(script, HEAD + body.split('\n').map(l => `    ${l}`).join('\n') + '\n')
const options = (extra = {}) => ({ python: 'python3', script, ...extra })
const read = async (source: AsyncIterable<string>) => { const got: string[] = []; for await (const f of source) got.push(fs.readFileSync(f, 'utf8').trim()); return got }
const WRITE = (name: string, text: string) => `open(os.path.join(r["out"], "${name}"), "w").write(${text})\nsay(file=os.path.join(r["out"], "${name}"))`

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aim-speech-test-'))
  script = path.join(dir, 'serve.py')
})
afterEach(() => {
  const g = globalThis as any
  g._speechWorker?.child.kill('SIGKILL')
  g._speechWorker = undefined
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('synthesize', () => {
  it('yields files as they are ready, and removes them afterwards', async () => {
    fake(`${WRITE('a', 'r["text"]')}\n${WRITE('b', 'r["voice"]')}\nsay(done=True)`)
    let folder = ''
    const got: string[] = []
    for await (const file of synthesize('Hello there.', 'bf_emma', options())) {
      got.push(fs.readFileSync(file, 'utf8'))
      folder = path.dirname(file)
    }
    expect(got).toEqual(['Hello there.', 'bf_emma'])
    expect(fs.existsSync(folder)).toBe(false)
  })

  it('uses the default voice when none is chosen', async () => {
    fake(`${WRITE('v', 'r["voice"]')}\nsay(done=True)`)
    expect(await read(synthesize('Hi.', undefined, options()))).toEqual(['af_heart'])
  })

  it('stays warm: the second request does not start again', async () => {
    fake(`${WRITE('p', 'str(os.getpid())')}\nsay(done=True)`)
    const [first] = await read(synthesize('Hi.', undefined, options()))
    const [second] = await read(synthesize('Hi.', undefined, options()))
    expect(second).toBe(first)
  })

  it('ends after a quiet spell, so an idle host holds nothing', async () => {
    fake(`${WRITE('p', 'str(os.getpid())')}\nsay(done=True)`)
    await read(synthesize('Hi.', undefined, options({ idleMs: 30 })))
    const worker = (globalThis as any)._speechWorker
    await expect.poll(() => worker.dead, { timeout: 2000 }).toBe(true)
  })

  it('a bad request says why, and the next one starts clean', async () => {
    fake(`if r["text"] == "bad":\n    say(error="Unknown voice: nope")\n    continue\n${WRITE('p', 'str(os.getpid())')}\nsay(done=True)`)
    const [before] = await read(synthesize('Hi.', undefined, options()))
    await expect(read(synthesize('bad', undefined, options()))).rejects.toThrow('speech_failed: Unknown voice: nope')
    const [after] = await read(synthesize('Hi.', undefined, options()))
    expect(after).not.toBe(before)
  })

  it('a program that dies or cannot start is an answer, not a hang', async () => {
    fake('sys.stderr.write("no model\\n")\nsys.exit(1)')
    await expect(read(synthesize('Hi.', undefined, options()))).rejects.toThrow('speech_failed: no model')
    await expect(read(synthesize('Hi.', undefined, { python: '/no/such/python', script }))).rejects.toThrow('speech_failed')
  })

  it('stopping early ends the program, so a late answer cannot reach the next request', async () => {
    fake(`${WRITE('a', '"one"')}\ntime.sleep(30)\nsay(done=True)`)
    let folder = ''
    for await (const file of synthesize('Hi.', undefined, options())) { folder = path.dirname(file); break }
    expect(fs.existsSync(folder)).toBe(false)
    fake(`${WRITE('b', '"two"')}\nsay(done=True)`)
    expect(await read(synthesize('Hi.', undefined, options()))).toEqual(['two'])
  }, 10000)

  it('runs one at a time', async () => {
    fake(`t = time.time()\ntime.sleep(0.2)\n${WRITE('t', 'f"{t} {time.time()}"')}\nsay(done=True)`)
    const spans: number[][] = []
    const one = async () => { for (const line of await read(synthesize('Hi.', undefined, options()))) spans.push(line.split(' ').map(Number)) }
    await Promise.all([one(), one()])
    spans.sort((a, b) => a[0] - b[0])
    expect(spans[1][0]).toBeGreaterThanOrEqual(spans[0][1])
  }, 10000)
})

describe('transcribe', () => {
  it('says the language, so hearing never guesses it (B036)', async () => {
    fake('say(text=r.get("language", "none"), done=True)')
    expect(await transcribe(Buffer.from('RIFF'), options())).toBe('en')
  })

  it('gives the text, from a private temporary file it removes', async () => {
    fake('import stat\nsay(text=open(r["file"]).read() + " " + oct(stat.S_IMODE(os.stat(r["file"]).st_mode)) + " " + r["file"], done=True)')
    const [text, mode, file] = (await transcribe(Buffer.from('RIFF'), options())).split(' ')
    expect(text).toBe('RIFF')
    expect(mode).toBe('0o600')
    expect(fs.existsSync(file)).toBe(false)
  })

  it('a failed run says why, and the next one is not stuck behind it', async () => {
    fake('if open(r["file"]).read() == "bad":\n    say(error="no model")\n    continue\nsay(text="fine", done=True)')
    await expect(transcribe(Buffer.from('bad'), options())).rejects.toThrow('speech_failed: no model')
    expect(await transcribe(Buffer.from('good'), options())).toBe('fine')
  })
})
