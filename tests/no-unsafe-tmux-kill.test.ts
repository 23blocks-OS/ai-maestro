import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

// tmux 3.6 falls back to the DEFAULT socket when TMUX_TMPDIR points at a directory that does not
// exist. A test or script that runs `tmux kill-server` against a private TMUX_TMPDIR therefore
// kills the user's real tmux server (and every agent session) if the directory is gone by then.
// 2026-10-09: headless-smoke did exactly that. Every kill-server must name its socket with -S.
const root = path.resolve(__dirname, '..')
const skip = new Set(['node_modules', '.next', '.git', 'plugin', 'coverage', 'docs', 'marketing', 'logs'])

function* walk(dir: string): Generator<string> {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skip.has(e.name)) continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) yield* walk(p)
    else if (/\.(ts|tsx|mjs|cjs|js|sh)$/.test(e.name)) yield p
  }
}

describe('no tmux kill-server without an explicit socket', () => {
  it('every kill-server names its socket with -S', () => {
    const offenders: string[] = []
    for (const f of walk(root)) {
      if (f === __filename) continue
      fs.readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
        if (!/kill-server/.test(line)) return
        if (/^\s*(\/\/|#|\*)/.test(line)) return // comments
        if (!/['"]-S['"]|\s-S\s/.test(line)) offenders.push(`${path.relative(root, f)}:${i + 1}: ${line.trim().slice(0, 120)}`)
      })
    }
    expect(offenders).toEqual([])
  })
})
