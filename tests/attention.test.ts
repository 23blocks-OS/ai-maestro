import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { buildAttention, unreachableHosts, type AttentionAgentInput, type AttentionCardInput } from '@/lib/attention'
import AttentionList, { waitedLabel } from '@/components/attention/AttentionList'
import Header from '@/components/Header'

const NOW = Date.parse('2026-10-21T12:00:00Z')
const ago = (min: number) => new Date(NOW - min * 60_000).toISOString()

const agent = (over: Partial<AttentionAgentInput> & { id: string }): AttentionAgentInput => ({ presence: 'ready', ...over })
const card = (over: Partial<AttentionCardInput> & { id: string }): AttentionCardInput => ({ subject: 'A card', status: 'pending', agentId: 'a1', ...over })

describe('buildAttention: what is listed', () => {
  it('lists agents that need you, cards waiting on you, and cards in review, and nothing else', () => {
    const items = buildAttention({
      agents: [
        agent({ id: 'a1', name: 'alpha', presence: 'needs-you', lastActivity: ago(5) }),
        agent({ id: 'a2', name: 'beta', presence: 'working' }),
        agent({ id: 'a3', name: 'gamma', presence: 'ready' }),
        agent({ id: 'a4', name: 'delta', presence: 'offline' }),
      ],
      cards: [
        card({ id: 'c1', status: 'waiting', waitingOn: 'juan', waitingNote: 'copy please', agentId: 'a2', updatedAt: ago(30) }),
        card({ id: 'c2', status: 'waiting', waitingOn: 'outside', agentId: 'a2', updatedAt: ago(30) }),
        card({ id: 'c3', status: 'waiting', waitingOn: 'hold', agentId: 'a2', updatedAt: ago(30) }),
        card({ id: 'c4', status: 'review', agentId: 'a3', updatedAt: ago(10) }),
        card({ id: 'c5', status: 'in_progress', agentId: 'a3', updatedAt: ago(10) }),
        card({ id: 'c6', status: 'pending', agentId: 'a3', updatedAt: ago(10) }),
      ],
    }, NOW)
    expect(items.map(i => [i.kind, i.key])).toEqual([
      ['waiting-on-you', 'card:c1'],
      ['in-review', 'card:c4'],
      ['needs-you', 'agent:a1'],
    ])
    expect(items.find(i => i.key === 'card:c1')?.detail).toBe('copy please')
  })

  it('takes an agent\'s status from presence only: an agent that is not needs-you never appears as one', () => {
    const items = buildAttention({ agents: [agent({ id: 'a1', presence: 'working', lastActivity: ago(500) })], cards: [] }, NOW)
    expect(items).toEqual([])
  })
})

describe('buildAttention: order, names and time', () => {
  it('puts the longest wait first and unknown starts last', () => {
    const items = buildAttention({
      agents: [
        agent({ id: 'a1', name: 'alpha', presence: 'needs-you', lastActivity: ago(2) }),
        agent({ id: 'a2', name: 'beta', presence: 'needs-you' }),
      ],
      cards: [
        card({ id: 'old', status: 'waiting', waitingOn: 'juan', agentId: 'a1', updatedAt: ago(26 * 60) }),
        card({ id: 'mid', status: 'review', agentId: 'a1', updatedAt: ago(90) }),
      ],
    }, NOW)
    expect(items.map(i => i.key)).toEqual(['card:old', 'card:mid', 'agent:a1', 'agent:a2'])
    expect(items[0].waitedMs).toBe(26 * 60 * 60_000)
    expect(items[3].waitedMs).toBeNull()
    expect(items[3].since).toBeNull()
  })

  it('shows the label, then the name, with the role line', () => {
    const [a, b] = buildAttention({
      agents: [
        agent({ id: 'a1', name: 'crab-hr', label: 'Hana', tags: ['role:hr', 'org:crabmail'], presence: 'needs-you', lastActivity: ago(9) }),
        agent({ id: 'a2', name: 'plain', presence: 'needs-you', lastActivity: ago(1) }),
      ],
      cards: [],
    }, NOW)
    expect(a.agentName).toBe('Hana')
    expect(a.roleLine).toBe('hr · crabmail')
    expect(b.agentName).toBe('plain')
    expect(b.roleLine).toBe('')
  })

  it('names the owner of a card from the agent list, else from the card, else a short id', () => {
    const items = buildAttention({
      agents: [agent({ id: 'a1', label: 'Lola', tags: ['role:chief'] })],
      cards: [
        card({ id: 'c1', status: 'review', agentId: 'a1', agentName: 'pas-lola', updatedAt: ago(5) }),
        card({ id: 'c2', status: 'review', agentId: 'zzzzzzzz-1111', agentName: 'remote-agent', updatedAt: ago(4) }),
        card({ id: 'c3', status: 'review', agentId: 'yyyyyyyy-2222', updatedAt: ago(3) }),
      ],
    }, NOW)
    expect(items.map(i => i.agentName)).toEqual(['Lola', 'remote-agent', 'yyyyyyyy'])
    expect(items[0].roleLine).toBe('chief')
  })
})

