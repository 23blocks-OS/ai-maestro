/**
 * F036: scripts/install-pi.sh --amp-only against a temporary HOME. It must install the Pi extension and a
 * managed AGENTS.md block, keep the person's own text, and be safe to run again. It never installs Pi here.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { execFileSync, spawnSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'

const SCRIPT = path.join(process.cwd(), 'scripts/install-pi.sh')
const BEGIN = '<!-- ai-maestro:begin -->'
const END = '<!-- ai-maestro:end -->'
let home: string
const agentDir = () => path.join(home, '.pi', 'agent')
const env = () => ({ PATH: process.env.PATH as string, HOME: home }) as unknown as NodeJS.ProcessEnv
const run = (...args: string[]) => execFileSync('bash', [SCRIPT, ...args], { env: env(), encoding: 'utf8', timeout: 30000 })
const agents = () => fs.readFileSync(path.join(agentDir(), 'AGENTS.md'), 'utf8')
const count = (s: string, needle: string) => s.split(needle).length - 1

beforeEach(() => { home = fs.mkdtempSync(path.join(os.tmpdir(), 'install-pi-amp-')) })
afterEach(() => { fs.rmSync(home, { recursive: true, force: true }) })

describe('install-pi.sh --amp-only', () => {
  it('installs the extension and writes the block into a new AGENTS.md', () => {
    run('--amp-only')
    const ext = path.join(agentDir(), 'extensions', 'ai-maestro-amp')
    expect(fs.existsSync(path.join(ext, 'index.js'))).toBe(true)
    expect(fs.existsSync(path.join(ext, 'core.mjs'))).toBe(true)
    const a = agents()
    expect(count(a, BEGIN)).toBe(1)
    expect(count(a, END)).toBe(1)
    expect(a).toContain('amp_reply')
    expect(a).toContain('<external-content>')
    expect(a).toMatch(/NOT delivered/)
    // nothing outside the temporary home, and no Pi wrapper
    expect(fs.existsSync(path.join(home, '.local', 'bin', 'pi'))).toBe(false)
  })

  it('appends to an existing AGENTS.md and keeps the person\'s text', () => {
    fs.mkdirSync(agentDir(), { recursive: true })
    fs.writeFileSync(path.join(agentDir(), 'AGENTS.md'), '# My rules\nBe kind.')
    run('--amp-only')
    expect(agents().startsWith('# My rules\nBe kind.\n\n' + BEGIN)).toBe(true)
  })

  it('is idempotent and replaces only the managed block', () => {
    fs.mkdirSync(agentDir(), { recursive: true })
    fs.writeFileSync(path.join(agentDir(), 'AGENTS.md'), `before\n${BEGIN}\nOLD TEXT\n${END}\nafter\n`)
    run('--amp-only')
    const first = agents()
    expect(first).not.toContain('OLD TEXT')
    expect(first.startsWith('before\n' + BEGIN)).toBe(true)
    expect(first.endsWith(END + '\nafter\n')).toBe(true)
    run('--amp-only')
    expect(agents()).toBe(first)
    expect(count(first, BEGIN)).toBe(1)
  })

  it('replaces a stale extension directory', () => {
    const ext = path.join(agentDir(), 'extensions', 'ai-maestro-amp')
    fs.mkdirSync(ext, { recursive: true })
    fs.writeFileSync(path.join(ext, 'old.js'), 'x')
    run('--amp-only')
    expect(fs.existsSync(path.join(ext, 'old.js'))).toBe(false)
    expect(fs.existsSync(path.join(ext, 'index.js'))).toBe(true)
  })

  it('refuses to edit a file with unbalanced markers', () => {
    fs.mkdirSync(agentDir(), { recursive: true })
    const file = path.join(agentDir(), 'AGENTS.md')
    const original = `mine\n${BEGIN}\nhalf a block, no end\n`
    fs.writeFileSync(file, original)
    const r = spawnSync('bash', [SCRIPT, '--amp-only'], { env: env(), encoding: 'utf8' })
    expect(r.status).not.toBe(0)
    expect(fs.readFileSync(file, 'utf8')).toBe(original)
  })

  it('honours PI_CODING_AGENT_DIR', () => {
    const dir = path.join(home, 'custom')
    execFileSync('bash', [SCRIPT, '--amp-only'], { env: { ...env(), PI_CODING_AGENT_DIR: dir }, encoding: 'utf8' })
    expect(fs.existsSync(path.join(dir, 'AGENTS.md'))).toBe(true)
    expect(fs.existsSync(path.join(agentDir(), 'AGENTS.md'))).toBe(false)
  })

  it('--check reports and changes nothing', () => {
    const out = run('--check')
    expect(out).toContain('AMP extension: not installed')
    expect(fs.existsSync(agentDir())).toBe(false)
  })
})
