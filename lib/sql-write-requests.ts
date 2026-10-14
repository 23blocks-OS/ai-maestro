/**
 * Pending SQL write requests (F037), as the agentic-sql write wrapper stores them.
 *
 * The wrapper (`safe-psql-write`, plugin agentic-sql, scripts/safe_psql_write.py) keeps one JSON file per
 * request in `$SAFE_PSQL_HOME/requests` (default `~/.safe-psql/requests`), named `w-<12 hex>.json`.
 * This file reads those files and does the same state change the wrapper's `approve` and `reject` do. It
 * never runs the wrapper and never touches the database. Parameter VALUES are shown only the way the
 * wrapper's own approval screen shows them (sanitised, bounded) and are never logged.
 *
 * The shape and the fingerprint rule are pinned by tests/fixtures/sql-write-request.json. If the wrapper
 * changes either, that test fails and this file needs to follow.
 */
import crypto from 'crypto'
import fs from 'fs'
import os from 'os'
import path from 'path'

export const REQUEST_ID_RE = /^w-[0-9a-f]{12}$/
const MAX_FILE_BYTES = 1024 * 1024

export interface SqlWriteRequest {
  id: string
  created: number
  expires: number
  status: string
  environment: string
  env_var: string
  table: string
  kind: string
  columns: string[]
  sql: string
  params: Record<string, unknown> | null
  param_names: string[]
  rows: number
  diff: Array<Record<string, any>> | null
  diff_truncated: boolean
  has_pk: boolean
  reason: string
  agent: string
  ttl: number
  max_rows: number
  fingerprint: string
  approved_by?: string
  approved_at?: number
  apply_by?: number
  approved_fingerprint?: string
  [k: string]: unknown
}

export function wrapperHome(): string {
  return process.env.SAFE_PSQL_HOME || path.join(os.homedir(), '.safe-psql')
}

const requestsDir = () => path.join(wrapperHome(), 'requests')

// ---------------------------------------------------------------- fingerprint (Python json.dumps compatible)

/** Python's json.dumps string form with ensure_ascii=True. */
function pyString(s: string): string {
  let out = '"'
  for (const ch of s) {
    const c = ch.codePointAt(0)!
    if (ch === '"') out += '\\"'
    else if (ch === '\\') out += '\\\\'
    else if (ch === '\n') out += '\\n'
    else if (ch === '\r') out += '\\r'
    else if (ch === '\t') out += '\\t'
    else if (ch === '\b') out += '\\b'
    else if (ch === '\f') out += '\\f'
    else if (c < 0x20) out += '\\u' + c.toString(16).padStart(4, '0')
    else if (c <= 0x7f) out += ch
    else if (c <= 0xffff) out += '\\u' + c.toString(16).padStart(4, '0')
    else {
      const v = c - 0x10000
      out += '\\u' + (0xd800 + (v >> 10)).toString(16) + '\\u' + (0xdc00 + (v & 0x3ff)).toString(16)
    }
  }
  return out + '"'
}

function pyJson(v: unknown): string {
  if (typeof v === 'string') return pyString(v)
  if (v === null) return 'null'
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  if (typeof v === 'number' && Number.isInteger(v)) return String(v)
  if (Array.isArray(v)) return '[' + v.map(pyJson).join(', ') + ']'
  throw new Error('unsupported value in fingerprint')
}

const byCodePoint = (a: string, b: string) => {
  const x = Array.from(a, (c) => c.codePointAt(0)!)
  const y = Array.from(b, (c) => c.codePointAt(0)!)
  for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] !== y[i]) return x[i] - y[i]
  return x.length - y.length
}

/** The wrapper's fingerprint(): sha256 of json.dumps([environment, env_var, table, kind, sql, sorted(params.items()), rows], sort_keys=True). */
export function fingerprint(req: SqlWriteRequest): string {
  const params = Object.entries(req.params ?? {}).sort((a, b) => byCodePoint(a[0], b[0]))
  const body = pyJson([req.environment, req.env_var, req.table, req.kind, req.sql, params, req.rows])
  return crypto.createHash('sha256').update(body).digest('hex')
}

/** True when the stored fingerprint matches the content. A request we cannot fingerprint counts as changed. */
export function fingerprintHolds(req: SqlWriteRequest): boolean {
  try {
    return typeof req.fingerprint === 'string' && fingerprint(req) === req.fingerprint
  } catch {
    return false
  }
}

// ---------------------------------------------------------------- the wrapper's text sanitiser

/** The wrapper's clean(): no control, separator or escape characters, bounded length. */
export function clean(text: unknown, limit = 300): string {
  const chars = Array.from(String(text), (c) => (c === ' ' || !/[\p{C}\p{Z}]/u.test(c) ? c : '?'))
  return chars.length <= limit ? chars.join('') : chars.slice(0, limit).join('') + '...'
}

// ---------------------------------------------------------------- storage

function isRequest(r: any): r is SqlWriteRequest {
  return !!r && typeof r === 'object' && typeof r.id === 'string' && REQUEST_ID_RE.test(r.id)
    && typeof r.status === 'string' && typeof r.expires === 'number' && typeof r.environment === 'string'
    && typeof r.table === 'string' && typeof r.kind === 'string' && typeof r.sql === 'string'
    && typeof r.rows === 'number' && typeof r.agent === 'string'
}

