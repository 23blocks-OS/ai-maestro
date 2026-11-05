/**
 * B004 guard: no shell-string command with a value interpolated into it, unless the value goes through
 * shellQuote(). The tmux injection advisories (GHSA-2vm8-3q4q-wqv3) came from exactly this shape, and the
 * "${name}" in double quotes that looked safe was not. Use execFile with an argument list instead.
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const ROOTS = ['services', 'lib', 'app', 'server.mjs']
/** Values that cannot carry shell syntax, by construction. Keyed by file and exact expression; keep it short. */
const SAFE: Record<string, string> = {
  'lib/container-utils.ts  ${timeoutSec}': 'a number parameter',
  'lib/container-utils.ts  ${flag}': "either '-l ' or ''",
  'lib/container-utils.ts  ${startLine}': 'Math.max(1, Math.floor(lines))',
}
const CALL = /\b(?:exec|execSync|execAsync)\(\s*`/g

function files(p: string): string[] {
  const full = path.join(process.cwd(), p)
  if (!fs.existsSync(full)) return []
  if (fs.statSync(full).isFile()) return [full]
  return fs.readdirSync(full, { withFileTypes: true }).flatMap(e => {
    if (e.name === 'node_modules' || e.name.startsWith('.')) return []
    const child = path.join(p, e.name)
    return e.isDirectory() ? files(child) : /\.(ts|tsx|mjs|js)$/.test(e.name) && !/\.test\./.test(e.name) ? [path.join(process.cwd(), child)] : []
  })
}

/** The `${...}` expressions of the template literal that starts at `start` (just after its opening backtick). */
function interpolations(src: string, start: number): string[] {
  const out: string[] = []
  for (let i = start; i < src.length; i++) {
    if (src[i] === '\\') { i++; continue }
    if (src[i] === '`') break
    if (src[i] === '$' && src[i + 1] === '{') {
      let depth = 1, j = i + 2
      for (; j < src.length && depth > 0; j++) { if (src[j] === '{') depth++; else if (src[j] === '}') depth-- }
      out.push(src.slice(i + 2, j - 1).trim())
      i = j - 1
    }
  }
  return out
}

describe('shell-string commands (B004)', () => {
  it('interpolate nothing except through shellQuote()', () => {
    const offenders: string[] = []
    for (const f of ROOTS.flatMap(files)) {
      const src = fs.readFileSync(f, 'utf8')
      for (const m of src.matchAll(CALL)) {
        // a doc comment that shows the bad shape is not code
        const lineStart = src.lastIndexOf('\n', m.index!) + 1
        if (/^\s*(\*|\/\/)/.test(src.slice(lineStart, m.index))) continue
        for (const expr of interpolations(src, m.index! + m[0].length)) {
          const rel = path.relative(process.cwd(), f)
          if (/^shellQuote\(/.test(expr) || SAFE[`${rel}  \${${expr}}`]) continue
          offenders.push(`${rel}:${src.slice(0, m.index).split('\n').length}  \${${expr}}`)
        }
      }
    }
    expect(offenders, 'Use execFile(cmd, [args]) instead, or shellQuote() the value').toEqual([])
  })
})
