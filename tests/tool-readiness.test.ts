import { describe, it, expect } from 'vitest'
import { parseVersion, firstProblemLine, nodeSupportsZstd, judgeTool, READINESS_TOOLS } from '@/lib/tool-readiness'
import { PROGRAM_CHOICES } from '@/lib/program-choices'

describe('parseVersion', () => {
  it('finds the version in the shapes real tools print', () => {
    expect(parseVersion('1.0.96')).toBe('1.0.96')
    expect(parseVersion('2.1.3 (Claude Code)')).toBe('2.1.3')
    expect(parseVersion('codex-cli 0.46.0')).toBe('0.46.0')
    expect(parseVersion('v22.23.3')).toBe('22.23.3')
    expect(parseVersion('\n\ngrok 1.0.46-beta.2\nsomething else 9.9')).toBe('1.0.46-beta.2')
  })
  it('is undefined when there is nothing that looks like one', () => {
    expect(parseVersion('')).toBeUndefined()
    expect(parseVersion(undefined)).toBeUndefined()
    expect(parseVersion('command not found')).toBeUndefined()
  })
})

describe('firstProblemLine', () => {
  it('is one short printable line', () => {
    expect(firstProblemLine('\n  Error: boom\nstack...')).toBe('Error: boom')
    expect(firstProblemLine('x'.repeat(500)).length).toBe(200)
    expect(firstProblemLine('bad\u0007bell')).toBe('badbell')
    expect(firstProblemLine('')).toBe('')
  })
})

describe('nodeSupportsZstd (what Pi needs)', () => {
  it('accepts 22.15+, 23.8+ and 24+', () => {
    for (const v of ['v22.15.0', 'v22.23.3', '22.20.1', 'v23.8.0', 'v23.10.0', 'v24.0.0', 'v24.20.0', 'v26.1.0']) expect(nodeSupportsZstd(v), v).toBe(true)
  })
  it('refuses older lines, and anything unreadable', () => {
    for (const v of ['v22.14.0', 'v23.7.9', 'v20.19.4', 'v18.0.0', 'v16.20.2', '', undefined, 'nonsense']) expect(nodeSupportsZstd(v as never), String(v)).toBe(false)
  })
})

describe('judgeTool', () => {
  const claude = { id: 'claude', command: 'claude', install: 'npm install -g x' }
  it('missing when it is not on the path, with the install hint', () => {
    expect(judgeTool(claude)).toEqual({ id: 'claude', command: 'claude', install: 'npm install -g x', state: 'missing' })
  })
  it('ready with its version', () => {
    expect(judgeTool({ ...claude, foundPath: '/usr/bin/claude', run: { ok: true, output: '2.1.3 (Claude Code)' } }))
      .toMatchObject({ state: 'ready', version: '2.1.3', path: '/usr/bin/claude' })
  })
  it('broken when it is found but does not run, saying why', () => {
    expect(judgeTool({ ...claude, foundPath: '/usr/bin/claude', run: { ok: false, output: 'dyld: Library not loaded\nmore' } }))
      .toMatchObject({ state: 'broken', problem: 'dyld: Library not loaded' })
    expect(judgeTool({ ...claude, foundPath: '/usr/bin/claude' })).toMatchObject({ state: 'broken', problem: 'It did not run.' })
  })
  it('Pi is broken on an old Node, even if it would print a version', () => {
    const pi = { id: 'pi', command: 'pi', needsZstdNode: true, foundPath: '/x/pi', run: { ok: true, output: '0.4.1' } }
    expect(judgeTool({ ...pi, node: 'v20.19.4' })).toMatchObject({ state: 'broken', problem: expect.stringContaining('v20.19.4') })
    expect(judgeTool({ ...pi, node: undefined })).toMatchObject({ state: 'broken', problem: expect.stringContaining('no Node') })
    expect(judgeTool({ ...pi, node: 'v22.23.3' })).toMatchObject({ state: 'ready', version: '0.4.1' })
  })
})

describe('the tools we check', () => {
  it('every tool the wake dialog offers (but the terminal) is checked, with the same id and command', () => {
    for (const c of PROGRAM_CHOICES.filter((p) => p.command !== 'none')) {
      const t = READINESS_TOOLS.find((r) => r.id === c.id)
      expect(t, c.id).toBeDefined()
      expect(t!.command).toBe(c.command)
    }
  })
  it('an install hint is always a plain npm command (nothing to guess or execute)', () => {
    for (const t of READINESS_TOOLS) if (t.install) expect(t.install).toMatch(/^npm install -g @?[\w./-]+$/)
  })
})
