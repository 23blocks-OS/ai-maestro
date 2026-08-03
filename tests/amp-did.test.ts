import { describe, it, expect } from 'vitest'
import { createHash, generateKeyPairSync } from 'node:crypto'
import { deriveDidKey, didMatchesKey } from '@/lib/amp-did'

// raw 32-byte Ed25519 public key hex, the way lib/amp-keys.ts exposes it
function rawPubHex(): string {
  const { publicKey } = generateKeyPairSync('ed25519')
  const der = publicKey.export({ type: 'spki', format: 'der' }) as Buffer
  return der.subarray(-32).toString('hex')
}

// independent base58btc DECODE, to prove the encoder round-trips
function b58decode(s: string): Buffer {
  const A = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
  let n = 0n
  for (const ch of s) n = n * 58n + BigInt(A.indexOf(ch))
  const bytes: number[] = []
  while (n > 0n) { bytes.unshift(Number(n & 0xffn)); n >>= 8n }
  let zeros = 0; while (zeros < s.length && s[zeros] === '1') zeros++
  return Buffer.concat([Buffer.alloc(zeros), Buffer.from(bytes)])
}

describe('did:key derivation (lib/amp-did)', () => {
  it('produces the ed25519 did:key prefix z6Mk', () => {
    expect(deriveDidKey(rawPubHex())!.startsWith('did:key:z6Mk')).toBe(true)
  })

  it('round-trips: decode(did) === 0xed01 || raw pubkey (proves the encoder)', () => {
    const hex = rawPubHex()
    const did = deriveDidKey(hex)!
    const decoded = b58decode(did.replace('did:key:z', ''))
    expect(decoded.subarray(0, 2)).toEqual(Buffer.from([0xed, 0x01]))
    expect(decoded.subarray(2).toString('hex')).toBe(hex)
  })

  it('is deterministic per key and unique across keys', () => {
    const a = rawPubHex()
    expect(deriveDidKey(a)).toBe(deriveDidKey(a))
    expect(deriveDidKey(a)).not.toBe(deriveDidKey(rawPubHex()))
  })

  it('rejects malformed input', () => {
    expect(deriveDidKey(null)).toBeNull()
    expect(deriveDidKey('')).toBeNull()
    expect(deriveDidKey('abcd')).toBeNull()              // wrong length
    expect(deriveDidKey('zz'.repeat(32))).toBeNull()      // not hex
  })

  it('didMatchesKey enforces the id↔key invariant', () => {
    const hex = rawPubHex()
    const did = deriveDidKey(hex)!
    expect(didMatchesKey(did, hex)).toBe(true)            // matches its key
    expect(didMatchesKey(did, rawPubHex())).toBe(false)   // a different key = drift = violation
    expect(didMatchesKey(undefined, hex)).toBe(true)      // not yet stamped = not a violation (backfill)
  })

  it('sanity: derived did encodes the exact key (no hashing)', () => {
    const hex = rawPubHex()
    // fingerprint (a hash) must NOT equal the did (which embeds the key verbatim)
    const fp = 'SHA256:' + createHash('sha256').update(Buffer.from(hex, 'hex')).digest('base64')
    expect(deriveDidKey(hex)).not.toContain(fp)
  })
})
