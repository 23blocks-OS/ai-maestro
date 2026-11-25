/**
 * POST /api/v1/register cannot take over a name that already exists (services/amp-service.ts).
 *
 * Before: the same public key (which is public) got a fresh API key from anyone who could reach the port,
 * and a registry agent with no AMP registration was adopted by whoever registered its name first.
 * Now an existing name needs the agent itself: its own session, its API key, or a proof of possession of its key (AMP spec 03).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import crypto from 'crypto'
import { PassThrough } from 'stream'
import { NextRequest } from 'next/server'
import { CALLER_HEADER, encodeCaller, type Caller } from '@/lib/caller-identity'
import { makeRegisterProof } from '@/lib/amp-register-proof'

const m = vi.hoisted(() => ({
  agents: [] as any[],
  keys: [] as { key: string; agentId: string; status: string }[],
  revokeFingerprint: vi.fn(),
  rotateKnownKey: vi.fn(),
}))

vi.mock('@/lib/hosts-config-server.mjs', async (o) => ({
  ...(await o<any>()),
  getSelfHostId: () => 'test-host',
  getSelfHost: () => ({ id: 'test-host', name: 'Test Host', url: 'http://localhost:23000' }),
  isSelf: (id: string) => id === 'test-host',
  getOrganization: () => 'acme',
}))
vi.mock('@/lib/agent-registry', async (o) => ({
  ...(await o<any>()),
  getAMPRegisteredAgents: () => m.agents.filter((a) => a.metadata?.amp?.registeredVia),
  getAgentByName: (name: string) => m.agents.find((a) => a.name === name.toLowerCase()) || null,
  getAgent: (id: string) => m.agents.find((a) => a.id === id) || null,
  folderOwner: () => null,
  createAgent: (d: any) => { const a = { ...d, id: d.id || `id-${d.name}` }; m.agents.push(a); return a },
  markAgentAsAMPRegistered: (id: string, amp: any) => {
    const a = m.agents.find((x) => x.id === id)
    a.metadata = { ...a.metadata, amp: { ...a.metadata?.amp, ...amp } }
    return a
  },
}))
vi.mock('@/lib/amp-auth', async (o) => ({
  ...(await o<any>()),
  createApiKey: (agentId: string) => { const key = `amp_test_sk_${crypto.randomBytes(8).toString('hex')}`; m.keys.push({ key, agentId, status: 'active' }); return key },
  hashApiKey: (k: string) => `hash-${k}`,
  revokeAllKeysForAgent: (agentId: string) => {
    let n = 0
    for (const k of m.keys) if (k.agentId === agentId && k.status === 'active') { k.status = 'revoked'; n++ }
    return n
  },
}))
vi.mock('@/lib/amp-keys', async (o) => ({ ...(await o<any>()), saveKeyPair: vi.fn() }))
vi.mock('@/lib/amp-inbox-writer', async (o) => ({ ...(await o<any>()), initAgentAMPHome: vi.fn() }))
vi.mock('@/lib/amp-known-keys', async (o) => ({ ...(await o<any>()), rotateKnownKey: m.rotateKnownKey }))
vi.mock('@/lib/amp-revocation', async (o) => ({ ...(await o<any>()), revokeFingerprint: m.revokeFingerprint }))
vi.mock('@/services/amp-registrations-service', async (o) => ({ ...(await o<any>()), isApprovalRequired: () => false }))

import { registerAgent } from '@/services/amp-service'
import { createHeadlessRouter } from '@/services/headless-router'
import { POST as nextRegister } from '@/app/api/v1/register/route'

function keyPair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519')
  const raw = (publicKey.export({ type: 'spki', format: 'der' }) as Buffer).subarray(12)
  return {
    privateKey,
    pem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    fingerprint: `SHA256:${crypto.createHash('sha256').update(raw).digest('base64')}`,
  }
}

const aliceKey = keyPair()
const malloryKey = keyPair()

const anon = (mode: Caller['mode'] = 'session'): Caller => ({ kind: 'anonymous', mode, local: true })
const aliceSession: Caller = { kind: 'agent', agentId: 'id-alice', name: 'alice', via: 'session', mode: 'session', local: true }
const aliceByKey: Caller = { kind: 'agent', agentId: 'id-alice', name: 'alice', via: 'key', mode: 'session', local: false }
const bobSession: Caller = { kind: 'agent', agentId: 'id-bob', name: 'bob', via: 'session', mode: 'session', local: true }
const host: Caller = { kind: 'operator', via: 'host', mode: 'session', local: true }

const body = (pem: string, extra: Record<string, unknown> = {}) => ({ tenant: 'acme', name: 'alice', public_key: pem, key_algorithm: 'Ed25519' as const, ...extra })

const subject = { provider: 'acme.aimaestro.local', tenant: 'acme', name: 'alice', fingerprint: aliceKey.fingerprint }
// Ed25519 is deterministic: each proof gets its own second, or a later test would send an already used one
let tick = 0
const prove = (k: crypto.KeyObject, over: Record<string, string> = {}, ts = String(Math.floor(Date.now() / 1000) - tick++)) => makeRegisterProof(k, { ...subject, ...over }, ts)

/** alice: registered over AMP with aliceKey, one API key */
function aliceRegistered() {
  m.agents.push({ id: 'id-alice', name: 'alice', metadata: { amp: { registeredVia: 'amp-v1-api', fingerprint: aliceKey.fingerprint, address: 'alice@acme.aimaestro.local' } } })
  m.keys.push({ key: 'amp_test_sk_old', agentId: 'id-alice', status: 'active' })
}

