/**
 * F045: the tmux self-check (lib/tmux-selfcheck.mjs, scripts/tmux-selfcheck.mjs).
 *
 * The real run needs a tmux-compatible binary and is skipped without one. It uses its own private
 * "-L" server, never the user's. The safety tests run everywhere.
 */

import { describe, it, expect, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { runSelfCheck, formatReport, binaryAvailable, SELFCHECK_ENV } from '@/lib/tmux-selfcheck.mjs'
import { resolveExecutable } from '@/lib/tmux-safe.mjs'

const hasTmux = binaryAvailable()

afterEach(() => { delete process.env[SELFCHECK_ENV] })

describe('tmux self-check', () => {
  it('resolves a bare program name to its full path on Windows, for node-pty (F041)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aim-resolve-'))
    try {
      fs.writeFileSync(path.join(dir, 'tmux.EXE'), '')
      const env = { Path: ['C:\\nowhere', dir].join(';'), PATHEXT: '.COM;.EXE' } as unknown as NodeJS.ProcessEnv
      expect(resolveExecutable('tmux', { platform: 'win32', env })).toBe(path.join(dir, 'tmux.EXE'))
      expect(resolveExecutable('missing', { platform: 'win32', env })).toBe('missing')
      expect(resolveExecutable('tmux', { platform: 'darwin', env })).toBe('tmux')
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('refuses to run inside another self-check (no recursion into panes)', async () => {
    process.env[SELFCHECK_ENV] = '1'
    await expect(runSelfCheck()).rejects.toThrow(/refusing/)
  })

  it.skipIf(process.platform === 'win32')('a broken binary fails the canary by name and runs nothing else', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aim-broken-tmux-'))
    const bin = path.join(dir, 'tmux')
    const log = path.join(dir, 'calls.log')
    fs.writeFileSync(bin, '#!/bin/sh\necho "$@" >> ' + JSON.stringify(log) + '\necho "server exited unexpectedly" >&2\nexit 1\n', { mode: 0o755 })
    try {
      const report = await runSelfCheck({ bin, attach: false })
      expect(report.ok).toBe(false)
      expect(report.results).toHaveLength(1)
      expect(report.results[0]).toMatchObject({ name: 'new-session -d -s -c (canary)', ok: false })
      expect(report.results[0].detail).toContain('server exited unexpectedly')
      expect(formatReport(report)).toMatch(/FAIL\s+new-session/)
      // Every call, the cleanup included, named a private server
      const calls = fs.readFileSync(log, 'utf8').trim().split('\n').filter(l => l !== '-V')
      expect(calls.length).toBeGreaterThanOrEqual(2)
      for (const c of calls) expect(c).toMatch(/^-L aim-selfcheck-\d+-[0-9a-f]{8} /)
      expect(calls.at(-1)!.split(' ')).toEqual(['-L', expect.stringMatching(/^aim-selfcheck-/), 'kill-server'])
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it.skipIf(!hasTmux)('every operation passes against the tmux on PATH', async () => {
    const report = await runSelfCheck()
    const failed = report.results.filter(r => !r.ok)
    expect(failed, formatReport(report)).toEqual([])
    expect(report.results.length).toBeGreaterThan(20)
  }, 120_000)
})
