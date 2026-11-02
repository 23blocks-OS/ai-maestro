import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { DeviceKey } from '@/lib/person-signing'

const deliverMock = vi.fn(async () => ({ delivered: true, notified: false }))
const keyMock = vi.fn<(keyId: string, via?: string | null) => Promise<DeviceKey | null>>()
const homeMock = vi.fn(async (_id: string) => null as { id: string; url: string } | null)
const saveMock = vi.fn()
const pushMock = vi.fn(async (_m: unknown) => {})
const fetchMock = vi.fn(async (_url: string, _init?: unknown) => new Response(JSON.stringify({ id: 'remote-id' }), { status: 200 }))
const bob = vi.hoisted(() => ({ id: 'bob-uuid', name: 'bob', sessions: [] as unknown[], humanManager: undefined as string | undefined }))
const people = vi.hoisted(() => new Set<string>())

vi.mock('@/lib/message-delivery', () => ({ deliver: (...a: unknown[]) => deliverMock(...(a as [])) }))
vi.mock('@/lib/person-keys', () => ({ personKeyFor: (...a: [string, string?]) => keyMock(...a), personHostFor: (id: string) => homeMock(id) }))
vi.mock('@/lib/person-mailbox', () => ({ saveMessage: (...a: unknown[]) => saveMock(...a) }))
vi.mock('@/lib/push-expo', () => ({ pushMessage: (m: unknown) => pushMock(m) }))
vi.mock('@/lib/people-registry', async (orig) => ({ ...(await orig<Record<string, unknown>>()), getPerson: (id: string) => (people.has(id) ? { id, displayName: 'Ana' } : null) }))
vi.mock('@/lib/hosts-config-server.mjs', () => ({
  getSelfHostId: () => 'mac',
  getSelfHost: () => ({ id: 'mac', url: 'http://localhost:23000' }),
  // The hosts list includes this host itself, as hosts.json does
  getHostById: (id: string) => (id === 'mini' || id === 'mac' ? { id, name: id, url: `http://${id}:23000`, enabled: true } : undefined),
  isSelf: (id: string) => id === 'mac',
  getOrganization: () => 'acme',
}))
vi.mock('@/lib/agent-registry', async (orig) => {
  const real = await orig<Record<string, unknown>>()
  return { ...real, checkMeshAgentExists: async (n: string) => (n === 'carol' ? { exists: true, host: 'mini', agent: { id: 'carol-uuid' } } : { exists: false }), loadAgents: () => [bob], getAgent: (id: string) => (id === 'bob-uuid' ? bob : null), getAgentByName: (n: string) => (n === 'bob' ? bob : null) }
})

import { signingString } from '@/lib/amp-trust'
import { routeMessage } from '@/services/amp-service'

// A person's message is checked with their device key, by every host, whoever forwarded it
const PERSON = '3f2a9c1e-0000-4000-8000-000000000001'
const FROM = `p-${PERSON}@acme.aimaestro.local`
const TO = 'bob@acme.aimaestro.local'
const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519')
const RAW = publicKey.export({ format: 'der', type: 'spki' }).subarray(12).toString('base64')
const active: DeviceKey = { keyId: 'k_phone', personId: PERSON, publicKey: RAW, status: 'active' }

function send(opts: { nonce?: string; tamper?: boolean; sentAt?: string; via?: string } = {}) {
  const payload: any = { type: 'request', message: 'Deploy staging', context: { sent_at: opts.sentAt ?? new Date().toISOString(), nonce: opts.nonce ?? crypto.randomBytes(16).toString('hex') } }
  const signature = crypto.sign(null, Buffer.from(signingString({ from: FROM, to: TO, subject: 'deploy', priority: 'normal', in_reply_to: '', payload })), privateKey).toString('base64')
  if (opts.tamper) payload.message = 'Deploy production'
  const body: any = { from: FROM, to: 'bob', subject: 'deploy', payload, priority: 'normal', signature, key_id: 'k_phone', sender_kind: 'person', _forwarded: { original_from: FROM, original_to: TO, forwarded_by: 'mini' } }
  return routeMessage(body, null, opts.via ?? 'mini', null, signature, null)
}

