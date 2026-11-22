/**
 * Caller identity: the server works out who is calling, and never takes it from the request text.
 *
 * A request is one of:
 *   - operator   `Authorization: Bearer <token>` whose SHA-256 equals the configured operator token hash
 *                (AIMAESTRO_OPERATOR_TOKEN_SHA256, or ~/.aimaestro/operator-token.sha256; only the hash is
 *                on the host, see scripts/operator-token.mjs). Also the server itself calling its own API
 *                (via 'host').
 *   - agent      by session: a request from this machine whose client process descends from an agent's
 *                tmux pane is that agent. Kernel facts only (socket -> pid -> parent chain -> pane pid ->
 *                tmux session -> registry agent), never the environment or the arguments.
 *                by key: a valid AMP API key (lib/amp-auth.ts).
 *   - anonymous  none of the above.
 *
 * AIMAESTRO_CALLER_AUTH:
 *   session  default when no operator token is set. Anonymous callers keep today's trust (the dashboard
 *            works with no configuration); identified agents are bound to themselves.
 *   strict   default when an operator token is set. Anonymous callers are refused on protected routes;
 *            an agent with a live session here is identified by that session only.
 *   off      today's behaviour: nothing is resolved, nothing is refused.
 *
 * server.mjs resolves the caller for the protected paths only (isProtectedPath), before Next and before
 * the headless router, and hands it to the routes in the CALLER_HEADER request header. It strips that
 * header from every incoming request first, so a client cannot set it. Routes read it with
 * callerFromHeaders() and pass the Caller to their service, which decides with checkSender / checkMailbox /
 * requireIdentified.
 *
 * What this is not: agents on one host still run as one OS user (B021). A session caller is bound to
 * itself on these routes, but an agent with a shell can still read files directly, or detach from its pane
 * (then it is anonymous: trusted in session mode, refused in strict mode). The rest of the API stays open
 * (F058 is the gate for that).
 */

import crypto from 'crypto'
import fs from 'fs'
import net from 'net'
import os from 'os'
import path from 'path'
import { execFile } from 'child_process'
import type { IncomingMessage } from 'http'
import type { Socket } from 'net'
import { tmux } from '@/lib/tmux-safe.mjs'
import { getAgent, getAgentByName } from '@/lib/agent-registry'
import { validateApiKey } from '@/lib/amp-auth'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CallerKind = 'operator' | 'agent' | 'anonymous'
/** How the caller was established. 'host': the server calling its own API */
export type CallerVia = 'session' | 'key' | 'operator-token' | 'host'
export type CallerAuthMode = 'session' | 'strict' | 'off'

export interface Caller {
  kind: CallerKind
  /** Registry id, for an agent */
  agentId?: string
  /** Registry name, for an agent */
  name?: string
  via?: CallerVia
  mode: CallerAuthMode
  /** The request came from this machine (loopback or one of its own addresses) */
  local?: boolean
}

export type CallerErrorCode = 'caller_required' | 'sender_mismatch' | 'not_your_mailbox' | 'caller_mismatch' | 'session_required'

/** A refusal, shaped like a ServiceResult so a service can return it as it is */
export interface CallerRefusal {
  status: 401 | 403
  data: { error: CallerErrorCode; message: string }
}

/** How a stored message's sender was established. 'claimed': taken from the request, as before */
export type SenderVia = CallerVia | 'claimed'

/** The request header server.mjs sets for the routes (and strips from every incoming request) */
export const CALLER_HEADER = 'x-aimaestro-caller'

// ---------------------------------------------------------------------------
// Settings: mode and operator token
// ---------------------------------------------------------------------------

export function operatorTokenFile(home = os.homedir()): string {
  return path.join(home, '.aimaestro', 'operator-token.sha256')
}

const HEX64 = /^[0-9a-f]{64}$/

/**
 * The configured operator token hash.
 * configured: a token is set (env or file), so the default mode is strict.
 * hash: the lowercase hex SHA-256, or null when the value is malformed (then no token matches: fail closed).
 */
