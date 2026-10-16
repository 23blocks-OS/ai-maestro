// Local secret vault (F033).
//
// A secret is stored under an upper-case name. Agents never receive the value: they run a
// command through `aim-secret exec --use NAME`, which puts the value into the child's environment
// and scrubs it from everything the child prints before the model sees the result.
//
// Backends: macOS Keychain (`security`), libsecret (`secret-tool`), and an encrypted file used by
// tests and by hosts with neither. The file backend keeps its key next to the data, so it is only
// as safe as the file permissions; it is never chosen automatically on a desktop with a keychain.
//
// Scrubbing lowers accidental leaks. It does not stop an agent that can run commands from
// re-encoding the value; see docs/SECRETS.md.

import { execFile, spawn } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export const SERVICE = 'ai-maestro'
export const MIN_SECRET_LENGTH = 6
const NAME_RE = /^[A-Z][A-Z0-9_]{0,63}$/

export class VaultError extends Error {
  constructor(message, code = 1) {
    super(message)
    this.code = code
  }
}

export function assertSecretName(name) {
  if (typeof name !== 'string' || !NAME_RE.test(name)) {
    throw new VaultError(`invalid secret name "${String(name).slice(0, 40)}": use upper-case letters, digits and underscores, starting with a letter (for example OPENAI_API_KEY)`, 2)
  }
  return name
}

export function assertSecretValue(value) {
  if (typeof value !== 'string' || value.length < MIN_SECRET_LENGTH) {
    throw new VaultError(`a secret must be at least ${MIN_SECRET_LENGTH} characters (shorter values cannot be scrubbed from output without mangling it)`, 2)
  }
  return value
}

// ---------- paths ----------

export function vaultDir() {
  return process.env.AIM_VAULT_DIR || path.join(os.homedir(), '.aimaestro', 'vault')
}

function ensureDir() {
  const d = vaultDir()
  fs.mkdirSync(d, { recursive: true, mode: 0o700 })
  return d
}

function writeFile600(file, data) {
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, data, { mode: 0o600 })
  fs.renameSync(tmp, file)
}

// ---------- plain-language help for a failing store ----------

const HELP_DOC = 'docs/SECRETS.md, "When saving a secret fails"'

/**
 * Turns what the OS keychain / keyring said into what is wrong and how to fix it, in words a person can act on.
 * Pure: takes the tool's message (never a value) and returns a sentence, or null if it does not recognise it.
 */
export function explainBackendFailure(message, platform = process.platform) {
  const m = String(message || '')
  if (/Write permissions error|returned -61\b/i.test(m)) {
    return 'AI Maestro is running outside your desktop login session, so macOS will not let it write to your keychain. ' +
      'On this Mac, open Terminal and run: pm2 save && pm2 kill && pm2 resurrect. That restarts AI Maestro (your tmux sessions are not touched). Then try again.'
  }
  if (/User interaction is not allowed|returned -25308\b/i.test(m)) {
    return 'The login keychain is locked and nobody can answer its password prompt. On that Mac, unlock it in Terminal with: ' +
      'security unlock-keychain ~/Library/Keychains/login.keychain-db (or sign in at its screen), then try again. ' +
      'If this host has no one logged in, use a file store instead: aim-secret backend file.'
  }
  if (/User canceled|returned -128\b|authorization.*(denied|failed)|returned -25293\b/i.test(m)) {
    return 'The keychain refused access. Unlock it, approve the prompt if one appears on that Mac, and try again.'
  }
  if (/could not be found in the keychain|returned -25300\b/i.test(m)) return null
  if (platform === 'linux' && /Cannot autolaunch D-Bus|org\.freedesktop\.secrets|No such secret collection/i.test(m)) {
    return 'No unlocked keyring is available (common on a server or over ssh). Unlock one in a desktop session, or use a file store: aim-secret backend file.'
  }
  return null
}

