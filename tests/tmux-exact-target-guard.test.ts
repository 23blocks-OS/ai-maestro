/**
 * Guard: tmux reads a bare target as a prefix and an empty one as the session used last, so a
 * command meant for one agent can reach another (2026-10-30). Code goes through lib/tmux-safe.mjs,
 * which makes targets exact; this test catches tmux calls that bypass it.
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const root = path.join(__dirname, '..')
function files(dir: string, exts: string[]): string[] {
  const out: string[] = []
  if (!fs.existsSync(dir)) return out
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) out.push(...files(p, exts))
    else if (exts.some(x => e.name.endsWith(x))) out.push(p)
  }
  return out
}
const rel = (p: string) => path.relative(root, p)

describe('tmux targets are exact everywhere', () => {
  it('shell scripts write -t "=name:" (or a pane/window id), never a bare name', () => {
    const bad: string[] = []
    for (const f of [...files(path.join(root, 'scripts'), ['.sh']), ...files(path.join(root, 'plugin/src/scripts'), ['.sh'])]) {
      fs.readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
        const code = line.replace(/^\s*#.*$/, '')
        if (!/\btmux\b/.test(code) || /\b(echo|maestro_info|print_[a-z]+)\b/.test(code)) return
        for (const m of code.matchAll(/\s-t\s+("?)([^\s"]*)/g)) {
          const target = m[2]
          if (!/^[=%@$]/.test(target)) bad.push(`${rel(f)}:${i + 1}: ${line.trim()}`)
        }
      })
    }
    expect(bad).toEqual([])
  })

  it('code that calls tmux directly (not through lib/tmux-safe.mjs) makes its -t exact', () => {
    const bad: string[] = []
    const code = [...files(path.join(root, 'lib'), ['.ts', '.mjs']), ...files(path.join(root, 'services'), ['.ts']), path.join(root, 'server.mjs'), ...files(path.join(root, 'scripts'), ['.mjs'])]
    for (const f of code) {
      if (f.endsWith('tmux-safe.mjs')) continue
      fs.readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
        if (!/execFile(Sync|Async)?\(\s*['"]tmux['"]/.test(line) || !/'-t'/.test(line)) return
        const after = line.split("'-t',")[1] || ''
        if (!/^\s*(exactTarget\(|`=|'=|pane\b)/.test(after)) bad.push(`${rel(f)}:${i + 1}: ${line.trim()}`)
      })
    }
    expect(bad).toEqual([])
  })
})