export function readOperatorTokenHash(
  env: Record<string, string | undefined> = process.env,
  readFile: (p: string) => string | null = (p) => { try { return fs.readFileSync(p, 'utf8') } catch { return null } },
): { configured: boolean; hash: string | null; source?: 'env' | 'file' } {
  const fromEnv = String(env.AIMAESTRO_OPERATOR_TOKEN_SHA256 || '').trim().toLowerCase()
  if (fromEnv) return { configured: true, hash: HEX64.test(fromEnv) ? fromEnv : null, source: 'env' }
  const text = readFile(operatorTokenFile())
  if (text === null) return { configured: false, hash: null }
  const first = text.split('\n')[0].trim().toLowerCase()
  return { configured: true, hash: HEX64.test(first) ? first : null, source: 'file' }
}

/** The file is read again at most this often, so a new token works without a restart */
const TOKEN_TTL_MS = 5_000
let tokenCache: { at: number; value: ReturnType<typeof readOperatorTokenHash> } | null = null

function operatorToken(): ReturnType<typeof readOperatorTokenHash> {
  if (!tokenCache || Date.now() - tokenCache.at > TOKEN_TTL_MS) tokenCache = { at: Date.now(), value: readOperatorTokenHash() }
  return tokenCache.value
}

/** Constant-time: SHA-256 of the presented token against the configured hash */
export function matchesOperatorToken(token: string | null | undefined, hashHex: string | null | undefined): boolean {
  if (!token || !hashHex || !HEX64.test(hashHex)) return false
  const presented = crypto.createHash('sha256').update(token).digest()
  return crypto.timingSafeEqual(presented, Buffer.from(hashHex, 'hex'))
}

export function callerAuthMode(
  env: Record<string, string | undefined> = process.env,
  tokenConfigured: boolean = operatorToken().configured,
): CallerAuthMode {
  const m = String(env.AIMAESTRO_CALLER_AUTH || '').trim().toLowerCase()
  if (m === 'session' || m === 'strict' || m === 'off') return m
  // Unset or unknown: strict once the operator has a token, else session
  return tokenConfigured ? 'strict' : 'session'
}

// ---------------------------------------------------------------------------
// The header between server.mjs and the routes
// ---------------------------------------------------------------------------

export function encodeCaller(caller: Caller): string {
  return Buffer.from(JSON.stringify(caller), 'utf8').toString('base64url')
}

export function decodeCaller(value: string | null | undefined): Caller | null {
  if (!value || typeof value !== 'string') return null
  try {
    const c = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'))
    if (!c || !['operator', 'agent', 'anonymous'].includes(c.kind) || !['session', 'strict', 'off'].includes(c.mode)) return null
    if (c.kind === 'agent' && (typeof c.agentId !== 'string' || !c.agentId)) return null
    return c as Caller
  } catch {
    return null
  }
}

type HeaderBag = { get(name: string): string | null } | Record<string, string | string[] | undefined>

/**
 * The caller server.mjs resolved for this request. Works with a Fetch `Headers` (Next routes) and with a
 * Node header object (headless router). No header (a path the server does not resolve, or a direct call):
 * anonymous in the configured mode, so strict mode still refuses it.
 */
export function callerFromHeaders(headers: HeaderBag | null | undefined): Caller {
  let raw: string | null | undefined = null
  if (headers && typeof (headers as { get?: unknown }).get === 'function') raw = (headers as { get(n: string): string | null }).get(CALLER_HEADER)
  else if (headers) {
    const v = (headers as Record<string, string | string[] | undefined>)[CALLER_HEADER]
    raw = Array.isArray(v) ? null : v // two values: someone added one, trust neither
  }
  return decodeCaller(raw) || { kind: 'anonymous', mode: callerAuthMode() }
}

