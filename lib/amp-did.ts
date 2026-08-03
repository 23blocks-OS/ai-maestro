/**
 * did:key — the self-certifying agent identity (AMP spec 02-identity, F015).
 *
 * An agent's canonical identifier is derived FROM its Ed25519 public key, so the
 * identifier cannot drift from the key material: two agents cannot share an
 * identity without sharing a keypair, and an id/key mismatch is unrepresentable
 * rather than merely detected. This is the structural replacement for the guards
 * (conflict detection, address-uniqueness) that only compensate for a UUID that
 * has no tie to the key.
 *
 * Format:  did:key:z<base58btc( 0xed01 || raw-32-byte-ed25519-pubkey )>
 * Ref:     https://w3c-ccg.github.io/did-method-key/  (ed25519 multicodec 0xed)
 */

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

/** base58btc (Bitcoin alphabet) encode of a byte buffer. */
function base58btc(bytes: Buffer): string {
  let zeros = 0
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++
  const digits: number[] = [0]
  for (let i = zeros; i < bytes.length; i++) {
    let carry = bytes[i]
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8
      digits[j] = carry % 58
      carry = (carry / 58) | 0
    }
    while (carry) { digits.push(carry % 58); carry = (carry / 58) | 0 }
  }
  let out = '1'.repeat(zeros)
  for (let k = digits.length - 1; k >= 0; k--) out += B58[digits[k]]
  return out
}

/**
 * Derive the did:key for a raw Ed25519 public key hex (the 32-byte key, as
 * returned by lib/amp-keys.ts loadKeyPair().publicHex). Returns null on bad input.
 */
export function deriveDidKey(publicKeyHex: string | undefined | null): string | null {
  if (!publicKeyHex) return null
  let raw: Buffer
  try { raw = Buffer.from(publicKeyHex, 'hex') } catch { return null }
  if (raw.length !== 32) return null   // Ed25519 raw public key is exactly 32 bytes
  const multicodec = Buffer.concat([Buffer.from([0xed, 0x01]), raw])
  return 'did:key:z' + base58btc(multicodec)
}

/**
 * The runtime identity invariant: an agent's stored `did` MUST equal the did
 * derived from its registered public key. A mismatch means the identity has been
 * decoupled from the key (the contamination class) and MUST be rejected/flagged.
 * Returns true when `did` is present and matches (or when there is nothing to
 * check yet — a missing did is a backfill task, not a violation).
 */
export function didMatchesKey(did: string | undefined | null, publicKeyHex: string | undefined | null): boolean {
  if (!did) return true                 // not yet stamped — not a violation
  const derived = deriveDidKey(publicKeyHex)
  return derived !== null && derived === did
}
