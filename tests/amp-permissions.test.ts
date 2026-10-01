/**
 * configure_amp_permissions() in install-plugin.sh.
 *
 * The prefixed AMP rules used to be written `Bash(AMP_DIR=* amp-read.sh:*)`.
 * The `:*` suffix can't be combined with another `*`, so Claude Code read the
 * `*` literally: the rules never matched, and every session start printed a
 * warning for each of the 16. The installer now writes the space form and
 * removes the old rules from the user settings and the current project.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { execFileSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'

const SCRIPT = path.join(__dirname, '..', 'install-plugin.sh')
let root: string
const home = () => path.join(root, 'home')
const proj = () => path.join(root, 'proj')
const userSettings = () => path.join(home(), '.claude', 'settings.json')
const projectSettings = () => path.join(proj(), '.claude', 'settings.local.json')

function run(): string {
  const src = fs.readFileSync(SCRIPT, 'utf8')
  const fn = src.match(/^configure_amp_permissions\(\) \{[\s\S]*?^\}/m)
  if (!fn) throw new Error('configure_amp_permissions() not found in install-plugin.sh')
  const harness = path.join(root, 'h.sh')
  fs.writeFileSync(
    harness,
    'print_success() { echo "OK: $*"; }\nprint_info() { echo "INFO: $*"; }\nprint_warning() { echo "WARN: $*"; }\n' +
      'NON_INTERACTIVE=true\n' + fn[0] + '\nconfigure_amp_permissions\n'
  )
  return execFileSync('bash', [harness], { encoding: 'utf8', cwd: proj(), env: { ...process.env, HOME: home() } })
}

const allow = (file: string): string[] => JSON.parse(fs.readFileSync(file, 'utf8')).permissions.allow

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'amp-perms-'))
  fs.mkdirSync(path.dirname(userSettings()), { recursive: true })
  fs.mkdirSync(path.dirname(projectSettings()), { recursive: true })
})
afterEach(() => fs.rmSync(root, { recursive: true, force: true }))

describe('AMP permission rules', () => {
  it('writes no rule that mixes * with the trailing :* suffix', () => {
    run()
    const rules = allow(userSettings())
    expect(rules.filter(r => r.endsWith(':*)') && r.slice(0, -3).includes('*'))).toEqual([])
    expect(rules).toContain('Bash(amp-read.sh:*)')
    expect(rules).toContain('Bash(CLAUDE_AGENT_NAME=* amp-read.sh)')
    expect(rules).toContain('Bash(CLAUDE_AGENT_NAME=* amp-read.sh *)')
    expect(rules).toContain('Bash(AMP_DIR=* amp-read.sh *)')
  })

  it('never allows the commands kept behind a human', () => {
    run()
    const rules = allow(userSettings()).join(' ')
    for (const c of ['amp-init.sh', 'amp-register.sh', 'amp-delete.sh']) expect(rules).not.toContain(c)
  })

  it('removes the old rules from user and project settings, keeping everything else', () => {
    fs.writeFileSync(userSettings(), JSON.stringify({
      permissions: { allow: ['Bash(git status)', 'Bash(CLAUDE_AGENT_NAME=* amp-inbox.sh:*)', 'Bash(AMP_DIR=* amp-read.sh:*)'] },
      hooks: { Stop: [] },
    }))
    fs.writeFileSync(projectSettings(), JSON.stringify({
      permissions: { allow: ['Bash(ls)', 'Bash(CLAUDE_AGENT_NAME=* amp-reply.sh:*)'] },
    }))
    run()
    const user = JSON.parse(fs.readFileSync(userSettings(), 'utf8'))
    expect(user.permissions.allow).toContain('Bash(git status)')
    expect(user.permissions.allow).not.toContain('Bash(CLAUDE_AGENT_NAME=* amp-inbox.sh:*)')
    expect(user.hooks).toEqual({ Stop: [] })
    expect(allow(projectSettings())).toEqual(['Bash(ls)'])
  })

  it('is idempotent: a second run adds nothing', () => {
    run()
    const first = allow(userSettings())
    const out = run()
    expect(allow(userSettings())).toEqual(first)
    expect(out).toContain('already configured')
  })
})
