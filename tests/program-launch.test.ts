/**
 * Tests for lib/program-launch.ts — did the program actually start?
 *
 * Launching means typing a program's name into a tmux pane and pressing Enter.
 * That reports success as long as tmux accepted the keystrokes — which it does
 * even when the shell then answers `claude: command not found`. So an agent
 * whose program is missing, unauthenticated, or off PATH came up looking
 * perfectly healthy with a bare shell behind it, and the next message sent to it
 * was executed by bash (#426).
 *
 * The check is measured rather than predicted, and that choice matters: a
 * preflight `command -v` cannot reproduce the pane's environment. A tmux pane
 * runs an interactive non-login shell (reads ~/.bashrc, not ~/.bash_profile);
 * a check spawned from the server is non-interactive (reads neither). It would
 * confidently disagree with the pane it claims to describe.
 */

import { describe, it, expect, vi } from 'vitest'
import { findLaunchError, verifyProgramStarted } from '@/lib/program-launch'

describe('findLaunchError', () => {
  it('recognises bash/zsh', () => {
    expect(findLaunchError('david@box:~$ claude\nclaude: command not found', 'claude')?.hint)
      .toMatch(/not on PATH/)
  })

  it('recognises sh/dash, which word it differently', () => {
    expect(findLaunchError('$ aider\nsh: 1: aider: not found', 'aider')).not.toBeNull()
  })

  it('recognises a missing wrapper or interpreter', () => {
    expect(findLaunchError('$ /opt/wrap.sh\nbash: /opt/wrap.sh: No such file or directory', '/opt/wrap.sh')?.hint)
      .toMatch(/does not exist/)
  })

  it('recognises a non-executable file', () => {
    expect(findLaunchError('$ /opt/wrap.sh\nbash: /opt/wrap.sh: Permission denied', '/opt/wrap.sh')?.hint)
      .toMatch(/not executable/)
  })

  it('blames only the program that was launched', () => {
    // An unrelated "not found" already on screen must not be reported as this
    // launch's failure.
    expect(findLaunchError('$ frobnicate\nfrobnicate: command not found\n$ claude', 'claude')).toBeNull()
  })

  it('matches a wrapper by its basename', () => {
    expect(
      findLaunchError('bash: claude-sandboxed.sh: command not found', '/opt/bin/claude-sandboxed.sh')
    ).not.toBeNull()
  })

  it('ignores an error far above the launch', () => {
    // Only the tail is scanned: the launch is the most recent thing to happen.
    const old = Array.from({ length: 40 }, () => 'output line').join('\n')
    expect(findLaunchError(`claude: command not found\n${old}`, 'claude')).toBeNull()
  })

  it('finds nothing in a healthy pane', () => {
    expect(findLaunchError('╭───╮\n│ > │\n╰───╯', 'claude')).toBeNull()
  })

  it('handles an empty capture', () => {
    expect(findLaunchError('', 'claude')).toBeNull()
  })
})

describe('verifyProgramStarted', () => {
  const fast = { graceMs: 900, pollMs: 100 }

  it('reports started as soon as the program takes the pane', async () => {
    const runtime = {
      describePane: vi.fn().mockResolvedValue({ command: '2.1.252' }),
      capturePane: vi.fn().mockResolvedValue(''),
    }
    const v = await verifyProgramStarted(runtime, 'steve', 'claude', fast)
    expect(v.started).toBe(true)
    // It should not sit out the grace period once it can see the answer.
    expect(runtime.describePane).toHaveBeenCalledTimes(1)
  })

  it('reports NOT started when the shell says command not found', async () => {
    const runtime = {
      describePane: vi.fn().mockResolvedValue({ command: 'bash' }),
      capturePane: vi.fn().mockResolvedValue('david@box:~$ claude\nclaude: command not found'),
    }
    const v = await verifyProgramStarted(runtime, 'steve', 'claude', fast)
    expect(v.started).toBe(false)
    expect(v.shellSaid).toContain('command not found')
    expect(v.error).toMatch(/did not start/)
  })

  it('explains the non-login shell, which is the usual cause', async () => {
    const runtime = {
      describePane: vi.fn().mockResolvedValue({ command: 'bash' }),
      capturePane: vi.fn().mockResolvedValue('claude: command not found'),
    }
    const v = await verifyProgramStarted(runtime, 'steve', 'claude', fast)
    expect(v.error).toMatch(/non-login shell/)
    expect(v.error).toMatch(/bashrc/)
  })

  it('waits for a slow starter rather than calling it dead', async () => {
    // Shell first, program second — must not conclude failure on the first look.
    const describePane = vi.fn()
      .mockResolvedValueOnce({ command: 'bash' })
      .mockResolvedValue({ command: 'node' })
    const runtime = { describePane, capturePane: vi.fn().mockResolvedValue('$ claude') }
    expect((await verifyProgramStarted(runtime, 'steve', 'claude', fast)).started).toBe(true)
  })

  it('gives up after the grace period with a shell still there', async () => {
    const runtime = {
      describePane: vi.fn().mockResolvedValue({ command: 'zsh' }),
      capturePane: vi.fn().mockResolvedValue('$ '),
    }
    const v = await verifyProgramStarted(runtime, 'steve', 'claude', fast)
    expect(v.started).toBe(false)
    expect(v.occupant).toBe('zsh')
    expect(v.error).toMatch(/still at a zsh prompt/)
  })

  it('assumes started when the runtime cannot introspect the pane', async () => {
    // A false "did not start" tells an operator their working agent is broken,
    // which is worse than staying quiet.
    const v = await verifyProgramStarted({ capturePane: vi.fn() } as any, 'steve', 'claude', fast)
    expect(v.started).toBe(true)
  })

  it('assumes started for an occupant it does not recognise', async () => {
    const runtime = {
      describePane: vi.fn().mockResolvedValue({ command: 'some-new-agent-cli' }),
      capturePane: vi.fn().mockResolvedValue(''),
    }
    expect((await verifyProgramStarted(runtime, 'steve', 'x', fast)).started).toBe(true)
  })

  it('survives a pane that throws', async () => {
    const runtime = {
      describePane: vi.fn().mockRejectedValue(new Error('no session')),
      capturePane: vi.fn().mockRejectedValue(new Error('no session')),
    }
    expect((await verifyProgramStarted(runtime, 'steve', 'claude', fast)).started).toBe(true)
  })
})
