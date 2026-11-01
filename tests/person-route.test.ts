import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { DeviceKey } from '@/lib/person-signing'

const deliverMock = vi.fn(async () => ({ delivered: true, notified: false }))
const keyMock = vi.fn<(keyId: string, via?: string | null) => Promise<DeviceKey | null>>()

vi.mock('@/lib/message-delivery', () => ({ deliver: (...a: unknown[]) => deliverMock(...(a as [])) }))
vi.mock('@/lib/person-keys', () => ({ personKeyFor: (...a: [string, string?]) => keyMock(...a) }))
vi.mock('@/lib/hosts-config-server.mjs', () => ({
  getSelfHostId: () => 'mac',
  getSelfHost: () => ({ id: 'mac', url: 'http://localhost:23000' }),
  getHostById: (id: string) => (id === 'mini' ? { id: 'mini', name: 'mini', url: 'http://mini:23000', enabled: true } : undefined),
  isSelf: (id: string) => id === 'mac',
  getOrganization: () => 'acme',
}))
vi.mock('@/lib/agent-registry', async (orig) => {
  const real = await orig<Record<string, unknown>>()
  const bob = { id: 'bob-uuid', name: 'bob', sessions: [] }
  return { ...real, loadAgents: () => [bob], getAgent: (id: string) => (id === 'bob-uuid' ? bob : null), getAgentByName: (n: string) => (n === 'bob' ? bob : null) }
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

function send(opts: { nonce?: string; tamper?: boolean; sentAt?: string } = {}) {
  const payload: any = { type: 'request', message: 'Deploy staging', context: { sent_at: opts.sentAt ?? new Date().toISOString(), nonce: opts.nonce ?? crypto.randomBytes(16).toString('hex') } }
  const signature = crypto.sign(null, Buffer.from(signingString({ from: FROM, to: TO, subject: 'deploy', priority: 'normal', in_reply_to: '', payload })), privateKey).toString('base64')
  if (opts.tamper) payload.message = 'Deploy production'
  const body: any = { from: FROM, to: 'bob', subject: 'deploy', payload, priority: 'normal', signature, key_id: 'k_phone', sender_kind: 'person', _forwarded: { original_from: FROM, original_to: TO, forwarded_by: 'mini' } }
  return routeMessage(body, null, 'mini', null, signature, null)
}

describe('a person\'s message through routeMessage', () => {
  let ledger: string
  beforeEach(() => {
    ledger = fs.mkdtempSync(path.join(os.tmpdir(), 'person-route-'))
    process.env.AIMAESTRO_KNOWN_KEYS_DIR = ledger
    deliverMock.mockClear()
    keyMock.mockReset().mockResolvedValue(active)
  })
  afterEach(() => {
    delete process.env.AIMAESTRO_KNOWN_KEYS_DIR
    fs.rmSync(ledger, { recursive: true, force: true })
  })

  it('is delivered verified, with the device key, looked up via the forwarding host', async () => {
    const r = await send()
    expect(r.status).toBe(200)
    expect(keyMock).toHaveBeenCalledWith('k_phone', 'mini')
    const call = (deliverMock.mock.calls[0] as any[])[0]
    expect(call.senderPublicKeyHex).toBe(Buffer.from(RAW, 'base64').toString('hex'))
    expect(call.verification).toMatchObject({ state: 'verified' })
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
