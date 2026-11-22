import { describe, it, expect, vi, beforeEach } from 'vitest'

const { fsStore, inject, wake, ready } = vi.hoisted(() => ({
  fsStore: {} as Record<string, string>,
  inject: vi.fn(),
  wake: vi.fn(),
  ready: vi.fn(),
}))

vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn((p: string) => p in fsStore || Object.keys(fsStore).some(k => k.startsWith(p + '/'))),
    mkdirSync: vi.fn(),
    readFileSync: vi.fn((p: string) => { if (p in fsStore) return fsStore[p]; throw new Error('ENOENT') }),
    writeFileSync: vi.fn((p: string, d: string) => { fsStore[p] = d }),
  },
}))
let n = 0
vi.mock('uuid', () => ({ v4: () => `id-${++n}` }))
const agents = [
  { id: 'a1', name: 'alpha', preferences: { wakeOnMessage: true } },
  { id: 'a2', name: 'beta' },
]
vi.mock('@/lib/agent-registry', () => ({
  loadAgents: () => agents,
  getAgent: (id: string) => agents.find(a => a.id === id) || null,
}))
vi.mock('@/lib/team-registry', () => ({ loadTeams: () => [], getTeam: () => null }))
vi.mock('@/services/agents-chat-service', () => ({ injectMeetingPrompt: (...a: unknown[]) => inject(...a) }))
vi.mock('@/lib/message-delivery', () => ({ wakeIfAsleep: (...a: unknown[]) => wake(...a) }))
vi.mock('@/lib/session-idle', () => ({ waitUntilReady: (...a: unknown[]) => ready(...a) }))

import { createAgentTask, addAgentTaskComment, listAgentTasks, receiveInstruction } from '@/services/agent-tasks-service'

const flush = () => new Promise(r => setTimeout(r, 0))

describe('a board instruction wakes an opted-in agent (F073)', () => {
  beforeEach(() => {
    for (const k of Object.keys(fsStore)) delete fsStore[k]
    n = 0
    inject.mockReset().mockResolvedValue({ status: 200, data: { success: true } })
    wake.mockReset().mockResolvedValue(true)
    ready.mockReset().mockResolvedValue(true)
  })

  it('starts an asleep agent, types the instruction once it is ready, then marks it sent', async () => {
    const id = ((createAgentTask('a1', { subject: 'Ship it' }).data as any).task as { id: string }).id
    const r = await addAgentTaskComment('a1', id, { author: { kind: 'operator' }, text: 'Go' })
    expect((r.data as any).delivered).toBe(false)
    expect((r.data as any).reason).toMatch(/starting/)
    expect(wake).toHaveBeenCalledOnce()
    await flush(); await flush()
    expect(ready).toHaveBeenCalledWith('alpha', expect.any(Number))
    expect(inject).toHaveBeenCalledOnce()
    expect((listAgentTasks('a1').data as any).tasks[0].comments[0].deliveredAt).not.toBeNull()
  })

  it('an awake agent gets it at once, as before', async () => {
    wake.mockResolvedValue(false)
    const id = ((createAgentTask('a1', { subject: 'x' }).data as any).task as { id: string }).id
    const r = await addAgentTaskComment('a1', id, { author: { kind: 'operator' }, text: 'Go' })
    expect((r.data as any).delivered).toBe(true)
    expect(ready).not.toHaveBeenCalled()
  })

  it('an agent that did not opt in is never started', async () => {
    const id = ((createAgentTask('a2', { subject: 'x' }).data as any).task as { id: string }).id
    await addAgentTaskComment('a2', id, { author: { kind: 'operator' }, text: 'Go' })
    expect(wake).not.toHaveBeenCalled()
    expect(inject).toHaveBeenCalledOnce()
  })

  it('a forwarded instruction to an asleep agent is taken by its host', async () => {
    const r = await receiveInstruction('alpha', { text: 'Go' })
    expect((r.data as any).delivered).toBe(true)
    await flush(); await flush()
    expect(inject).toHaveBeenCalledOnce()
  })
})
