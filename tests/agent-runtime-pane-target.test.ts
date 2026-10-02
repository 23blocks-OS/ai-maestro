/**
 * The pane methods of the real TmuxRuntime accept the target the notification
 * code builds, and still refuse anything that is not one.
 *
 * Regression: sendTmuxNotification targets `${session}:0.0`. After the tmux
 * hardening (v0.38.27) every runtime method ran assertSessionName on that
 * string, which rejects `:`, so the push into the pane threw
 * `Invalid tmux session name: "pas-lola:0.0"` on every call. Wherever the
 * stream and the channel were also down (a headless host, a non-Claude agent)
 * nothing told the agent it had mail, and the 5-minute inbox poll uses the
 * same path. The notification tests mock the runtime, so they never ran the
 * validator against this target. These do: only `tmux` itself is faked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const tmuxMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/tmux-safe.mjs', async importOriginal => {
  const real = await importOriginal<typeof import('@/lib/tmux-safe.mjs')>()
  return { ...real, tmux: tmuxMock }
})

import { TmuxRuntime } from '@/lib/agent-runtime'

const TARGET = 'pas-lola:0.0'

describe('TmuxRuntime pane methods · the notification target', () => {
  let runtime: TmuxRuntime

  beforeEach(() => {
    tmuxMock.mockReset()
    tmuxMock.mockResolvedValue({ stdout: '', stderr: '' })
    runtime = new TmuxRuntime()
  })

  it('sendKeys types literal text into the pane, as one argv entry', async () => {
    await runtime.sendKeys(TARGET, 'hello $(id)', { literal: true })
    expect(tmuxMock).toHaveBeenCalledWith(['send-keys', '-t', TARGET, '-l', 'hello $(id)'])
  })

  it('sendKeys presses Enter in the pane', async () => {
    await runtime.sendKeys(TARGET, 'Enter')
    expect(tmuxMock).toHaveBeenCalledWith(['send-keys', '-t', TARGET, 'Enter'])
  })

  it('repeatKey clears the input box with backspaces', async () => {
    await runtime.repeatKey(TARGET, 'BSpace', 5)
    expect(tmuxMock).toHaveBeenCalledWith(['send-keys', '-t', TARGET, '-N', '5', 'BSpace'])
  })

  it('capturePane reads the pane back instead of returning an empty string', async () => {
    tmuxMock.mockResolvedValue({ stdout: 'the pane text', stderr: '' })
    expect(await runtime.capturePane(TARGET, 50)).toBe('the pane text')
    expect(await runtime.capturePaneRaw(TARGET, 50)).toBe('the pane text')
  })

  it('describePane reports the pane', async () => {
    tmuxMock.mockResolvedValue({ stdout: 'width=120 command=claude\n', stderr: '' })
    const info = await runtime.describePane(TARGET)
    expect(info.command).toBe('claude')
    expect(tmuxMock.mock.calls[0]![0]).toEqual(expect.arrayContaining(['-t', TARGET]))
  })

  it('still accepts a bare session name', async () => {
    await runtime.sendKeys('pas-lola', 'x', { literal: true })
    expect(tmuxMock).toHaveBeenCalledWith(['send-keys', '-t', 'pas-lola', '-l', 'x'])
  })
})

describe('TmuxRuntime pane methods · still refuse what is not a target', () => {
  const BAD = ['a$(id):0.0', 'a;touch x:0.0', 'a:0.0;touch x', 'a:0.0\nid', 'a:0.0 -x', '']

  beforeEach(() => {
    tmuxMock.mockReset()
    tmuxMock.mockResolvedValue({ stdout: 'leak', stderr: '' })
  })

  it.each(BAD)('sendKeys and repeatKey reject %j and never reach tmux', async bad => {
    const runtime = new TmuxRuntime()
    await expect(runtime.sendKeys(bad, 'x', { literal: true })).rejects.toThrow()
    await expect(runtime.sendKeys(bad, 'Enter')).rejects.toThrow()
    await expect(runtime.repeatKey(bad, 'BSpace', 2)).rejects.toThrow()
    expect(tmuxMock).not.toHaveBeenCalled()
  })

  it.each(BAD)('capturePane and describePane give nothing for %j and never reach tmux', async bad => {
    const runtime = new TmuxRuntime()
    expect(await runtime.capturePane(bad)).toBe('')
    expect(await runtime.capturePaneRaw(bad)).toBe('')
    expect(await runtime.describePane(bad)).toEqual({})
    expect(tmuxMock).not.toHaveBeenCalled()
  })

  it('session-level calls still refuse a pane target', async () => {
    const runtime = new TmuxRuntime()
    await expect(runtime.killSession('a:0.0')).rejects.toThrow()
    expect(tmuxMock).not.toHaveBeenCalled()
  })
})
