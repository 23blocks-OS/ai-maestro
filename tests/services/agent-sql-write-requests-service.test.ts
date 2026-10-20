import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

const mocks = vi.hoisted(() => ({
  getAgent: vi.fn(),
  isSelf: vi.fn(),
  findPeerHostUrl: vi.fn(async (_id: string): Promise<string | undefined> => undefined),
  runWakeChain: vi.fn(async (_ctx: any) => ({ confirmed: true, notified: true, deferred: false })),
}))
vi.mock('@/lib/agent-registry', () => ({ getAgent: mocks.getAgent }))
vi.mock('@/lib/hosts-config', () => ({ isSelf: mocks.isSelf }))
vi.mock('@/lib/owning-host', () => ({ findPeerHostUrl: mocks.findPeerHostUrl }))
vi.mock('@/lib/wake-chain', () => ({ runWakeChain: mocks.runWakeChain }))

import { answerSqlWriteRequest, listSqlWriteRequests, isSameOriginBrowser } from '@/services/agent-sql-write-requests-service'
import { fingerprint } from '@/lib/sql-write-requests'

const FIXTURE = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'sql-write-request.json'), 'utf8'))
const AGENT = { id: 'agent-1', name: 'fixture-agent', hostId: 'this-host' }
const BROWSER = { secFetchSite: 'same-origin', origin: 'http://localhost:23000', host: 'localhost:23000' }
const ID = FIXTURE.id as string

let home: string
const file = (id = ID) => path.join(home, 'requests', `${id}.json`)
const read = (id = ID) => JSON.parse(fs.readFileSync(file(id), 'utf8'))
function put(over: Record<string, unknown> = {}, id = ID) {
  const r = { ...structuredClone(FIXTURE), id, expires: Date.now() / 1000 + 600, ...over }
  fs.writeFileSync(file(id), JSON.stringify(r))
  return r
}

let logged: string[]
beforeEach(() => {
  vi.clearAllMocks()
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'sqlw-'))
  fs.mkdirSync(path.join(home, 'requests'))
  process.env.SAFE_PSQL_HOME = home
  mocks.getAgent.mockImplementation((id: string) => (id === 'agent-1' ? AGENT : undefined))
  mocks.isSelf.mockReturnValue(true)
  logged = []
  for (const m of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    vi.spyOn(console, m).mockImplementation((...a: unknown[]) => { logged.push(a.map(String).join(' ')) })
  }
})
afterEach(() => {
  delete process.env.SAFE_PSQL_HOME
  fs.rmSync(home, { recursive: true, force: true })
})

describe('listing', () => {
  it("shows this agent's pending, unexpired requests only", async () => {
    put()
    put({ agent: 'someone-else' }, 'w-aaaaaaaaaaaa')
    put({ status: 'approved' }, 'w-bbbbbbbbbbbb')
    put({ expires: Date.now() / 1000 - 5 }, 'w-cccccccccccc')
    fs.writeFileSync(file('w-dddddddddddd'), '{not json')
    fs.writeFileSync(path.join(home, 'requests', 'notes.txt'), 'x')
    const r = await listSqlWriteRequests('agent-1')
    expect(r.status).toBe(200)
    expect((r.data as any).requests.map((x: any) => x.id)).toEqual([ID])
  })

  it('is empty when there is no requests directory', async () => {
    fs.rmSync(path.join(home, 'requests'), { recursive: true })
    expect(((await listSqlWriteRequests('agent-1')).data as any).requests).toEqual([])
  })

  it('refuses unknown agents and unsafe ids', async () => {
    expect((await listSqlWriteRequests('nobody')).status).toBe(404)
    expect((await listSqlWriteRequests('../etc')).status).toBe(404)
  })
})

