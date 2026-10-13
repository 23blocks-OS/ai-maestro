import { describe, it, expect } from 'vitest'
import { canWakeInOneClick, oneClickWakeOptions, oneClickToast } from '@/lib/wake-flow'
import { buildWakeBody } from '@/lib/wake-request'

describe('canWakeInOneClick', () => {
  it('is true once the agent has a tool recorded, whatever the tool', () => {
    for (const program of ['claude-code', 'grok', 'copilot', 'pi', 'codex', 'none', '/usr/local/bin/claude-sandboxed.sh']) {
      expect(canWakeInOneClick({ program }), program).toBe(true)
    }
  })

  it('is false for a first wake: nothing recorded, so the person has to choose', () => {
    expect(canWakeInOneClick({})).toBe(false)
    expect(canWakeInOneClick({ program: '' })).toBe(false)
    expect(canWakeInOneClick({ program: '   ' })).toBe(false)
  })
})

describe('oneClickWakeOptions', () => {
  it('sends the stored mode explicitly, including supervised, so the request says what will happen', () => {
    expect(oneClickWakeOptions({ program: 'claude-code', permissionMode: 'supervised' }).permissionMode).toBe('supervised')
    expect(oneClickWakeOptions({ program: 'claude-code', permissionMode: 'fullAutonomy' }).permissionMode).toBe('fullAutonomy')
    expect(oneClickWakeOptions({ program: 'grok', permissionMode: 'planOnly' }).permissionMode).toBe('planOnly')
  })

  it('never sends a mode the tool cannot honour; falls back to supervised where there is a choice', () => {
    expect(oneClickWakeOptions({ program: 'copilot', permissionMode: 'planOnly' }).permissionMode).toBe('supervised')
    expect(oneClickWakeOptions({ program: 'claude-code' }).permissionMode).toBe('supervised')
  })

  it('sends no mode for a tool without a permission choice, or a wrapper script', () => {
    expect(oneClickWakeOptions({ program: 'pi', permissionMode: 'fullAutonomy' }).permissionMode).toBeUndefined()
    expect(oneClickWakeOptions({ program: '/usr/local/bin/claude-sandboxed.sh', permissionMode: 'fullAutonomy' }).permissionMode).toBeUndefined()
  })

  it('does not remember anything (nothing changed) and leaves the program and options to the server', () => {
    const body = buildWakeBody('', oneClickWakeOptions({ program: 'copilot', permissionMode: 'fullAutonomy' }))
    expect(body).toEqual({ permissionMode: 'fullAutonomy' })
    expect('program' in body).toBe(false)
    expect('launchOptions' in body).toBe(false)
    expect('remember' in body).toBe(false)
  })
})

describe('oneClickToast', () => {
  it('says what starts and how freely, and how to choose differently', () => {
    const t = oneClickToast('Aria', { program: 'claude-code', permissionMode: 'supervised' })
    expect(t.title).toBe('Waking Aria')
    expect(t.message).toContain('Claude Code')
    expect(t.message).toContain('asks before every change')
    expect(t.message).toContain('Shift-click')
    expect(t.handsOff).toBe(false)
  })

  it('flags a hands-off wake, so the toast can be a warning', () => {
    const t = oneClickToast('Aria', { program: 'claude-code', permissionMode: 'fullAutonomy' })
    expect(t.handsOff).toBe(true)
    expect(t.message).toContain('asks for nothing')
  })

  it('names a wrapper by its file, and a tool without modes without a mode phrase', () => {
    expect(oneClickToast('Aria', { program: '/usr/local/bin/claude-sandboxed.sh' }).message).toMatch(/^claude-sandboxed\.sh\./)
    expect(oneClickToast('Aria', { program: 'pi' }).message).toMatch(/^Pi\./)
  })
})
