/**
 * scripts/claude-hooks/install-hooks.sh against a temporary HOME: the Claude Code hooks
 * it registers, and that running it again changes nothing (B011 #3 added StopFailure
 * and SessionEnd so an API error or a quit clears the recorded status).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { execFileSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'

const SCRIPT = path.join(process.cwd(), 'scripts/claude-hooks/install-hooks.sh')
let home: string

const run = () => execFileSync('bash', [SCRIPT, '-y'], { env: { ...process.env, HOME: home }, encoding: 'utf8', timeout: 30000 })
const settings = () => JSON.parse(fs.readFileSync(path.join(home, '.claude', 'settings.json'), 'utf8'))
const ours = (cfgs: any[]) => cfgs.flatMap(c => c.hooks || []).filter(h => String(h.command).includes('ai-maestro-hook'))

beforeEach(() => { home = fs.mkdtempSync(path.join(os.tmpdir(), 'install-hooks-')) })
afterEach(() => fs.rmSync(home, { recursive: true, force: true }))

describe('install-hooks.sh · Claude Code', () => {
  it('registers the turn events and the clearing events', () => {
    run()
    const hooks = settings().hooks
    for (const event of ['Notification', 'Stop', 'UserPromptSubmit', 'SessionStart', 'PostToolBatch', 'StopFailure', 'SessionEnd'])
      expect(ours(hooks[event] || []).length, event).toBe(1)
  })

  it('registers the clearing events async, so they never delay Claude', () => {
    run()
    const hooks = settings().hooks
    for (const event of ['PostToolBatch', 'StopFailure', 'SessionEnd'])
      expect(ours(hooks[event])[0].async, event).toBe(true)
    // Stop and UserPromptSubmit inject context and block, so they stay synchronous
    expect(ours(hooks.Stop)[0].async).toBeUndefined()
  })

  it('is idempotent: a second run changes nothing', () => {
    run()
    const first = fs.readFileSync(path.join(home, '.claude', 'settings.json'), 'utf8')
    run()
    expect(fs.readFileSync(path.join(home, '.claude', 'settings.json'), 'utf8')).toBe(first)
  })

  it('upgrades an install that predates the new events without duplicating the old ones', () => {
    run()
    const file = path.join(home, '.claude', 'settings.json')
    const s = settings()
    delete s.hooks.StopFailure
    delete s.hooks.SessionEnd
    s.hooks.Stop.push({ hooks: [{ type: 'command', command: 'echo mine' }] }) // someone else's hook
    fs.writeFileSync(file, JSON.stringify(s))
    run()
    const after = settings().hooks
    expect(ours(after.StopFailure).length).toBe(1)
    expect(ours(after.SessionEnd).length).toBe(1)
    expect(ours(after.Stop).length).toBe(1)
    expect(JSON.stringify(after.Stop)).toContain('echo mine')
  })
})
