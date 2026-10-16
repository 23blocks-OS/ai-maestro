import { describe, it, expect } from 'vitest'

// Reported 2026-10-15: a message typed in the chat showed again under the agent's name, and raw
// "<total_tokens>...</total_tokens>" text showed up as agent messages. Claude Code writes
// 'api-request-blob' lines with a role and content (a copy of what it sent to the model); the chat
// drew every line that had a message payload as an agent bubble.

const line = (o: unknown) => JSON.stringify(o)

describe('bookkeeping lines are not conversation', () => {
  it('drops an api-request-blob that copies the user\'s message', async () => {
    const { parseJsonlLines } = await import('@/lib/chat-transcript.mjs')
    const out = parseJsonlLines([
      line({ type: 'api-request-blob', sessionId: 's', hash: 'h', message: { role: 'user', content: 'show me the card to add the token' } }),
      line({ type: 'user', uuid: 'u1', message: { role: 'user', content: 'show me the card to add the token' } }),
    ], 100)
    expect(out.map((m: any) => m.type)).toEqual(['user'])
  })

  it('drops system-role blobs, so the reminders never show as text', async () => {
    const { parseJsonlLines } = await import('@/lib/chat-transcript.mjs')
    const out = parseJsonlLines([
      line({ type: 'api-request-blob', message: { role: 'system', content: [{ type: 'text', text: '<total_tokens>1 tokens left</total_tokens>' }] } }),
      line({ type: 'api-request-shape', message: { role: 'user', content: 'x' } }),
    ], 100)
    expect(JSON.stringify(out)).not.toContain('total_tokens')
    expect(out).toHaveLength(0)
  })

  it('keeps real user and assistant lines, including tool use', async () => {
    const { parseJsonlLines } = await import('@/lib/chat-transcript.mjs')
    const out = parseJsonlLines([
      line({ type: 'user', uuid: 'u1', message: { role: 'user', content: 'hi' } }),
      line({ type: 'assistant', uuid: 'a1', message: { role: 'assistant', content: [{ type: 'text', text: 'hello' }, { type: 'tool_use', id: 't', name: 'Bash', input: {} }] } }),
    ], 100)
    expect(out.map((m: any) => m.type)).toEqual(['user', 'assistant'])
  })

  it('keeps summaries and queued messages', async () => {
    const { parseJsonlLines } = await import('@/lib/chat-transcript.mjs')
    const out = parseJsonlLines([
      line({ type: 'summary', summary: 'Compacted' }),
      line({ type: 'queue-operation', operation: 'enqueue', content: 'later' }),
    ], 100)
    expect(out.map((m: any) => m.type)).toEqual(['summary', 'queue-operation'])
  })
})
