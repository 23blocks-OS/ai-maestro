/**
 * Creating an agent starts its program with the SAME command a wake would build (lib/launch-command), carries the
 * permission mode and launch options chosen in the wizard, and saves them on the agent. Before F040 step 3 it typed
 * a bare tool name, so a new agent ran differently from the first wake onwards, and the wizard could not choose
 * the tool or how freely it acts at all.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const m = vi.hoisted(() => ({
  sendKeys: vi.fn(async (..._a: unknown[]) => {}),
  createAgent: vi.fn((req: any) => ({ id: 'agent-1', ...req })),
  getAgentByName: vi.fn((_n?: string): any => undefined),
}))

vi.mock('@/lib/agent-runtime', () => ({
  getRuntime: () => ({
    sessionExists: async () => false,
    createSession: async () => {},
    setEnvironment: async () => {},
    unsetEnvironment: async () => {},
    sendKeys: m.sendKeys,
    describePane: async () => ({ command: 'node' }),
  }),
}))
vi.mock('@/lib/hosts-config', () => ({
  getHosts: () => [], getSelfHost: () => ({ id: 'self', url: 'http://localhost:23000', name: 'self' }),
  isSelf: () => true, getHostById: () => undefined,
}))
vi.mock('@/lib/working-directory', () => ({ resolveWorkingDirectory: () => ({ ok: true, cwd: '/tmp/aria', warnings: [] }) }))
vi.mock('@/lib/session-persistence', () => ({ persistSession: vi.fn(), loadPersistedSessions: () => [], unpersistSession: vi.fn() }))
vi.mock('@/lib/amp-inbox-writer', () => ({ initAgentAMPHome: async () => {}, getAgentAMPDir: () => '/tmp/amp' }))
vi.mock('@/lib/program-launch', () => ({ verifyProgramStarted: async () => ({ started: true }) }))
vi.mock('@/lib/agent-registry', async (orig) => {
  const real = await orig<typeof import('@/lib/agent-registry')>()
  return { ...real, getAgentByName: m.getAgentByName, createAgent: m.createAgent, loadAgents: () => [] }
})

import { createSession } from '@/services/sessions-service'

/** The command typed into the pane (the last send-keys is the program launch; the one before is the env export). */
const typed = () => String(m.sendKeys.mock.calls.at(-1)?.[1] ?? '').replace(/^"|"$/g, '')

beforeEach(() => {
  vi.clearAllMocks()
  m.getAgentByName.mockReturnValue(undefined)
})

describe('createSession starts the program the way a wake does', () => {
  it('Claude Code, supervised: the scrollback fix, as a wake adds it (it used to be a bare `claude`)', async () => {
    await createSession({ name: 'aria', program: 'claude-code' })
    expect(typed()).toBe('CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN=1 claude')
  })

  it('carries the chosen permission mode and saves it on the agent', async () => {
    await createSession({ name: 'aria', program: 'claude-code', permissionMode: 'trustEdits' })
    expect(typed()).toBe('CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN=1 claude --permission-mode acceptEdits')
    expect(m.createAgent).toHaveBeenCalledWith(expect.objectContaining({ program: 'claude-code', permissionMode: 'trustEdits' }))
  })

  it('Copilot CLI with options: its own flags, saved on the agent', async () => {
    await createSession({ name: 'aria', program: 'copilot', permissionMode: 'fullAutonomy', launchOptions: { model: 'gpt-5', continue: true } })
    expect(typed()).toBe('copilot --model gpt-5 --allow-all-tools --continue')
    expect(m.createAgent).toHaveBeenCalledWith(expect.objectContaining({
      program: 'copilot', permissionMode: 'fullAutonomy', launchOptions: { model: 'gpt-5', continue: true },
    }))
  })

  it('Pi: no permission flag, its options only', async () => {
    await createSession({ name: 'aria', program: 'pi', permissionMode: 'fullAutonomy', launchOptions: { thinking: 'low' } })
    expect(typed()).toBe('pi --thinking low')
  })

  it('drops what the tool cannot honour instead of storing it (a mode Copilot has no flag for, Pi\'s option on Claude)', async () => {
    await createSession({ name: 'aria', program: 'copilot', permissionMode: 'planOnly', launchOptions: { thinking: 'high' } })
    expect(typed()).toBe('copilot')
    const saved = m.createAgent.mock.calls[0][0]
    expect(saved.permissionMode).toBeUndefined()
    expect(saved.launchOptions).toBeUndefined()
  })

  it('refuses shell characters in option values (they would be typed into a shell)', async () => {
    await createSession({ name: 'aria', program: 'copilot', launchOptions: { model: 'x; touch /tmp/pwned', addDir: '$(id)' } })
    expect(typed()).toBe('copilot')
    expect(m.createAgent.mock.calls[0][0].launchOptions).toBeUndefined()
  })

  it('a plain terminal launches nothing', async () => {
    await createSession({ name: 'aria', program: 'none', permissionMode: 'fullAutonomy' })
    expect(typed()).not.toMatch(/claude|copilot|grok|pi\b/)
    expect(m.createAgent.mock.calls[0][0].permissionMode).toBeUndefined()
  })

  it('no program given: Claude Code, as always', async () => {
    await createSession({ name: 'aria' })
    expect(typed()).toBe('CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN=1 claude')
  })
})
