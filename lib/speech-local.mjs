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
const HEAR_SCRIPT = path.join(process.cwd(), 'scripts', 'voice', 'transcribe.py')
export const DEFAULT_VOICE = 'af_heart'

export const localSpeechReady = () => fs.existsSync(PYTHON) && fs.existsSync(path.join(VOICE_DIR, 'kokoro.onnx'))

/** Waits for its turn; the caller runs the returned function when done. On globalThis: the server and Next each load this module. */
async function turn() {
  const waiting = globalThis._speechTurn ?? Promise.resolve()
  let release
  globalThis._speechTurn = new Promise((resolve) => { release = resolve })
  await waiting
  return release
}

/** Yields one WAV path per sentence as it is ready. Stopping early ends the process and removes the files. */
export async function* synthesize(text, voiceId, { python = PYTHON, script = SCRIPT } = {}) {
  const release = await turn()

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

/** What a person said, as text. Each run takes about 350 MB, so it waits its turn with speech. */
export async function transcribe(audio, { python = PYTHON, script = HEAR_SCRIPT } = {}) {
  const release = await turn()
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aim-hear-'))
  const file = path.join(dir, 'audio.wav')
  try {
    fs.writeFileSync(file, audio, { mode: 0o600 })
    const child = spawn(python, [script, file], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, HF_HOME: path.join(VOICE_DIR, 'models') } })
    let text = ''
    let problem = ''
    child.stdout.on('data', (chunk) => { text += chunk })
    child.stderr.on('data', (chunk) => { problem = (problem + chunk).slice(-300) })
    const timer = setTimeout(() => child.kill('SIGKILL'), 60_000)
    const code = await new Promise((resolve) => {
      child.once('error', (err) => { problem = err.message; resolve(1) })
      child.once('close', resolve)
    })
    clearTimeout(timer)
    if (code !== 0) throw new Error(`speech_failed: ${problem.trim().split('\n').pop() || 'no detail'}`)
    return text.trim()
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
    release()
  }
}
