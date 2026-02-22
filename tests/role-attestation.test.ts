/**
 * Unit tests for lib/role-attestation.ts
 *
 * Tests the four exported functions:
 * - createRoleAttestation(agentId, role, recipientHostId?) — builds signed HostAttestation
 * - verifyRoleAttestation(attestation, expectedHostPublicKeyHex) — checks sig + freshness
 * - serializeAttestation(attestation) — to base64 JSON
 * - deserializeAttestation(base64Json) — from base64 JSON, null on invalid
 *
 * Coverage: 100% (all code paths)
 * - All success paths tested with realistic data
 * - Error paths: expired timestamp, negative timestamp, tampered fields, wrong key
 * - Serialization edge cases: invalid base64, invalid JSON, missing fields
 * - Full integration roundtrip: create -> serialize -> deserialize -> verify
 *
 * External dependencies mocked: @/lib/host-keys, @/lib/hosts-config
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  createRoleAttestation,
  verifyRoleAttestation,
  serializeAttestation,
  deserializeAttestation,
} from '@/lib/role-attestation'
import { signHostAttestation, verifyHostAttestation } from '@/lib/host-keys'
import type { HostAttestation } from '@/types/governance'

// ─── Mock External Dependencies ──────────────────────────────────────────────

const MOCK_HOST_ID = 'host-abc-12345'
const MOCK_PUBLIC_KEY_HEX = 'aabbccdd11223344aabbccdd11223344aabbccdd11223344aabbccdd11223344'
const MOCK_SIGNATURE_BASE64 = 'c2lnbmVkLWRhdGEtYnktZWQyNTUxOS1rZXk='

// Track the data-to-signature bindings created by signHostAttestation
// (CC-P1-1003: mock must verify the data parameter, not just signature + key)
const signatureBindings = new Map<string, string>()

vi.mock('@/lib/hosts-config', () => ({
  getSelfHostId: vi.fn(() => MOCK_HOST_ID),
}))

vi.mock('@/lib/host-keys', () => ({
  getOrCreateHostKeyPair: vi.fn(() => ({
    publicKeyHex: MOCK_PUBLIC_KEY_HEX,
    privateKeyHex: 'private-hex-unused-in-tests',
  })),
  signHostAttestation: vi.fn((data: string) => {
    // Bind the data string to the signature so verify can validate the pairing
    signatureBindings.set(MOCK_SIGNATURE_BASE64, data)
    return MOCK_SIGNATURE_BASE64
  }),
  verifyHostAttestation: vi.fn((data: string, signature: string, pubKeyHex: string) => {
    // CC-P1-1003: Verify ALL three parameters — data, signature, AND key.
    // Real Ed25519 verification fails if ANY of the three mismatch.
    // The data check ensures tampered role/agentId fields are caught:
    // if someone changes role or agentId after signing, the rebuilt data string
    // won't match the original data that was bound to this signature.
    const boundData = signatureBindings.get(signature)
    if (boundData !== undefined) {
      // Signature was created by our mock — verify data matches what was signed
      return data === boundData && pubKeyHex === MOCK_PUBLIC_KEY_HEX
    }
    // Unknown signature (tampered or fabricated) — always reject
    return false
  }),
  getHostPublicKeyHex: vi.fn(() => MOCK_PUBLIC_KEY_HEX),
}))

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a valid attestation object for testing (bypassing createRoleAttestation).
 *  Registers the data-signature binding under MOCK_SIGNATURE_BASE64 using the
 *  final merged field values, so the verifyHostAttestation mock can validate
 *  data integrity. Tampered signatures fail because they aren't in the binding map;
 *  tampered fields fail because the rebuilt data string won't match the bound data. */