/** alice: in the registry (made by the dashboard), no AMP registration yet */
function aliceUnregistered() {
  m.agents.push({ id: 'id-alice', name: 'alice', metadata: {} })
}

beforeEach(() => {
  m.agents.length = 0
  m.keys.length = 0
  vi.clearAllMocks()
})

describe('a registered name: the same key needs proof', () => {
  it('refuses a fresh API key for the same public key from an anonymous caller, in every mode', async () => {
    aliceRegistered()
    for (const mode of ['session', 'off'] as const) {
      const r = await registerAgent(body(aliceKey.pem), null, anon(mode))
      expect(r.status).toBe(401)
      const d = r.data as any
      expect(d.error).toBe('proof_required')
      expect(d.api_key).toBeUndefined()
      expect(d.details).toEqual(subject)
    }
    expect(m.keys).toHaveLength(1)
  })

  it('re-issues with a proof signed by the registered key, and refuses the same proof again', async () => {
    aliceRegistered()
    const proof = prove(aliceKey.privateKey)
    const ok = await registerAgent(body(aliceKey.pem, { proof }), null, anon())
    expect(ok.status).toBe(201)
    expect((ok.data as any).api_key).toMatch(/^amp_test_sk_/)
    expect((ok.data as any).agent_id).toBe('id-alice')

    const replay = await registerAgent(body(aliceKey.pem, { proof }), null, anon())
    expect(replay.status).toBe(401)
    expect((replay.data as any).error).toBe('invalid_proof')
  })

  it('refuses a proof signed by another key, made for another name, or expired', async () => {
    aliceRegistered()
    m.agents.push({ id: 'id-bob', name: 'bob', metadata: { amp: { registeredVia: 'amp-v1-api', fingerprint: malloryKey.fingerprint } } })
    const byMallory = prove(malloryKey.privateKey)
    expect((await registerAgent(body(aliceKey.pem, { proof: byMallory }), null, anon())).data).toMatchObject({ error: 'invalid_proof' })

    // A proof alice's key made for registering bob is no proof for alice
    const forBob = prove(aliceKey.privateKey, { name: 'bob' })
    expect((await registerAgent(body(aliceKey.pem, { proof: forBob }), null, anon())).data).toMatchObject({ error: 'invalid_proof' })

    const old = prove(aliceKey.privateKey, {}, String(Math.floor(Date.now() / 1000) - 600))
    const r = await registerAgent(body(aliceKey.pem, { proof: old }), null, anon())
    expect(r.data).toMatchObject({ error: 'invalid_proof' })
    expect((r.data as any).message).toMatch(/5 minutes/)
    expect(m.keys).toHaveLength(1)
  })

  it('re-issues to the agent itself, from its session or with its own API key, with no proof', async () => {
    aliceRegistered()
    expect((await registerAgent(body(aliceKey.pem), null, aliceSession)).status).toBe(201)
    expect((await registerAgent(body(aliceKey.pem), null, aliceByKey)).status).toBe(201)
  })

  it("refuses another agent's session without proof", async () => {
    aliceRegistered()
    expect((await registerAgent(body(aliceKey.pem), null, bobSession)).data).toMatchObject({ error: 'proof_required' })
  })

  it('re-issues to this server itself (via host); old API keys stay valid without reset', async () => {
    aliceRegistered()
    expect((await registerAgent(body(aliceKey.pem), null, host)).status).toBe(201)
    expect(m.keys.filter((k) => k.status === 'active')).toHaveLength(2)
  })

  it('this host\'s own in-process call (no caller) works as before', async () => {
    aliceRegistered()
    expect((await registerAgent(body(aliceKey.pem), null)).status).toBe(201)
  })
})

