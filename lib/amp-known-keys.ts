/**
 * AMP Identity Conflict Detection (key-swap / TOFU ledger).
 *
 * Implements the normative control in AMP spec 07-security "Identity Conflict
 * Detection": maintain a local cache of each address's last-known public-key
 * fingerprint, and refuse to communicate with an address whose key changed
 * unexpectedly (`key_conflict`, HTTP 409). First contact is Trust-On-First-Use.
 *
 * This is the control that would have caught the fleet contamination where 71
 * agents' keys were silently overwritten with one shared key — an unexplained
 * fingerprint change for every one of them.
 *
 * A legitimate key rotation (old key signs new key, per 07-security "Key
 * Revocation") calls `rotateKnownKey()` to update the ledger; anything else is a
 * conflict the operator must resolve.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export type KeyStatus = 'ok' | 'first_contact' | 'conflict'
export interface KeyCheck {
  status: KeyStatus
  knownFingerprint?: string
  presented: string
}
interface Entry { fingerprint: string; firstSeen: string; lastSeen: string }
type Ledger = Record<string, Entry>

function ledgerPath(base?: string): string {
  const root = base || process.env.AIMAESTRO_KNOWN_KEYS_DIR || path.join(os.homedir(), '.aimaestro', 'amp')
  return path.join(root, 'known-keys.json')
}
function load(base?: string): Ledger {
  try { return JSON.parse(fs.readFileSync(ledgerPath(base), 'utf8')) } catch { return {} }
}
let saveSeq = 0
function save(l: Ledger, base?: string): void {
  const p = ledgerPath(base)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  // atomic write: temp file + rename, so a concurrent reader never sees a
  // half-written ledger. (pid+counter keeps the temp name unique without a clock.)
  const tmp = `${p}.tmp-${process.pid}-${saveSeq++}`
  fs.writeFileSync(tmp, JSON.stringify(l, null, 2))
  fs.renameSync(tmp, p)
}

/** Pure classification — testable without the filesystem. */
export function classifyKey(known: string | undefined, presented: string): KeyStatus {
  if (!known) return 'first_contact'
  return known === presented ? 'ok' : 'conflict'
}

/** Check a presented fingerprint for an address against the ledger. Read-only. */
export function checkKnownKey(address: string, fingerprint: string, base?: string): KeyCheck {
  const known = load(base)[address.toLowerCase()]?.fingerprint
  return { status: classifyKey(known, fingerprint), knownFingerprint: known, presented: fingerprint }
}

/**
 * Record a fingerprint for an address. Persists only on first contact (TOFU); the
 * `ok` path is a no-op write to keep this off the per-message hot path. Refuses to
 * silently overwrite a DIFFERENT fingerprint (that is a conflict — use
 * rotateKnownKey after verifying rotation proof). Returns the status that applied.
 */
export function recordKnownKey(address: string, fingerprint: string, now: string, base?: string): KeyStatus {
  const l = load(base)
  const k = address.toLowerCase()
  const status = classifyKey(l[k]?.fingerprint, fingerprint)
  if (status === 'first_contact') { l[k] = { fingerprint, firstSeen: now, lastSeen: now }; save(l, base) }
  // 'ok'       → already known, no write (avoid a disk write on every message)
  // 'conflict' → do NOT overwrite; caller handles (refuse + alert)
  return status
}

/** Explicit, authorized rotation (old key signed the new key). Updates the ledger. */
export function rotateKnownKey(address: string, newFingerprint: string, now: string, base?: string): void {
  const l = load(base)
  const k = address.toLowerCase()
  const firstSeen = l[k]?.firstSeen || now
  l[k] = { fingerprint: newFingerprint, firstSeen, lastSeen: now }
  save(l, base)
}
