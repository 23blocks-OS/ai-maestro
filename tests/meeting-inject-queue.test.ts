/**
 * Tests for lib/meeting-inject-queue.ts
 *
 * Covers: queue FIFO, drain vs peek, per-session isolation,
 * kind inference, feature flag, sanitizer, bracketed paste.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  enqueueForSession,
  drainForSession,
  peekForSession,
  clearAll,
  inferKindFromProgram,
  shouldUseAdditionalContext,
  sanitizeForRawInject,
  wrapAsBracketedPaste,
} from '@/lib/meeting-inject-queue'

describe('meeting-inject-queue', () => {
  beforeEach(() => clearAll())

  // ── Queue Operations ──────────────────────────────────────────────────

  describe('enqueue / drain', () => {
    it('returns empty array for unknown session', () => {
      expect(drainForSession('nonexistent')).toEqual([])
    })

    it('skips empty text', () => {
      enqueueForSession('s1', '')
      expect(drainForSession('s1')).toEqual([])
    })

    it('preserves FIFO order', () => {
      enqueueForSession('s1', 'first')
      enqueueForSession('s1', 'second')
      enqueueForSession('s1', 'third')
      const msgs = drainForSession('s1')
      expect(msgs.map(m => m.text)).toEqual(['first', 'second', 'third'])
    })

    it('drain is destructive', () => {
      enqueueForSession('s1', 'hello')
      expect(drainForSession('s1').length).toBe(1)
      expect(drainForSession('s1').length).toBe(0)
    })

    it('stamps ISO timestamps', () => {
      enqueueForSession('s1', 'test')
      const [msg] = drainForSession('s1')
      expect(() => new Date(msg.enqueuedAt)).not.toThrow()
      expect(msg.enqueuedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    })
  })

  describe('peek', () => {
    it('returns copy without removing', () => {
      enqueueForSession('s1', 'stay')
      expect(peekForSession('s1').length).toBe(1)
      expect(peekForSession('s1').length).toBe(1) // still there
      expect(drainForSession('s1').length).toBe(1)
      expect(peekForSession('s1').length).toBe(0)
    })
  })

  describe('per-session isolation', () => {
    it('sessions do not cross-talk', () => {
      enqueueForSession('a', 'for-a')
      enqueueForSession('b', 'for-b')
      expect(drainForSession('a').map(m => m.text)).toEqual(['for-a'])
      expect(drainForSession('b').map(m => m.text)).toEqual(['for-b'])
    })
  })

  describe('clearAll', () => {
    it('wipes every session', () => {
      enqueueForSession('x', 'msg')
      enqueueForSession('y', 'msg')
      clearAll()
      expect(drainForSession('x')).toEqual([])
      expect(drainForSession('y')).toEqual([])
    })
  })

  // ── Kind Inference ────────────────────────────────────────────────────

  describe('inferKindFromProgram', () => {
    it.each([
      ['claude', 'claude'],
      ['claude-code', 'claude'],
      ['Claude Code', 'claude'],
      ['codex', 'codex'],
      ['codex-cli', 'codex'],
      ['gemini', 'gemini'],
      ['gemini-cli', 'gemini'],
      ['vim', 'unknown'],
      [undefined, 'unknown'],
      [null, 'unknown'],
      ['', 'unknown'],
    ])('program "%s" → kind "%s"', (program, expected) => {
      expect(inferKindFromProgram(program as any)).toBe(expected)
    })
  })

  // ── Feature Flag ──────────────────────────────────────────────────────

  describe('shouldUseAdditionalContext', () => {
    const originalEnv = process.env.MAESTRO_MEETING_CONTEXT_KINDS

    afterEach(() => {
      if (originalEnv === undefined) {
        delete process.env.MAESTRO_MEETING_CONTEXT_KINDS
      } else {
        process.env.MAESTRO_MEETING_CONTEXT_KINDS = originalEnv
      }
    })

    it('returns false when env var is unset', () => {
      delete process.env.MAESTRO_MEETING_CONTEXT_KINDS
      expect(shouldUseAdditionalContext('claude')).toBe(false)
    })

    it('returns false for unknown kind', () => {
      process.env.MAESTRO_MEETING_CONTEXT_KINDS = 'all'
      expect(shouldUseAdditionalContext('vim')).toBe(false)
    })

    it('returns true for matching kind', () => {
      process.env.MAESTRO_MEETING_CONTEXT_KINDS = 'claude'
      expect(shouldUseAdditionalContext('claude')).toBe(true)
      expect(shouldUseAdditionalContext('codex')).toBe(false)
    })

    it('supports comma-separated kinds', () => {
      process.env.MAESTRO_MEETING_CONTEXT_KINDS = 'claude,gemini'
      expect(shouldUseAdditionalContext('claude')).toBe(true)
      expect(shouldUseAdditionalContext('gemini')).toBe(true)
      expect(shouldUseAdditionalContext('codex')).toBe(false)
    })

    it('supports "all"', () => {
      process.env.MAESTRO_MEETING_CONTEXT_KINDS = 'all'
      expect(shouldUseAdditionalContext('claude')).toBe(true)
      expect(shouldUseAdditionalContext('codex')).toBe(true)
      expect(shouldUseAdditionalContext('gemini')).toBe(true)
    })
  })

  // ── Sanitizers ────────────────────────────────────────────────────────

  describe('sanitizeForRawInject', () => {
    it('prefixes space before ! at line start', () => {
      expect(sanitizeForRawInject('!history')).toBe(' !history')
      expect(sanitizeForRawInject('line1\n!bang')).toBe('line1\n !bang')
    })

    it('does not touch mid-line !', () => {
      expect(sanitizeForRawInject('hello! world')).toBe('hello! world')
    })

    it('handles multiple lines', () => {
      expect(sanitizeForRawInject('!a\n!b\n!c')).toBe(' !a\n !b\n !c')
    })
  })

  describe('wrapAsBracketedPaste', () => {
    it('wraps with DEC 2004 markers', () => {
      const result = wrapAsBracketedPaste('hello')
      expect(result).toBe('\x1b[200~hello\x1b[201~')
    })

    it('composes with sanitizer', () => {
      const text = '!dangerous\nok line'
      const result = wrapAsBracketedPaste(sanitizeForRawInject(text))
      expect(result).toBe('\x1b[200~ !dangerous\nok line\x1b[201~')
    })
  })
})
