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
  { id: 'aaaaaaaa-1111', scope: 'agent', subject: 'Ship the banner', status: 'pending', quadrant: 'q1', comments: [] },
  { id: 'aaaaaaaa-2222', scope: 'agent', subject: 'Fix the footer', status: 'waiting', waitingOn: 'juan', waitingNote: 'copy', quadrant: null, comments: [{ author: { kind: 'operator' }, text: 'hi', createdAt: '2026-10-19T10:00:00Z' }] },
  { id: 'bbbbbbbb-3333', scope: 'team', teamId: 't1', teamName: 'Team One', subject: 'Team job', status: 'in_progress', quadrant: 'q3', comments: [] },
]

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let raw = ''
    req.on('data', c => { raw += c })
    req.on('end', () => {
      seen.push({ method: req.method || '', url: req.url || '', body: raw ? JSON.parse(raw) : undefined })
      const send = (code: number, obj: unknown) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)) }
      if (req.url === `/api/agents/${AGENT}/board`) return send(200, { cards })
      if (req.url === `/api/agents/${AGENT}/tasks` && req.method === 'GET') return send(200, { tasks: [{ subject: 'T1 Already here' }] })
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
    expect(writes()).toEqual([{ method: 'POST', url: `/api/agents/${AGENT}/tasks`, body: { subject: 'Write the changelog', description: 'for 0.85', origin: { agentId: AGENT, repo: expect.any(String) } } }])
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

  describe('the Eisenhower matrix', () => {
    it('place sets both answers: q1 urgent+important, q2 important only, q3 urgent only, q4 neither', async () => {
      const table: Array<[string, boolean, boolean]> = [['q1', true, true], ['q2', false, true], ['q3', true, false], ['q4', false, false]]
      for (const [q, urgent, important] of table) {
        const r = await run(['place', 'aaaaaaaa-1', q])
        expect(r.code, q).toBe(0)
        expect(writes()).toEqual([{ method: 'PATCH', url: `/api/agents/${AGENT}/tasks/aaaaaaaa-1111`, body: { urgent, important } }])
      }
    })

    it('place none takes the card off the matrix with nulls, not false (false/false would be q4)', async () => {
      await run(['place', 'aaaaaaaa-1', 'none'])
      expect(writes()[0].body).toEqual({ urgent: null, important: null })
    })

    it('place refuses an unknown quadrant and writes nothing', async () => {
      const r = await run(['place', 'aaaaaaaa-1', 'q5'])
      expect(r.code).toBe(1)
      expect(r.err).toContain("Unknown quadrant 'q5'")
      expect(writes()).toEqual([])
      expect((await run(['place', 'aaaaaaaa-1'])).err).toContain('place needs a quadrant')
    })

    it('place on a team card goes through the team API', async () => {
      await run(['place', 'bbbb', 'q2'])
      expect(writes()).toEqual([{ method: 'PUT', url: '/api/teams/t1/tasks/bbbbbbbb-3333', body: { urgent: false, important: true } }])
    })

    it('add --quadrant creates the card already placed', async () => {
      await run(['add', 'Placed from the start', '--quadrant', 'q2'])
      expect(writes()[0]).toMatchObject({ method: 'POST', url: `/api/agents/${AGENT}/tasks`, body: { subject: 'Placed from the start', urgent: false, important: true } })
      const bad = await run(['add', 'x', '--quadrant', 'nope'])
      expect(bad.code).toBe(1)
      expect(writes()).toEqual([])
    })

    it('list shows the quadrant letter ("--" when not placed) and filters by it', async () => {
      const all = await run(['list'])
      expect(all.out).toContain('aaaaaaaa  pending      Q1  Ship the banner')
      expect(all.out).toContain('waiting      --  Fix the footer')
      const q1 = await run(['list', '--quadrant', 'q1'])
      expect(q1.out).toContain('Ship the banner')
      expect(q1.out).not.toContain('Fix the footer')
      const none = await run(['list', '--quadrant', 'unplaced'])
      expect(none.out).toContain('Fix the footer')
      expect(none.out).not.toContain('Ship the banner')
      expect((await run(['list', '--quadrant', 'q2'])).out).toContain('No cards.')
      expect((await run(['list', '--quadrant', 'x'])).code).toBe(1)
    })

    it('show says where the card is on the matrix', async () => {
      expect((await run(['show', 'aaaaaaaa-1'])).out).toContain('Quadrant: Q1')
      expect((await run(['show', 'aaaaaaaa-2'])).out).toContain('Quadrant: not placed')
    })
  })
})

