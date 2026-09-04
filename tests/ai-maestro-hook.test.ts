/**
 * Tests for scripts/claude-hooks/ai-maestro-hook.cjs — the Stop-hook AMP
 * delivery decision.
 *
 * The hook's I/O (stdin, stdout, fetch to the local API) is integration
 * territory, but the *decision* — whether a Stop should block to deliver
 * unread messages — is a pure function (decideStopDelivery) that we can test
 * exhaustively here. This is the answer to "can we test the whole idea?":
 * the logic is testable; only the plumbing needs a live hook.
 */

import { describe, it, expect } from 'vitest'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
// Requiring the .cjs is side-effect-free: main() is guarded by require.main.
const hook = require('../scripts/claude-hooks/ai-maestro-hook.cjs')

const msg = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  fromAlias: 'alice',
  fromHost: 'rnd23blocks',
  subject: 'Deploy question',
  priority: 'normal',
  ...over,
})

describe('ai-maestro-hook · decideStopDelivery', () => {
  it('does NOT block for non-claude agents (decision:block is Claude-only)', () => {
    const d = hook.decideStopDelivery({ agent: 'codex', stopHookActive: false, messages: [msg('1')], alreadyIds: [] })
    expect(d.block).toBe(false)
  })

  it('does NOT block when stop_hook_active (loop guard)', () => {
    const d = hook.decideStopDelivery({ agent: 'claude', stopHookActive: true, messages: [msg('1')], alreadyIds: [] })
    expect(d.block).toBe(false)
  })

  it('does NOT block when there are no unread messages', () => {
    const d = hook.decideStopDelivery({ agent: 'claude', stopHookActive: false, messages: [], alreadyIds: [] })
    expect(d.block).toBe(false)
  })

  it('blocks with a Claude Stop-hook response for fresh unread messages', () => {
    const d = hook.decideStopDelivery({ agent: 'claude', stopHookActive: false, messages: [msg('1'), msg('2')], alreadyIds: [] })
    expect(d.block).toBe(true)
    expect(d.response.decision).toBe('block')
    expect(d.response.reason).toContain('2 unread AMP messages')
    expect(d.freshIds).toEqual(['1', '2'])
  })

  it('dedups messages already surfaced, blocking only on the new one', () => {
    const d = hook.decideStopDelivery({ agent: 'claude', stopHookActive: false, messages: [msg('1'), msg('2')], alreadyIds: ['1'] })
    expect(d.block).toBe(true)
    expect(d.freshIds).toEqual(['2'])
    expect(d.response.reason).toContain('1 unread AMP message')
  })

  it('does NOT block when every unread message was already surfaced', () => {
    const d = hook.decideStopDelivery({ agent: 'claude', stopHookActive: false, messages: [msg('1')], alreadyIds: ['1'] })
    expect(d.block).toBe(false)
    expect(d.freshIds).toEqual([])
  })
})

describe('ai-maestro-hook · filterFreshMessages', () => {
  it('drops messages without an id (cannot dedup them)', () => {
    const out = hook.filterFreshMessages([{ subject: 'no id' }, msg('9')], [])
    expect(out).toHaveLength(1)
    expect(out[0].id).toBe('9')
  })

  it('tolerates null/undefined inputs', () => {
    expect(hook.filterFreshMessages(null, null)).toEqual([])
    expect(hook.filterFreshMessages(undefined, ['x'])).toEqual([])
  })
})

describe('ai-maestro-hook · buildAmpBlockReason', () => {
  it('flags a single urgent message and points at the agent-messaging skill', () => {
    const reason = hook.buildAmpBlockReason([msg('1', { priority: 'urgent' })])
    expect(reason).toContain('[URGENT]')
    expect(reason).toContain('1 unread AMP message in your inbox')
    expect(reason).toContain('agent-messaging skill')
    expect(reason).toContain('amp-inbox.sh')
  })

  it('counts urgent messages in the plural header', () => {
    const reason = hook.buildAmpBlockReason([msg('1', { priority: 'urgent' }), msg('2')])
    expect(reason).toContain('2 unread AMP messages')
    expect(reason).toContain('(1 urgent)')
  })

  it('caps the listed messages at 10 and notes the remainder', () => {
    const many = Array.from({ length: 13 }, (_, i) => msg(String(i)))
    const reason = hook.buildAmpBlockReason(many)
    expect(reason).toContain('13 unread AMP messages')
    expect(reason).toContain('…and 3 more')
  })

  it('renders the sender with host', () => {
    const reason = hook.buildAmpBlockReason([msg('1')])
    expect(reason).toContain('from alice (rnd23blocks)')
  })
})

