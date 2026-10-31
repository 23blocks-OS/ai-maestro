/**
 * tmux reads a bare session name as a prefix and an empty target as the session used last. On
 * 2026-10-30 a chat reply to "ai-maestro" (an agent with no terminal) was typed into the session
 * "ai-maestro-app", another agent's. Every target is now matched exactly.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { execFile, execFileSync } = vi.hoisted(() => ({ execFile: vi.fn(), execFileSync: vi.fn(() => '') }))
vi.mock('child_process', () => ({ execFile, execFileSync, default: { execFile, execFileSync } }))

const { exactTarget, exactTargets, tmux, tmuxSync, InvalidSessionNameError } = await import('@/lib/tmux-safe.mjs')
const { attachCommand, hasSessionSync } = await import('@/lib/tmux-runtime.mjs')

beforeEach(() => {
  execFile.mockReset().mockImplementation((_c: string, _a: string[], _o: unknown, cb: (e: unknown, out: unknown) => void) => cb(null, { stdout: '', stderr: '' }))
  execFileSync.mockReset().mockReturnValue('')
})

describe('exact tmux targets', () => {
  it('a session or pane target is matched exactly ("=name:" works for session and pane commands); ids are left alone', () => {
    expect(exactTarget('ai-maestro')).toBe('=ai-maestro:')
    expect(exactTarget('ai-maestro:0.0')).toBe('=ai-maestro:0.0')
    expect(exactTarget('=ai-maestro')).toBe('=ai-maestro:')
    expect(exactTarget('%3')).toBe('%3')
    expect(exactTarget('@1')).toBe('@1')
    expect(exactTarget('$2')).toBe('$2')
  })

  it('an empty target is refused: tmux would use the session used last', () => {
    for (const t of ['', ':', ':0', '.1', undefined, null]) expect(() => exactTarget(t as any)).toThrow(InvalidSessionNameError)
    expect(() => exactTargets(['send-keys', '-t'])).toThrow(InvalidSessionNameError)
  })

  it('only -t values change', () => {
    expect(exactTargets(['-S', '/tmp/sock', 'send-keys', '-t', 'lola', '-l', 'hi'])).toEqual(['-S', '/tmp/sock', 'send-keys', '-t', '=lola:', '-l', 'hi'])
    expect(exactTargets(['list-sessions', '-F', '#{session_name}'])).toEqual(['list-sessions', '-F', '#{session_name}'])
  })

  it('both wrappers send exact targets to tmux', async () => {
    await tmux(['send-keys', '-t', 'ai-maestro', 'C-m'])
    expect(execFile.mock.calls[0][1]).toEqual(['send-keys', '-t', '=ai-maestro:', 'C-m'])
    tmuxSync(['capture-pane', '-p', '-t', 'ai-maestro:0.0'])
    expect((execFileSync.mock.calls[0] as unknown[])[1]).toEqual(['capture-pane', '-p', '-t', '=ai-maestro:0.0'])
  })

  it('opening a terminal attaches to that exact session, and existence is checked exactly', () => {
    expect(attachCommand('ai-maestro').args).toEqual(['attach-session', '-t', '=ai-maestro:'])
    hasSessionSync('ai-maestro')
    expect((execFileSync.mock.calls.at(-1) as unknown[])[1]).toContain('=ai-maestro:')
  })
})
