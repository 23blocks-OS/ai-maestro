/**
 * Tests for scripts/bump-version.sh — issue #375.
 *
 * The reported symptom was `package.json` frozen at 0.29.16 for fifteen
 * releases while every run printed "✓ Updated N files". That specific case had
 * already been fixed; the mechanism behind it had not, and it was still live in
 * three places:
 *
 *   - `update_file` skipped silently whenever its grep missed, so any file that
 *     had drifted stayed drifted forever and never appeared in the output;
 *   - `docs/BACKLOG.md` ran sed unconditionally and printed a tick whether or
 *     not anything changed — not a silent skip but a false claim, and the
 *     reason that header had to be corrected by hand after every release;
 *   - `version.json`, the SOURCE OF TRUTH, was updated by an unchecked sed
 *     keyed on `"version": "x"` with a space after the colon. Reformat the file
 *     and the version freezes at whatever it was, every subsequent bump reads
 *     that stale value as CURRENT_VERSION, and every release still reports
 *     success.
 *
 * A bump that half-applies is worse than one that refuses, because the drift
 * compounds silently over every release that follows.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { execFileSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'

const SCRIPT = path.join(__dirname, '..', 'scripts', 'bump-version.sh')

let dir: string

/** A checkout where every file agrees on `version`. */
function seed(version: string, overrides: Record<string, string> = {}) {
  fs.mkdirSync(path.join(dir, 'scripts'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'docs'), { recursive: true })
  fs.copyFileSync(SCRIPT, path.join(dir, 'scripts', 'bump-version.sh'))

  const files: Record<string, string> = {
    'version.json': JSON.stringify({ version, releaseDate: '2026-01-01', keep: 'me' }, null, 2) + '\n',
    'package.json': JSON.stringify({ name: 'x', version }, null, 2) + '\n',
    'README.md': `![version](https://img.shields.io/badge/version-${version}-blue)\n`,
    'docs/BACKLOG.md': `**Current Version:** v${version}\n`,
    'scripts/remote-install.sh': `VERSION="${version}"\n`,
    ...overrides,
  }
  for (const [name, body] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), body)
  }
}

function bump(): { status: number; out: string } {
  try {
    const out = execFileSync('bash', ['scripts/bump-version.sh', 'patch'], {
      cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    })
    return { status: 0, out }
  } catch (e: any) {
    return { status: e.status ?? 1, out: `${e.stdout || ''}${e.stderr || ''}` }
  }
}

const read = (f: string) => fs.readFileSync(path.join(dir, f), 'utf8')
const versionOf = (f: string) => JSON.parse(read(f)).version

beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bumpver-')) })
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

describe('every file aligned — the happy path', () => {
  it('bumps all of them and succeeds', () => {
    seed('1.2.3')
    const { status } = bump()
    expect(status).toBe(0)
    expect(versionOf('version.json')).toBe('1.2.4')
    expect(versionOf('package.json')).toBe('1.2.4')
    expect(read('README.md')).toContain('version-1.2.4-')
    expect(read('docs/BACKLOG.md')).toContain('v1.2.4')
    expect(read('scripts/remote-install.sh')).toContain('1.2.4')
  })

  it('preserves unrelated fields in version.json', () => {
    seed('1.2.3')
    bump()
    expect(JSON.parse(read('version.json')).keep).toBe('me')
  })

  it('stamps the release date', () => {
    seed('1.2.3')
    bump()
    expect(JSON.parse(read('version.json')).releaseDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('a drifted file must fail the run, not be skipped', () => {
  it('exits non-zero rather than reporting success', () => {
    // The heart of #375: this used to exit 0 having silently skipped the file.
    seed('1.2.3', { 'README.md': '![version](https://img.shields.io/badge/version-0.1.0-blue)\n' })
    expect(bump().status).not.toBe(0)
  })

  it('names the file that was not updated', () => {
    seed('1.2.3', { 'README.md': '![version](https://img.shields.io/badge/version-0.1.0-blue)\n' })
    const { out } = bump()
    expect(out).toContain('NOT updated')
    expect(out).toContain('README.md')
  })

  it('names EVERY drifted file, not just the first', () => {
    seed('1.2.3', {
      'README.md': 'badge/version-0.1.0-blue\n',
      'scripts/remote-install.sh': 'VERSION="0.1.0"\n',
      'docs/BACKLOG.md': '**Current Version:** v0.1.0\n',
    })
    const { out } = bump()
    expect(out).toContain('3 file(s) were NOT updated')
  })

  it('does NOT count a drifted file as updated', () => {
    // It used to print a tick for BACKLOG.md whether or not anything changed.
    seed('1.2.3', { 'docs/BACKLOG.md': '**Current Version:** v0.1.0\n' })
    const { out } = bump()
    expect(read('docs/BACKLOG.md')).toContain('v0.1.0')
    expect(out).not.toMatch(/✓.*BACKLOG/)
  })
})

describe('version.json is the source of truth and is verified', () => {
  it('updates it even when the JSON is formatted differently', () => {
    // The old sed keyed on `"version": "x"` — a space after the colon. Compact
    // JSON silently froze the version while the script printed a tick.
    seed('1.2.3', { 'version.json': '{"version":"1.2.3","releaseDate":"2026-01-01","keep":"me"}\n' })
    const { status } = bump()
    expect(status).toBe(0)
    expect(versionOf('version.json')).toBe('1.2.4')
  })

  it('does not corrupt the file it rewrites', () => {
    seed('1.2.3', { 'version.json': '{"version":"1.2.3","releaseDate":"2026-01-01","keep":"me"}\n' })
    bump()
    expect(() => JSON.parse(read('version.json'))).not.toThrow()
    expect(JSON.parse(read('version.json')).keep).toBe('me')
  })
})

describe('an absent optional file is not a failure', () => {
  it('succeeds when docs/ is simply not in this checkout', () => {
    // Missing and drifted are different: one is a legitimate slim clone, the
    // other is a file that was supposed to be updated and was not.
    seed('1.2.3')
    fs.rmSync(path.join(dir, 'docs', 'BACKLOG.md'))
    expect(bump().status).toBe(0)
    expect(versionOf('version.json')).toBe('1.2.4')
  })
})
