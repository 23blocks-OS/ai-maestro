import { atom, read, update } from 'claude-code'
import type { EngineInterface as Engine, Register } from 'claude-code'

// F037. An agent proposes a database change with `safe-psql-write propose`; the wrapper writes a
// request file under $SAFE_PSQL_HOME/requests (default ~/.safe-psql/requests). This mod shows the
// requests that belong to THIS agent and does the same state change the wrapper's `approve` and
// `reject` do (the wrapper's own approve refuses to run inside an agent session, and needs a
// terminal). It never connects to the database and never runs the wrapper: the agent still has to
// run `safe-psql-write apply`, which repeats every check, including the fingerprint.
//
// Honest limit: the agent and the person share one OS user, so this stops accidents and the
// sanctioned path, not an agent that edits the request file itself. The write login's own limits
// are the real backstop. See docs/F037-agentic-sql-card-handoff.md.

const POLL_MS = 10_000
const ID_RE = /^w-[0-9a-f]{12}$/
const PANE = 'sql-approval'
const PANE_ARGS = { id: PANE, focus: true, closeOnEscape: true, rows: 22 } as const
const FG_DARK_THEME = '#ffffff'
const FG_LIGHT_THEME = '#1a1a1a'

type Req = {
  id: string; status: string; expires: number; ttl?: number; agent: string; environment: string; table: string
  kind: string; sql: string; rows: number; max_rows?: number; reason?: string; fingerprint: string
  params: Record<string, unknown> | null; diff: Array<Record<string, any>> | null; diff_truncated?: boolean
  has_pk?: boolean; param_names?: string[]; [k: string]: unknown
}

// the request the band is about; changing it redraws the band
const waiting = atom({ plugin: 'ai-maestro-sql-approval', key: 'waiting' } as const, null)
let current: Req | null = null
let typed = ''

// The wrapper's clean(): no control, separator or escape characters, bounded length.
export function clean(text: unknown, limit = 300): string {
  const chars = Array.from(String(text), c => (c === ' ' || !/[\p{C}\p{Z}]/u.test(c) ? c : '?'))
  return chars.length <= limit ? chars.join('') : chars.slice(0, limit).join('') + '...'
}

const repr = (v: unknown) => (v === undefined ? 'null' : JSON.stringify(v))

export function describeDiff(r: Req): string[] {
  const out: string[] = []
  for (const d of Array.isArray(r.diff) ? r.diff : []) {
    const key = d?.key ? ` (key ${clean(JSON.stringify(d.key))})` : ''
    if (d?.changes && typeof d.changes === 'object') {
      const t = Object.entries(d.changes as Record<string, any>).map(([c, v]) => `${c}: ${repr(v?.[0])} -> ${repr(v?.[1])}`).join('; ')
      out.push(`row${key}: ${clean(t, 400)}`)
    } else if (d?.deleted) out.push(`DELETE row${key}: ${clean(JSON.stringify(d.deleted), 400)}`)
    else out.push(`INSERT row${key}: ${clean(JSON.stringify(d?.new ?? {}), 400)}`)
  }
  if (r.diff_truncated) out.push(`... and ${Math.max(0, Math.trunc(r.rows) - out.length)} more`)
  if (r.has_pk === false) out.push('(the table has no primary key, so rows are not matched before/after)')
  return out
}

// Everything the logic needs from the engine, so tests can hand it a world from memory.
export type IO = {
  env: (name: 'HOME' | 'USER' | 'SAFE_PSQL_HOME' | 'AIM_AGENT_NAME' | 'AIM_AGENT_ID') => Promise<string | undefined>
  now: () => Promise<number>
  read: (path: string) => Promise<string>
  write: (path: string, text: string) => Promise<void>
  exists: (path: string) => Promise<boolean>
  list: (path: string) => Promise<Array<{ name: string; kind: string; size: number; isLink: boolean }>>
}

const ioOf = ($: Engine): IO => ({
  env: async name => {
    switch (name) {
      case 'HOME': return (await $.env.get('HOME')) ?? undefined
      case 'USER': return (await $.env.get('USER')) ?? undefined
      case 'SAFE_PSQL_HOME': return (await $.env.get('SAFE_PSQL_HOME')) ?? undefined
      case 'AIM_AGENT_NAME': return (await $.env.get('AIM_AGENT_NAME')) ?? undefined
      default: return (await $.env.get('AIM_AGENT_ID')) ?? undefined
    }
  },
  now: async () => await $.clock.now(),
  read: async path => String(await $.fs.read(path)),
  write: async (path, text) => { await $.fs.write(path, text) },
  exists: async path => await $.fs.exists(path),
  list: async path => (await $.fs.list(path)) as any,
})