/**
 * Error text from the OS tools can quote what they were given (`security` says: unknown command "<the
 * rest of the line>"), and that line holds the value. Nothing that may reach a card, a log or an agent
 * is allowed to carry it: quoted strings and long token-like runs are replaced.
 */
export function redactSecrets(text) {
  return String(text ?? '')
    .replace(/"[^"\n]{12,}"/g, '"[…]"')
    .replace(/'[^'\n]{12,}'/g, "'[…]'")
    .replace(/[A-Za-z0-9+/_=-]{24,}/g, '[…]')
}

// ---------- process helper (argv only, value only ever on stdin) ----------

export function backendTimeoutMs() {
  const n = Number(process.env.AIM_VAULT_TIMEOUT_MS)
  return Number.isFinite(n) && n > 0 ? n : 15000
}

function run(cmd, args, { input } = {}) {
  return new Promise((resolve, reject) => {
    const timeout = backendTimeoutMs()
    const child = execFile(cmd, args, { maxBuffer: 1024 * 1024, timeout, killSignal: 'SIGKILL' }, (err, stdout, stderr) => {
      if (err) {
        if (err.killed && err.signal) {
          // A locked or missing keyring waits for a GUI prompt that a headless session can never answer.
          return reject(new VaultError(
            `${cmd} did not answer within ${Math.round(timeout / 1000)}s. The keyring is probably locked or has no default collection ` +
            `(common on a server or over ssh). Unlock or create it in a desktop session, or set AIM_VAULT_BACKEND=file ` +
            `to use an encrypted file protected only by its permissions. More: ${HELP_DOC}.`, 6))
        }
        const said = redactSecrets(String(stderr || err.message).trim().split('\n')[0])
        const help = explainBackendFailure(`${said}\n${String(stdout || '')}`)
        const e = new VaultError(`${cmd} failed: ${said}${help ? ` ${help}` : ''} More: ${HELP_DOC}.`)
        e.exitCode = typeof err.code === 'number' ? err.code : 1
        return reject(e)
      }
      resolve(stdout)
    })
    if (input !== undefined) child.stdin.end(input)
  })
}

const enc = (v) => Buffer.from(v, 'utf8').toString('base64')
const dec = (v) => Buffer.from(v.trim(), 'base64').toString('utf8')

// ---------- name index (names only, never values) ----------

function indexFile() {
  return path.join(ensureDir(), 'names.json')
}
function readIndex() {
  try {
    const arr = JSON.parse(fs.readFileSync(indexFile(), 'utf8'))
    return Array.isArray(arr) ? arr.filter((n) => NAME_RE.test(n)) : []
  } catch {
    return []
  }
}
function writeIndex(names) {
  writeFile600(indexFile(), JSON.stringify([...new Set(names)].sort(), null, 2))
}

// ---------- backends ----------

// `security -i` reads one command per line and cuts a line at about 4096 characters; the rest is then
// run as a command of its own (and its text echoed in the error). A value whose base64 does not fit on
// one line is stored as numbered pieces (NAME#1, NAME#2, ...) plus a marker in NAME, written last so a
// failure part-way never leaves a marker pointing at pieces that are not there. '#' cannot appear in a
// valid secret name, so a piece never collides with a real secret.
const KC_LINE_VALUE_MAX = 3000
const CHUNK_MARK = 'aimchunks:'

const keychainPut = (account, b64) =>
  run('security', ['-i'], { input: `add-generic-password -U -s ${SERVICE} -a ${account} -w ${b64}\n` })

async function keychainRaw(account) {
  try {
    return (await run('security', ['find-generic-password', '-s', SERVICE, '-a', account, '-w'])).trim()
  } catch (e) {
    if (e.exitCode === 44) return null // item not found
    throw e
  }
}

async function keychainDeleteOne(account) {
  try { await run('security', ['delete-generic-password', '-s', SERVICE, '-a', account]) } catch (e) { if (e.exitCode !== 44) throw e }
}