// An agent on the mesh host 'mini' writes to a person, signing with its own key
const agentKeys = crypto.generateKeyPairSync('ed25519')
function agentToPerson(person: string, sign = true) {
  const to = `p-${person}@acme.aimaestro.local`
  const payload = { type: 'response', message: 'Staging is deployed', context: null }
  const signature = sign ? crypto.sign(null, Buffer.from(signingString({ from: 'lola@acme.aimaestro.local', to, subject: 'Re: deploy', priority: 'normal', in_reply_to: '', payload })), agentKeys.privateKey).toString('base64') : undefined
  const body: any = { from: 'lola@acme.aimaestro.local', to: `p-${person}`, subject: 'Re: deploy', payload, priority: 'normal', signature,
    sender_public_key: agentKeys.publicKey.export({ format: 'pem', type: 'spki' }).toString(), _forwarded: { original_from: 'lola@acme.aimaestro.local', original_to: to, forwarded_by: 'mini' } }
  return routeMessage(body, null, 'mini', null, signature ?? null, null)
}

describe('a person\'s message through routeMessage', () => {
  let ledger: string
  beforeEach(() => {
    ledger = fs.mkdtempSync(path.join(os.tmpdir(), 'person-route-'))
    process.env.AIMAESTRO_KNOWN_KEYS_DIR = ledger
    deliverMock.mockClear()
    keyMock.mockReset().mockResolvedValue(active)
    homeMock.mockReset().mockResolvedValue(null)
    saveMock.mockClear(); pushMock.mockClear(); people.clear()
    bob.humanManager = PERSON
    vi.stubGlobal('fetch', fetchMock); fetchMock.mockClear()
  })
  afterEach(() => {
    delete process.env.AIMAESTRO_KNOWN_KEYS_DIR
    fs.rmSync(ledger, { recursive: true, force: true })
    vi.unstubAllGlobals()
  })

  it('is delivered verified, with the device key, looked up via the forwarding host', async () => {
    const r = await send()
    expect(r.status).toBe(200)
    expect(keyMock).toHaveBeenCalledWith('k_phone', 'mini')
    const call = (deliverMock.mock.calls[0] as any[])[0]
    expect(call.senderPublicKeyHex).toBe(Buffer.from(RAW, 'base64').toString('hex'))
    expect(call.verification).toMatchObject({ state: 'verified', sender_kind: 'person', person_id: PERSON, operator: true })
  })

  it('carries operator authority only to agents the person manages', async () => {
    bob.humanManager = 'someone-else'
    expect((await send()).status).toBe(200)
    const call = (deliverMock.mock.calls[0] as any[])[0]
    expect(call.senderPublicKeyHex).toBeUndefined()
    expect(call.verification).toMatchObject({ state: 'verified', sender_kind: 'person', operator: false })
  })

  it('is refused when replayed, changed, stale, or under a key that is not active or not theirs', async () => {
    const nonce = crypto.randomBytes(16).toString('hex')
    expect((await send({ nonce })).status).toBe(200)
    expect((await send({ nonce })).data).toMatchObject({ error: 'person_replay' })
    expect((await send({ tamper: true })).data).toMatchObject({ error: 'person_bad_signature' })
    expect((await send({ sentAt: new Date(Date.now() - 10 * 60_000).toISOString() })).data).toMatchObject({ error: 'person_stale' })
    keyMock.mockResolvedValue({ ...active, status: 'pending' })
    expect((await send()).data).toMatchObject({ error: 'person_pending' })
    keyMock.mockResolvedValue({ ...active, personId: 'someone-else' })
    expect((await send()).data).toMatchObject({ error: 'person_wrong_person' })
    keyMock.mockResolvedValue(null)
    expect((await send()).data).toMatchObject({ error: 'person_no_key' })
    expect(deliverMock).toHaveBeenCalledTimes(1)
  })
})

