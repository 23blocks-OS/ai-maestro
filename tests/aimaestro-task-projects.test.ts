import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import http from 'http'
import { spawn, execFileSync } from 'child_process'
import path from 'path'
import fs from 'fs'
import type { AddressInfo } from 'net'

// The project verbs of aimaestro-task.sh against a fake mesh of TWO AI Maestro hosts: this one (where the
// command talks) and a peer that stores a project. Needs bash, curl and jq.
const script = path.join(__dirname, '../plugin/plugins/ai-maestro/scripts/aimaestro-task.sh')
const haveTools = (() => { try { execFileSync('jq', ['--version']); execFileSync('curl', ['--version']); return fs.existsSync(script) && fs.readFileSync(script, 'utf8').includes('project_cards') } catch { return false } })()

interface Seen { host: 'self' | 'peer'; method: string; url: string; body: any }
const seen: Seen[] = []
let selfServer: http.Server
let peerServer: http.Server
let selfBase = ''
let peerBase = ''

const AGENT = 'agent-1'
const PID = 'pppppppp-1111-2222-3333-444444444444'
const PROJECT = { id: PID, name: 'Outreach', status: 'active', ownerAgentId: 'owner-9', hostId: 'peer', counts: { open: 2, waiting: 1, total: 3 } }
const projectCards = [
  { id: 'cccccccc-9999', scope: 'project', projectId: PID, projectName: 'Outreach', subject: 'Send the mails', status: 'in_progress', quadrant: 'q1', assigneeAgentId: AGENT, comments: [] },
]
const allCards = [
  ...projectCards,
  { id: 'dddddddd-8888', scope: 'project', projectId: PID, projectName: 'Outreach', subject: 'Call the vendor', status: 'waiting', waitingOn: 'juan', quadrant: null, assigneeAgentId: 'someone-else-id', assigneeName: 'Bea', comments: [] },
]

function makeServer(host: 'self' | 'peer', handler: (req: http.IncomingMessage, body: any, send: (c: number, o: unknown) => void) => boolean) {
  return http.createServer((req, res) => {
    let raw = ''
    req.on('data', c => { raw += c })
    req.on('end', () => {
      const body = raw ? JSON.parse(raw) : undefined
      seen.push({ host, method: req.method || '', url: req.url || '', body })
      const send = (code: number, obj: unknown) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)) }
      if (!handler(req, body, send)) send(404, { error: 'not_found' })
    })
  })
}

beforeAll(async () => {
  peerServer = makeServer('peer', (req, body, send) => {
    const url = req.url || ''
    if (url === '/api/projects') { if (req.method === 'GET') return send(200, { projects: [PROJECT] }), true }
    if (url === `/api/projects?assignee=${AGENT}`) return send(200, { projects: [{ ...PROJECT, cards: projectCards }] }), true
    if (url === `/api/projects/${PID}/tasks` && req.method === 'GET') return send(200, { project: PROJECT, tasks: allCards }), true
    if (url === `/api/projects/${PID}/tasks` && req.method === 'POST') return send(201, { task: { id: 'eeeeeeee-7777' } }), true
    if (/^\/api\/projects\/[^/]+\/tasks\/[^/]+(\/comments)?$/.test(url)) return send(200, { ok: true }), true
    return false
  })
  await new Promise<void>(r => peerServer.listen(0, '127.0.0.1', r))
  peerBase = `http://127.0.0.1:${(peerServer.address() as AddressInfo).port}`

  selfServer = makeServer('self', (req, body, send) => {
    const url = req.url || ''
    if (url === '/api/hosts') return send(200, { hosts: [{ id: 'self', url: 'http://not-used:23000', isSelf: true }, { id: 'peer', url: peerBase }, { id: 'off', url: 'http://127.0.0.1:1', enabled: false }] }), true
    if (url === '/api/agents') return send(200, { agents: [{ id: 'agent-1', name: 'me' }, { id: 'owner-9', name: 'owner-agent' }, { id: '11111111-2222-3333-4444-555555555555', name: 'beta', alias: 'B' }] }), true
    if (url === `/api/agents/${AGENT}/board`) return send(200, { cards: [{ id: 'aaaaaaaa-1111', scope: 'agent', subject: 'Own card', status: 'pending', quadrant: null, comments: [] }] }), true
    if (url === '/api/projects' && req.method === 'GET') return send(200, { projects: [] }), true
    if (url === '/api/projects' && req.method === 'POST') return send(201, { project: { id: 'ffffffff-0000-1111-2222-333333333333', hostId: 'self', name: body.name } }), true
    if (url === `/api/projects?assignee=${AGENT}`) return send(200, { projects: [] }), true
    return false
  })
  await new Promise<void>(r => selfServer.listen(0, '127.0.0.1', r))
  selfBase = `http://127.0.0.1:${(selfServer.address() as AddressInfo).port}`
})
afterAll(() => { selfServer.close(); peerServer.close() })

