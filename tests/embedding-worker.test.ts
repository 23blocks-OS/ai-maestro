import { afterEach, describe, expect, it } from 'vitest'
import path from 'node:path'
import { EmbeddingClient } from '../lib/rag/embedding-client.mjs'
import { parseFootprint } from '../lib/process-footprint.mjs'

const clients: EmbeddingClient[] = []
const fixture = path.join(process.cwd(), 'tests/fixtures/embedding-worker.mjs')
function client(options = {}) {
  const c = new EmbeddingClient({ workerPath: fixture, ...options })
  clients.push(c)
  return c
}
async function until(predicate: () => boolean) {
  const deadline = Date.now() + 3000
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('Worker did not exit')
    await new Promise(resolve => setTimeout(resolve, 10))
  }
}
afterEach(async () => {
  for (const c of clients.splice(0)) { c.close(); await until(() => c.child === null) }
})

describe('isolated embedding queue', () => {
  it('caps batches at two, serializes concurrent callers, and preserves order', async () => {
    const c = client()
    const [a, b] = await Promise.all([c.embedTexts(['a', 'bb', 'ccc', 'dddd', 'eeeee']), c.embedTexts(['xxxxxx'])])
    expect(a.map(v => v[0])).toEqual([1, 2, 3, 4, 5])
    expect(b[0][0]).toBe(6)
    expect(a.every(v => v instanceof Float32Array && v.length === 384)).toBe(true)
    expect(c.bytes).toBe(0)
  })
  it('recycles before the next batch without overlapping worker lifetimes', async () => {
    const c = client({ workerEnv: { TEST_MAX_BATCHES: '1' } })
    const vectors = await c.embedTexts(['a', 'b', 'c', 'd'])
    expect(vectors[0][1]).not.toBe(vectors[2][1])
    expect(() => process.kill(vectors[0][1], 0)).toThrow()
  })
  it('rejects failed inference and recovers queued work', async () => {
    const c = client()
    const bad = expect(c.embedTexts(['FAIL'])).rejects.toThrow('Inference failed')
    const good = c.embedTexts(['good'])
    await bad
    expect((await good)[0][0]).toBe(4)
  })
  it('recovers from worker crashes and kills hung workers', async () => {
    const c = client({ timeoutMs: 500 })
    await expect(c.embedTexts(['CRASH'])).rejects.toThrow('Embedding worker exited')
    await expect(c.embedTexts(['HANG'])).rejects.toThrow('timed out')
    expect((await c.embedTexts(['ok']))[0][0]).toBe(2)
  })
  it('bounds queue count and bytes and rejects work after shutdown', async () => {
    const c = client({ maxPending: 1, maxPendingBytes: 8 })
    const first = c.embedTexts(['a'])
    await expect(c.embedTexts(['b'])).rejects.toThrow('queue is full')
    await first
    await expect(c.embedTexts(['123456789'])).rejects.toThrow('queue is full')
    c.close()
    await expect(c.embedTexts(['a'])).rejects.toThrow('closed')
  })
  it('exits when idle and starts a fresh worker on demand', async () => {
    const c = client({ idleMs: 20 })
    const first = (await c.embedTexts(['a']))[0][1]
    await until(() => c.child === null)
    expect((await c.embedTexts(['a']))[0][1]).not.toBe(first)
  })
})

it('parses physical footprint without confusing peak or virtual memory', () => {
  expect(parseFootprint('Physical footprint:         6.8G\nPhysical footprint (peak):  7.1G')).toBe(6.8 * 1024 ** 3)
  expect(parseFootprint('Physical footprint: 274.1M\n')).toBe(274.1 * 1024 ** 2)
  expect(() => parseFootprint('RSS: 0')).toThrow()
})
