import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  getAgent: vi.fn(),
  updateAgent: vi.fn(),
}))
vi.mock('@/lib/agent-registry', () => ({ getAgent: mocks.getAgent, updateAgent: mocks.updateAgent }))

import { rememberLaunchChoice } from '@/lib/launch-choice'

const agent = (over: Record<string, unknown> = {}) => ({ id: 'a1', name: 'aria', program: 'claude-code', permissionMode: 'supervised', ...over })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getAgent.mockReturnValue(agent())
})

describe('remembering what an agent was woken with (F040)', () => {
  it('saves a different tool under its command, and Claude under the long-standing "claude-code"', () => {
    expect(rememberLaunchChoice('a1', { program: 'grok' })).toMatchObject({ saved: true, program: 'grok' })
    expect(mocks.updateAgent).toHaveBeenCalledWith('a1', { program: 'grok' })

    mocks.getAgent.mockReturnValue(agent({ program: 'codex' }))
    rememberLaunchChoice('a1', { program: 'claude' })
    expect(mocks.updateAgent).toHaveBeenLastCalledWith('a1', { program: 'claude-code' })
  })

  it('does not write when nothing changed', () => {
    const r = rememberLaunchChoice('a1', { program: 'claude' })
    expect(r.saved).toBe(true)
    expect(mocks.updateAgent).not.toHaveBeenCalled()
  })

  it('saves the permission mode when the tool can honour it', () => {
    rememberLaunchChoice('a1', { program: 'claude', permissionMode: 'trustEdits' })
    expect(mocks.updateAgent).toHaveBeenCalledWith('a1', { permissionMode: 'trustEdits' })
    mocks.getAgent.mockReturnValue(agent({ program: 'grok' }))
    rememberLaunchChoice('a1', { permissionMode: 'planOnly' })
    expect(mocks.updateAgent).toHaveBeenLastCalledWith('a1', { permissionMode: 'planOnly' })
  })

  it('does not store a mode the tool cannot honour: it would look chosen and do nothing', () => {
    mocks.getAgent.mockReturnValue(agent({ program: 'copilot' }))
    rememberLaunchChoice('a1', { permissionMode: 'planOnly' })
    expect(mocks.updateAgent).not.toHaveBeenCalled()
    mocks.getAgent.mockReturnValue(agent({ program: 'pi' }))
    rememberLaunchChoice('a1', { permissionMode: 'fullAutonomy' })
    expect(mocks.updateAgent).not.toHaveBeenCalled()
  })

  it('stores full autonomy for Copilot, and judges the mode against the NEW tool when both change', () => {
    rememberLaunchChoice('a1', { program: 'copilot', permissionMode: 'fullAutonomy' })
    expect(mocks.updateAgent).toHaveBeenCalledWith('a1', { program: 'copilot', permissionMode: 'fullAutonomy' })
    mocks.updateAgent.mockClear()
    rememberLaunchChoice('a1', { program: 'pi', permissionMode: 'trustEdits' })
    expect(mocks.updateAgent).toHaveBeenCalledWith('a1', { program: 'pi' })
  })

  it('never remembers a program that would not launch, so a typo cannot replace a working setting', () => {
    expect(rememberLaunchChoice('a1', { program: 'definitely-not-a-tool' }).saved).toBe(false)
    expect(rememberLaunchChoice('a1', { program: '/nonexistent/path/tool.sh' }).saved).toBe(false)
    expect(rememberLaunchChoice('a1', { program: 'copilot; rm -rf /' }).saved).toBe(false)
    expect(mocks.updateAgent).not.toHaveBeenCalled()
  })

  it('never replaces a wrapper script (a sandbox) with a bare tool', () => {
    mocks.getAgent.mockReturnValue(agent({ program: '/usr/local/bin/claude-sandboxed.sh' }))
    expect(rememberLaunchChoice('a1', { program: 'claude', permissionMode: 'trustEdits' }).saved).toBe(false)
    expect(mocks.updateAgent).not.toHaveBeenCalled()
  })

  it('remembers a plain shell as "none"', () => {
    rememberLaunchChoice('a1', { program: 'terminal' })
    expect(mocks.updateAgent).toHaveBeenCalledWith('a1', { program: 'none' })
  })

  it('does nothing for an unknown agent, and never throws into the wake', () => {
    mocks.getAgent.mockReturnValue(null)
    expect(rememberLaunchChoice('ghost', { program: 'grok' }).saved).toBe(false)
    mocks.getAgent.mockReturnValue(agent())
    mocks.updateAgent.mockImplementation(() => { throw new Error('disk full') })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(() => rememberLaunchChoice('a1', { program: 'grok' })).not.toThrow()
    expect(rememberLaunchChoice('a1', { program: 'grok' }).saved).toBe(false)
  })
})
