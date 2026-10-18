/**
 * Consolidation reads transcripts through messagesFromTranscript. A Copilot events.jsonl has
 * dotted event types, so before #627 every line was skipped and a Copilot agent had nothing to
 * consolidate. Real Copilot 1.0.97 fixtures (tests/fixtures/copilot).
 */

import { describe, it, expect } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { messagesFromTranscript } from '@/services/agents-memory-service'

const fixture = (name: string) => path.join(__dirname, 'fixtures', 'copilot', name)

describe('messagesFromTranscript', () => {
  it('reads a Copilot session as user and assistant text', async () => {
    const messages = await messagesFromTranscript(fixture('events-conversation.jsonl'))
    expect(messages.length).toBeGreaterThan(0)
    expect(messages[0]).toMatchObject({ role: 'user', content: 'first question' })
    expect(messages.every(m => m.role === 'user' || m.role === 'assistant')).toBe(true)
    expect(messages.every(m => m.content.trim().length > 0)).toBe(true)
  })

  it('reasoning and tool results are not part of the text', async () => {
    for (const m of await messagesFromTranscript(fixture('events-thinking.jsonl'))) {
      expect(m.content).not.toMatch(/^\s*$/)
    }
  })

  it('a Claude transcript reads as it always did', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aim-claude-transcript-'))
    const file = path.join(dir, 's.jsonl')
    fs.writeFileSync(file, [
      { type: 'user', timestamp: '2026-10-14T14:00:00Z', message: { content: 'hi there' } },
      { type: 'assistant', timestamp: '2026-10-14T14:00:05Z', message: { content: [{ type: 'text', text: 'hello' }, { type: 'tool_use', name: 'Bash', input: {} }] } },
      { type: 'summary', summary: 'ignored' },
    ].map(l => JSON.stringify(l)).join('\n') + '\n{garbled')
    const messages = await messagesFromTranscript(file)
    fs.rmSync(dir, { recursive: true, force: true })
    expect(messages).toEqual([
      { role: 'user', content: 'hi there', timestamp: Date.parse('2026-10-14T14:00:00Z'), tool_use: false },
      { role: 'assistant', content: 'hello', timestamp: Date.parse('2026-10-14T14:00:05Z'), tool_use: true },
    ])
  })
})
