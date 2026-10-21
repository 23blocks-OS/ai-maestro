import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { buildAttention, KIND_LABEL, type AttentionAgentInput, type AttentionCardInput } from '@/lib/attention'
import AttentionList from '@/components/attention/AttentionList'

// "Today" is the reader's LOCAL calendar date, so the clock is built from local parts: these hold in any timezone
const NOW = new Date(2026, 9, 21, 12, 0, 0).getTime() // Oct 21 2026, 12:00 local
const HOUR = 3_600_000
const ago = (min: number) => new Date(NOW - min * 60_000).toISOString()

const agent = (over: Partial<AttentionAgentInput> & { id: string }): AttentionAgentInput => ({ presence: 'ready', ...over })
const card = (over: Partial<AttentionCardInput> & { id: string }): AttentionCardInput => ({ subject: 'A card', status: 'pending', agentId: 'a1', updatedAt: ago(10), ...over })
const agents = [agent({ id: 'a1', name: 'alpha' }), agent({ id: 'a2', name: 'beta' })]

describe('overdue cards on the attention page', () => {
  it('lists an open card past its due date, and not one due today, later, or with no date', () => {
    const items = buildAttention({
      agents,
      cards: [
        card({ id: 'late', subject: 'Late one', due: '2026-10-19' }),
        card({ id: 'today', due: '2026-10-21' }),
        card({ id: 'later', due: '2026-10-22' }),
        card({ id: 'none' }),
      ],
    }, NOW)
    expect(items.map(i => i.key)).toEqual(['card:late'])
    expect(items[0]).toMatchObject({ kind: 'overdue', overdue: true, title: 'Late one', agentName: 'alpha' })
    expect(items[0].detail).toContain('overdue 2d')
    expect(items[0].detail).toContain('was due 2026-10-19')
  })

  it('a card is overdue from the start of the day AFTER its due date: due yesterday has waited since midnight', () => {
    const [it] = buildAttention({ agents, cards: [card({ id: 'late', due: '2026-10-20' })] }, NOW)
    expect(it.waitedMs).toBe(12 * HOUR) // since Oct 21 00:00 local
    expect(new Date(it.since!).getTime()).toBe(new Date(2026, 9, 21).getTime())
  })

  it('a finished card is never overdue', () => {
    expect(buildAttention({ agents, cards: [card({ id: 'done', status: 'completed', due: '2026-10-01' })] }, NOW)).toEqual([])
  })

  it('a card that is also waiting on you or in review is ONE row, still marked overdue, ranked by the longer wait', () => {
    const items = buildAttention({
      agents,
      cards: [
        card({ id: 'w', status: 'waiting', waitingOn: 'juan', waitingNote: 'copy please', due: '2026-10-18', updatedAt: ago(30) }),
        card({ id: 'r', status: 'review', due: '2026-10-20', updatedAt: ago(60 * 24 * 5) }),
      ],
    }, NOW)
    expect(items.map(i => i.key).sort()).toEqual(['card:r', 'card:w'])
    const w = items.find(i => i.key === 'card:w')!
    expect(w.kind).toBe('waiting-on-you')
    expect(w.overdue).toBe(true)
    expect(w.detail).toContain('copy please')
    expect(w.detail).toContain('overdue 3d')
    // waiting 30 minutes but overdue since Oct 19 00:00: the lateness is the longer wait
    expect(w.waitedMs).toBe(new Date(2026, 9, 21, 12).getTime() - new Date(2026, 9, 19).getTime())
    // in review for 5 days (longer than being 1 day late): the review wait stands
    const r = items.find(i => i.key === 'card:r')!
    expect(r.kind).toBe('in-review')
    expect(r.overdue).toBe(true)
    expect(r.waitedMs).toBe(5 * 24 * HOUR)
  })

  it('is ranked with the other reasons by how long it has waited', () => {
    const items = buildAttention({
      agents: [agent({ id: 'a1', name: 'alpha', presence: 'needs-you', lastActivity: ago(120) }), agents[1]],
      cards: [
        card({ id: 'late3', subject: 'Three days late', due: '2026-10-17' }),
        card({ id: 'late1', subject: 'One day late', due: '2026-10-20', agentId: 'a2' }),
        card({ id: 'w', status: 'waiting', waitingOn: 'juan', agentId: 'a2', updatedAt: ago(60 * 24 * 2) }),
      ],
    }, NOW)
    expect(items.map(i => i.key)).toEqual(['card:late3', 'card:w', 'card:late1', 'agent:a1'])
  })

  it('the same overdue card from two hosts is listed once', () => {
    const items = buildAttention({
      agents,
      cards: [card({ id: 'late', due: '2026-10-19', updatedAt: ago(100) }), card({ id: 'late', due: '2026-10-19', updatedAt: ago(5) })],
    }, NOW)
    expect(items).toHaveLength(1)
  })

  it('cards without a due field behave exactly as before', () => {
    const items = buildAttention({ agents, cards: [card({ id: 'c4', status: 'review' }), card({ id: 'c5', status: 'in_progress' })] }, NOW)
    expect(items.map(i => i.kind)).toEqual(['in-review'])
    expect(items[0].overdue).toBe(false)
  })

  it('the row says Overdue and shows how late', () => {
    const items = buildAttention({ agents, cards: [card({ id: 'late', subject: 'Banner copy', due: '2026-10-19' })] }, NOW)
    const out = renderToStaticMarkup(createElement(AttentionList, { items }))
    expect(KIND_LABEL.overdue).toBe('Overdue')
    expect(out).toContain('Overdue')
    expect(out).toContain('Banner copy')
    expect(out).toContain('overdue 2d')
  })
})
