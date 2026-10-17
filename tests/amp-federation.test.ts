import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { generateKeyPair } from '@/lib/amp-keys'
import { signingString } from '@/lib/amp-trust'
import {
  verifyProviderRequest, senderBelongsToProvider, isPlausibleProviderName, publicHexFromPem,
  PROVIDER_SIGNATURE_WINDOW_SECONDS,
} from '@/lib/amp-federation-auth'
import { deliverFederated } from '@/services/amp-service'

const sign = (priv: string, text: string) => crypto.sign(null, Buffer.from(text), priv).toString('base64')
const NOW = 1_800_000_000_000

describe('federation: provider authentication', () => {
  it('accepts a request the provider signed, and refuses everything else', async () => {
    const prov = await generateKeyPair()
    const fetchDoc = async () => ({ public_key: prov.publicPem })
    const body = '{"a":1}'
    const ts = String(NOW / 1000)
    const good = sign(prov.privatePem, `${ts}.${body}`)
    const base = { provider: 'crabmail.ai', timestamp: ts, rawBody: body, nowMs: NOW, fetchDoc }

    expect((await verifyProviderRequest({ ...base, signature: good })).ok).toBe(true)
    // body changed after signing
    expect((await verifyProviderRequest({ ...base, signature: good, rawBody: '{"a":2}' })).ok).toBe(false)
    // someone else's key
    const other = await generateKeyPair()
    expect((await verifyProviderRequest({ ...base, signature: sign(other.privatePem, `${ts}.${body}`) })).ok).toBe(false)
    // missing headers
    const missing = await verifyProviderRequest({ ...base, signature: null })
    expect(missing).toMatchObject({ ok: false, status: 401 })
    // provider publishes no key
    expect((await verifyProviderRequest({ ...base, signature: good, fetchDoc: async () => ({}) })).ok).toBe(false)
    expect((await verifyProviderRequest({ ...base, signature: good, fetchDoc: async () => null })).ok).toBe(false)
  })

  it('refuses a replayed (stale) request', async () => {
    const prov = await generateKeyPair()
    const ts = String(NOW / 1000 - PROVIDER_SIGNATURE_WINDOW_SECONDS - 5)
    const r = await verifyProviderRequest({
      provider: 'crabmail.ai', timestamp: ts, rawBody: 'x', nowMs: NOW,
      signature: sign(prov.privatePem, `${ts}.x`), fetchDoc: async () => ({ public_key: prov.publicPem }),
    })
    expect(r).toMatchObject({ ok: false, status: 401 })
  })

  it('only accepts DNS names as a provider (no addresses, no bare labels)', () => {
    expect(isPlausibleProviderName('crabmail.ai')).toBe(true)
    expect(isPlausibleProviderName('agents.corp.io')).toBe(true)
    expect(isPlausibleProviderName('127.0.0.1')).toBe(false)
    expect(isPlausibleProviderName('localhost')).toBe(false)
    expect(isPlausibleProviderName('a b.com')).toBe(false)
    expect(isPlausibleProviderName('evil.com/../x')).toBe(false)
  })

  it('a sender belongs to the provider that hosts its address', () => {
    expect(senderBelongsToProvider('alice@acme.crabmail.ai', 'crabmail.ai')).toBe(true)
    expect(senderBelongsToProvider('alice@crabmail.ai', 'crabmail.ai')).toBe(true)
    expect(senderBelongsToProvider('alice@acme.crabmail.ai', 'evilcrabmail.ai')).toBe(false)
    expect(senderBelongsToProvider('alice@acme.other.com', 'crabmail.ai')).toBe(false)
  })

  it('extracts the raw key from a PEM', async () => {
    const k = await generateKeyPair()
    expect(publicHexFromPem(k.publicPem)).toBe(k.publicHex)
    expect(publicHexFromPem('garbage')).toBeNull()
    // Crabmail publishes the bare 32-byte key as 64 hex characters
    expect(publicHexFromPem(k.publicHex)).toBe(k.publicHex)
    expect(publicHexFromPem(k.publicHex.toUpperCase())).toBe(k.publicHex)
    expect(publicHexFromPem('ab'.repeat(31))).toBeNull()
    // base64 of the DER (SPKI) form
    const der = crypto.createPublicKey(k.publicPem).export({ type: 'spki', format: 'der' }).toString('base64')
    expect(publicHexFromPem(der)).toBe(k.publicHex)
  })
})