const keychain = {
  kind: 'keychain',
  async set(name, value) {
    // `security -i` reads its commands from stdin, so the value never appears in a process listing.
    // Base64 keeps quoting trivial and allows multi-line values such as private keys.
    const b64 = enc(value)
    const previous = await keychainRaw(name).catch(() => null)
    if (b64.length <= KC_LINE_VALUE_MAX) {
      await keychainPut(name, b64)
      if (previous && previous.startsWith(CHUNK_MARK)) await this._dropPieces(name, Number(previous.slice(CHUNK_MARK.length)) || 0)
      return
    }
    const pieces = []
    for (let i = 0; i < b64.length; i += KC_LINE_VALUE_MAX) pieces.push(b64.slice(i, i + KC_LINE_VALUE_MAX))
    let written = 0
    try {
      for (let i = 0; i < pieces.length; i++) {
        await keychainPut(`${name}#${i + 1}`, pieces[i])
        written = i + 1
      }
      await keychainPut(name, `${CHUNK_MARK}${pieces.length}`)
    } catch (e) {
      await this._dropPieces(name, written).catch(() => {})
      throw e
    }
    if (previous && previous.startsWith(CHUNK_MARK)) {
      const oldCount = Number(previous.slice(CHUNK_MARK.length)) || 0
      if (oldCount > pieces.length) await this._dropPieces(name, oldCount, pieces.length)
    }
  },
  async _dropPieces(name, count, from = 0) {
    for (let i = from + 1; i <= count; i++) await keychainDeleteOne(`${name}#${i}`)
  },
  async get(name) {
    const raw = await keychainRaw(name)
    if (raw === null) return null
    if (!raw.startsWith(CHUNK_MARK)) return dec(raw)
    const count = Number(raw.slice(CHUNK_MARK.length))
    if (!Number.isInteger(count) || count < 1 || count > 1000) throw new VaultError(`the stored value of ${name} is damaged (bad piece count)`, 7)
    let joined = ''
    for (let i = 1; i <= count; i++) {
      const piece = await keychainRaw(`${name}#${i}`)
      if (piece === null) throw new VaultError(`the stored value of ${name} is damaged (piece ${i} of ${count} is missing); store it again`, 7)
      joined += piece
    }
    return dec(joined)
  },
  async delete(name) {
    const raw = await keychainRaw(name).catch(() => null)
    if (raw && raw.startsWith(CHUNK_MARK)) await this._dropPieces(name, Number(raw.slice(CHUNK_MARK.length)) || 0)
    await keychainDeleteOne(name)
  },
}

const libsecret = {
  kind: 'libsecret',
  async set(name, value) {
    await run('secret-tool', ['store', `--label=AI Maestro ${name}`, 'service', SERVICE, 'account', name], { input: enc(value) })
  },
  async get(name) {
    try {
      const out = await run('secret-tool', ['lookup', 'service', SERVICE, 'account', name])
      return out ? dec(out) : null
    } catch (e) {
      if (e.exitCode === 1) return null
      throw e
    }
  },
  async delete(name) {
    try { await run('secret-tool', ['clear', 'service', SERVICE, 'account', name]) } catch { /* already gone */ }
  },
}

function fileKey() {
  const f = path.join(ensureDir(), 'vault.key')
  if (!fs.existsSync(f)) writeFile600(f, crypto.randomBytes(32).toString('base64'))
  return Buffer.from(fs.readFileSync(f, 'utf8').trim(), 'base64')
}
const filePath = () => path.join(ensureDir(), 'secrets.json')
function readFileStore() {
  try { return JSON.parse(fs.readFileSync(filePath(), 'utf8')) } catch { return {} }
}

