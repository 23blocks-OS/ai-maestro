/**
 * Proof of possession for registering an existing name (AMP spec 03, lib/amp-register-proof.ts):
 * the spec's test vector, replay, the window, another name or provider, a forged signature.
 */
import { describe, it, expect } from 'vitest'
import crypto from 'crypto'
import { checkRegisterProof, makeRegisterProof, registerSignInput, UsedProofs, PROOF_WINDOW_MS } from '@/lib/amp-register-proof'

function keyPair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519')
  const raw = (publicKey.export({ type: 'spki', format: 'der' }) as Buffer).subarray(12)
  return { privateKey, hex: raw.toString('hex'), fingerprint: `SHA256:${crypto.createHash('sha256').update(raw).digest('base64')}` }
}

const alice = keyPair()
const mallory = keyPair()
const T0 = 1767268800 // 2026-01-01T12:00:00Z
const subject = { provider: 'acme.aimaestro.local', tenant: 'acme', name: 'alice', fingerprint: alice.fingerprint }
const check = (proof: unknown, over: Partial<{ now: number; used: UsedProofs; subject: typeof subject }> = {}) =>
  checkRegisterProof({ proof, subject: over.subject ?? subject, publicKeyHex: alice.hex, now: over.now ?? T0 * 1000, used: over.used ?? new UsedProofs() })

describe('register proof (AMP spec 03)', () => {
  it('matches the spec test vector regproof-001', () => {
    // RFC 8032 test 1 key, as in agentmessaging/protocol tests/test-vectors.json
    const seed = Buffer.from('9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60', 'hex')
    const key = crypto.createPrivateKey({ key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), seed]), format: 'der', type: 'pkcs8' })
    const s = { provider: 'crabmail.ai', tenant: '23blocks', name: 'backend-architect', fingerprint: 'SHA256:If4x36FUomFia/hUBG/SJxt77UtqvkWqWId+9H+XIbk=' }
    expect(registerSignInput(s, '1706616000')).toBe('amp-register-proof\n1706616000\ncrabmail.ai\n23blocks\nbackend-architect\nSHA256:If4x36FUomFia/hUBG/SJxt77UtqvkWqWId+9H+XIbk=')
    const proof = makeRegisterProof(key, s, '1706616000')
    expect(proof).toBe('NrSAWwSQIKqMLCQpGpC4mqpfSjxexExmdZh5BMkcnGkcTHNqc8G9aDNfuwHvBGalHQLeXEy7VCs7YQB8wqKPCzE3MDY2MTYwMDA')
    expect(checkRegisterProof({ proof, subject: s, publicKeyHex: 'd75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a', now: 1706616000_000, used: new UsedProofs() })).toEqual({ ok: true })
  })

  it('accepts a proof by the registered key once, and refuses it again', () => {
    const used = new UsedProofs()
    const proof = makeRegisterProof(alice.privateKey, subject, String(T0))
    expect(check(proof, { used })).toEqual({ ok: true })
    expect(check(proof, { used, now: T0 * 1000 + 1000 })).toMatchObject({ ok: false, message: expect.stringMatching(/already used/) })
  })

  it('does not remember a refused proof, so a stranger cannot spend it', () => {
    const used = new UsedProofs()
    const proof = makeRegisterProof(alice.privateKey, subject, String(T0))
    expect(check(proof, { used, subject: { ...subject, name: 'bob' } }).ok).toBe(false)
    expect(check(proof, { used }).ok).toBe(true)
  })

  it('refuses a proof for another name, tenant or provider', () => {
    for (const other of [{ ...subject, name: 'bob' }, { ...subject, tenant: 'other' }, { ...subject, provider: 'crabmail.ai' }]) {
      expect(check(makeRegisterProof(alice.privateKey, other, String(T0)))).toMatchObject({ ok: false, message: expect.stringMatching(/does not verify/) })
    }
  })

  it('refuses a signature by another key', () => {
    expect(check(makeRegisterProof(mallory.privateKey, subject, String(T0))).ok).toBe(false)
  })

  it('refuses a timestamp more than 5 minutes off, either way', () => {
    for (const ts of [T0 - PROOF_WINDOW_MS / 1000 - 1, T0 + PROOF_WINDOW_MS / 1000 + 1]) {
      expect(check(makeRegisterProof(alice.privateKey, subject, String(ts)))).toMatchObject({ ok: false, message: expect.stringMatching(/5 minutes/) })
    }
  })

  it('refuses a malformed proof', () => {
    for (const proof of [null, 42, '', 'not base64!', Buffer.alloc(64).toString('base64url'), Buffer.concat([Buffer.alloc(64), Buffer.from('soon')]).toString('base64url')]) {
      expect(check(proof).ok).toBe(false)
    }
  })
})