describe('federation: POST /api/v1/federation/deliver', () => {
  let ledger: string
  beforeEach(() => {
    ledger = fs.mkdtempSync(path.join(os.tmpdir(), 'fed-keys-'))
    process.env.AIMAESTRO_KNOWN_KEYS_DIR = ledger
  })
  afterEach(() => {
    delete process.env.AIMAESTRO_KNOWN_KEYS_DIR
    fs.rmSync(ledger, { recursive: true, force: true })
  })

  async function build(opts: { tamper?: boolean; unsigned?: boolean; from?: string; provider?: string } = {}) {
    const prov = await generateKeyPair()
    const sender = await generateKeyPair()
    const provider = opts.provider || 'crabmail.ai'
    const envelope: any = {
      version: 'amp/0.1', id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      from: opts.from || 'alice@acme.crabmail.ai', to: 'nobody-here@acme.aimaestro.local',
      subject: 'hello', priority: 'normal', timestamp: new Date().toISOString(),
    }
    const payload = { type: 'notification', message: 'hi' }
    if (!opts.unsigned) {
      envelope.signature = sign(sender.privatePem, signingString({ ...envelope, in_reply_to: '', payload }))
    }
    if (opts.tamper) payload.message = 'changed after signing'
    const body = { envelope, payload, sender_public_key: sender.publicPem }
    const rawBody = JSON.stringify(body)
    const ts = String(Math.floor(Date.now() / 1000))
    const auth = {
      signature: sign(prov.privatePem, `${ts}.${rawBody}`), timestamp: ts, rawBody,
      fetchDoc: async () => ({ public_key: prov.publicPem }),
    }
    return { provider, body, auth }
  }

  it('without provider signature headers: 401', async () => {
    const { provider, body } = await build()
    const r = await deliverFederated(provider, body)
    expect(r.status).toBe(401)
  })

  it('with a forged provider signature: 401', async () => {
    const { provider, body, auth } = await build()
    const bad = await generateKeyPair()
    const r = await deliverFederated(provider, body, { ...auth, fetchDoc: async () => ({ public_key: bad.publicPem }) })
    expect(r.status).toBe(401)
  })

  it('a sender from a different domain than the provider: 403', async () => {
    const { provider, body, auth } = await build({ from: 'alice@acme.other.com' })
    const r = await deliverFederated(provider, body, auth)
    expect(r.status).toBe(403)
    expect(r.data.error).toBe('provider_mismatch')
  })

  it('an unsigned message: 403', async () => {
    const { provider, body, auth } = await build({ unsigned: true })
    const r = await deliverFederated(provider, body, auth)
    expect(r.status).toBe(403)
    expect(r.data.error).toBe('invalid_signature')
  })

  it('a message changed after signing: 403', async () => {
    const { provider, body, auth } = await build({ tamper: true })
    const r = await deliverFederated(provider, body, auth)
    expect(r.status).toBe(403)
    expect(r.data.error).toBe('invalid_signature')
  })

  it('a valid message passes verification (and then fails on the unknown recipient)', async () => {
    const { provider, body, auth } = await build()
    const r = await deliverFederated(provider, body, auth)
    expect(r.status).toBe(404)
    expect(r.data.error).toBe('not_found')
  })

  it('the same sender with a different key is a conflict: 409', async () => {
    const a = await build()
    expect((await deliverFederated(a.provider, a.body, a.auth)).status).toBe(404)
    const b = await build() // same address, new key pair
    const r = await deliverFederated(b.provider, b.body, b.auth)
    expect(r.status).toBe(409)
    expect(r.data.error).toBe('key_conflict')
  })
})

import { discoveryUrls, documentFor } from '@/lib/amp-federation-auth'

describe('federation: where a provider is discovered', () => {
  it('tries the bare domain, then the api. host (Crabmail serves its API there)', () => {
    expect(discoveryUrls('crabmail.ai')).toEqual([
      'https://crabmail.ai/.well-known/agent-messaging.json',
      'https://api.crabmail.ai/.well-known/agent-messaging.json',
    ])
  })
  it('accepts a document only when it names the provider asked for and carries a key', () => {
    expect(documentFor('crabmail.ai', { provider: 'crabmail.ai', public_key: 'PEM' })).toMatchObject({ public_key: 'PEM' })
    expect(documentFor('crabmail.ai', { provider: 'other.example', public_key: 'PEM' })).toBeNull()
    expect(documentFor('crabmail.ai', { provider: 'crabmail.ai' })).toBeNull()
    expect(documentFor('crabmail.ai', '<html>')).toBeNull()
  })
})