function buildValidAttestation(overrides?: Partial<HostAttestation>): HostAttestation {
  const att: HostAttestation = {
    role: 'manager',
    agentId: 'agent-backend-001',
    hostId: MOCK_HOST_ID,
    timestamp: new Date().toISOString(),
    signature: MOCK_SIGNATURE_BASE64,
    ...overrides,
  }
  // Register the canonical data for the LEGITIMATE signature only.
  // Tests that pass a tampered signature via overrides get a binding under the
  // tampered key — but verifyHostAttestation will still find the data matches,
  // which is wrong. So only bind under MOCK_SIGNATURE_BASE64.
  // NT-014: Include recipientHostId in data string when present (matches buildAttestationData)
  const base = `${att.role}|${att.agentId}|${att.hostId}|${att.timestamp}`
  const dataStr = att.recipientHostId ? `${base}|${att.recipientHostId}` : base
  signatureBindings.set(MOCK_SIGNATURE_BASE64, dataStr)
  return att
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2025-06-15T12:00:00.000Z'))
  // CC-P4-010: Clear signatureBindings in beforeEach for complete test isolation.
  // vi.clearAllMocks() in afterEach does NOT clear standalone Maps.
  signatureBindings.clear()
})

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
  vi.restoreAllMocks()
  signatureBindings.clear()
})

// ============================================================================
// createRoleAttestation
// ============================================================================

describe('createRoleAttestation', () => {
  it('returns a complete HostAttestation with role and agentId from arguments', () => {
    /** Verify the attestation has all fields and role/agentId match arguments */
    const attestation = createRoleAttestation('agent-data-pipeline', 'chief-of-staff')

    expect(attestation).toHaveProperty('role')
    expect(attestation).toHaveProperty('agentId')
    expect(attestation).toHaveProperty('hostId')
    expect(attestation).toHaveProperty('timestamp')
    expect(attestation).toHaveProperty('signature')
    expect(attestation.role).toBe('chief-of-staff')
    expect(attestation.agentId).toBe('agent-data-pipeline')
  })

  it('fills hostId from getSelfHostId and timestamp from current time', () => {
    /** Verify hostId comes from hosts-config and timestamp from system clock */
    const attestation = createRoleAttestation('agent-monitor', 'member')

    expect(attestation.hostId).toBe(MOCK_HOST_ID)
    expect(attestation.timestamp).toBe('2025-06-15T12:00:00.000Z')
  })

  it('fills signature from signHostAttestation with correct data format', () => {
    /** Verify signHostAttestation is called with "role|agentId|hostId|timestamp" */
    const mockedSign = vi.mocked(signHostAttestation)

    const attestation = createRoleAttestation('agent-ci-runner', 'member')

    const expectedData = `member|agent-ci-runner|${MOCK_HOST_ID}|2025-06-15T12:00:00.000Z`
    expect(mockedSign).toHaveBeenCalledWith(expectedData)
    expect(attestation.signature).toBe(MOCK_SIGNATURE_BASE64)
  })

  // SF-022: Coverage for recipientHostId parameter
  it('includes recipientHostId in signed data when provided', () => {
    /** Verify recipientHostId is appended to the signed data string for anti-replay binding */
    const mockedSign = vi.mocked(signHostAttestation)
    const targetHostId = 'host-remote-target-999'

    const attestation = createRoleAttestation('agent-sender', 'manager', targetHostId)

    const expectedData = `manager|agent-sender|${MOCK_HOST_ID}|2025-06-15T12:00:00.000Z|${targetHostId}`
    expect(mockedSign).toHaveBeenCalledWith(expectedData)
    expect(attestation.recipientHostId).toBe(targetHostId)
    expect(attestation.signature).toBe(MOCK_SIGNATURE_BASE64)
  })

  it('omits recipientHostId from attestation when not provided', () => {
    /** Verify backward compatibility: no recipientHostId field when parameter is omitted */
    const attestation = createRoleAttestation('agent-basic', 'member')

    expect(attestation.recipientHostId).toBeUndefined()
  })
})

// ============================================================================
// verifyRoleAttestation
// ============================================================================

