/**
 * F029 item 2: boot the REAL headless server and call its routes.
 *
 * `MAESTRO_MODE=headless tsx server.mjs` on a random free port, a temporary HOME and
 * a private tmux socket directory; then
 *   - every GET route that takes no path parameter, with an empty request: no 5xx;
 *   - every static POST route (minus a reasoned exclusion list) with `{}`, with a
 *     hostile body (traversal strings, shell metacharacters, a 1 MB string), with
 *     invalid JSON and with `null`: no 5xx;
 *   - hostile ids on a sample of parameterized routes: no 5xx;
 *   - nothing new appears in the repo checkout (the server's cwd) or at the temp
 *     HOME's parent as a result of those requests;
 * then the server is stopped and the test asserts the port is free again.
 *
 * Skipped (with a printed reason) on Windows, when tsx is not installed, or when
 * AIM_SKIP_HEADLESS_SMOKE=1. CI runs Node 20 and 22 on ubuntu-latest (.github/workflows/ci.yml);
 * the server needs tmux only for the session routes, which answer an error when it is absent.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { spawn, type ChildProcess } from 'child_process'
import fs from 'fs'
import net from 'net'
import os from 'os'
import path from 'path'
import { listRoutes } from '@/services/headless-router'

const root = path.join(__dirname, '..')
const tsx = path.join(root, 'node_modules', '.bin', 'tsx')

const skipReason =
  process.env.AIM_SKIP_HEADLESS_SMOKE === '1' ? 'AIM_SKIP_HEADLESS_SMOKE=1'
  : process.platform === 'win32' ? 'cannot spawn tsx on Windows'
  : !fs.existsSync(tsx) ? `tsx not installed at ${tsx}`
  : null
if (skipReason) console.warn(`[headless-smoke] SKIPPED: ${skipReason}`)

// POST routes the smoke test must not call, each with the reason
const POST_EXCLUDED: Record<string, string> = {
  '/api/agents/cloud/create': 'provisions cloud infrastructure',
  '/api/agents/docker/create': 'starts containers',
  '/api/agents/startup': 'initialises every registered agent (starts tmux sessions, databases)',
  '/api/help/agent': 'creates the assistant agent (tmux session)',
  '/api/sessions/create': 'creates a tmux session',
  '/api/memory/sweep': 'runs the memory maintenance sweep for every agent',
  '/api/memory/backlog': 'starts the night consolidation backlog',
  '/api/hosts/sync': 'triggers a mesh sync over the network',
  '/api/hosts/register-peer': 'registers and contacts a remote peer',
  '/api/hosts/exchange-peers': 'contacts remote peers',
  '/api/hosts': 'adds a host to the mesh (network probe)',
  '/api/plugin-builder/build': 'clones repositories and runs a build',
  '/api/plugin-builder/scan-repo': 'clones a repository over the network',
  '/api/plugin-builder/push': 'pushes to GitHub',
  '/api/agents/health': 'fetches an arbitrary URL on behalf of the caller (proxyHealthCheck)',
  '/api/messages/doorbell': 'wakes agent panes',
  '/api/messages/forward': 'delivers messages (network)',
  '/api/messages': 'delivers messages (network)',
  '/api/teams/notify': 'delivers messages to team agents',
  '/api/v1/federation/deliver': 'delivers to external providers',
  '/api/v1/route': 'routes messages, possibly over the network',
  '/api/agents/normalize-hosts': 'rewrites the registry',
  '/api/agents/directory/sync': 'syncs with remote hosts',
  '/api/browse': 'creates a folder on disk',
  '/api/organization': 'writes the organization name (not hostile-body relevant)',
}

const HOSTILE_STRINGS = ['../../../etc/passwd', '..\\..\\windows', '$(touch pwned)', '`touch pwned`', '; touch pwned', '\u0000', 'file:///etc/passwd', '%2e%2e%2f']
function hostileBody(): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  const keys = ['name', 'id', 'agentId', 'sessionName', 'session', 'path', 'filePath', 'conversationFile', 'url', 'command', 'message',
    'subject', 'to', 'from', 'text', 'title', 'description', 'program', 'workingDirectory', 'projectDirectory', 'action', 'query', 'q',
    'file', 'alias', 'address', 'email', 'token', 'key', 'ids', 'tasks', 'settings']
  keys.forEach((k, i) => { body[k] = HOSTILE_STRINGS[i % HOSTILE_STRINGS.length] })
  body.big = 'A'.repeat(1_000_000)
  body.nested = { id: '../x', name: '$(id)', host: { id: '../h', url: 'http://127.0.0.1:1/x' } }
  body.ids = ['../a', '..\\b']
  return body
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.once('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address() as net.AddressInfo
      srv.close(() => resolve(port))
    })
  })
}

function portIsFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = net.createServer()
    srv.once('error', () => resolve(false))
    srv.listen(port, '127.0.0.1', () => srv.close(() => resolve(true)))
  })
}

/** Names (not contents) of files under the repo checkout that a request could plausibly create */
function snapshotRepo(): string[] {
  const out: string[] = []
  // server.mjs creates <cwd>/logs (gitignored) at startup, for any run; not a request side effect
  const skip = new Set(['node_modules', '.next', '.git', 'plugin', 'coverage', '.claude', 'logs'])
  const walk = (dir: string, depth: number) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (skip.has(e.name)) continue
      const p = path.join(dir, e.name)
      out.push(path.relative(root, p))
      if (e.isDirectory() && depth < 2 && ['data', 'logs', 'tmp'].includes(e.name)) walk(p, depth + 1)
    }
  }
  walk(root, 0)
  return out.sort()
}

