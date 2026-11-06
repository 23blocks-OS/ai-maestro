import { describe, it, expect } from 'vitest'
import { dayLabel, withDividers, foundKey } from '@/lib/chat-utils'
import { searchMessages, pageOfMessages } from '@/lib/chat-transcript.mjs'

const NOW = new Date(2026, 10, 6, 12, 0)
const at = (d: number, h = 9) => new Date(2026, 10, d, h).toISOString()
const said = (type: string, text: unknown, uuid = `${type}-${String(text).slice(0, 6)}`) => ({ type, uuid, timestamp: at(6), message: { content: text } })

describe('days between messages', () => {
  it('reads like a messaging app', () => {
    expect(dayLabel(at(6, 1), NOW)).toBe('Today')
    expect(dayLabel(at(5, 23), NOW)).toBe('Yesterday')
    expect(dayLabel(at(3), NOW)).toBe(new Date(2026, 10, 3).toLocaleDateString(undefined, { weekday: 'long' }))
    expect(dayLabel(new Date(2026, 9, 20).toISOString(), NOW)).not.toContain('2026')
    expect(dayLabel(new Date(2025, 9, 20).toISOString(), NOW)).toContain('2025')
  })

  it('puts a line where the day changes, and only there', () => {
    const items = [{ timestamp: at(4) }, { timestamp: at(4, 10) }, { startTimestamp: at(5) }, { timestamp: at(6) }, { timestamp: at(6, 11) }]
    const out = withDividers(items, null, NOW)
    expect(out.map(i => ('_isDivider' in i ? i.label : '·'))).toEqual([expect.any(String), '·', '·', 'Yesterday', '·', 'Today', '·', '·'])
  })

  it('a message with no time or a bad one adds no line', () => {
    expect(withDividers([{ type: 'x' }, { timestamp: 'nonsense' }], null, NOW)).toHaveLength(2)
  })

  it('marks the message search found', () => {
    const out = withDividers([{ uuid: 'a', timestamp: at(6) }, { uuid: 'b', timestamp: at(6) }], 'b', NOW)
    expect(out.map(i => ('_isDivider' in i ? i.label : (i as any).uuid))).toEqual(['Today', 'a', 'Found', 'b'])
    expect(foundKey({ timestamp: 't' })).toBe('t')
  })
})

describe('search', () => {
  const all = [
    said('user', 'Please check the Kitchen camera'),
    said('assistant', [{ type: 'text', text: 'The kitchen looks fine' }, { type: 'tool_use', name: 'x' }]),
    said('assistant', [{ type: 'tool_use', name: 'kitchen' }]),
    { type: 'system_notice', text: 'kitchen', timestamp: at(6) },
    { type: 'thinking', thinking: 'kitchen', timestamp: at(6) },
    said('user', 'unrelated'),
  ]

  it('finds what was said, newest first, in any case, never tools or system notes', () => {
    const { results, total } = searchMessages(all, 'KITCHEN')
    expect(total).toBe(2)
    expect(results.map(r => r.index)).toEqual([1, 0])
    expect(results[0]).toMatchObject({ type: 'assistant', snippet: 'The kitchen looks fine' })
  })

  it('a short or empty query finds nothing', () => {
    expect(searchMessages(all, ' k ').results).toEqual([])
    expect(searchMessages(all, undefined).results).toEqual([])
  })

  it('a long message gives a short snippet around the match', () => {
    const { results } = searchMessages([said('user', `${'a '.repeat(200)}needle${' b'.repeat(200)}`)], 'needle')
    expect(results[0].snippet.length).toBeLessThan(150)
    expect(results[0].snippet).toMatch(/^….*needle.*…$/)
  })

  it('reports all matches but sends a bounded list', () => {
    const many = Array.from({ length: 120 }, (_, i) => said('user', `match ${i}`, `u${i}`))
    const { results, total } = searchMessages(many, 'match')
    expect(total).toBe(120)
    expect(results).toHaveLength(50)
    expect(results[0].uuid).toBe('u119')
  })
})

describe('jumping to a result', () => {
  const all = Array.from({ length: 300 }, (_, i) => said('user', `line ${i}`, `u${i}`))

  it('loads down to the message, with some context, in one contiguous page', () => {
    const page = pageOfMessages(all, { end: 260, through: 100 })
    expect(page.start).toBe(95)
    expect(page.messages).toHaveLength(165)
    expect(page.hasMore).toBe(true)
  })

  it('changes nothing when the normal page already reaches it, or with no target', () => {
    expect(pageOfMessages(all, { end: 260, through: 250 }).start).toBe(220)
    expect(pageOfMessages(all, { end: 260 }).start).toBe(220)
    expect(pageOfMessages(all, { end: 260, through: 'x' as any }).start).toBe(220)
    expect(pageOfMessages(all, { end: 260, through: 2 }).hasMore).toBe(false)
  })
})