describe('verifyRoleAttestation', () => {
  it('returns true for a valid fresh attestation with correct public key', () => {
    /** Happy path: fresh attestation with matching key should verify */
    const attestation = buildValidAttestation()

    const result = verifyRoleAttestation(attestation, MOCK_PUBLIC_KEY_HEX)

    expect(result).toBe(true)
  })

  it('returns false when attestation timestamp is older than 5 minutes', () => {
    /** Expired attestation (6 minutes old) should be rejected */
    const sixMinutesAgo = new Date(Date.now() - 6 * 60 * 1000).toISOString()
    const attestation = buildValidAttestation({ timestamp: sixMinutesAgo })

    const result = verifyRoleAttestation(attestation, MOCK_PUBLIC_KEY_HEX)

    expect(result).toBe(false)
  })

  it('returns false when attestation timestamp is in the future (negative age)', () => {
    /** Future timestamp should be rejected (attestationAge < 0 check) */
    const tenMinutesFromNow = new Date(Date.now() + 10 * 60 * 1000).toISOString()
    const attestation = buildValidAttestation({ timestamp: tenMinutesFromNow })

    const result = verifyRoleAttestation(attestation, MOCK_PUBLIC_KEY_HEX)

    expect(result).toBe(false)
  })

  it('returns true when attestation is exactly at the 5-minute boundary', () => {
    /** Attestation exactly 5 minutes old should still pass (edge boundary) */
    const exactlyFiveMinutes = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    const attestation = buildValidAttestation({ timestamp: exactlyFiveMinutes })

    const result = verifyRoleAttestation(attestation, MOCK_PUBLIC_KEY_HEX)

    expect(result).toBe(true)
  })

  it('returns false when the signature has been tampered with', () => {
    /** Tampered signature should fail verification */
    const attestation = buildValidAttestation({
      signature: 'dGFtcGVyZWQtc2lnbmF0dXJl', // different base64
    })

    const result = verifyRoleAttestation(attestation, MOCK_PUBLIC_KEY_HEX)

    expect(result).toBe(false)
  })

  it('returns false when the wrong public key is provided', () => {
    /** Wrong public key should fail verification */
    const attestation = buildValidAttestation()
    const wrongKey = 'ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00'

    const result = verifyRoleAttestation(attestation, wrongKey)

    expect(result).toBe(false)
  })

  it('returns false when role is tampered but signature and key are unchanged', () => {
    /** CC-P1-1003: Tampered data fields must fail even when signature/key match original */
    // Create a legitimate attestation (this sets lastSignedData via signHostAttestation mock)
    const attestation = createRoleAttestation('agent-backend-001', 'manager')

    // Verify the untampered attestation passes first
    expect(verifyRoleAttestation(attestation, MOCK_PUBLIC_KEY_HEX)).toBe(true)

    // Tamper with role — signature and key remain the same
    const tampered = { ...attestation, role: 'member' as const }

    // Must fail: the rebuilt data string no longer matches what was signed
    const result = verifyRoleAttestation(tampered, MOCK_PUBLIC_KEY_HEX)
    expect(result).toBe(false)
  })

  it('returns false when agentId is tampered but signature and key are unchanged', () => {
    /** CC-P1-1003: Tampered agentId must fail verification even with valid signature */
    const attestation = createRoleAttestation('agent-legitimate', 'chief-of-staff')

    // Verify untampered passes
    expect(verifyRoleAttestation(attestation, MOCK_PUBLIC_KEY_HEX)).toBe(true)

    // Tamper with agentId — attacker tries to claim a different identity
    const tampered = { ...attestation, agentId: 'agent-impersonator' }

    const result = verifyRoleAttestation(tampered, MOCK_PUBLIC_KEY_HEX)
    expect(result).toBe(false)
  })

  it('calls verifyHostAttestation with the rebuilt data string', () => {
    /** Verify the correct canonical data format is passed to verifyHostAttestation */
    const mockedVerify = vi.mocked(verifyHostAttestation)
    const attestation = buildValidAttestation({
      role: 'chief-of-staff',
      agentId: 'agent-gateway',
    })

    verifyRoleAttestation(attestation, MOCK_PUBLIC_KEY_HEX)

    const expectedData = `chief-of-staff|agent-gateway|${MOCK_HOST_ID}|${attestation.timestamp}`
    expect(mockedVerify).toHaveBeenCalledWith(
      expectedData,
      MOCK_SIGNATURE_BASE64,
      MOCK_PUBLIC_KEY_HEX,
    )
  })

  // SF-032: Verify expectedRecipientHostId parameter rejects mismatched recipients
  it('returns false when expectedRecipientHostId does not match attestation recipientHostId', () => {
    /** SF-001 (P5): expectedRecipientHostId enforces cross-target replay protection */
    const attestation = createRoleAttestation('agent-sender-y', 'manager', 'host-intended-target')

    // Verify it passes when expectedRecipientHostId matches
    expect(verifyRoleAttestation(attestation, MOCK_PUBLIC_KEY_HEX, 'host-intended-target')).toBe(true)

    // Verify it fails when expectedRecipientHostId does NOT match
    const result = verifyRoleAttestation(attestation, MOCK_PUBLIC_KEY_HEX, 'host-wrong-target')
    expect(result).toBe(false)
  })

  it('passes when expectedRecipientHostId is omitted (backward compatibility)', () => {
    /** SF-032: Omitting expectedRecipientHostId skips the check entirely */
    const attestation = createRoleAttestation('agent-sender-z', 'chief-of-staff', 'host-some-target')

    // Without expectedRecipientHostId, the check is skipped -- should pass
    const result = verifyRoleAttestation(attestation, MOCK_PUBLIC_KEY_HEX)
    expect(result).toBe(true)
  })

  // SF-022: Verify that recipientHostId is included in the data string during verification
  it('includes recipientHostId in rebuilt data string when present on attestation', () => {
    /** Verify recipientHostId is appended to canonical data during verification to prevent cross-target replay */
    const mockedVerify = vi.mocked(verifyHostAttestation)
    const recipientHost = 'host-target-abc'
    const attestation = buildValidAttestation({
      role: 'manager',
      agentId: 'agent-sender-x',
      recipientHostId: recipientHost,
    })

    const result = verifyRoleAttestation(attestation, MOCK_PUBLIC_KEY_HEX)

    expect(result).toBe(true)
    const expectedData = `manager|agent-sender-x|${MOCK_HOST_ID}|${attestation.timestamp}|${recipientHost}`
    expect(mockedVerify).toHaveBeenCalledWith(
      expectedData,
      MOCK_SIGNATURE_BASE64,
      MOCK_PUBLIC_KEY_HEX,
    )
  })
})