describe('buildAttention: several hosts', () => {
  it('lists an agent and a card that live on another host, with the host named', () => {
    const items = buildAttention({
      agents: [agent({ id: 'r1', name: 'remote', presence: 'needs-you', hostId: 'mac-mini', hostName: 'Mac mini', lastActivity: ago(7) })],
      cards: [card({ id: 'c1', status: 'waiting', waitingOn: 'juan', agentId: 'r1', hostId: 'mac-mini', hostName: 'Mac mini', updatedAt: ago(20) })],
    }, NOW)
    expect(items).toHaveLength(2)
    expect(items.every(i => i.hostName === 'Mac mini')).toBe(true)
  })

  it('the same card reported by two hosts is listed once, the most recently updated copy', () => {
    const items = buildAttention({
      agents: [],
      cards: [
        card({ id: 'same', subject: 'old copy', status: 'review', agentId: 'a1', hostId: 'self', updatedAt: ago(100) }),
        card({ id: 'same', subject: 'new copy', status: 'review', agentId: 'a1', hostId: 'mac-mini', updatedAt: ago(10) }),
      ],
    }, NOW)
    expect(items).toHaveLength(1)
    expect(items[0].title).toBe('new copy')
  })

  it('an agent id seen twice is one agent', () => {
    const items = buildAttention({
      agents: [
        agent({ id: 'a1', name: 'first', presence: 'needs-you', lastActivity: ago(5) }),
        agent({ id: 'a1', name: 'second', presence: 'needs-you', lastActivity: ago(5) }),
      ],
      cards: [],
    }, NOW)
    expect(items).toHaveLength(1)
    expect(items[0].agentName).toBe('first')
  })

  it('names each host that did not answer once, from either source', () => {
    expect(unreachableHosts(['Mac mini'], ['mini-lola', 'Mac mini'], undefined)).toEqual(['Mac mini', 'mini-lola'])
    expect(unreachableHosts([], undefined)).toEqual([])
  })
})

describe('AttentionList', () => {
  const items = buildAttention({
    agents: [agent({ id: 'a 1', name: 'alpha', presence: 'needs-you', lastActivity: ago(3), hostName: 'Mac mini' })],
    cards: [card({ id: 'c1', subject: 'Final copy', status: 'waiting', waitingOn: 'juan', waitingNote: 'by Friday', agentId: 'a 1', updatedAt: ago(26 * 60) })],
  }, NOW)

  it('renders a row per item as a link to the agent, longest first, with how long it waited', () => {
    const html = renderToStaticMarkup(createElement(AttentionList, { items, showHost: true }))
    expect(html.match(/data-testid="attention-row"/g)).toHaveLength(2)
    expect(html.indexOf('Final copy')).toBeLessThan(html.indexOf('Is waiting for you'))
    expect(html).toContain('href="/?agent=a%201"')
    expect(html).toContain('Waiting on you')
    expect(html).toContain('by Friday')
    expect(html).toContain('26h')
    expect(html).toContain('3m')
    expect(html).toContain('@ Mac mini')
  })

  it('does not nest a button inside the link', () => {
    expect(renderToStaticMarkup(createElement(AttentionList, { items }))).not.toContain('<button')
  })

  it('says so when nothing needs you', () => {
    expect(renderToStaticMarkup(createElement(AttentionList, { items: [] }))).toContain('Nothing needs you right now.')
  })

  it('waitedLabel', () => {
    expect(waitedLabel(null)).toBe('unknown')
    expect(waitedLabel(20_000)).toBe('just now')
    expect(waitedLabel(12 * 60_000)).toBe('12m')
    expect(waitedLabel(5 * 3_600_000)).toBe('5h')
    expect(waitedLabel(3 * 24 * 3_600_000)).toBe('3d')
  })
})

describe('the home header', () => {
  it('has an Attention link and keeps the Matrix, Org, Teams and Zoom links it had', () => {
    const html = renderToStaticMarkup(createElement(Header, {}))
    expect(html).toContain('href="/attention"')
    for (const href of ['/matrix', '/org', '/teams', '/projects', '/team-meeting', '/zoom']) expect(html).toContain(`href="${href}"`)
  })
})
