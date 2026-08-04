/**
 * AMP key revocation list (AMP spec 07-security §Key Revocation).
 *
 * Providers MUST maintain a revocation list of public-key fingerprints and MUST
 * reject messages signed with a revoked key (`key_revoked`, HTTP 403). A key is
 * revoked when it is rotated (superseded) or explicitly revoked on compromise.
 * Entries are retained for at least 90 days. Together with rotation-with-proof
 * (rotateKeypair) this makes a compromised key actually killable — the missing
 * half of the rotation story.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export type RevocationReason = 'key_compromise' | 'key_rotation' | 'agent_deregistered' | 'admin_action'
export interface RevocationEntry {
  fingerprint: string
  agent_address: string
  revoked_at: string
  reason: RevocationReason
  superseded_by: string | null
}
type List = Record<string, RevocationEntry>

const RETENTION_MS = 90 * 24 * 60 * 60 * 1000   // spec: >= 90 days

function listPath(base?: string): string {
  const root = base || process.env.AIMAESTRO_REVOCATION_DIR || path.join(os.homedir(), '.aimaestro', 'amp')
  return path.join(root, 'revoked-keys.json')
}
function load(base?: string): List {
  try { return JSON.parse(fs.readFileSync(listPath(base), 'utf8')) } catch { return {} }
}
let saveSeq = 0
function save(l: List, base?: string): void {
  const p = listPath(base)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  const tmp = `${p}.tmp-${process.pid}-${saveSeq++}`
  fs.writeFileSync(tmp, JSON.stringify(l, null, 2))
  fs.renameSync(tmp, p)
}

/** Prune entries older than the retention window. Returns the pruned list. */
function prune(l: List, nowMs: number): List {
  for (const [fp, e] of Object.entries(l)) {
    if (nowMs - Date.parse(e.revoked_at) > RETENTION_MS) delete l[fp]
  }
  return l
}

/** Add a fingerprint to the revocation list. `now`/`base` injectable for tests. */
export function revokeFingerprint(
  fingerprint: string, agentAddress: string, reason: RevocationReason,
  supersededBy: string | null, now: string, base?: string
): void {
  if (!fingerprint) return
  const l = prune(load(base), Date.parse(now))
  l[fingerprint] = { fingerprint, agent_address: agentAddress, revoked_at: now, reason, superseded_by: supersededBy }
  save(l, base)
}

/** Is this fingerprint revoked? Checked at route + federation-deliver time. */
export function isRevoked(fingerprint: string | undefined | null, base?: string): boolean {
  if (!fingerprint) return false
  return !!load(base)[fingerprint]
}

/** The current revocation list (for the API / federation propagation). */
export function getRevocationList(base?: string): RevocationEntry[] {
  return Object.values(load(base))
}