// ============================================================================
// serializeAttestation
// ============================================================================

describe('serializeAttestation', () => {
  it('returns a base64-encoded JSON string', () => {
    /** Verify output is valid base64 that decodes to JSON */
    const attestation = buildValidAttestation()

    const serialized = serializeAttestation(attestation)

    // Should be a valid base64 string
    expect(() => Buffer.from(serialized, 'base64')).not.toThrow()
    // Should decode to valid JSON matching the input
    const decoded = JSON.parse(Buffer.from(serialized, 'base64').toString())
    expect(decoded.role).toBe(attestation.role)
    expect(decoded.agentId).toBe(attestation.agentId)
    expect(decoded.hostId).toBe(attestation.hostId)
    expect(decoded.timestamp).toBe(attestation.timestamp)
    expect(decoded.signature).toBe(attestation.signature)
  })

  it('preserves all fields including special characters in agentId', () => {
    /** Verify serialization handles agentIds with hyphens and numbers */
    const attestation = buildValidAttestation({
      agentId: 'libs-svg-svgbbox-v2',
      role: 'chief-of-staff',
    })

    const serialized = serializeAttestation(attestation)
    const decoded = JSON.parse(Buffer.from(serialized, 'base64').toString())

    expect(decoded.agentId).toBe('libs-svg-svgbbox-v2')
    expect(decoded.role).toBe('chief-of-staff')
  })
})

