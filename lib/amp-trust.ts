/**
 * AMP message trust: one place that knows how a message is signed, how a
 * signature is checked, and which trust level the result earns.
 *
 * Protocol 07-security: a receiver verifies the Ed25519 signature against the
 * sender's registered public key and classifies the message as `verified`
 * (same tenant), `external` (other tenant or provider) or `untrusted`
 * (signature invalid, missing, or not checkable).
 *
 * The result is written into the stored message as `local.verification`, so
 * whoever reads it (amp-read, amp-inbox, the dashboard) sees the same answer.
 */

import crypto from 'crypto'
import { canonicalStringify } from '@/lib/amp-canonical-json'
import { verifySignature, calculateFingerprint } from '@/lib/amp-keys'

/** How the check came out. `unverified` = nothing to check against; `bad` = checked and wrong. */
export type VerifyState = 'verified' | 'unverified' | 'bad'
export type TrustLevel = 'verified' | 'external' | 'untrusted'
/** Which path delivered the message. */
export type VerifyMethod = 'route' | 'mesh-forwarded' | 'federation'

export interface VerificationRecord {
  state: VerifyState
  trust: TrustLevel
  method: VerifyMethod
  /** Why the state is not `verified` (no_signature, no_key, ...). */
  reason?: string
  /** Fingerprint of the key the signature was checked against. */
  key_fingerprint?: string
  /** sha256 (base64) of the payload as signed, before any wrapping. */
  payload_sha256: string
  checked_at: string
}

export interface SignedFields {
  from: string
  to: string
  subject: string
  priority?: string
  in_reply_to?: string | null
  payload: unknown
}

export function payloadHash(payload: unknown): string {
  return crypto.createHash('sha256').update(canonicalStringify(payload)).digest('base64')
}

/** The text a sender signs: from|to|subject|priority|in_reply_to|sha256(payload). */
export function signingString(f: SignedFields): string {
  return [f.from, f.to, f.subject, f.priority || 'normal', f.in_reply_to || '', payloadHash(f.payload)].join('|')
}

export type SignatureCheck = 'verified' | 'bad' | 'unsigned' | 'no_key'

export function checkSignature(f: SignedFields, signature: string | undefined | null, publicHex: string | undefined | null): SignatureCheck {
  if (!signature) return 'unsigned'
  if (!publicHex) return 'no_key'
  return verifySignature(signingString(f), signature, publicHex) ? 'verified' : 'bad'
}

/** The tenant part of `name@tenant.provider`, lower-cased; '' when it does not parse. */
export function tenantOf(address: string): string {
  const m = /^[^@]+@([^.]+)\./.exec(address || '')
  return m ? m[1].toLowerCase() : ''
}

/** Protocol 07 trust algorithm. */
export function trustFor(check: SignatureCheck, sameTenant: boolean): TrustLevel {
  if (check !== 'verified') return 'untrusted'
  return sameTenant ? 'verified' : 'external'
}

export function buildVerification(opts: {
  check: SignatureCheck
  sameTenant: boolean
  method: VerifyMethod
  fields: SignedFields
  publicHex?: string | null
  now?: string
}): VerificationRecord {
  const { check, sameTenant, method, fields, publicHex } = opts
  const state: VerifyState = check === 'verified' ? 'verified' : check === 'bad' ? 'bad' : 'unverified'
  return {
    state,
    trust: trustFor(check, sameTenant),
    method,
    ...(state === 'verified' ? {} : { reason: check === 'bad' ? 'signature_mismatch' : check === 'unsigned' ? 'no_signature' : 'no_key' }),
    ...(publicHex ? { key_fingerprint: calculateFingerprint(publicHex) } : {}),
    payload_sha256: payloadHash(fields.payload),
    checked_at: opts.now || new Date().toISOString(),
  }
}
