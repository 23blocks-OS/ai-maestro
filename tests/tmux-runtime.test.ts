/**
 * lib/tmux-runtime.mjs: the tmux operations server.mjs and TmuxRuntime share.
 *
 * F026 Phase 0 moved server.mjs's tmux calls here without changing what tmux
 * receives. These tests pin the exact argv of each operation to the shell
 * strings and execFile calls they replaced (quoted in each test), and check
 * that a bad target is refused before tmux runs. Only `tmux`/`tmuxSync` are
 * faked; the validators are the real ones.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'fs'

const tmuxMock = vi.hoisted(() => vi.fn())
const tmuxSyncMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/tmux-safe.mjs', async importOriginal => {
  const real = await importOriginal<typeof import('@/lib/tmux-safe.mjs')>()
  return { ...real, tmux: tmuxMock, tmuxSync: tmuxSyncMock }
})

import * as rt from '@/lib/tmux-runtime.mjs'

const S = 'agent-1'
const EVIL = 'x"; touch /tmp/pwned; echo "'

beforeEach(() => {
  tmuxMock.mockReset()
  tmuxMock.mockResolvedValue({ stdout: '', stderr: '' })
  tmuxSyncMock.mockReset()
  tmuxSyncMock.mockReturnValue('')
})

const lastSyncArgs = () => tmuxSyncMock.mock.calls.at(-1)![0]
const lastSyncOpts = () => tmuxSyncMock.mock.calls.at(-1)![1]
const lastAsyncArgs = () => tmuxMock.mock.calls.at(-1)![0]

describe('sync operations keep the argv of the shell strings they replaced', () => {
  it('detectPermissionFromPane: tmux capture-pane -p -t "S" -S -200', () => {
    tmuxSyncMock.mockReturnValue('pane')
    expect(rt.capturePaneSync(S, 200, { timeout: 2000 })).toBe('pane')
    expect(lastSyncArgs()).toEqual(['capture-pane', '-p', '-t', S, '-S', '-200'])
    expect(lastSyncOpts()).toEqual({ timeout: 2000 })
  })

  it('capturePaneCompact: tmux capture-pane -p -J -t "S" -S -100', () => {
    rt.capturePaneSync(S, 100, { join: true, timeout: 2000 })
    expect(lastSyncArgs()).toEqual(['capture-pane', '-p', '-J', '-t', S, '-S', '-100'])
  })

  it('isAgentAtPermissionPrompt: tmux capture-pane -p -t "S" -S -15', () => {
    rt.capturePaneSync(S, 15, { timeout: 2000 })
    expect(lastSyncArgs()).toEqual(['capture-pane', '-p', '-t', S, '-S', '-15'])
  })

  it('capturePaneRaw: the `A 2>/dev/null || B` fallback is two argv calls', () => {
    tmuxSyncMock.mockImplementationOnce(() => { throw new Error('bad -S') }).mockReturnValueOnce('raw')
    expect(rt.capturePaneRawSync(S, 200, { timeout: 3000 })).toBe('raw')
    expect(tmuxSyncMock.mock.calls[0][0]).toEqual(['capture-pane', '-t', S, '-p', '-e', '-S', '-200'])
    expect(tmuxSyncMock.mock.calls[0][1]).toMatchObject({ timeout: 3000, stdio: ['pipe', 'pipe', 'ignore'] })
    expect(tmuxSyncMock.mock.calls[1][0]).toEqual(['capture-pane', '-t', S, '-p', '-e'])
  })

  it('capturePaneRaw does not fall back past a rejected target', () => {
    expect(() => rt.capturePaneRawSync(EVIL)).toThrow(/Invalid tmux pane target/)
    expect(tmuxSyncMock).not.toHaveBeenCalled()
  })

  it("exitCopyMode: display-message -p -t S '#{pane_in_mode}', then send-keys -t S -X cancel", () => {
    tmuxSyncMock.mockReturnValueOnce('1\n')
    rt.exitCopyModeSync(S, { timeout: 2000 })
    expect(tmuxSyncMock.mock.calls[0][0]).toEqual(['display-message', '-p', '-t', S, '#{pane_in_mode}'])
    expect(tmuxSyncMock.mock.calls[1][0]).toEqual(['send-keys', '-t', S, '-X', 'cancel'])
  })

  it('exitCopyMode does nothing more when the pane is not in a mode, and never throws', () => {
    tmuxSyncMock.mockReturnValueOnce('0\n')
    rt.exitCopyModeSync(S)
    expect(tmuxSyncMock).toHaveBeenCalledTimes(1)
    expect(() => rt.exitCopyModeSync(EVIL)).not.toThrow()
  })

  it('chat send: load-buffer -b B FILE, paste-buffer -d -r -b B -t S, delete-buffer -b B', () => {
    rt.loadBufferSync('aimaestro-123', '/tmp/aimaestro-send-123.txt', { timeout: 3000 })
    expect(lastSyncArgs()).toEqual(['load-buffer', '-b', 'aimaestro-123', '/tmp/aimaestro-send-123.txt'])
    rt.pasteBufferSync(S, 'aimaestro-123-r', { timeout: 3000 })
    expect(lastSyncArgs()).toEqual(['paste-buffer', '-d', '-r', '-b', 'aimaestro-123-r', '-t', S])
    rt.deleteBufferSync('aimaestro-123', { timeout: 1000 })
    expect(lastSyncArgs()).toEqual(['delete-buffer', '-b', 'aimaestro-123'])
    expect(lastSyncOpts()).toEqual({ timeout: 1000 })
  })

  it('chat send: send-keys -t S C-m; -N count BSpace; -l KEY', () => {
    rt.sendKeySync(S, 'C-m', { timeout: 3000 })
    expect(lastSyncArgs()).toEqual(['send-keys', '-t', S, 'C-m'])
    rt.repeatKeySync(S, 'BSpace', 42, { timeout: 3000 })
    expect(lastSyncArgs()).toEqual(['send-keys', '-t', S, '-N', '42', 'BSpace'])
    rt.sendLiteralSync(S, '1', { timeout: 3000 })
    expect(lastSyncArgs()).toEqual(['send-keys', '-t', S, '-l', '1'])
  })

  it('call session: has-session / kill-session (stdio ignored) and new-session -d -s S -c DIR', () => {
    expect(rt.hasSessionSync(`${S}__call`, { timeout: 5000 })).toBe(true)
    expect(lastSyncArgs()).toEqual(['has-session', '-t', `${S}__call`])
    expect(lastSyncOpts()).toEqual({ stdio: 'ignore', timeout: 5000 })
    rt.killSessionSync(`${S}__call`, { timeout: 5000 })
    expect(lastSyncArgs()).toEqual(['kill-session', '-t', `${S}__call`])
    expect(lastSyncOpts()).toEqual({ stdio: 'ignore', timeout: 5000 })
    rt.newSessionSync(`${S}__call`, '/work dir', { timeout: 5000 })
    expect(lastSyncArgs()).toEqual(['new-session', '-d', '-s', `${S}__call`, '-c', '/work dir'])
  })

  it('hasSession is false, without running tmux, for a name that is not a session name', () => {
    expect(rt.hasSessionSync(EVIL)).toBe(false)
    expect(tmuxSyncMock).not.toHaveBeenCalled()
    tmuxSyncMock.mockImplementation(() => { throw new Error("can't find session") })
    expect(rt.hasSessionSync(S)).toBe(false)
  })

  it('startup cleanup: list-sessions -F #{session_name}, stderr ignored', () => {
    tmuxSyncMock.mockReturnValue('a\nb__call\n')
    expect(rt.listSessionNamesSync({ timeout: 5000 })).toEqual(['a', 'b__call'])
    expect(lastSyncArgs()).toEqual(['list-sessions', '-F', '#{session_name}'])
    expect(lastSyncOpts()).toEqual({ timeout: 5000, stdio: ['pipe', 'pipe', 'ignore'] })
  })
})

describe('async operations keep the argv of the execFile calls they replaced', () => {
  it('set-option -t S mouse off / set-option -w -t S alternate-screen off, with -S socket first', async () => {
    await rt.setOptionAsync(S, 'mouse', 'off', { timeout: 2000 })
    expect(lastAsyncArgs()).toEqual(['set-option', '-t', S, 'mouse', 'off'])
    await rt.setOptionAsync(S, 'alternate-screen', 'off', { window: true, socketPath: '/tmp/sock', timeout: 2000 })
    expect(lastAsyncArgs()).toEqual(['-S', '/tmp/sock', 'set-option', '-w', '-t', S, 'alternate-screen', 'off'])
  })

  it('history: capture-pane -t S -e -p -S -5000 with the large maxBuffer', async () => {
    tmuxMock.mockResolvedValue({ stdout: 'history', stderr: '' })
    expect(await rt.captureHistoryAsync(S, 5000, { timeout: 3000, maxBuffer: 32 * 1024 * 1024 })).toBe('history')
    expect(lastAsyncArgs()).toEqual(['capture-pane', '-t', S, '-e', '-p', '-S', '-5000'])
    expect(tmuxMock.mock.calls.at(-1)![1]).toEqual({ timeout: 3000, maxBuffer: 32 * 1024 * 1024 })
  })

  it('scroll: copy-mode -e -t S, send-keys -t S -X -N n scroll-up / scroll-down', async () => {
    await rt.enterCopyModeAsync(S, { socketPath: '/s' })
    expect(lastAsyncArgs()).toEqual(['-S', '/s', 'copy-mode', '-e', '-t', S])
    await rt.scrollAsync(S, 'up', '7')
    expect(lastAsyncArgs()).toEqual(['send-keys', '-t', S, '-X', '-N', '7', 'scroll-up'])
    await rt.scrollAsync(S, 'down', 3)
    expect(lastAsyncArgs()).toEqual(['send-keys', '-t', S, '-X', '-N', '3', 'scroll-down'])
  })

  it('call session: send-keys -l TEXT, Enter, C-c, kill-session', async () => {
    await rt.sendLiteralAsync(S, 'hi $(id)', { timeout: 5000 })
    expect(lastAsyncArgs()).toEqual(['send-keys', '-t', S, '-l', 'hi $(id)'])
    await rt.sendKeyAsync(S, 'Enter')
    expect(lastAsyncArgs()).toEqual(['send-keys', '-t', S, 'Enter'])
    await rt.killSessionAsync(S)
    expect(lastAsyncArgs()).toEqual(['kill-session', '-t', S])
  })

  it('a bad target rejects before tmux runs', async () => {
    await expect(rt.setOptionAsync(EVIL, 'mouse', 'off')).rejects.toThrow(/Invalid tmux session name/)
    await expect(rt.scrollAsync(EVIL, 'up', 1)).rejects.toThrow(/Invalid tmux pane target/)
    await expect(rt.sendLiteralAsync(EVIL, 'x')).rejects.toThrow()
    expect(tmuxMock).not.toHaveBeenCalled()
  })

  it('pasteText loads a temp file into a buffer, pastes it, and removes the file', async () => {
    let loadedFile = ''
    let loadedText = ''
    tmuxMock.mockImplementation(async (args: string[]) => {
      if (args[0] === 'load-buffer') { loadedFile = args[3]; loadedText = fs.readFileSync(loadedFile, 'utf-8') }
      return { stdout: '', stderr: '' }
    })
    await rt.pasteTextAsync(S, 'line one\nline two', { bufferName: 'aimaestro-t1' })
    expect(tmuxMock.mock.calls.map(c => c[0][0])).toEqual(['load-buffer', 'paste-buffer'])
    expect(tmuxMock.mock.calls[1][0]).toEqual(['paste-buffer', '-d', '-r', '-b', 'aimaestro-t1', '-t', S])
    expect(loadedText).toBe('line one\nline two')
    expect(fs.existsSync(loadedFile)).toBe(false)
  })

  it('pasteText deletes the buffer when the paste fails', async () => {
    tmuxMock.mockImplementation(async (args: string[]) => {
      if (args[0] === 'paste-buffer') throw new Error('no pane')
      return { stdout: '', stderr: '' }
    })
    await expect(rt.pasteTextAsync(S, 'x', { bufferName: 'aimaestro-t2' })).rejects.toThrow('no pane')
    expect(tmuxMock.mock.calls.at(-1)![0]).toEqual(['delete-buffer', '-b', 'aimaestro-t2'])
  })
})

describe('attachCommand', () => {
  it('matches the old getAttachCommand output, and the call-session read-only observer', () => {
    expect(rt.attachCommand(S)).toEqual({ command: 'tmux', args: ['attach-session', '-t', S] })
    expect(rt.attachCommand(S, { socketPath: '/s' })).toEqual({ command: 'tmux', args: ['-S', '/s', 'attach-session', '-t', S] })
    expect(rt.attachCommand(`${S}__call`, { readOnly: true })).toEqual({ command: 'tmux', args: ['attach-session', '-t', `${S}__call`, '-r'] })
  })

  it('refuses a name that is not a session name', () => {
    expect(() => rt.attachCommand(EVIL)).toThrow(/Invalid tmux session name/)
  })
})

describe('buffer names', () => {
  it('accepts the names the chat builds and refuses anything else', () => {
    expect(rt.assertBufferName('aimaestro-1790000000000-r')).toBe('aimaestro-1790000000000-r')
    expect(() => rt.assertBufferName('a b')).toThrow(/Invalid tmux buffer name/)
    expect(() => rt.loadBufferSync('$(id)', '/tmp/f')).toThrow()
    expect(tmuxSyncMock).not.toHaveBeenCalled()
  })
})
