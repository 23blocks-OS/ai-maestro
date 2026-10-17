import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const deliverMock = vi.fn(async () => ({ delivered: true, notified: false }))

vi.mock('@/lib/message-delivery', () => ({ deliver: (...a: unknown[]) => deliverMock(...(a as [])) }))
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
  return {
    ...real,
    loadAgents: () => [bob],
    getAgent: (id: string) => (id === 'bob-uuid' ? bob : null),
    getAgentByName: (n: string) => (n === 'bob' ? bob : null),
  }
})

import { generateKeyPair } from '@/lib/amp-keys'
import { signingString } from '@/lib/amp-trust'
import { routeMessage } from '@/services/amp-service'

const sign = (priv: string, text: string) => crypto.sign(null, Buffer.from(text), priv).toString('base64')

describe('mesh-forwarded mail is verified and the result recorded', () => {
  let ledger: string
  beforeEach(() => {
    ledger = fs.mkdtempSync(path.join(os.tmpdir(), 'mesh-keys-'))
    process.env.AIMAESTRO_KNOWN_KEYS_DIR = ledger
    deliverMock.mockClear()
  })
  afterEach(() => {
    delete process.env.AIMAESTRO_KNOWN_KEYS_DIR
    fs.rmSync(ledger, { recursive: true, force: true })
  })

  async function forward(opts: { withKey?: boolean; unsigned?: boolean; tamper?: boolean; keys?: Awaited<ReturnType<typeof generateKeyPair>> } = {}) {
    const k = opts.keys || await generateKeyPair()
    const from = 'pas-lola@acme.aimaestro.local'
    const fullTo = 'bob@acme.aimaestro.local'
    const payload: any = { type: 'request', message: 'do the thing' }
    const signature = opts.unsigned ? undefined
      : sign(k.privatePem, signingString({ from, to: fullTo, subject: 'task', priority: 'normal', in_reply_to: '', payload }))
    if (opts.tamper) payload.message = 'do something else'
    const body: any = {
      from, to: 'bob', subject: 'task', payload, priority: 'normal', signature,
      ...(opts.withKey === false ? {} : { sender_public_key: k.publicPem }),
      _forwarded: { original_from: from, original_to: fullTo, forwarded_by: 'mini' },
    }
    const r = await routeMessage(body, null, 'mini', null, signature || null, null)
    const call = deliverMock.mock.calls[0] as any[] | undefined
    return { r, verification: call?.[0]?.verification, keys: k }
  }

  it('a good signature with the sender key is VERIFIED', async () => {
    const { r, verification } = await forward()
    expect(r.status).toBe(200)
    expect(verification).toMatchObject({ state: 'verified', trust: 'verified', method: 'mesh-forwarded' })
  })

  it('a changed message is refused', async () => {
    const { r } = await forward({ tamper: true })
    expect(r.status).toBe(403)
    expect(deliverMock).not.toHaveBeenCalled()
  })

  it('no key sent: delivered, recorded as unverified (an older host)', async () => {
    const { r, verification } = await forward({ withKey: false })
    expect(r.status).toBe(200)
    expect(verification).toMatchObject({ state: 'unverified', trust: 'untrusted', reason: 'no_key' })
  })

  it('unsigned: delivered, recorded as unverified', async () => {
    const { r, verification } = await forward({ unsigned: true })
    expect(r.status).toBe(200)
    expect(verification).toMatchObject({ state: 'unverified', reason: 'no_signature' })
  })

  it('the sender key changing is delivered but NOT marked verified', async () => {
    const first = await forward()
    expect(first.verification.state).toBe('verified')
    deliverMock.mockClear()
    const second = await forward() // same address, a different key pair
    expect(second.r.status).toBe(200)
    expect(second.verification).toMatchObject({ state: 'unverified', reason: 'key_conflict' })
  })
})
