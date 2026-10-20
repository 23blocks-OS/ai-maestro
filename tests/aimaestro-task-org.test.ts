import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import http from 'http'
import { spawn, execFileSync } from 'child_process'
import path from 'path'
import fs from 'fs'
import type { AddressInfo } from 'net'

// The organization verbs of aimaestro-task.sh against a fake mesh of TWO hosts: the one the command talks to
// and a peer that holds another organization record. Needs bash, curl and jq.
const script = path.join(__dirname, '../plugin/plugins/ai-maestro/scripts/aimaestro-task.sh')
const haveTools = (() => { try { execFileSync('jq', ['--version']); execFileSync('curl', ['--version']); return fs.existsSync(script) && fs.readFileSync(script, 'utf8').includes('org label') } catch { return false } })()

interface Seen { host: 'self' | 'peer'; method: string; url: string; body: any }
const seen: Seen[] = []
let selfServer: http.Server
let peerServer: http.Server
let selfBase = ''
let peerBase = ''
const AGENT = 'agent-1'
const TEAM_CARD = 'tttttttt-1111'

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
  peerServer = makeServer('peer', (req, _b, send) => {
    if (req.url === '/api/orgs') return send(200, { organizations: [{ id: 'acme', name: 'Acme', description: 'A customer', hostId: 'peer' }] }), true
    if (req.url === `/api/projects?assignee=${AGENT}`) return send(200, { projects: [] }), true
    return false
  })
  await new Promise<void>(r => peerServer.listen(0, '127.0.0.1', r))
  peerBase = `http://127.0.0.1:${(peerServer.address() as AddressInfo).port}`

  selfServer = makeServer('self', (req, body, send) => {
    const url = req.url || ''
    if (url === '/api/hosts') return send(200, { hosts: [{ id: 'self', url: 'http://not-used:23000', isSelf: true }, { id: 'peer', url: peerBase }] }), true
    if (url === '/api/orgs' && req.method === 'GET') return send(200, { organizations: [{ id: '3metas', name: '3Metas', hostId: 'self' }], defaultOrg: '3metas' }), true
    if (url === '/api/orgs/default' && req.method === 'GET') return send(200, { defaultOrg: 'personal' }), true
    if (url === '/api/orgs/default' && req.method === 'PUT') return send(200, { defaultOrg: body.id }), true
    if (url === '/api/orgs' && req.method === 'POST') return send(201, { organization: { id: body.id || 'newco', name: body.name } }), true
    if (url === `/api/agents/${AGENT}/board`) return send(200, { cards: [
      { id: 'aaaaaaaa-1111', scope: 'agent', subject: 'Invoice', status: 'pending', quadrant: null, org: 'acme', comments: [] },
      { id: TEAM_CARD, scope: 'team', teamId: 'team-1', subject: 'Team card', status: 'pending', quadrant: null, comments: [] },
    ] }), true
    if (url === `/api/projects?assignee=${AGENT}`) return send(200, { projects: [] }), true
    if (url === `/api/agents/${AGENT}/tasks` && req.method === 'POST') return send(201, { task: { id: 'bbbbbbbb-2222' } }), true
    if (/^\/api\/agents\/agent-1\/tasks\/[^/]+$/.test(url)) return send(200, { ok: true }), true
    return false
  })
  await new Promise<void>(r => selfServer.listen(0, '127.0.0.1', r))
  selfBase = `http://127.0.0.1:${(selfServer.address() as AddressInfo).port}`
})
afterAll(() => { selfServer.close(); peerServer.close() })

// Async on purpose: the fake hosts live in this process, so a blocking spawn would starve them
function run(args: string[]): Promise<{ code: number | null; out: string; err: string }> {
  seen.length = 0
  return new Promise(resolve => {
    const child = spawn('bash', [script, ...args], { env: { PATH: process.env.PATH || '', AIMAESTRO_API: selfBase, AIM_AGENT_ID: AGENT } })
    let out = ''
    let err = ''
    child.stdout.on('data', d => { out += d })
    child.stderr.on('data', d => { err += d })
    child.on('close', code => resolve({ code, out, err }))
  })
}
const writes = () => seen.filter(s => s.method !== 'GET')

describe.skipIf(!haveTools)('aimaestro-task.sh organizations', () => {
  it('org list shows the records of every host, with the host that holds each', async () => {
    const r = await run(['org', 'list'])
    expect(r.code).toBe(0)
    expect(r.out).toContain('3metas  3Metas  [self]  (default)')
    expect(r.out).not.toContain('acme  Acme  - A customer  [peer]  (default)')
    expect(r.out).toContain('acme  Acme  - A customer  [peer]')
  })

  it('org add posts the name (and an explicit id) to the host the command talks to', async () => {
    const r = await run(['org', 'add', 'New Co', '--id', 'new-co', '--desc', 'Prospect'])
    expect(r.code).toBe(0)
    expect(r.out).toContain('Organization new-co')
    expect(writes()).toEqual([{ host: 'self', method: 'POST', url: '/api/orgs', body: { name: 'New Co', id: 'new-co', description: 'Prospect' } }])
  })

  it('org default shows the default, and sets it with a value', async () => {
    expect((await run(['org', 'default'])).out).toContain('Default organization: personal')
    const r = await run(['org', 'default', 'home'])
    expect(r.out).toContain('Default organization: home')
    expect(writes()).toEqual([{ host: 'self', method: 'PUT', url: '/api/orgs/default', body: { id: 'home' } }])
  })

  it('add --org labels the new card', async () => {
    const r = await run(['add', 'Send the invoice', '--org', 'acme'])
    expect(r.code).toBe(0)
    expect(writes()[0]).toMatchObject({ method: 'POST', url: `/api/agents/${AGENT}/tasks`, body: { subject: 'Send the invoice', org: 'acme' } })
  })

  it('add --org on a team board is refused before anything is sent', async () => {
    const r = await run(['add', 'x', '--team', 'team-1', '--org', 'acme'])
    expect(r.code).not.toBe(0)
    expect(r.err).toContain('team board does not keep an organization label')
    expect(writes()).toEqual([])
  })

  it('org label sets and clears the label on a card', async () => {
    await run(['org', 'label', 'aaaaaaaa', '3metas'])
    expect(writes()[0]).toMatchObject({ method: 'PATCH', url: `/api/agents/${AGENT}/tasks/aaaaaaaa-1111`, body: { org: '3metas' } })
    await run(['org', 'label', 'aaaaaaaa', 'none'])
    expect(writes()[0]).toMatchObject({ body: { org: null } })
  })

  it('org label on a team card is refused', async () => {
    const r = await run(['org', 'label', 'tttttttt', 'acme'])
    expect(r.code).not.toBe(0)
    expect(writes()).toEqual([])
  })

  it('show prints the card\'s organization', async () => {
    const r = await run(['show', 'aaaaaaaa'])
    expect(r.out).toContain('Org:      acme')
  })
})
