import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const { deliverMock, HOME, bob } = vi.hoisted(() => {
  const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path')
  return {
    deliverMock: vi.fn(async () => ({ delivered: true, notified: false })),
    HOME: fs.mkdtempSync(path.join(os.tmpdir(), 'multi-addr-')) as string,
    bob: { id: 'bob-uuid', name: 'bob', sessions: [], metadata: { amp: { address: 'bob@acme.aimaestro.local' } } },
  }
})

vi.mock('@/lib/message-delivery', () => ({ deliver: (...a: unknown[]) => deliverMock(...(a as [])) }))
vi.mock('@/lib/hosts-config-server.mjs', () => ({
  getSelfHostId: () => 'mac', getSelfHost: () => ({ id: 'mac', url: 'http://localhost:23000' }),
  getHostById: () => undefined, isSelf: (id: string) => id === 'mac', getOrganization: () => 'acme',
}))
vi.mock('@/lib/agent-registry', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  loadAgents: () => [bob],
  getAgent: (id: string) => (id === 'bob-uuid' ? bob : null),
  getAgentByName: (n: string) => (n === 'bob' ? bob : null),
  getAgentByNameAnyHost: (n: string) => (n === 'bob' ? bob : null),
}))
vi.mock('@/lib/amp-keys', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  loadAllRegistrations: () => [{ provider: 'crabmail.ai', address: 'bob@23blocks.crabmail.ai', fingerprint: 'SHA256:crab' }],
  loadKeyPair: () => ({ publicPem: 'LOCAL-PEM', fingerprint: 'SHA256:local', publicHex: 'ab'.repeat(32), privatePem: '' }),
}))
vi.mock('@/lib/messageQueue', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  resolveAgentIdentifier: (n: string) => (n === 'bob' ? { agentId: 'bob-uuid', alias: 'bob' } : null),
}))
vi.mock('@/lib/amp-auth', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  authenticateRequest: () => ({ authenticated: true, agentId: 'bob-uuid', address: 'bob@acme.aimaestro.local', tenantId: 'acme' }),
}))
vi.mock('os', async (orig) => {
  const real = await orig<typeof import('os')>()
  return { ...real, default: { ...real, homedir: () => HOME }, homedir: () => HOME }
})

import { generateKeyPair } from '@/lib/amp-keys'
import { signingString } from '@/lib/amp-trust'
import { deliverFederated, resolveAgentAddress } from '@/services/amp-service'

const sign = (priv: string, t: string) => crypto.sign(null, Buffer.from(t), priv).toString('base64')

describe('federated mail goes only to an address the agent has', () => {
  let ledger: string
  beforeEach(() => {
    ledger = fs.mkdtempSync(path.join(os.tmpdir(), 'ma-keys-'))
    process.env.AIMAESTRO_KNOWN_KEYS_DIR = ledger
    deliverMock.mockClear()
    const dir = path.join(HOME, '.agent-messaging', 'agents', 'bob-uuid', 'registrations')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'crabmail.ai.json'), JSON.stringify({ address: 'bob@23blocks.crabmail.ai' }))
  })
  afterEach(() => { delete process.env.AIMAESTRO_KNOWN_KEYS_DIR; fs.rmSync(ledger, { recursive: true, force: true }) })

  async function post(to: string) {
    const prov = await generateKeyPair()
    const sender = await generateKeyPair()
    const envelope: any = {
      version: 'amp/0.1', id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      from: 'alice@acme.crabmail.ai', to, subject: 's', priority: 'normal', timestamp: new Date().toISOString(),
    }
    const payload = { type: 'notification', message: 'hi' }
    envelope.signature = sign(sender.privatePem, signingString({ ...envelope, in_reply_to: '', payload }))
    const rawBody = JSON.stringify({ envelope, payload, sender_public_key: sender.publicPem })
    const ts = String(Math.floor(Date.now() / 1000))
    return deliverFederated('crabmail.ai', JSON.parse(rawBody), {
      rawBody, timestamp: ts, signature: sign(prov.privatePem, `${ts}.${rawBody}`),
      fetchDoc: async () => ({ public_key: prov.publicPem }),
    })
  }

  it('delivers to the local address', async () => {
    const r = await post('bob@acme.aimaestro.local')
    expect(r.status).toBe(200)
    expect(deliverMock).toHaveBeenCalledTimes(1)
  })

  it('delivers to the same agent\'s address at another provider', async () => {
    const r = await post('bob@23blocks.crabmail.ai')
    expect(r.status).toBe(200)
  })

  it('refuses mail for the same first name in a tenant the agent is not in', async () => {
    const r = await post('bob@othertenant.crabmail.ai')
    expect(r.status).toBe(404)
    expect(deliverMock).not.toHaveBeenCalled()
  })
})

describe('resolving an address returns the key that belongs to it', () => {
  it('the local address gets the local key', () => {
    const r = resolveAgentAddress('Bearer x', 'bob@acme.aimaestro.local')
    expect(r.status).toBe(200)
    expect((r.data as any).public_key).toBe('LOCAL-PEM')
  })
  it('a mesh spelling of the tenant (host id) still gets the local key', () => {
    expect((resolveAgentAddress('Bearer x', 'bob@mini-lola.aimaestro.local').data as any).public_key).toBe('LOCAL-PEM')
  })
  it('the provider address does not borrow the local key', () => {
    const r = resolveAgentAddress('Bearer x', 'bob@23blocks.crabmail.ai')
    expect(r.status).toBe(200)
    expect((r.data as any).public_key).toBe('')
    expect((r.data as any).fingerprint).toBe('SHA256:crab')
    expect((r.data as any).address).toBe('bob@23blocks.crabmail.ai')
  })
  it('an address nobody has is not found', () => {
    expect(resolveAgentAddress('Bearer x', 'zed@23blocks.crabmail.ai').status).toBe(404)
  })
})
