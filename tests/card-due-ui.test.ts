import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { DueBadge, OwnersLine, ownerLabels } from '@/components/team-meeting/DueAndOwners'
import KanbanCard from '@/components/team-meeting/KanbanCard'
import TaskDetailView from '@/components/team-meeting/TaskDetailView'
import MatrixView from '@/components/matrix/MatrixView'
import { cardMatchesAgent, agentFilterKey } from '@/lib/card-agent-filter'
import { buildOrganizations } from '@/lib/organization'

const html = (el: React.ReactElement) => renderToStaticMarkup(el)
const noop = async () => {}

const base = (over: Record<string, unknown> = {}) => ({
  id: 'c1', subject: 'A card', status: 'pending', blockedBy: [], blocks: [], isBlocked: false,
  createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z', ...over,
}) as any

describe('DueBadge: the three states', () => {
  const today = '2026-10-21'
  it('later is quiet, soon and today are amber, overdue is red; each says it in words', () => {
    const later = html(createElement(DueBadge, { due: '2026-10-25', today }))
    expect(later).toContain('data-due-kind="later"')
    expect(later).toContain('due Oct 25')
    const soon = html(createElement(DueBadge, { due: '2026-10-23', today }))
    expect(soon).toContain('data-due-kind="soon"')
    expect(soon).toContain('text-amber-300')
    const t = html(createElement(DueBadge, { due: today, today }))
    expect(t).toContain('data-due-kind="today"')
    expect(t).toContain('due today')
    const late = html(createElement(DueBadge, { due: '2026-10-19', today }))
    expect(late).toContain('data-due-kind="overdue"')
    expect(late).toContain('overdue 2d')
    expect(late).toContain('text-red-300')
  })
  it('shows nothing without a date', () => {
    expect(html(createElement(DueBadge, { due: null }))).toBe('')
    expect(html(createElement(DueBadge, { due: undefined }))).toBe('')
  })
})

describe('OwnersLine', () => {
  it('shows the first two names and +N for the rest, all of them in the tooltip', () => {
    const one = html(createElement(OwnersLine, { card: { owners: ['a2'], ownerNames: ['Beta'] } }))
    expect(one).toContain('Beta')
    expect(one).not.toContain('+')
    const four = html(createElement(OwnersLine, { card: { owners: ['a', 'b', 'c', 'd'], ownerNames: ['Ana', 'Beto', 'Cleo', 'Dan'] } }))
    expect(four).toContain('Ana, Beto +2')
    expect(four).toContain('Also owned by: Ana, Beto, Cleo, Dan')
  })
  it('falls back to the owners as given when no names were resolved, and shows nothing without owners', () => {
    expect(ownerLabels({ owners: ['crab-cto'] })).toEqual(['crab-cto'])
    expect(html(createElement(OwnersLine, { card: { owners: ['crab-cto'] } }))).toContain('crab-cto')
    expect(html(createElement(OwnersLine, { card: {} }))).toBe('')
    expect(html(createElement(OwnersLine, { card: { owners: [] } }))).toBe('')
  })
})

describe('the board card', () => {
  it('shows the due badge, the owners and the shared marker only when they apply', () => {
    const plain = html(createElement(KanbanCard, { task: base(), onSelect: () => {} }))
    expect(plain).not.toContain('due-badge')
    expect(plain).not.toContain('owners-line')
    expect(plain).not.toContain('shared-badge')
    const full = html(createElement(KanbanCard, { task: base({ due: '2000-01-01', owners: ['a2'], ownerNames: ['Beta'], shared: true }), onSelect: () => {} }))
    expect(full).toContain('data-due-kind="overdue"')
    expect(full).toContain('Beta')
    expect(full).toContain('shared-badge')
    expect(html(createElement(KanbanCard, { task: base({ due: '2999-01-01' }), onSelect: () => {} }))).toContain('data-due-kind="later"')
  })
})

describe('the card detail', () => {
  const agents = [{ id: 'a1', name: 'alpha', label: 'Ana', tags: [] }, { id: 'a2', name: 'beta', tags: [] }, { id: 'a3', name: 'gamma', tags: [] }] as any
  const detail = (task: any) => html(createElement(TaskDetailView, { task, agents, allTasks: [task], onUpdate: noop, onDelete: noop, onClose: () => {} }))

  it('has a date input with the card\'s date, and the owners as chips with the agents not yet owners to add', () => {
    const out = detail(base({ due: '2026-10-25', assigneeAgentId: 'a1', owners: ['a2'], ownerNames: ['beta'] }))
    expect(out).toContain('data-testid="due-picker"')
    expect(out).toContain('type="date"')
    expect(out).toContain('value="2026-10-25"')
    expect(out).toContain('data-testid="due-clear"')
    const chips = out.match(/data-testid="owner-chip"/g) || []
    expect(chips).toHaveLength(1)
    // the select offers a3 only: a1 is the assignee, a2 already owns it
    const select = out.slice(out.indexOf('data-testid="owner-add"'), out.indexOf('</select>', out.indexOf('data-testid="owner-add"')))
    expect(select).toContain('gamma')
    expect(select).not.toContain('Ana')
    expect(select).not.toContain('>beta<')
    expect(out).toContain('They are not sent a message')
  })

  it('without a date there is no Clear; without owners there are no chips; the picker is still there', () => {
    const out = detail(base({ assigneeAgentId: 'a1' }))
    expect(out).toContain('value=""')
    expect(out).not.toContain('due-clear')
    expect(out).not.toContain('owner-chip')
    expect(out).toContain('owner-add')
  })
})

