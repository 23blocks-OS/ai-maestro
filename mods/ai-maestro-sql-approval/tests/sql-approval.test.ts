import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import { approve, clean, describeDiff, findPending, reject, type IO } from '../hooks/register'

const START = { cwd: '/w', surface: 'terminal', isInteractive: true } as any
const NOW = 1_700_000_000_000
const DIR = '/h/.safe-psql/requests'
const ID = 'w-0123456789ab'

const request = (over: Record<string, unknown> = {}) => ({
  id: ID, created: NOW / 1000 - 5, expires: NOW / 1000 + 600, ttl: 600, status: 'pending', agent: 'pas-lola',
  environment: 'staging', env_var: 'DATABASE_WRITE_URL', table: 'public.users', kind: 'update', columns: ['plan'],
  sql: 'UPDATE public.users SET plan = %(p)s WHERE id = %(i)s', params: { p: 'pro', i: 7 }, param_names: ['i', 'p'], rows: 1,
  diff: [{ key: { id: 7 }, changes: { plan: ['free', 'pro'] } }], diff_truncated: false, has_pk: true, reason: 'upgrade',
  max_rows: 100, fingerprint: 'abc123', ...over,
})

// The same logic with the world in memory (the engine hands tests no file system of their own).
const io = (files: Record<string, string>, env: Record<string, string> = { HOME: '/h', USER: 'juan' }): IO => ({
  env: async n => env[n],
  now: async () => NOW,
  read: async p => { if (!(p in files)) throw new Error('ENOENT'); return files[p] },
  write: async (p, text) => { files[p] = text },
  exists: async p => p in files,
  list: async p => Object.keys(files).filter(f => f.startsWith(p + '/')).map(f => ({ name: f.slice(p.length + 1), kind: 'file', size: files[f].length, isLink: false })),
})

// The file system beneath the plugin, from memory.
function world(on: On, files: Record<string, string>, toasts: string[] = [], prompts: string[] = [], env: Record<string, string> = {}) {
  mock.env(on, { HOME: '/h', USER: 'juan', ...env })
  mock.clock(on, { now: NOW })
  on('session.start', (() => ({ cwd: '/w' })) as any)
  on('command.register', (() => ({ value: { command: 'sql-approval' } })) as any)
  on('ui.toast', ((_$: unknown, e: { text?: string; message?: string }) => { toasts.push(String(e.text ?? e.message)); return { value: undefined } }) as any)
  on('ui.close', (() => ({ value: undefined })) as any)
  on('prompt.submit', ((_$: unknown, e: { text: string }) => { prompts.push(e.text); return { text: e.text } }) as any)
  on('fs.read', ((_$: unknown, e: { path: string }) => {
    if (!(e.path in files)) throw new Error('ENOENT')
    return { value: files[e.path] }
  }) as any)
  on('fs.exists', ((_$: unknown, e: { path: string }) => ({ value: e.path in files })) as any)
  on('fs.write', ((_$: unknown, e: { path: string; text: string }) => { files[e.path] = e.text; return { value: undefined } }) as any)
  on('fs.list', ((_$: unknown, e: { path: string }) => ({
    value: Object.keys(files).filter(p => p.startsWith(e.path + '/')).map(p => ({ name: p.slice(e.path.length + 1), kind: 'file', size: files[p].length, mtimeMs: 0, isLink: false })),
  })) as any)
}

test('approving needs the exact environment name, and only then writes the approval', async ($, on) => {
  const files: Record<string, string> = { [`${DIR}/${ID}.json`]: JSON.stringify(request()) }
  world(on, files)
  const shown = request() as any
  const wrong = await approve(io(files), shown, 'prod')
  expect(wrong.ok).toBe(false)
  expect(JSON.parse(files[`${DIR}/${ID}.json`]).status).toBe('pending')
  const right = await approve(io(files), shown, ' staging ')
  expect(right.ok).toBe(true)
  const saved = JSON.parse(files[`${DIR}/${ID}.json`])
  expect(saved.status).toBe('approved')
  expect(saved.approved_by).toBe('juan')
  expect(saved.approved_fingerprint).toBe('abc123')
  expect(saved.fingerprint).toBe('abc123')
  expect(saved.apply_by).toBe(NOW / 1000 + 600)
  const log = files['/h/.safe-psql/write.log']
  expect(log).toContain('"event":"approved"')
  expect(log).toContain('"via":"claude-code-mod"')
  expect(log).not.toContain('"pro"')   // no values in the audit line
})