/** Remove any caller header a client sent. server.mjs calls this on every request, before anything else */
export function stripCallerHeader(req: Pick<IncomingMessage, 'headers' | 'rawHeaders'>): void {
  if (req.headers) delete req.headers[CALLER_HEADER]
  const raw = req.rawHeaders
  if (Array.isArray(raw)) {
    for (let i = raw.length - 2; i >= 0; i -= 2) {
      if (String(raw[i]).toLowerCase() === CALLER_HEADER) raw.splice(i, 2)
    }
  }
}

/** Set the resolved caller for the routes (after stripCallerHeader) */
export function setCallerHeader(req: Pick<IncomingMessage, 'headers' | 'rawHeaders'>, caller: Caller): void {
  const v = encodeCaller(caller)
  req.headers[CALLER_HEADER] = v
  if (Array.isArray(req.rawHeaders)) req.rawHeaders.push(CALLER_HEADER, v)
}

// ---------------------------------------------------------------------------
// Which paths are resolved (the overhead stays off every other route)
// ---------------------------------------------------------------------------

const PROTECTED = [
  /^\/api\/caller$/,
  /^\/api\/messages(\/.*)?$/,
  /^\/api\/agents\/[^/]+\/messages(\/.*)?$/,
  /^\/api\/people\/[^/]+\/messages(\/.*)?$/,
  /^\/api\/meetings\/inject-queue$/,
  /^\/api\/meetings\/[^/]+\/broadcast$/,
  /^\/api\/v1\/route$/,
  /^\/api\/v1\/messages(\/.*)?$/,
]

/**
 * True for the message routes. The path is normalised the generous way (decoded once, repeated and trailing
 * slashes removed, lowercase) so that a spelling Next or the router would still serve is resolved too.
 */
export function isProtectedPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false
  let p = String(pathname).split('?')[0]
  try { p = decodeURIComponent(p) } catch { /* keep as is */ }
  p = p.replace(/\/{2,}/g, '/').replace(/\/+$/, '').toLowerCase()
  return PROTECTED.some((re) => re.test(p))
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

export interface AgentRef { id: string; name?: string }

export interface Pane { pid: number; session: string }

/** The facts the resolver needs, injectable so the unit tests need no tmux, no /proc and no lsof */
export interface CallerProbes {
  /** Every pane of the server's tmux: its shell's pid and its session name */
  listPanes(): Promise<Pane[]>
  /** pid -> parent pid, for every process the server's user can see */
  processTable(): Promise<Map<number, number>>
  /**
   * The pid among `candidates` that holds the client end of a TCP connection whose local port is
   * `clientPort` and whose remote port is `serverPort`; null when none does.
   */
  socketOwner(clientPort: number, serverPort: number, candidates: number[]): Promise<number | null>
  /** The registry agent a tmux session belongs to (CLAUDE.md "Agents come first") */
  agentForSession(session: string): AgentRef | null
  /** The agent a valid AMP API key belongs to; null for an unknown, pending or expired key */
  agentForKey(apiKey: string): AgentRef | null
  /** Operator token: is one configured, and its hash */
  operatorToken(): { configured: boolean; hash: string | null }
  /** This machine's own addresses (a request from one of them comes from this machine) */
  localAddresses(): Set<string>
}

export interface ResolverOptions {
  probes?: Partial<CallerProbes>
  mode?: () => CallerAuthMode
  serverPid?: number
  /** How long the pane list is reused */
  paneTtlMs?: number
  log?: (msg: string) => void
}

export type Resolution = { caller: Caller } | { refused: CallerRefusal }

const AMP_KEY = /^amp_(live|test)_sk_[0-9a-f]+$/

function bearerOf(header: string | string[] | undefined): string | null {
  if (typeof header !== 'string') return null
  const m = /^Bearer\s+(.+)$/i.exec(header.trim())
  if (m) return m[1].trim()
  // lib/amp-auth.ts also accepts a bare key
  return AMP_KEY.test(header.trim()) ? header.trim() : null
}

