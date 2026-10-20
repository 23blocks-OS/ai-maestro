import { describe, it, expect, vi, beforeEach } from 'vitest'

// In-memory filesystem keyed by absolute path, with folders derived from the keys
const { fsStore, inject, hosts } = vi.hoisted(() => ({
  fsStore: {} as Record<string, string>,
  inject: vi.fn(),
  hosts: { list: [] as Array<{ id: string; name: string; url: string; enabled?: boolean }>, self: 'self-host' },
}))

vi.mock('fs', () => {
  const dirsOf = (p: string) => {
    const prefix = p.endsWith('/') ? p : p + '/'
    const names = new Set<string>()
    for (const k of Object.keys(fsStore)) if (k.startsWith(prefix)) names.add(k.slice(prefix.length).split('/')[0])
    return [...names]
  }
  return {
    default: {
      existsSync: vi.fn((p: string) => p in fsStore || Object.keys(fsStore).some(k => k.startsWith(p + '/'))),
      mkdirSync: vi.fn(),
      readFileSync: vi.fn((p: string) => { if (p in fsStore) return fsStore[p]; throw new Error('ENOENT') }),
      writeFileSync: vi.fn((p: string, d: string) => { fsStore[p] = d }),
      readdirSync: vi.fn((p: string) => dirsOf(p).map(name => ({ name, isDirectory: () => true }))),
      rmSync: vi.fn((p: string) => { for (const k of Object.keys(fsStore)) if (k === p || k.startsWith(p + '/')) delete fsStore[k] }),
    },
  }
})
let n = 0
vi.mock('uuid', () => ({ v4: () => `id-${++n}` }))
vi.mock('@/lib/agent-registry', () => ({
  loadAgents: () => [{ id: 'a1', name: 'alpha' }, { id: 'a2', name: 'beta' }],
  getAgent: (id: string) => (['a1', 'a2'].includes(id) ? { id, name: id === 'a1' ? 'alpha' : 'beta' } : null),
}))
vi.mock('@/lib/team-registry', () => ({ loadTeams: () => [], getTeam: () => null }))
vi.mock('@/lib/hosts-config', () => ({
  getHosts: () => hosts.list,
  getSelfHostId: () => hosts.self,
  isSelf: (id: string) => id === hosts.self,
}))
vi.mock('@/services/agents-chat-service', () => ({ injectMeetingPrompt: (...a: unknown[]) => inject(...a) }))

import {
  createProject, updateProject, deleteProject, getProjectById, listProjects, listProjectTasks, createProjectTask,
  updateProjectTask, deleteProjectTask, addProjectTaskComment, retryProjectTaskComment,
} from '@/services/projects-service'
import { getOpenTasks, getTaskSummary, forwardInstruction, receiveInstruction } from '@/services/agent-tasks-service'
import { getProject } from '@/lib/project-registry'

const project = (params: Record<string, unknown> = {}) => (createProject({ name: 'Consent banner', ...params }).data as any).project as { id: string; name: string; hostId: string; counts: any; status: string; ownerAgentId: string | null }
const card = (pid: string, extra: Record<string, unknown> = {}) => ((createProjectTask(pid, { subject: 'A card', ...extra }).data as any).task as { id: string })

beforeEach(() => {
  for (const k of Object.keys(fsStore)) delete fsStore[k]
  n = 0
  inject.mockReset()
  inject.mockResolvedValue({ status: 200, data: { success: true } })
  hosts.list = []
  hosts.self = 'self-host'
})