describe.skipIf(!haveTools)('aimaestro-task.sh park, origin and schema', () => {
  it('park puts a backlog card with its kind and origin on the agent\'s own board', async () => {
    const r = await run(['park', 'Flaky test in sync', '--kind', 'bug', '--note', 'saw it fixing the hook', '--thread', 'msg_17'], { AIM_SESSION_ID: 'sess-9' })
    expect(r.code).toBe(0)
    expect(r.out).toContain('Parked cccccccc')
    expect(r.out).toContain('[bug]')
    expect(writes()).toHaveLength(1)
    expect(writes()[0]).toMatchObject({
      method: 'POST', url: `/api/agents/${AGENT}/tasks`,
      body: { subject: 'Flaky test in sync', status: 'backlog', kind: 'bug', origin: { agentId: AGENT, sessionId: 'sess-9', threadId: 'msg_17', note: 'saw it fixing the hook' } },
    })
  })

  it('park defaults to a task, and refuses an unknown kind before calling the server', async () => {
    await run(['park', 'Look into caching'])
    expect(writes()[0].body).toMatchObject({ status: 'backlog', kind: 'task' })
    const bad = await run(['park', 'x', '--kind', 'epic'])
    expect(bad.code).toBe(1)
    expect(bad.err).toContain('Unknown kind')
    expect(writes()).toHaveLength(0)
  })

  it('park --team parks on the team board and does not assign it to the parker', async () => {
    await run(['park', 'Idea: dark map', '--kind', 'idea', '--team', 't1'])
    expect(writes()[0]).toMatchObject({ method: 'POST', url: '/api/teams/t1/tasks', body: { kind: 'idea', status: 'backlog' } })
    expect(writes()[0].body.assigneeAgentId).toBeUndefined()
  })

  it('add records where the card came from', async () => {
    await run(['add', 'Write the changelog'])
    expect(writes()[0].body.origin).toMatchObject({ agentId: AGENT })
  })

  it('schema is valid JSON, lists park and schema, and needs no agent id', async () => {
    const r = await run(['schema'], { AIM_AGENT_ID: '' })
    expect(r.code).toBe(0)
    const doc = JSON.parse(r.out)
    expect(doc.tool).toBe('aimaestro-task.sh')
    const names = doc.commands.map((c: { name: string }) => c.name)
    expect(names).toEqual(expect.arrayContaining(['add', 'park', 'wait', 'list', 'schema']))
    expect(doc.kinds).toEqual(['task', 'idea', 'bug', 'research'])
    expect(doc.exit_codes['0']).toBeTruthy()
    expect(seen).toHaveLength(0)
  })
})

describe.skipIf(!haveTools)('meeting-task.sh schema', () => {
  it('prints valid JSON that lists the commands, and help stops at the usage text', () => {
    const script = path.join(__dirname, '../scripts/meeting-task.sh')
    const doc = JSON.parse(execFileSync('bash', [script, 'schema'], { encoding: 'utf8' }))
    expect(doc.commands.map((c: { name: string }) => c.name)).toEqual(['create', 'update', 'move', 'list', 'delete', 'schema'])
    const help = execFileSync('bash', [script, '--help'], { encoding: 'utf8' })
    expect(help).toContain('meeting-task.sh schema')
    expect(help).not.toContain('set -euo pipefail')
  })
})

