/**
 * Tests for memory cards (F006): lib/memory/summarizer.ts and the pure parts of
 * lib/memory/cards.ts. The summarizer runs the host's own `claude -p` (haiku),
 * so everything that shapes its input and checks its output is pure and tested
 * here; the call itself was verified end to end on a throwaway DB.
 */

import { describe, it, expect } from 'vitest'
import { parseCards, batchJobs, buildPrompt, extractJson, type CardJob } from '@/lib/memory/summarizer'
import { extractEntityCandidates } from '@/lib/memory/cards'

const job = (id: string, size = 100): CardJob => ({
  memory_id: id, category: 'decision', passage: `passage ${id}`, exchange: 'x'.repeat(size),
})

describe('parseCards', () => {
  const jobs = [job('m1'), job('m2')]

  it('keeps well-formed cards for requested memories only', () => {
    const cards = parseCards({ cards: [
      { memory_id: 'm1', skip: false, statement: 'Use CozoDB.', action: 'decided', entities: [{ name: 'CozoDB', type: 'library' }], relations: [] },
      { memory_id: 'nope', skip: false, statement: 'x', action: 'decided', entities: [], relations: [] },
    ] }, jobs)
    expect(cards).toHaveLength(1)
    expect(cards[0]).toMatchObject({ memory_id: 'm1', statement: 'Use CozoDB.', action: 'decided', skip: false })
  })

  it('coerces off-list actions and entity types instead of storing free text', () => {
    const [c] = parseCards({ cards: [{ memory_id: 'm1', skip: false, statement: 's', action: 'Implement verbatim storage', entities: [{ name: 'Jev', type: 'model' }], relations: [] }] }, jobs)
    expect(c.action).toBe('other')
    expect(c.entities).toEqual([{ name: 'Jev', type: 'other' }])
  })

  it('drops relations with unknown predicates or missing ends', () => {
    const [c] = parseCards({ cards: [{ memory_id: 'm1', skip: false, statement: 's', action: 'fixed', entities: [], relations: [
      { subject: 'a', predicate: 'uses', object: 'b' },
      { subject: 'a', predicate: 'loves', object: 'b' },
      { subject: '', predicate: 'uses', object: 'b' },
    ] }] }, jobs)
    expect(c.relations).toEqual([{ subject: 'a', predicate: 'uses', object: 'b' }])
  })

  it('treats an empty statement as skip, and keeps the first card per memory', () => {
    const cards = parseCards({ cards: [
      { memory_id: 'm2', skip: false, statement: '  ', action: 'other', entities: [], relations: [] },
      { memory_id: 'm2', skip: false, statement: 'second', action: 'other', entities: [], relations: [] },
    ] }, jobs)
    expect(cards).toHaveLength(1)
    expect(cards[0].skip).toBe(true)
  })

  it('returns nothing for malformed output', () => {
    expect(parseCards(null, jobs)).toEqual([])
    expect(parseCards({ cards: 'no' }, jobs)).toEqual([])
  })
})

describe('extractJson', () => {
  it('reads a bare object, a fenced one, or one after a preamble', () => {
    expect(extractJson('{"cards":[]}')).toEqual({ cards: [] })
    expect(extractJson('```json\n{"cards":[1]}\n```')).toEqual({ cards: [1] })
    expect(extractJson('Here you go: {"cards":[2]} done')).toEqual({ cards: [2] })
    expect(extractJson('no json here')).toBeNull()
  })
})

describe('batchJobs', () => {
  it('caps a batch at 12 memories', () => {
    const batches = batchJobs(Array.from({ length: 30 }, (_, i) => job(`m${i}`)))
    expect(batches.map(b => b.length)).toEqual([12, 12, 6])
  })

  it('caps a batch by total size, never leaving a job out', () => {
    const batches = batchJobs([job('a', 40_000), job('b', 40_000), job('c', 100)])
    expect(batches.map(b => b.map(j => j.memory_id))).toEqual([['a'], ['b', 'c']])
  })
})

describe('buildPrompt', () => {
  it('gives the whole exchange and background, and marks the flagged passage', () => {
    const prompt = buildPrompt([{ memory_id: 'm1', category: 'decision', passage: 'we store verbatim', exchange: 'USER: q\n\nASSISTANT: a', previous: 'earlier talk' }], ['mini-lola'])
    expect(prompt).toContain('KNOWN ENTITIES (use these exact names when they refer to the same thing): mini-lola')
    expect(prompt).toContain('### MEMORY m1')
    expect(prompt).toContain('PREVIOUS EXCHANGE (background only):\nearlier talk')
    expect(prompt).toContain('EXCHANGE:\nUSER: q\n\nASSISTANT: a')
    expect(prompt).toContain('>>> we store verbatim')
  })
})

describe('extractEntityCandidates', () => {
  it('finds file paths and backticked identifiers, not commands or secrets', () => {
    const c = extractEntityCandidates('Fixed `sendTmuxNotification` in lib/notify/tmux.ts; ran `$ yarn test --watch`; key `[REDACTED]`; see `pane readback`.')
    expect(c).toContain('lib/notify/tmux.ts')
    expect(c).toContain('sendTmuxNotification')
    expect(c).toContain('pane readback')
    expect(c.some(x => x.includes('yarn'))).toBe(false)
    expect(c.some(x => x.includes('REDACTED'))).toBe(false)
  })
})
