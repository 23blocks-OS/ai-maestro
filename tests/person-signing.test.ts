import { describe, it, expect } from 'vitest'
import crypto from 'crypto'
import { payloadHash, signingString } from '@/lib/amp-trust'
import { checkPersonSend, NonceStore, rawKeyToHex, SEND_WINDOW_MS, type DeviceKey } from '@/lib/person-signing'

// The published test vector (docs/PERSON-SIGNING.md). The app checks its own signing against these
// exact values, so changing any of them breaks every phone: do not edit them to make a test pass.
const VECTOR = {
  seedHex: '07'.repeat(32),
  publicKey: '6kpsY+KcUgq+9VB7Ey7F+ZVHdq6+vnuSQh7qaRRG0iw=',
  payloadHash: 'e4UQJBts4sgrkubDH2OMcI2CERtdn/hxxraMWFV6Oik=',
  signingString: 'p-7f3a9c@acme.aimaestro.local|lola@acme.aimaestro.local|Deploy staging|normal||e4UQJBts4sgrkubDH2OMcI2CERtdn/hxxraMWFV6Oik=',
  signature: 'YBPkqQi465fEeN7QVgOojlFRpcs1Sk/7O4Z1tniTrsgTMOLewIiAjpfJie3lIW8KYAsdcfUfmWt9Ozd8oI6xDA==',
}
const SENT_AT = '2026-11-01T10:00:00Z'
const fields = {
  from: 'p-7f3a9c@acme.aimaestro.local',
  to: 'lola@acme.aimaestro.local',
  subject: 'Deploy staging',
  priority: 'normal',
  in_reply_to: '',
  payload: { type: 'request', message: 'Please deploy the staging branch.', context: { sent_at: SENT_AT, nonce: '00112233445566778899aabbccddeeff' } },
}
const key: DeviceKey = { keyId: 'k_test', personId: 'p-7f3a9c', publicKey: VECTOR.publicKey, status: 'active' }
const at = Date.parse(SENT_AT)
const check = (over: Partial<Parameters<typeof checkPersonSend>[0]> = {}) =>
  checkPersonSend({ fields, signature: VECTOR.signature, personId: 'p-7f3a9c', key, now: at, nonces: new NonceStore(), ...over })

describe('person signing: the published vector', () => {
  it('hashes, builds the signing string and verifies exactly as published', () => {
    const priv = crypto.createPrivateKey({ key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), Buffer.from(VECTOR.seedHex, 'hex')]), format: 'der', type: 'pkcs8' })
    expect(crypto.createPublicKey(priv).export({ format: 'der', type: 'spki' }).subarray(12).toString('base64')).toBe(VECTOR.publicKey)
    expect(payloadHash(fields.payload)).toBe(VECTOR.payloadHash)
    expect(signingString(fields)).toBe(VECTOR.signingString)
    expect(crypto.sign(null, Buffer.from(VECTOR.signingString), priv).toString('base64')).toBe(VECTOR.signature)
    expect(check()).toEqual({ ok: true })
  })
})

describe('checkPersonSend', () => {
  it('refuses a missing, foreign, pending or revoked key', () => {
    expect(check({ key: null })).toMatchObject({ reason: 'no_key' })
    expect(check({ personId: 'someone-else' })).toMatchObject({ reason: 'wrong_person' })
    expect(check({ key: { ...key, status: 'pending' } })).toMatchObject({ reason: 'pending' })
    expect(check({ key: { ...key, status: 'revoked' } })).toMatchObject({ reason: 'revoked' })
  })

  it('refuses a changed message or another key\'s signature', () => {
    expect(check({ fields: { ...fields, subject: 'Deploy production' } })).toMatchObject({ reason: 'bad_signature' })
    const other = crypto.generateKeyPairSync('ed25519').publicKey.export({ format: 'der', type: 'spki' }).subarray(12).toString('base64')
    expect(check({ key: { ...key, publicKey: other } })).toMatchObject({ reason: 'bad_signature' })
  })

  it('needs sent_at and a 128-bit nonce in the signed payload', () => {
    const noCtx = { ...fields, payload: { type: 'request', message: 'x' } }
    expect(check({ fields: noCtx })).toMatchObject({ reason: 'missing_context' })
    const shortNonce = { ...fields, payload: { ...fields.payload, context: { sent_at: SENT_AT, nonce: 'abcd' } } }
    expect(check({ fields: shortNonce })).toMatchObject({ reason: 'missing_context' })
  })

  it('refuses a send more than 5 minutes off, and the same nonce twice', () => {
    expect(check({ now: at + SEND_WINDOW_MS + 1000 })).toMatchObject({ reason: 'stale' })
    const nonces = new NonceStore()
    expect(check({ nonces })).toEqual({ ok: true })
    expect(check({ nonces })).toMatchObject({ reason: 'replay' })
  })

  it('takes only 32-byte raw keys', () => {
    expect(rawKeyToHex(VECTOR.publicKey)).toHaveLength(64)
    expect(rawKeyToHex(Buffer.alloc(31).toString('base64'))).toBeNull()
  })
})