// Same identity rule as the wrapper: AIM_AGENT_NAME, else AIM_AGENT_ID, else $USER.
async function identity(io: IO): Promise<string[]> {
  const ids: string[] = []
  const byName = await io.env('AIM_AGENT_NAME')
  const byId = await io.env('AIM_AGENT_ID')
  if (byName) ids.push(byName)
  if (byId) ids.push(byId)
  if (ids.length === 0) {
    const u = await io.env('USER')
    if (u) ids.push(u)
  }
  return ids
}

async function requestsDir(io: IO): Promise<string> {
  const home = await io.env('SAFE_PSQL_HOME')
  if (home) return `${home}/requests`
  return `${(await io.env('HOME')) ?? ''}/.safe-psql/requests`
}

function parse(text: unknown, id: string): Req | null {
  try {
    const r = JSON.parse(String(text))
    const ok = r && typeof r === 'object' && r.id === id && typeof r.status === 'string' && typeof r.expires === 'number'
      && typeof r.environment === 'string' && typeof r.table === 'string' && typeof r.kind === 'string'
      && typeof r.sql === 'string' && typeof r.rows === 'number' && typeof r.agent === 'string' && typeof r.fingerprint === 'string'
    return ok ? (r as Req) : null
  } catch {
    return null
  }
}

async function load(io: IO, id: string): Promise<Req | null> {
  if (!ID_RE.test(id)) return null
  try {
    return parse(await io.read(`${await requestsDir(io)}/${id}.json`), id)
  } catch {
    return null
  }
}

export async function findPending(io: IO): Promise<Req | null> {
  const dir = await requestsDir(io)
  let names
  try {
    names = await io.list(dir)
  } catch {
    return null
  }
  const me = await identity(io)
  const now = (await io.now()) / 1000
  const mine: Req[] = []
  for (const n of names) {
    const m = /^(w-[0-9a-f]{12})\.json$/.exec(n.name)
    if (!m || n.kind !== 'file' || n.isLink || n.size > 1024 * 1024) continue
    const r = await load(io, m[1])
    if (r && r.status === 'pending' && r.expires > now && me.includes(r.agent)) mine.push(r)
  }
  mine.sort((a, b) => Number(a.created ?? 0) - Number(b.created ?? 0))
  return mine[0] ?? null
}

// Best-effort audit line in the wrapper's default log. Names only, never values.
async function audit(io: IO, event: string, r: Req, extra: Record<string, unknown>) {
  try {
    const file = `${(await io.env('SAFE_PSQL_HOME')) || `${(await io.env('HOME')) ?? ''}/.safe-psql`}/write.log`
    const line = JSON.stringify({
      ts: new Date(await io.now()).toISOString().replace(/\.\d+Z$/, 'Z'), event, request: r.id, agent: r.agent,
      environment: r.environment, table: r.table, kind: r.kind, param_names: r.param_names ?? Object.keys(r.params ?? {}).sort(),
      rows: r.rows, via: 'claude-code-mod', ...extra,
    })
    const before = (await io.exists(file)) ? String(await io.read(file)) : ''
    await io.write(file, before + line + '\n')
  } catch { /* the log is a courtesy; the state change is what counts */ }
}

async function save(io: IO, r: Req) {
  await io.write(`${await requestsDir(io)}/${r.id}.json`, JSON.stringify(r))
}

async function clear($: Engine) {
  current = null
  typed = ''
  await update($, waiting, () => null)
  await $.ui.close({ id: PANE })
}

export async function approve(io: IO, shown: Req, answer: string): Promise<{ ok: boolean; message: string }> {
  const r = await load(io, shown.id)
  if (!r) return { ok: false, message: 'The request is gone.' }
  if (r.status !== 'pending') return { ok: false, message: `The request is ${clean(r.status, 20)}, not pending.` }
  if (r.expires <= (await io.now()) / 1000) return { ok: false, message: 'The request expired. The agent has to propose it again.' }
  if (r.fingerprint !== shown.fingerprint) return { ok: false, message: 'The request changed after you saw it. Look at it again.' }
  if (answer.trim() !== r.environment) return { ok: false, message: `Type the environment name exactly (${clean(r.environment, 40)}) to approve.` }
  const now = (await io.now()) / 1000
  const who = (await io.env('USER')) || 'unknown'
  r.status = 'approved'
  r.approved_by = who
  r.approved_at = now
  r.apply_by = now + (typeof r.ttl === 'number' ? r.ttl : 600)
  r.approved_fingerprint = r.fingerprint
  await save(io, r)
  await audit(io, 'approved', r, { approver: who })
  return { ok: true, message: 'Approved.' }
}

export async function reject(io: IO, shown: Req): Promise<void> {
  const r = await load(io, shown.id)
  if (!r || (r.status !== 'pending' && r.status !== 'approved')) return
  r.status = 'rejected'
  r.params = null
  r.diff = null
  await save(io, r)
  await audit(io, 'rejected', r, { by: (await io.env('USER')) || 'unknown' })
}

