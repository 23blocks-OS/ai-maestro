/**
 * Speech and hearing from local models (F092): Kokoro and faster-whisper in their own folder, run by
 * scripts/voice/serve.py. Install them with scripts/install-voice.sh. Loading costs seconds, so the program stays
 * up while a person is talking and ends after a quiet spell: an idle host holds no model in memory.
 * One request at a time: each model takes about 400 MB, and some hosts have 4 GB.
 */
import { spawn } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import readline from 'readline'

const VOICE_DIR = path.join(os.homedir(), '.aimaestro', 'voice')
const PYTHON = path.join(VOICE_DIR, '.venv', 'bin', 'python')
const SCRIPT = path.join(process.cwd(), 'scripts', 'voice', 'serve.py')
const IDLE_MS = 120_000
const ANSWER_MS = 60_000 // covers loading a model on a small host
export const DEFAULT_VOICE = 'af_heart'
// shortcut: English only for now (B036); make it a setting on the agent when Spanish comes
export const HEARING_LANGUAGE = 'en'

export const localSpeechReady = () => fs.existsSync(PYTHON) && fs.existsSync(path.join(VOICE_DIR, 'kokoro.onnx'))

/** Waits for its turn; the caller runs the returned function when done. On globalThis: the server and Next each load this module. */
async function turn() {
  const waiting = globalThis._speechTurn ?? Promise.resolve()
  let release
  globalThis._speechTurn = new Promise((resolve) => { release = resolve })
  await waiting
  return release
}

function stopWorker(worker) {
  if (!worker) return
  clearTimeout(worker.idle)
  // Forgotten now, not when it closes: the next request must not write to a dying program
  if (globalThis._speechWorker === worker) globalThis._speechWorker = undefined
  if (!worker.dead) worker.child.kill('SIGKILL')
}

function startWorker(python, script) {
  const child = spawn(python, [script, '--dir', VOICE_DIR], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, HF_HOME: path.join(VOICE_DIR, 'models') },
  })
  const worker = { child, python, script, dead: false, problem: '', listener: null, idle: null }
  child.stderr.on('data', (chunk) => { worker.problem = (worker.problem + chunk).slice(-300) })
  child.stdin.on('error', () => {})
  const ended = (message) => {
    if (worker.dead) return
    worker.dead = true
    clearTimeout(worker.idle)
    worker.listener?.({ error: message || worker.problem.trim().split('\n').pop() || 'it stopped' })
  }
  child.once('error', (err) => ended(err.message))
  child.once('close', () => ended())
  readline.createInterface({ input: child.stdout }).on('line', (line) => {
    try {
      worker.listener?.(JSON.parse(line))
    } catch { /* a library printing to stdout is not an answer */ }
  })
  return worker
}

function warmWorker(python, script) {
  const current = globalThis._speechWorker
  if (current && !current.dead && current.python === python && current.script === script) {
    clearTimeout(current.idle)
    return current
  }
  stopWorker(current)
  globalThis._speechWorker = startWorker(python, script)
  return globalThis._speechWorker
}

/** The answers to one request, in order, ending at `done`. */
async function* ask(worker, request) {
  const answers = []
  let wake = () => {}
  worker.listener = (answer) => {
    answers.push(answer)
    wake()
  }
  worker.child.stdin.write(`${JSON.stringify(request)}\n`)
  try {
    for (;;) {
      if (!answers.length) {
        // A hung program must not hold the turn for ever: ending it reaches the listener as an error
        const limit = setTimeout(() => stopWorker(worker), ANSWER_MS)
        await new Promise((resolve) => { wake = resolve })
        clearTimeout(limit)
      }
      const answer = answers.shift()
      if (answer.error) throw new Error(`speech_failed: ${answer.error}`)
      yield answer
      if (answer.done) return
    }
  } finally {
    worker.listener = null
  }
}

function keepWarm(worker, idleMs) {
  clearTimeout(worker.idle)
  worker.idle = setTimeout(() => stopWorker(worker), idleMs)
  worker.idle.unref?.()
}

/** Yields one WAV path per sentence as it is ready. Stopping early ends the program and removes the files. */
export async function* synthesize(text, voiceId, { python = PYTHON, script = SCRIPT, idleMs = IDLE_MS } = {}) {
  const release = await turn()
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'aim-speech-'))
  const worker = warmWorker(python, script)
  let finished = false
  try {
    for await (const answer of ask(worker, { op: 'say', text, voice: voiceId || DEFAULT_VOICE, out })) {
      if (answer.done) finished = true
      else yield answer.file
    }
  } finally {
    // It may still be making the rest of what was asked, and a later answer would be taken for the next request's
    if (finished) keepWarm(worker, idleMs)
    else stopWorker(worker)
    fs.rmSync(out, { recursive: true, force: true })
    release()
  }
}

/** What a person said, as text. */
export async function transcribe(audio, { python = PYTHON, script = SCRIPT, idleMs = IDLE_MS } = {}) {
  const release = await turn()
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aim-hear-'))
  const file = path.join(dir, 'audio.wav')
  const worker = warmWorker(python, script)
  let text = ''
  let finished = false
  try {
    fs.writeFileSync(file, audio, { mode: 0o600 })
    for await (const answer of ask(worker, { op: 'hear', file, language: HEARING_LANGUAGE })) {
      if (answer.done) {
        text = answer.text ?? ''
        finished = true
      }
    }
    return text.trim()
  } finally {
    if (finished) keepWarm(worker, idleMs)
    else stopWorker(worker)
    fs.rmSync(dir, { recursive: true, force: true })
    release()
  }
}
