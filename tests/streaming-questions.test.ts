/**
 * AskUserQuestion on the SDK (streaming) path.
 *
 * WHY THIS PATH MATTERS
 *
 * The tmux path infers agent state by reading a terminal as text and typing
 * keystrokes back. Every chat bug on 15 Sep 2026 came from that: text staged but
 * not submitted, a false permission detection that deadlocked sends, a dim
 * placeholder read as real input, `C-u` silently not clearing. Screen-scraping a
 * TUI cannot be made reliable — only less unreliable.
 *
 * The SDK path has no such problem. Per Anthropic's docs, questions arrive
 * through the `canUseTool` callback as structured JSON and are answered with
 * structured JSON:
 *
 *   { behavior: 'allow',
 *     updatedInput: { questions, answers: { "<question text>": "<label>" } } }
 *
 * WHAT WAS BROKEN
 *
 * `_onCanUseTool` treated every tool identically — one allow/deny card. Answering
 * a question with a plain "allow" returns the input unchanged, with no `answers`
 * key, so Claude gets NO ANSWER and the turn stalls. There was no branch for
 * AskUserQuestion at all: permissions were handled, questions were not.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@anthropic-ai/claude-agent-sdk', () => ({ query: vi.fn(() => ({ [Symbol.asyncIterator]: async function* () {} })) }))

const { Session } = await import('@/lib/streaming-runtime.mjs')

function makeSession() {
  const emitted: any[] = []
  const s = Object.create(Session.prototype)
  s.pending = new Map()
  s.closed = false
  s._emit = (e: any) => emitted.push(e)
  return { s, emitted }
}

const QUESTION_INPUT = {
  questions: [{
    question: 'How should I format the output?',
    header: 'Format',
    options: [
      { label: 'Summary', description: 'Brief overview' },
      { label: 'Detailed', description: 'Full explanation' },
    ],
    multiSelect: false,
  }],
}

describe('a question is routed away from the permission flow', () => {
  it('emits a question card, not a permission card', async () => {
    const { s, emitted } = makeSession()
    s._onCanUseTool('AskUserQuestion', QUESTION_INPUT, {})
    expect(emitted.map(e => e.type)).toContain('stream:question')
    expect(emitted.map(e => e.type)).not.toContain('stream:permission')
  })

  it('carries the questions through to the client', async () => {
    const { s, emitted } = makeSession()
    s._onCanUseTool('AskUserQuestion', QUESTION_INPUT, {})
    expect(emitted[0].questions[0].options).toHaveLength(2)
  })

  it('still sends an ordinary tool through the permission flow', async () => {
    const { s, emitted } = makeSession()
    s._onCanUseTool('Bash', { command: 'ls' }, {})
    expect(emitted.map(e => e.type)).toContain('stream:permission')
  })
})

describe('answering the question', () => {
  let s: any, emitted: any[]
  beforeEach(() => { ({ s, emitted } = makeSession()) })

  it('returns the answer in the shape the SDK requires', async () => {
    const p = s._onCanUseTool('AskUserQuestion', QUESTION_INPUT, {})
    const { requestId } = emitted[0]
    s.resolveQuestion(requestId, { 'How should I format the output?': 'Summary' }, null)
    await expect(p).resolves.toEqual({
      behavior: 'allow',
      updatedInput: {
        questions: QUESTION_INPUT.questions,
        answers: { 'How should I format the output?': 'Summary' },
      },
    })
  })

  it('accepts the user OWN WORDS as the answer, not just a label', async () => {
    // The docs are explicit: use the custom text as the answer value.
    const p = s._onCanUseTool('AskUserQuestion', QUESTION_INPUT, {})
    s.resolveQuestion(emitted[0].requestId, { 'How should I format the output?': 'as a table please' }, null)
    const r = await p
    expect(r.updatedInput.answers['How should I format the output?']).toBe('as a table please')
  })

  it('supports a freeform reply that answers no specific question', async () => {
    // `response` makes Claude read "The user responded: …" instead of a list.
    const p = s._onCanUseTool('AskUserQuestion', QUESTION_INPUT, {})
    s.resolveQuestion(emitted[0].requestId, {}, 'forget the format, just tell me what broke')
    const r = await p
    expect(r.updatedInput.response).toBe('forget the format, just tell me what broke')
    expect(r.updatedInput.answers).toBeUndefined()
  })

  it('always returns the questions array — the tool requires it', async () => {
    const p = s._onCanUseTool('AskUserQuestion', QUESTION_INPUT, {})
    s.resolveQuestion(emitted[0].requestId, { 'How should I format the output?': 'Summary' }, null)
    expect((await p).updatedInput.questions).toEqual(QUESTION_INPUT.questions)
  })

  it('never answers with behavior deny', async () => {
    // A question is not a permission. Denying it tells Claude it was refused.
    const p = s._onCanUseTool('AskUserQuestion', QUESTION_INPUT, {})
    s.resolveQuestion(emitted[0].requestId, { 'How should I format the output?': 'Summary' }, null)
    expect((await p).behavior).toBe('allow')
  })

  it('tells the client the card is resolved so it stops rendering', async () => {
    s._onCanUseTool('AskUserQuestion', QUESTION_INPUT, {})
    s.resolveQuestion(emitted[0].requestId, { x: 'y' }, null)
    expect(emitted.map(e => e.type)).toContain('stream:question-resolved')
  })
})

describe('the two flows cannot answer each other', () => {
  it('resolvePermission ignores a question request', async () => {
    const { s, emitted } = makeSession()
    const p = s._onCanUseTool('AskUserQuestion', QUESTION_INPUT, {})
    s.resolvePermission(emitted[0].requestId, 'deny', 'nope')
    // still pending — a question cannot be denied through the permission path
    expect(s.pending.size).toBe(1)
    s.resolveQuestion(emitted[0].requestId, { a: 'b' }, null)
    expect((await p).behavior).toBe('allow')
  })

  it('resolveQuestion ignores a permission request', async () => {
    const { s, emitted } = makeSession()
    s._onCanUseTool('Bash', { command: 'ls' }, {})
    s.resolveQuestion(emitted[0].requestId, { a: 'b' }, null)
    expect(s.pending.size).toBe(1)
  })
})
