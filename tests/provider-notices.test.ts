/**
 * Provider notices and approval by signed message (AMP 07 "Policy Holds" and "Provider Notices", 03 "Reserved names",
 * 13.6 rule 5; docs/SPEC-POLICY-RULES.md section 17). Through routeMessage, with a temporary HOME for the rules, the
 * quarantine store and the provider key; mailboxes, delivery and peers are mocked.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { DeviceKey } from '@/lib/person-signing'

const deliverMock = vi.fn(async () => ({ delivered: true, notified: false }))
const saved = vi.hoisted(() => [] as { personId: string; m: any }[])
const keys = vi.hoisted(() => new Map<string, DeviceKey>())
const people = vi.hoisted(() => new Set<string>())
const bob = vi.hoisted(() => ({ id: 'bob-uuid', name: 'bob', sessions: [] as unknown[] }))
const host = vi.hoisted(() => ({
  getSelfHostId: () => 'mac',
  getSelfHost: () => ({ id: 'mac', url: 'http://localhost:23000' }),
  getHostById: (id: string) => (id === 'mini' || id === 'mac' ? { id, name: id, url: `http://${id}:23000`, enabled: true } : undefined),
  getPeerHosts: () => [{ id: 'mini', name: 'mini', url: 'http://mini:23000', enabled: true }],
  isSelf: (id: string) => id === 'mac',
  getOrganization: () => 'acme',
}))

vi.mock('@/lib/message-delivery', () => ({ deliver: (...a: unknown[]) => deliverMock(...(a as [])) }))
vi.mock('@/lib/person-keys', () => ({ personKeyFor: async (id: string) => keys.get(id) || null, personHostFor: async () => null }))
vi.mock('@/lib/person-mailbox', () => ({ saveMessage: (personId: string, m: any) => saved.push({ personId, m }) }))
const push = vi.hoisted(() => ({ message: vi.fn(async () => {}), approval: vi.fn(async (_a: any) => 1) }))
vi.mock('@/lib/push-expo', () => ({ pushMessage: push.message, pushApproval: push.approval }))
vi.mock('@/lib/people-registry', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getPerson: (id: string) => (people.has(id) ? { id, displayName: id.slice(-4) } : null),
  loadPeople: () => [],
}))
vi.mock('@/lib/hosts-config-server.mjs', () => host)
vi.mock('@/lib/hosts-config', async (orig) => ({ ...(await orig<Record<string, unknown>>()), ...host }))
vi.mock('@/lib/agent-registry', async (orig) => {
  const real = await orig<Record<string, unknown>>()
  return {
    ...real,
    checkMeshAgentExists: async (n: string) => (n === 'carol' ? { exists: true, host: 'mini', agent: { id: 'carol-uuid' } } : { exists: false }),
    loadAgents: () => [bob], getAgent: (id: string) => (id === 'bob-uuid' ? bob : null), getAgentByName: (n: string) => (n === 'bob' ? bob : null),
    getAgentByNameAnyHost: (n: string) => (n === 'bob' ? bob : null),
  }
})

import { signingString } from '@/lib/amp-trust'
import { publicHexFromPem } from '@/lib/amp-federation-auth'

const DOMAIN = 'acme.aimaestro.local'
const PROVIDER = `_provider@${DOMAIN}`
const ANA = '3f2a9c1e-0000-4000-8000-00000000000a'
const BEN = '3f2a9c1e-0000-4000-8000-00000000000b'
const addr = (p: string) => `p-${p}@${DOMAIN}`
const devices: Record<string, crypto.KeyObject> = {}
for (const p of [ANA, BEN]) {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519')
  devices[p] = privateKey
  keys.set(`k_${p}`, { keyId: `k_${p}`, personId: p, publicKey: publicKey.export({ format: 'der', type: 'spki' }).subarray(12).toString('base64'), status: 'active' })
}
const carol = crypto.generateKeyPairSync('ed25519')
const sign = (k: crypto.KeyObject, f: { from: string; to: string; subject: string; in_reply_to?: string; payload: unknown }) =>
  crypto.sign(null, Buffer.from(signingString({ ...f, priority: 'normal' })), k).toString('base64')

// fetch to the peer 'mini': its provider info (a key of its own) and its route
const miniKey = crypto.generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'pem' }).toString()
const routed: any[] = []
const fetchMock = vi.fn(async (url: string, init?: any) => {
  if (url.endsWith('/api/v1/info')) return new Response(JSON.stringify({ provider: DOMAIN, public_key: miniKey }), { status: 200 })
  if (url.endsWith('/api/v1/route')) {
    const body = JSON.parse(init.body)
    routed.push(body)
    return new Response(JSON.stringify(body.to === '_provider' ? { error: 'not_found', message: 'no' } : { id: 'remote-id', status: 'delivered' }), { status: body.to === '_provider' ? 404 : 200 })
  }
  return new Response('{}', { status: 404 })
})

const RULE = { id: 'bob-asks', effect: 'ask', from: '*', to: 'agent:bob', approvers: [`person:${ANA}`, `person:${BEN}`], note: 'Bob needs approval' }

describe('provider notices and approval by signed message', () => {
  let home: string
  const quiet: ReturnType<typeof vi.spyOn>[] = []

  beforeAll(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'provider-notices-'))
    vi.stubEnv('HOME', home)
    vi.stubEnv('AIMAESTRO_KNOWN_KEYS_DIR', path.join(home, 'known'))
    fs.mkdirSync(path.join(home, '.aimaestro'), { recursive: true })
    vi.stubGlobal('fetch', fetchMock)
    people.add(ANA); people.add(BEN)
    for (const k of ['log', 'warn'] as const) quiet.push(vi.spyOn(console, k).mockImplementation(() => {}))
  })
  afterAll(() => {
    quiet.forEach(s => s.mockRestore())
    vi.unstubAllEnvs(); vi.unstubAllGlobals()
    fs.rmSync(home, { recursive: true, force: true })
  })
  beforeEach(async () => {
    deliverMock.mockClear(); fetchMock.mockClear(); saved.length = 0; routed.length = 0
    push.message.mockClear(); push.approval.mockClear(); push.approval.mockImplementation(async () => 1)
    fs.rmSync(path.join(home, '.aimaestro', 'policy'), { recursive: true, force: true })
    fs.writeFileSync(path.join(home, '.aimaestro', 'policy.json'), JSON.stringify({ version: 2, rules: [RULE] }))
    ;(await import('@/lib/provider-key')).clearProviderKeyCache()
  })

  const route = async () => (await import('@/services/amp-service')).routeMessage

  /** carol on the peer 'mini' writes to bob here; bob's rule holds it. Returns the entry, with approval requests sent. */
  async function holdFromCarol() {
    const payload = { type: 'request', message: 'Pay the invoice' }
    const signature = sign(carol.privateKey, { from: `carol@${DOMAIN}`, to: `bob@${DOMAIN}`, subject: 'Invoice', payload })
    const r = await (await route())({
      from: `carol@${DOMAIN}`, to: 'bob', subject: 'Invoice', priority: 'normal', payload, signature,
      sender_public_key: carol.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
      _forwarded: { original_from: `carol@${DOMAIN}`, original_to: `bob@${DOMAIN}`, forwarded_by: 'mini' },
    } as any, null, 'mini', null, signature, null)
    expect(r.status).toBe(202)
    return sendRequests((r.data as any).quarantine.quarantine_id, (r.data as any).id)
  }

  async function sendRequests(qid: string, heldId?: string) {
    const { listQuarantine } = await import('@/lib/policy-approvals')
    const { sendApprovalRequests } = await import('@/services/provider-notices')
    await sendApprovalRequests(listQuarantine().find(e => e.quarantine_id === qid)!)
    const entry = listQuarantine().find(e => e.quarantine_id === qid)!
    if (heldId) expect(entry.held?.message_id).toBe(heldId)
    return { entry, request: (p: string) => entry.requests!.find(q => q.to === addr(p))!.id }
  }

  /** A person answers from a device (13.3), as POST /api/people/:id/messages does */
  async function answer(p: string, o: { in_reply_to?: string; context?: Record<string, unknown>; message?: string }) {
    const payload = { type: 'response', message: o.message ?? 'ok', context: { ...o.context, sent_at: new Date().toISOString(), nonce: crypto.randomBytes(16).toString('hex') } }
    const signature = sign(devices[p], { from: addr(p), to: PROVIDER, subject: 'Re: approval', in_reply_to: o.in_reply_to, payload })
    return (await route())({ from: addr(p), to: PROVIDER, subject: 'Re: approval', priority: 'normal', ...(o.in_reply_to ? { in_reply_to: o.in_reply_to } : {}), payload, signature, key_id: `k_${p}`, sender_kind: 'person' } as any, null, 'mac', null, signature, null)
  }

  it('publishes the provider key and quarantine:policy; a notice verifies with it and a tampered one does not', async () => {
    const { getProviderInfo } = await import('@/services/amp-service')
    const { getWellKnownDocument } = await import('@/services/amp-discovery-service')
    const info = getProviderInfo().data as any
    expect(info.capabilities).toContain('quarantine:policy')
    expect(info.public_key).toMatch(/BEGIN PUBLIC KEY/)
    expect(getWellKnownDocument().data).toMatchObject({ public_key: info.public_key, fingerprint: info.fingerprint, capabilities: expect.arrayContaining(['quarantine:policy']) })
    expect(fs.statSync(path.join(home, '.aimaestro', 'amp', 'provider-key.pem')).mode & 0o777).toBe(0o600)

    const { buildProviderNotice } = await import('@/services/provider-notices')
    const { checkProviderNotice } = await import('@/lib/provider-key')
    const n = buildProviderNotice({ to: addr(ANA), subject: 'Approval needed', message: 'x', context: { amp_notice: 'approval_request', quarantine_id: 'qtn_1_abcdef' } })!
    expect(n).toMatchObject({ from: PROVIDER, payload: { type: 'system', context: { provider: 'aimaestro.local', amp_notice: 'approval_request' } } })
    const key = publicHexFromPem(info.public_key)
    const fields = (x: typeof n) => ({ from: x.from!, to: x.to, subject: x.subject, priority: 'normal', in_reply_to: '', payload: x.payload })
    expect(checkProviderNotice(fields(n), n.signature, key)).toBe('verified')
    const tampered = { ...n, payload: { ...n.payload, context: { ...n.payload.context, quarantine_id: 'qtn_2_abcdef' } } }
    expect(checkProviderNotice(fields(tampered), n.signature, key)).toBe('bad')
    // Signed by us but claiming another provider: from must end with "." + context.provider
    const other = buildProviderNotice({ to: addr(ANA), subject: 's', message: 'x', context: { provider: 'example.com' } })!
    expect(checkProviderNotice(fields(other), other.signature, key)).toBe('bad')

    // At the route: our own notice is delivered verified; tampered, it is refused
    const ok = await (await route())(n as any, null, 'mac', null, n.signature!, null)
    expect(ok.status).toBe(200)
    expect(saved[0]).toMatchObject({ personId: ANA, m: { from: PROVIDER, verified: true, payload: { context: { amp_notice: 'approval_request' } } } })
    expect((await (await route())(tampered as any, null, 'mac', null, n.signature!, null)).status).toBe(403)
    // The same notice forwarded by the peer 'mini' is checked with mini's published key, not ours and not one sent along
    const viaMini = await (await route())({ ...n, to: `p-${ANA}`, sender_public_key: info.public_key, _forwarded: { original_to: addr(ANA) } } as any, null, 'mini', null, n.signature!, null)
    expect(viaMini.status).toBe(403)
    expect(fetchMock).toHaveBeenCalledWith('http://mini:23000/api/v1/info', expect.anything())
  })

  it('a reviewer whose devices take no approval push gets the new-message push instead', async () => {
    push.approval.mockImplementation(async () => 0)
    await holdFromCarol()
    await new Promise(r => setTimeout(r, 0))
    expect(push.message.mock.calls.map((c: any[]) => c[0].personId)).toEqual([ANA, BEN])
  })

  it('_provider is reserved: registration is refused with name_taken', async () => {
    const { registerAgent } = await import('@/services/amp-service')
    const pem = crypto.generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'pem' }).toString()
    expect(await registerAgent({ tenant: 'acme', name: '_Provider', public_key: pem, key_algorithm: 'Ed25519' } as any, null)).toMatchObject({ status: 409, data: { error: 'name_taken' } })
    const { createAgent } = await import('@/lib/agent-registry')
    expect(() => createAgent({ name: '_provider' } as any)).toThrow('reserved')
  })

  it('a hold sends each reviewer a signed approval request; a signed reply approves exactly once, and the sender gets the outcome', async () => {
    const { entry, request } = await holdFromCarol()
    expect(entry.reviewers).toEqual([addr(ANA), addr(BEN)])
    expect(saved.map(s => s.personId)).toEqual([ANA, BEN])
    expect(saved[0].m).toMatchObject({
      from: PROVIDER, verified: true,
      payload: { type: 'system', context: { provider: 'aimaestro.local', amp_notice: 'approval_request', quarantine_id: entry.quarantine_id, rules_triggered: ['bob-asks'], held: { from: `carol@${DOMAIN}`, to: `bob@${DOMAIN}`, subject: 'Invoice' }, expires_at: entry.expires_at } },
    })
    expect(saved[0].m.id).toBe(request(ANA))
    expect(deliverMock).not.toHaveBeenCalled()
    // One push per reviewer: the approval push, sent where the mailbox is; no new-message push on top
    await new Promise(r => setTimeout(r, 0))
    expect(push.approval.mock.calls.map(c => c[0])).toEqual([
      { personIds: [ANA], quarantineId: entry.quarantine_id, what: `message from carol@${DOMAIN} to bob@${DOMAIN}` },
      { personIds: [BEN], quarantineId: entry.quarantine_id, what: `message from carol@${DOMAIN} to bob@${DOMAIN}` },
    ])
    expect(push.message).not.toHaveBeenCalled()

    const yes = await answer(ANA, { in_reply_to: request(ANA), context: { decision: 'approve', quarantine_id: entry.quarantine_id } })
    expect(yes).toMatchObject({ status: 200, data: { status: 'delivered' } })
    expect(deliverMock).toHaveBeenCalledTimes(1)
    const { getPolicyQuarantine } = await import('@/services/policy-service')
    expect((await getPolicyQuarantine(entry.quarantine_id)).data).toMatchObject({
      status: 'approved', decided: { by: addr(ANA), via: 'signed-message', answer: { from: addr(ANA), in_reply_to: request(ANA), signature: expect.any(String), key_id: `k_${ANA}` } },
    })

    // The outcome went to carol on mini: a provider notice in reply to the held message, verifiable with our key
    const out = routed.find(b => b.payload?.context?.amp_notice === 'quarantine_outcome')
    expect(out).toMatchObject({ from: PROVIDER, in_reply_to: entry.held!.message_id, payload: { context: { quarantine_id: entry.quarantine_id, status: 'approved', decided_by: addr(ANA) } } })
    const { checkProviderNotice } = await import('@/lib/provider-key')
    const { getProviderInfo } = await import('@/services/amp-service')
    expect(checkProviderNotice({ from: out.from, to: out._forwarded.original_to, subject: out.subject, priority: 'normal', in_reply_to: out.in_reply_to, payload: out.payload }, out.signature, publicHexFromPem((getProviderInfo().data as any).public_key))).toBe('verified')

    // A second answer, from either reviewer, changes nothing
    expect(await answer(ANA, { in_reply_to: request(ANA), context: { decision: 'approve', quarantine_id: entry.quarantine_id } })).toMatchObject({ status: 409, data: { error: 'quarantine_decided' } })
    expect((await answer(BEN, { in_reply_to: request(BEN), context: { decision: 'reject', quarantine_id: entry.quarantine_id } })).status).toBe(409)
    expect(deliverMock).toHaveBeenCalledTimes(1)
  })

  it('refuses plain text, a wrong in_reply_to, another reviewer\'s request, and the sender deciding on its own message', async () => {
    const a = await holdFromCarol(), b = await holdFromCarol()
    const ctx = { decision: 'approve', quarantine_id: a.entry.quarantine_id }
    expect(await answer(ANA, { in_reply_to: a.request(ANA), message: 'ok', context: {} })).toMatchObject({ status: 400, data: { error: 'invalid_field' } })
    expect(await answer(ANA, { context: ctx })).toMatchObject({ status: 400, data: { error: 'missing_field' } })
    // Not an approval request here, nor on the peer (asked, answered 404)
    expect(await answer(ANA, { in_reply_to: 'msg_1_unknown', context: ctx })).toMatchObject({ status: 404 })
    expect(routed.some(r => r.to === '_provider' && r.key_id === `k_${ANA}`)).toBe(true)
    // The request of another entry, and another reviewer's request
    expect(await answer(ANA, { in_reply_to: b.request(ANA), context: ctx })).toMatchObject({ status: 403, data: { error: 'forbidden' } })
    expect(await answer(BEN, { in_reply_to: a.request(ANA), context: ctx })).toMatchObject({ status: 403, data: { error: 'forbidden' } })
    expect(deliverMock).not.toHaveBeenCalled()

    // Ana writes to bob herself; she is a listed reviewer, but never decides on her own message
    const payload = { type: 'request', message: 'Me again', context: { sent_at: new Date().toISOString(), nonce: crypto.randomBytes(16).toString('hex') } }
    const signature = sign(devices[ANA], { from: addr(ANA), to: `bob@${DOMAIN}`, subject: 'Mine', payload })
    const held = await (await route())({ from: addr(ANA), to: `bob@${DOMAIN}`, subject: 'Mine', priority: 'normal', payload, signature, key_id: `k_${ANA}`, sender_kind: 'person' } as any, null, 'mac', null, signature, null)
    expect(held.status).toBe(202)
    const own = await sendRequests((held.data as any).quarantine.quarantine_id)
    expect(own.entry.sender).toBe(addr(ANA))
    const r = await answer(ANA, { in_reply_to: own.request(ANA), context: { decision: 'approve', quarantine_id: own.entry.quarantine_id } })
    expect(r).toMatchObject({ status: 403, data: { error: 'forbidden', message: expect.stringContaining('Whoever sent it') } })
    expect(deliverMock).not.toHaveBeenCalled()
  })

  it('proof "signed" accepts only the signed reply', async () => {
    fs.writeFileSync(path.join(home, '.aimaestro', 'policy.json'), JSON.stringify({ version: 2, rules: [{ ...RULE, proof: 'signed' }] }))
    const { entry, request } = await holdFromCarol()
    const { decidePolicyQuarantine } = await import('@/services/policy-service')
    expect(await decidePolicyQuarantine(entry.quarantine_id, 'approve', { by: 'Ana' })).toMatchObject({ status: 403, data: { error: 'forbidden' } })
    expect((await answer(BEN, { in_reply_to: request(BEN), context: { decision: 'approve', quarantine_id: entry.quarantine_id } })).status).toBe(200)
    expect(deliverMock).toHaveBeenCalledTimes(1)
  })

  it('an expired entry sends the sender a quarantine_outcome notice "expired"', async () => {
    const { entry } = await holdFromCarol()
    const { sweepPolicyQuarantine } = await import('@/services/policy-service')
    vi.useFakeTimers({ now: Date.now() + 31 * 60_000, toFake: ['Date'] })
    try { expect(await sweepPolicyQuarantine()).toBe(1) } finally { vi.useRealTimers() }
    expect(routed.find(b => b.payload?.context?.amp_notice === 'quarantine_outcome')).toMatchObject({
      from: PROVIDER, in_reply_to: entry.held!.message_id, payload: { type: 'system', context: { quarantine_id: entry.quarantine_id, status: 'expired' } },
    })
    expect(deliverMock).not.toHaveBeenCalled()
  })
})