export function normaliseAddress(address: string | undefined | null): string {
  const a = String(address || '').toLowerCase()
  return a.startsWith('::ffff:') && net.isIPv4(a.slice(7)) ? a.slice(7) : a
}

export function isLoopbackAddress(address: string | undefined | null): boolean {
  const a = normaliseAddress(address)
  return a === '::1' || /^127\./.test(a)
}

/** Session name -> the name an agent is registered under: `name`, `name_2` (another brain), `name__call` (a call fork) */
export function agentNameOfSession(session: string): string {
  return session.replace(/__call$/, '').replace(/_\d+$/, '')
}

export function refusal(status: 401 | 403, error: CallerErrorCode, message: string): CallerRefusal {
  return { status, data: { error, message } }
}

export function createCallerResolver(opts: ResolverOptions = {}) {
  const probes: CallerProbes = { ...defaultProbes(), ...(opts.probes || {}) }
  const mode = opts.mode || (() => callerAuthMode(process.env, probes.operatorToken().configured))
  const serverPid = opts.serverPid ?? process.pid
  const paneTtl = opts.paneTtlMs ?? 2_000
  const log = opts.log || ((m: string) => console.warn(m))

  let panes: { at: number; list: Pane[] } | null = null
  async function paneList(fresh = false): Promise<Pane[]> {
    if (!panes || fresh || Date.now() - panes.at > paneTtl) {
      let list: Pane[] = []
      try { list = await probes.listPanes() } catch { list = [] }
      panes = { at: Date.now(), list }
    }
    return panes.list
  }

  // One answer per connection: a keep-alive socket belongs to one client process
  const bySocket = new WeakMap<Socket, Promise<AgentRef | 'host' | null>>()

  async function sessionOf(socket: Socket): Promise<AgentRef | 'host' | null> {
    const clientPort = socket.remotePort
    const serverPort = socket.localPort
    if (!clientPort || !serverPort) return null
    let list = await paneList()
    const table = await probes.processTable()
    const find = async (paneSet: Map<number, string>) => {
      // Candidates: the server itself and every process under a pane. Nothing else can be a session caller
      const children = new Map<number, number[]>()
      for (const [pid, ppid] of table) {
        const c = children.get(ppid)
        if (c) c.push(pid); else children.set(ppid, [pid])
      }
      const candidates = new Set<number>([serverPid])
      const queue = [...paneSet.keys()]
      while (queue.length) {
        const pid = queue.pop()!
        if (candidates.has(pid) && pid !== serverPid) continue
        candidates.add(pid)
        for (const c of children.get(pid) || []) if (!candidates.has(c)) queue.push(c)
      }
      const owner = await probes.socketOwner(clientPort, serverPort, [...candidates])
      if (owner === null) return null
      if (owner === serverPid) return 'host' as const
      // Walk up to the pane. A child of the server is not the server and not a session
      let cur: number | undefined = owner
      for (let i = 0; i < 256 && cur && cur > 1; i++) {
        if (cur === serverPid) return null
        const session = paneSet.get(cur)
        if (session) return { session }
        cur = table.get(cur)
      }
      return null
    }
    const toMap = (l: Pane[]) => new Map(l.map((p) => [p.pid, p.session]))
    let hit = await find(toMap(list))
    // A pane that started a moment ago: look at a fresh list once
    if (hit === null && panes && Date.now() - panes.at > 250) {
      list = await paneList(true)
      hit = await find(toMap(list))
    }
    if (hit === null || hit === 'host') return hit
    return probes.agentForSession(hit.session)
  }

  /** True when the agent has a pane in the server's tmux right now */
  async function hasLiveSession(agentId: string): Promise<boolean> {
    for (const p of await paneList()) {
      if (probes.agentForSession(p.session)?.id === agentId) return true
    }
    return false
  }

  function isLocal(address: string | undefined): boolean {
    if (isLoopbackAddress(address)) return true
    try { return probes.localAddresses().has(normaliseAddress(address)) } catch { return false }
  }

  /**
   * Who is calling. Never throws: a failed probe means "not from a session".
   * Refuses (instead of picking one) an API key of one agent used from the session of another, and in
   * strict mode the key of an agent that has a live session here, used from outside that session.
   */
  async function resolve(req: Pick<IncomingMessage, 'headers' | 'socket'>): Promise<Resolution> {
    const m = mode()
    if (m === 'off') return { caller: { kind: 'anonymous', mode: m } }
    const socket = req.socket
    const local = isLocal(socket?.remoteAddress)
    try {
      const bearer = bearerOf(req.headers?.authorization)
      const token = probes.operatorToken()
      if (bearer && token.hash && matchesOperatorToken(bearer, token.hash)) {
        return { caller: { kind: 'operator', via: 'operator-token', mode: m, local } }
      }
      const keyAgent = bearer && AMP_KEY.test(bearer) ? probes.agentForKey(bearer) : null

      let session: AgentRef | 'host' | null = null
      if (local && socket) {
        let p = bySocket.get(socket)
        if (!p) {
          p = sessionOf(socket).catch(() => null)
          bySocket.set(socket, p)
        }
        session = await p
      }
      if (session === 'host') return { caller: { kind: 'operator', via: 'host', mode: m, local } }

      if (session && keyAgent && session.id !== keyAgent.id) {
        return { refused: refusal(403, 'caller_mismatch', `This request comes from the session of ${session.name || session.id} but carries the API key of ${keyAgent.name || keyAgent.id}`) }
      }
      if (session) return { caller: { kind: 'agent', agentId: session.id, name: session.name, via: 'session', mode: m, local } }
      if (keyAgent) {
        if (m === 'strict' && await hasLiveSession(keyAgent.id)) {
          return { refused: refusal(403, 'session_required', `${keyAgent.name || keyAgent.id} has a session on this host; its requests must come from that session`) }
        }
        return { caller: { kind: 'agent', agentId: keyAgent.id, name: keyAgent.name, via: 'key', mode: m, local } }
      }
    } catch (err) {
      log(`[caller-identity] could not resolve the caller: ${(err as Error).message}`)
    }
    return { caller: { kind: 'anonymous', mode: m, local } }
  }

  return { resolve, mode }
}

