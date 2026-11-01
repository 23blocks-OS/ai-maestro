/**
 * Checks a message a person sends from a device (protocol spec 13, Person Principals).
 *
 * A person signs exactly what an agent signs: the canonical string from|to|subject|priority|in_reply_to|
 * payload_hash (lib/amp-trust.ts), so phone and server share one definition. What spec 13 adds for a
 * person is replay protection inside the signed payload: payload.context.sent_at (RFC 3339) and
 * payload.context.nonce (at least 128 random bits). The host rejects a send more than 5 minutes off, or
 * one whose (key_id, nonce) it already accepted within that window.
 *
 * Device keys are raw Ed25519 public keys, 32 bytes, base64 (iOS CryptoKit / @noble/ed25519).
 */

import { checkSignature, type SignedFields } from '@/lib/amp-trust'

export const SEND_WINDOW_MS = 5 * 60 * 1000
const NONCE_MIN_BYTES = 16

export type DeviceKeyStatus = 'pending' | 'active' | 'revoked'

export interface DeviceKey {
  keyId: string
  personId: string
  /** Raw 32-byte Ed25519 public key, base64 */
  publicKey: string
  status: DeviceKeyStatus
  revokedAt?: string
}

export type PersonSendCheck =
  | { ok: true }
  | { ok: false; reason: 'no_key' | 'wrong_person' | 'revoked' | 'pending' | 'missing_context' | 'stale' | 'replay' | 'bad_signature'; message: string }

/** Raw base64 key → the hex form lib/amp-keys verifySignature takes, or null if it is not 32 bytes */
export function rawKeyToHex(publicKey: string): string | null {
  try {
    const raw = Buffer.from(publicKey, 'base64')
    return raw.length === 32 ? raw.toString('hex') : null
  } catch {
    return null
  }
}

/** Accepted (keyId, nonce) pairs, kept for the send window. Per host. */
export class NonceStore {
  private seen = new Map<string, number>()

  /** True when the pair is new (and records it); false when it was already used within the window */
  claim(keyId: string, nonce: string, now: number): boolean {
    for (const [k, at] of this.seen) if (now - at > SEND_WINDOW_MS) this.seen.delete(k)
    const k = `${keyId}\u0000${nonce}`
    if (this.seen.has(k)) return false
    this.seen.set(k, now)
    return true
  }
}

const g = globalThis as { _personNonces?: NonceStore }
// shortcut: in memory, so a restart forgets the last 5 minutes of nonces; persist them if replay right
// after a restart ever matters (the signature, the person's own key and sent_at still apply)
export const personNonces = (): NonceStore => (g._personNonces ??= new NonceStore())

/**
 * Everything spec 13.3 asks of the provider before it may mark a person's message verified.
 * `key` is the enrolled key the envelope's key_id names (null when there is none).
 */
export function checkPersonSend(opts: {
  fields: SignedFields
  signature: string | undefined | null
  personId: string
  key: DeviceKey | null
  now: number
  nonces: NonceStore
}): PersonSendCheck {
  const { fields, signature, personId, key, now, nonces } = opts
  if (!key) return { ok: false, reason: 'no_key', message: 'No enrolled device key with that key_id' }
  if (key.personId !== personId) return { ok: false, reason: 'wrong_person', message: 'That key belongs to another person' }
  if (key.status === 'revoked') return { ok: false, reason: 'revoked', message: 'That device key was revoked' }
  if (key.status !== 'active') return { ok: false, reason: 'pending', message: 'That device key is waiting for approval on the dashboard' }

  const ctx = (fields.payload as { context?: { sent_at?: unknown; nonce?: unknown } } | null)?.context
  const sentAt = typeof ctx?.sent_at === 'string' ? Date.parse(ctx.sent_at) : NaN
  const nonce = typeof ctx?.nonce === 'string' ? ctx.nonce : ''
  let nonceBytes = 0
  try { nonceBytes = Buffer.from(nonce, /^[0-9a-f]+$/i.test(nonce) ? 'hex' : 'base64url').length } catch { nonceBytes = 0 }
  if (Number.isNaN(sentAt) || nonceBytes < NONCE_MIN_BYTES) {
    return { ok: false, reason: 'missing_context', message: 'payload.context needs sent_at (RFC 3339) and a nonce of at least 128 bits' }
  }

  const hex = rawKeyToHex(key.publicKey)
  if (!hex || checkSignature(fields, signature, hex) !== 'verified') {
    return { ok: false, reason: 'bad_signature', message: 'The signature does not verify with that device key' }
  }
  // After the signature, so an unsigned request cannot burn someone else's nonce
  if (Math.abs(now - sentAt) > SEND_WINDOW_MS) return { ok: false, reason: 'stale', message: 'sent_at is more than 5 minutes from the server clock' }
  if (!nonces.claim(key.keyId, nonce, now)) return { ok: false, reason: 'replay', message: 'This message was already accepted' }
  return { ok: true }
}
