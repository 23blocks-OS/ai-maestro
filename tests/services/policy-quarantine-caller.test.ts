/**
 * Approve, reject, list and read quarantine entries with the caller server.mjs found (lib/caller-identity.ts):
 * the server itself decides anything; an agent decides only as a named approver and never on what it sent, whatever
 * `by` says; an anonymous caller keeps today's trust (no strict mode, no operator token: F132); a peer host passes
 * decisions on as before. Both routers hand the caller to the service.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { PassThrough } from 'stream'
import { NextRequest } from 'next/server'
import { CALLER_HEADER, encodeCaller, isProtectedPath, type Caller } from '@/lib/caller-identity'

// The outcome and approval-request notices go through the AMP route; not under test here
vi.mock('@/services/provider-notices', () => ({ sendOutcomeNotice: vi.fn(async () => {}), sendApprovalRequests: vi.fn(async () => {}) }))

import { createHeadlessRouter } from '@/services/headless-router'
import { POST as nextApprove } from '@/app/api/v1/quarantine/[id]/approve/route'
import { POST as nextReject } from '@/app/api/v1/quarantine/[id]/reject/route'
import { GET as nextGetEntry } from '@/app/api/v1/quarantine/[id]/route'
import { GET as nextList } from '@/app/api/v1/quarantine/route'

const agent = (name: string, via: 'session' | 'key' = 'session', mode: Caller['mode'] = 'session'): Caller =>
  ({ kind: 'agent', agentId: `id-${name}`, name, via, mode, local: true })
const alice = agent('alice'), bob = agent('bob'), mallory = agent('mallory')
const operator: Caller = { kind: 'operator', via: 'host', mode: 'session', local: true }
const sessionAnon: Caller = { kind: 'anonymous', mode: 'session', local: true }
const remoteAnon: Caller = { kind: 'anonymous', mode: 'session', local: false }

// bob's messages to payroll wait for alice (an agent) or Carol (a person)
const ASK = { id: 'payroll-asks', effect: 'ask', from: 'agent:bob', to: 'agent:payroll', approvers: ['agent:alice', 'person:carol'] }

let home: string
const deliver = vi.fn(async () => ({ ok: true }))
const notify = vi.fn(async () => {})
const deps = () => ({ deliver, notify, fetch })

beforeAll(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'policy-caller-home-'))
  vi.stubEnv('HOME', home)
  vi.stubEnv('AIMAESTRO_POLICY_FILE', '')
  vi.stubEnv('AIMAESTRO_POLICY_FAIL_CLOSED', '')
  fs.mkdirSync(path.join(home, '.aimaestro'), { recursive: true })
})
afterAll(() => {
  vi.unstubAllEnvs()
  fs.rmSync(home, { recursive: true, force: true })
})
beforeEach(() => {
  deliver.mockClear(); notify.mockClear()
  fs.rmSync(path.join(home, '.aimaestro', 'policy'), { recursive: true, force: true })
  fs.writeFileSync(path.join(home, '.aimaestro', 'policy.json'), JSON.stringify({ version: 2, rules: [ASK] }))
})

async function holdOne(): Promise<string> {
  const { sendMessage } = await import('@/services/messages-service')
  const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
  const r = await sendMessage({ from: 'bob', to: 'payroll', subject: 'Raise', content: { type: 'request', message: 'please approve my raise' } })
  quiet.mockRestore()
  expect(r.status).toBe(202)
  return (r.data as any).quarantine.quarantine_id
}

async function svc() { return import('@/services/policy-service') }

describe('who may approve or reject', () => {
  it('the sender never decides on its own entry, whatever `by` names', async () => {
    const id = await holdOne()
    const { decidePolicyQuarantine } = await svc()
    for (const by of [undefined, 'agent:alice', 'Carol', 'the operator']) {
      const r = await decidePolicyQuarantine(id, 'approve', { ...(by ? { by } : {}) }, deps(), bob)
      expect(r).toMatchObject({ status: 403, data: { error: 'forbidden', message: expect.stringContaining('Whoever sent it') } })
    }
    expect(await decidePolicyQuarantine(id, 'reject', { by: 'agent:alice' }, deps(), agent('bob', 'key'))).toMatchObject({ status: 403 })
    expect(deliver).not.toHaveBeenCalled()
  })

  it('an agent that is not an approver is refused, even when it names one', async () => {
    const id = await holdOne()
    const { decidePolicyQuarantine } = await svc()
    const r = await decidePolicyQuarantine(id, 'approve', { by: 'agent:alice' }, deps(), mallory)
    expect(r).toMatchObject({ status: 403, data: { error: 'forbidden', message: expect.stringContaining('mallory is not an approver') } })
    // An agent is never a person approver
    expect((await decidePolicyQuarantine(id, 'approve', { by: 'Carol' }, deps(), mallory)).status).toBe(403)
  })

  it('an approver agent approves, recorded as itself, not as the `by` it sent', async () => {
    const id = await holdOne()
    const { decidePolicyQuarantine, getPolicyQuarantine } = await svc()
    const { getSelfHostId } = await import('@/lib/hosts-config')
    const r = await decidePolicyQuarantine(id, 'approve', { by: 'Carol' }, deps(), alice)
    expect(r).toMatchObject({ status: 200, data: { status: 'approved', delivered: true } })
    expect(deliver).toHaveBeenCalledTimes(1)
    expect((await getPolicyQuarantine(id)).data).toMatchObject({ decided: { by: `agent:alice@${getSelfHostId()}`, caller: 'agent-session', via: 'rest' } })
  })

  it('the operator decides any entry, recorded as the operator', async () => {
    const id = await holdOne()
    const { decidePolicyQuarantine, getPolicyQuarantine } = await svc()
    expect(await decidePolicyQuarantine(id, 'reject', { by: 'Carol' }, deps(), operator)).toMatchObject({ status: 200, data: { status: 'rejected' } })
    expect((await getPolicyQuarantine(id)).data).toMatchObject({ status: 'rejected', decided: { by: 'the operator (Carol)', caller: 'operator' } })
  })

  it('anonymous (the dashboard): as before', async () => {
    const id = await holdOne()
    const { decidePolicyQuarantine, getPolicyQuarantine } = await svc()
    expect(await decidePolicyQuarantine(id, 'approve', { by: 'Carol' }, deps(), sessionAnon)).toMatchObject({ status: 200 })
    expect((await getPolicyQuarantine(id)).data).toMatchObject({ decided: { by: 'Carol (unverified)' } })
    expect((await getPolicyQuarantine(id)).data).not.toHaveProperty('decided.caller')
  })

  it('a signed answer from the sender is refused too', async () => {
    const id = await holdOne()
    const { decideQuarantine, listQuarantine } = await import('@/lib/policy-approvals')
    const entry = listQuarantine().find(e => e.quarantine_id === id)!
    expect(entry.sender).toBeTruthy()
    const signed = { id: 'msg_1', from: entry.sender!, to: '_provider', subject: 'Re', priority: 'normal', in_reply_to: 'msg_0', payload: {}, signature: 'sig', verified_at: new Date().toISOString() }
    expect(decideQuarantine(id, 'approve', { signed })).toMatchObject({ ok: false, status: 403, message: expect.stringContaining('Whoever sent it') })
    // A signed answer is checked on its own `from`: a known caller cannot change that
    expect(decideQuarantine(id, 'approve', { signed, known: { kind: 'operator' } })).toMatchObject({ ok: false, status: 403 })
  })
})

describe('peers', () => {
  const peerEnv = async () => {
    const { clearHostsCache } = await import('@/lib/hosts-config')
    vi.stubEnv('AIMAESTRO_HOSTS', JSON.stringify([{ id: 'peer-b', name: 'peer-b', url: 'http://peer-b.test:23000' }]))
    clearHostsCache()
    return () => { vi.stubEnv('AIMAESTRO_HOSTS', ''); clearHostsCache() }
  }

  it('a decision from a registered peer host keeps today\'s behaviour', async () => {
    const done = await peerEnv()
    try {
      const id = await holdOne()
      const { decidePolicyQuarantine, getPolicyQuarantine } = await svc()
      // An agent is not a host
      expect(await decidePolicyQuarantine(id, 'approve', {}, deps(), alice, 'peer-b')).toMatchObject({ status: 403, data: { error: 'sender_mismatch' } })
      // The peer named the agent that decided there: the approver and sender checks apply to that name
      expect(await decidePolicyQuarantine(id, 'approve', { by: 'agent:bob@peer-b' }, deps(), remoteAnon, 'peer-b')).toMatchObject({ status: 403 })
      expect(await decidePolicyQuarantine(id, 'approve', { by: 'Carol' }, deps(), remoteAnon, 'peer-b')).toMatchObject({ status: 200 })
      expect((await getPolicyQuarantine(id)).data).toMatchObject({ decided: { by: 'Carol (unverified)' } })
    } finally { done() }
  })

  it('a decision passed to a peer names the caller found here, and says which host passes it', async () => {
    const done = await peerEnv()
    const calls: { url: string; init?: RequestInit }[] = []
    const peerFetch = (async (url: string, init?: RequestInit) => {
      calls.push({ url, init })
      return new Response(JSON.stringify({ quarantine_id: 'qtn_1763650000_abcdef', status: 'approved', message_id: null, delivered: false }), { status: 200 })
    }) as unknown as typeof fetch
    try {
      const { decidePolicyQuarantine } = await svc()
      const { getSelfHostId } = await import('@/lib/hosts-config')
      const self = getSelfHostId()
      await decidePolicyQuarantine('qtn_1763650000_abcdef', 'approve', { by: 'the operator', host: 'peer-b' }, { ...deps(), fetch: peerFetch }, mallory)
      expect(JSON.parse(calls[0].init!.body as string)).toEqual({ by: `agent:mallory@${self}` })
      expect((calls[0].init!.headers as Record<string, string>)['X-Forwarded-From']).toBe(self)
      await decidePolicyQuarantine('qtn_1763650000_abcdef', 'approve', { host: 'peer-b' }, { ...deps(), fetch: peerFetch }, operator)
      expect(JSON.parse(calls[1].init!.body as string)).toEqual({ by: `the operator on ${self}` })
      // The dashboard in session mode: as before
      await decidePolicyQuarantine('qtn_1763650000_abcdef', 'approve', { by: 'Carol', host: 'peer-b' }, { ...deps(), fetch: peerFetch }, sessionAnon)
      expect(JSON.parse(calls[2].init!.body as string)).toEqual({ by: 'Carol' })
      expect(calls).toHaveLength(3)
    } finally { done() }
  })
})

describe('who may read an entry and the held message', () => {
  it('an agent sees what it sent, receives or approves; the operator and the dashboard see everything', async () => {
    const id = await holdOne()
    const { getPolicyQuarantine, listPolicyQuarantine } = await svc()
    expect(await getPolicyQuarantine(id, null, fetch, mallory)).toMatchObject({ status: 403, data: { error: 'not_your_mailbox' } })
    for (const c of [alice, bob, agent('payroll'), operator, sessionAnon]) expect((await getPolicyQuarantine(id, null, fetch, c)).status).toBe(200)

    const ids = async (c: Caller) => ((await listPolicyQuarantine({ localOnly: true }, fetch, c)).data as any).items.map((i: any) => i.quarantine_id)
    expect(await ids(mallory)).toEqual([])
    expect(await ids(alice)).toEqual([id])
    expect(await ids(operator)).toEqual([id])
    expect(await ids(sessionAnon)).toEqual([id])
  })
})

// ── Both routers ─────────────────────────────────────────────────────────────

async function headless(method: string, url: string, caller?: Caller, body?: unknown) {
  const req: any = new PassThrough()
  req.method = method
  req.url = url
  req.headers = { 'content-type': 'application/json', ...(caller ? { [CALLER_HEADER]: encodeCaller(caller) } : {}) }
  const res: any = {
    headersSent: false, status: 0, out: '',
    writeHead(code: number) { this.status = code; this.headersSent = true },
    setHeader() {},
    end(chunk?: string) { this.out += chunk ?? '' },
  }
  const done = createHeadlessRouter().handle(req, res)
  req.end(body === undefined ? '' : JSON.stringify(body))
  await done
  return { status: res.status, json: JSON.parse(res.out || '{}') }
}

function next(method: string, url: string, caller?: Caller, body?: unknown) {
  return new NextRequest(`http://localhost:23000${url}`, {
    method,
    headers: { 'content-type': 'application/json', ...(caller ? { [CALLER_HEADER]: encodeCaller(caller) } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}

describe('both routers pass the caller to the quarantine routes', () => {
  it('server.mjs resolves the caller for every quarantine path', () => {
    for (const p of ['/api/v1/quarantine', '/api/v1/quarantine/qtn_1_abcdef', '/api/v1/quarantine/qtn_1_abcdef/approve', '/api/v1/quarantine/qtn_1_abcdef/reject', '/API/v1//quarantine/x/approve/']) {
      expect(isProtectedPath(p)).toBe(true)
    }
  })

  it('the sender approving its own entry: 403 in both; an approver rejecting: 200', async () => {
    const id = await holdOne()
    const params = { params: Promise.resolve({ id }) }
    expect((await nextApprove(next('POST', `/api/v1/quarantine/${id}/approve`, bob, { by: 'agent:alice' }), params)).status).toBe(403)
    expect((await headless('POST', `/api/v1/quarantine/${id}/approve`, bob, { by: 'agent:alice' })).status).toBe(403)
    expect((await nextGetEntry(next('GET', `/api/v1/quarantine/${id}`, mallory), params)).status).toBe(403)
    expect((await headless('GET', `/api/v1/quarantine/${id}`, mallory)).status).toBe(403)
    expect((await (await nextList(next('GET', '/api/v1/quarantine?localOnly=1', mallory))).json()).items).toEqual([])
    expect((await headless('GET', '/api/v1/quarantine?localOnly=1', mallory)).json.items).toEqual([])
    const ok = await headless('POST', `/api/v1/quarantine/${id}/reject`, alice, {})
    expect(ok).toMatchObject({ status: 200, json: { status: 'rejected' } })
  })

  it('with no caller header (a direct call) a route is anonymous in the configured mode', async () => {
    const id = await holdOne()
    // the dashboard approves as before
    const r = await nextReject(next('POST', `/api/v1/quarantine/${id}/reject`, undefined, { by: 'Carol' }), { params: Promise.resolve({ id }) })
    expect(r.status).toBe(200)
  })
})
