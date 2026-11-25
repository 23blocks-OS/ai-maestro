/**
 * Proof of possession for registering a name that already exists (AMP spec 03, "Registering an Existing Name").
 *
 * POST /api/v1/register for a registered name re-issues an API key only to the agent itself: its own session,
 * its API key, or a proof signed by the registered Ed25519 private key (services/amp-service.ts). A public key
 * is public (the API serves it and every message names it), so the key alone proves nothing.
 *
 *   sign_input = "amp-register-proof\n" + unix_timestamp + "\n" + provider + "\n" + tenant + "\n" + name + "\n" + fingerprint
 *   proof      = base64url(signature (64 bytes) + timestamp), no padding
 *
 * provider is this host's provider name (GET /v1/info `provider`); tenant and name lowercased; fingerprint
 * the registered key's (`SHA256:<base64>`). Timestamp within 5 minutes. An accepted proof is remembered until
 * it leaves the window and refused when sent again; a refused proof is never remembered, so a stranger
 * cannot spend another agent's proof by sending it with a wrong name.
 */

import crypto from 'crypto'

export const PROOF_DOMAIN = 'amp-register-proof\n'
export const PROOF_WINDOW_MS = 5 * 60 * 1000

export interface ProofSubject {
  provider: string
  tenant: string
  name: string
  fingerprint: string
}

/** The bytes the registered key signs (spec 03) */
export function registerSignInput(s: ProofSubject, timestamp: string): string {
  return PROOF_DOMAIN + [timestamp, s.provider, s.tenant.toLowerCase(), s.name.toLowerCase(), s.fingerprint].join('\n')
}

/** Builds a proof; used by tests and by clients written in TypeScript */
export function makeRegisterProof(privateKey: crypto.KeyObject, s: ProofSubject, timestamp: string = String(Math.floor(Date.now() / 1000))): string {
  const sig = crypto.sign(null, Buffer.from(registerSignInput(s, timestamp), 'utf8'), privateKey)
  return Buffer.concat([sig, Buffer.from(timestamp, 'utf8')]).toString('base64url')
}

/**
 * Accepted proofs, kept until their timestamp leaves the window.
 * shortcut: per process, so a restart within 5 minutes of a proof forgets it; persist it if that ever matters.
 */
export class UsedProofs {
  private used = new Map<string, number>()

  /** False when the proof was accepted before (and is still in the window) */
  claim(proof: string, timestampMs: number, now: number): boolean {
    for (const [p, at] of this.used) if (Math.abs(now - at) > PROOF_WINDOW_MS) this.used.delete(p)
    if (this.used.has(proof)) return false
    this.used.set(proof, timestampMs)
    return true
  }
}

// globalThis: the Next routes and the headless router load this module separately
const g = globalThis as { _ampUsedRegisterProofs?: UsedProofs }
export const usedRegisterProofs = (): UsedProofs => (g._ampUsedRegisterProofs ??= new UsedProofs())

export type ProofCheck = { ok: true } | { ok: false; message: string }

const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex')

/** Checks a proof against the registered key (`publicKeyHex`, whose fingerprint is `subject.fingerprint`) */
export function checkRegisterProof(opts: {
  proof: unknown
  subject: ProofSubject
  publicKeyHex: string
  now?: number
  used?: UsedProofs
}): ProofCheck {
  const now = opts.now ?? Date.now()
  const refused = (message: string): ProofCheck => ({ ok: false, message })
  if (typeof opts.proof !== 'string' || !/^[A-Za-z0-9_-]+$/.test(opts.proof)) return refused('proof must be a base64url string')
  const bytes = Buffer.from(opts.proof, 'base64url')
  if (bytes.length <= 64) return refused('proof must be the 64-byte signature followed by the timestamp')
  const timestamp = bytes.subarray(64).toString('utf8')
  if (!/^\d{1,12}$/.test(timestamp)) return refused('the proof timestamp must be a unix time in seconds')
  const tsMs = Number(timestamp) * 1000
  if (Math.abs(now - tsMs) > PROOF_WINDOW_MS) return refused('the proof timestamp is more than 5 minutes from the server clock')
  let valid = false
  try {
    const raw = Buffer.from(opts.publicKeyHex, 'hex')
    if (raw.length === 32) {
      const key = crypto.createPublicKey({ key: Buffer.concat([ED25519_SPKI_PREFIX, raw]), format: 'der', type: 'spki' })
      valid = crypto.verify(null, Buffer.from(registerSignInput(opts.subject, timestamp), 'utf8'), key, bytes.subarray(0, 64))
    }
  } catch { valid = false }
  if (!valid) return refused('the proof does not verify with the registered key for this provider, tenant and name')
  if (!(opts.used ?? usedRegisterProofs()).claim(opts.proof, tsMs, now)) return refused('this proof was already used')
  return { ok: true }
}