describe('a message to a person', () => {
  const ANA = '3f2a9c1e-0000-4000-8000-0000000000aa'
  let ledger: string
  beforeEach(() => {
    ledger = fs.mkdtempSync(path.join(os.tmpdir(), 'person-route-'))
    process.env.AIMAESTRO_KNOWN_KEYS_DIR = ledger
    deliverMock.mockClear(); saveMock.mockClear(); pushMock.mockClear(); people.clear()
    homeMock.mockReset().mockResolvedValue(null)
    keyMock.mockReset().mockResolvedValue(active)
    vi.stubGlobal('fetch', fetchMock); fetchMock.mockClear()
  })
  afterEach(() => { delete process.env.AIMAESTRO_KNOWN_KEYS_DIR; fs.rmSync(ledger, { recursive: true, force: true }); vi.unstubAllGlobals() })

  it('lands in their mailbox here, verified, and pushes the message id to their phone', async () => {
    people.add(ANA)
    const r = await agentToPerson(ANA)
    expect(r.status).toBe(200)
    const [personId, m] = saveMock.mock.calls[0] as [string, any]
    expect(personId).toBe(ANA)
    expect(m).toMatchObject({ box: 'inbox', from: 'lola@acme.aimaestro.local', to: expect.stringMatching(`^p-${ANA}@`), sender_kind: 'agent', verified: true, status: 'unread' })
    expect(pushMock).toHaveBeenCalledWith(expect.objectContaining({ personId: ANA, messageId: m.id, agentAddress: 'lola@acme.aimaestro.local' }))
    expect(deliverMock).not.toHaveBeenCalled()
  })

  it('is kept unverified when the agent did not sign it', async () => {
    people.add(ANA)
    await agentToPerson(ANA, false)
    expect((saveMock.mock.calls[0] as any[])[1]).toMatchObject({ verified: false })
  })

  it('stops at a forwarded host that does not hold the person, so mail never loops', async () => {
    homeMock.mockResolvedValue({ id: 'mini', url: 'http://mini:23000' })
    expect((await agentToPerson(ANA)).status).toBe(404)
    expect(homeMock).not.toHaveBeenCalled()
    expect(saveMock).not.toHaveBeenCalled()
  })

  it('from this host\'s own person traffic, goes to the peer that holds the person', async () => {
    homeMock.mockResolvedValue({ id: 'mini', url: 'http://mini:23000' })
    const toAna = { from: FROM, to: `p-${ANA}@acme.aimaestro.local`, subject: 'hi', priority: 'normal' as const, payload: { type: 'request', message: 'hi', context: { sent_at: new Date().toISOString(), nonce: crypto.randomBytes(16).toString('hex') } } }
    const signature = crypto.sign(null, Buffer.from(signingString({ ...toAna, in_reply_to: '' })), privateKey).toString('base64')
    const r2 = await routeMessage({ ...toAna, signature, key_id: 'k_phone', sender_kind: 'person' } as any, null, 'mac', null, signature, null)
    expect(r2).toMatchObject({ status: 200, data: { method: 'mesh', remote_host: 'mini' } })
    const [url, init] = fetchMock.mock.calls[0] as [string, any]
    expect(url).toBe('http://mini:23000/api/v1/route')
    expect(JSON.parse(init.body)).toMatchObject({ to: `p-${ANA}`, key_id: 'k_phone', _forwarded: { original_to: `p-${ANA}@acme.aimaestro.local` } })
  })
})

it('a person on this host reaches an agent on another host', async () => {
  vi.stubGlobal('fetch', fetchMock); fetchMock.mockClear()
  keyMock.mockReset().mockResolvedValue(active)
  const fields = { from: FROM, to: 'carol@acme.aimaestro.local', subject: 'hi', priority: 'normal' as const, payload: { type: 'request', message: 'hi', context: { sent_at: new Date().toISOString(), nonce: crypto.randomBytes(16).toString('hex') } } }
  const signature = crypto.sign(null, Buffer.from(signingString({ ...fields, in_reply_to: '' })), privateKey).toString('base64')
  const r = await routeMessage({ ...fields, signature, key_id: 'k_phone', sender_kind: 'person' } as any, null, 'mac', null, signature, null)
  expect(r).toMatchObject({ status: 200, data: { method: 'mesh', remote_host: 'mini' } })
  expect(JSON.parse((fetchMock.mock.calls[0] as any[])[1].body)).toMatchObject({ to: 'carol', key_id: 'k_phone' })
  vi.unstubAllGlobals()
})