// ---------------------------------------------------------------------------
// Decisions the services make with a Caller
// ---------------------------------------------------------------------------

/** identifier (id, name, alias, session name, name@host) -> the local agent's id */
export type AgentIdOf = (identifier: string) => string | null

function sameAgent(caller: Caller, identifier: string, idOf: AgentIdOf): boolean {
  if (!caller.agentId) return false
  if (identifier === caller.agentId) return true
  if (caller.name && identifier.toLowerCase() === caller.name.toLowerCase()) return true
  try { return idOf(identifier) === caller.agentId } catch { return false }
}

/** strict mode: an anonymous caller is refused (401). Everyone else passes */
export function requireIdentified(caller: Caller | undefined): CallerRefusal | null {
  if (caller && caller.mode === 'strict' && caller.kind === 'anonymous') {
    return refusal(401, 'caller_required', 'This route needs an identified caller: an agent session, an agent API key or the operator token')
  }
  return null
}

/**
 * Reading or changing a mailbox. An agent may use its own only; the operator any; an anonymous caller as
 * before in session mode, refused in strict mode. No caller (an in-process call): allowed.
 */
export function checkMailbox(caller: Caller | undefined, mailbox: string | null | undefined, idOf: AgentIdOf): CallerRefusal | null {
  if (!caller || caller.mode === 'off') return null
  const anon = requireIdentified(caller)
  if (anon) return anon
  if (caller.kind !== 'agent') return null
  if (mailbox && sameAgent(caller, String(mailbox), idOf)) return null
  return refusal(403, 'not_your_mailbox', `${caller.name || caller.agentId} may read and change only its own mailbox`)
}

