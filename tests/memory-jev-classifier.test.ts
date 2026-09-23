/**
 * Tests for the Jev memory classifier (lib/memory/jev-provider.ts, settings.ts).
 *
 * Memory consolidation had never run on any agent: it needed an LLM that was
 * not configured and reported the failure in a field the UI never read. The
 * classifier path replaces extraction with classification of verbatim
 * exchanges. The properties that matter:
 *   - chunking never skips or duplicates messages across incremental runs
 *   - an unanswered trailing turn is left for the next run
 *   - a bad key aborts the run (fatal) instead of silently marking progress
 *   - the API key never leaves the host unmasked
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { chunkConversation, JevClassifier, ClassifierError, classifyRelations } from '@/lib/memory/jev-provider'
import { maskClassifierSettings, DEFAULT_CLASSIFIER_SETTINGS } from '@/lib/memory/settings'
import type { ConversationMessage } from '@/lib/memory/types'

const u = (content: string): ConversationMessage => ({ role: 'user', content })
const a = (content: string): ConversationMessage => ({ role: 'assistant', content })
const LONG = 'x'.repeat(100)

const texts = (c: { passages: { text: string }[] }) => c.passages.map(p => p.text)
const PARA = 'p'.repeat(130)

describe('chunkConversation', () => {
  it('pairs each user turn with the assistant replies that follow it', () => {
    const msgs = [u(`use CozoDB ${LONG}`), a(`reading ${PARA}`), a(`decided: CozoDB ${PARA}`), u(`next ${LONG}`), a(`done ${PARA}`)]
    const chunks = chunkConversation(msgs, 0)
    expect(chunks).toHaveLength(2)
    expect(texts(chunks[0])).toEqual([`USER: use CozoDB ${LONG}`, `reading ${PARA}`, `decided: CozoDB ${PARA}`])
    expect(chunks[0].endIndex).toBe(3)
    expect(chunks[1].endIndex).toBe(5)
  })

  it('stores each passage verbatim but judges it in the context of the request', () => {
    const [chunk] = chunkConversation([u(`should we store verbatim? ${LONG}`), a(`Decision: store verbatim. ${PARA}`)], 0)
    const reply = chunk.passages[1]
    expect(reply.text).toBe(`Decision: store verbatim. ${PARA}`)
    expect(reply.state).toContain('CONTEXT (the user\'s request this passage belongs to): should we store verbatim?')
    expect(reply.state).toContain('PASSAGE TO JUDGE (said by the assistant): Decision: store verbatim.')
  })

  it('splits replies into paragraphs and drops short lines and code blocks', () => {
    const reply = [`first point ${PARA}`, 'ok.', '```ts\nconst x = 1 ' + PARA + '\n```', `second point ${PARA}`].join('\n\n')
    const [chunk] = chunkConversation([u(`q ${LONG}`), a(reply)], 0)
    expect(texts(chunk)).toEqual([`USER: q ${LONG}`, `first point ${PARA}`, `second point ${PARA}`])
  })

  it('leaves an unanswered final user turn for the next run', () => {
    const msgs = [u(`first ${LONG}`), a(`reply ${PARA}`), u('still waiting for a reply')]
    const chunks = chunkConversation(msgs, 0)
    expect(chunks).toHaveLength(1)
    expect(chunks[0].endIndex).toBe(2) // offset stops before the unanswered turn
  })

  it('resumes from an offset without re-reading consumed messages', () => {
    const msgs = [u(`one ${LONG}`), a('r1'), u(`two ${LONG}`), a('r2')]
    const first = chunkConversation(msgs, 0)
    const resumed = chunkConversation(msgs, first[0].endIndex)
    expect(resumed).toHaveLength(1)
    expect(texts(resumed[0])).toEqual([`USER: two ${LONG}`])
  })

  it('merges consecutive user messages into one turn', () => {
    const chunks = chunkConversation([u(`part one ${LONG}`), u('part two'), a('reply')], 0)
    expect(chunks).toHaveLength(1)
    expect(texts(chunks[0])[0]).toContain('part one')
    expect(texts(chunks[0])[0]).toContain('part two')
  })

  it('consumes tiny exchanges without anything to classify', () => {
    const chunks = chunkConversation([u('go'), a('ok')], 0)
    expect(chunks).toEqual([{ endIndex: 2, passages: [], timestamp: undefined }])
  })

  it('strips harness noise from user turns', () => {
    const [chunk] = chunkConversation([u(`<system-reminder>ignore me</system-reminder>real question ${LONG}`), a('answer')], 0)
    expect(texts(chunk)[0]).not.toContain('ignore me')
    expect(texts(chunk)[0]).toContain('real question')
  })

  it('does not treat background-task notifications as user turns', () => {
    const msgs = [u(`real ask ${LONG}`), a('working'), u('<task-notification><task-id>x</task-id>done</task-notification>'), a(`agent finished ${PARA}`)]
    const chunks = chunkConversation(msgs, 0)
    expect(chunks).toHaveLength(1)
    expect(texts(chunks[0])).toEqual([`USER: real ask ${LONG}`, `agent finished ${PARA}`])
  })

  it('ignores the compaction summary Claude Code injects as a user turn', () => {
    const chunks = chunkConversation([u(`This session is being continued from a previous conversation. Summary: ${LONG}`), a(`resuming ${PARA}`)], 0)
    // nothing to classify, but the offset still moves past it so the conversation is not retried forever
    expect(chunks).toEqual([{ endIndex: 2, passages: [] }])
  })

  it('keeps head and tail of very long passages', () => {
    const para = 'START' + 'y'.repeat(10000) + 'CONCLUSION'
    const [chunk] = chunkConversation([u(`q ${LONG}`), a(para)], 0)
    const stored = texts(chunk)[1]
    expect(stored).toContain('START')
    expect(stored).toContain('CONCLUSION')
    expect(stored.length).toBeLessThan(2100)
  })
})

describe('JevClassifier', () => {
  const settings = { ...DEFAULT_CLASSIFIER_SETTINGS, apiKey: 'k' }
  afterEach(() => vi.unstubAllGlobals())

  const answer = (durable: number, category: string, importance: number) => ({
    ok: true,
    status: 200,
    json: async () => ({
      model: 'jev-1.13.0',
      answers: {
        durable: { noul: durable },
        category: { choice: category, confidence: 0.9 },
        importance: { score: importance },
      },
      usage: { input_tokens: 600 },
    }),
  })

  it('parses answers and applies thresholds', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => answer(0.88, 'decision', 3.2)))
    const c = new JevClassifier(settings)
    const r = await c.classify('state')
    expect(r).toMatchObject({ durable: 0.88, category: 'decision', importance: 3.2, model: 'jev-1.13.0' })
    expect(c.accepts(r)).toBe(true)
    expect(c.accepts({ ...r, durable: 0.1 })).toBe(false)
    expect(c.accepts({ ...r, category: 'none' })).toBe(false)
    expect(c.accepts({ ...r, importance: 1 })).toBe(false)
  })

  it('treats a rejected key as fatal', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 401, text: async () => '' })))
    const err = await new JevClassifier(settings).classify('state').catch(e => e)
    expect(err).toBeInstanceOf(ClassifierError)
    expect(err.fatal).toBe(true)
  })

  it('retries rate limits before succeeding', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 429 })
      .mockResolvedValueOnce(answer(0.9, 'fact', 3))
    vi.stubGlobal('fetch', fetchMock)
    const p = new JevClassifier(settings).classify('state')
    await vi.runAllTimersAsync()
    await expect(p).resolves.toMatchObject({ category: 'fact' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })
})

describe('maskClassifierSettings', () => {
  it('never exposes the API key', () => {
    const masked = maskClassifierSettings({ ...DEFAULT_CLASSIFIER_SETTINGS, apiKey: 'apikey_secret_abcd' })
    expect(JSON.stringify(masked)).not.toContain('secret')
    expect(masked.apiKeyHint).toBe('…abcd')
    expect(masked.configured).toBe(true)
  })

  it('reports unconfigured when no key is stored', () => {
    const masked = maskClassifierSettings(DEFAULT_CLASSIFIER_SETTINGS)
    expect(masked.configured).toBe(false)
    expect(masked.apiKeyHint).toBeNull()
  })
})

// Regression: memory vectors were written as `<0.1, 0.2>`, which CozoDB cannot
// parse as a value. Every memory store and every memory search threw, so no
// long-term memory was ever stored on any agent.
describe('toCozoVector', () => {
  it('builds a vec([...]) literal, never the <...> type syntax', async () => {
    const { toCozoVector } = await import('@/lib/cozo-schema-memory')
    expect(toCozoVector([0.5, -0.25])).toBe('vec([0.5, -0.25])')
    expect(toCozoVector([0.5, -0.25])).not.toContain('<')
  })

  it('replaces non-finite values so the query still parses', async () => {
    const { toCozoVector } = await import('@/lib/cozo-schema-memory')
    expect(toCozoVector([NaN, Infinity, 1])).toBe('vec([0, 0, 1])')
  })
})

// The memory graph: edges come from one classifier call per new memory.
describe('classifyRelations', () => {
  const settings = { ...DEFAULT_CLASSIFIER_SETTINGS, apiKey: 'k' }
  afterEach(() => vi.unstubAllGlobals())

  it('asks one question per candidate and keeps confident, non-none answers', async () => {
    const fetchMock = vi.fn(async (_url: string, init: any) => {
      const body = JSON.parse(init.body)
      expect(Object.keys(body.questions)).toEqual(['relation_1', 'relation_2', 'relation_3'])
      expect(body.state).toContain('NEW MEMORY: store verbatim')
      expect(body.state).toContain('EXISTING MEMORY 2: use haiku')
      return {
        ok: true, status: 200,
        json: async () => ({ model: 'jev', answers: {
          relation_1: { choice: 'supports', confidence: 0.9 },
          relation_2: { choice: 'supersedes', confidence: 0.8 },
          relation_3: { choice: 'contradicts', confidence: 0.4 }, // below cutoff
        } }),
      }
    })
    vi.stubGlobal('fetch', fetchMock)
    const rels = await classifyRelations(new JevClassifier(settings), 'store verbatim', ['a', 'use haiku', 'c'])
    expect(rels).toEqual([
      { index: 0, relation: 'supports', confidence: 0.9 },
      { index: 1, relation: 'supersedes', confidence: 0.8 },
    ])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('makes no call without candidates', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    expect(await classifyRelations(new JevClassifier(settings), 'x', [])).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