describe('projects', () => {
  it('a project needs a name; it is stored with the host that holds it', () => {
    expect(createProject({}).status).toBe(400)
    expect(createProject({ name: '   ' }).status).toBe(400)
    expect(createProject({ name: 'x'.repeat(81) }).status).toBe(400)
    const p = project({ name: '  The outreach campaign  ', description: ' about it ' })
    expect(p).toMatchObject({ name: 'The outreach campaign', status: 'active', ownerAgentId: null, hostId: 'self-host' })
    expect(p.counts).toEqual({ open: 0, waiting: 0, total: 0 })
  })

  it('the owner must be an agent on THIS host: the project is stored where its owner lives', () => {
    expect(createProject({ name: 'x', ownerAgentId: 'someone-on-another-host' }).status).toBe(400)
    expect(project({ ownerAgentId: 'a1' }).ownerAgentId).toBe('a1')
    const p = project()
    expect(updateProject(p.id, { ownerAgentId: 'elsewhere' }).status).toBe(400)
    expect(updateProject(p.id, { ownerAgentId: 'a2' }).status).toBe(200)
  })

  it('status is active, paused or done; anything else is refused; an unknown project is a 404', () => {
    const p = project()
    expect(updateProject(p.id, { status: 'paused' }).status).toBe(200)
    expect(getProjectById(p.id).data).toMatchObject({ project: { status: 'paused' } })
    expect(updateProject(p.id, { status: 'cancelled' }).status).toBe(400)
    expect(updateProject('nope', { name: 'x' }).status).toBe(404)
    expect(getProjectById('nope').status).toBe(404)
  })

  it('renaming keeps everything else', () => {
    const p = project({ description: 'keep me', ownerAgentId: 'a1' })
    const r = updateProject(p.id, { name: 'Renamed' })
    expect(r.data).toMatchObject({ project: { name: 'Renamed', ownerAgentId: 'a1' } })
    expect(getProject(p.id)?.description).toBe('keep me')
  })

  it('deleting removes the project and its cards, and only that project', () => {
    const a = project({ name: 'A' }), b = project({ name: 'B' })
    card(a.id); card(b.id)
    expect(deleteProject(a.id).status).toBe(200)
    expect(getProject(a.id)).toBeNull()
    expect(Object.keys(fsStore).some(k => k.includes(`/projects/${a.id}/`))).toBe(false)
    expect(Object.keys(fsStore).some(k => k.includes(`/projects/${b.id}/`))).toBe(true)
    expect(deleteProject(a.id).status).toBe(404)
  })

  it('an id that could climb out of the folder reads as nothing', () => {
    expect(getProject('../../etc')).toBeNull()
    expect(getProjectById('../x').status).toBe(404)
    expect(deleteProject('../x').status).toBe(404)
    expect(createProjectTask('../x', { subject: 'x' }).status).toBe(404)
  })

  it('lists projects with their counts', () => {
    const p = project()
    card(p.id)
    const waiting = card(p.id).id
    updateProjectTask(p.id, waiting, { status: 'waiting', waitingOn: 'juan' })
    expect((listProjects().data as any).projects[0].counts).toEqual({ open: 2, waiting: 1, total: 2 })
  })
})