describe.skipIf(!haveTools)('aimaestro-task.sh import', () => {
  const file = (items: unknown) => { const f = path.join(fs.mkdtempSync(path.join(require('os').tmpdir(), 'aim-import-')), 'tasks.json'); fs.writeFileSync(f, typeof items === 'string' ? items : JSON.stringify(items)); return f }

  it('adds each card with its quadrant, status and origin, and skips a subject already on the board', async () => {
    const f = file([
      { subject: 'T1 Already here', quadrant: 'q1' },
      { subject: 'T2 Fix the banner', quadrant: 'q1', status: 'in_progress', description: 'copy' },
      { subject: 'T3 Wait for copy', quadrant: 'q2', status: 'waiting', waitingOn: 'juan', waitingNote: 'final text' },
      { subject: 'T4 Plain' },
    ])
    const r = await run(['import', f])
    expect(r.code).toBe(0)
    expect(r.out).toContain('Added 3, skipped 1 already on your board, failed 0 (of 4)')
    const w = writes()
    expect(w).toHaveLength(3)
    expect(w[0].body).toMatchObject({ subject: 'T2 Fix the banner', status: 'in_progress', description: 'copy', urgent: true, important: true, origin: { agentId: AGENT } })
    expect(w[1].body).toMatchObject({ subject: 'T3 Wait for copy', status: 'waiting', waitingOn: 'juan', waitingNote: 'final text', urgent: false, important: true })
    expect(w[2].body.status).toBeUndefined()
    expect(w[2].body.urgent).toBeUndefined()
  })

  it('a repeated subject inside the list is added once', async () => {
    const r = await run(['import', file([{ subject: 'Twice' }, { subject: ' Twice ' }])])
    expect(r.out).toContain('Added 1, skipped 1')
    expect(writes()).toHaveLength(1)
  })

  it('--dry-run reports and writes nothing', async () => {
    const r = await run(['import', file([{ subject: 'A' }, { subject: 'B' }]), '--dry-run'])
    expect(r.out).toContain('Would add 2')
    expect(writes()).toHaveLength(0)
  })

  it('checks every item first: one bad item and nothing is added', async () => {
    const r = await run(['import', file([{ subject: 'Good' }, { subject: 'Bad', quadrant: 'q9' }, { subject: 'No wait target', status: 'waiting' }, { status: 'pending' }])])
    expect(r.code).toBe(1)
    expect(writes()).toHaveLength(0)
    expect(r.err).toContain('unknown quadrant q9')
    expect(r.err).toContain('needs waitingOn')
    expect(r.err).toContain('subject is required')
    expect(r.err).toContain('Nothing was added')
  })

  it('refuses a file that is not a list, or not JSON', async () => {
    expect((await run(['import', file({ subject: 'x' })])).err).toContain('JSON list')
    expect((await run(['import', file('not json')])).code).toBe(1)
    expect((await run(['import', '/nonexistent.json'])).err).toContain('Cannot read')
    expect(writes()).toHaveLength(0)
  })

  it('schema lists import', async () => {
    const doc = JSON.parse((await run(['schema'], { AIM_AGENT_ID: '' })).out)
    expect(doc.commands.map((c: { name: string }) => c.name)).toContain('import')
  })
})

describe.skipIf(!haveTools)('aimaestro-task.sh delete', () => {
  it('removes a card from the agent\'s own board', async () => {
    const r = await run(['delete', 'aaaaaaaa-1'])
    expect(r.code).toBe(0)
    expect(r.out).toContain('Deleted aaaaaaaa')
    expect(writes()).toEqual([{ method: 'DELETE', url: `/api/agents/${AGENT}/tasks/aaaaaaaa-1111`, body: undefined }])
  })

  it('refuses a team card and writes nothing', async () => {
    const r = await run(['delete', 'bbbbbbbb-3'])
    expect(r.code).toBe(1)
    expect(r.err).toContain('own board')
    expect(writes()).toHaveLength(0)
  })

  it('needs a card id that exists', async () => {
    expect((await run(['delete', 'zzzzzzzz'])).code).toBe(1)
    expect(writes()).toHaveLength(0)
  })
})