/**
 * Agent resolution for DETACHED sessions — why an agent can receive messages
 * for a whole day and never once be told.
 *
 * The Stop hook is the only delivery route that does not need a tmux pane: it
 * returns `{ decision: "block", reason }` and Claude Code renders it. So it is
 * the ONLY route that can reach a session which is not tmux-managed.
 *
 * It could not reach them, for a reason that has nothing to do with delivery:
 * two different environment variable names for one concept. The documented
 * detached-session hint in .claude/settings.local.json writes
 * CLAUDE_AGENT_NAME — which is what the AMP tooling reads — while this hook
 * looked only for AIM_AGENT_NAME, the name its own launcher sets. So the hint
 * was ignored, resolution fell through to matching the working directory,
 * three registered agents shared that directory, and the hook correctly
 * refused to guess.
 *
 * Correct refusal, right down the line, and the agent still never heard a thing.
 */
describe('resolveAgent — detached sessions', () => {
  const AGENTS = [
    { id: 'aaa', name: 'agents-web', workingDirectory: '/repo' },
    { id: 'bbb', name: 'ai-maestro', workingDirectory: '/repo' },
    { id: 'ccc', name: 'maestro', workingDirectory: '/repo' },
    { id: 'ddd', name: 'solo', workingDirectory: '/solo' },
  ]

  /** Mirrors resolveAgent in scripts/claude-hooks/ai-maestro-hook.cjs. */
  function resolveAgent(cwd: string, agents: typeof AGENTS, env: Record<string, string> = {}) {
    if (env.AIM_AGENT_ID) {
      const byId = agents.find(a => a.id === env.AIM_AGENT_ID)
      if (byId) return byId
    }
    const envName = env.AIM_AGENT_NAME || env.CLAUDE_AGENT_NAME
    if (envName) {
      const byName = agents.find(a => a.name === envName)
      if (byName) return byName
    }
    const matches = agents.filter(a => a.workingDirectory === cwd)
    return matches.length === 1 ? matches[0] : null
  }

  it('accepts CLAUDE_AGENT_NAME, which is what the hint file actually writes', () => {
    // The whole bug: this returned null before, so the one pane-independent
    // delivery route went silent for every detached session.
    expect(resolveAgent('/repo', AGENTS, { CLAUDE_AGENT_NAME: 'ai-maestro' })?.name).toBe('ai-maestro')
  })

  it('still accepts AIM_AGENT_NAME, which the launcher sets', () => {
    expect(resolveAgent('/repo', AGENTS, { AIM_AGENT_NAME: 'ai-maestro' })?.name).toBe('ai-maestro')
  })

  it('prefers an explicit id over any name', () => {
    expect(
      resolveAgent('/repo', AGENTS, { AIM_AGENT_ID: 'ccc', CLAUDE_AGENT_NAME: 'ai-maestro' })?.name
    ).toBe('maestro')
  })

  it('AIM_AGENT_NAME wins over CLAUDE_AGENT_NAME when both are set', () => {
    expect(
      resolveAgent('/repo', AGENTS, { AIM_AGENT_NAME: 'maestro', CLAUDE_AGENT_NAME: 'ai-maestro' })?.name
    ).toBe('maestro')
  })

  it('refuses to guess when several agents share the directory', () => {
    // Correct, and worth keeping: guessing would silently misattribute the
    // session to the wrong agent, which is worse than no identity.
    expect(resolveAgent('/repo', AGENTS, {})).toBeNull()
  })

  it('still resolves an unambiguous directory with no hint at all', () => {
    expect(resolveAgent('/solo', AGENTS, {})?.name).toBe('solo')
  })

  it('falls back to cwd when the hint names an agent that does not exist', () => {
    expect(resolveAgent('/solo', AGENTS, { CLAUDE_AGENT_NAME: 'ghost' })?.name).toBe('solo')
  })
})

/**
 * The blocking reason is also a UI label.
 *
 * Claude Code renders a Stop hook's `decision: block` as "Stop hook error:"
 * followed by the START of this string, truncated to the label width. We cannot
 * change its wording — and "error" is misleading, since nothing failed — but we
 * choose what survives the truncation.
 *
 * Leading with a bracketed tag made the label read `Stop hook error: [A`, which
 * tells the reader nothing. Leading with the count means even a few characters
 * carry the message.
 */
describe('buildAmpBlockReason — reads correctly when truncated', () => {
  const msg = (id: string, extra: Record<string, unknown> = {}) => ({
    id, from: 'alice', fromAlias: 'alice', subject: 'Deploy failed', ...extra,
  })

  it('leads with the count, not a bracketed tag', () => {
    const reason = hook.buildAmpBlockReason([msg('1')])
    expect(reason.startsWith('1 unread AMP message')).toBe(true)
    expect(reason.startsWith('[')).toBe(false)
  })

  it('is informative at a dozen characters', () => {
    // The width at which the old header still read "[AMP] You ha".
    expect(hook.buildAmpBlockReason([msg('1')]).slice(0, 12)).toBe('1 unread AMP')
  })

  it('carries the count for several messages', () => {
    expect(hook.buildAmpBlockReason([msg('1'), msg('2'), msg('3')]).slice(0, 8)).toBe('3 unread')
  })

  it('still names urgency, which is the one thing worth interrupting for', () => {
    const reason = hook.buildAmpBlockReason([msg('1', { priority: 'urgent' }), msg('2')])
    expect(reason).toContain('(1 urgent)')
  })
})
