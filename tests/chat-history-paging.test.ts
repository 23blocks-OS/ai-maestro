import { describe, it, expect } from 'vitest'
import { isConversationMessage, pageOfMessages } from '@/lib/chat-transcript.mjs'
import { mergeHistory, prependPage } from '@/lib/chat-history-paging'

type M = { uuid: string; type: string; message?: { content: unknown } }
const say = (n: number): M => ({ uuid: `m${n}`, type: n % 2 ? 'assistant' : 'user', message: { content: [{ type: 'text', text: `text ${n}` }] } })
const tool = (n: number): M => ({ uuid: `t${n}`, type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash' }] } })
const result = (n: number): M => ({ uuid: `r${n}`, type: 'user', message: { content: [{ type: 'tool_result', content: 'ok' }] } })
const key = (m: M) => m.uuid

describe('isConversationMessage', () => {
  it('counts user and assistant text, not tool calls, results or thinking', () => {
    expect(isConversationMessage(say(1))).toBe(true)
    expect(isConversationMessage({ type: 'user', message: { content: 'hello' } })).toBe(true)
    expect(isConversationMessage(tool(1))).toBe(false)
    expect(isConversationMessage(result(1))).toBe(false)
    expect(isConversationMessage({ type: 'thinking', thinking: 'hm' })).toBe(false)
    expect(isConversationMessage({ type: 'user', message: { content: '   ' } })).toBe(false)
  })
})

describe('pageOfMessages', () => {
  // 100 turns: a message, then 20 tool calls and results. A 200-entry window held under 10 messages.
  const all: M[] = []
  for (let n = 0; n < 100; n++) {
    all.push(say(n))
    for (let k = 0; k < 10; k++) { all.push(tool(n * 10 + k)); all.push(result(n * 10 + k)) }
  }

  it('fills a page with conversation messages, whatever the tool calls in between', () => {
    const page = pageOfMessages(all, { visible: 40 })
    expect(page.messages.filter(isConversationMessage)).toHaveLength(40)
    expect(page.messages[page.messages.length - 1]).toBe(all[all.length - 1])
    expect(page.hasMore).toBe(true)
  })

  it('pages back to the start, without gaps or overlaps', () => {
    const seen: M[] = []
    let end = all.length
    for (;;) {
      const page = pageOfMessages(all, { end, visible: 30 })
      seen.unshift(...page.messages)
      if (!page.hasMore) break
      end = page.start
    }
    expect(seen).toEqual(all)
  })

  it('stops at maxEntries when a turn is all tool calls', () => {
    const tools = Array.from({ length: 5000 }, (_, i) => tool(i))
    const page = pageOfMessages(tools, { maxEntries: 1500 })
    expect(page.messages).toHaveLength(1500)
    expect(page.start).toBe(3500)
  })
})

describe('mergeHistory and prependPage', () => {
  const all = Array.from({ length: 10 }, (_, i) => say(i))

  it('a server without paging (no historyStart) offers nothing older', () => {
    const r = mergeHistory([], null, { messages: all.slice(5) }, key)
    expect(r).toEqual({ messages: all.slice(5), cursor: null, hasMore: false })
  })

  it('prepends an older page and moves the cursor', () => {
    const first = mergeHistory([], null, { messages: all.slice(6), conversationFile: 'a', historyStart: 6, hasMore: true }, key)
    const r = prependPage(first.messages, first.cursor, { messages: all.slice(3, 6), conversationFile: 'a', start: 3, before: 6, hasMore: true }, key)
    expect(r.messages).toEqual(all.slice(3))
    expect(r.cursor).toEqual({ file: 'a', start: 3 })
    expect(r.hasMore).toBe(true)
  })

  it('ignores a page for another conversation or an old cursor', () => {
    const cursor = { file: 'a', start: 6 }
    const prev = all.slice(6)
    expect(prependPage(prev, cursor, { messages: all.slice(3, 6), conversationFile: 'b', start: 3, before: 6 }, key).messages).toBe(prev)
    expect(prependPage(prev, cursor, { messages: all.slice(0, 3), conversationFile: 'a', start: 0, before: 3 }, key).messages).toBe(prev)
  })

  it('keeps the loaded older pages when the history is pushed again', () => {
    // Loaded from 3; the conversation grew to 12 and the server now pages from 8
    const grown = [...all, say(10), say(11)]
    const prev = all.slice(3)
    const r = mergeHistory(prev, { file: 'a', start: 3 }, { messages: grown.slice(8), conversationFile: 'a', historyStart: 8, hasMore: true }, key)
    expect(r.messages).toEqual(grown.slice(3))
    expect(r.cursor).toEqual({ file: 'a', start: 3 })
  })

  it('starts over on a new conversation', () => {
    const r = mergeHistory(all.slice(3), { file: 'a', start: 3 }, { messages: [say(50)], conversationFile: 'b', historyStart: 0, hasMore: false }, key)
    expect(r.messages).toEqual([say(50)])
    expect(r.cursor).toEqual({ file: 'b', start: 0 })
  })

  it('a failed page keeps the list and offers to try again', () => {
    const r = prependPage(all.slice(6), { file: 'a', start: 6 }, { failed: true }, key)
    expect(r.failed).toBe(true)
    expect(r.hasMore).toBe(true)
  })
})