describe('project cards', () => {
  it('a card can be assigned to an agent this host has never heard of (it lives on another host)', () => {
    const p = project()
    const r = createProjectTask(p.id, { subject: 'Remote work', assigneeAgentId: '343aef8a-b788-4cb6-b961-a51a9dc775b4' })
    expect(r.status).toBe(201)
    expect((r.data as any).task.assigneeAgentId).toBe('343aef8a-b788-4cb6-b961-a51a9dc775b4')
    expect(createProjectTask(p.id, { subject: 'By name', assigneeAgentId: '23b-hr' }).status).toBe(201)
  })

  it('but a malformed assignee is refused', () => {
    const p = project()
    for (const bad of ['has space', '../x', '-x', 'a/b', 'x'.repeat(200)]) {
      expect(createProjectTask(p.id, { subject: 's', assigneeAgentId: bad }).status, bad).toBe(400)
    }
  })

  it('a card has no assignee unless given one (a project card is not the owner\'s own)', () => {
    const p = project({ ownerAgentId: 'a1' })
    expect(((createProjectTask(p.id, { subject: 'x' }).data as any).task as any).assigneeAgentId).toBeNull()
  })

  it('placement, waiting and status work on project cards like on any card', () => {
    const p = project()
    const c = card(p.id).id
    expect(updateProjectTask(p.id, c, { urgent: true, important: true }).status).toBe(200)
    expect(updateProjectTask(p.id, c, { status: 'waiting' }).status).toBe(400)
    expect(updateProjectTask(p.id, c, { status: 'waiting', waitingOn: 'juan' }).status).toBe(200)
    expect(updateProjectTask(p.id, c, { urgent: 'x' as any }).status).toBe(400)
    const t = (listProjectTasks(p.id).data as any).tasks[0]
    expect(t).toMatchObject({ quadrant: 'q1', status: 'waiting', waitingOn: 'juan', scope: 'project', projectName: 'Consent banner', hostId: 'self-host' })
  })

  it('a card can be blocked by another card of the same project, and a card cannot block itself', () => {
    const p = project()
    const a = card(p.id).id, b = card(p.id).id
    expect(updateProjectTask(p.id, b, { blockedBy: [a] }).status).toBe(200)
    expect(((listProjectTasks(p.id).data as any).tasks as any[]).find(t => t.id === b)).toMatchObject({ isBlocked: true })
    expect(updateProjectTask(p.id, a, { blockedBy: [a] }).status).toBe(400)
  })

  it('deleting a card removes it; an unknown card is a 404', () => {
    const p = project()
    const c = card(p.id).id
    expect(deleteProjectTask(p.id, c).status).toBe(200)
    expect(deleteProjectTask(p.id, c).status).toBe(404)
  })

  it('?assignee returns only the projects with cards for that agent, and only those cards', () => {
    const a = project({ name: 'A' }), b = project({ name: 'B' }), c = project({ name: 'C' })
    card(a.id, { subject: 'for a1', assigneeAgentId: 'a1' })
    card(a.id, { subject: 'for a2', assigneeAgentId: 'a2' })
    card(b.id, { subject: 'for remote', assigneeAgentId: 'remote-agent' })
    card(c.id, { subject: 'nobody' })
    const list = (assignee: string) => ((listProjects({ assignee }).data as any).projects as any[]).map(p => [p.name, p.cards.map((x: any) => x.subject)])
    expect(list('a1')).toEqual([['A', ['for a1']]])
    expect(list('remote-agent')).toEqual([['B', ['for remote']]])
    expect(list('ghost')).toEqual([])
    expect(((listProjects({ assignee: 'a1' }).data as any).projects[0].cards[0])).toMatchObject({ scope: 'project', projectName: 'A', hostId: 'self-host' })
  })

  it('completed cards are in the project list but not in the host-wide open read', () => {
    const p = project()
    const open = card(p.id, { subject: 'open', assigneeAgentId: 'a1' }).id
    const done = card(p.id, { subject: 'done', assigneeAgentId: 'a1' }).id
    updateProjectTask(p.id, done, { status: 'completed' })
    expect((listProjectTasks(p.id).data as any).tasks).toHaveLength(2)
    const open2 = ((getOpenTasks().data as any).cards as any[]).map(c => c.subject)
    expect(open2).toEqual(['open'])
    expect(open).toBeTruthy()
  })

  it('the host-wide read carries project cards with their assignee, name and host, and they take a quadrant filter', () => {
    const p = project({ name: 'Outreach' })
    const c = card(p.id, { subject: 'Send the mails', assigneeAgentId: 'remote-agent' }).id
    updateProjectTask(p.id, c, { urgent: false, important: true })
    card(p.id, { subject: 'unassigned' })
    const cards = (getOpenTasks({ quadrant: 'q2' }).data as any).cards as any[]
    expect(cards).toHaveLength(1)
    expect(cards[0]).toMatchObject({ subject: 'Send the mails', scope: 'project', projectName: 'Outreach', agentId: 'remote-agent', hostId: 'self-host', quadrant: 'q2' })
  })

  it('the count for an agent includes its project cards, and finished or backlog ones are left out', () => {
    const p = project()
    const a = card(p.id, { assigneeAgentId: 'remote-agent' }).id
    card(p.id, { assigneeAgentId: 'remote-agent' })
    const b = card(p.id, { assigneeAgentId: 'remote-agent' }).id
    updateProjectTask(p.id, a, { status: 'waiting', waitingOn: 'juan' })
    updateProjectTask(p.id, b, { status: 'completed' })
    expect((getTaskSummary().data as any).agents['remote-agent']).toEqual({ open: 2, waiting: 1, waitingOnJuan: 1 })
  })
})

