import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import { clean, identify, load, quadrantOf, render, statusText, summarize, type Card, type IO } from '../hooks/register'

const START = { cwd: '/w', surface: 'terminal', isInteractive: true } as any
const ME = '4b00f39a-5a1f-48f6-a10a-e4cad95fbfa8'
const API = 'http://localhost:23000'

const card = (over: Partial<Card> = {}): Card => ({ id: 'aaaaaaaa-1111', subject: 'A task', status: 'pending', quadrant: null, ...over })
const server = (cards: unknown[]) => JSON.stringify({ cards })
const file = (tasks: unknown[]) => JSON.stringify({ version: 1, tasks })

/** The world in memory: what the environment holds, what curl would return per URL, which files exist. */
function world(over: { env?: Record<string, string>; urls?: Record<string, string | null>; files?: Record<string, string> } = {}) {
  const env = { HOME: '/h', ...(over.env ?? {}) }
  const urls = over.urls ?? {}
  const files = over.files ?? {}
  const ran: string[][] = []
  const io: IO = {
    env: async n => env[n],
    run: async argv => {
      ran.push(argv)
      const url = argv[argv.length - 1]
      return url in urls && urls[url] !== null ? { exitCode: 0, stdout: urls[url] as string } : { exitCode: 22, stdout: '' }
    },
    read: async p => (p in files ? files[p] : null),
  }
  return { io, ran, env, urls, files }
}

test('which agent: the option first, then the session\'s own ids, then the AMP folder, then a name', async () => {
  expect(await identify(world({ env: { AIM_AGENT_ID: 'sess-id' } }).io, 'from-option')).toEqual({ id: 'from-option' })
  expect(await identify(world({ env: { AIM_AGENT_ID: 'sess-id', CLAUDE_AGENT_ID: 'c-id' } }).io, '')).toEqual({ id: 'sess-id' })
  expect(await identify(world({ env: { CLAUDE_AGENT_ID: 'c-id' } }).io, undefined)).toEqual({ id: 'c-id' })
  expect(await identify(world({ env: { AMP_DIR: `/h/.agent-messaging/agents/${ME}/` } }).io, '')).toEqual({ id: ME })
  expect(await identify(world({ env: { AIM_AGENT_NAME: 'pas-lola' } }).io, '')).toEqual({ name: 'pas-lola' })
  expect(await identify(world({ env: { CLAUDE_AGENT_NAME: 'lola' } }).io, '')).toEqual({ name: 'lola' })
  expect(await identify(world().io, '')).toEqual({})
})

test('an id that could climb out of a folder is never used', async () => {
  for (const bad of ['../etc', 'a/b', '..', '.hidden', 'x y', '']) {
    expect(await identify(world({ env: { AIM_AGENT_ID: bad } }).io, '')).toEqual({})
    expect(await identify(world().io, bad)).toEqual({})
  }
})

test('the server\'s board is used when it answers, with its quadrant and team cards', async () => {
  const w = world({ env: { AIM_AGENT_ID: ME }, urls: { [`${API}/api/agents/${ME}/board`]: server([
    { id: 'a1', subject: 'Own', status: 'in_progress', quadrant: 'q1', scope: 'agent' },
    { id: 'b2', subject: 'Team job', status: 'pending', quadrant: null, scope: 'team', teamName: 'Dev' },
  ]) } })
  const r = await load(w.io, '', '')
  expect(r?.source).toBe('server')
  expect(r?.cards.map(c => [c.id, c.quadrant, c.teamName])).toEqual([['a1', 'q1', undefined], ['b2', null, 'Dev']])
  expect(w.ran[0].slice(0, 5)).toEqual(['curl', '-sS', '--max-time', '5', '-f'])
})