describe('the same-origin rule', () => {
  it('accepts a page of this server and nothing else', () => {
    expect(isSameOriginBrowser({ secFetchSite: 'same-origin' })).toBe(true)
    expect(isSameOriginBrowser({ origin: 'http://100.1.2.3:23000', host: '100.1.2.3:23000' })).toBe(true)
    expect(isSameOriginBrowser({})).toBe(false)
    expect(isSameOriginBrowser({ secFetchSite: 'cross-site', origin: 'http://localhost:23000', host: 'localhost:23000' })).toBe(false)
    expect(isSameOriginBrowser({ secFetchSite: 'none' })).toBe(false)
    expect(isSameOriginBrowser({ origin: 'http://evil.test', host: 'localhost:23000' })).toBe(false)
    expect(isSameOriginBrowser({ origin: 'not a url', host: 'localhost:23000' })).toBe(false)
    expect(isSameOriginBrowser({ origin: 'http://localhost:23000' })).toBe(false)
  })
})

describe('approving', () => {
  it("does the wrapper's state change and tells the agent without any value", async () => {
    put()
    const r = await answerSqlWriteRequest('agent-1', ID, { action: 'approve', environment: ' staging ' }, BROWSER)
    expect(r.status).toBe(200)
    expect((r.data as any).approved).toBe(true)
    const saved = read()
    expect(saved.status).toBe('approved')
    expect(saved.approved_by).toBeTruthy()
    expect(saved.approved_at).toBeGreaterThan(0)
    expect(saved.apply_by).toBeCloseTo(saved.approved_at + saved.ttl, 3)
    expect(saved.approved_fingerprint).toBe(saved.fingerprint)
    expect(fingerprint(saved)).toBe(saved.fingerprint)
    expect(saved.params).toEqual(FIXTURE.params) // still there for apply
    const told = JSON.stringify(mocks.runWakeChain.mock.calls)
    expect(told).toContain(ID)
    expect(told).not.toContain('ana@example.test')
    expect(told).not.toContain('"pro"')
    expect(fs.readFileSync(path.join(home, 'write.log'), 'utf8')).not.toContain('ana@example.test')
    expect(logged.join('\n')).not.toContain('ana@example.test')
  })

  it('refuses without the browser headers (a plain curl), and changes nothing', async () => {
    put()
    for (const h of [{}, { origin: 'http://localhost:23000' }, { secFetchSite: 'cross-site', host: 'localhost:23000' }, { origin: 'http://evil.test', host: 'localhost:23000' }]) {
      const r = await answerSqlWriteRequest('agent-1', ID, { action: 'approve', environment: 'staging' }, h)
      expect(r.status).toBe(403)
    }
    expect(read().status).toBe('pending')
    expect(mocks.runWakeChain).not.toHaveBeenCalled()
  })

  it('refuses the wrong typed environment, or none, and leaves the request pending', async () => {
    put()
    for (const environment of ['production', 'Staging', '', undefined, 5]) {
      const r = await answerSqlWriteRequest('agent-1', ID, { action: 'approve', environment }, BROWSER)
      expect(r.status).toBe(400)
    }
    expect(read().status).toBe('pending')
  })

  it.each(['approved', 'rejected', 'applied', 'expired', 'failed'])('refuses a request that is %s', async (status) => {
    put({ status })
    const r = await answerSqlWriteRequest('agent-1', ID, { action: 'approve', environment: 'staging' }, BROWSER)
    expect(r.status).toBe(409)
    expect(read().status).toBe(status)
  })

  it('refuses an expired request and marks it expired, dropping the values like the wrapper', async () => {
    put({ expires: Date.now() / 1000 - 1 })
    const r = await answerSqlWriteRequest('agent-1', ID, { action: 'approve', environment: 'staging' }, BROWSER)
    expect(r.status).toBe(410)
    const saved = read()
    expect(saved.status).toBe('expired')
    expect(saved.params).toBeNull()
    expect(saved.diff).toBeNull()
  })

  it('refuses a request whose content changed after it was proposed', async () => {
    put({ sql: 'UPDATE customers SET plan = %(plan)s' })
    const r = await answerSqlWriteRequest('agent-1', ID, { action: 'approve', environment: 'staging' }, BROWSER)
    expect(r.status).toBe(409)
    expect(read().status).toBe('pending')
  })

  it('refuses a request that belongs to another agent as if it did not exist', async () => {
    put({ agent: 'someone-else' })
    const r = await answerSqlWriteRequest('agent-1', ID, { action: 'approve', environment: 'staging' }, BROWSER)
    expect(r.status).toBe(404)
    expect(read().status).toBe('pending')
  })

  it('refuses bad request ids, path traversal included, and reads nothing outside the directory', async () => {
    fs.writeFileSync(path.join(home, 'secret.json'), JSON.stringify({ ...FIXTURE, id: 'secret' }))
    for (const rid of ['../secret', '..%2Fsecret', 'w-../../secret', 'secret', 'w-XYZ', 'w-2c210826956f.json', 'w-2c210826956', 'w-2c2108269560f', '']) {
      const r = await answerSqlWriteRequest('agent-1', rid, { action: 'approve', environment: 'staging' }, BROWSER)
      expect(r.status, rid).toBe(400)
    }
    expect(JSON.parse(fs.readFileSync(path.join(home, 'secret.json'), 'utf8')).status).toBe('pending')
  })

  it('refuses an unknown request, unknown agents, unsafe agent ids and unknown actions', async () => {
    put()
    expect((await answerSqlWriteRequest('agent-1', 'w-000000000000', { action: 'approve', environment: 'staging' }, BROWSER)).status).toBe(404)
    expect((await answerSqlWriteRequest('nobody', ID, { action: 'approve', environment: 'staging' }, BROWSER)).status).toBe(404)
    expect((await answerSqlWriteRequest('../x', ID, { action: 'approve', environment: 'staging' }, BROWSER)).status).toBe(404)
    for (const body of [{}, { action: 'apply' }, null, 'approve', ['approve']]) {
      expect((await answerSqlWriteRequest('agent-1', ID, body, BROWSER)).status).toBe(400)
    }
    expect(read().status).toBe('pending')
  })

  it('does not follow a symlink in the requests directory', async () => {
    const outside = path.join(home, 'outside.json')
    fs.writeFileSync(outside, JSON.stringify({ ...FIXTURE, expires: Date.now() / 1000 + 600 }))
    fs.symlinkSync(outside, file())
    const r = await answerSqlWriteRequest('agent-1', ID, { action: 'approve', environment: 'staging' }, BROWSER)
    expect(r.status).toBe(404)
    expect(JSON.parse(fs.readFileSync(outside, 'utf8')).status).toBe('pending')
  })
})

