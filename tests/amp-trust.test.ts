import { describe, it, expect } from 'vitest'
import crypto from 'node:crypto'
import { generateKeyPair } from '@/lib/amp-keys'
import { signingString, checkSignature, trustFor, tenantOf, buildVerification, payloadHash } from '@/lib/amp-trust'

function sign(privatePem: string, text: string): string {
  return crypto.sign(null, Buffer.from(text), privatePem).toString('base64')
}

const fields = {
  from: 'alice@acme.aimaestro.local',
  to: 'bob@acme.aimaestro.local',
  subject: 'hello',
  priority: 'normal',
  in_reply_to: '',
  payload: { type: 'notification', message: 'hi' },
}

describe('AMP trust (protocol 07-security)', () => {
  it('signs from|to|subject|priority|in_reply_to|payload-hash', () => {
    expect(signingString(fields)).toBe(
      ['alice@acme.aimaestro.local', 'bob@acme.aimaestro.local', 'hello', 'normal', '', payloadHash(fields.payload)].join('|'),
    )
  })

  it('verifies a good signature and rejects a changed field', async () => {
    const k = await generateKeyPair()
    const sig = sign(k.privatePem, signingString(fields))
    expect(checkSignature(fields, sig, k.publicHex)).toBe('verified')
    expect(checkSignature({ ...fields, subject: 'other' }, sig, k.publicHex)).toBe('bad')
    expect(checkSignature({ ...fields, from: 'mallory@acme.aimaestro.local' }, sig, k.publicHex)).toBe('bad')
    expect(checkSignature({ ...fields, payload: { type: 'notification', message: 'hi!' } }, sig, k.publicHex)).toBe('bad')
  })

  it('a signature from another key is bad, not unverified', async () => {
    const k = await generateKeyPair()
    const other = await generateKeyPair()
    const sig = sign(other.privatePem, signingString(fields))
    expect(checkSignature(fields, sig, k.publicHex)).toBe('bad')
  })

  it('reports unsigned and no_key separately from bad', async () => {
    const k = await generateKeyPair()
    expect(checkSignature(fields, undefined, k.publicHex)).toBe('unsigned')
    expect(checkSignature(fields, 'abc', undefined)).toBe('no_key')
  })

  it('classifies trust: verified in tenant, external outside, untrusted otherwise', () => {
    expect(trustFor('verified', true)).toBe('verified')
    expect(trustFor('verified', false)).toBe('external')
    expect(trustFor('bad', true)).toBe('untrusted')
    expect(trustFor('unsigned', true)).toBe('untrusted')
    expect(trustFor('no_key', false)).toBe('untrusted')
  })

  it('reads the tenant from an address', () => {
    expect(tenantOf('a@Acme.aimaestro.local')).toBe('acme')
    expect(tenantOf('nonsense')).toBe('')
  })

  it('builds a record that names the reason when not verified', async () => {
    const k = await generateKeyPair()
    const ok = buildVerification({ check: 'verified', sameTenant: true, method: 'route', fields, publicHex: k.publicHex, now: 'T' })
    expect(ok).toMatchObject({ state: 'verified', trust: 'verified', method: 'route', checked_at: 'T' })
    expect(ok.reason).toBeUndefined()
    expect(ok.payload_sha256).toBe(payloadHash(fields.payload))
    const un = buildVerification({ check: 'unsigned', sameTenant: true, method: 'route', fields })
    expect(un).toMatchObject({ state: 'unverified', trust: 'untrusted', reason: 'no_signature' })
    const bad = buildVerification({ check: 'bad', sameTenant: false, method: 'federation', fields, publicHex: k.publicHex })
    expect(bad).toMatchObject({ state: 'bad', trust: 'untrusted', reason: 'signature_mismatch' })
  })
})