async function waitFor<T>(fn: () => Promise<T | null | false>, ms: number, every = 250): Promise<T | null> {
  const end = Date.now() + ms
  while (Date.now() < end) {
    const v = await fn()
    if (v) return v
    await new Promise((r) => setTimeout(r, every))
  }
  return null
}

describe.skipIf(!!skipReason)('headless server smoke test', () => {
  let tmp: string
  let home: string
  let port: number
  let child: ChildProcess
  let log = ''
  let exited: number | null | undefined
  let before: string[]
  let logsExisted = false
  const base = () => `http://127.0.0.1:${port}`

  async function req(method: string, url: string, body?: BodyInit | null, headers: Record<string, string> = { 'content-type': 'application/json' }) {
    const res = await fetch(base() + url, { method, body, headers, signal: AbortSignal.timeout(45_000) })
    const text = await res.text()
    return { status: res.status, text }
  }

  beforeAll(async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aim-smoke-'))
    home = path.join(tmp, 'home')
    fs.mkdirSync(path.join(home, '.aimaestro'), { recursive: true })
    fs.mkdirSync(path.join(tmp, 'tmux'), { recursive: true })
    fs.mkdirSync(path.join(tmp, 'tmpdir'), { recursive: true })
    port = await freePort()
    before = snapshotRepo()
    logsExisted = fs.existsSync(path.join(root, 'logs'))

    child = spawn(tsx, ['server.mjs'], {
      cwd: root,
      env: {
        PATH: process.env.PATH ?? '',
        HOME: home,
        USERPROFILE: home,
        TMPDIR: path.join(tmp, 'tmpdir'),
        TMUX_TMPDIR: path.join(tmp, 'tmux'), // a private tmux server, never the user's
        PORT: String(port),
        HOSTNAME: '127.0.0.1',
        MAESTRO_MODE: 'headless',
        NODE_ENV: 'production',
        LANG: 'C.UTF-8',
        AIM_SMOKE_TEST: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    child.stdout!.on('data', (d) => { log += d.toString(); if (log.length > 200_000) log = log.slice(-100_000) })
    child.stderr!.on('data', (d) => { log += d.toString(); if (log.length > 200_000) log = log.slice(-100_000) })
    child.on('exit', (code) => { exited = code })

    const up = await waitFor(async () => {
      if (exited !== undefined) throw new Error(`server exited early (code ${exited}):\n${log.slice(-2000)}`)
      try {
        const r = await fetch(`${base()}/api/config`, { signal: AbortSignal.timeout(2000) })
        return r.status > 0
      } catch { return false }
    }, 90_000)
    if (!up) throw new Error(`server did not answer within 90s:\n${log.slice(-2000)}`)
  }, 120_000)

  afterAll(async () => {
    if (child && exited === undefined) {
      child.kill('SIGTERM')
      const gone = await waitFor(async () => exited !== undefined, 8000, 100)
      if (!gone) child.kill('SIGKILL')
      await waitFor(async () => exited !== undefined, 5000, 100)
    }
    // best effort: a tmux server we may have started on the private socket
    try { spawn('tmux', ['kill-server'], { env: { PATH: process.env.PATH ?? '', TMUX_TMPDIR: path.join(tmp, 'tmux') }, stdio: 'ignore' }).on('error', () => {}) } catch { /* no tmux */ }
    fs.rmSync(tmp, { recursive: true, force: true })
    // the server made <cwd>/logs on startup; remove it only if this run is the one that created it
    if (!logsExisted) fs.rmSync(path.join(root, 'logs'), { recursive: true, force: true })
  }, 60_000)

  const table = listRoutes()
  const getRoutes = table.filter((r) => r.method === 'GET' && !r.path.includes('['))
  const postRoutes = table.filter((r) => r.method === 'POST' && !r.path.includes('[') && !(r.path in POST_EXCLUDED))

  it('knows which routes to call', () => {
    expect(getRoutes.length).toBeGreaterThan(30)
    expect(postRoutes.length).toBeGreaterThan(12)
  })

  it('every GET route without path parameters answers without a 5xx', async () => {
    const failures: string[] = []
    for (const r of getRoutes) {
      // /api/meetings/inject-queue and friends answer 400 when a required query param is missing: that is the point
      const res = await req('GET', r.path, undefined, {})
      if (res.status >= 500 || res.status === 0) failures.push(`GET ${r.path} -> ${res.status} ${res.text.slice(0, 150)}`)
    }
    expect(failures).toEqual([])
  }, 300_000)

  it('static POST routes survive `{}`, a hostile body, invalid JSON and null with 2xx/4xx only', async () => {
    const failures: string[] = []
    const hostile = JSON.stringify(hostileBody())
    for (const r of postRoutes) {
      for (const [label, body] of [['{}', '{}'], ['hostile', hostile], ['invalid json', '{oops'], ['null', 'null']] as const) {
        const res = await req('POST', r.path, body)
        if (res.status >= 500 || res.status === 0) failures.push(`POST ${r.path} [${label}] -> ${res.status} ${res.text.slice(0, 150)}`)
      }
    }
    expect(failures).toEqual([])
  }, 600_000)

  it('hostile ids on parameterized routes answer 4xx/2xx, never 5xx', async () => {
    const ids = ['..%2F..%2Fetc%2Fpasswd', '%2e%2e', 'a%00b', '%24(touch%20pwned)', 'x'.repeat(2000), '%E0%A4%A']
    const sample: Array<[string, string]> = [
      ['GET', '/api/agents/{id}'], ['GET', '/api/agents/{id}/session'], ['POST', '/api/agents/{id}/heartbeat'],
      ['POST', '/api/agents/{id}/wake'], ['POST', '/api/agents/{id}/hibernate'], ['GET', '/api/agents/{id}/memory'],
      ['GET', '/api/agents/{id}/search?q=x'], ['POST', '/api/agents/{id}/index-delta'], ['GET', '/api/agents/{id}/graph/query?q=callers'],
      ['GET', '/api/agents/{id}/docs'], ['GET', '/api/agents/{id}/schedule'], ['POST', '/api/agents/{id}/schedule'],
      ['GET', '/api/agents/{id}/skills'], ['GET', '/api/agents/{id}/repos'], ['GET', '/api/agents/{id}/messages'],
      ['GET', '/api/agents/by-name/{id}'], ['GET', '/api/teams/{id}'], ['GET', '/api/webhooks/{id}'], ['GET', '/api/domains/{id}'],
      ['GET', '/api/meetings/{id}'], ['GET', '/api/v1/attachments/{id}'], ['GET', '/api/conversations/{id}/messages'],
      ['PATCH', '/api/sessions/{id}/rename'], ['GET', '/api/sessions/{id}/command'], ['DELETE', '/api/sessions/{id}'],
    ]
    const failures: string[] = []
    for (const [method, tpl] of sample) {
      for (const id of ids) {
        const res = await req(method, tpl.replace('{id}', id), method === 'GET' ? undefined : JSON.stringify({ newName: id, name: id }))
        if (res.status >= 500 || res.status === 0) failures.push(`${method} ${tpl.replace('{id}', id).slice(0, 70)} -> ${res.status} ${res.text.slice(0, 120)}`)
      }
    }
    expect(failures).toEqual([])
  }, 300_000)

  it('created no files in the checkout and none beside the temp HOME', () => {
    expect(snapshotRepo()).toEqual(before)
    expect(fs.existsSync(path.join(root, 'pwned'))).toBe(false)
    expect(fs.existsSync(path.join(home, 'pwned'))).toBe(false)
    expect(fs.existsSync(path.join(tmp, 'pwned'))).toBe(false)
    expect(fs.existsSync(path.join(tmp, 'etc'))).toBe(false)
    // anything the server wrote lives under the temp HOME or the private TMPDIR
    const top = fs.readdirSync(tmp).sort()
    expect(top.filter((n) => !['home', 'tmux', 'tmpdir'].includes(n))).toEqual([])
  })

  it('stops on SIGTERM and frees the port', async () => {
    expect(await portIsFree(port)).toBe(false) // still serving
    child.kill('SIGTERM')
    const gone = await waitFor(async () => exited !== undefined, 15_000, 100)
    if (!gone) child.kill('SIGKILL')
    await waitFor(async () => exited !== undefined, 5000, 100)
    expect(exited).not.toBeUndefined()
    const free = await waitFor(() => portIsFree(port), 10_000, 200)
    expect(free).toBe(true)
  }, 45_000)
})
