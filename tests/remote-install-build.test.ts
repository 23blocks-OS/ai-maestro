/**
 * Tests for the build step in scripts/remote-install.sh.
 *
 * THE BUG THIS EXISTS TO PREVENT
 *
 * `remote-install.sh` is the documented one-liner in the README — the first thing
 * anybody runs. It cloned the repo, ran `yarn install`, and started pm2. It never
 * ran `yarn build`.
 *
 * `.next` is gitignored, so a fresh clone has no bundle. `ecosystem.config.js`
 * starts the server with `NODE_ENV=production`, which makes `server.mjs:90` set
 * `dev = false`, which makes Next require a production build:
 *
 *   Could not find a production build in the '.next' directory.
 *
 * pm2 then crash-looped it ten times (`max_restarts: 10`) and gave up. Every
 * fresh install produced a server that could not serve the dashboard, and the
 * update path was quietly worse: `git pull` with no rebuild left the PREVIOUS
 * version's bundle in place, so users "updated" and kept running the old UI.
 *
 * The build is verified by BUILD_ID rather than by exit code, because a build can
 * exit non-zero having written a usable bundle, and can exit zero having written
 * nothing. The artifact on disk is what decides.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { execFileSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'

const SCRIPT = path.join(__dirname, '..', 'scripts', 'remote-install.sh')
const source = () => fs.readFileSync(SCRIPT, 'utf8')

let dir: string

/** Run build_app in isolation against a stub `yarn` with the given behaviour. */
function runBuild(yarnBody: string): { status: number; out: string } {
  const fn = source().match(/^build_app\(\) \{[\s\S]*?^\}/m)
  if (!fn) throw new Error('build_app() not found in remote-install.sh')

  fs.mkdirSync(path.join(dir, 'bin'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'bin', 'yarn'), `#!/bin/bash\n${yarnBody}\n`, { mode: 0o755 })
  fs.writeFileSync(path.join(dir, 'build_app.sh'), fn[0])
  fs.writeFileSync(
    path.join(dir, 'harness.sh'),
    'maestro_step() { :; }\nmaestro_fail() { echo "FAIL: $1"; }\nINSTALL_DIR="$PWD"\n' +
      'source ./build_app.sh\nbuild_app 3 5\n'
  )
  try {
    const out = execFileSync('bash', ['harness.sh'], {
      cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PATH: `${path.join(dir, 'bin')}:${process.env.PATH}` },
    })
    return { status: 0, out }
  } catch (e: any) {
    return { status: e.status ?? 1, out: `${e.stdout || ''}${e.stderr || ''}` }
  }
}

beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aim-install-')) })
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

describe('the installer builds at all', () => {
  it('calls build_app on the fresh-install path', () => {
    // The regression: act3 was named clone_and_build and only cloned.
    const act3 = source().match(/^act3_clone_and_build\(\) \{[\s\S]*?^\}/m)
    expect(act3).not.toBeNull()
    expect(act3![0]).toContain('build_app')
  })

  it('calls build_app on the update path too', () => {
    // A pull without a rebuild leaves the previous version's bundle serving.
    const src = source()
    const updateBlock = src.slice(src.indexOf('Pulling latest changes'))
    expect(updateBlock.slice(0, updateBlock.indexOf('Updating gateways'))).toContain('build_app')
  })

  it('never lets a failed dependency install continue silently', () => {
    // Both paths used to end in `|| maestro_warn "...continuing"`.
    expect(source()).not.toMatch(/yarn install \|\| maestro_warn/)
  })
})

describe('build_app verifies the artifact, not the exit code', () => {
  it('fails when the build fails and writes nothing', () => {
    const r = runBuild('echo "Error: something exploded" >&2; exit 1')
    expect(r.status).not.toBe(0)
    expect(r.out).toContain('Build failed')
  })

  it('shows the end of the build log, so the user can act on it', () => {
    const r = runBuild('echo "Error: heap out of memory" >&2; exit 1')
    expect(r.out).toContain('heap out of memory')
  })

  it('FAILS when the build exits 0 but produces no bundle', () => {
    // The silent-lie case. Exit code alone would have called this a success and
    // handed the user a server that cannot start.
    const r = runBuild('echo "Compiled successfully"; exit 0')
    expect(r.status).not.toBe(0)
    expect(r.out).toMatch(/no bundle/)
  })

  it('succeeds when a bundle is actually written', () => {
    const r = runBuild('mkdir -p .next && echo abc123 > .next/BUILD_ID; exit 0')
    expect(r.status).toBe(0)
  })

  it('accepts a build that exits non-zero but did write a usable bundle', () => {
    // Next can emit a non-zero code from a lint/type warning stage after having
    // written .next. The artifact is what matters.
    const r = runBuild('mkdir -p .next && echo abc123 > .next/BUILD_ID; exit 1')
    expect(r.status).toBe(0)
  })

  it('clears a stale bundle before building', () => {
    // Otherwise a failed rebuild leaves the OLD version's bundle looking valid.
    fs.mkdirSync(path.join(dir, '.next'), { recursive: true })
    fs.writeFileSync(path.join(dir, '.next', 'BUILD_ID'), 'stale-from-last-version')
    const r = runBuild('echo "Error: exploded" >&2; exit 1')
    expect(r.status).not.toBe(0)
    expect(fs.existsSync(path.join(dir, '.next', 'BUILD_ID'))).toBe(false)
  })
})

/**
 * A version match must not short-circuit a broken tree.
 *
 * Contributed by Javier Moya (@nodoyuna, jaak.ai) in #453, found while setting up
 * a multi-host mesh over OpenVPN.
 *
 * The update path returned early whenever `package.json` carried the current
 * version. But a matching version only means the SOURCE is current —
 * `node_modules` and `.next` can still be missing after an interrupted install, a
 * pruned checkout, or a fresh clone that never built. The shortcut then skipped
 * `yarn install`, `build_app` and the submodule update, and `yarn start` died
 * with `tsx: not found`.
 *
 * Same failure class as the "installer never built the app" fix in v0.38.7 —
 * that added `build_app` to the update branch, and this early return fires
 * before reaching it.
 *
 * Two things made it invisible, and both are fixed here: the start loop reported
 * a service that never bound the port as "starting slowly", and `main()` ended on
 * an unconditional `STATUS: SUCCESS` with exit 0. An install that produced
 * nothing runnable looked identical to a good one.
 */
describe('a current version with a broken tree (#453)', () => {
  const src = () => fs.readFileSync(SCRIPT, 'utf8')

  it('does not return early unless node_modules AND .next exist', () => {
    const s = src()
    const upToDate = s.indexOf('is already up to date')
    const guard = s.lastIndexOf('node_modules', upToDate)
    expect(guard).toBeGreaterThan(-1)
    expect(s.slice(guard, upToDate)).toContain('.next')
  })

  it('names what is missing instead of failing silently', () => {
    expect(src()).toContain('installation is incomplete')
    expect(src()).toMatch(/Missing: node_modules/)
    expect(src()).toMatch(/Missing: \.next/)
  })

  it('reports a service that never started as FAILED, not "slow"', () => {
    const s = src()
    expect(s).toContain('STATUS: FAILED')
    expect(s).not.toMatch(/Service is starting slowly/)
  })

  it('exits non-zero when the service did not come up', () => {
    expect(src()).toMatch(/START_FAILED["' ]*=["' ]*true[\s\S]{0,120}exit 1/)
  })

  it('shows the startup log so the failure is actionable', () => {
    expect(src()).toMatch(/startup\.log/)
  })
})
