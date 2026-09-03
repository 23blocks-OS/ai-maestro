/**
 * Tests for lib/pane-occupant.ts — do not type prose into a shell.
 *
 * Reported on a fresh install (#426). A user created an agent, sent it a
 * sentence of ordinary English through the chat box, and got:
 *
 *     Steve: command not found
 *     Command 'The' not found, did you mean: command 'he' from deb node-he
 *
 * Their prose was executed by bash, one line at a time, because session status
 * `online` means only that the TMUX SESSION EXISTS — not that an agent is
 * running in it. A pane sitting at a shell prompt passed every check.
 *
 * The check is deliberately asymmetric: it does not try to prove an agent is
 * running (too many CLIs, and a false negative would refuse to deliver to a
 * working agent). It proves a SHELL is running, which is a short closed list
 * and the only case that causes harm.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockRuntime: { describePane?: ReturnType<typeof vi.fn> } = {
  describePane: vi.fn(),
}
vi.mock('@/lib/agent-runtime', () => ({ getRuntime: () => mockRuntime }))

import { isShellCommand, isPaneAtBareShell, BARE_SHELL_MESSAGE } from '@/lib/pane-occupant'

beforeEach(() => {
  vi.clearAllMocks()
  mockRuntime.describePane = vi.fn()
})

describe('isShellCommand', () => {
  it.each(['bash', 'zsh', 'sh', 'fish', 'dash', 'ksh', 'tcsh', 'csh', 'ash'])(
    'recognises %s',
    (shell) => expect(isShellCommand(shell)).toBe(true)
  )

  it.each(['-bash', '-zsh', '-sh'])('recognises the login form %s', (shell) => {
    expect(isShellCommand(shell)).toBe(true)
  })

  it('recognises login, which shows while a session is still starting', () => {
    expect(isShellCommand('login')).toBe(true)
  })

  it('is case- and whitespace-insensitive', () => {
    expect(isShellCommand(' BASH ')).toBe(true)
  })

  it.each(['node', 'claude', '2.1.252', 'python3', 'codex', 'nvim'])(
    'does NOT claim %s is a shell',
    (cmd) => expect(isShellCommand(cmd)).toBe(false)
  )

  it('treats nothing as not-a-shell', () => {
    expect(isShellCommand(undefined)).toBe(false)
    expect(isShellCommand(null)).toBe(false)
    expect(isShellCommand('')).toBe(false)
  })
})

describe('isPaneAtBareShell', () => {
  it('is true when the pane is sitting at a shell', async () => {
    mockRuntime.describePane = vi.fn().mockResolvedValue({ command: 'bash' })
    expect(await isPaneAtBareShell('steve')).toBe(true)
  })

  it('is false when an agent occupies the pane', async () => {
    // Claude Code reports its version as the command name.
    mockRuntime.describePane = vi.fn().mockResolvedValue({ command: '2.1.252' })
    expect(await isPaneAtBareShell('steve')).toBe(false)
  })

  it('is false for an UNKNOWN occupant — absence of evidence is not evidence', async () => {
    // Refusing to deliver on a hunch would be worse than the bug this prevents.
    mockRuntime.describePane = vi.fn().mockResolvedValue({ command: 'some-new-agent-cli' })
    expect(await isPaneAtBareShell('steve')).toBe(false)
  })

  it('is false when the runtime cannot introspect the pane', async () => {
    delete mockRuntime.describePane
    expect(await isPaneAtBareShell('steve')).toBe(false)
  })

  it('is false when introspection throws', async () => {
    mockRuntime.describePane = vi.fn().mockRejectedValue(new Error('no such session'))
    expect(await isPaneAtBareShell('steve')).toBe(false)
  })

  it('is false when the pane reports no command at all', async () => {
    mockRuntime.describePane = vi.fn().mockResolvedValue({})
    expect(await isPaneAtBareShell('steve')).toBe(false)
  })

  it('inspects the first pane of the first window', async () => {
    mockRuntime.describePane = vi.fn().mockResolvedValue({ command: 'zsh' })
    await isPaneAtBareShell('steve')
    expect(mockRuntime.describePane).toHaveBeenCalledWith('steve:0.0')
  })
})

describe('the message shown to the user', () => {
  it('names the actual state rather than failing cryptically', () => {
    expect(BARE_SHELL_MESSAGE).toMatch(/shell prompt/i)
    expect(BARE_SHELL_MESSAGE).toMatch(/executed as shell commands/i)
  })

  it('gives the next step, because the reporter asked what they did wrong', () => {
    // "Did I do something wrong in the installation?" deserves an answer, not
    // an error code.
    expect(BARE_SHELL_MESSAGE).toMatch(/wake the agent/i)
    expect(BARE_SHELL_MESSAGE).toMatch(/PATH/)
  })
})