describe('the matrix', () => {
  const card = (id: string, extra: Record<string, unknown>) => base({ id, subject: id, urgent: true, important: true, agentName: 'Ana', ...extra })
  const place = noop

  it('inside a square, cards with a due date come first by earliest due; the rest keep their order', () => {
    const cards = [
      card('n1', {}), card('late', { due: '2999-12-01' }), card('n2', {}), card('soon', { due: '2999-01-05' }), card('mid', { due: '2999-06-01' }),
    ]
    const out = html(createElement(MatrixView, { cards, onPlace: place, onSelect: () => {}, showAgent: true }))
    const q1 = out.slice(out.indexOf('data-testid="quadrant-q1"'), out.indexOf('data-testid="quadrant-q2"'))
    const order = ['soon', 'mid', 'late', 'n1', 'n2'].map(s => q1.indexOf(`>${s}<`))
    expect(order.every(i => i > 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
  })

  it('shows the due badge and the owners on the card, and an overdue one in red', () => {
    const out = html(createElement(MatrixView, { cards: [card('x', { due: '2000-01-01', owners: ['a2', 'a3'], ownerNames: ['Beta', 'Gamma'] })], onPlace: place, onSelect: () => {}, showAgent: true }))
    expect(out).toContain('data-due-kind="overdue"')
    expect(out).toContain('Beta, Gamma')
  })

  it('does not reorder the Not placed tray, and a card with no date is untouched', () => {
    const cards = [card('p1', { urgent: null, important: null }), card('p2', { urgent: null, important: null, due: '2999-01-01' })]
    const out = html(createElement(MatrixView, { cards, onPlace: place, onSelect: () => {} }))
    const tray = out.slice(out.indexOf('data-testid="matrix-tray"'))
    expect(tray.indexOf('>p1<')).toBeLessThan(tray.indexOf('>p2<'))
  })
})

describe('filtering the matrix by an agent', () => {
  const names = new Map([['a2', ['beta', 'Bea']]])
  const key = agentFilterKey('h1', 'a2')

  it('matches the primary agent on its host and a co-owner by id or by name; no filter matches everything', () => {
    expect(cardMatchesAgent({ hostId: 'h1', agentId: 'a2' }, key, names)).toBe(true)
    expect(cardMatchesAgent({ hostId: 'h2', agentId: 'a2' }, key, names)).toBe(false) // the same id on another host is another row
    expect(cardMatchesAgent({ hostId: 'h1', agentId: 'a1', owners: ['a2'] }, key, names)).toBe(true)
    expect(cardMatchesAgent({ hostId: 'h9', agentId: 'a1', owners: ['BETA'] }, key, names)).toBe(true) // by name, any host, any case
    expect(cardMatchesAgent({ hostId: 'h1', agentId: 'a1', owners: ['a3'] }, key, names)).toBe(false)
    expect(cardMatchesAgent({ hostId: 'h1', agentId: 'a1' }, key, names)).toBe(false)
    expect(cardMatchesAgent({ hostId: 'h1', agentId: 'a1' }, '', names)).toBe(true)
  })

  it('filtering keeps one row per card: it is a filter, not a copy per owner', () => {
    const cards = [{ id: 'c1', hostId: 'h1', agentId: 'a1', owners: ['a2', 'a3'] }, { id: 'c2', hostId: 'h1', agentId: 'a3' }]
    const forA2 = cards.filter(c => cardMatchesAgent(c, key, names))
    const forA3 = cards.filter(c => cardMatchesAgent(c, agentFilterKey('h1', 'a3')))
    expect(forA2.map(c => c.id)).toEqual(['c1'])
    expect(forA3.map(c => c.id)).toEqual(['c1', 'c2'])
  })
})

describe('the Org view: a co-owner does not move a card to another company', () => {
  it('a card stays with its assignee\'s organization, and the co-owner\'s counts do not change', () => {
    const agents = [
      { id: 'a1', name: 'alpha', hostId: 'h1', tags: ['org:acme'] },
      { id: 'a2', name: 'beta', hostId: 'h1', tags: ['org:globex'] },
    ]
    const cards = [{ id: 'c1', subject: 'Joint work', status: 'pending', agentId: 'a1', owners: ['a2'], due: '2026-10-25' }] as any
    const orgs = buildOrganizations(agents, cards, [])
    const acme = orgs.find(o => o.id === 'acme')!
    const globex = orgs.find(o => o.id === 'globex')!
    expect(acme.cards.map(c => c.id)).toEqual(['c1'])
    expect(globex.cards).toEqual([])
    expect(acme.agents.find(a => a.id === 'a1')!.open).toBe(1)
    expect(globex.agents.find(a => a.id === 'a2')!.open).toBe(0)
  })
})
