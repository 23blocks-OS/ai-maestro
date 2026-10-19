import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import http from 'http'
import { spawn, execFileSync } from 'child_process'
import path from 'path'
import fs from 'fs'
import type { AddressInfo } from 'net'

// The agent's board command, run against a fake AI Maestro. Needs bash, curl and jq.
const script = path.join(__dirname, '../plugin/plugins/ai-maestro/scripts/aimaestro-task.sh')
const haveTools = (() => { try { execFileSync('jq', ['--version']); execFileSync('curl', ['--version']); return fs.existsSync(script) } catch { return false } })()

interface Seen { method: string; url: string; body: any }
const seen: Seen[] = []
let server: http.Server
let base = ''

const AGENT = 'agent-1'
const cards = [
  { id: 'aaaaaaaa-1111', scope: 'agent', subject: 'Ship the banner', status: 'pending', comments: [] },
  { id: 'aaaaaaaa-2222', scope: 'agent', subject: 'Fix the footer', status: 'waiting', waitingOn: 'juan', waitingNote: 'copy', comments: [{ author: { kind: 'operator' }, text: 'hi', createdAt: '2026-10-19T10:00:00Z' }] },
  { id: 'bbbbbbbb-3333', scope: 'team', teamId: 't1', teamName: 'Team One', subject: 'Team job', status: 'in_progress', comments: [] },
]

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let raw = ''
    req.on('data', c => { raw += c })
    req.on('end', () => {
      seen.push({ method: req.method || '', url: req.url || '', body: raw ? JSON.parse(raw) : undefined })
      const send = (code: number, obj: unknown) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)) }
      if (req.url === `/api/agents/${AGENT}/board`) return send(200, { cards })
      if (req.url === `/api/agents/${AGENT}/tasks` && req.method === 'POST') return send(201, { task: { id: 'cccccccc-4444' } })
      if (req.url === '/api/teams/t1/tasks' && req.method === 'POST') return send(201, { task: { id: 'dddddddd-5555' } })
      if (req.url === `/api/agents/${AGENT}/tasks/aaaaaaaa-2222` && req.method === 'PATCH' && JSON.parse(raw).status === 'completed') return send(400, { error: 'invalid_field', message: 'boom from the server' })
      if (/\/tasks\/[^/]+(\/comments)?$/.test(req.url || '')) return send(200, { ok: true })
      send(404, { error: 'not_found' })
    })
  })
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(() => { server.close() })

// Async on purpose: the fake API lives in this process, so a blocking spawn would starve it
function run(args: string[], env: Record<string, string> = {}): Promise<{ code: number | null; out: string; err: string }> {
  seen.length = 0
  return new Promise(resolve => {
    const child = spawn('bash', [script, ...args], { env: { PATH: process.env.PATH || '', AIMAESTRO_API: base, AIM_AGENT_ID: AGENT, ...env } })
    let out = ''
    let err = ''
    child.stdout.on('data', d => { out += d })
    child.stderr.on('data', d => { err += d })
    child.on('close', code => resolve({ code, out, err }))
  })
}
const writes = () => seen.filter(s => s.method !== 'GET')

