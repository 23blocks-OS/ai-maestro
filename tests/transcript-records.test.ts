import { describe, it, expect } from 'vitest'
import { isConversationRecord, CONVERSATION_RECORD_TYPES } from '../lib/transcript-records.mjs'

describe('isConversationRecord', () => {
  it('is an allow-list of what was said', () => {
    expect([...CONVERSATION_RECORD_TYPES]).toEqual(['user', 'assistant'])
    expect(isConversationRecord({ type: 'user', message: { content: 'hi' } })).toBe(true)
    expect(isConversationRecord({ type: 'assistant', message: { content: [] } })).toBe(true)
  })
  it('refuses the bookkeeping records, including the one that looks like a chat message', () => {
    for (const type of ['api-request-blob', 'api-request', 'attachment', 'system', 'last-prompt', 'permission-mode', 'file-history-snapshot', 'ai-title', 'pr-link', 'queue-operation']) {
      expect(isConversationRecord({ type, message: { role: 'user', content: 'text' } })).toBe(false)
    }
  })
  it('refuses a type nobody has heard of yet, so a new Claude Code record is never indexed by accident', () => {
    expect(isConversationRecord({ type: 'brand-new-2.2', message: { content: 'x' } })).toBe(false)
    expect(isConversationRecord({ type: 'User' })).toBe(false)
  })
  it('refuses anything that is not a record', () => {
    for (const v of [null, undefined, 'user', 5, [], {}, { type: 5 }, { type: null }, { message: { role: 'user' } }]) {
      expect(isConversationRecord(v)).toBe(false)
    }
  })
})
