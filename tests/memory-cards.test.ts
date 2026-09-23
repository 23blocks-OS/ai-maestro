/**
 * Tests for memory cards (F006): lib/memory/summarizer.ts and the pure parts of
 * lib/memory/cards.ts. The summarizer runs the host's own `claude -p` (haiku),
 * so everything that shapes its input and checks its output is pure and tested
 * here; the call itself was verified end to end on a throwaway DB.
 */

import { describe, it, expect } from 'vitest'
import { parseSessionCards, batchCandidates, buildSessionPrompt, extractJson, maxCardsFor, MAX_SESSION_CHARS, type Candidate } from '@/lib/memory/summarizer'
import { extractEntityCandidates } from '@/lib/memory/cards'
import { recallScore } from '@/services/agents-memory-service'

const cand = (n: number, exchangeKey = `x${n}`, size = 100): Candidate => ({
  n, passage: `passage ${n}`, category: 'decision', exchangeKey, exchange: 'e'.repeat(size),
})

describe('parseSessionCards', () => {
  const cands = [cand(1), cand(2), cand(3)]

  it('keeps cards that rest on flagged passages, drops evidence never offered', () => {
    const cards = parseSessionCards({ cards: [
      { statement: 'Use CozoDB.', category: 'decision', action: 'decided', entities: [{ name: 'CozoDB', type: 'library' }], relations: [], evidence: [1, 3, 9] },
      { statement: 'No evidence.', category: 'fact', action: 'discovered', entities: [], relations: [], evidence: [42] },
    ] }, cands, 5)
    expect(cards).toHaveLength(1)
    expect(cards[0]).toMatchObject({ statement: 'Use CozoDB.', category: 'decision', action: 'decided', evidence: [1, 3] })
  })

  it('coerces off-list category, action and entity type instead of storing free text', () => {
    const [c] = parseSessionCards({ cards: [{ statement: 's', category: 'lore', action: 'Implement verbatim storage', entities: [{ name: 'Jev', type: 'model' }], relations: [], evidence: [2] }] }, cands, 5)
    expect(c.category).toBe('insight')
    expect(c.action).toBe('other')
    expect(c.entities).toEqual([{ name: 'Jev', type: 'other' }])
  })

  it('never returns more cards than asked for', () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ statement: `s${i}`, category: 'fact', action: 'discovered', entities: [], relations: [], evidence: [1] }))
    expect(parseSessionCards({ cards: many }, cands, 2)).toHaveLength(2)
  })

  it('accepts zero cards and returns nothing for malformed output', () => {
    expect(parseSessionCards({ cards: [] }, cands, 5)).toEqual([])
    expect(parseSessionCards(null, cands, 5)).toEqual([])
    expect(parseSessionCards({ cards: 'no' }, cands, 5)).toEqual([])
  })
})

describe('maxCardsFor', () => {
  it('asks for few cards: about one per three flagged passages, 1 to 5', () => {
    expect(maxCardsFor(1)).toBe(1)
    expect(maxCardsFor(7)).toBe(3)
    expect(maxCardsFor(40)).toBe(5)
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

describe('batchCandidates', () => {
  it('never splits one exchange across calls', () => {
    const big = Math.floor(MAX_SESSION_CHARS * 0.6)
    const batches = batchCandidates([cand(1, 'a', big), cand(2, 'a', big), cand(3, 'b', big), cand(4, 'c', 10)])
    expect(batches.map(b => b.map(c => c.n))).toEqual([[1, 2], [3, 4]])
  })
})

describe('buildSessionPrompt', () => {
  it('shows each exchange once, with its flagged passages numbered and the card cap', () => {
    const prompt = buildSessionPrompt([
      { n: 1, passage: 'we store verbatim', category: 'decision', exchangeKey: 'a', exchange: 'USER: q\n\nASSISTANT: a', previous: 'earlier talk' },
      { n: 2, passage: 'and redact secrets', category: 'pattern', exchangeKey: 'a', exchange: 'USER: q\n\nASSISTANT: a' },
    ], ['mini-lola'], 1)
    expect(prompt).toContain('KNOWN ENTITIES (use these exact names when they refer to the same thing): mini-lola')
    expect(prompt).toContain('Write AT MOST 1 memory cards (zero is fine)')
    expect(prompt.match(/### EXCHANGE/g)).toHaveLength(1)
    expect(prompt).toContain('BACKGROUND (the exchange before it):\nearlier talk')
    expect(prompt).toContain('[1] (decision) >>> we store verbatim')
    expect(prompt).toContain('[2] (pattern) >>> and redact secrets')
  })
})

describe('recallScore', () => {
  it('ranks a memory seen in more sessions above an equally close one seen once', () => {
    expect(recallScore(0.28, 5, 'long')).toBeLessThan(recallScore(0.28, 1, 'warm'))
  })

  it('does not let weight beat a much closer match', () => {
    expect(recallScore(0.24, 1, 'warm')).toBeLessThan(recallScore(0.31, 10, 'long'))
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

describe('claude version selection', () => {
  it('parses Claude Code version output', async () => {
    const { parseClaudeVersion } = await import('@/lib/memory/summarizer')
    expect(parseClaudeVersion('2.1.278 (Claude Code)')).toEqual([2, 1, 278])
    expect(parseClaudeVersion('nope')).toBeNull()
  })

  it('prefers the newer install (mac-mini: 2.1.278 over a stale 2.0.33 cask)', async () => {
    const { newerVersion } = await import('@/lib/memory/summarizer')
    expect(newerVersion([2, 1, 278], [2, 0, 33])).toBe(true)
    expect(newerVersion([2, 0, 33], [2, 1, 278])).toBe(false)
    expect(newerVersion([2, 1, 278], [2, 1, 278])).toBe(false)
  })
})