async function poll($: Engine) {
  if (current) {
    // keep showing it only while it is still pending (the person may have answered in a terminal)
    const again = await load(ioOf($), current.id)
    if (!again || again.status !== 'pending' || again.expires <= (await $.clock.now()) / 1000) await clear($)
    else return
  }
  const r = await findPending(ioOf($))
  if (!r) return
  current = r
  await update($, waiting, () => r.id)
  $.ui.toast(`A database change is waiting for your approval (${clean(r.environment, 30)})`)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'sql-approval', description: 'Review a database change an agent is waiting to make' })
    await poll($)
    $.clock.every(POLL_MS, () => { void poll($) })
    return next(e)
  })

  on('command.run', { command: 'sql-approval' }, async $ => {
    await poll($)
    if (!current) return { text: 'No database change is waiting for you.' }
    await $.ui.open({ ...PANE_ARGS, title: `Approve ${current.kind} on ${clean(current.table, 40)}` })
    return { text: 'Opened.' }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const id = await read($, waiting)
    if (id === null || !current) return next(e)
    const { Box, Button, Text } = $.ui.resolve(e)
    return (
      <Box>
        <Text bold>
          An agent wants to {clean(current.kind, 20)} {Math.trunc(current.rows)} row(s) in {clean(current.table, 40)} ({clean(current.environment, 30)}).{' '}
        </Text>
        <Button key="review-sql" label="Review" variant="primary" onPress={() => { void $.ui.open({ ...PANE_ARGS, title: `Approve ${current?.kind ?? ''} on ${clean(current?.table ?? '', 40)}` }) }} />
        <Text> </Text>
        <Button
          key="reject-sql"
          label="Reject"
          onPress={async () => {
            const shown = current
            if (!shown) return
            await reject(ioOf($), shown)
            await clear($)
            await $.prompt.submit({ text: `[SQL WRITE] request ${shown.id} was rejected by the user. Check it with safe-psql-write status ${shown.id}. Do not retry the same change or a wider one; ask what they want instead.` })
          }}
        />
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const ui = $.ui.resolve(e)
    if (!('Input' in ui)) return <ui.Text>This screen cannot take typed input. Use Claude Code in a terminal, or approve with safe-psql-write approve.</ui.Text>
    const { Box, Text, Input } = ui
    const r = current
    if (!r) return <Text>No database change is waiting.</Text>
    const themeRow = (await $.config.list()).find(row => row.key === 'theme')
    const FG = /light/i.test(String(themeRow?.value ?? '')) ? FG_LIGHT_THEME : FG_DARK_THEME
    const line = (t: string, key: string) => <Text key={key} color={FG}>{t}</Text>
    return (
      <Box flexDirection="column" paddingX={1}>
        <Text bold color={FG}>Approve a database change</Text>
        {line(`Request ${clean(r.id)} from agent '${clean(r.agent)}'`, 'h')}
        {line(`environment : ${clean(r.environment)}`, 'env')}
        {line(`statement   : ${clean(r.kind)} on ${clean(r.table)}, ${Math.trunc(r.rows)} row(s), limit ${Math.trunc(Number(r.max_rows) || 0)}`, 'st')}
        {line(`SQL         : ${clean(r.sql.replace(/%%/g, '%'), 600)}`, 'sql')}
        {line(`values      : ${clean(JSON.stringify(r.params ?? {}), 600)}`, 'val')}
        {r.reason ? line(`reason      : ${clean(r.reason, 200)}`, 'why') : null}
        {line('what changes:', 'wc')}
        {describeDiff(r).map((t, i) => line(`  ${t}`, `d${i}`))}
        <Text color={FG}> </Text>
        <Input
          key="sql-confirm"
          label={`Type ${clean(r.environment, 40)} to approve: `}
          submitLabel=" "
          autoFocus
          onInput={(v: string) => { typed = v }}
          onSubmit={async (value: string) => {
            const shown = current
            if (!shown) return
            let res
            try {
              res = await approve(ioOf($), shown, value || typed)
            } catch {
              $.ui.toast('Could not write the approval. Approve with safe-psql-write approve instead.')
              return
            }
            if (!res.ok) { $.ui.toast(res.message); return }
            await clear($)
            $.ui.toast('Approved. The agent will be told.')
            await $.prompt.submit({ text: `[SQL WRITE] request ${shown.id} was approved by the user. Confirm with safe-psql-write status ${shown.id}, then run safe-psql-write apply ${shown.id} once and report the row count.` })
          }}
        />
        <Text color={FG}>Enter approves only if the name matches. Esc closes; the band above the prompt stays. Reject is on the band.</Text>
        <Text color={FG}>Applying is still the agent's step and repeats every check.</Text>
      </Box>
    )
  })
}