/** Agent-only surfaces of other mailboxes (all agents' counts, a person's mailbox, the pending-wakes report) */
export function checkNotAgent(caller: Caller | undefined): CallerRefusal | null {
  if (!caller || caller.mode === 'off') return null
  const anon = requireIdentified(caller)
  if (anon) return anon
  if (caller.kind === 'agent') return refusal(403, 'not_your_mailbox', `${caller.name || caller.agentId} may read only its own mailbox`)
  return null
}

/**
 * A person's mailbox: never an agent's to read or send from. Anonymous callers keep today's access in every
 * mode, because a person's own device reads it (it signs what it sends with its device key).
 */
export function checkPersonMailbox(caller: Caller | undefined): CallerRefusal | null {
  if (!caller || caller.mode === 'off' || caller.kind !== 'agent') return null
  return refusal(403, 'not_your_mailbox', `${caller.name || caller.agentId} is an agent; a person's mailbox is not its own`)
}

/**
 * Sending as `from`. An agent sends as itself only (a missing `from` is its own); the operator as anyone;
 * an anonymous caller as before in session mode, refused in strict mode.
 * Returns the `from` to use, or a refusal.
 */
export function checkSender(
  caller: Caller | undefined,
  from: string | null | undefined,
  idOf: AgentIdOf,
): { from: string | null | undefined; refused?: undefined } | { refused: CallerRefusal; from?: undefined } {
  if (!caller || caller.mode === 'off') return { from }
  const anon = requireIdentified(caller)
  if (anon) return { refused: anon }
  if (caller.kind !== 'agent') return { from }
  if (!from) return { from: caller.agentId }
  if (sameAgent(caller, String(from), idOf)) return { from }
  return { refused: refusal(403, 'sender_mismatch', `${caller.name || caller.agentId} may send only as itself, not as ${from}`) }
}

/** What a stored message records about its sender */
export function senderViaOf(caller: Caller | undefined): SenderVia | undefined {
  if (!caller || caller.mode === 'off') return undefined
  return caller.kind === 'anonymous' ? 'claimed' : caller.via
}

/** The answer of GET /api/caller: only what a client may know about itself */
export function describeCaller(caller: Caller): Pick<Caller, 'kind' | 'agentId' | 'name' | 'via' | 'mode'> {
  return {
    kind: caller.kind,
    ...(caller.agentId ? { agentId: caller.agentId } : {}),
    ...(caller.name ? { name: caller.name } : {}),
    ...(caller.via ? { via: caller.via } : {}),
    mode: caller.mode,
  }
}

// ---------------------------------------------------------------------------
// Default probes (Linux: /proc; macOS and other BSDs: ps + lsof). No new dependency
// ---------------------------------------------------------------------------

const PROBE_TIMEOUT_MS = 3_000

function run(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { encoding: 'utf8', timeout: PROBE_TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024 }, (err, stdout) => {
      // lsof exits 1 when it finds nothing, with an empty stdout
      if (err && !stdout) reject(err); else resolve(stdout || '')
    })
  })
}

/** /proc/net/tcp{,6} lines -> the socket inode of local port `clientPort` connected to remote port `serverPort` */
export function findSocketInode(procNetTcp: string, clientPort: number, serverPort: number): string | null {
  for (const line of procNetTcp.split('\n')) {
    const f = line.trim().split(/\s+/)
    if (f.length < 10 || !f[1]?.includes(':')) continue
    const lp = parseInt(f[1].split(':').pop()!, 16)
    const rp = parseInt(f[2].split(':').pop()!, 16)
    if (lp === clientPort && rp === serverPort && f[9] && f[9] !== '0') return f[9]
  }
  return null
}

/** `lsof -F pn` output -> the pid whose connection is clientPort -> serverPort (the client end) */
export function parseLsofOwner(out: string, clientPort: number, serverPort: number): number | null {
  let pid: number | null = null
  for (const line of out.split('\n')) {
    if (line.startsWith('p')) pid = parseInt(line.slice(1), 10)
    else if (line.startsWith('n') && pid) {
      const m = /:(\d+)->.*:(\d+)$/.exec(line)
      if (m && Number(m[1]) === clientPort && Number(m[2]) === serverPort) return pid
    }
  }
  return null
}