describe('rejecting', () => {
  it('rejects, drops the values and tells the agent', async () => {
    put()
    const r = await answerSqlWriteRequest('agent-1', ID, { action: 'reject' }, BROWSER)
    expect(r.status).toBe(200)
    const saved = read()
    expect(saved.status).toBe('rejected')
    expect(saved.params).toBeNull()
    expect(mocks.runWakeChain).toHaveBeenCalledTimes(1)
  })

  it('needs the browser headers too', async () => {
    put()
    expect((await answerSqlWriteRequest('agent-1', ID, { action: 'reject' }, {})).status).toBe(403)
    expect(read().status).toBe('pending')
  })

  it('refuses a request that is no longer pending', async () => {
    put({ status: 'approved' })
    expect((await answerSqlWriteRequest('agent-1', ID, { action: 'reject' }, BROWSER)).status).toBe(409)
  })
})

describe('an agent this host does not know, that lives on a peer', () => {
  it('lists its pending requests from the peer', async () => {
    mocks.findPeerHostUrl.mockResolvedValue('http://100.80.12.6:23000')
    const seen: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string) => { seen.push(url); return { status: 200, json: async () => ({ requests: [] }) } }))
    const r = await listSqlWriteRequests('33bcd570-5424-4a97-94a4-ec52c597827d')
    expect(r.status).toBe(200)
    expect(seen[0]).toBe('http://100.80.12.6:23000/api/agents/33bcd570-5424-4a97-94a4-ec52c597827d/sql-write-requests')
    vi.unstubAllGlobals()
  })
})
