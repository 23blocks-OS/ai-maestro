import { describe, it, expect, afterEach } from 'vitest'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, cpSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const repo = path.resolve(__dirname, '..')
const mainCheckout = path.resolve(
  repo,
  execFileSync('git', ['-C', repo, 'rev-parse', '--git-common-dir'], { encoding: 'utf8' }).trim(),
  '..',
)
const cleanup: string[] = []
afterEach(() => { while (cleanup.length) rmSync(cleanup.pop()!, { recursive: true, force: true }) })

describe('install-aim-secret.sh points at a stable checkout', () => {
  it('uses the main checkout when run from a linked worktree in a temp folder', () => {
    const base = mkdtempSync(path.join(tmpdir(), 'aim-secret-wt-'))
    cleanup.push(base)
    const wt = path.join(base, 'wt')
    execFileSync('git', ['-C', mainCheckout, 'worktree', 'add', '--detach', wt, 'HEAD'], { stdio: 'ignore' })
    try {
      // the worktree is made from HEAD; run the script under test, not an older copy
      cpSync(path.join(repo, 'scripts/install-aim-secret.sh'), path.join(wt, 'scripts/install-aim-secret.sh'))
      const bin = path.join(base, 'bin')
      execFileSync('bash', [path.join(wt, 'scripts/install-aim-secret.sh')], { env: { ...process.env, AIM_BIN_DIR: bin }, stdio: 'ignore' })
      const wrapper = readFileSync(path.join(bin, 'aim-secret'), 'utf8')
      expect(wrapper).toContain(`${mainCheckout}/scripts/aim-secret.mjs`)
      expect(wrapper).not.toContain(wt)
    } finally {
      execFileSync('git', ['-C', mainCheckout, 'worktree', 'remove', '--force', wt], { stdio: 'ignore' })
    }
  })

  it('refuses a plain copy that lives in a temp folder', () => {
    const base = mkdtempSync(path.join(tmpdir(), 'aim-secret-copy-'))
    cleanup.push(base)
    mkdirSync(path.join(base, 'scripts'), { recursive: true })
    cpSync(path.join(repo, 'scripts/install-aim-secret.sh'), path.join(base, 'scripts/install-aim-secret.sh'))
    const r = spawnSync('bash', [path.join(base, 'scripts/install-aim-secret.sh')], { env: { ...process.env, AIM_BIN_DIR: path.join(base, 'bin') }, encoding: 'utf8' })
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('temporary folder')
  })
})