/** /proc/<pid>/stat -> parent pid (the command name may hold spaces and parentheses) */
export function ppidFromStat(stat: string): number | null {
  const i = stat.lastIndexOf(')')
  if (i < 0) return null
  const f = stat.slice(i + 2).split(' ')
  const ppid = parseInt(f[1], 10)
  return Number.isFinite(ppid) ? ppid : null
}

/** A tmux session name -> its registry agent */
export function agentOfSession(session: string): AgentRef | null {
  const a = getAgentByName(agentNameOfSession(session)) || getAgentByName(session)
  return a ? { id: a.id, name: a.name } : null
}

/** For checkMailbox, when the mailbox is named by its tmux session */
export const agentIdOfSession: AgentIdOf = (session) => agentOfSession(session)?.id ?? null

export function defaultProbes(platform: NodeJS.Platform = process.platform): CallerProbes {
  const linux = platform === 'linux'
  let addrCache: { at: number; set: Set<string> } | null = null
  return {
    async listPanes() {
      const { stdout } = await tmux(['list-panes', '-a', '-F', '#{pane_pid}\t#{session_name}'], { timeout: PROBE_TIMEOUT_MS })
      return String(stdout).split('\n').map((l) => l.split('\t')).filter((f) => f.length === 2 && /^\d+$/.test(f[0]))
        .map(([pid, session]) => ({ pid: Number(pid), session }))
    },
    async processTable() {
      const table = new Map<number, number>()
      if (linux) {
        for (const name of await fs.promises.readdir('/proc')) {
          if (!/^\d+$/.test(name)) continue
          try {
            const ppid = ppidFromStat(await fs.promises.readFile(`/proc/${name}/stat`, 'utf8'))
            if (ppid !== null) table.set(Number(name), ppid)
          } catch { /* the process ended */ }
        }
        return table
      }
      const out = await run('ps', ['-axo', 'pid=,ppid='])
      for (const line of out.split('\n')) {
        const m = /^\s*(\d+)\s+(\d+)/.exec(line)
        if (m) table.set(Number(m[1]), Number(m[2]))
      }
      return table
    },
    async socketOwner(clientPort, serverPort, candidates) {
      if (candidates.length === 0) return null
      if (linux) {
        let inode: string | null = null
        for (const f of ['/proc/net/tcp', '/proc/net/tcp6']) {
          try { inode = findSocketInode(await fs.promises.readFile(f, 'utf8'), clientPort, serverPort) } catch { /* no IPv6 */ }
          if (inode) break
        }
        if (!inode) return null
        const target = `socket:[${inode}]`
        for (const pid of candidates) {
          let fds: string[] = []
          try { fds = await fs.promises.readdir(`/proc/${pid}/fd`) } catch { continue }
          for (const fd of fds) {
            try { if ((await fs.promises.readlink(`/proc/${pid}/fd/${fd}`)) === target) return pid } catch { /* closed */ }
          }
        }
        return null
      }
      const out = await run('lsof', ['-nP', '-a', '-p', candidates.join(','), `-iTCP:${clientPort}`, '-F', 'pn'])
      return parseLsofOwner(out, clientPort, serverPort)
    },
    agentForSession: agentOfSession,
    agentForKey(apiKey) {
      const rec = validateApiKey(apiKey)
      if (!rec) return null
      const a = getAgent(rec.agent_id)
      return { id: rec.agent_id, name: a?.name }
    },
    operatorToken: () => operatorToken(),
    localAddresses() {
      if (!addrCache || Date.now() - addrCache.at > 30_000) {
        const set = new Set<string>()
        for (const list of Object.values(os.networkInterfaces())) {
          for (const a of list || []) set.add(normaliseAddress(a.address))
        }
        addrCache = { at: Date.now(), set }
      }
      return addrCache.set
    },
  }
}