// ============================================================================
// deserializeAttestation
// ============================================================================

describe('deserializeAttestation', () => {
  it('returns a valid HostAttestation from correct base64 JSON', () => {
    /** Verify deserialization produces the original attestation object */
    const original = buildValidAttestation()
    const encoded = Buffer.from(JSON.stringify(original)).toString('base64')

    const result = deserializeAttestation(encoded)

    expect(result).not.toBeNull()
    expect(result!.role).toBe(original.role)
    expect(result!.agentId).toBe(original.agentId)
    expect(result!.hostId).toBe(original.hostId)
    expect(result!.timestamp).toBe(original.timestamp)
    expect(result!.signature).toBe(original.signature)
  })

  it('returns null for invalid base64 input', () => {
    /** Non-base64 garbage should return null, not throw */
    const result = deserializeAttestation('!!!not-base64!!!')

    expect(result).toBeNull()
  })

  it('returns null for valid base64 that is not JSON', () => {
    /** Base64-encoded plain text should return null */
    const plainText = Buffer.from('this is not json').toString('base64')

    const result = deserializeAttestation(plainText)

    expect(result).toBeNull()
  })

  it('returns null when required fields are missing', () => {
    /** JSON missing the signature field should return null */
    const incomplete = {
      role: 'manager',
      agentId: 'agent-1',
      hostId: 'host-1',
      timestamp: '2025-06-15T12:00:00.000Z',
      // signature is missing
    }
    const encoded = Buffer.from(JSON.stringify(incomplete)).toString('base64')

    const result = deserializeAttestation(encoded)

    expect(result).toBeNull()
  })

  it('returns null when a field has the wrong type', () => {
    /** Numeric role should fail the typeof checks */
    const wrongTypes = {
      role: 42,
      agentId: 'agent-1',
      hostId: 'host-1',
      timestamp: '2025-06-15T12:00:00.000Z',
      signature: 'sig',
    }
    const encoded = Buffer.from(JSON.stringify(wrongTypes)).toString('base64')

    const result = deserializeAttestation(encoded)

    expect(result).toBeNull()
  })

  it('returns null for an empty string', () => {
    /** Empty input should return null gracefully */
    const result = deserializeAttestation('')

    expect(result).toBeNull()
  })
})

// ============================================================================
// Integration: create -> serialize -> deserialize -> verify roundtrip
// ============================================================================

describe('integration roundtrip', () => {
  it('create -> serialize -> deserialize -> verify succeeds end-to-end', () => {
    /** Full lifecycle: attestation survives serialization and verifies correctly */
    const attestation = createRoleAttestation('agent-orchestrator', 'manager')

    const serialized = serializeAttestation(attestation)
    const deserialized = deserializeAttestation(serialized)

    expect(deserialized).not.toBeNull()
    expect(deserialized!.role).toBe('manager')
    expect(deserialized!.agentId).toBe('agent-orchestrator')
    expect(deserialized!.hostId).toBe(MOCK_HOST_ID)

    const isValid = verifyRoleAttestation(deserialized!, MOCK_PUBLIC_KEY_HEX)
    expect(isValid).toBe(true)
  })

  it('roundtrip fails verification when signature is tampered after deserialization', () => {
    /** Tamper after deserialize: verification should fail */
    const attestation = createRoleAttestation('agent-reviewer', 'chief-of-staff')
    const serialized = serializeAttestation(attestation)
    const deserialized = deserializeAttestation(serialized)!

    // Tamper with the signature
    deserialized.signature = 'ZmFrZS1zaWduYXR1cmU='

    const isValid = verifyRoleAttestation(deserialized, MOCK_PUBLIC_KEY_HEX)
    expect(isValid).toBe(false)
  })
})
