import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { revokeFingerprint, isRevoked, getRevocationList } from '@/lib/amp-revocation'

const FP = 'SHA256:oldkeyfingerprint000'
const NEW = 'SHA256:newkeyfingerprint000'
const ADDR = 'alice@acme.aimaestro.local'
const NOW = '2026-08-03T00:00:00Z'

describe('AMP key revocation list (amp-revocation)', () => {
  let base: string
  beforeEach(() => { base = fs.mkdtempSync(path.join(os.tmpdir(), 'revoke-')) })
  afterEach(() => { fs.rmSync(base, { recursive: true, force: true }) })

  it('a key is not revoked until it is added', () => {
    expect(isRevoked(FP, base)).toBe(false)
  })

  it('revoking a fingerprint makes isRevoked true', () => {
    revokeFingerprint(FP, ADDR, 'key_rotation', NEW, NOW, base)
    expect(isRevoked(FP, base)).toBe(true)
    expect(isRevoked(NEW, base)).toBe(false)   // the superseding key is NOT revoked
  })

  it('records the full revocation record', () => {
    revokeFingerprint(FP, ADDR, 'key_compromise', null, NOW, base)
    const [e] = getRevocationList(base)
    expect(e).toMatchObject({ fingerprint: FP, agent_address: ADDR, reason: 'key_compromise', superseded_by: null, revoked_at: NOW })
  })

  it('prunes entries older than the 90-day retention window', () => {
    revokeFingerprint(FP, ADDR, 'key_rotation', NEW, '2026-01-01T00:00:00Z', base)  // >90d before NOW2
    const NOW2 = '2026-08-03T00:00:00Z'
    // a fresh revoke triggers prune; the old entry should be gone
    revokeFingerprint('SHA256:another', ADDR, 'admin_action', null, NOW2, base)
    expect(isRevoked(FP, base)).toBe(false)          // pruned (older than 90d)
    expect(isRevoked('SHA256:another', base)).toBe(true)
  })

  it('empty/undefined fingerprint is never revoked and never stored', () => {
    expect(isRevoked(undefined, base)).toBe(false)
    revokeFingerprint('', ADDR, 'admin_action', null, NOW, base)
    expect(getRevocationList(base).length).toBe(0)
  })
})
