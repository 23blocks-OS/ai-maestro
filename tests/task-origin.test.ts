import { describe, it, expect, vi, beforeEach } from 'vitest'

const { fsStore } = vi.hoisted(() => ({ fsStore: {} as Record<string, string> }))
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
vi.mock('@/lib/agent-registry', () => ({
  loadAgents: () => [{ id: 'a1', name: 'alpha' }],
  getAgent: (id: string) => (id === 'a1' ? { id, name: 'alpha' } : null),
}))
vi.mock('@/lib/team-registry', () => ({
  loadTeams: () => [{ id: 't1', name: 'Team One', agentIds: ['a1'] }],
  getTeam: (id: string) => (id === 't1' ? { id: 't1', name: 'Team One', agentIds: ['a1'] } : null),
}))
vi.mock('@/lib/hosts-config', () => ({ getSelfHostId: () => 'host-self', getHosts: () => [], isSelf: () => true }))
vi.mock('@/services/agents-chat-service', () => ({ injectMeetingPrompt: vi.fn() }))

import { parseKindAndOrigin } from '@/lib/task-origin'
import { createAgentTask, updateAgentTask, listAgentTasks } from '@/services/agent-tasks-service'
import { createTeamTask } from '@/services/teams-service'

describe('parseKindAndOrigin', () => {
  it('accepts nothing', () => {
    expect(parseKindAndOrigin({})).toEqual({ ok: true, value: {} })
  })
  it('keeps a known kind and refuses an unknown one', () => {
    expect(parseKindAndOrigin({ kind: 'bug' })).toEqual({ ok: true, value: { kind: 'bug' } })
    expect(parseKindAndOrigin({ kind: 'epic' })).toMatchObject({ ok: false, field: 'kind' })
    expect(parseKindAndOrigin({ kind: 5 })).toMatchObject({ ok: false, field: 'kind' })
  })
  it('fills the host when the origin names an agent but no host', () => {
    expect(parseKindAndOrigin({ origin: { agentId: 'a1', repo: 'agents-web' } }, 'host-self')).toEqual({
      ok: true, value: { origin: { agentId: 'a1', hostId: 'host-self', repo: 'agents-web' } },
    })
  })
  it('keeps a host that is given, and does not invent one without an agent', () => {
    expect(parseKindAndOrigin({ origin: { agentId: 'a1', hostId: 'mini' } }, 'host-self')).toMatchObject({ value: { origin: { hostId: 'mini' } } })
    expect(parseKindAndOrigin({ origin: { repo: 'x' } }, 'host-self')).toEqual({ ok: true, value: { origin: { repo: 'x' } } })
  })
  it('drops unknown keys and refuses bad ids, a non-object, and a long repo', () => {
    expect(parseKindAndOrigin({ origin: { agentId: 'a1', evil: 'x' } }, 'h')).toEqual({ ok: true, value: { origin: { agentId: 'a1', hostId: 'h' } } })
    expect(parseKindAndOrigin({ origin: { agentId: '../x' } })).toMatchObject({ ok: false, field: 'origin.agentId' })
    expect(parseKindAndOrigin({ origin: 'a1' })).toMatchObject({ ok: false, field: 'origin' })
    expect(parseKindAndOrigin({ origin: { repo: 'x'.repeat(201) } })).toMatchObject({ ok: false, field: 'origin.repo' })
  })
  it('cuts a long note and strips control characters', () => {
    const r = parseKindAndOrigin({ origin: { note: `a\u0000b${'z'.repeat(2000)}` } })
    expect(r.ok && r.value.origin?.note?.length).toBe(1000)
    expect(r.ok && r.value.origin?.note?.startsWith('ab')).toBe(true)
  })
})

describe('a parked card keeps its kind and origin', () => {
  beforeEach(() => { for (const k of Object.keys(fsStore)) delete fsStore[k]; n = 0 })

  it('on an agent board', () => {
    const r = createAgentTask('a1', { subject: 'Flaky test in sync', status: 'backlog', kind: 'bug', origin: { agentId: 'a1', repo: 'agents-web', note: 'saw it while fixing the hook' } }) as any
    expect(r.status).toBe(201)
    expect(r.data.task).toMatchObject({ status: 'backlog', kind: 'bug', origin: { agentId: 'a1', hostId: 'host-self', repo: 'agents-web', note: 'saw it while fixing the hook' } })
    const listed = (listAgentTasks('a1') as any).data.tasks
    expect(listed[0].origin.repo).toBe('agents-web')
  })

  it('on a team board', () => {
    const r = createTeamTask('t1', { subject: 'Idea: dark map', kind: 'idea', origin: { agentId: 'a1' } }) as any
    expect(r.status).toBe(201)
    expect(r.data.task).toMatchObject({ kind: 'idea', origin: { agentId: 'a1', hostId: 'host-self' } })
  })

  it('a plain task stores no kind', () => {
    const r = createAgentTask('a1', { subject: 'Normal', kind: 'task' }) as any
    expect(r.data.task.kind).toBeUndefined()
    expect(r.data.task.origin).toBeUndefined()
  })

  it('refuses a bad kind or origin without creating the card', () => {
    expect((createAgentTask('a1', { subject: 'x', kind: 'epic' }) as any).status).toBe(400)
    expect((createAgentTask('a1', { subject: 'x', origin: { agentId: '../x' } }) as any).status).toBe(400)
    expect((listAgentTasks('a1') as any).data.tasks).toHaveLength(0)
  })

  it('origin cannot be rewritten by an update', () => {
    const made = createAgentTask('a1', { subject: 'Idea', kind: 'idea', origin: { agentId: 'a1', repo: 'r' } }) as any
    updateAgentTask('a1', made.data.task.id, { subject: 'Idea (renamed)', origin: { repo: 'other' } } as any)
    const t = (listAgentTasks('a1') as any).data.tasks[0]
    expect(t.subject).toBe('Idea (renamed)')
    expect(t.origin.repo).toBe('r')
  })
})
