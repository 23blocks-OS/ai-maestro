import { describe, it, expect, afterEach } from 'vitest'
import {
  isSessionNamingEnabled,
  sanitizeClaudeSessionName,
  claudeSessionNameFlag,
} from '@/lib/claude-session-name'

const ORIG = process.env.AIMAESTRO_SESSION_NAME
afterEach(() => {
  if (ORIG === undefined) delete process.env.AIMAESTRO_SESSION_NAME
  else process.env.AIMAESTRO_SESSION_NAME = ORIG
})
function setFlag(v: string | undefined) {
  if (v === undefined) delete process.env.AIMAESTRO_SESSION_NAME
  else process.env.AIMAESTRO_SESSION_NAME = v
}

describe('isSessionNamingEnabled', () => {
  it('is off by default / for falsey values', () => {
    for (const v of [undefined, '', '0', 'false', 'off', 'no', 'nope']) {
      setFlag(v)
      expect(isSessionNamingEnabled()).toBe(false)
    }
  })
  it('is on for truthy values (case/space-insensitive)', () => {
    for (const v of ['1', 'true', 'yes', 'on', 'TRUE', ' On ']) {
      setFlag(v)
      expect(isSessionNamingEnabled()).toBe(true)
    }
  })
})

describe('sanitizeClaudeSessionName', () => {
  it('leaves a valid tmux-charset name untouched', () => {
    expect(sanitizeClaudeSessionName('23blocks-api-authentication')).toBe('23blocks-api-authentication')
    expect(sanitizeClaudeSessionName('agent_0')).toBe('agent_0')
  })
  it('maps runs of illegal chars to a single dash and trims', () => {
    expect(sanitizeClaudeSessionName('fluidmind/agents/backend architect')).toBe('fluidmind-agents-backend-architect')
    expect(sanitizeClaudeSessionName('  weird!!name  ')).toBe('weird-name')
    expect(sanitizeClaudeSessionName('/leading/and/trailing/')).toBe('leading-and-trailing')
  })
  it('caps length at 64', () => {
    expect(sanitizeClaudeSessionName('a'.repeat(200)).length).toBe(64)
  })
  it('handles empty input', () => {
    expect(sanitizeClaudeSessionName('')).toBe('')
  })
})

describe('claudeSessionNameFlag', () => {
  it('returns empty when the flag is disabled (default)', () => {
    setFlag(undefined)
    expect(claudeSessionNameFlag('my-agent', 'claude')).toBe('')
  })
  it('returns the --name fragment for claude programs when enabled', () => {
    setFlag('1')
    expect(claudeSessionNameFlag('my-agent', 'claude')).toBe(' --name my-agent')
    expect(claudeSessionNameFlag('my-agent', 'claude-code')).toBe(' --name my-agent')
    expect(claudeSessionNameFlag('my-agent', 'CLAUDE')).toBe(' --name my-agent') // case-insensitive
  })
  it('returns empty for non-claude programs even when enabled', () => {
    setFlag('1')
    expect(claudeSessionNameFlag('my-agent', 'codex')).toBe('')
    expect(claudeSessionNameFlag('my-agent', 'gemini')).toBe('')
  })
  it('sanitizes the name in the fragment (shell-safe, no quoting needed)', () => {
    setFlag('1')
    expect(claudeSessionNameFlag('a/b c', 'claude')).toBe(' --name a-b-c')
  })
  it('returns empty when the name is empty/whitespace', () => {
    setFlag('1')
    expect(claudeSessionNameFlag('', 'claude')).toBe('')
    expect(claudeSessionNameFlag('   ', 'claude')).toBe('')
  })
})