describe('a registered name: a different key', () => {
  it('stays name_taken for everyone without reset, the agent itself included', async () => {
    aliceRegistered()
    for (const c of [anon(), aliceSession, host]) {
      const r = await registerAgent(body(malloryKey.pem), null, c)
      expect(r.status).toBe(409)
      expect((r.data as any).error).toBe('name_taken')
    }
  })

  it('reset: refused over the API, from any caller (no administrator credential)', async () => {
    aliceRegistered()
    for (const c of [anon(), anon('off'), aliceSession, bobSession]) {
      const r = await registerAgent(body(malloryKey.pem, { reset: true }), null, c)
      expect(r.status).toBe(403)
      expect((r.data as any).error).toBe('forbidden')
    }
    expect(m.keys.filter((k) => k.status === 'active')).toHaveLength(1)
  })

  it('a reset by this server itself replaces the key, revokes the old API keys and the old key', async () => {
    aliceRegistered()
    const r = await registerAgent(body(malloryKey.pem, { reset: true }), null)
    expect(r.status).toBe(201)
    expect((r.data as any).fingerprint).toBe(malloryKey.fingerprint)
    expect(m.keys.find((k) => k.key === 'amp_test_sk_old')!.status).toBe('revoked')
    expect(m.keys.filter((k) => k.status === 'active')).toHaveLength(1)
    expect(m.agents[0].metadata.amp.fingerprint).toBe(malloryKey.fingerprint)
    expect(m.revokeFingerprint).toHaveBeenCalledWith(aliceKey.fingerprint, 'alice@acme.aimaestro.local', 'admin_action', malloryKey.fingerprint, expect.any(String))
    expect(m.rotateKnownKey).toHaveBeenCalledWith(expect.stringMatching(/^alice@/), malloryKey.fingerprint, expect.any(String))
  })
})

describe('a registry agent without AMP registration (adoption)', () => {
  it('is adopted by its own session', async () => {
    aliceUnregistered()
    const r = await registerAgent(body(aliceKey.pem), null, aliceSession)
    expect(r.status).toBe(201)
    expect((r.data as any).agent_id).toBe('id-alice')
  })

  it('is adopted by this server itself', async () => {
    aliceUnregistered()
    expect((await registerAgent(body(aliceKey.pem), null, host)).status).toBe(201)
  })

  it('is not adopted by a stranger: anonymous, another session, or alice holding only an API key', async () => {
    aliceUnregistered()
    for (const c of [anon(), anon('off'), bobSession, aliceByKey]) {
      const r = await registerAgent(body(malloryKey.pem), null, c)
      expect(r.status).toBe(409)
      expect((r.data as any).error).toBe('name_taken')
      expect((r.data as any).message).toMatch(/only its own session/)
    }
    expect(m.agents[0].metadata.amp).toBeUndefined()
    expect(m.keys).toHaveLength(0)
  })
})

describe('a new name', () => {
  it('registers as before, anonymous or with caller binding off', async () => {
    for (const [i, c] of [anon(), anon('off')].entries()) {
      const k = keyPair()
      const r = await registerAgent({ ...body(k.pem), name: `carol-${i}` }, null, c)
      expect(r.status).toBe(201)
      expect((r.data as any).api_key).toBeTruthy()
    }
  })
})

describe('both routers pass the caller', () => {
  async function headless(caller: Caller | undefined, payload: unknown) {
    const req: any = new PassThrough()
    req.method = 'POST'
    req.url = '/api/v1/register'
    req.headers = { 'content-type': 'application/json', ...(caller ? { [CALLER_HEADER]: encodeCaller(caller) } : {}) }
    const res: any = {
      headersSent: false, status: 0, out: '',
      writeHead(code: number) { this.status = code; this.headersSent = true },
      setHeader() {},
      end(chunk?: string) { this.out += chunk ?? '' },
    }
    const done = createHeadlessRouter().handle(req, res)
    req.end(JSON.stringify(payload))
    await done
    return { status: res.status, json: JSON.parse(res.out || '{}') }
  }
  const next = (caller: Caller | undefined, payload: unknown) => nextRegister(new NextRequest('http://localhost:23000/api/v1/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(caller ? { [CALLER_HEADER]: encodeCaller(caller) } : {}) },
    body: JSON.stringify(payload),
  }))

  it('no caller header (anonymous): proof required on both', async () => {
    aliceRegistered()
    expect((await headless(undefined, body(aliceKey.pem))).json.error).toBe('proof_required')
    const r = await next(undefined, body(aliceKey.pem))
    expect(r.status).toBe(401)
    expect((await r.json()).error).toBe('proof_required')
  })

  it("the agent's own session: re-issued on both", async () => {
    aliceRegistered()
    expect((await headless(aliceSession, body(aliceKey.pem))).status).toBe(201)
    expect((await next(aliceSession, body(aliceKey.pem))).status).toBe(201)
  })

  it('a proof: accepted on both', async () => {
    aliceRegistered()
    expect((await headless(undefined, body(aliceKey.pem, { proof: prove(aliceKey.privateKey) }))).status).toBe(201)
    expect((await next(undefined, body(aliceKey.pem, { proof: prove(aliceKey.privateKey) }))).status).toBe(201)
  })
})
