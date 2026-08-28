/**
 * Tests for lib/memory/sweep.ts.
 *
 * Maintenance used to run only from an Agent object's timer, and Agent objects
 * live in a 10-slot LRU. With 125 agents that meant an agent was indexed only
 * if something happened to load it, and loading the 11th evicted the 1st along
 * with its timers. Measured: 8 of 125 databases written in 7 days.
 *
 * The sweep exists so indexing depends on an agent id and a file on disk, not
 * on which ten agents happen to be resident.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockFs, mockRunner } = vi.hoisted(() => ({
  mockFs: {
    readdirSync: vi.fn(() => [] as string[]),
    existsSync: vi.fn(() => true),
    readFileSync: vi.fn((_p?: any) => '{}'),
    writeFileSync: vi.fn(),
  },
  // The sweep runs each agent's OWN schedule (v0.37.0) rather than calling
  // index-delta directly, so the runner is the boundary to mock.
  mockRunner: { runDueTasks: vi.fn() },
}))

vi.mock('fs', () => ({ default: mockFs, ...mockFs }))
vi.mock('@/lib/agent-schedule-runner', () => mockRunner)

import { sweepAgentMemory, listIndexableAgents } from '@/lib/memory/sweep'

beforeEach(() => {
  vi.clearAllMocks()
  mockFs.existsSync.mockReturnValue(true)
  mockFs.readFileSync.mockReturnValue('{}')
  mockRunner.runDueTasks.mockImplementation(async (agentId: string) => ({
    agentId,
    ran: [{ taskId: 'memory-index', action: 'index', ok: true, detail: '3 messages', ms: 1 }],
    skipped: 0,
  }))
})

describe('listIndexableAgents', () => {
  it('lists agent dirs that have a database', () => {
    mockFs.readdirSync.mockReturnValue(['a', 'b', 'c'])
    expect(listIndexableAgents()).toEqual(['a', 'b', 'c'])
  })

  it('returns empty rather than throwing when the dir is missing', () => {
    mockFs.readdirSync.mockImplementation(() => { throw new Error('ENOENT') })
    expect(listIndexableAgents()).toEqual([])
  })
})

describe('sweepAgentMemory', () => {
  it('indexes every agent — not just the ten a registry could hold', async () => {
    mockFs.readdirSync.mockReturnValue(Array.from({ length: 125 }, (_, i) => `agent-${i}`))

    const r = await sweepAgentMemory()

    expect(r.scanned).toBe(125)
    expect(r.indexed).toBe(125)
    expect(mockRunner.runDueTasks).toHaveBeenCalledTimes(125)
  })

  it('indexes by agent id, never hydrating an Agent object', async () => {
    mockFs.readdirSync.mockReturnValue(['agent-1'])
    await sweepAgentMemory()
    expect(mockRunner.runDueTasks).toHaveBeenCalledWith('agent-1')
  })

  it('counts a returned {success:false} as failed, not indexed', async () => {
    // runIndexDelta reports failure by RETURNING, not throwing. Catching only
    // exceptions counted broken runs as successes — how a host with a
    // misconfigured embedding provider reported "17 indexed, 0 failed,
    // 0 messages" for months.
    mockFs.readdirSync.mockReturnValue(['broken'])
    mockRunner.runDueTasks.mockResolvedValue({
      agentId: 'broken',
      ran: [{
        taskId: 'memory-index', action: 'index', ok: false,
        detail: 'executionProviders[0] is unsupported: cuda', ms: 1,
      }],
      skipped: 0,
    })

    const r = await sweepAgentMemory()

    expect(r.indexed).toBe(0)
    expect(r.failed).toBe(1)
    expect(r.agents[0].error).toMatch(/cuda/)
  })

  it('keeps going when one agent fails', async () => {
    mockFs.readdirSync.mockReturnValue(['good-1', 'bad', 'good-2'])
    mockRunner.runDueTasks.mockImplementation(async (id: string) => {
      if (id === 'bad') throw new Error('corrupt database')
      return {
        agentId: id,
        ran: [{ taskId: 'memory-index', action: 'index', ok: true, detail: '1 messages', ms: 1 }],
        skipped: 0,
      }
    })

    const r = await sweepAgentMemory()

    // One broken database must not strand the other 124.
    expect(r.indexed).toBe(2)
    expect(r.failed).toBe(1)
    expect(r.agents.find((a) => a.agentId === 'bad')?.error).toMatch(/corrupt/)
  })

  it('honours a limit so a sweep stays bounded on a big host', async () => {
    mockFs.readdirSync.mockReturnValue(Array.from({ length: 50 }, (_, i) => `a${i}`))
    const r = await sweepAgentMemory({ limit: 5 })
    expect(r.scanned).toBe(5)
    expect(mockRunner.runDueTasks).toHaveBeenCalledTimes(5)
  })

  it('processes only the requested agents when told to', async () => {
    const r = await sweepAgentMemory({ only: ['x', 'y'] })
    expect(r.scanned).toBe(2)
    expect(mockRunner.runDueTasks).toHaveBeenCalledWith('x')
    expect(mockRunner.runDueTasks).toHaveBeenCalledWith('y')
  })

  it('skips agents swept more recently than minAgeMs', async () => {
    mockFs.readdirSync.mockReturnValue(['recent', 'stale'])
    mockFs.readFileSync.mockImplementation((p: any) =>
      String(p).includes('recent')
        ? JSON.stringify({ at: Date.now() })
        : JSON.stringify({ at: Date.now() - 86_400_000 })
    )

    const r = await sweepAgentMemory({ minAgeMs: 3_600_000 })

    expect(r.scanned).toBe(1)
    expect(mockRunner.runDueTasks).toHaveBeenCalledWith('stale')
  })

  it('totals the work done', async () => {
    mockFs.readdirSync.mockReturnValue(['a', 'b'])
    const r = await sweepAgentMemory()
    expect(r.messagesProcessed).toBe(6)
  })
})