describe('an instruction on a project card', () => {
  const operator = { kind: 'operator' }

  it('for an assignee on THIS host it is typed into the session, and names the project', async () => {
    const p = project({ name: 'Consent banner' })
    const c = card(p.id, { subject: 'Ship it', assigneeAgentId: 'a1' }).id
    const r = await addProjectTaskComment(p.id, c, { author: operator, text: 'Use the short copy' })
    expect((r.data as any).delivered).toBe(true)
    const arg = inject.mock.calls[0][0]
    expect(arg.agentId).toBe('a1')
    expect(arg.injection).toContain('instruction from the operator (AI Maestro board, project Consent banner,')
    expect(arg.injection).toContain('Use the short copy')
  })

  it('for an assignee on ANOTHER host this host forwards it: the first peer that knows the agent takes it', async () => {
    hosts.list = [
      { id: 'self-host', name: 'Self', url: 'http://self:23000' },
      { id: 'off', name: 'Off', url: 'http://off:23000', enabled: false },
      { id: 'peer-1', name: 'Peer 1', url: 'http://peer1:23000/' },
      { id: 'peer-2', name: 'Peer 2', url: 'http://peer2:23000' },
    ]
    const calls: Array<{ url: string; body: any }> = []
    vi.stubGlobal('fetch', async (url: string, init: any) => {
      calls.push({ url, body: JSON.parse(init.body) })
      if (url.startsWith('http://peer1')) return new Response(JSON.stringify({ error: 'not_found' }), { status: 404 })
      return new Response(JSON.stringify({ delivered: true }), { status: 200 })
    })
    const p = project({ name: 'Outreach' })
    const c = card(p.id, { subject: 'Mail them', assigneeAgentId: 'remote-agent' }).id
    const r = await addProjectTaskComment(p.id, c, { author: operator, text: 'Today please' })
    expect((r.data as any).delivered).toBe(true)
    expect(inject).not.toHaveBeenCalled()
    expect(calls.map(x => x.url)).toEqual(['http://peer1:23000/api/agents/remote-agent/task-instruction', 'http://peer2:23000/api/agents/remote-agent/task-instruction'])
    expect(calls[1].body.text).toContain('[TASK ')
    expect(calls[1].body.text).toContain('project Outreach')
    expect(calls[1].body.text).toContain('Today please')
    // marked sent on the card
    expect(((listProjectTasks(p.id).data as any).tasks[0].comments[0].deliveredAt)).toBeTruthy()
    vi.unstubAllGlobals()
  })

  it('when no host knows the agent the comment is kept not sent, with the reason, and Retry works later', async () => {
    hosts.list = [{ id: 'peer-1', name: 'Peer 1', url: 'http://peer1:23000' }]
    let known = false
    vi.stubGlobal('fetch', async () => (known ? new Response(JSON.stringify({ delivered: true }), { status: 200 }) : new Response('{}', { status: 404 })))
    const p = project()
    const c = card(p.id, { assigneeAgentId: 'remote-agent' }).id
    const r = await addProjectTaskComment(p.id, c, { author: operator, text: 'hi' })
    expect((r.data as any).delivered).toBe(false)
    expect((r.data as any).reason).toContain('No host I can reach knows this agent')
    const cid = ((listProjectTasks(p.id).data as any).tasks[0].comments[0].id)
    known = true
    expect(((await retryProjectTaskComment(p.id, c, cid)).data as any).delivered).toBe(true)
    expect(((listProjectTasks(p.id).data as any).tasks[0].comments[0].deliveredAt)).toBeTruthy()
    vi.unstubAllGlobals()
  })

  it('a host that is down or refuses is named in the reason; the next host is still tried', async () => {
    const hostsList = [
      { id: 'down', name: 'Down', url: 'http://down:23000' },
      { id: 'busy', name: 'Busy', url: 'http://busy:23000' },
    ]
    hosts.list = hostsList
    const f: typeof fetch = (async (url: string) => {
      if (url.startsWith('http://down')) throw new Error('ECONNREFUSED')
      return new Response(JSON.stringify({ delivered: false, reason: 'Session beta is not active' }), { status: 200 })
    }) as any
    const r = await forwardInstruction('remote-agent', 'text', f)
    expect(r.ok).toBe(false)
    expect(r.reason).toContain('Busy')
    expect(r.reason).toContain('not active')
  })

  it('an agent comment on a project card is never forwarded or typed', async () => {
    hosts.list = [{ id: 'peer-1', name: 'Peer 1', url: 'http://peer1:23000' }]
    const f = vi.fn()
    vi.stubGlobal('fetch', f)
    const p = project()
    const c = card(p.id, { assigneeAgentId: 'remote-agent' }).id
    await addProjectTaskComment(p.id, c, { author: { kind: 'agent', id: 'x' }, text: 'note' })
    await addProjectTaskComment(p.id, c, { text: 'no author at all' })
    expect(f).not.toHaveBeenCalled()
    expect(inject).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('a card with nobody assigned keeps the comment and sends nothing', async () => {
    const p = project()
    const c = card(p.id).id
    const r = await addProjectTaskComment(p.id, c, { author: operator, text: 'hello' })
    expect((r.data as any).delivered).toBe(false)
    expect((r.data as any).reason).toContain('No one is assigned')
  })
})

describe('the assignee\'s side of a forwarded instruction', () => {
  it('an agent this host does not know is a 404 (so the sender tries the next host)', async () => {
    expect((await receiveInstruction('stranger', { text: 'x' })).status).toBe(404)
    expect(inject).not.toHaveBeenCalled()
  })

  it('text is required, cleaned of control characters, and typed into the agent', async () => {
    expect((await receiveInstruction('a1', {})).status).toBe(400)
    expect((await receiveInstruction('a1', { text: '   ' })).status).toBe(400)
    expect((await receiveInstruction('a1', { text: 5 as any })).status).toBe(400)
    const r = await receiveInstruction('a1', { text: 'do it' + String.fromCharCode(7) + String.fromCharCode(27) + '[31m now' })
    expect((r.data as any).delivered).toBe(true)
    expect(inject.mock.calls[0][0].agentId).toBe('a1')
    expect(inject.mock.calls[0][0].injection).toBe('do it[31m now')
  })

  it('when the session cannot take it the answer says why (still 200, so the sender stops and reports it)', async () => {
    inject.mockResolvedValueOnce({ status: 400, data: { error: 'Session alpha is not active' } })
    const r = await receiveInstruction('a1', { text: 'x' })
    expect(r.status).toBe(200)
    expect(r.data).toMatchObject({ delivered: false, reason: 'Session alpha is not active' })
  })
})

describe('the assignee shown on a project card', () => {
  it('an agent this host does not know is shown by the name it was given, or the start of its id', () => {
    const p = project()
    card(p.id, { subject: 'by name', assigneeAgentId: '23b-counsel' })
    card(p.id, { subject: 'by id', assigneeAgentId: '343aef8a-b788-4cb6-b961-a51a9dc775b4' })
    card(p.id, { subject: 'local', assigneeAgentId: 'a1' })
    card(p.id, { subject: 'nobody' })
    const by = Object.fromEntries(((listProjectTasks(p.id).data as any).tasks as any[]).map(t => [t.subject, t.assigneeName]))
    expect(by).toEqual({ 'by name': '23b-counsel', 'by id': '343aef8a', local: 'alpha', nobody: undefined })
  })
})
