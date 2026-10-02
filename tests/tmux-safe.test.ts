/**
 * Tests for lib/tmux-safe.mjs — GHSA-2vm8-3q4q-wqv3.
 *
 * The reported hole: `GET /api/sessions/[id]/command` passes its URL path
 * segment to `sessionExists()`, which built a SHELL STRING:
 *
 *     await execAsync(`tmux has-session -t "${name}" 2>/dev/null`)
 *
 * The double quotes are not protection — `$(…)` and backticks are still
 * evaluated. Unauthenticated, on a server that binds 0.0.0.0 by default, and
 * reached before any session lookup so no real agent was needed.
 *
 * It is a BYPASS of the fix for CVE-2026-37751, which converted the sync
 * deletion path and validated names at agent-creation time. The async path was
 * left alone. That is the lesson these tests encode: validating at one route
 * does not generalise, so validation lives at the choke point instead, and the
 * payloads below are checked against the validator directly rather than against
 * any particular route.
 */

import { describe, it, expect } from 'vitest'
import {
  isValidSessionName,
  assertSessionName,
  splitKeySpec,
  SESSION_NAME_RE,
  InvalidSessionNameError,
  isValidPaneTarget,
  assertPaneTarget,
  InvalidPaneTargetError,
} from '@/lib/tmux-safe.mjs'

/** Shapes taken from the advisory PoC and the CVE it bypassed. */
const INJECTIONS = [
  'a$(touch /tmp/pwned)',
  'a`touch /tmp/pwned`',
  'a"; touch /tmp/pwned; "',
  "a'; touch /tmp/pwned; '",
  'a; touch /tmp/pwned',
  'a && touch /tmp/pwned',
  'a | touch /tmp/pwned',
  'a\n touch /tmp/pwned',
  'a$IFS$9touch',
  '$(id)',
  '`id`',
  'a > /tmp/pwned',
  'a\\$(id)',
]

describe('isValidSessionName · the payloads that made this a CVE', () => {
  it.each(INJECTIONS)('rejects %j', (payload) => {
    expect(isValidSessionName(payload)).toBe(false)
  })

  it('rejects every injection shape without exception', () => {
    expect(INJECTIONS.filter(isValidSessionName)).toEqual([])
  })
})

describe('isValidSessionName · what must keep working', () => {
  // Checked against the live fleet before this shipped: 124 distinct names in
  // the agent registry and 36 live tmux sessions across three hosts, zero
  // rejected. A validator that breaks real agents is not a fix.
  it.each([
    'lola', 'pas-lola', '23blocks-api-jarvis', 'fluidmind-lawyernet-api',
    'lbf-gm', 'specs-probe-macbook', 'default', 'agent_with_underscores',
    'a', 'A1', 'x'.repeat(128),
  ])('accepts the real-world name %j', (name) => {
    expect(isValidSessionName(name)).toBe(true)
  })
})

describe('isValidSessionName · non-strings and edges', () => {
  it.each([undefined, null, 42, {}, [], true])('rejects %p rather than coercing', (v) => {
    expect(isValidSessionName(v as never)).toBe(false)
  })

  it('rejects the empty string', () => {
    expect(isValidSessionName('')).toBe(false)
  })

  it('rejects a name past 128 chars', () => {
    expect(isValidSessionName('x'.repeat(129))).toBe(false)
  })

  it('is anchored at both ends — no embedded match', () => {
    // An unanchored regex is the classic way this check gets reintroduced wrong.
    expect(SESSION_NAME_RE.test('good$(id)')).toBe(false)
    expect(SESSION_NAME_RE.test('$(id)good')).toBe(false)
  })

  it('rejects a pane target, which is not a session name', () => {
    expect(isValidSessionName('session:0.1')).toBe(false)
  })
})

describe('assertSessionName', () => {
  it('returns the name when valid, so it can be used inline', () => {
    expect(assertSessionName('pas-lola')).toBe('pas-lola')
  })

  it('throws a typed error on a payload', () => {
    expect(() => assertSessionName('a$(id)')).toThrow(InvalidSessionNameError)
  })

  it('carries a machine-readable code', () => {
    try {
      assertSessionName('a$(id)')
      throw new Error('should have thrown')
    } catch (e: any) {
      expect(e.code).toBe('INVALID_SESSION_NAME')
    }
  })

  it('does not echo an unbounded payload into the message', () => {
    try {
      assertSessionName('$(id)' + 'x'.repeat(5000))
      throw new Error('should have thrown')
    } catch (e: any) {
      expect(e.message.length).toBeLessThan(200)
    }
  })
})

