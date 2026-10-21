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

// PATH starts with a directory holding a fake `claude` (when `claude` is given) so the installer's version
// check is deterministic; the rest of PATH stays so node and the shell tools work.
let bin: string
const fakeClaude = (version: string) => {
  fs.writeFileSync(path.join(bin, 'claude'), `#!/bin/sh\necho "${version} (Claude Code)"\n`, { mode: 0o755 })
}
const run = (extraEnv: Record<string, string> = {}) =>
  execFileSync('bash', [SCRIPT, '-y'], { env: { ...process.env, HOME: home, PATH: `${bin}:${process.env.PATH}`, ...extraEnv }, encoding: 'utf8', timeout: 30000 })
const settings = () => JSON.parse(fs.readFileSync(path.join(home, '.claude', 'settings.json'), 'utf8'))
const ours = (cfgs: any[]) => cfgs.flatMap(c => c.hooks || []).filter(h => String(h.command).includes('ai-maestro-hook'))

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'install-hooks-'))
  bin = fs.mkdtempSync(path.join(os.tmpdir(), 'install-hooks-bin-'))
})
afterEach(() => {
  fs.rmSync(home, { recursive: true, force: true })
  fs.rmSync(bin, { recursive: true, force: true })
})
const settingsPath = () => path.join(home, '.claude', 'settings.json')
const backups = () => fs.readdirSync(path.join(home, '.claude')).filter(f => f.includes('.aimaestro-backup-'))

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


describe('install-hooks.sh · PermissionRequest (observe-only, 2.0.45 or later)', () => {
  it('registers it, async and with a short timeout, when Claude Code is new enough', () => {
    fakeClaude('2.1.306')
    run()
    const entry = ours(settings().hooks.PermissionRequest || [])
    expect(entry.length).toBe(1)
    expect(entry[0].async).toBe(true)
    expect(entry[0].timeout).toBe(5)
    expect(entry[0].command).toMatch(/^node .*ai-maestro-hook\.cjs$/) // no prefix, no decision flags
  })

  it('does not register it on a Claude Code older than 2.0.45, or when there is none to ask', () => {
    fakeClaude('2.0.44')
    run()
    expect(settings().hooks.PermissionRequest).toBeUndefined()
    fs.rmSync(path.join(bin, 'claude'))
    fs.rmSync(settingsPath())
    // no `claude` anywhere: a PATH of our empty bin (with node linked in) and the system directories
    fs.symlinkSync(process.execPath, path.join(bin, 'node'))
    const out = execFileSync('bash', [SCRIPT, '-y'], {
      env: { ...process.env, HOME: home, PATH: `${bin}:/usr/bin:/bin` }, encoding: 'utf8',
    })
    expect(settings().hooks.PermissionRequest).toBeUndefined()
    expect(out).toMatch(/PermissionRequest hook: skipped/)
  })

  it('AIM_PERMISSION_REQUEST_HOOK=1 registers it without a version check', () => {
    run({ AIM_PERMISSION_REQUEST_HOOK: '1' })
    expect(ours(settings().hooks.PermissionRequest).length).toBe(1)
  })

  it('is idempotent: a second run leaves the file byte for byte and makes no backup', () => {
    fakeClaude('2.1.306')
    run()
    const first = fs.readFileSync(settingsPath(), 'utf8')
    run()
    expect(fs.readFileSync(settingsPath(), 'utf8')).toBe(first)
    expect(backups()).toEqual([])
  })

  it('does not touch a PermissionRequest hook that is somebody else\'s', () => {
    fakeClaude('2.1.306')
    fs.mkdirSync(path.join(home, '.claude'), { recursive: true })
    fs.writeFileSync(settingsPath(), JSON.stringify({ hooks: { PermissionRequest: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'my-guard.sh' }] }] } }))
    run()
    const groups = settings().hooks.PermissionRequest
    expect(JSON.stringify(groups)).toContain('my-guard.sh')
    expect(ours(groups).length).toBe(1)
    run({ AIM_PERMISSION_REQUEST_HOOK: '0' })
    const after = settings().hooks.PermissionRequest
    expect(JSON.stringify(after)).toContain('my-guard.sh')
    expect(ours(after).length).toBe(0)
  })

  it('AIM_PERMISSION_REQUEST_HOOK=0 removes our entry and leaves every other event alone', () => {
    fakeClaude('2.1.306')
    run()
    run({ AIM_PERMISSION_REQUEST_HOOK: '0' })
    const hooks = settings().hooks
    expect(hooks.PermissionRequest).toBeUndefined()
    for (const event of ['Notification', 'Stop', 'UserPromptSubmit', 'SessionStart', 'PostToolBatch', 'StopFailure', 'SessionEnd'])
      expect(ours(hooks[event]).length, event).toBe(1)
    run({ AIM_PERMISSION_REQUEST_HOOK: '0' })
    expect(settings().hooks.PermissionRequest).toBeUndefined()
  })
})