describe.skipIf(!haveTools)('aimaestro-task.sh due and owners', () => {
  const file = (items: unknown) => { const f = path.join(fs.mkdtempSync(path.join(require('os').tmpdir(), 'aim-due-')), 'tasks.json'); fs.writeFileSync(f, JSON.stringify(items)); return f }

  it('add --due and --owner send the date and the other owners', async () => {
    await run(['add', 'Ship it', '--due', '2026-10-31', '--owner', 'agent-two', '--owner', 'agent-three'])
    expect(writes()[0].body).toMatchObject({ subject: 'Ship it', due: '2026-10-31', owners: ['agent-two', 'agent-three'] })
  })

  it('add refuses a date that is not YYYY-MM-DD before calling the server', async () => {
    const r = await run(['add', 'x', '--due', '31/10/2026'])
    expect(r.code).toBe(1)
    expect(r.err).toContain('--due must be a date')
    expect(writes()).toHaveLength(0)
  })

  it('due sets and clears the date on the agent board and on a team card', async () => {
    await run(['due', 'aaaaaaaa-1', '2026-11-02'])
    expect(writes()[0]).toMatchObject({ method: 'PATCH', url: `/api/agents/${AGENT}/tasks/aaaaaaaa-1111`, body: { due: '2026-11-02' } })
    await run(['due', 'aaaaaaaa-1', 'none'])
    expect(writes()[0].body).toEqual({ due: null })
    await run(['due', 'bbbbbbbb-3', '2026-11-02'])
    expect(writes()[0]).toMatchObject({ method: 'PUT', url: '/api/teams/t1/tasks/bbbbbbbb-3333', body: { due: '2026-11-02' } })
    expect((await run(['due', 'aaaaaaaa-1', 'tomorrow'])).code).toBe(1)
  })

  it('owners replaces the list, and none clears it', async () => {
    await run(['owners', 'aaaaaaaa-1', 'agent-two', 'agent-three'])
    expect(writes()[0]).toMatchObject({ method: 'PATCH', body: { owners: ['agent-two', 'agent-three'] } })
    await run(['owners', 'aaaaaaaa-1', 'none'])
    expect(writes()[0].body).toEqual({ owners: [] })
    expect((await run(['owners', 'aaaaaaaa-1'])).code).toBe(1)
  })

  it('import carries due and owners, and checks them first', async () => {
    const ok = await run(['import', file([{ subject: 'T9 With date', due: '2026-12-01', owners: ['a', 'b'] }])])
    expect(ok.code).toBe(0)
    expect(writes()[0].body).toMatchObject({ due: '2026-12-01', owners: ['a', 'b'] })
    const bad = await run(['import', file([{ subject: 'ok' }, { subject: 'Bad date', due: 'soon' }, { subject: 'Bad owners', owners: 'agent-two' }])])
    expect(bad.code).toBe(1)
    expect(writes()).toHaveLength(0)
    expect(bad.err).toContain('due must be a date')
    expect(bad.err).toContain('owners must be a list')
  })

  it('schema lists due, owners and --overdue', async () => {
    const doc = JSON.parse((await run(['schema'], { AIM_AGENT_ID: '' })).out)
    expect(doc.commands.map((c: { name: string }) => c.name)).toEqual(expect.arrayContaining(['due', 'owners']))
    expect(JSON.stringify(doc.commands.find((c: { name: string }) => c.name === 'list'))).toContain('--overdue')
  })
})

describe.skipIf(!haveTools)('aimaestro-task.sh shows due dates and owners', () => {
  const late = { id: 'ffffffff-0001', scope: 'agent', subject: 'Late job', status: 'pending', quadrant: 'q1', due: '2020-01-01', owners: ['b2c3d4e5-0000-4000-8000-000000000001', 'x'], comments: [] }
  const later = { id: 'ffffffff-0002', scope: 'agent', subject: 'Far job', status: 'pending', quadrant: 'q2', due: '2999-01-01', comments: [] }
  const done = { id: 'ffffffff-0003', scope: 'agent', subject: 'Old finished', status: 'completed', quadrant: null, due: '2020-01-01', comments: [] }
  it('list marks an overdue open card and counts owners; --overdue shows only overdue open cards', async () => {
    cards.push(late, later, done)
    try {
      const all = await run(['list'])
      expect(all.out).toContain('[due 2020-01-01 OVERDUE]')
      expect(all.out).toContain('[+2 owners]')
      expect(all.out).toContain('[due 2999-01-01]')
      const od = await run(['list', '--overdue'])
      expect(od.out).toContain('Late job')
      expect(od.out).not.toContain('Far job')
      expect(od.out).not.toContain('Old finished')
      expect(od.out).not.toContain('Ship the banner')
    } finally { cards.splice(cards.indexOf(late), 1); cards.splice(cards.indexOf(later), 1); cards.splice(cards.indexOf(done), 1) }
  })
  it('show prints the due date and the owners', async () => {
    cards.push(late)
    try {
      const r = await run(['show', 'ffffffff-0001'])
      expect(r.out).toContain('Due:      2020-01-01')
      expect(r.out).toContain('Owners:   b2c3d4e5, x')
    } finally { cards.splice(cards.indexOf(late), 1) }
  })
})