describe.skipIf(!haveTools)('aimaestro-task.sh', () => {
  it('needs to know which agent it is', async () => {
    const r = await run(['list'], { AIM_AGENT_ID: '' })
    expect(r.code).toBe(1)
    expect(r.err).toContain('AIM_AGENT_ID')
  })

  it('add puts a card on the agent\'s own board', async () => {
    const r = await run(['add', 'Write the changelog', '--desc', 'for 0.85'])
    expect(r.code).toBe(0)
    expect(r.out).toContain('Added cccccccc')
    expect(writes()).toEqual([{ method: 'POST', url: `/api/agents/${AGENT}/tasks`, body: { subject: 'Write the changelog', description: 'for 0.85' } }])
  })

  it('add --team puts it on the team board, assigned to the agent', async () => {
    await run(['--team', 't1', 'add', 'Shared work'])
    expect(writes()[0]).toMatchObject({ method: 'POST', url: '/api/teams/t1/tasks', body: { subject: 'Shared work', assigneeAgentId: AGENT } })
  })

  it('add accepts --team after the subject too', async () => {
    await run(['add', 'Shared work', '--team', 't1'])
    expect(writes()[0]).toMatchObject({ method: 'POST', url: '/api/teams/t1/tasks', body: { subject: 'Shared work', assigneeAgentId: AGENT } })
  })

  it('a subject with quotes and $ stays one piece of text', async () => {
    await run(['add', 'Say "hi" $HOME `id` it\'s'])
    expect(writes()[0].body.subject).toBe('Say "hi" $HOME `id` it\'s')
  })

  it('start resolves a short id and moves the card on its own board', async () => {
    const r = await run(['start', 'aaaaaaaa-1'])
    expect(r.code).toBe(0)
    expect(writes()).toEqual([{ method: 'PATCH', url: `/api/agents/${AGENT}/tasks/aaaaaaaa-1111`, body: { status: 'in_progress' } }])
  })

  it('a team card is changed through the team API', async () => {
    await run(['done', 'bbbb'])
    expect(writes()).toEqual([{ method: 'PUT', url: '/api/teams/t1/tasks/bbbbbbbb-3333', body: { status: 'completed' } }])
  })

  it('an id that matches two cards is refused, and nothing is written', async () => {
    const r = await run(['start', 'aaaaaaaa'])
    expect(r.code).toBe(1)
    expect(r.err).toContain('More than one')
    expect(writes()).toEqual([])
  })

  it('an id that matches nothing is refused', async () => {
    const r = await run(['start', 'zzzz'])
    expect(r.code).toBe(1)
    expect(r.err).toContain("No card on your board starts with 'zzzz'")
  })

  it('wait needs --on and sends waitingOn and the note', async () => {
    expect((await run(['wait', 'aaaaaaaa-1'])).code).toBe(1)
    await run(['wait', 'aaaaaaaa-1', '--on', 'juan', '--note', 'needs the final copy'])
    expect(writes()[0].body).toEqual({ status: 'waiting', waitingOn: 'juan', waitingNote: 'needs the final copy' })
  })

  it('move refuses waiting (it needs a waiting-on) and unknown statuses', async () => {
    expect((await run(['move', 'aaaaaaaa-1', 'waiting'])).err).toContain('wait <id> --on')
    expect((await run(['move', 'aaaaaaaa-1', 'finished'])).err).toContain('Unknown status')
    expect(writes()).toEqual([])
  })

  it('comment is written as an agent comment, so it is never injected', async () => {
    await run(['comment', 'aaaaaaaa-1', 'Done the first half'])
    expect(writes()).toEqual([{ method: 'POST', url: `/api/agents/${AGENT}/tasks/aaaaaaaa-1111/comments`, body: { author: { kind: 'agent', id: AGENT }, text: 'Done the first half' } }])
  })

  it('list shows waiting-on, scope and comment counts, and filters', async () => {
    const all = await run(['list'])
    expect(all.out).toContain('aaaaaaaa  pending')
    expect(all.out).toContain('[waiting on juan: copy]')
    expect(all.out).toContain('(team: Team One)')
    expect(all.out).toContain('(1 comments)')
    const f = await run(['list', '--waiting-on', 'juan'])
    expect(f.out).toContain('Fix the footer')
    expect(f.out).not.toContain('Ship the banner')
    expect((await run(['list', '--waiting-on', 'outside'])).out).toContain('No cards.')
  })

  it('show prints one card with its comments', async () => {
    const r = await run(['show', 'aaaaaaaa-2'])
    expect(r.out).toContain('Subject:  Fix the footer')
    expect(r.out).toContain('Status:   waiting (on juan: copy)')
    expect(r.out).toContain('operator: hi')
  })

  it('a server error comes back as its message, with a failing exit code', async () => {
    const r = await run(['done', 'aaaaaaaa-2'])
    expect(r.code).toBe(1)
    expect(r.err).toContain('boom from the server')
  })

  it('AI Maestro not running is said plainly', async () => {
    const r = await run(['list'], { AIMAESTRO_API: 'http://127.0.0.1:1' })
    expect(r.code).toBe(1)
    expect(r.err).toContain('Could not reach AI Maestro')
  })
})
