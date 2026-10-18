import { afterEach, expect, it, vi } from 'vitest'
import { mkdtempSync, writeFileSync, appendFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

vi.mock('@/lib/cozo-db', () => ({}))
vi.mock('@/lib/cozo-schema-rag', () => ({ upsertMessage: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/rag/embeddings', () => ({
  embedTexts: vi.fn(async (texts: string[]) => texts.map(() => new Float32Array(384))),
  vectorToBuffer: (v: Float32Array) => Buffer.from(v.buffer),
}))
import { readJsonlLines, summarizeJsonl, readJsonlHeadSync } from '../lib/jsonl'
import { indexConversationDelta, ingestConversation } from '../lib/rag/ingest'
import { upsertMessage } from '../lib/cozo-schema-rag'
import { embedTexts } from '../lib/rag/embeddings'
const dirs: string[] = []
function file(content: string) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'maestro-jsonl-')); dirs.push(dir)
  const f = path.join(dir, 'history.jsonl'); writeFileSync(f, content); return f
}
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true }); vi.clearAllMocks() })
const msg = (text: string) => JSON.stringify({ type: 'user', timestamp: '2026-10-07T00:00:00Z', message: { content: text } })

it('streams UTF-8 across chunk boundaries, blanks, CRLF and an unterminated final line', async () => {
  const big = msg('é'.repeat(40_000))
  const f = file(`\n${big}\r\n \nmalformed\n${msg('last')}`)
  const lines: string[] = []
  for await (const line of readJsonlLines(f)) lines.push(line)
  expect(lines).toEqual([big, 'malformed', msg('last')])
  expect(readJsonlHeadSync(f, 1)).toEqual([big])
  expect(await summarizeJsonl(f, 1, 1)).toEqual({ head: [big], tail: [msg('last')], messageCount: 3 })
})
it('indexes only the delta using nonblank line offsets and bounded batches', async () => {
  const f = file([msg('old'), '', 'malformed', msg('a'), msg('b'), msg('c'), msg('d'), msg('e')].join('\n'))
  const result = await indexConversationDelta({} as any, f, 2, { batchSize: 100 })
  expect(result.totalMessages).toBe(7)
  expect(result.processedMessages).toBe(5)
  expect(vi.mocked(embedTexts).mock.calls.map(c => c[0])).toEqual([['a', 'b'], ['c', 'd'], ['e']])
  expect(vi.mocked(upsertMessage).mock.calls.map(c => c[1].text)).toEqual(['a', 'b', 'c', 'd', 'e'])
})
it('counts malformed and empty-content lines without indexing them and preserves progress totals', async () => {
  const f = file([msg('a'), 'broken', msg(''), msg('b'), msg('c')].join('\n'))
  const progress = vi.fn()
  const result = await ingestConversation({} as any, f, { onProgress: progress })
  expect(result).toMatchObject({ totalMessages: 5, processedMessages: 3, skippedMessages: 2, embeddingsGenerated: 3 })
  expect(progress.mock.calls).toEqual([[1, 5], [4, 5], [5, 5]])
})
it('does not embed unchanged history and propagates failed batches for retry', async () => {
  const f = file(msg('a'))
  expect((await indexConversationDelta({} as any, f, 1)).processedMessages).toBe(0)
  expect(embedTexts).not.toHaveBeenCalled()
  vi.mocked(embedTexts).mockRejectedValueOnce(new Error('Worker failed'))
  await expect(indexConversationDelta({} as any, f, 0)).rejects.toThrow('Worker failed')
  expect(upsertMessage).not.toHaveBeenCalled()
})

it('leaves concurrent appends for the next delta instead of skipping them', async () => {
  const f = file([msg('a'), msg('b')].join('\n'))
  vi.mocked(embedTexts).mockImplementationOnce(async texts => {
    appendFileSync(f, '\n' + msg('new'))
    return texts.map(() => new Float32Array(384))
  })
  const first = await indexConversationDelta({} as any, f, 0)
  expect(first.totalMessages).toBe(2)
  const next = await indexConversationDelta({} as any, f, first.totalMessages)
  expect(next.totalMessages).toBe(3)
  expect(next.processedMessages).toBe(1)
  expect(vi.mocked(upsertMessage).mock.calls.map(c => c[1].text)).toEqual(['a', 'b', 'new'])
})