describe('install-hooks.sh · updating an existing install', () => {
  const oldHook = (extra: Record<string, unknown> = {}) => ({ type: 'command', command: 'node /old/place/ai-maestro-hook.cjs', timeout: 5, ...extra })
  const oldInstall = () => ({
    model: 'opus',
    permissions: { allow: ['Bash(ls:*)'] },
    hooks: {
      Notification: [{ matcher: 'idle_prompt|permission_prompt', hooks: [oldHook()] }],
      Stop: [{ hooks: [oldHook(), { type: 'command', command: 'echo mine' }] }],
      PostToolBatch: [{ hooks: [oldHook({ async: true })] }],
      PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'guard.sh' }] }],
    },
  })

  it('brings an old matcher and a moved script up to date in place', () => {
    fakeClaude('2.1.306')
    fs.mkdirSync(path.join(home, '.claude'), { recursive: true })
    fs.writeFileSync(settingsPath(), JSON.stringify(oldInstall(), null, 2))
    run()
    const s = settings()
    const [group] = s.hooks.Notification
    expect(group.matcher).toBe('idle_prompt|permission_prompt|elicitation_dialog')
    expect(ours(s.hooks.Notification).length).toBe(1)
    expect(ours(s.hooks.Notification)[0].command).not.toContain('/old/place/')
    expect(ours(s.hooks.PostToolBatch)[0].async).toBe(true)
  })

  it('keeps everything that is not ours: other hooks in a shared group, other events, other settings', () => {
    fakeClaude('2.1.306')
    fs.mkdirSync(path.join(home, '.claude'), { recursive: true })
    fs.writeFileSync(settingsPath(), JSON.stringify(oldInstall(), null, 2))
    run()
    const s = settings()
    expect(s.model).toBe('opus')
    expect(s.permissions).toEqual({ allow: ['Bash(ls:*)'] })
    expect(s.hooks.PreToolUse).toEqual(oldInstall().hooks.PreToolUse)
    expect(JSON.stringify(s.hooks.Stop)).toContain('echo mine')
    expect(ours(s.hooks.Stop).length).toBe(1)
    expect(ours(s.hooks.Stop)[0].command).not.toContain('/old/place/')
  })

  it('keeps a backup of the file it replaced, and a second run changes nothing more', () => {
    fakeClaude('2.1.306')
    fs.mkdirSync(path.join(home, '.claude'), { recursive: true })
    const before = JSON.stringify(oldInstall(), null, 2)
    fs.writeFileSync(settingsPath(), before)
    const out = run()
    expect(out).toMatch(/Updated .*settings\.json/)
    expect(backups().length).toBe(1)
    expect(fs.readFileSync(path.join(home, '.claude', backups()[0]), 'utf8')).toBe(before)
    const after = fs.readFileSync(settingsPath(), 'utf8')
    run()
    expect(fs.readFileSync(settingsPath(), 'utf8')).toBe(after)
    expect(backups().length).toBe(1)
  })

  it('collapses two copies of our hook for one event into one', () => {
    fakeClaude('2.1.306')
    fs.mkdirSync(path.join(home, '.claude'), { recursive: true })
    const s = oldInstall()
    s.hooks.Stop.push({ hooks: [oldHook()] })
    fs.writeFileSync(settingsPath(), JSON.stringify(s))
    run()
    expect(ours(settings().hooks.Stop).length).toBe(1)
  })

  it('leaves an unreadable settings file alone instead of replacing it', () => {
    fakeClaude('2.1.306')
    fs.mkdirSync(path.join(home, '.claude'), { recursive: true })
    fs.writeFileSync(settingsPath(), '{ not json')
    try { run() } catch { /* the installer may exit non-zero */ }
    expect(fs.readFileSync(settingsPath(), 'utf8')).toBe('{ not json')
  })
})
