/**
 * Speech from local models (F092): Kokoro in its own folder, run once per use by scripts/voice/speak.py.
 * Install it with scripts/install-voice.sh. One at a time: each run takes about 420 MB, and some hosts have 4 GB.
 */
import { spawn } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import readline from 'readline'

const VOICE_DIR = path.join(os.homedir(), '.aimaestro', 'voice')
const PYTHON = path.join(VOICE_DIR, '.venv', 'bin', 'python')
const SCRIPT = path.join(process.cwd(), 'scripts', 'voice', 'speak.py')
export const DEFAULT_VOICE = 'af_heart'

export const localSpeechReady = () => fs.existsSync(PYTHON) && fs.existsSync(path.join(VOICE_DIR, 'kokoro.onnx'))

let last = Promise.resolve()

/** Yields one WAV path per sentence as it is ready. Stopping early ends the process and removes the files. */
export async function* synthesize(text, voiceId, { python = PYTHON, script = SCRIPT } = {}) {
  const waiting = last
  let release
  last = new Promise((resolve) => { release = resolve })
  await waiting

  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'aim-speech-'))
  const child = spawn(python, [script, '--dir', VOICE_DIR, '--voice', voiceId || DEFAULT_VOICE, '--out', out], { stdio: ['pipe', 'pipe', 'pipe'] })
  let problem = ''
  child.stderr.on('data', (chunk) => { problem = (problem + chunk).slice(-300) })
  const finished = new Promise((resolve) => {
    child.once('error', (err) => { problem = err.message; resolve(1) })
    child.once('close', resolve)
  })
  child.stdin.on('error', () => {})
  child.stdin.end(text)
  try {
    for await (const file of readline.createInterface({ input: child.stdout })) yield file
    if (await finished !== 0) throw new Error(`speech_failed: ${problem.trim().split('\n').pop() || 'no detail'}`)
  } finally {
    child.kill('SIGKILL')
    fs.rmSync(out, { recursive: true, force: true })
    release()
  }
}
