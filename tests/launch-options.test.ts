import { describe, it, expect } from 'vitest'
import {
  launchOptionsFor, sanitizeLaunchOptions, launchOptionArgs, modelFromOptions, previewCommand, permissionFlagsFor,
} from '@/lib/launch-options'

describe('launchOptionsFor: what each tool declares', () => {
  it('lists the options we verified against each tool\'s --help, and none for tools we only open in the terminal', () => {
    expect(launchOptionsFor('claude').map((o) => o.id)).toEqual(['model'])
    expect(launchOptionsFor('grok').map((o) => o.id)).toEqual(['model', 'continue'])
    expect(launchOptionsFor('copilot').map((o) => o.id)).toEqual(['model', 'effort', 'continue', 'addDir'])
    expect(launchOptionsFor('pi').map((o) => o.id)).toEqual(['model', 'thinking', 'continue', 'noSession'])
    expect(launchOptionsFor('codex').map((o) => o.id)).toEqual(['model', 'search', 'addDir'])
    for (const k of ['gemini', 'opencode', 'openclaw', 'cursor', 'aider', null, undefined] as const) {
      expect(launchOptionsFor(k as never)).toEqual([])
    }
  })

  it('every option carries the flag the tool really has', () => {
    const flags = (k: 'copilot' | 'pi' | 'grok') => Object.fromEntries(launchOptionsFor(k).map((o) => [o.id, o.flag]))
    expect(flags('copilot')).toEqual({ model: '--model', effort: '--reasoning-effort', continue: '--continue', addDir: '--add-dir' })
    expect(flags('pi')).toEqual({ model: '--model', thinking: '--thinking', continue: '--continue', noSession: '--no-session' })
    expect(flags('grok')).toEqual({ model: '--model', continue: '--continue' })
  })
})

describe('sanitizeLaunchOptions', () => {
  it('keeps valid values and drops everything else', () => {
    expect(sanitizeLaunchOptions('copilot', { model: 'gpt-5', effort: 'high', continue: true, addDir: '~/projects/shared', bogus: 'x' }))
      .toEqual({ model: 'gpt-5', effort: 'high', continue: true, addDir: '~/projects/shared' })
  })

  it('drops options the tool does not declare (a Pi flag sent for Copilot)', () => {
    expect(sanitizeLaunchOptions('copilot', { thinking: 'high', noSession: true })).toEqual({})
    expect(sanitizeLaunchOptions('claude', { continue: true, effort: 'high' })).toEqual({})
    expect(sanitizeLaunchOptions(null, { model: 'x' })).toEqual({})
  })

  it('a choice must be on the list; a toggle must be exactly true', () => {
    expect(sanitizeLaunchOptions('pi', { thinking: 'extreme' })).toEqual({})
    expect(sanitizeLaunchOptions('pi', { thinking: 'xhigh' })).toEqual({ thinking: 'xhigh' })
    expect(sanitizeLaunchOptions('pi', { continue: 'true', noSession: 1 })).toEqual({})
    expect(sanitizeLaunchOptions('pi', { continue: false })).toEqual({})
  })

  it('refuses anything that could end a shell word or start another command', () => {
    const attacks = ['gpt; rm -rf ~', 'a b', '$(whoami)', '`id`', 'x|y', 'x&y', "x'y", 'x"y', 'x\ny', '-rf', '--yolo', 'x>y', 'x\\y', '', '   ']
    for (const bad of attacks) {
      expect(sanitizeLaunchOptions('copilot', { model: bad, addDir: bad }), JSON.stringify(bad)).toEqual({})
    }
  })

  it('accepts the shapes real model ids and paths have', () => {
    for (const m of ['gpt-5', 'claude-sonnet-5-5', 'anthropic/claude-opus:high', 'o3-mini', 'grok-4.1']) {
      expect(sanitizeLaunchOptions('pi', { model: m }), m).toEqual({ model: m })
    }
    for (const d of ['~/projects/shared', '/Users/me/code/a-b_c.d', '../sibling']) {
      expect(sanitizeLaunchOptions('copilot', { addDir: d }), d).toEqual({ addDir: d })
    }
  })

  it('is safe on garbage input', () => {
    for (const raw of [null, undefined, 'x', 5, [], [1, 2]]) expect(sanitizeLaunchOptions('pi', raw)).toEqual({})
  })
})

describe('launchOptionArgs and modelFromOptions', () => {
  it('turns options into flags in declaration order, without the model', () => {
    expect(launchOptionArgs('copilot', { addDir: '~/x', continue: true, effort: 'low', model: 'gpt-5' }))
      .toEqual(['--reasoning-effort', 'low', '--continue', '--add-dir', '~/x'])
    expect(launchOptionArgs('pi', { noSession: true, thinking: 'off' })).toEqual(['--thinking', 'off', '--no-session'])
    expect(launchOptionArgs('grok', { continue: true })).toEqual(['--continue'])
    expect(launchOptionArgs('copilot', {})).toEqual([])
  })

  it('reads the model separately, validated', () => {
    expect(modelFromOptions('pi', { model: 'anthropic/claude-opus' })).toBe('anthropic/claude-opus')
    expect(modelFromOptions('pi', { model: 'a b' })).toBeUndefined()
    expect(modelFromOptions('codex', { model: 'gpt-5' })).toBe('gpt-5')
    expect(modelFromOptions('gemini', { model: 'x' })).toBeUndefined()
  })
})

describe('previewCommand: the line the screen shows is what the server builds', () => {
  it('shows the tool alone when nothing is chosen', () => {
    expect(previewCommand({ command: 'copilot', kind: 'copilot' })).toBe('copilot')
  })

  it('adds the model, the permission flag and the options', () => {
    expect(previewCommand({ command: 'copilot', kind: 'copilot', mode: 'fullAutonomy', options: { model: 'gpt-5', continue: true } }))
      .toBe('copilot --model gpt-5 --allow-all-tools --continue')
    expect(previewCommand({ command: 'claude', kind: 'claude', mode: 'trustEdits', options: { model: 'opus' } }))
      .toBe('claude --model opus --permission-mode acceptEdits')
    expect(previewCommand({ command: 'grok', kind: 'grok', mode: 'fullAutonomy' })).toBe('grok --always-approve')
    expect(previewCommand({ command: 'pi', kind: 'pi', mode: 'fullAutonomy', options: { thinking: 'high' } })).toBe('pi --thinking high')
  })

  it('supervised adds nothing, and an invalid value never reaches the line', () => {
    expect(previewCommand({ command: 'claude', kind: 'claude', mode: 'supervised' })).toBe('claude')
    expect(previewCommand({ command: 'copilot', kind: 'copilot', options: { model: 'x; rm -rf ~' } })).toBe('copilot')
  })
})

describe('permissionFlagsFor', () => {
  it('matches what the server adds for each tool', () => {
    expect(permissionFlagsFor('claude', 'planOnly')).toBe('--permission-mode plan')
    expect(permissionFlagsFor('claude', 'supervised')).toBe('')
    expect(permissionFlagsFor('grok', 'smartAuto')).toBe('--permission-mode auto')
    expect(permissionFlagsFor('copilot', 'trustEdits')).toBe('')
    expect(permissionFlagsFor('pi', 'fullAutonomy')).toBe('')
    expect(permissionFlagsFor(null, 'fullAutonomy')).toBe('')
  })
})