// Async on purpose: the fake hosts live in this process, so a blocking spawn would starve them
function run(args: string[], env: Record<string, string> = {}): Promise<{ code: number | null; out: string; err: string }> {
  seen.length = 0
  return new Promise(resolve => {
    const child = spawn('bash', [script, ...args], { env: { PATH: process.env.PATH || '', AIMAESTRO_API: selfBase, AIM_AGENT_ID: AGENT, ...env } })
    let out = ''
    let err = ''
    child.stdout.on('data', d => { out += d })
    child.stderr.on('data', d => { err += d })
    child.on('close', code => resolve({ code, out, err }))
  })
}
const writes = () => seen.filter(s => s.method !== 'GET')

describe.skipIf(!haveTools)('aimaestro-task.sh projects', () => {
  it('project list shows the projects of every enabled host with the reference other commands take', async () => {
    const r = await run(['project', 'list'])
    expect(r.code).toBe(0)
    expect(r.out).toContain('peer:pppppppp  active  Outreach  (2 open, 1 waiting)  [peer]')
    // the disabled host is not asked
    expect(seen.some(s => s.host === 'self' && s.url === '/api/hosts')).toBe(true)
  })

  it('project list says so when there is nothing', async () => {
    const r = await run(['project', 'list'], { AIMAESTRO_API: selfBase })
    expect(r.out).not.toContain('No projects.') // the peer has one
  })

  it('list includes the project cards assigned to me, labelled, next to my own', async () => {
    const r = await run(['list'])
    expect(r.out).toContain('Own card')
    expect(r.out).toContain('cccccccc  in_progress  Q1  Send the mails  (project: Outreach)')
    expect(r.out).not.toContain('Call the vendor') // not mine
  })

  it('a project card moves through the project\'s own host, with PUT', async () => {
    const r = await run(['done', 'cccccccc'])
    expect(r.code).toBe(0)
    const w = writes()
    expect(w).toEqual([{ host: 'peer', method: 'PUT', url: `/api/projects/${PID}/tasks/cccccccc-9999`, body: { status: 'completed' } }])
  })

  it('wait, place and comment work on a project card too, each on the project\'s host', async () => {
    await run(['wait', 'cccccccc', '--on', 'juan', '--note', 'needs the list'])
    expect(writes()[0]).toMatchObject({ host: 'peer', method: 'PUT', url: `/api/projects/${PID}/tasks/cccccccc-9999`, body: { status: 'waiting', waitingOn: 'juan', waitingNote: 'needs the list' } })
    await run(['place', 'cccccccc', 'q2'])
    expect(writes()[0]).toMatchObject({ host: 'peer', body: { urgent: false, important: true } })
    await run(['comment', 'cccccccc', 'sent half of them'])
    expect(writes()[0]).toMatchObject({ host: 'peer', method: 'POST', url: `/api/projects/${PID}/tasks/cccccccc-9999/comments`, body: { author: { kind: 'agent', id: AGENT }, text: 'sent half of them' } })
  })

  it('show prints the project and its quadrant', async () => {
    const r = await run(['show', 'cccccccc'])
    expect(r.out).toContain('Board:    project (Outreach)')
    expect(r.out).toContain('Quadrant: Q1')
  })

  it('add --project puts a card on the project on its host, assigned to me by default', async () => {
    const r = await run(['add', 'Draft the plan', '--project', 'peer:pppppppp'])
    expect(r.code).toBe(0)
    expect(r.out).toContain('Added eeeeeeee  Draft the plan  (project: Outreach)')
    expect(writes()).toEqual([{ host: 'peer', method: 'POST', url: `/api/projects/${PID}/tasks`, body: { subject: 'Draft the plan', assigneeAgentId: AGENT } }])
  })

  it('--assign gives the card to someone else, a name is turned into an id when the host knows it', async () => {
    await run(['add', 'Review it', '--project', 'peer:pppp', '--assign', 'beta'])
    expect(writes()[0].body.assigneeAgentId).toBe('11111111-2222-3333-4444-555555555555')
    await run(['add', 'Elsewhere', '--project', 'peer:pppp', '--assign', 'agent-on-another-host'])
    expect(writes()[0].body.assigneeAgentId).toBe('agent-on-another-host')
  })

  it('add --project accepts a plain start of the project id, takes --quadrant, and refuses a team as well', async () => {
    await run(['add', 'x', '--project', 'pppp', '--quadrant', 'q1'])
    expect(writes()[0].body).toMatchObject({ urgent: true, important: true })
    const both = await run(['--team', 't1', 'add', 'x', '--project', 'pppp'])
    expect(both.code).toBe(1)
    expect(both.err).toContain('not both')
    expect(writes()).toEqual([])
  })

  it('an unknown project is refused and nothing is written', async () => {
    const r = await run(['add', 'x', '--project', 'peer:zzzz'])
    expect(r.code).toBe(1)
    expect(r.err).toContain("No project starts with 'zzzz'")
    expect(writes()).toEqual([])
    const r2 = await run(['add', 'x', '--project', 'nohost:pppp'])
    expect(r2.code).toBe(1)
  })

  it('list --project shows every card of one project, with whom each is for', async () => {
    const r = await run(['list', '--project', 'peer:pppppppp'])
    expect(r.out).toContain('Project Outreach')
    expect(r.out).toContain('Send the mails')
    expect(r.out).toContain('-> agent-1'.slice(0, 5)) // assignee shown (id start)
    expect(r.out).toContain('Call the vendor')
    expect(r.out).toContain('-> Bea')
    expect(r.out).toContain('[waiting on juan]')
  })

  it('project show prints the header and the cards', async () => {
    const r = await run(['project', 'show', 'peer:pppppppp'])
    expect(r.out).toContain('Project Outreach  (active)  owner: owner-9')
    expect(r.out).toContain('Call the vendor')
  })

  it('project add starts a project owned by me on the host the command talks to, and prints its reference', async () => {
    const r = await run(['project', 'add', 'New campaign', '--desc', 'for Q4'])
    expect(r.code).toBe(0)
    expect(writes()).toEqual([{ host: 'self', method: 'POST', url: '/api/projects', body: { name: 'New campaign', ownerAgentId: AGENT, description: 'for Q4' } }])
    expect(r.out).toMatch(/Project [^ ]+:ffffffff-0000-1111-2222-333333333333  New campaign/)
  })

  it('project add with --owner resolves a name to an id', async () => {
    await run(['project', 'add', 'Owned', '--owner', 'beta'])
    expect(writes()[0].body.ownerAgentId).toBe('11111111-2222-3333-4444-555555555555')
  })

  it('a host that is down does not break list: its cards are simply missing', async () => {
    const r = await run(['list'], { AIMAESTRO_API: selfBase })
    expect(r.code).toBe(0)
  })

  it('unknown project sub-command and missing name are refused', async () => {
    expect((await run(['project', 'zap'])).err).toContain("Unknown project command 'zap'")
    expect((await run(['project', 'add'])).err).toContain('project add needs a name')
  })
})
