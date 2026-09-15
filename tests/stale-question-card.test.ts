/**
 * Tests for parseJsonlLines' tool-result markers — the "that questions panel is
 * back" bug (15 September 2026).
 *
 * WHAT HAPPENED
 *
 * An agent asked a six-option question. It was answered. The conversation ran on
 * for another 124 transcript lines. Then the person reloaded the dashboard and
 * the question card reappeared as a live, actionable prompt — apparently blocking
 * the chat.
 *
 * THE CHAIN
 *
 *   parseJsonlLines dropped every tool-result message:
 *       if (message.type === 'user' && message.toolUseResult) continue
 *
 *   ChatView decided a question was answered by searching those same messages
 *   for a matching tool_result — something the parser had already deleted. That
 *   branch could never return true.
 *
 *   So the only working record of "answered" was a useState Set, which dies with
 *   the page. Reload ⇒ every AskUserQuestion in the window is live again, no
 *   matter how old.
 *
 * Verified against the real transcript before the fix: the question at line 239
 * of 363 DID have a matching tool_result on disk. The data was right; the UI
 * could not see it.
 */

import { describe, it, expect } from 'vitest'
import { parseJsonlLines } from '@/lib/chat-transcript.mjs'

const ASK_ID = 'toolu_01ECDkHuGa7mHU7HhLZP3hGx'

const askLine = (id = ASK_ID) => JSON.stringify({
  type: 'assistant',
  timestamp: '2026-09-15T10:00:00Z',
  message: { content: [{ type: 'tool_use', id, name: 'AskUserQuestion', input: { questions: [] } }] },
})

const answerLine = (id = ASK_ID) => JSON.stringify({
  type: 'user',
  timestamp: '2026-09-15T10:00:05Z',
  toolUseResult: { ok: true },
  message: { content: [{ type: 'tool_result', tool_use_id: id, content: 'Option 5' }] },
})

const chat = (text: string) => JSON.stringify({
  type: 'assistant',
  timestamp: '2026-09-15T10:01:00Z',
  message: { content: [{ type: 'text', text }] },
})

const markersFor = (msgs: any[]) =>
  msgs.filter(m => m.type === 'tool_result_marker').map(m => m.tool_use_id)

describe('an answered question stays answered across a reload', () => {
  it('emits a marker for the tool call that has a result', () => {
    const msgs = parseJsonlLines([askLine(), answerLine()], 100)
    expect(markersFor(msgs)).toContain(ASK_ID)
  })

  it('emits nothing for a question that was never answered', () => {
    const msgs = parseJsonlLines([askLine()], 100)
    expect(markersFor(msgs)).toHaveLength(0)
  })

  it('survives the conversation moving far past the question', () => {
    // The reported shape: answered, then 124 more lines of conversation.
    const lines = [askLine(), answerLine(), ...Array.from({ length: 124 }, (_, i) => chat(`line ${i}`))]
    const msgs = parseJsonlLines(lines, 500)
    expect(markersFor(msgs)).toContain(ASK_ID)
  })

  it('keeps the marker even when the raw result payload is discarded', () => {
    // The payload is tool output, not conversation — it should NOT be rendered.
    const msgs = parseJsonlLines([askLine(), answerLine()], 100)
    const leaked = msgs.some(m => m.type === 'user' && (m as any).toolUseResult)
    expect(leaked).toBe(false)
    expect(markersFor(msgs)).toContain(ASK_ID)
  })

  it('distinguishes two different questions', () => {
    const other = 'toolu_OTHER'
    const msgs = parseJsonlLines([askLine(), askLine(other), answerLine(other)], 100)
    const ids = markersFor(msgs)
    expect(ids).toContain(other)
    expect(ids).not.toContain(ASK_ID)
  })

  it('handles several results in one message', () => {
    const multi = JSON.stringify({
      type: 'user',
      toolUseResult: { ok: true },
      message: { content: [
        { type: 'tool_result', tool_use_id: 'a' },
        { type: 'tool_result', tool_use_id: 'b' },
      ] },
    })
    expect(markersFor(parseJsonlLines([multi], 100))).toEqual(['a', 'b'])
  })
})

describe('the parser still behaves', () => {
  it('does not choke on a result message with no content array', () => {
    const odd = JSON.stringify({ type: 'user', toolUseResult: 'plain string', message: {} })
    expect(() => parseJsonlLines([odd], 100)).not.toThrow()
    expect(markersFor(parseJsonlLines([odd], 100))).toHaveLength(0)
  })

  it('still keeps ordinary conversation', () => {
    const msgs = parseJsonlLines([chat('hello'), answerLine(), chat('world')], 100)
    const texts = msgs.filter(m => m.type === 'assistant')
    expect(texts).toHaveLength(2)
  })

  it('skips malformed lines without losing the rest', () => {
    const msgs = parseJsonlLines(['{not json', askLine(), answerLine()], 100)
    expect(markersFor(msgs)).toContain(ASK_ID)
  })
})
