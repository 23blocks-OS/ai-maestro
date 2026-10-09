/**
 * B013: logs must not grow without a limit. The hook's debug log rotates itself
 * (25 MB active + 25 MB previous), and scripts/setup-log-rotation.sh configures pm2
 * rotation and trims files that are already far past the cap.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createRequire } from 'module'
import { spawnSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'

const require = createRequire(import.meta.url)
const hook = require('../scripts/claude-hooks/ai-maestro-hook.cjs')
const SCRIPT = path.join(__dirname, '..', 'scripts', 'setup-log-rotation.sh')
const MB = 1024 * 1024

let dir: string
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'logrot-')) })
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }) })

describe('rotateDebugLog (hook)', () => {
  const log = () => path.join(dir, 'hook-debug.log')
  const write = (bytes: number) => fs.writeFileSync(log(), ('x'.repeat(99) + '\n').repeat(Math.ceil(bytes / 100)))

  it('leaves a small file alone', () => {
    write(1000)
    expect(hook.rotateDebugLog(log(), 10_000, 2_000)).toBe('none')
    expect(fs.existsSync(log() + '.1')).toBe(false)
  })
  it('moves a file past the cap aside, keeping one previous file', () => {
    write(12_000)
    expect(hook.rotateDebugLog(log(), 10_000, 2_000)).toBe('rotated')
    expect(fs.existsSync(log())).toBe(false)
    expect(fs.statSync(log() + '.1').size).toBeGreaterThan(10_000)
    // a second rotation replaces the previous file: never more than one backup
    write(12_000)
    hook.rotateDebugLog(log(), 10_000, 2_000)
    expect(fs.readdirSync(dir).sort()).toEqual(['hook-debug.log.1'])
  })
  it('cuts a file far past the cap to its tail instead of copying it whole', () => {
    write(50_000)
    expect(hook.rotateDebugLog(log(), 10_000, 2_000)).toBe('trimmed')
    expect(fs.statSync(log()).size).toBeLessThanOrEqual(2_000)
    expect(fs.existsSync(log() + '.1')).toBe(false)
    const text = fs.readFileSync(log(), 'utf8')
    expect(text.startsWith('x')).toBe(true) // starts on a line boundary
  })
  it('never throws, even for a missing file or an unreadable directory', () => {
    expect(hook.rotateDebugLog(path.join(dir, 'nope.log'), 10, 5)).toBe('error')
    expect(hook.rotateDebugLog('/proc/definitely/not/here', 10, 5)).toBe('error')
  })
})

describe('clipForLog (hook)', () => {
  it('clips long strings but keeps the structure and valid JSON', () => {
    const big = 'a'.repeat(5000)
    const out = hook.clipForLog({ event: 'hook_received', input: { prompt: big, n: 3, nested: { text: big } } })
    expect(out.input.prompt.length).toBeLessThan(1100)
    expect(out.input.prompt).toContain('[+4000 chars]')
    expect(out.input.n).toBe(3)
    expect(() => JSON.parse(JSON.stringify(out))).not.toThrow()
  })
  it('limits long arrays (a whole tool batch)', () => {
    expect(hook.clipForLog({ tool_calls: Array.from({ length: 500 }, (_, i) => i) }).tool_calls).toHaveLength(50)
  })
  it('passes small values through unchanged', () => {
    const v = { a: 'short', b: [1, 2], c: null, d: true }
    expect(hook.clipForLog(v)).toEqual(v)
  })
})

describe('scripts/setup-log-rotation.sh', () => {
  // A fake pm2 that behaves like the real one: `conf <key>` prints junk (real pm2 6 prints
  // "[object Object]"), and settings live in $PM2_HOME/module_conf.json, written by `set`.
  function fakePm2(withModule: boolean) {
    const bin = path.join(dir, 'bin'); fs.mkdirSync(bin)
    const state = path.join(dir, 'pm2-state'); fs.mkdirSync(state)
    const home = path.join(dir, 'pm2home'); fs.mkdirSync(home)
    if (withModule) fs.writeFileSync(path.join(state, 'installed'), '')
    fs.writeFileSync(path.join(bin, 'pm2'), `#!/bin/bash
S="${state}"
case "$1" in
  list) [ -f "$S/installed" ] && echo "pm2-logrotate  online"; echo "ai-maestro online";;
  install) echo "install $2" >> "$S/calls"; touch "$S/installed";;
  set) echo "set $2 $3" >> "$S/calls"
       node -e 'const fs=require("fs"),f=process.argv[1]+"/module_conf.json";let c={};try{c=JSON.parse(fs.readFileSync(f))}catch(e){};c["pm2-logrotate"]=c["pm2-logrotate"]||{};c["pm2-logrotate"][process.argv[2].replace("pm2-logrotate:","")]=process.argv[3];fs.writeFileSync(f,JSON.stringify(c))' "${home}" "$2" "$3";;
  conf) echo "$ pm2 set module-db-v2:pm2-logrotate [object Object]";;
esac
exit 0
`, { mode: 0o755 })
    return { bin, home, calls: () => (fs.existsSync(path.join(state, 'calls')) ? fs.readFileSync(path.join(state, 'calls'), 'utf8').trim().split('\n') : []) }
  }
  // The script needs `node` to read pm2's settings file, but the real `pm2` (installed next
  // to node under nvm) must NOT be reachable: a test once started a real pm2 daemon that way.
  const nodeOnlyBin = () => {
    const d = path.join(dir, 'nodebin')
    if (!fs.existsSync(d)) { fs.mkdirSync(d); fs.symlinkSync(process.execPath, path.join(d, 'node')) }
    return d
  }
  const run = (extraPath: string, env: Record<string, string> = {}) =>
    spawnSync('bash', [SCRIPT, path.join(dir, 'app')], {
      encoding: 'utf8',
      env: { PATH: `${extraPath}:${nodeOnlyBin()}:/usr/bin:/bin`, HOME: dir, TMPDIR: dir, PM2_HOME: path.join(dir, 'pm2home'), ...env },
    })

  beforeEach(() => { fs.mkdirSync(path.join(dir, 'app', 'logs'), { recursive: true }) })

  it('installs the module and sets the 50 MB policy', () => {
    const p = fakePm2(false)
    const r = run(p.bin)
    expect(r.status).toBe(0)
    expect(p.calls()).toEqual([
      'install pm2-logrotate',
      'set pm2-logrotate:max_size 50M',
      'set pm2-logrotate:retain 2',
      'set pm2-logrotate:compress false',
    ])
  })
  it('is idempotent: a second run changes nothing', () => {
    const p = fakePm2(false)
    run(p.bin)
    const before = p.calls().length
    const r = run(p.bin)
    expect(r.status).toBe(0)
    expect(p.calls().length).toBe(before)
  })
  it('a rerun against the real settings file sets nothing (the flaw 0.60.5 shipped with)', () => {
    const p = fakePm2(false)
    run(p.bin)
    const stored = JSON.parse(fs.readFileSync(path.join(p.home, 'module_conf.json'), 'utf8'))['pm2-logrotate']
    expect(stored).toMatchObject({ max_size: '50M', retain: '2', compress: 'false' })
    const before = p.calls()
    run(p.bin); run(p.bin)
    expect(p.calls()).toEqual(before)
  })
  it('only sets the values that differ', () => {
    const p = fakePm2(true)
    fs.writeFileSync(path.join(p.home, 'module_conf.json'), JSON.stringify({ 'pm2-logrotate': { max_size: '50M', retain: '30', compress: 'false' } }))
    run(p.bin)
    expect(p.calls()).toEqual(['set pm2-logrotate:retain 2'])
  })
  it('does not reinstall a module that is already there', () => {
    const p = fakePm2(true)
    run(p.bin)
    expect(p.calls().some(c => c.startsWith('install'))).toBe(false)
  })
  it('trims a pm2 log far past the cap to about 5 MB and leaves a small one alone', () => {
    const p = fakePm2(true)
    const big = path.join(dir, 'app', 'logs', 'pm2-out.log')
    const small = path.join(dir, 'app', 'logs', 'pm2-error.log')
    fs.writeFileSync(big, ('log line number one two three four five\n').repeat(Math.ceil((60 * MB) / 40)))
    fs.writeFileSync(small, 'tiny\n')
    const r = run(p.bin)
    expect(r.stdout).toMatch(/trimmed pm2-out\.log from 6\d MB to [45] MB/)
    expect(fs.statSync(big).size).toBeLessThanOrEqual(5 * MB)
    expect(fs.statSync(big).size).toBeGreaterThan(4 * MB)
    expect(fs.readFileSync(small, 'utf8')).toBe('tiny\n')
  })
  it('trims the hook debug log past 25 MB', () => {
    const p = fakePm2(true)
    const hl = path.join(dir, '.aimaestro', 'chat-state', 'hook-debug.log')
    fs.mkdirSync(path.dirname(hl), { recursive: true })
    fs.writeFileSync(hl, ('{"event":"hook_received"}\n').repeat(Math.ceil((30 * MB) / 26)))
    run(p.bin)
    expect(fs.statSync(hl).size).toBeLessThanOrEqual(5 * MB)
  })
  it('still trims and exits 0 when pm2 is not installed', () => {
    const big = path.join(dir, 'app', 'logs', 'pm2-out.log')
    fs.writeFileSync(big, ('x'.repeat(99) + '\n').repeat(Math.ceil((60 * MB) / 100)))
    const r = run('/nonexistent')
    expect(r.status).toBe(0)
    expect(r.stdout).toMatch(/pm2 not found/)
    expect(r.stdout).not.toMatch(/installed/)
    expect(fs.statSync(big).size).toBeLessThanOrEqual(5 * MB)
  })
  it('does nothing when switched off', () => {
    const p = fakePm2(false)
    const r = run(p.bin, { AIM_LOG_ROTATION: 'off' })
    expect(r.status).toBe(0)
    expect(p.calls()).toEqual([])
  })
})

describe('wiring', () => {
  const root = path.join(__dirname, '..')
  it('the updater runs the rotation script before the pm2 restart', () => {
    const s = fs.readFileSync(path.join(root, 'update-aimaestro.sh'), 'utf8')
    const rot = s.indexOf('setup-log-rotation.sh')
    expect(rot).toBeGreaterThan(-1)
    expect(rot).toBeLessThan(s.indexOf('Restarting AI Maestro via PM2'))
    expect(s).toMatch(/setup-log-rotation\.sh"[^\n]*\|\| print_warning/) // never fatal
  })
  it('the installer runs it after starting or restarting pm2', () => {
    const s = fs.readFileSync(path.join(root, 'scripts', 'remote-install.sh'), 'utf8')
    expect((s.match(/setup-log-rotation\.sh/g) || []).length).toBeGreaterThanOrEqual(2)
  })
  it('every pm2 app log in the ecosystem file sits in logs/, where the script trims it', () => {
    const s = fs.readFileSync(path.join(root, 'ecosystem.config.js'), 'utf8')
    expect(s).toMatch(/\.\/logs\/pm2-error\.log/)
    expect(s).toMatch(/\.\/logs\/pm2-out\.log/)
  })
})
