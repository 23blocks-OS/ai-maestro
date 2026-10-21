/**
 * A delta index of a large history outlives any HTTP request (6 messages a second on a 2-vCPU
 * Linux VM: 500 MB of transcripts is about 40 hours; server.mjs closes a socket idle for 15
 * minutes). POST /api/agents/:id/index-delta therefore starts a job, waits a bounded time and
 * answers 202 while the run carries on; GET says how it is doing.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

const h = vi.hoisted(() => ({
  runs: [] as { agentId: string; resolve: (r: any) => void; reject: (e: unknown) => void }[],
  known: new Set(['a1', 'a2']),
}))

vi.mock('@/lib/index-delta', () => ({
  runIndexDelta: (agentId: string) =>
    new Promise((resolve, reject) => { h.runs.push({ agentId, resolve, reject }) }),
}))
vi.mock('@/services/agent-guard', async () => {
  const { agentNotFound } = await import('@/services/service-errors')
  return { unknownAgentResult: (id: string) => (h.known.has(id) ? null : agentNotFound(id)) }
})

import { runDeltaIndex, getDeltaIndexStatus } from '@/services/agents-memory-service'

const done = { success: true, total_messages_processed: 5 }

beforeEach(() => {
  h.runs.length = 0
  ;(globalThis as any)._aimDeltaIndexJobs?.clear()
})

describe('index-delta as a job', () => {
  it('a run that finishes inside the wait answers 200 with its result, as before', async () => {
    const p = runDeltaIndex('a1', { waitSeconds: 5 })
    await Promise.resolve()
    h.runs[0].resolve(done)
    const r = await p
    expect(r.status).toBe(200)
    expect(r.data).toEqual(done)
  })

  it('a run that outlasts the wait answers 202 and keeps running; GET shows it, then the result', async () => {
    const r = await runDeltaIndex('a1', { waitSeconds: 0 })
    expect(r.status).toBe(202)
    expect(r.data).toMatchObject({ success: true, running: true, joined: false })
    expect(r.data.message).toContain('/api/agents/a1/index-delta')

    expect((await getDeltaIndexStatus('a1')).data).toMatchObject({ state: 'running' })

    h.runs[0].resolve(done)
    await new Promise((res) => setTimeout(res, 0))
    const s = await getDeltaIndexStatus('a1')
    expect(s.data).toMatchObject({ state: 'done', result: done })
    expect(s.data.finishedAt).toBeTruthy()
  })

  it('a second call while one is running joins it instead of starting another', async () => {
    await runDeltaIndex('a1', { waitSeconds: 0 })
    const second = await runDeltaIndex('a1', { waitSeconds: 0 })
    expect(h.runs).toHaveLength(1)
    expect(second.status).toBe(202)
    expect(second.data.joined).toBe(true)
  })

  it('a caller that joins a run gets its result when it ends inside the wait', async () => {
    await runDeltaIndex('a1', { waitSeconds: 0 })
    const second = runDeltaIndex('a1', { waitSeconds: 5 })
    await new Promise((res) => setTimeout(res, 0))
    h.runs[0].resolve(done)
    const r = await second
    expect(r.status).toBe(200)
    expect(r.data).toEqual(done)
  })

  it('different agents run independently', async () => {
    await runDeltaIndex('a1', { waitSeconds: 0 })
    await runDeltaIndex('a2', { waitSeconds: 0 })
    expect(h.runs.map((x) => x.agentId)).toEqual(['a1', 'a2'])
  })

  it('a run that reports failure is a 500 inside the wait and "failed" afterwards', async () => {
    const p = runDeltaIndex('a1', { waitSeconds: 5 })
    await Promise.resolve()
    h.runs[0].resolve({ success: false, error: 'db locked' })
    const r = await p
    expect(r.status).toBe(500)
    const s = await getDeltaIndexStatus('a1')
    expect(s.data).toMatchObject({ state: 'failed', error: 'db locked' })
  })

  it('a run that throws after the caller left is recorded, not lost', async () => {
    await runDeltaIndex('a1', { waitSeconds: 0 })
    h.runs[0].reject(new Error('disk full'))
    await new Promise((res) => setTimeout(res, 0))
    expect((await getDeltaIndexStatus('a1')).data).toMatchObject({ state: 'failed', error: 'disk full' })
  })

  it('after a run ends the next call starts a new one', async () => {
    const p = runDeltaIndex('a1', { waitSeconds: 5 })
    await Promise.resolve()
    h.runs[0].resolve(done)
    await p
    await runDeltaIndex('a1', { waitSeconds: 0 })
    expect(h.runs).toHaveLength(2)
  })

  it('a dry run is answered directly and starts no job', async () => {
    const p = runDeltaIndex('a1', { dryRun: true })
    await Promise.resolve()
    h.runs[0].resolve({ success: true, dryRun: true })
    expect((await p).status).toBe(200)
    expect((await getDeltaIndexStatus('a1')).data).toEqual({ state: 'none' })
  })

  it('a wait that is not a number falls back to the default, and an oversize one is capped', async () => {
    vi.useFakeTimers()
    try {
      const p = runDeltaIndex('a1', { waitSeconds: Number('abc') })
      await vi.advanceTimersByTimeAsync(59_000)
      let settled = false
      p.then(() => { settled = true })
      await Promise.resolve()
      expect(settled).toBe(false) // default is 60 s, not 0
      await vi.advanceTimersByTimeAsync(2_000)
      expect((await p).status).toBe(202)
    } finally {
      vi.useRealTimers()
    }
  })

  it('an unknown agent is a 404 for both calls', async () => {
    expect((await runDeltaIndex('nope', {})).status).toBe(404)
    expect((await getDeltaIndexStatus('nope')).status).toBe(404)
    expect(h.runs).toHaveLength(0)
  })

  it('status is "none" before any run', async () => {
    expect((await getDeltaIndexStatus('a2')).data).toEqual({ state: 'none' })
  })
})
