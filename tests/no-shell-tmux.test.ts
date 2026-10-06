/**
 * No shell-string tmux calls (F026 Phase 0, GHSA-2vm8-3q4q-wqv3).
 *
 * A tmux command built as a shell string, with a session name interpolated
 * into it, is the command-injection class the advisory was about: `"${name}"`
 * does not stop `$(…)`. Every tmux call in server.mjs, lib/ and services/ now
 * goes through lib/tmux-safe.mjs (execFile + argv, target validated) or
 * lib/tmux-runtime.mjs on top of it. This test fails if one comes back.
 *
 * It also keeps server.mjs on the runtime: server.mjs may not call tmux through
 * child_process directly (execFile('tmux', …) / spawn('tmux', …)), so the next
 * operation it needs is added to lib/tmux-runtime.mjs, where it gets validated
 * and tested, instead of beside the other 2,000 lines.
 */

import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')

/** Drop comments so prose about old shell strings does not count. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')
}

// A string literal whose text starts with `tmux <subcommand or flag>`. That is
// what a shell command looks like; prose that merely mentions tmux does not
// start with it.
const TMUX_SHELL_STRING = /[`'"]\s*tmux\s+(?:-[A-Za-z]|[a-z]+-[a-z]+\b|ls\b|attach\b|new\b|kill\b|send\b|has\b|list\b|set\b|show\b|display\b|source\b)/
// A shell-running call whose first argument is such a string, or `shell:` set
// on a tmux call.
const EXEC_SHELL = /\b(?:exec|execSync|execAsync|execPromise)\s*\(\s*[`'"]\s*tmux\b/
// child_process with 'tmux' as the program, used directly.
const DIRECT_TMUX = /\b(?:execFile|execFileSync|execFileAsync|spawn|spawnSync)\s*\(\s*['"`]tmux['"`]/

interface Hit { file: string; line: number; text: string; rule: string }

function findShellTmux(src: string, file: string, { allowDirect = true } = {}): Hit[] {
  const hits: Hit[] = []
  const lines = stripComments(src).split('\n')
  // Join each line with the next so `execSync(\n  \`tmux …\`` is seen.
  lines.forEach((line, i) => {
    const window = line + ' ' + (lines[i + 1] ?? '')
    if (EXEC_SHELL.test(window) && !EXEC_SHELL.test(lines[i + 1] ?? '')) {
      hits.push({ file, line: i + 1, text: line.trim(), rule: 'shell exec of a tmux string' })
    } else if (TMUX_SHELL_STRING.test(line)) {
      hits.push({ file, line: i + 1, text: line.trim(), rule: 'tmux command built as a string' })
    }
    if (!allowDirect && DIRECT_TMUX.test(line)) {
      hits.push({ file, line: i + 1, text: line.trim(), rule: "direct child_process call to 'tmux' (use lib/tmux-runtime.mjs)" })
    }
  })
  return hits
}

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
      out.push(...walk(p))
    } else if (/\.(ts|tsx|mjs|js|cjs)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      out.push(p)
    }
  }
  return out
}

// Strings in these files are user-facing help text that tells a person what to
// type in their own terminal. They are never executed.
const HELP_TEXT = new Set(['lib/tutorialData.ts', 'lib/glossaryData.ts', 'lib/help-knowledge.ts'])

const rel = (p: string) => path.relative(ROOT, p).split(path.sep).join('/')

describe('no shell-string tmux calls', () => {
  it('server.mjs has none, and calls tmux only through lib/tmux-runtime.mjs', () => {
    const src = fs.readFileSync(path.join(ROOT, 'server.mjs'), 'utf-8')
    expect(findShellTmux(src, 'server.mjs', { allowDirect: false })).toEqual([])
  })

  it('lib/ and services/ have none', () => {
    const files = [...walk(path.join(ROOT, 'lib')), ...walk(path.join(ROOT, 'services'))]
      .filter(f => !HELP_TEXT.has(rel(f)))
    const hits = files.flatMap(f => findShellTmux(fs.readFileSync(f, 'utf-8'), rel(f)))
    expect(hits).toEqual([])
  })

  describe('the detector itself', () => {
    // The calls this phase removed, verbatim. If the detector stops seeing
    // them, the two tests above are passing for the wrong reason.
    const removed = [
      'const raw = execSync(`tmux capture-pane -p -t "${sessionName}" -S -200`,',
      'const res = execSync(\n      `tmux capture-pane -p -J -t "${sessionName}" -S -${lines}`,',
      "const inMode = execSync(`tmux display-message -p -t \"${sessionName}\" '#{pane_in_mode}'`,",
      'execSync(`tmux send-keys -t "${sessionName}" -X cancel`, { timeout: 2000 })',
      'execSync(`tmux load-buffer -b "${bufferName}" "${tmpFile}"`, { timeout: 3000 })',
      'execSync(`tmux paste-buffer -d -r -b "${bufferName}" -t "${sessionName}"`, { timeout: 3000 })',
      'try { execSync(`tmux send-keys -t "${sessionName}" -N ${count} BSpace`, { timeout: 3000 }) } catch {}',
      "const { stdout } = await execAsync('tmux -V', { timeout: 5000 })",
      'const cmd = `tmux has-session -t "${name}" 2>/dev/null`',
    ]
    for (const snippet of removed) {
      it(`catches: ${snippet.split('\n')[0].slice(0, 70)}`, () => {
        expect(findShellTmux(snippet, 'fixture').length).toBeGreaterThan(0)
      })
    }

    it("catches a direct execFile('tmux', …) in server.mjs", () => {
      const src = "execFile('tmux', ['set-option', '-t', sessionName, 'mouse', 'off'], cb)"
      expect(findShellTmux(src, 'server.mjs', { allowDirect: false })).toHaveLength(1)
    })

    it('ignores argv calls, comments, and prose that mentions tmux', () => {
      const ok = [
        "await tmux(['has-session', '-t', assertSessionName(name)])",
        '// was: execSync(`tmux send-keys -t "${s}" C-m`)',
        '/* `tmux capture-pane -p` used to run through a shell */',
        "console.log(`[Scheduler] Creating tmux session \"${sessionName}\" in ${cwd}`)",
        "message: 'tmux not found or not executable',",
        "const url = 'http://localhost:23000' // tmux has-session",
      ].join('\n')
      expect(findShellTmux(ok, 'fixture', { allowDirect: false })).toEqual([])
    })
  })
})
