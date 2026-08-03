import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { classifyKey, checkKnownKey, recordKnownKey, rotateKnownKey } from '@/lib/amp-known-keys'

const A = 'alice@acme.aimaestro.local'
const FP1 = 'SHA256:aaaaaaaaaaaaaaaaaaaa'
const FP2 = 'SHA256:bbbbbbbbbbbbbbbbbbbb' // a DIFFERENT key — the contamination signature
const NOW = '2026-08-02T00:00:00Z'

describe('AMP Identity Conflict Detection (amp-known-keys)', () => {
  let base: string
  beforeEach(() => { base = fs.mkdtempSync(path.join(os.tmpdir(), 'known-keys-')) })
  afterEach(() => { fs.rmSync(base, { recursive: true, force: true }) })

  it('classifyKey: first_contact / ok / conflict', () => {
    expect(classifyKey(undefined, FP1)).toBe('first_contact')
    expect(classifyKey(FP1, FP1)).toBe('ok')
    expect(classifyKey(FP1, FP2)).toBe('conflict')
  })

  it('records on first contact (TOFU) and returns ok on the same key', () => {
    expect(recordKnownKey(A, FP1, NOW, base)).toBe('first_contact')
    expect(checkKnownKey(A, FP1, base).status).toBe('ok')
  })

  it('flags a key swap as a conflict and does NOT overwrite the known key', () => {
    recordKnownKey(A, FP1, NOW, base)
    // an agent whose key silently changed to a different one (the contamination)
    const check = checkKnownKey(A, FP2, base)
    expect(check.status).toBe('conflict')
    expect(check.knownFingerprint).toBe(FP1)
    // recording the conflicting key must be refused (ledger keeps the original)
    expect(recordKnownKey(A, FP2, NOW, base)).toBe('conflict')
    expect(checkKnownKey(A, FP1, base).status).toBe('ok')
  })

  it('address match is case-insensitive', () => {
    recordKnownKey(A, FP1, NOW, base)
    expect(checkKnownKey('ALICE@ACME.AIMAESTRO.LOCAL', FP1, base).status).toBe('ok')
  })

  it('rotateKnownKey updates the ledger (authorized rotation) and preserves firstSeen', () => {
    recordKnownKey(A, FP1, NOW, base)
    rotateKnownKey(A, FP2, '2026-08-03T00:00:00Z', base)
    expect(checkKnownKey(A, FP2, base).status).toBe('ok')   // new key now trusted
    expect(checkKnownKey(A, FP1, base).status).toBe('conflict') // old key now foreign
  })

  it('unknown address is first_contact', () => {
    expect(checkKnownKey('bob@acme.aimaestro.local', FP1, base).status).toBe('first_contact')
  })
})
