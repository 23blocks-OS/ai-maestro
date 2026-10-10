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
            `to use an encrypted file protected only by its permissions.`, 6))
        }
        const e = new VaultError(`${cmd} failed: ${String(stderr || err.message).trim().split('\n')[0]}`)
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

const keychain = {
  kind: 'keychain',
  async set(name, value) {
    // `security -i` reads its commands from stdin, so the value never appears in a process listing.
    // Base64 keeps quoting trivial and allows multi-line values such as private keys.
    await run('security', ['-i'], { input: `add-generic-password -U -s ${SERVICE} -a ${name} -w ${enc(value)}\n` })
  },
  async get(name) {
    try {
      return dec(await run('security', ['find-generic-password', '-s', SERVICE, '-a', name, '-w']))
    } catch (e) {
      if (e.exitCode === 44) return null // item not found
      throw e
    }
  },
  async delete(name) {
    try { await run('security', ['delete-generic-password', '-s', SERVICE, '-a', name]) } catch (e) { if (e.exitCode !== 44) throw e }
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

export function backendKind() {
  const forced = process.env.AIM_VAULT_BACKEND
  if (forced === 'file' || forced === 'keychain' || forced === 'libsecret') return forced
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