describe('splitKeySpec · preserving what the shell used to do', () => {
  it('treats one fully-quoted group as a single argument', () => {
    // The shell stripped these quotes and handed tmux one argv entry.
    expect(splitKeySpec('"unset CLAUDECODE"')).toEqual(['unset CLAUDECODE'])
  })

  it('keeps inner single quotes, as a double-quoted shell string did', () => {
    expect(splitKeySpec(`"export AMP_DIR='/x' NAME='y'; claude"`))
      .toEqual([`export AMP_DIR='/x' NAME='y'; claude`])
  })

  it('word-splits a bare key sequence', () => {
    expect(splitKeySpec('exit Enter')).toEqual(['exit', 'Enter'])
  })

  it.each(['C-c', 'Enter', 'Escape', 'q', 'BSpace'])('passes the single key %j through', (k) => {
    expect(splitKeySpec(k)).toEqual([k])
  })

  it('does NOT guess at multiple quoted groups', () => {
    // Quietly mis-joining key sequences would fail worse than visibly.
    expect(splitKeySpec('"a" "b"')).toEqual(['"a"', '"b"'])
  })

  it('no longer lets $(…) reach a shell — it is now literal text', () => {
    // Previously this string was interpolated INTO a shell double-quoted
    // context, so the substitution ran on the SERVER. Now it is typed.
    expect(splitKeySpec('"echo $(id)"')).toEqual(['echo $(id)'])
  })

  it('collapses runs of whitespace rather than emitting empty args', () => {
    expect(splitKeySpec('a   b')).toEqual(['a', 'b'])
  })

  it('never returns an empty array, which would make tmux a no-op call', () => {
    expect(splitKeySpec('')).toEqual([''])
    expect(splitKeySpec('   ')).toEqual([''])
  })
})

describe('isValidPaneTarget · what the notification code builds', () => {
  it.each(['agent', 'pas-lola', 'agent:0', 'agent:0.0', 'my_agent-2:1.3'])('accepts %s', t => {
    expect(isValidPaneTarget(t)).toBe(true)
  })

  it('accepts the exact target sendTmuxNotification builds', () => {
    // This one was rejected as a "session name" and silently killed the push
    // into the pane on every host where the stream and channel were down.
    expect(isValidPaneTarget('pas-lola:0.0')).toBe(true)
    expect(isValidSessionName('pas-lola:0.0')).toBe(false)
  })

  it('rejects every injection shape, bare or behind a pane suffix', () => {
    for (const payload of INJECTIONS) {
      expect(isValidPaneTarget(payload)).toBe(false)
      expect(isValidPaneTarget(`${payload}:0.0`)).toBe(false)
      expect(isValidPaneTarget(`a:0.0${payload}`)).toBe(false)
    }
  })

  it.each([
    'agent:',
    'agent:.0',
    'agent:0.',
    'agent:0.0.0',
    'agent::0',
    'agent:a.b',
    'agent:0.0 ',
    ':0.0',
    '',
    'agent:99999',
    'agent:0.99999',
    '%1',
    '$1',
    '@2',
    '{last}',
    '=agent',
  ])('rejects %j', t => {
    expect(isValidPaneTarget(t)).toBe(false)
  })

  it('keeps parity with session names on a leading hyphen', () => {
    // The value after `-t` is one argv entry that tmux takes verbatim, never
    // parses as an option, so this is not an injection. Rejecting it here
    // while isValidSessionName allows it would break an agent named `-x`.
    expect(isValidPaneTarget('-x:0.0')).toBe(isValidSessionName('-x'))
  })

  it('rejects non-strings', () => {
    for (const v of [undefined, null, 0, {}, [], ['a:0.0']] as unknown[]) {
      expect(isValidPaneTarget(v)).toBe(false)
    }
  })
})

describe('assertPaneTarget', () => {
  it('returns the target when valid, so it can be used inline', () => {
    expect(assertPaneTarget('agent:0.0')).toBe('agent:0.0')
  })

  it('throws a typed error with a machine-readable code', () => {
    expect(() => assertPaneTarget('a$(id):0.0')).toThrow(InvalidPaneTargetError)
    try {
      assertPaneTarget('a;b')
    } catch (e) {
      expect((e as { code: string }).code).toBe('INVALID_PANE_TARGET')
    }
  })

  it('does not echo an unbounded payload into the message', () => {
    try {
      assertPaneTarget('x'.repeat(5000))
    } catch (e) {
      expect((e as Error).message.length).toBeLessThan(200)
    }
  })
})
