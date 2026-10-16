import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { execFile, spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  assertSecretName, createScrubber, secretVariants, setSecret, getSecret, listSecretNames, deleteSecret, getBackend, explainBackendFailure, doctorVault, redactSecrets,
} from '../lib/secret-vault.mjs'

const CLI = path.resolve(__dirname, '../scripts/aim-secret.mjs')
const SECRET = 'sk-live-ABCdef123456+/xyz=9Q'
let dir: string
let env: NodeJS.ProcessEnv

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aim-vault-'))
  env = { PATH: process.env.PATH, HOME: dir, AIM_VAULT_BACKEND: 'file', AIM_VAULT_DIR: path.join(dir, 'vault') } as unknown as NodeJS.ProcessEnv
  process.env.AIM_VAULT_BACKEND = 'file'
  process.env.AIM_VAULT_DIR = path.join(dir, 'vault')
})
afterEach(() => {
  delete process.env.AIM_VAULT_BACKEND
  delete process.env.AIM_VAULT_DIR
  fs.rmSync(dir, { recursive: true, force: true })
})

function cli(args: string[], input?: string): Promise<{ code: number; out: string; err: string }> {
  return new Promise((resolve) => {
    const c = spawn('node', [CLI, ...args], { env, stdio: ['pipe', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    c.stdout.on('data', (d) => (out += d))
    c.stderr.on('data', (d) => (err += d))
    c.on('close', (code) => resolve({ code: code ?? -1, out, err }))
    c.stdin.end(input ?? '')
  })
}

function allFiles(root: string): string[] {
  const out: string[] = []
  for (const e of fs.readdirSync(root, { withFileTypes: true })) {
    const p = path.join(root, e.name)
    if (e.isDirectory()) out.push(...allFiles(p))
    else out.push(p)
  }
  return out
}

describe('names and values', () => {
  it('accepts env-style names only', () => {
    expect(assertSecretName('OPENAI_API_KEY')).toBe('OPENAI_API_KEY')
    for (const bad of ['lower', '1ABC', 'A-B', 'A B', '', 'A'.repeat(65), '../x', 'A;rm']) {
      expect(() => assertSecretName(bad)).toThrow()
    }
  })

  it('rejects values too short to scrub safely', async () => {
    await expect(setSecret('SHORT', 'abc')).rejects.toThrow(/at least/)
  })
})

describe('storage', () => {
  it('round-trips a value and lists names only', async () => {
    await setSecret('OPENAI_API_KEY', SECRET)
    expect(await getSecret('OPENAI_API_KEY')).toBe(SECRET)
    expect(listSecretNames()).toEqual(['OPENAI_API_KEY'])
    await deleteSecret('OPENAI_API_KEY')
    expect(await getSecret('OPENAI_API_KEY')).toBeNull()
    expect(listSecretNames()).toEqual([])
  })

  it('keeps multi-line values (private keys) intact', async () => {
    const pem = '-----BEGIN KEY-----\nabc123def456\n-----END KEY-----'
    await setSecret('SSH_KEY', pem)
    expect(await getSecret('SSH_KEY')).toBe(pem)
  })

  it('does not store the plaintext (or an encoding of it) on disk', async () => {
    await setSecret('OPENAI_API_KEY', SECRET)
    for (const f of allFiles(dir)) {
      const text = fs.readFileSync(f, 'utf8')
      for (const v of secretVariants(SECRET)) expect(text, f).not.toContain(v)
    }
  })

  it('writes vault files owner-only', async () => {
    await setSecret('OPENAI_API_KEY', SECRET)
    for (const f of allFiles(path.join(dir, 'vault'))) expect(fs.statSync(f).mode & 0o077, f).toBe(0)
  })

  it('refuses a real keychain inside a test run', () => {
    process.env.AIM_VAULT_BACKEND = 'keychain'
    expect(() => getBackend()).toThrow(/refusing/)
  })
})

describe('saved backend setting', () => {
  it('is remembered by every later process and beats automatic choice, but not the environment', async () => {
    delete process.env.AIM_VAULT_BACKEND
    const e2 = { PATH: env.PATH, HOME: dir, AIM_VAULT_DIR: path.join(dir, 'vault') } as unknown as NodeJS.ProcessEnv
    const run = (args: string[], input = '') => new Promise<{ code: number; out: string; err: string }>((resolve) => {
      const c = spawn('node', [CLI, ...args], { env: e2, stdio: ['pipe', 'pipe', 'pipe'] })
      let out = ''; let err = ''
      c.stdout.on('data', (d) => (out += d)); c.stderr.on('data', (d) => (err += d))
      c.on('close', (code) => resolve({ code: code ?? -1, out, err })); c.stdin.end(input)
    })
    expect((await run(['backend', 'file'])).code).toBe(0)
    expect((await run(['status'])).out).toContain('file (saved setting)')
    expect((await run(['set', 'MY_KEY', '--stdin'], SECRET)).code).toBe(0)
    expect((await run(['exec', '--use', 'MY_KEY', '--', 'node', '-e', 'process.stdout.write(process.env.MY_KEY)'])).out).toBe('[secret:MY_KEY]')
    expect((await run(['backend', 'nonsense'])).code).toBe(2)
    expect((await run(['backend', 'auto'])).out).toContain('automatic')
    expect(fs.existsSync(path.join(dir, 'vault', 'backend'))).toBe(false)
    expect((await run(['backend', 'file'])).code).toBe(0)
    expect(fs.statSync(path.join(dir, 'vault', 'backend')).mode & 0o077).toBe(0)
  })
})

describe('installer', () => {
  it('puts a working aim-secret on a PATH directory', async () => {
    const bin = path.join(dir, 'localbin')
    await new Promise<void>((resolve) => execFile('bash', [path.resolve(__dirname, '../scripts/install-aim-secret.sh')], { env: { ...env, AIM_BIN_DIR: bin } }, () => resolve()))
    const out = await new Promise<string>((resolve) => execFile(path.join(bin, 'aim-secret'), ['status'], { env }, (_e, so) => resolve(so)))
    expect(out).toContain('backend: file (environment)')
  })

  it('records the node that installed it and still works when the PATH has no node', async () => {
    const bin = path.join(dir, 'localbin2')
    await new Promise<void>((resolve) => execFile('bash', [path.resolve(__dirname, '../scripts/install-aim-secret.sh')], { env: { ...env, AIM_BIN_DIR: bin } }, () => resolve()))
    const launcher = fs.readFileSync(path.join(bin, 'aim-secret'), 'utf8')
    expect(launcher).toMatch(/^NODE="\/[^"]+\/node"$/m)   // an absolute path, not a bare `node`
    // a shell whose PATH has no node at all (an agent's session without nvm)
    const out = await new Promise<string>((resolve) =>
      execFile('/bin/bash', [path.join(bin, 'aim-secret'), 'status'], { env: { ...env, PATH: '/usr/bin:/bin' } as unknown as NodeJS.ProcessEnv }, (_e, so) => resolve(so)))
    expect(out).toContain('backend: file')
  })
})

describe('a keyring that never answers', () => {
  it('fails with a clear message instead of hanging', async () => {
    const bin = path.join(dir, 'bin')
    fs.mkdirSync(bin)
    fs.writeFileSync(path.join(bin, 'secret-tool'), '#!/bin/bash\nsleep 30\n', { mode: 0o755 })
    const r = await new Promise<{ code: number; err: string; ms: number }>((resolve) => {
      const t0 = Date.now()
      const c = spawn('node', [CLI, 'set', 'MY_KEY', '--stdin'], {
        env: { ...env, PATH: `${bin}:${process.env.PATH}`, AIM_VAULT_BACKEND: 'libsecret', AIM_VAULT_ALLOW_REAL: '1', VITEST: '1', AIM_VAULT_TIMEOUT_MS: '400' },
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      let err = ''
      c.stderr.on('data', (d) => (err += d))
      c.on('close', (code) => resolve({ code: code ?? -1, err, ms: Date.now() - t0 }))
      c.stdin.end('some-secret-value')
    })
    expect(r.code).toBe(6)
    expect(r.err).toMatch(/did not answer/)
    expect(r.err).toMatch(/AIM_VAULT_BACKEND=file/)
    expect(r.err).not.toContain('some-secret-value')
    expect(r.ms).toBeLessThan(8000)
  })
})

describe('scrubber', () => {
  it('replaces the value and its common encodings', () => {
    const s = createScrubber({ K: SECRET })
    const forms = secretVariants(SECRET)
    const out = s.push(forms.join(' | ') + '\n') + s.flush()
    for (const v of forms) expect(out).not.toContain(v)
    expect(out).toContain('[secret:K]')
  })

  it('catches a value split across chunks at every position', () => {
    const text = `before ${SECRET} after`
    for (let i = 1; i < text.length; i++) {
      const s = createScrubber({ K: SECRET })
      const out = s.push(text.slice(0, i)) + s.push(text.slice(i)) + s.flush()
      expect(out, `split at ${i}`).toBe('before [secret:K] after')
    }
  })

  it('catches a value split into one-character chunks', () => {
    const s = createScrubber({ K: SECRET })
    let out = ''
    for (const ch of `x${SECRET}y`) out += s.push(ch)
    expect(out + s.flush()).toBe('x[secret:K]y')
  })

  it('leaves unrelated output alone', () => {
    const s = createScrubber({ K: SECRET })
    expect(s.push('hello world\n') + s.flush()).toBe('hello world\n')
  })
})

describe('CLI', () => {
  it('refuses a secret given as an argument and never echoes it', async () => {
    const r = await cli(['set', 'OPENAI_API_KEY', SECRET])
    expect(r.code).toBe(2)
    expect(r.out + r.err).not.toContain(SECRET)
    expect(listSecretNames()).toEqual([])
  })

  it('stores from stdin, lists names, reports status, never prints the value', async () => {
    const set = await cli(['set', 'OPENAI_API_KEY', '--stdin'].slice(0, 2).concat('--stdin'), SECRET + '\n')
    expect(set.code).toBe(0)
    expect((await cli(['list'])).out.trim()).toBe('OPENAI_API_KEY')
    expect((await cli(['has', 'OPENAI_API_KEY'])).code).toBe(0)
    expect((await cli(['has', 'NOPE_KEY'])).code).toBe(1)
    const all = [set, await cli(['list']), await cli(['status'])].map((r) => r.out + r.err).join('')
    expect(all).not.toContain(SECRET)
  })

  it('exec injects the value, scrubs the output and keeps the exit code', async () => {
    await cli(['set', 'MY_KEY', '--stdin'], SECRET)
    const r = await cli(['exec', '--use', 'MY_KEY', '--', 'node', '-e', 'process.stdout.write("token=" + process.env.MY_KEY); process.stderr.write(process.env.MY_KEY); process.exit(7)'])
    expect(r.code).toBe(7)
    expect(r.out).toBe('token=[secret:MY_KEY]')
    expect(r.err).toBe('[secret:MY_KEY]')
  })

  it('exec scrubs an encoded value and maps ENV=NAME', async () => {
    await cli(['set', 'MY_KEY', '--stdin'], SECRET)
    const r = await cli(['exec', '--use', 'OPENAI_API_KEY=MY_KEY', '--', 'node', '-e',
      'const v=process.env.OPENAI_API_KEY;process.stdout.write(Buffer.from(v).toString("base64")+" "+encodeURIComponent(v))'])
    expect(r.out).toBe('[secret:MY_KEY] [secret:MY_KEY]')
  })

  it('exec stops with exit 3 and a helpful message when the secret is missing', async () => {
    const r = await cli(['exec', '--use', 'MISSING_KEY', '--', 'node', '-e', 'process.stdout.write("ran")'])
    expect(r.code).toBe(3)
    expect(r.out).toBe('')
    expect(r.err).toContain('aim-secret set MISSING_KEY')
  })

  it('exec does not use a shell: metacharacters stay literal', async () => {
    await cli(['set', 'MY_KEY', '--stdin'], SECRET)
    const r = await cli(['exec', '--use', 'MY_KEY', '--', 'node', '-e', 'process.stdout.write(process.argv[1])', 'a;b|c$(d)'])
    expect(r.out).toBe('a;b|c$(d)')
  })
})

describe('what the model can see', () => {
  it('a transcript built from tool output never contains the secret, even when the command prints it', async () => {
    await cli(['set', 'MY_KEY', '--stdin'], SECRET)
    // The "agent" runs three commands that try to expose the value, and records each result in
    // a transcript exactly as a chat would.
    const transcript = path.join(dir, 'transcript.jsonl')
    const attempts = [
      'process.stdout.write(process.env.MY_KEY)',
      'console.log(JSON.stringify({key: process.env.MY_KEY}))',
      'process.stderr.write("debug: " + Buffer.from(process.env.MY_KEY).toString("base64url"))',
    ]
    for (const js of attempts) {
      const r = await cli(['exec', '--use', 'MY_KEY', '--', 'node', '-e', js])
      fs.appendFileSync(transcript, JSON.stringify({ tool: 'Bash', command: `aim-secret exec --use MY_KEY -- node -e '${js.slice(0, 20)}…'`, result: r.out + r.err }) + '\n')
    }
    const text = fs.readFileSync(transcript, 'utf8')
    for (const v of secretVariants(SECRET)) expect(text).not.toContain(v)
    expect(text).toContain('[secret:MY_KEY]')
  })
})

describe('help when the store fails', () => {
  it('explains the macOS errors in plain words', () => {
    expect(explainBackendFailure('security: SecKeychainItemCreateFromContent (<default>): Write permissions error.')).toMatch(/pm2 kill/)
    expect(explainBackendFailure('add-generic-password: returned -61')).toMatch(/outside your desktop login session/)
    expect(explainBackendFailure('SecKeychainItemCreateFromContent: User interaction is not allowed.')).toMatch(/unlock-keychain/)
    expect(explainBackendFailure('returned -25308')).toMatch(/locked/)
    expect(explainBackendFailure('something we have never seen')).toBeNull()
    expect(explainBackendFailure('')).toBeNull()
  })

  it('doctor passes on a working store and leaves nothing behind', async () => {
    const r = await doctorVault()
    expect(r).toEqual({ ok: true, backend: 'file' })
    expect(listSecretNames()).toEqual([])
    expect(await getSecret('AIM_DOCTOR_PROBE')).toBeNull()
  })

  it('a locked or refused keychain is explained, and the value is never in the message', async () => {
    const bin = path.join(dir, 'bin')
    fs.mkdirSync(bin)
    fs.writeFileSync(path.join(bin, 'security'), '#!/bin/bash\n[ "$1" = "-i" ] && cat >/dev/null\necho "security: SecKeychainItemCreateFromContent (<default>): Write permissions error." >&2\nexit 1\n', { mode: 0o755 })
    const kenv = { ...env, PATH: `${bin}:${process.env.PATH}`, AIM_VAULT_BACKEND: 'keychain', AIM_VAULT_ALLOW_REAL: '1', VITEST: '1' }
    const set = await new Promise<{ code: number; err: string }>((resolve) => {
      const c = spawn('node', [CLI, 'set', 'MY_KEY', '--stdin'], { env: kenv, stdio: ['pipe', 'pipe', 'pipe'] })
      let err = ''
      c.stderr.on('data', (d) => (err += d))
      c.on('close', (code) => resolve({ code: code ?? -1, err }))
      c.stdin.end('some-secret-value')
    })
    expect(set.code).not.toBe(0)
    expect(set.err).toMatch(/pm2 save && pm2 kill && pm2 resurrect/)
    expect(set.err).toMatch(/When saving a secret fails/)
    expect(set.err).not.toContain('some-secret-value')
    const doctor = await new Promise<{ code: number; err: string }>((resolve) => {
      const c = spawn('node', [CLI, 'doctor'], { env: kenv, stdio: ['pipe', 'pipe', 'pipe'] })
      let err = ''
      c.stderr.on('data', (d) => (err += d))
      c.on('close', (code) => resolve({ code: code ?? -1, err }))
      c.stdin.end()
    })
    expect(doctor.code).toBe(1)
    expect(doctor.err).toMatch(/cannot save a secret here/)
    expect(doctor.err).toMatch(/pm2 kill/)
  })
})

describe('long values in the macOS keychain', () => {
  // A stand-in for `security` that keeps items in files and, like the real one, cuts an interactive line
  // at about 4096 characters and runs the rest as a command (echoing it in the error).
  function shim(): { bin: string; store: string } {
    const bin = path.join(dir, 'shimbin')
    const store = path.join(dir, 'kc')
    fs.mkdirSync(bin, { recursive: true })
    fs.mkdirSync(store, { recursive: true })
    fs.writeFileSync(path.join(bin, 'security'), `#!/bin/bash
STORE="${store}"
acct() { while [ $# -gt 0 ]; do [ "$1" = "-a" ] && { echo "$2"; return; }; shift; done; }
file() { echo "$STORE/$(echo "$1" | tr '#' '_')"; }
case "$1" in
  -i)
    while IFS= read -r line; do
      if [ \${#line} -gt 4090 ]; then
        echo "security: unknown command \"\${line:4090}\"" >&2; exit 1
      fi
      set -- $line
      a=$(acct "$@"); v="\${line##* -w }"
      printf '%s' "$v" > "$(file "$a")"
    done ;;
  find-generic-password) a=$(acct "$@"); f="$(file "$a")"; [ -f "$f" ] || exit 44; cat "$f"; echo ;;
  delete-generic-password) a=$(acct "$@"); f="$(file "$a")"; [ -f "$f" ] || exit 44; rm -f "$f" ;;
  *) exit 1 ;;
esac
`, { mode: 0o755 })
    return { bin, store }
  }
  function vault(sh: { bin: string }, js: string): Promise<{ code: number; out: string; err: string }> {
    return new Promise((resolve) => {
      const c = spawn('node', ['--input-type=module', '-e',
        `import * as v from ${JSON.stringify(path.resolve(__dirname, '../lib/secret-vault.mjs'))}\n${js}`],
      { env: { ...env, PATH: `${sh.bin}:${process.env.PATH}`, AIM_VAULT_BACKEND: 'keychain', AIM_VAULT_ALLOW_REAL: '1', VITEST: '1' }, stdio: ['pipe', 'pipe', 'pipe'] })
      let out = ''
      let err = ''
      c.stdout.on('data', (d) => (out += d))
      c.stderr.on('data', (d) => (err += d))
      c.on('close', (code) => resolve({ code: code ?? -1, out, err }))
      c.stdin.end()
    })
  }
  const LONG = 'eyJ' + 'abcdEFGH0123456789_-'.repeat(350) // 7 KB, a long token

  it('stores and reads back a value longer than one interactive line', async () => {
    const sh = shim()
    const r = await vault(sh, `await v.setSecret('FORMS_ADMIN_TOKEN', ${JSON.stringify(LONG)}); const back = await v.getSecret('FORMS_ADMIN_TOKEN'); console.log(back === ${JSON.stringify(LONG)} ? 'SAME' : 'DIFFERENT')`)
    expect(r.err).toBe('')
    expect(r.out.trim()).toBe('SAME')
    expect(fs.readdirSync(sh.store).filter((f) => f.startsWith('FORMS_ADMIN_TOKEN_')).length).toBeGreaterThan(1)
  })

  it('keeps a short value as one item, as before', async () => {
    const sh = shim()
    const r = await vault(sh, `await v.setSecret('SHORT_KEY', 'sk-live-1234567890'); console.log(await v.getSecret('SHORT_KEY'))`)
    expect(r.out.trim()).toBe('sk-live-1234567890')
    expect(fs.readdirSync(sh.store)).toEqual(['SHORT_KEY'])
  })

  it('replacing a long value with a short one, and deleting, leave no pieces behind', async () => {
    const sh = shim()
    await vault(sh, `await v.setSecret('K_ONE', ${JSON.stringify(LONG)})`)
    await vault(sh, `await v.setSecret('K_ONE', 'short-value-123')`)
    expect(fs.readdirSync(sh.store)).toEqual(['K_ONE'])
    await vault(sh, `await v.setSecret('K_TWO', ${JSON.stringify(LONG)})`)
    await vault(sh, `await v.deleteSecret('K_TWO')`)
    expect(fs.readdirSync(sh.store)).toEqual(['K_ONE'])
  })

  it('a missing piece is reported as damage, not returned as a wrong value', async () => {
    const sh = shim()
    await vault(sh, `await v.setSecret('K_THREE', ${JSON.stringify(LONG)})`)
    fs.rmSync(path.join(sh.store, 'K_THREE_2'))
    const r = await vault(sh, `try { await v.getSecret('K_THREE') } catch (e) { console.log(e.message) }`)
    expect(r.out).toMatch(/damaged/)
    expect(r.out).not.toContain('eyJ')
  })

  it('an error that quotes the value is redacted', () => {
    const quoted = 'security: unknown command "c5cGJuUnRaVzUwY3pwM2NtbDBaU0lzSW1Gd2NGOW1iM0p0Y3pweVpXRmtJaXdp"'
    const out = redactSecrets(quoted)
    expect(out).not.toContain('c5cGJu')
    expect(out).toContain('unknown command')
    expect(redactSecrets('plain words stay: Write permissions error')).toBe('plain words stay: Write permissions error')
  })
})
