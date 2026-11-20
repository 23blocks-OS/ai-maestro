/**
 * scripts/sync-agent-skills.sh: AI Maestro's skills reach an agent's own Claude folder (CLAUDE_CONFIG_DIR), are
 * refreshed when they change, and the agent's own skill of the same name is never touched.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { execFileSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'

const SCRIPT = path.join(process.cwd(), 'scripts/sync-agent-skills.sh')
let tmp: string, src: string, dir: string
const run = () => execFileSync('bash', [SCRIPT, dir], { env: { ...process.env, AIM_SKILLS_SOURCE: src }, encoding: 'utf8' })
const skill = (root: string, name: string, body: string) => {
  fs.mkdirSync(path.join(root, name), { recursive: true })
  fs.writeFileSync(path.join(root, name, 'SKILL.md'), body)
}
const read = (name: string) => fs.readFileSync(path.join(dir, 'skills', name, 'SKILL.md'), 'utf8')

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-skills-'))
  src = path.join(tmp, 'host-skills'); dir = path.join(tmp, 'acme-claude')
  fs.mkdirSync(dir)
  skill(src, 'agent-messaging', 'v1')
  skill(src, 'not-ours', 'x') // in the host folder but not a plugin skill
})
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }))

describe('sync-agent-skills.sh', () => {
  it('copies the plugin skills, refreshes them, and leaves other skills out', () => {
    run()
    expect(read('agent-messaging')).toBe('v1')
    expect(fs.existsSync(path.join(dir, 'skills', 'not-ours'))).toBe(false)
    fs.writeFileSync(path.join(src, 'agent-messaging', 'SKILL.md'), 'v2')
    run()
    expect(read('agent-messaging')).toBe('v2')
  })

  it("never touches the agent's own skill of the same name", () => {
    skill(path.join(dir, 'skills'), 'agent-messaging', 'mine')
    run()
    expect(read('agent-messaging')).toBe('mine')
  })

  it('fails on a missing folder', () => {
    expect(() => execFileSync('bash', [SCRIPT, path.join(tmp, 'nope')], { stdio: 'pipe' })).toThrow()
  })
})
