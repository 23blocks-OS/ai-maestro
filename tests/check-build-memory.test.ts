/**
 * scripts/check-build-memory.sh: `yarn build` is killed (exit 137, no explanation) on a Linux
 * machine with 2 GB of RAM and no swap; it builds with 2 GB plus swap and on 4 GB. The installer
 * and the updater run this check before the build and say what to do instead.
 * (Measured on Ubuntu 22.04 containers: docs/LINUX-DEPLOYMENT.md.)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { spawnSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'

const SCRIPT = path.join(__dirname, '..', 'scripts', 'check-build-memory.sh')
const MB = 1024 * 1024

let dir: string
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bm-')) })
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }) })

/** A fake /proc and /sys/fs/cgroup; mem/swap in MB, optional cgroup v2 limits */
function machine(opts: { ramMb: number; swapMb?: number; cgMemMb?: number | 'max'; cgSwapMb?: number | 'max' }) {
  fs.mkdirSync(path.join(dir, 'proc'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'cg'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'proc', 'meminfo'),
    `MemTotal:       ${opts.ramMb * 1024} kB\nMemFree:        1000 kB\nSwapTotal:      ${(opts.swapMb ?? 0) * 1024} kB\n`)
  if (opts.cgMemMb !== undefined) {
    fs.writeFileSync(path.join(dir, 'cg', 'memory.max'), opts.cgMemMb === 'max' ? 'max\n' : `${opts.cgMemMb * MB}\n`)
  }
  if (opts.cgSwapMb !== undefined) {
    fs.writeFileSync(path.join(dir, 'cg', 'memory.swap.max'), opts.cgSwapMb === 'max' ? 'max\n' : `${opts.cgSwapMb * MB}\n`)
  }
}

function run(env: Record<string, string> = {}, args: string[] = []) {
  const r = spawnSync('bash', [SCRIPT, ...args], {
    encoding: 'utf8',
    env: { PATH: process.env.PATH!, AIMAESTRO_OS: 'Linux', AIMAESTRO_PROC_DIR: path.join(dir, 'proc'),
      AIMAESTRO_CGROUP_DIR: path.join(dir, 'cg'), ...env },
  })
  return { status: r.status, out: `${r.stdout}${r.stderr}` }
}

describe('check-build-memory.sh on Linux', () => {
  it('2 GB with no swap stops, and the message says what to do', () => {
    machine({ ramMb: 1950 })
    const r = run()
    expect(r.status).toBe(1)
    expect(r.out).toMatch(/Not enough memory/)
    expect(r.out).toMatch(/Killed.*137/s)
    expect(r.out).toMatch(/sudo fallocate -l 4G \/swapfile/)
    expect(r.out).toMatch(/AIMAESTRO_SKIP_MEMORY_CHECK=1/)
    expect(r.out).toMatch(/LINUX-DEPLOYMENT/)
  })

  it('2 GB plus 4 GB swap passes (the measured working case), quietly', () => {
    machine({ ramMb: 1950, swapMb: 4096 })
    const r = run()
    expect(r.status).toBe(0)
    expect(r.out).toBe('')
  })

  it('4 GB with no swap passes quietly', () => {
    machine({ ramMb: 3900 })
    expect(run()).toEqual({ status: 0, out: '' })
  })

  it('between the stop line and comfortable: passes with a warning that names swap', () => {
    machine({ ramMb: 1950, swapMb: 1024 }) // 2.9 GB
    const r = run()
    expect(r.status).toBe(0)
    expect(r.out).toMatch(/tight/)
  })

  it('1 GB with a little swap still stops', () => {
    machine({ ramMb: 990, swapMb: 512 })
    expect(run().status).toBe(1)
  })

  it('the override variable skips the check', () => {
    machine({ ramMb: 1950 })
    expect(run({ AIMAESTRO_SKIP_MEMORY_CHECK: '1' })).toEqual({ status: 0, out: '' })
  })

  it('a container limit counts, not the host RAM that /proc/meminfo shows', () => {
    machine({ ramMb: 16000, cgMemMb: 2048, cgSwapMb: 0 })
    expect(run().status).toBe(1)
  })

  it('a container limit with swap allowed passes', () => {
    machine({ ramMb: 16000, swapMb: 8192, cgMemMb: 2048, cgSwapMb: 4096 })
    expect(run().status).toBe(0)
  })

  it('"max" (no limit) in the cgroup leaves the host figures alone', () => {
    machine({ ramMb: 8000, cgMemMb: 'max' })
    expect(run()).toEqual({ status: 0, out: '' })
  })

  it('no /proc/meminfo: it cannot tell, so it does not block', () => {
    fs.mkdirSync(path.join(dir, 'proc'), { recursive: true })
    expect(run().status).toBe(0)
  })

  it('--print-mb prints RAM and swap', () => {
    machine({ ramMb: 1950, swapMb: 100 })
    expect(run({}, ['--print-mb']).out.trim()).toBe('1950 100')
  })

  it('macOS only warns, never stops', () => {
    // hw.memsize is read with sysctl; fake it with a stub on PATH
    fs.mkdirSync(path.join(dir, 'bin'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'bin', 'sysctl'), '#!/bin/bash\necho 2147483648\n', { mode: 0o755 })
    const r = run({ AIMAESTRO_OS: 'Darwin', PATH: `${path.join(dir, 'bin')}:${process.env.PATH}` })
    expect(r.status).toBe(0)
    expect(r.out).toMatch(/2\.0 GB/)
  })
})

describe('the installer and updater use it', () => {
  const read = (f: string) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8')

  it('remote-install.sh checks before the build and explains a build killed with 137', () => {
    const s = read('scripts/remote-install.sh')
    const build = s.slice(s.indexOf('build_app() {'), s.indexOf('act3_clone_and_build() {'))
    expect(build.indexOf('check-build-memory.sh')).toBeGreaterThan(-1)
    expect(build.indexOf('check-build-memory.sh')).toBeLessThan(build.indexOf('yarn build'))
    expect(build).toMatch(/exit code 137\|Killed/)
    expect(build).toMatch(/sudo fallocate/)
  })

  it('update-aimaestro.sh checks before the build and explains exit 137', () => {
    const s = read('update-aimaestro.sh')
    expect(s.indexOf('check-build-memory.sh')).toBeLessThan(s.indexOf('elif yarn build'))
    expect(s).toMatch(/-eq 137/)
  })
})