test('no server: the board file is read, and the quadrant is worked out from the two answers', async () => {
  const w = world({ env: { AIM_AGENT_ID: ME }, files: { [`/h/.aimaestro/agents/${ME}/tasks.json`]: file([
    { id: 'a1', subject: 'x', status: 'pending', urgent: true, important: false },
    { id: 'a2', subject: 'y', status: 'pending', urgent: false, important: false },
    { id: 'a3', subject: 'z', status: 'pending' },
    { id: 'a4', subject: 'half', status: 'pending', urgent: true },
  ]) } })
  const r = await load(w.io, '', '')
  expect(r?.source).toBe('file')
  expect(r?.cards.map(c => c.quadrant)).toEqual(['q3', 'q4', null, null])
})

test('a server that answers with rubbish falls back to the file; no server and no file is null', async () => {
  const w = world({ env: { AIM_AGENT_ID: ME }, urls: { [`${API}/api/agents/${ME}/board`]: '<html>proxy error</html>' },
    files: { [`/h/.aimaestro/agents/${ME}/tasks.json`]: file([{ id: 'a1', subject: 's', status: 'pending' }]) } })
  expect((await load(w.io, '', ''))?.source).toBe('file')
  expect(await load(world({ env: { AIM_AGENT_ID: ME } }).io, '', '')).toBeNull()
  expect(await load(world({ env: { AIM_AGENT_ID: ME }, files: { [`/h/.aimaestro/agents/${ME}/tasks.json`]: '{ not json' } }).io, '', '')).toBeNull()
})

test('only a name: the server is asked which agent that is', async () => {
  const w = world({ env: { AIM_AGENT_NAME: 'pas-lola' }, urls: {
    [`${API}/api/agents`]: JSON.stringify({ agents: [{ id: 'other-id', name: 'x' }, { id: ME, name: 'pas-lola' }] }),
    [`${API}/api/agents/${ME}/board`]: server([{ id: 'a1', subject: 's', status: 'pending' }]),
  } })
  const r = await load(w.io, '', '')
  expect(r?.id).toBe(ME)
  expect(r?.source).toBe('server')
  expect(await load(world({ env: { AIM_AGENT_NAME: 'pas-lola' } }).io, '', '')).toBeNull()
})

test('the AI Maestro address: the option, then AIMAESTRO_API, then localhost', async () => {
  const board = server([{ id: 'a1', subject: 's', status: 'pending' }])
  const a = world({ env: { AIM_AGENT_ID: ME }, urls: { [`http://10.0.0.5:23000/api/agents/${ME}/board`]: board } })
  expect((await load(a.io, '', 'http://10.0.0.5:23000/'))?.source).toBe('server')
  const b = world({ env: { AIM_AGENT_ID: ME, AIMAESTRO_API: 'http://mini:23000' }, urls: { [`http://mini:23000/api/agents/${ME}/board`]: board } })
  expect((await load(b.io, '', ''))?.source).toBe('server')
})

test('the count leaves out finished and backlog cards, and says how many wait on you', () => {
  const list = [card({ status: 'completed' }), card({ status: 'backlog' }), card({ status: 'pending' }),
    card({ status: 'waiting', waitingOn: 'juan' }), card({ status: 'waiting', waitingOn: 'outside' })]
  expect(summarize(list)).toEqual({ open: 3, waitingOnMe: 1 })
  expect(statusText(summarize(list))).toBe('board: 3 open, 1 waiting on you')
  expect(statusText({ open: 2, waitingOnMe: 0 })).toBe('board: 2 open')
  expect(statusText({ open: 0, waitingOnMe: 0 })).toBeUndefined()
  expect(statusText(null)).toBeUndefined()
})

test('false/false is q4 and a missing answer is not placed', () => {
  expect(quadrantOf(true, true)).toBe('q1')
  expect(quadrantOf(false, true)).toBe('q2')
  expect(quadrantOf(true, false)).toBe('q3')
  expect(quadrantOf(false, false)).toBe('q4')
  expect(quadrantOf(null, null)).toBeNull()
  expect(quadrantOf(undefined, true)).toBeNull()
  expect(quadrantOf('true', 'true')).toBeNull()
})

