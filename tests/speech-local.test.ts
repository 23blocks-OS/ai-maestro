import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { synthesize } from '@/lib/speech-local.mjs'

// A stand-in for scripts/voice/speak.py: the contract is paths on stdout, one per sentence
let dir: string
let script: string
const fake = (body: string) => fs.writeFileSync(script, `#!/bin/bash\nwhile [ $# -gt 0 ]; do [ "$1" = --out ] && OUT="$2"; [ "$1" = --voice ] && VOICE="$2"; shift; done\n${body}\n`, { mode: 0o755 })
const run = (text = 'Hi.', voice?: string) => synthesize(text, voice, { python: '/bin/bash', script })

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aim-speech-test-'))
  script = path.join(dir, 'speak.sh')
})
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

describe('synthesize', () => {
  it('yields files as they are ready, and removes them afterwards', async () => {
    fake('cat > "$OUT/text"; echo "$OUT/text"; echo "$VOICE" > "$OUT/voice"; echo "$OUT/voice"')
    const got: string[] = []
    let folder = ''
    for await (const file of run('Hello there.', 'bf_emma')) {
      got.push(fs.readFileSync(file, 'utf8').trim())
      folder = path.dirname(file)
    }
    expect(got).toEqual(['Hello there.', 'bf_emma'])
    expect(fs.existsSync(folder)).toBe(false)
  })

  it('uses the default voice when none is chosen', async () => {
    fake('echo "$VOICE" > "$OUT/v"; echo "$OUT/v"')
    for await (const file of run()) expect(fs.readFileSync(file, 'utf8').trim()).toBe('af_heart')
  })

  it('a failed run says why', async () => {
    fake('echo "Unknown voice: nope" >&2; exit 1')
    await expect(async () => { for await (const _ of run()) { /* nothing */ } }).rejects.toThrow('speech_failed: Unknown voice: nope')
  })

  it('a program that cannot start is an answer, not a hang', async () => {
    await expect(async () => { for await (const _ of synthesize('Hi.', undefined, { python: '/no/such/python', script })) { /* nothing */ } }).rejects.toThrow('speech_failed')
  })

  it('stopping early frees the next run', async () => {
    fake('echo a > "$OUT/a"; echo "$OUT/a"; sleep 30')
    let folder = ''
    for await (const file of run()) { folder = path.dirname(file); break }
    expect(fs.existsSync(folder)).toBe(false)
    fake('echo b > "$OUT/b"; echo "$OUT/b"')
    const second: string[] = []
    for await (const file of run()) second.push(fs.readFileSync(file, 'utf8').trim())
    expect(second).toEqual(['b'])
  }, 10000)

  it('runs one at a time', async () => {
    fake('T=$(python3 -c "import time;print(time.time())"); sleep 0.2; python3 -c "import time;print($T, time.time())" > "$OUT/t"; echo "$OUT/t"')
    const spans: number[][] = []
    const one = async () => { for await (const f of run()) spans.push(fs.readFileSync(f, 'utf8').trim().split(' ').map(Number)) }
    await Promise.all([one(), one()])
    spans.sort((a, b) => a[0] - b[0])
    expect(spans[1][0]).toBeGreaterThanOrEqual(spans[0][1])
  }, 10000)
})