test('a request that changed, expired, was answered or vanished cannot be approved', async ($, on) => {
  const files: Record<string, string> = {}
  world(on, files)
  const shown = request() as any
  const file = `${DIR}/${ID}.json`
  files[file] = JSON.stringify(request({ fingerprint: 'other' }))
  expect((await approve(io(files), shown, 'staging')).ok).toBe(false)
  files[file] = JSON.stringify(request({ expires: NOW / 1000 - 1 }))
  expect((await approve(io(files), shown, 'staging')).message).toContain('expired')
  files[file] = JSON.stringify(request({ status: 'rejected' }))
  expect((await approve(io(files), shown, 'staging')).message).toContain('not pending')
  delete files[file]
  expect((await approve(io(files), shown, 'staging')).message).toContain('gone')
  expect(files['/h/.safe-psql/write.log']).toBeUndefined()
})

test('rejecting drops the values and logs only names', async ($, on) => {
  const files: Record<string, string> = { [`${DIR}/${ID}.json`]: JSON.stringify(request()) }
  world(on, files)
  await reject(io(files), request() as any)
  const saved = JSON.parse(files[`${DIR}/${ID}.json`])
  expect(saved.status).toBe('rejected')
  expect(saved.params).toBeNull()
  expect(saved.diff).toBeNull()
  expect(files['/h/.safe-psql/write.log']).toContain('"event":"rejected"')
  expect(files['/h/.safe-psql/write.log']).not.toContain('"pro"')
})

test('the poll finds only this agent\'s pending, unexpired requests', async () => {
  const files: Record<string, string> = {
    [`${DIR}/${ID}.json`]: JSON.stringify(request()),
    [`${DIR}/w-bbbbbbbbbbbb.json`]: JSON.stringify(request({ id: 'w-bbbbbbbbbbbb', agent: 'other' })),
    [`${DIR}/w-cccccccccccc.json`]: JSON.stringify(request({ id: 'w-cccccccccccc', expires: NOW / 1000 - 1 })),
    [`${DIR}/w-dddddddddddd.json`]: JSON.stringify(request({ id: 'w-dddddddddddd', status: 'applied' })),
    [`${DIR}/notes.txt`]: 'x',
  }
  expect((await findPending(io(files, { HOME: '/h', USER: 'x', AIM_AGENT_NAME: 'pas-lola' })))?.id).toBe(ID)
  expect(await findPending(io(files, { HOME: '/h', USER: 'x' }))).toBeNull()
})

test('a request id that is not a wrapper id is never read', async ($, on) => {
  const files: Record<string, string> = { '/h/.safe-psql/requests/../secret.json': '{}' }
  world(on, files)
  const r = await approve(io(files), request({ id: '../secret' }) as any, 'staging')
  expect(r.ok).toBe(false)
})

test('at session start only this agent\'s pending request raises a toast', async ($, on) => {
  const toasts: string[] = []
  const files: Record<string, string> = {
    [`${DIR}/${ID}.json`]: JSON.stringify(request()),
    [`${DIR}/w-aaaaaaaaaaaa.json`]: JSON.stringify(request({ id: 'w-aaaaaaaaaaaa', agent: 'someone-else' })),
  }
  world(on, files, toasts, [], { AIM_AGENT_NAME: 'someone-else-entirely' })
  await $.session.start(START)
  expect(toasts.length).toBe(0)
})

test('the matching agent sees a toast once', async ($, on) => {
  const toasts: string[] = []
  const files: Record<string, string> = { [`${DIR}/${ID}.json`]: JSON.stringify(request()) }
  world(on, files, toasts, [], { AIM_AGENT_NAME: 'pas-lola' })
  await $.session.start(START)
  expect(toasts.length).toBe(1)
  expect(toasts[0]).toContain('staging')
})

test('outside AI Maestro the request is matched by the user name, like the wrapper', async ($, on) => {
  const toasts: string[] = []
  const files: Record<string, string> = { [`${DIR}/${ID}.json`]: JSON.stringify(request({ agent: 'juan' })) }
  world(on, files, toasts)
  await $.session.start(START)
  expect(toasts.length).toBe(1)
})

test('text from the request is stripped of control characters', () => {
  expect(clean('a\u001b[31mred\u0007\n')).toBe('a?[31mred??')
  expect(clean('x'.repeat(400), 10)).toBe('x'.repeat(10) + '...')
  expect(describeDiff(request({ diff: [{ key: { id: 1 }, changes: { n: ['a\u001b', 'b'] } }] }) as any)[0]).not.toContain('\u001b')
})
