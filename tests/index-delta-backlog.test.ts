/**
 * The delta-index backlog of 2026-10-29: every trigger queued another full run for the same agent,
 * the queue grew from 20 to 56 in four hours, and every waiting agent kept its database open.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { pins, gates } = vi.hoisted(() => ({ pins: [] as string[], gates: new Map<string, () => void>() }))

vi.mock('@/lib/agent', () => ({
  agentRegistry: {
    // Records the pin, then waits until the test opens this agent's gate
    withAgent: async (id: string, fn: () => Promise<unknown>) => {
      pins.push(id)
      await new Promise<void>(open => gates.set(id, open))
      return fn()
    },
    // The run itself fails fast and is reported as success:false (no database in a test)
    getAgent: async () => { throw new Error('no database in tests') },
  },
}))
vi.mock('@/lib/cozo-db', () => ({ AgentDatabase: class {} }))
vi.mock('@/lib/cozo-schema-simple', () => ({}))
vi.mock('@/lib/rag/ingest', () => ({}))
vi.mock('@/lib/agent-registry', () => ({ getAgent: () => null, getAgentBySession: () => null, updateAgentWorkingDirectory: () => {}, listAgents: () => [] }))
vi.mock('@/lib/transcript-copilot.mjs', () => ({}))

const { runIndexDelta } = await import('@/lib/index-delta')
const flush = () => new Promise(r => setTimeout(r, 0))
const open = async (id: string) => { await flush(); gates.get(id)?.(); gates.delete(id); await flush() }

beforeEach(() => {
  pins.length = 0
  gates.clear()
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('delta-index throttle', () => {
  it('only the agent holding the slot is pinned; waiting agents do not open their database', async () => {
    const a = runIndexDelta('agent-aaaaaaaa')
    const b = runIndexDelta('agent-bbbbbbbb')
    const c = runIndexDelta('agent-cccccccc')
    await flush()
    expect(pins).toEqual(['agent-aaaaaaaa'])
    await open('agent-aaaaaaaa')
    expect(pins).toEqual(['agent-aaaaaaaa', 'agent-bbbbbbbb'])
    await open('agent-bbbbbbbb')
    await open('agent-cccccccc')
    await Promise.all([a, b, c])
    expect(pins).toEqual(['agent-aaaaaaaa', 'agent-bbbbbbbb', 'agent-cccccccc'])
  })

  it('triggers for an agent that is already waiting join that run instead of queueing more', async () => {
    const hold = runIndexDelta('agent-holder01')
    await flush()
    const runs = Array.from({ length: 20 }, () => runIndexDelta('agent-repeat01'))
    expect(new Set(runs).size).toBe(1)
    await open('agent-holder01')
    await open('agent-repeat01')
    await Promise.all([hold, ...runs])
    expect(pins.filter(p => p === 'agent-repeat01')).toHaveLength(1)
  })

  it('a trigger while the agent is running queues exactly one follow-up', async () => {
    const first = runIndexDelta('agent-running1')
    await flush()
    const followUps = [runIndexDelta('agent-running1'), runIndexDelta('agent-running1'), runIndexDelta('agent-running1')]
    expect(followUps[0]).toBe(followUps[2])
    await open('agent-running1')
    await open('agent-running1')
    await Promise.all([first, ...followUps])
    expect(pins.filter(p => p === 'agent-running1')).toHaveLength(2)
  })

  it('dry runs are not merged with real runs', async () => {
    const real = runIndexDelta('agent-dryrun01')
    await flush()
    const dry = runIndexDelta('agent-dryrun01', { dryRun: true })
    expect(dry).not.toBe(real)
    await open('agent-dryrun01')
    await open('agent-dryrun01')
    await Promise.all([real, dry])
  })

  it('the throttle is shared through globalThis, so a second copy of the module waits too', async () => {
    const state = (globalThis as any)._aimDeltaThrottle
    expect(state).toBeDefined()
    const a = runIndexDelta('agent-shared01')
    await flush()
    expect(state.active).toBe(1)
    await open('agent-shared01')
    await a
    expect(state.active).toBe(0)
    expect(state.queue).toHaveLength(0)
  })
})
