import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

// tmux 3.6 falls back to the DEFAULT socket when TMUX_TMPDIR points at a directory that does not
// exist. A test or script that runs `tmux kill-server` against a private TMUX_TMPDIR therefore
// kills the user's real tmux server (and every agent session) if the directory is gone by then.
// 2026-10-09: headless-smoke did exactly that. Every kill-server must name its socket with -S.
// "-L <name>" is accepted too: the fallback changes the directory, not the server name, so a named
// private server is still the only one reached (never "-L default"). psmux, the native Windows tmux
// (F041), has private servers only as -L namespaces; the F045 self-check uses them.
const root = path.resolve(__dirname, '..')
const skip = new Set(['node_modules', '.next', '.git', 'plugin', 'coverage', 'docs', 'marketing', 'logs', '.claude'])

function* walk(dir: string): Generator<string> {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skip.has(e.name)) continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) yield* walk(p)
    else if (/\.(ts|tsx|mjs|cjs|js|sh)$/.test(e.name)) yield p
  }
}

describe('no tmux kill-server without an explicit socket', () => {
  it('every kill-server names its socket with -S (or a private -L server)', () => {
    const offenders: string[] = []
    for (const f of walk(root)) {
      if (f === __filename) continue
      fs.readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
        if (!/kill-server/.test(line)) return
        if (/^\s*(\/\/|#|\*)/.test(line)) return // comments
        const named = /['"]-S['"]|\s-S\s/.test(line) || (/['"]-L['"]|\s-L\s/.test(line) && !/-L['",\s]+default\b/.test(line))
        if (!named) offenders.push(`${path.relative(root, f)}:${i + 1}: ${line.trim().slice(0, 120)}`)
      })
    }
    expect(offenders).toEqual([])
  })
})