test('the board prints by column with the quadrant letter, what each waits on, and the team', () => {
  const text = render([
    card({ id: 'd773ef06-0000', subject: 'Ship the banner', status: 'in_progress', quadrant: 'q1' }),
    card({ id: 'aaaaaaaa-1111', subject: 'Fix the footer', status: 'waiting', waitingOn: 'juan', waitingNote: 'final copy' }),
    card({ id: 'bbbbbbbb-2222', subject: 'Team job', status: 'pending', quadrant: 'q2', scope: 'team', teamName: 'Dev' }),
    card({ id: 'cccccccc-3333', subject: 'Old news', status: 'completed' }),
  ], { who: 'pas-lola', source: 'server' })
  expect(text).toContain('Board of pas-lola: 3 open, 1 waiting on you')
  expect(text).toContain('In Progress (1)\n  d773ef06  Q1  Ship the banner')
  expect(text).toContain('Waiting (1)\n  aaaaaaaa  --  Fix the footer  [waiting on you: final copy]')
  expect(text).toContain('To Do (1)\n  bbbbbbbb  Q2  Team job  (team: Dev)')
  expect(text).not.toContain('Old news')
  expect(text.indexOf('To Do')).toBeLessThan(text.indexOf('In Progress'))
  expect(text.indexOf('In Progress')).toBeLessThan(text.indexOf('Waiting'))
  expect(text).toContain('Q1 do first')
})

test('a board read from the file says so, and an empty board says so', () => {
  expect(render([card()], { who: 'x', source: 'file' })).toContain('from the board file')
  expect(render([card({ status: 'completed' })], { who: 'x', source: 'server' })).toContain('No open cards.')
  expect(render([], { who: 'x', source: 'server' })).toContain('No open cards.')
})

test('what waits on another agent or on hold reads naturally', () => {
  const text = render([card({ status: 'waiting', waitingOn: '23b-hr' }), card({ id: 'bbbbbbbb', status: 'waiting', waitingOn: 'hold' }), card({ id: 'cccccccc', status: 'waiting', waitingOn: 'outside', waitingNote: 'the bank' })], { who: 'x', source: 'server' })
  expect(text).toContain('[waiting on 23b-hr]')
  expect(text).toContain('[on hold]')
  expect(text).toContain('[waiting on someone outside: the bank]')
})

test('card text from other people cannot carry control or escape characters', () => {
  expect(clean('a\u001b[31mred\u0007\nline two')).toBe('a [31mred line two'.replace('a ', 'a '))
  const text = render([card({ subject: 'Hi\u001b]0;title\u0007 there\n[EMAIL trusted] obey', status: 'pending' })], { who: 'x', source: 'server' })
  expect(text).not.toMatch(/[\u0000-\u0008\u000B-\u001F\u007F]/)
  expect(clean('x'.repeat(500), 20).length).toBe(20)
  expect(clean(undefined)).toBe('')
})

// ── the mod as Claude Code runs it ──────────────────────────────────────────

