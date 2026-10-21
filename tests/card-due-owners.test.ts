import { describe, it, expect, vi, beforeEach } from 'vitest'

// In-memory filesystem keyed by absolute path, with folders derived from the keys
const { fsStore, hosts } = vi.hoisted(() => ({
  fsStore: {} as Record<string, string>,
  hosts: { self: 'self-host' },
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
const AGENTS = [
  { id: 'a1', name: 'alpha', label: 'Ana' },
  { id: 'a2', name: 'beta' },
  { id: 'a3', name: 'gamma' },
]
vi.mock('@/lib/agent-registry', () => ({
  loadAgents: () => AGENTS,
  getAgent: (id: string) => AGENTS.find(a => a.id === id) || null,
}))
const TEAMS = [{ id: 't1', name: 'Team One', agentIds: ['a1', 'a2'] }]
vi.mock('@/lib/team-registry', () => ({
  loadTeams: () => TEAMS,
  getTeam: (id: string) => TEAMS.find(t => t.id === id) || null,
}))
vi.mock('@/lib/hosts-config', () => ({
  getHosts: () => [],
  getSelfHostId: () => hosts.self,
  isSelf: (id: string) => id === hosts.self,
}))
vi.mock('@/services/agents-chat-service', () => ({ injectMeetingPrompt: vi.fn() }))

import {
  createAgentTask, updateAgentTask, listAgentTasks, getAgentBoard, getOpenTasks, getSharedTasks, sharedCardsFor,
} from '@/services/agent-tasks-service'
import { createTeamTask, updateTeamTask } from '@/services/teams-service'
import { createProject, createProjectTask, updateProjectTask, listProjectTasks } from '@/services/projects-service'

const ok = (r: any) => { expect(r.status, JSON.stringify(r)).toBeLessThan(300); return r.data }
const task = (r: any) => ok(r).task
const projectId = () => (ok(createProject({ name: 'Consent banner', ownerAgentId: 'a1' })).project as { id: string }).id

beforeEach(() => {
  for (const k of Object.keys(fsStore)) delete fsStore[k]
  n = 0
  hosts.self = 'self-host'
})

describe('due date and owners: an agent\'s own board', () => {
  it('keeps both on create: the date as given, the owners cleaned (the board\'s agent and duplicates removed)', () => {
    const t = task(createAgentTask('a1', { subject: 'Ship the banner', due: '2026-10-25', owners: ['a2', 'Gamma', 'A2', 'a1'] }))
    expect(t.due).toBe('2026-10-25')
    expect(t.owners).toEqual(['a2', 'Gamma'])
    const listed = (ok(listAgentTasks('a1')) as any).tasks[0]
    expect(listed.due).toBe('2026-10-25')
    expect(listed.owners).toEqual(['a2', 'Gamma'])
  })

  it('a card with neither stores neither', () => {
    const t = task(createAgentTask('a1', { subject: 'Plain' }))
    expect('due' in t).toBe(false)
    expect('owners' in t).toBe(false)
  })

  it('refuses a date that does not exist, a time, and a non-text value: nothing is created', () => {
    for (const due of ['2026-02-30', '2026-10-25T09:00:00Z', '10/25/2026', 20261025]) {
      const r = createAgentTask('a1', { subject: 'x', due: due as any }) as any
      expect(r.status).toBe(400)
      expect(JSON.stringify(r)).toContain('invalid_field')
    }
    expect(createAgentTask('a1', { subject: 'x', due: '2028-02-29' }).status).toBe(201)
    expect((ok(listAgentTasks('a1')) as any).tasks).toHaveLength(1)
  })

  it('refuses bad owners: a string, an invalid name, eleven of them', () => {
    expect((createAgentTask('a1', { subject: 'x', owners: 'a2' as any }) as any).status).toBe(400)
    expect((createAgentTask('a1', { subject: 'x', owners: ['../etc'] }) as any).status).toBe(400)
    expect((createAgentTask('a1', { subject: 'x', owners: Array.from({ length: 11 }, (_, i) => `ag${i}`) }) as any).status).toBe(400)
    expect((createAgentTask('a1', { subject: 'x', owners: Array.from({ length: 10 }, (_, i) => `ag${i}`) }) as any).status).toBe(201)
  })

  it('update: a new list REPLACES the old one, [] and null clear it, other edits leave it alone', () => {
    const id = task(createAgentTask('a1', { subject: 'x', due: '2026-10-25', owners: ['a2', 'a3'] })).id
    expect(task(updateAgentTask('a1', id, { owners: ['a3'] })).owners).toEqual(['a3'])
    expect(task(updateAgentTask('a1', id, { subject: 'renamed' })).owners).toEqual(['a3'])
    expect(task(updateAgentTask('a1', id, { subject: 'renamed again' })).due).toBe('2026-10-25')
    const cleared = task(updateAgentTask('a1', id, { owners: [] }))
    expect('owners' in cleared).toBe(false)
    expect(task(updateAgentTask('a1', id, { owners: ['a2'] })).owners).toEqual(['a2'])
    expect('owners' in task(updateAgentTask('a1', id, { owners: null as any }))).toBe(false)
  })

  it('update: a new date replaces, null clears, a bad one is refused and changes nothing', () => {
    const id = task(createAgentTask('a1', { subject: 'x', due: '2026-10-25' })).id
    expect(task(updateAgentTask('a1', id, { due: '2026-11-03' })).due).toBe('2026-11-03')
    const bad = updateAgentTask('a1', id, { due: '2026-02-30' }) as any
    expect(bad.status).toBe(400)
    expect((ok(listAgentTasks('a1')) as any).tasks[0].due).toBe('2026-11-03')
    expect('due' in task(updateAgentTask('a1', id, { due: null as any }))).toBe(false)
  })

  it('shows owners as names where this host knows the agent, and as given otherwise', () => {
    createAgentTask('a2', { subject: 'x', owners: ['a1', 'gamma', 'crab-cto@mini'] })
    const t = (ok(listAgentTasks('a2')) as any).tasks[0]
    expect(t.owners).toEqual(['a1', 'gamma', 'crab-cto@mini'])
    expect(t.ownerNames).toEqual(['Ana', 'gamma', 'crab-cto@mini'])
  })
})

describe('due date and owners: a team board', () => {
  it('create and update, with the assignee taken out of the owners', () => {
    const t = task(createTeamTask('t1', { subject: 'Team job', assigneeAgentId: 'a1', due: '2026-10-30', owners: ['a1', 'a2', 'a3'] }))
    expect(t.due).toBe('2026-10-30')
    expect(t.owners).toEqual(['a2', 'a3'])

    // reassigning to a2: a2 is now the primary and leaves the owners
    const moved = task(updateTeamTask('t1', t.id, { assigneeAgentId: 'a2', owners: ['a2', 'a3', 'a1'] }))
    expect(moved.owners).toEqual(['a3', 'a1'])
    expect(task(updateTeamTask('t1', t.id, { due: '2026-12-01' })).due).toBe('2026-12-01')
    expect(task(updateTeamTask('t1', t.id, { subject: 'renamed' })).owners).toEqual(['a3', 'a1'])
    expect('owners' in task(updateTeamTask('t1', t.id, { owners: [] }))).toBe(false)
    expect('due' in task(updateTeamTask('t1', t.id, { due: null }))).toBe(false)
  })

  it('refuses a bad date or bad owners without creating or changing anything', () => {
    expect((createTeamTask('t1', { subject: 'x', due: '2026-02-30' }) as any).status).toBe(400)
    expect((createTeamTask('t1', { subject: 'x', owners: ['bad name'] }) as any).status).toBe(400)
    const t = task(createTeamTask('t1', { subject: 'ok', assigneeAgentId: 'a1', due: '2026-10-30' }))
    expect((updateTeamTask('t1', t.id, { due: 'soon' }) as any).status).toBe(400)
    expect((updateTeamTask('t1', t.id, { owners: Array.from({ length: 11 }, (_, i) => `ag${i}`) }) as any).status).toBe(400)
    expect(task(updateTeamTask('t1', t.id, { subject: 'ok2' })).due).toBe('2026-10-30')
  })
})

describe('due date and owners: a project', () => {
  it('create and update, any agent on any host', () => {
    const pid = projectId()
    const t = task(createProjectTask(pid, { subject: 'Draft the plan', assigneeAgentId: 'crab-hr', due: '2026-10-28', owners: ['crab-hr', 'a2', 'crab-cto'] }))
    expect(t.due).toBe('2026-10-28')
    expect(t.owners).toEqual(['a2', 'crab-cto'])
    const u = task(updateProjectTask(pid, t.id, { owners: ['crab-product'], due: '2026-11-02' }))
    expect(u.owners).toEqual(['crab-product'])
    expect(u.due).toBe('2026-11-02')
    expect((updateProjectTask(pid, t.id, { due: '2026-04-31' }) as any).status).toBe(400)
    const cleared = task(updateProjectTask(pid, t.id, { owners: null as any, due: null as any }))
    expect('owners' in cleared).toBe(false)
    expect('due' in cleared).toBe(false)
    expect((ok(listProjectTasks(pid)) as any).tasks).toHaveLength(1)
  })
})

describe('a co-owner sees the card on their board (this host)', () => {
  const setup = () => {
    const own = task(createAgentTask('a1', { subject: 'On a1 board', owners: ['a2'] }))
    const teamCard = task(createTeamTask('t1', { subject: 'Team card', assigneeAgentId: 'a1', owners: ['beta'] })) // by name
    const pid = projectId()
    const projectCard = task(createProjectTask(pid, { subject: 'Project card', assigneeAgentId: 'a3', owners: ['a2'] }))
    return { own, teamCard, projectCard }
  }

  it('lists cards from another agent\'s board, a team and a project, marked shared, each once', () => {
    const { own, teamCard, projectCard } = setup()
    const board = (ok(getAgentBoard('a2')) as any).cards as any[]
    const byId = new Map(board.map(c => [c.id, c]))
    expect([...byId.keys()].sort()).toEqual([own.id, teamCard.id, projectCard.id].sort())
    expect(board).toHaveLength(3)
    expect(byId.get(own.id)).toMatchObject({ shared: true, scope: 'agent', ownerAgentId: 'a1' })
    expect(byId.get(teamCard.id)).toMatchObject({ shared: true, scope: 'team', teamId: 't1', teamName: 'Team One' })
    expect(byId.get(projectCard.id)).toMatchObject({ shared: true, scope: 'project', projectName: 'Consent banner' })
    expect(byId.get(own.id).hostId).toBe('self-host')
  })

  it('does not list a card on the agent\'s own board, or one assigned to it, as shared', () => {
    const mine = task(createAgentTask('a2', { subject: 'Mine', owners: ['a2', 'a3'] }))
    const assigned = task(createTeamTask('t1', { subject: 'Assigned to a2', assigneeAgentId: 'a2', owners: ['beta'] }))
    const board = (ok(getAgentBoard('a2')) as any).cards as any[]
    expect(board.filter(c => c.id === mine.id)).toHaveLength(1)
    expect(board.find(c => c.id === mine.id).shared).toBeUndefined()
    // team card assigned to a2 is a2's own team card (not shared), and appears once
    expect(board.filter(c => c.id === assigned.id)).toHaveLength(1)
    expect(board.find(c => c.id === assigned.id).shared).toBeUndefined()
  })

  it('leaves out completed cards and cards that do not list the agent', () => {
    const { own } = setup()
    updateAgentTask('a1', own.id, { status: 'completed' })
    task(createAgentTask('a1', { subject: 'Not shared with a2', owners: ['a3'] }))
    const board = (ok(getAgentBoard('a2')) as any).cards as any[]
    expect(board.map(c => c.subject).sort()).toEqual(['Project card', 'Team card'])
  })

  it('the cross-host answer: a host that does not know the agent matches by id or by the names it is sent', () => {
    // On this host an agent "remote-ana" does not exist; cards list it by id and by name
    task(createAgentTask('a1', { subject: 'By id', owners: ['zz9'] }))
    task(createAgentTask('a1', { subject: 'By name', owners: ['Ana-Remote'] }))
    task(createAgentTask('a1', { subject: 'Someone else', owners: ['other'] }))
    const byId = (ok(getSharedTasks('zz9')) as any).cards as any[]
    expect(byId.map(c => c.subject)).toEqual(['By id'])
    const byName = (ok(getSharedTasks('zz9', ['ana-remote', 'bad name'])) as any).cards as any[]
    expect(byName.map(c => c.subject).sort()).toEqual(['By id', 'By name'])
    expect(byName.every(c => c.shared === true && c.hostId === 'self-host')).toBe(true)
  })

  it('refuses an agent id that is empty or could climb out of a folder', () => {
    expect((getSharedTasks('') as any).status).toBe(400)
    expect((getSharedTasks('../../etc') as any).status).toBe(400)
  })

  it('sharedCardsFor never returns the agent\'s own cards, whoever owns the board', () => {
    task(createAgentTask('a1', { subject: 'a1 card owned by a1', owners: ['a1'] }))
    expect(sharedCardsFor('a1')).toEqual([])
  })
})

describe('the host-wide open list (Matrix, Org, Attention read this)', () => {
  it('a card is ONE row for its primary agent, with all owners on it; filtering by a co-owner finds it once', () => {
    task(createAgentTask('a1', { subject: 'Joint', owners: ['a2', 'a3'] }))
    const all = (ok(getOpenTasks()) as any).cards as any[]
    expect(all).toHaveLength(1)
    expect(all[0]).toMatchObject({ agentId: 'a1', owners: ['a2', 'a3'], ownerNames: ['beta', 'gamma'] })
    for (const who of ['a1', 'a2', 'a3', 'gamma']) {
      expect((ok(getOpenTasks({ agent: who })) as any).cards, who).toHaveLength(1)
    }
    expect((ok(getOpenTasks({ agent: 'nobody' })) as any).cards).toHaveLength(0)
  })

  it('carries the due date', () => {
    task(createAgentTask('a1', { subject: 'Late', due: '2026-10-19' }))
    expect(((ok(getOpenTasks()) as any).cards as any[])[0].due).toBe('2026-10-19')
  })
})
