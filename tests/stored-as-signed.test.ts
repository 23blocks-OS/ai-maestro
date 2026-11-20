/**
 * AMP 04 "Stored Message Format" and 07 "Where wrapping applies": a stored message keeps the payload and the signed
 * envelope fields exactly as signed, so the recipient can verify it again from the file; wrapping follows the 07
 * trust level (signature and tenant) and is applied to what the agent is shown, never to the store.
 *
 * Before: a verified message from another host of the same tenant was stored wrapped (`trust="none"`), with `to`
 * as the forward's short name and a rebuilt payload, so 1,655 stored messages on one host could not be verified again.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// The inbox writer fixes its folder from HOME when it loads: point HOME at a temporary folder before any import
const home = vi.hoisted(() => {
  const fs = require('node:fs'), os = require('node:os'), path = require('node:path')
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stored-as-signed-'))
  process.env.HOME = dir
  return dir as string
})
const wake = vi.hoisted(() => ({ calls: [] as any[] }))
vi.mock('@/lib/wake-chain', () => ({
  runWakeChain: async (o: any) => { wake.calls.push(o); return { notified: true, confirmed: true, confirmedBy: 'test', attempts: [] } },
  describeWakeResult: () => 'test',
}))
vi.mock('@/lib/wake-state', () => ({ recordWake: () => {} }))
vi.mock('@/lib/wake-queue', () => ({ enqueueWake: () => {} }))
vi.mock('@/lib/amp-websocket', () => ({ isAgentConnectedViaWS: () => false, deliverViaWebSocket: () => false }))
vi.mock('@/lib/agent-registry', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getAgent: (id: string) => (id === 'bob-uuid' ? { id: 'bob-uuid', name: 'bob' } : null),
}))

import { signingString, payloadHash, buildVerification } from '@/lib/amp-trust'
import { generateKeyPair, verifySignature } from '@/lib/amp-keys'
import { deliver } from '@/lib/message-delivery'
import { presentStoredMessage } from '@/lib/content-security'

const FROM = 'ana@acme.aimaestro.local'
const TO = 'bob@acme.aimaestro.local'

describe('a stored message keeps what was signed', () => {
  beforeAll(() => {
    // Never the real mailbox
    expect(home).toContain('stored-as-signed-')
    expect(os.homedir()).toBe(home)
  })
  afterAll(() => {
    fs.rmSync(home, { recursive: true, force: true })
  })
  beforeEach(() => { wake.calls.length = 0 })

  async function deliverSigned(opts: { from?: string; check?: 'verified' | 'unsigned'; payload?: any }) {
    const k = await generateKeyPair()
    const from = opts.from || FROM
    // Fields a rebuild would lose: no context, and one the provider does not know
    const payload = opts.payload || { type: 'request', message: 'Ship the release notes', extra: { ticket: 7 } }
    const fields = { from, to: TO, subject: 'notes', priority: 'normal', in_reply_to: '', payload }
    const signature = crypto.sign(null, Buffer.from(signingString(fields)), k.privatePem).toString('base64')
    const check = opts.check || 'verified'
    const verification = buildVerification({ check, sameTenant: from.split('@')[1].startsWith('acme.'), method: 'mesh-forwarded', fields, publicHex: k.publicHex })
    const id = `msg_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`
    const envelope: any = { version: 'amp/0.1', id, from, to: TO, subject: 'notes', priority: 'normal', timestamp: new Date().toISOString(), signature, in_reply_to: undefined }
    const r = await deliver({ envelope, payload, recipientAgentName: 'bob', recipientAgentId: 'bob-uuid', senderName: from.split('@')[0], senderHost: 'mini', subject: 'notes', priority: 'normal', messageType: 'request', verification } as any)
    expect(r.delivered).toBe(true)
    const dir = path.join(home, '.agent-messaging', 'agents', 'bob-uuid', 'messages', 'inbox')
    const file = fs.readdirSync(dir).flatMap(d => fs.readdirSync(path.join(dir, d)).map(f => path.join(dir, d, f))).find(f => f.endsWith(`${id}.json`))!
    return { stored: JSON.parse(fs.readFileSync(file, 'utf8')), keys: k, payload }
  }

  it('a verified same-tenant message from another host is stored and shown unwrapped, and verifies again from the file', async () => {
    const { stored, keys, payload } = await deliverSigned({})
    expect(stored.payload).toEqual(payload)
    expect(stored.security).toMatchObject({ trust_level: 'verified', payload_hash: payloadHash(payload) })
    const e = stored.envelope
    const text = signingString({ from: e.from, to: e.to, subject: e.subject, priority: e.priority, in_reply_to: e.in_reply_to || '', payload: stored.payload })
    expect(verifySignature(text, e.signature, keys.publicHex)).toBe(true)
    // 07 and 06a: never wrapped, neither in the store nor in what the agent is shown
    expect(wake.calls[0].injectBody).toBe('Ship the release notes')
    expect(presentStoredMessage(stored)).toBe('Ship the release notes')
  })

  it('a verified message from another tenant is stored as signed and wrapped where it is shown', async () => {
    const { stored, payload } = await deliverSigned({ from: 'carol@globex.aimaestro.local' })
    expect(stored.payload).toEqual(payload)
    expect(stored.security.trust_level).toBe('external')
    expect(wake.calls[0].injectBody).toContain('<external-content source="agent" sender="carol@globex.aimaestro.local" trust="external"')
    expect(presentStoredMessage(stored)).toContain('trust="external"')
    expect(presentStoredMessage(stored)).toContain('Ship the release notes')
  })

  it('an unverified message is stored as received and shown wrapped as untrusted, with no payload_hash', async () => {
    const { stored } = await deliverSigned({ check: 'unsigned' })
    expect(stored.payload.message).toBe('Ship the release notes')
    expect(stored.security.trust_level).toBe('untrusted')
    expect(stored.security.payload_hash).toBeUndefined()
    expect(wake.calls[0].injectBody).toContain('trust="untrusted"')
    expect(presentStoredMessage(stored)).toContain('trust="untrusted"')
  })

  it('an older store that wrapped the body itself is shown as it is, never wrapped twice', () => {
    const legacy = { envelope: { from: FROM }, payload: { type: 'notification', message: '<external-content source="agent" sender="x" trust="none">\nold\n</external-content>' } }
    expect(presentStoredMessage(legacy)).toBe(legacy.payload.message)
  })
})

