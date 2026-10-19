import { describe, it, expect, vi, beforeEach } from 'vitest'

// In-memory filesystem keyed by absolute path
const { fsStore, inject } = vi.hoisted(() => ({
  fsStore: {} as Record<string, string>,
  inject: vi.fn(),
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
vi.mock('@/lib/agent-registry', () => ({
  loadAgents: () => [{ id: 'a1', name: 'alpha' }, { id: 'a2', name: 'beta' }],
  getAgent: (id: string) => (['a1', 'a2'].includes(id) ? { id, name: id === 'a1' ? 'alpha' : 'beta' } : null),
}))
vi.mock('@/lib/team-registry', () => ({
  loadTeams: () => [{ id: 't1', name: 'Team One', agentIds: ['a1'] }],
  getTeam: (id: string) => (id === 't1' ? { id: 't1', name: 'Team One', agentIds: ['a1'] } : null),
}))
vi.mock('@/services/agents-chat-service', () => ({ injectMeetingPrompt: (...a: unknown[]) => inject(...a) }))

import {
  createAgentTask, updateAgentTask, deleteAgentTask, listAgentTasks, getAgentBoard, getTaskSummary,
  addAgentTaskComment, addTeamTaskComment, retryAgentTaskComment,
} from '@/services/agent-tasks-service'
import { createTask, isSafeScopeId, loadScopeTasks, saveScopeTasks } from '@/lib/task-registry'

describe('agent board', () => {
  beforeEach(() => {
    for (const k of Object.keys(fsStore)) delete fsStore[k]
    n = 0
    inject.mockReset()
    inject.mockResolvedValue({ status: 200, data: { success: true } })
  })

  it('an unknown agent is a 404, not an empty board', () => {
    expect(listAgentTasks('nope').status).toBe(404)
    expect(getAgentBoard('nope').status).toBe(404)
    expect(createAgentTask('nope', { subject: 'x' }).status).toBe(404)
  })

  it('a card on an agent board belongs to that agent and has no team', () => {
    const r = createAgentTask('a1', { subject: 'Fix the footer' })
    expect(r.status).toBe(201)
    const task = (r.data as { task: Record<string, unknown> }).task
    expect(task).toMatchObject({ ownerAgentId: 'a1', assigneeAgentId: 'a1', status: 'pending' })
    expect(task.teamId).toBeUndefined()
    expect(createAgentTask('a1', { subject: 'x', assigneeAgentId: 'a2' }).status).toBe(400)
  })

  it('needs a subject', () => {
    expect(createAgentTask('a1', {}).status).toBe(400)
    expect(createAgentTask('a1', { subject: '   ' }).status).toBe(400)
  })

  it('waiting needs waitingOn: juan, outside, hold, or an agent id or name (any host)', () => {
    const id = ((createAgentTask('a1', { subject: 'x' }).data as any).task as { id: string }).id
    expect(updateAgentTask('a1', id, { status: 'waiting' }).status).toBe(400)
    // not an agent name or id at all
    for (const bad of ['has space', '../x', '-lead', 'a/b', '', 'x'.repeat(200)]) {
      expect(updateAgentTask('a1', id, { status: 'waiting', waitingOn: bad }).status, bad).toBe(400)
    }
    // juan/outside/hold, a local agent, an agent this host has never heard of (it lives on another host), a name
    for (const on of ['juan', 'outside', 'hold', 'a2', '343aef8a-b788-4cb6-b961-a51a9dc775b4', '23b-hr']) {
      const r = updateAgentTask('a1', id, { status: 'waiting', waitingOn: on })
      expect(r.status, on).toBe(200)
      expect(((r.data as any).task as { waitingOn: string }).waitingOn).toBe(on)
    }
  })

  it('a card that stops waiting forgets what it waited on', () => {
    const id = ((createAgentTask('a1', { subject: 'x' }).data as any).task as { id: string }).id
    updateAgentTask('a1', id, { status: 'waiting', waitingOn: 'juan', waitingNote: 'copy' })
    updateAgentTask('a1', id, { status: 'in_progress' })
    const t = (listAgentTasks('a1').data as any).tasks[0]
    expect(t.waitingOn).toBeUndefined()
    expect(t.waitingNote).toBeUndefined()
  })

  it('filters by waitingOn', () => {
    const a = ((createAgentTask('a1', { subject: 'a' }).data as any).task as { id: string }).id
    createAgentTask('a1', { subject: 'b' })
    updateAgentTask('a1', a, { status: 'waiting', waitingOn: 'juan' })
    expect((listAgentTasks('a1', { waitingOn: 'juan' }).data as any).tasks).toHaveLength(1)
    expect((listAgentTasks('a1', { waitingOn: 'outside' }).data as any).tasks).toHaveLength(0)
  })

  it('the board is the agent cards plus team cards assigned to it, labelled', () => {
    createAgentTask('a1', { subject: 'mine' })
    createTask({ teamId: 't1', subject: 'team job for a1', assigneeAgentId: 'a1' })
    createTask({ teamId: 't1', subject: 'team job for a2', assigneeAgentId: 'a2' })
    const cards = (getAgentBoard('a1').data as any).cards as Array<{ subject: string; scope: string; teamName?: string }>
    expect(cards.map(c => [c.subject, c.scope, c.teamName])).toEqual([
      ['mine', 'agent', undefined],
      ['team job for a1', 'team', 'Team One'],
    ])
  })

  it('rejects an agent id that could climb out of the folder', () => {
    expect(createAgentTask('../x', { subject: 'x' }).status).toBe(404)
  })

  it('summary counts open, waiting and waiting on juan, and skips done and backlog', () => {
    const a = ((createAgentTask('a1', { subject: 'a' }).data as any).task as { id: string }).id
    const b = ((createAgentTask('a1', { subject: 'b' }).data as any).task as { id: string }).id
    const c = ((createAgentTask('a1', { subject: 'c' }).data as any).task as { id: string }).id
    updateAgentTask('a1', a, { status: 'waiting', waitingOn: 'juan' })
    updateAgentTask('a1', b, { status: 'completed' })
    updateAgentTask('a1', c, { status: 'backlog' })
    createAgentTask('a1', { subject: 'd' })
    expect((getTaskSummary().data as any).agents.a1).toEqual({ open: 2, waiting: 1, waitingOnJuan: 1 })
  })

  it('deleting a card removes it', () => {
    const id = ((createAgentTask('a1', { subject: 'x' }).data as any).task as { id: string }).id
    expect(deleteAgentTask('a1', id).status).toBe(200)
    expect(deleteAgentTask('a1', id).status).toBe(404)
  })
})

describe('comments', () => {
  beforeEach(() => {
    for (const k of Object.keys(fsStore)) delete fsStore[k]
    n = 0
    inject.mockReset()
    inject.mockResolvedValue({ status: 200, data: { success: true } })
  })
  const card = () => ((createAgentTask('a1', { subject: 'Ship the banner' }).data as any).task as { id: string }).id

  it('an operator comment is stored, handed to the assignee, and marked delivered', async () => {
    const id = card()
    const r = await addAgentTaskComment('a1', id, { author: { kind: 'operator' }, text: 'Use the short copy' })
    expect(r.status).toBe(201)
    expect((r.data as any).delivered).toBe(true)
    expect(inject).toHaveBeenCalledOnce()
    const arg = inject.mock.calls[0][0]
    expect(arg.agentId).toBe('a1')
    expect(arg.injection).toContain('[TASK id-1')
    expect(arg.injection).toContain('Ship the banner')
    expect(arg.injection).toContain('instruction from the operator')
    expect(arg.injection).toContain('Use the short copy')
    const stored = (listAgentTasks('a1').data as any).tasks[0].comments[0]
    expect(stored.deliveredAt).toBeTruthy()
  })

  it('an agent comment, or one with no kind, is stored and never injected', async () => {
    const id = card()
    for (const author of [{ kind: 'agent', id: 'a2' }, {}, { kind: 'OPERATOR' }, { kind: 'admin' }, undefined]) {
      await addAgentTaskComment('a1', id, { author: author as any, text: 'note' })
    }
    expect(inject).not.toHaveBeenCalled()
    const comments = (listAgentTasks('a1').data as any).tasks[0].comments
    expect(comments).toHaveLength(5)
    expect(comments.every((c: any) => c.author.kind === 'agent' && c.deliveredAt === null)).toBe(true)
  })

  it('when the session cannot take it the comment is kept undelivered and can be retried', async () => {
    const id = card()
    inject.mockResolvedValueOnce({ status: 400, data: { error: 'Session alpha is not active' } })
    const r = await addAgentTaskComment('a1', id, { author: { kind: 'operator' }, text: 'Do it' })
    expect((r.data as any).delivered).toBe(false)
    expect((r.data as any).reason).toContain('not active')
    const cid = (listAgentTasks('a1').data as any).tasks[0].comments[0].id
    expect((listAgentTasks('a1').data as any).tasks[0].comments[0].deliveredAt).toBeNull()
    const again = await retryAgentTaskComment('a1', id, cid)
    expect((again.data as any).delivered).toBe(true)
    expect((listAgentTasks('a1').data as any).tasks[0].comments[0].deliveredAt).toBeTruthy()
  })

  it('retry refuses an agent comment', async () => {
    const id = card()
    await addAgentTaskComment('a1', id, { author: { kind: 'agent' }, text: 'note' })
    const cid = (listAgentTasks('a1').data as any).tasks[0].comments[0].id
    expect((await retryAgentTaskComment('a1', id, cid)).status).toBe(400)
    expect(inject).not.toHaveBeenCalled()
  })

  it('needs text, and a card that exists', async () => {
    const id = card()
    expect((await addAgentTaskComment('a1', id, { author: { kind: 'operator' }, text: '  ' })).status).toBe(400)
    expect((await addAgentTaskComment('a1', 'nope', { author: { kind: 'operator' }, text: 'x' })).status).toBe(404)
  })

  it('control characters are removed and a long text is capped', async () => {
    const id = card()
    await addAgentTaskComment('a1', id, { author: { kind: 'operator' }, text: 'a\u0007b\u001b[31mc\nd' + 'x'.repeat(5000) })
    const text = (listAgentTasks('a1').data as any).tasks[0].comments[0].text as string
    expect(text).not.toMatch(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/)
    expect(text.length).toBeLessThanOrEqual(4000)
    expect(text).toContain('\n')
  })

  it('a card with nobody assigned keeps the comment but sends nothing', async () => {
    const t = createTask({ teamId: 't1', subject: 'orphan' })
    const r = await addTeamTaskComment('t1', t.id, { author: { kind: 'operator' }, text: 'hello' })
    expect((r.data as any).delivered).toBe(false)
    expect((r.data as any).reason).toContain('No one is assigned')
    expect(inject).not.toHaveBeenCalled()
  })

  it('a team card comment goes to the team card assignee', async () => {
    const t = createTask({ teamId: 't1', subject: 'team job', assigneeAgentId: 'a2' })
    await addTeamTaskComment('t1', t.id, { author: { kind: 'operator' }, text: 'go' })
    expect(inject.mock.calls[0][0].agentId).toBe('a2')
  })
})

describe('scope ids become file names', () => {
  it('only safe ids are accepted', () => {
    for (const bad of ['../x', 'a/b', '..', '', '.hidden', 'a b', 'x'.repeat(200), 'a\u0000b']) expect(isSafeScopeId(bad)).toBe(false)
    for (const ok of ['4b00f39a-5a1f-48f6-a10a-e4cad95fbfa8', 'team_1', 'abc']) expect(isSafeScopeId(ok)).toBe(true)
  })
  it('an unsafe id reads as empty and writes nothing', () => {
    const before = Object.keys(fsStore).length
    expect(loadScopeTasks({ kind: 'agent', id: '../../etc' })).toEqual([])
    expect(saveScopeTasks({ kind: 'agent', id: '../../etc' }, [])).toBe(false)
    expect(Object.keys(fsStore).length).toBe(before)
  })
})
