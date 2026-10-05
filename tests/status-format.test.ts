import { describe, it, expect } from 'vitest'
import React, { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  formatModel, formatTokens, formatCost, formatDuration, formatMode,
  cacheState, snapshotAge, primaryAmpAddress, SNAPSHOT_MAX_AGE_MS,
} from '@/lib/status-format'
import { snapshotFromMap } from '@/hooks/useSessionActivity'
import AgentStatusRow from '@/components/AgentStatusRow'
import AgentHeaderBar from '@/components/AgentHeaderBar'
import type { StatusSnapshot } from '@/lib/transcript-snapshot'

// The components use JSX; Next compiles it, vitest's transform needs React in scope
;(globalThis as any).React = React

describe('status words', () => {
  it('names models the way the status line does, and passes unknown ids through', () => {
    expect(formatModel('claude-opus-5-5')).toBe('Opus 5.5')
    expect(formatModel('claude-sonnet-5')).toBe('Sonnet 5')
    expect(formatModel('claude-haiku-4-5-20251001')).toBe('Haiku 4.5')
    expect(formatModel('gpt-whatever')).toBe('gpt-whatever')
    expect(formatModel(undefined)).toBeNull()
  })

  it('formats tokens, cost and mode, and hides unknowns', () => {
    expect(formatTokens(149_300)).toBe('149k')
    expect(formatTokens(900)).toBe('900')
    expect(formatTokens(undefined)).toBeNull()
    expect(formatCost(3.286)).toBe('$3.29')
    expect(formatCost(0)).toBeNull()
    expect(formatCost(undefined)).toBeNull()
    expect(formatMode('acceptEdits')).toBe('accept edits')
    expect(formatMode('auto')).toBe('auto')
    expect(formatMode(undefined)).toBeNull()
  })

  it('counts the cache down and calls it cold after expiry', () => {
    const now = 1_000_000
    expect(cacheState({ cacheExpiresAt: now + 12 * 60_000 }, now)).toEqual({ state: 'warm', label: 'cache warm 12 min' })
    expect(cacheState({ cacheExpiresAt: now - 1 }, now)).toEqual({ state: 'cold', label: 'cache cold' })
    expect(cacheState({}, now)).toBeNull()
  })

  it('shows a snapshot live, then with its age, then not at all after a day', () => {
    const now = 10 * 3_600_000
    expect(snapshotAge({ asOf: now - 30_000 }, now)).toEqual({ visible: true, label: null })
    expect(snapshotAge({ asOf: now - 12 * 60_000 }, now)).toEqual({ visible: true, label: 'last turn 12 min ago' })
    expect(snapshotAge({ asOf: now - 3 * 3_600_000 }, now)).toEqual({ visible: true, label: 'last turn 3 h ago' })
    expect(snapshotAge({ asOf: now - SNAPSHOT_MAX_AGE_MS - 1 }, now).visible).toBe(false)
    expect(formatDuration(10_000)).toBe('<1 min')
  })

  it('finds the primary AMP address', () => {
    expect(primaryAmpAddress({ tools: { amp: { addresses: [{ address: 'b@x', primary: false }, { address: 'a@x', primary: true }] } } })).toBe('a@x')
    expect(primaryAmpAddress({ tools: { amp: { addresses: [{ address: 'only@x' }] } } })).toBe('only@x')
    expect(primaryAmpAddress({ metadata: { amp: { address: 'meta@x' } } })).toBe('meta@x')
    expect(primaryAmpAddress({})).toBeNull()
    expect(primaryAmpAddress(null)).toBeNull()
  })
})

const snap = (over: Partial<StatusSnapshot> = {}): StatusSnapshot => ({
  model: 'claude-opus-5-5',
  contextTokens: 149_300,
  contextWindow: 1_000_000,
  contextApprox: false,
  contextPercent: 15,
  compact: 'none',
  asOf: Date.now(),
  ...over,
})

describe('AgentStatusRow', () => {
  const html = (s: StatusSnapshot) => renderToStaticMarkup(createElement(AgentStatusRow, { snapshot: s }))

  it('shows context, model, cost, effort, mode and cache when known', () => {
    const out = html(snap({ cost: 3.29, effort: 'high', mode: 'auto', cacheExpiresAt: Date.now() + 30 * 60_000 }))
    expect(out).toContain('ctx 149k (15%)')
    expect(out).toContain('Opus 5.5')
    expect(out).toContain('$3.29')
    expect(out).toContain('effort high')
    expect(out).toContain('auto')
    expect(out).toContain('cache warm')
    expect(out).not.toContain('/compact')
  })

  it('says /compact soon and /compact now', () => {
    expect(html(snap({ compact: 'soon' }))).toContain('/compact soon')
    const now = html(snap({ contextTokens: 210_000, compact: 'now' }))
    expect(now).toContain('/compact now')
  })

  it('leaves out every value it does not have, and marks an assumed window', () => {
    const out = html(snap({ contextApprox: true }))
    expect(out).toContain('~15%')
    expect(out).not.toContain('$')
    expect(out).not.toContain('effort')
    expect(out).not.toContain('cache')
  })

  it('renders nothing for a snapshot older than a day', () => {
    expect(html(snap({ asOf: Date.now() - SNAPSHOT_MAX_AGE_MS - 60_000 }))).toBe('')
  })
})

describe('snapshotFromMap (the store selector)', () => {
  const a = snap({ model: 'claude-opus-5-5' })
  const b = snap({ model: 'claude-sonnet-5' })
  it('finds an agent by id first, then by name, else null', () => {
    const map = { id1: a, lola: b }
    expect(snapshotFromMap(map, { id: 'id1', name: 'lola' })).toBe(a)
    expect(snapshotFromMap(map, { id: 'nope', name: 'lola' })).toBe(b)
    expect(snapshotFromMap(map, { alias: 'lola' })).toBe(b)
    expect(snapshotFromMap(map, { id: 'nope', name: 'nobody' })).toBeNull()
    expect(snapshotFromMap({}, {})).toBeNull()
  })
})

describe('AgentHeaderBar', () => {
  const header = (props: Record<string, unknown>) =>
    renderToStaticMarkup(createElement(AgentHeaderBar, { name: 'lola', presence: 'ready', ...props } as any))

  it('shows the folder and the address, and no status row without a snapshot', () => {
    const out = header({ workingDirectory: '/Users/me/agents/lola', address: 'lola@acme.aimaestro.local' })
    expect(out).toContain('~/agents/lola')
    expect(out).toContain('lola@acme.aimaestro.local')
    expect(out).not.toContain('agent-status-row')
  })

  it('shows the status row when there is a snapshot', () => {
    const out = header({ workingDirectory: '/Users/me/x', address: 'a@b', snapshot: snap({ compact: 'soon' }) })
    expect(out).toContain('agent-status-row')
    expect(out).toContain('/compact soon')
  })

  it('keeps the compact header for an agent with nothing known', () => {
    const out = header({})
    expect(out).toContain('lola')
    expect(out).not.toContain('agent-status-row')
  })
})