/** Reads one request by id; undefined when the id is not a wrapper id, the file is missing, not a plain file, too big or not valid. */
export function loadRequest(id: string): SqlWriteRequest | undefined {
  if (!REQUEST_ID_RE.test(id)) return undefined
  const file = path.join(requestsDir(), `${id}.json`)
  try {
    const st = fs.lstatSync(file)
    if (!st.isFile() || st.size > MAX_FILE_BYTES) return undefined
    const r = JSON.parse(fs.readFileSync(file, 'utf8'))
    return isRequest(r) && r.id === id ? r : undefined
  } catch {
    return undefined
  }
}

/** Same write the wrapper does: a private temp file, then an atomic rename. */
function saveRequest(req: SqlWriteRequest): void {
  const file = path.join(requestsDir(), `${req.id}.json`)
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(req), { mode: 0o600 })
  fs.renameSync(tmp, file)
}

export function listRequests(): SqlWriteRequest[] {
  let names: string[]
  try {
    names = fs.readdirSync(requestsDir())
  } catch {
    return []
  }
  const out: SqlWriteRequest[] = []
  for (const n of names) {
    const m = /^(w-[0-9a-f]{12})\.json$/.exec(n)
    const r = m && loadRequest(m[1])
    if (r) out.push(r)
  }
  return out.sort((a, b) => a.created - b.created)
}

/** Best-effort audit line in the wrapper's default log. Names only, never values. */
function logEvent(event: string, req: SqlWriteRequest, extra: Record<string, unknown>): void {
  const rec = {
    ts: new Date().toISOString().replace(/\.\d+Z$/, 'Z'), event, request: req.id, agent: req.agent, environment: req.environment,
    table: req.table, kind: req.kind, param_names: req.param_names ?? Object.keys(req.params ?? {}).sort(), rows: req.rows,
    via: 'ai-maestro', ...extra,
  }
  try {
    fs.appendFileSync(path.join(wrapperHome(), 'write.log'), JSON.stringify(rec) + '\n')
  } catch { /* the log is a courtesy; the state change is what counts */ }
}

/** The wrapper's _finish(): set the status and drop the values the request held. */
export function finishRequest(req: SqlWriteRequest, status: 'rejected' | 'expired', extra: Record<string, unknown> = {}): void {
  req.status = status
  req.params = null
  req.diff = null
  saveRequest(req)
  logEvent(status, req, extra)
}

/** The wrapper's cmd_approve state change, after the checks. */
export function markApproved(req: SqlWriteRequest, approver: string): void {
  req.status = 'approved'
  req.approved_by = approver
  req.approved_at = Date.now() / 1000
  req.apply_by = req.approved_at + (typeof req.ttl === 'number' ? req.ttl : 600)
  req.approved_fingerprint = req.fingerprint
  saveRequest(req)
  logEvent('approved', req, { approver })
}

// ---------------------------------------------------------------- what the card shows

export interface SqlWriteRequestView {
  id: string
  agent: string
  kind: string
  table: string
  environment: string
  rows: number
  maxRows: number
  sql: string
  values: string
  reason: string | null
  columns: string[]
  diff: Array<{ type: 'update' | 'delete' | 'insert'; key: string | null; text: string }>
  moreRows: number
  hasPk: boolean
  createdAt: number
  expiresAt: number
  /** The content no longer matches its fingerprint: the card shows it but cannot approve it. */
  changed: boolean
}

const repr = (v: unknown) => (typeof v === 'string' ? JSON.stringify(v) : v === undefined ? 'null' : JSON.stringify(v))

/** The same things, with the same sanitising and limits, as the wrapper's approval screen (render_for_person). */
export function toView(r: SqlWriteRequest): SqlWriteRequestView {
  const diff: SqlWriteRequestView['diff'] = []
  for (const d of Array.isArray(r.diff) ? r.diff : []) {
    const key = d?.key ? clean(JSON.stringify(d.key)) : null
    if (d?.changes && typeof d.changes === 'object') {
      const text = Object.entries(d.changes as Record<string, any>).map(([c, v]) => `${c}: ${repr(v?.[0])} -> ${repr(v?.[1])}`).join('; ')
      diff.push({ type: 'update', key, text: clean(text, 400) })
    } else if (d?.deleted) diff.push({ type: 'delete', key, text: clean(JSON.stringify(d.deleted), 400) })
    else diff.push({ type: 'insert', key, text: clean(JSON.stringify(d?.new ?? {}), 400) })
  }
  return {
    id: r.id, agent: clean(r.agent), kind: clean(r.kind), table: clean(r.table), environment: clean(r.environment),
    rows: Math.trunc(r.rows), maxRows: Math.trunc(Number(r.max_rows) || 0), sql: clean(r.sql.replace(/%%/g, '%'), 600),
    values: clean(JSON.stringify(r.params ?? {}), 600), reason: r.reason ? clean(r.reason, 200) : null,
    columns: Array.isArray(r.columns) ? r.columns.slice(0, 40).map((c) => clean(c, 80)) : [], diff,
    moreRows: r.diff_truncated ? Math.max(0, Math.trunc(r.rows) - diff.length) : 0, hasPk: r.has_pk === true,
    createdAt: r.created * 1000, expiresAt: r.expires * 1000, changed: !fingerprintHolds(r),
  }
}
