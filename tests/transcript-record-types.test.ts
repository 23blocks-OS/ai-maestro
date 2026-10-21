import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// Real CozoDB in a scratch HOME; only the embedding model is faked.
vi.mock('@/lib/rag/embeddings', () => ({
  embedTexts: vi.fn(async (texts: string[]) => texts.map(() => new Float32Array(384))),
  vectorToBuffer: (v: Float32Array) => Buffer.from(v.buffer),
}))

const MARK = 'ZZ-SYSTEM-PROMPT-MARKER'
const line = (o: unknown) => JSON.stringify(o)
export const transcript = [
  line({ type: 'user', timestamp: '2026-10-21T10:00:00Z', message: { role: 'user', content: 'How do I rotate the signing key?' } }),
  // Claude Code 2.1.300+: the request's own system prompt / history, in the shape of a chat message
  line({ type: 'api-request-blob', sessionId: 's1', hash: 'h1', message: { role: 'system', content: [{ type: 'text', text: `You are Claude Code. ${MARK} gitStatus: main` }] } }),
  line({ type: 'api-request-blob', sessionId: 's1', hash: 'h2', message: { role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'Bash', input: { description: `${MARK} tool call`, command: 'git commit -m x' } }] } }),
  line({ type: 'assistant', timestamp: '2026-10-21T10:00:05Z', message: { role: 'assistant', content: [{ type: 'text', text: 'Use the key rotation runbook, then restart the signer.' }] } }),
  line({ type: 'attachment', timestamp: '2026-10-21T10:00:06Z', attachment: { type: 'queued_command', prompt: 'x' }, message: { content: `${MARK} attachment` } }),
  line({ type: 'brand-new-record-type', message: { content: `${MARK} from a future version` } }),
  line({ type: 'last-prompt', lastPrompt: 'x' }),
  line({ type: 'user', timestamp: '2026-10-21T10:01:00Z', message: { role: 'user', content: 'Thanks, that worked.' } }),
].join('\n')

let home: string
let prevHome: string | undefined
let file: string
beforeAll(() => {
  prevHome = process.env.HOME
  home = mkdtempSync(path.join(os.tmpdir(), 'maestro-rectype-'))
  process.env.HOME = home
  file = path.join(home, 'session.jsonl')
  writeFileSync(file, transcript)
})
afterAll(() => { process.env.HOME = prevHome; rmSync(home, { recursive: true, force: true }) })

it('indexes only what the person and the agent said (real CozoDB)', async () => {
  const { createAgentDatabase } = await import('../lib/cozo-db')
  const { ingestConversation } = await import('../lib/rag/ingest')
  const db = await createAgentDatabase({ agentId: 'rectype-agent' })
  try {
    const stats = await ingestConversation(db, file)
    const rows = (await db.run('?[role, text] := *messages{role, text}')).rows as [string, string][]
    console.log('INDEXED ROWS:', JSON.stringify(rows.map(r => [r[0], r[1].slice(0, 50)])))
    expect(rows.map(r => r[0]).sort()).toEqual(['assistant', 'user', 'user'])
    expect(rows.some(r => r[1].includes(MARK))).toBe(false)
    // the line count (the saved offset) is every nonblank line, as before
    expect(stats.totalMessages).toBe(8)
    expect(stats.processedMessages).toBe(3)
    const terms = (await db.run('?[term] := *msg_terms{term}')).rows.flat() as string[]
    expect(terms.some(t => t.toLowerCase().includes('zz-system') || t === 'marker')).toBe(false)
  } finally { await db.close() }
})

describe('every reader agrees on what is conversation', () => {
  it('parseConversationLine yields nothing for a blob and still maps Claude and Copilot lines', async () => {
    const { parseConversationLine } = await import('../lib/rag/ingest')
    const blob = line({ type: 'api-request-blob', message: { role: 'system', content: [{ type: 'text', text: MARK }] } })
    expect(parseConversationLine(blob)).toEqual([])
    expect(parseConversationLine(line({ type: 'attachment', message: { content: MARK } }))).toEqual([])
    expect(parseConversationLine(line({ type: 'user', message: { content: 'hello' } }))).toHaveLength(1)
    const copilot = line({ type: 'user.message', id: 'e1', timestamp: '2026-10-21T10:00:00Z', data: { content: 'hi from copilot' } })
    expect(parseConversationLine(copilot).length).toBeGreaterThan(0)
  })

  it('consolidation input (messagesFromTranscript) has only user and assistant text', async () => {
    const { messagesFromTranscript } = await import('../services/agents-memory-service')
    const messages = await messagesFromTranscript(file)
    expect(messages.map(m => m.role)).toEqual(['user', 'assistant', 'user'])
    expect(messages.some(m => m.content.includes(MARK))).toBe(false)
  })

  it('metadata: the first user message and the line count are those of the file, blobs or not', async () => {
    const { extractConversationMetadata } = await import('../lib/index-delta')
    const meta = await extractConversationMetadata(file, '/work/app')
    expect(meta.firstUserMessage).toBe('How do I rotate the signing key?')
    // The count is of nonblank lines on purpose: saved offsets (last_indexed_message_count) use the same
    expect(meta.messageCount).toBe(8)
  })

  it('the delta indexer keeps its line offsets: lines 1-4 are done, the rest is read from line 5', async () => {
    const { createAgentDatabase } = await import('../lib/cozo-db')
    const { indexConversationDelta } = await import('../lib/rag/ingest')
    const db = await createAgentDatabase({ agentId: 'rectype-delta' })
    try {
      const r = await indexConversationDelta(db, file, 4)
      expect(r.totalMessages).toBe(8)
      expect(r.processedMessages).toBe(1) // line 8; lines 5-7 are an attachment, a future record and last-prompt
      const rows = (await db.run('?[role, text] := *messages{role, text}')).rows as [string, string][]
      expect(rows).toEqual([['user', 'Thanks, that worked.']])
    } finally { await db.close() }
  })

  it('the chat view skips the bookkeeping records (already so; now through the shared predicate)', async () => {
    const { parseJsonlLines } = await import('../lib/chat-transcript.mjs')
    const out = parseJsonlLines(transcript.split('\n'))
    const texts = JSON.stringify(out)
    expect(texts).not.toContain(MARK)
    expect(texts).toContain('rotate the signing key')
  })

  it('the commit trace does not read a replayed call or result from a blob', async () => {
    const { scanTranscript } = await import('../lib/commit-trace')
    const blobCall = line({ type: 'api-request-blob', sessionId: 's1', hash: 'h', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'b1', name: 'Bash', input: { command: 'git commit -m "fix: replayed"' } }] } })
    const blobResult = line({ type: 'api-request-blob', sessionId: 's1', hash: 'h2', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'b1', content: '[main 1a2b3c4] fix: replayed\n 1 file changed' }] } })
    expect(scanTranscript([blobCall, blobResult], { sessionId: 's1' }).commits).toEqual([])
    // and the real pair still counts
    const call = line({ type: 'assistant', timestamp: '2026-10-21T10:00:00.000Z', cwd: '/work/app', message: { content: [{ type: 'tool_use', id: 'c1', name: 'Bash', input: { command: 'git commit -m "fix: real"' } }] } })
    const res = line({ type: 'user', timestamp: '2026-10-21T10:00:05.000Z', message: { content: [{ type: 'tool_result', tool_use_id: 'c1', content: '[main 9f8e7d6] fix: real\n 1 file changed' }] } })
    expect(scanTranscript([call, res], { sessionId: 's1' }).commits.map(c => c.sha)).toEqual(['9f8e7d6'])
  })
})