const fileBackend = {
  kind: 'file',
  async set(name, value) {
    const iv = crypto.randomBytes(12)
    const c = crypto.createCipheriv('aes-256-gcm', fileKey(), iv)
    const data = Buffer.concat([c.update(value, 'utf8'), c.final()])
    const store = readFileStore()
    store[name] = { iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), data: data.toString('base64') }
    writeFile600(filePath(), JSON.stringify(store))
  },
  async get(name) {
    const rec = readFileStore()[name]
    if (!rec) return null
    const d = crypto.createDecipheriv('aes-256-gcm', fileKey(), Buffer.from(rec.iv, 'base64'))
    d.setAuthTag(Buffer.from(rec.tag, 'base64'))
    return Buffer.concat([d.update(Buffer.from(rec.data, 'base64')), d.final()]).toString('utf8')
  },
  async delete(name) {
    const store = readFileStore()
    delete store[name]
    writeFile600(filePath(), JSON.stringify(store))
  },
}

function hasCommand(cmd) {
  return (process.env.PATH || '').split(path.delimiter).some((d) => d && fs.existsSync(path.join(d, cmd)))
}

const BACKENDS = ['keychain', 'libsecret', 'file']

/** Backend chosen with `aim-secret backend NAME`, stored next to the vault so every process sees it. */
export function savedBackend() {
  try {
    const v = fs.readFileSync(path.join(vaultDir(), 'backend'), 'utf8').trim()
    return BACKENDS.includes(v) ? v : null
  } catch {
    return null
  }
}

export function setSavedBackend(kind) {
  const f = path.join(ensureDir(), 'backend')
  if (kind === 'auto') {
    fs.rmSync(f, { force: true })
    return
  }
  if (!BACKENDS.includes(kind)) throw new VaultError(`unknown backend "${kind}" (use keychain, libsecret, file or auto)`, 2)
  writeFile600(f, kind + '\n')
}

export function backendSource() {
  if (process.env.AIM_VAULT_BACKEND) return 'environment'
  return savedBackend() ? 'saved setting' : 'automatic'
}

export function backendKind() {
  const forced = process.env.AIM_VAULT_BACKEND || savedBackend()
  if (BACKENDS.includes(forced)) return forced
  if (forced) throw new VaultError(`unknown AIM_VAULT_BACKEND "${forced}" (use keychain, libsecret or file)`, 2)
  if (process.platform === 'darwin') return 'keychain'
  if (process.platform === 'linux' && hasCommand('secret-tool')) return 'libsecret'
  throw new VaultError('no secure store found: on Linux install libsecret-tools (secret-tool), or set AIM_VAULT_BACKEND=file to accept a file protected only by its permissions', 4)
}

export function getBackend() {
  const kind = backendKind()
  // A test run must never write to the developer's real keychain.
  if (process.env.VITEST && kind !== 'file' && process.env.AIM_VAULT_ALLOW_REAL !== '1') {
    throw new VaultError(`refusing to use the ${kind} backend inside a test run; set AIM_VAULT_BACKEND=file`, 5)
  }
  return kind === 'keychain' ? keychain : kind === 'libsecret' ? libsecret : fileBackend
}

/**
 * Tries the real store with a throwaway item, from the process that runs it, and says what is wrong.
 * Writes only a probe name (never a user's secret) and removes it; the name index is not touched.
 */
export async function doctorVault() {
  const kind = backendKind()
  const probe = 'AIM_DOCTOR_PROBE'
  try {
    const b = getBackend()
    await b.set(probe, 'probe')
    const back = await b.get(probe)
    await b.delete(probe)
    if (back !== 'probe') return { ok: false, backend: kind, problem: 'the store accepted the write but returned something else', help: `See ${HELP_DOC}.` }
    return { ok: true, backend: kind }
  } catch (e) {
    try { await getBackend().delete(probe) } catch { /* nothing to clean */ }
    return { ok: false, backend: kind, problem: e instanceof Error ? e.message : String(e), help: `See ${HELP_DOC}.` }
  }
}