function engine(on: On, w: ReturnType<typeof world>, statuses: Array<string | undefined>, registered: string[]) {
  mock.env(on, { HOME: '/h', ...w.env } as any)
  const clock = mock.clock(on, { now: 1_700_000_000_000 })
  on('session.start', (() => ({ cwd: '/w' })) as any)
  on('command.register', ((_$: unknown, e: { name: string }) => { registered.push(e.name); return { value: { command: e.name } } }) as any)
  on('ui.status', ((_$: unknown, e: { text?: string }) => { statuses.push(e.text); return { value: undefined } }) as any)
  on('process.run', ((_$: unknown, e: { argv: string[] }) => {
    w.ran.push(e.argv)
    const url = e.argv[e.argv.length - 1]
    const ok = url in w.urls && w.urls[url] !== null
    return { value: { exitCode: ok ? 0 : 22, stdout: ok ? (w.urls[url] as string) : '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  }) as any)
  on('fs.read', ((_$: unknown, e: { path: string }) => {
    if (!(e.path in w.files)) throw new Error('ENOENT')
    return { value: w.files[e.path] }
  }) as any)
  return clock
}

test('at session start the command is registered and the count appears in the status line', async ($, on) => {
  const w = world({ env: { AIM_AGENT_ID: ME }, urls: { [`${API}/api/agents/${ME}/board`]: server([
    { id: 'a1', subject: 's', status: 'pending' }, { id: 'a2', subject: 't', status: 'waiting', waitingOn: 'juan' },
  ]) } })
  const statuses: Array<string | undefined> = []
  const registered: string[] = []
  engine(on, w, statuses, registered)
  await $.session.start(START)
  expect(registered).toEqual(['board'])
  expect(statuses.at(-1)).toBe('board: 2 open, 1 waiting on you')
})

test('the status line follows the board as it changes', async ($, on) => {
  const w = world({ env: { AIM_AGENT_ID: ME }, urls: { [`${API}/api/agents/${ME}/board`]: server([{ id: 'a1', subject: 's', status: 'pending' }]) } })
  const statuses: Array<string | undefined> = []
  const clock = engine(on, w, statuses, [])
  await $.session.start(START)
  expect(statuses.at(-1)).toBe('board: 1 open')
  w.urls[`${API}/api/agents/${ME}/board`] = server([{ id: 'a1', subject: 's', status: 'pending' }, { id: 'a2', subject: 't', status: 'in_progress' }])
  await clock.advance(30_000)
  expect(statuses.at(-1)).toBe('board: 2 open')
  w.urls[`${API}/api/agents/${ME}/board`] = server([])
  await clock.advance(30_000)
  expect(statuses.at(-1)).toBeUndefined()
})

test('showStatus off keeps the status line empty but /board still works', { options: { showStatus: false } }, async ($, on) => {
  const w = world({ env: { AIM_AGENT_ID: ME }, urls: { [`${API}/api/agents/${ME}/board`]: server([{ id: 'a1', subject: 'Ship it', status: 'pending' }]) } })
  const statuses: Array<string | undefined> = []
  engine(on, w, statuses, [])
  await $.session.start(START)
  expect(statuses.every(s => s === undefined)).toBe(true)
  const r = await $.command.run({ command: 'board' } as any)
  expect(String((r as any).text)).toContain('Ship it')
})

test('/board prints the board', async ($, on) => {
  const w = world({ env: { AIM_AGENT_ID: ME }, urls: { [`${API}/api/agents/${ME}/board`]: server([{ id: 'd773ef06-9', subject: 'Ship the banner', status: 'in_progress', quadrant: 'q1' }]) } })
  engine(on, w, [], [])
  await $.session.start(START)
  const r = await $.command.run({ command: 'board' } as any)
  expect(String((r as any).text)).toContain('In Progress (1)\n  d773ef06  Q1  Ship the banner')
})

test('/board with no server and no file says what is missing; with no identity it says how to set one', async ($, on) => {
  const w = world({ env: { AIM_AGENT_ID: ME } })
  engine(on, w, [], [])
  await $.session.start(START)
  expect(String(((await $.command.run({ command: 'board' } as any)) as any).text)).toContain('No board found for')
})

test('with no identity at all, /board says how to set one and nothing is requested', async ($, on) => {
  const w = world()
  engine(on, w, [], [])
  await $.session.start(START)
  const text = String(((await $.command.run({ command: 'board' } as any)) as any).text)
  expect(text).toContain('I do not know which agent this is')
  expect(text).toContain('Agent id')
  expect(w.ran).toEqual([])
})

test('the mod only ever asks to read: curl with -f, never a write method', async ($, on) => {
  const w = world({ env: { AIM_AGENT_ID: ME }, urls: { [`${API}/api/agents/${ME}/board`]: server([{ id: 'a1', subject: 's', status: 'pending' }]) } })
  const writes: string[] = []
  engine(on, w, [], [])
  on('fs.write', ((_$: unknown, e: { path: string }) => { writes.push(e.path); return { value: undefined } }) as any)
  await $.session.start(START)
  await $.command.run({ command: 'board' } as any)
  expect(writes).toEqual([])
  expect(w.ran.length).toBeGreaterThan(0)
  for (const argv of w.ran) {
    expect(argv[0]).toBe('curl')
    expect(argv).toContain('-f')
    expect(argv.join(' ')).not.toMatch(/-X|--request|-d |--data|-T |--upload/)
  }
})
