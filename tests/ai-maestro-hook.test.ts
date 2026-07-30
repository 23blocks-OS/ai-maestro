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
    expect(d.response.reason).toContain('2 unread messages')
    expect(d.freshIds).toEqual(['1', '2'])
  })

  it('dedups messages already surfaced, blocking only on the new one', () => {
    const d = hook.decideStopDelivery({ agent: 'claude', stopHookActive: false, messages: [msg('1'), msg('2')], alreadyIds: ['1'] })
    expect(d.block).toBe(true)
    expect(d.freshIds).toEqual(['2'])
    expect(d.response.reason).toContain('1 unread message')
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
    expect(reason).toContain('1 unread message in your inbox')
    expect(reason).toContain('agent-messaging skill')
    expect(reason).toContain('amp-inbox.sh')
  })

  it('counts urgent messages in the plural header', () => {
    const reason = hook.buildAmpBlockReason([msg('1', { priority: 'urgent' }), msg('2')])
    expect(reason).toContain('2 unread messages')
    expect(reason).toContain('(1 urgent)')
  })

  it('caps the listed messages at 10 and notes the remainder', () => {
    const many = Array.from({ length: 13 }, (_, i) => msg(String(i)))
    const reason = hook.buildAmpBlockReason(many)
    expect(reason).toContain('13 unread messages')
    expect(reason).toContain('…and 3 more')
  })

  it('renders the sender with host', () => {
    const reason = hook.buildAmpBlockReason([msg('1')])
    expect(reason).toContain('from alice (rnd23blocks)')
  })
})