// ---------- operations ----------

export async function setSecret(name, value) {
  assertSecretName(name)
  assertSecretValue(value)
  await getBackend().set(name, value)
  writeIndex([...readIndex(), name])
}

export async function getSecret(name) {
  assertSecretName(name)
  return getBackend().get(name)
}

export async function hasSecret(name) {
  return (await getSecret(name)) !== null
}

export async function deleteSecret(name) {
  assertSecretName(name)
  await getBackend().delete(name)
  writeIndex(readIndex().filter((n) => n !== name))
}

export function listSecretNames() {
  return readIndex()
}

// ---------- scrubbing ----------

/** Every textual form of a value that is worth hiding. Longest first so a long form wins. */
export function secretVariants(value) {
  const b64 = Buffer.from(value, 'utf8').toString('base64')
  const set = new Set([
    value,
    b64,
    b64.replace(/=+$/, ''),
    b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
    encodeURIComponent(value),
    JSON.stringify(value).slice(1, -1),
    Buffer.from(value, 'utf8').toString('hex'),
  ])
  return [...set].filter((v) => v.length >= MIN_SECRET_LENGTH).sort((a, b) => b.length - a.length)
}

/**
 * Streaming scrubber. push() returns text that is safe to show; the tail that could still be the
 * start of a secret is held back until the next push or flush(), so a value split across chunks
 * is still caught.
 */
export function createScrubber(secrets) {
  const rules = []
  for (const [name, value] of Object.entries(secrets)) {
    for (const variant of secretVariants(value)) rules.push({ variant, marker: `[secret:${name}]` })
  }
  rules.sort((a, b) => b.variant.length - a.variant.length)
  const hold = rules.reduce((m, r) => Math.max(m, r.variant.length), 0) - 1
  let buf = ''
  const scrub = (text) => {
    let out = text
    for (const r of rules) out = out.split(r.variant).join(r.marker)
    return out
  }
  return {
    push(chunk) {
      buf = scrub(buf + chunk)
      if (hold <= 0) {
        const all = buf
        buf = ''
        return all
      }
      if (buf.length <= hold) return ''
      const out = buf.slice(0, buf.length - hold)
      buf = buf.slice(buf.length - hold)
      return out
    },
    flush() {
      const out = scrub(buf)
      buf = ''
      return out
    },
  }
}

// ---------- exec ----------

/** Parse `NAME` or `ENV=NAME` into { env, name }. */
export function parseUse(spec) {
  const [a, b] = spec.split('=')
  const name = b === undefined ? a : b
  const env = b === undefined ? a : a
  assertSecretName(name)
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(env)) throw new VaultError(`invalid environment variable name "${env}"`, 2)
  return { env, name }
}

/**
 * Run a command with secrets in its environment and scrubbed output.
 * Returns the child's exit code. Missing secrets stop the run before anything starts.
 */
export async function execWithSecrets({ uses, command, args = [], out = process.stdout, err = process.stderr, baseEnv = process.env }) {
  const resolved = {}
  const env = { ...baseEnv }
  for (const spec of uses) {
    const { env: envName, name } = parseUse(spec)
    const value = await getSecret(name)
    if (value === null) throw new VaultError(`secret ${name} is not set. Ask the user to run: aim-secret set ${name}`, 3)
    resolved[name] = value
    env[envName] = value
  }
  const so = createScrubber(resolved)
  const se = createScrubber(resolved)
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, stdio: ['inherit', 'pipe', 'pipe'] })
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (c) => out.write(so.push(c)))
    child.stderr.on('data', (c) => err.write(se.push(c)))
    child.on('error', (e) => reject(new VaultError(`cannot run ${command}: ${e.code || e.message}`, 127)))
    child.on('close', (code, signal) => {
      out.write(so.flush())
      err.write(se.flush())
      resolve(code === null ? (signal ? 128 : 1) : code)
    })
  })
}
