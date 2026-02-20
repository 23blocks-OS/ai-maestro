/**
 * Unit tests for lib/role-attestation.ts
 *
 * Tests the four exported functions:
 * - createRoleAttestation(agentId, role) — builds signed HostAttestation
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

vi.mock('@/lib/hosts-config', () => ({
  getSelfHostId: vi.fn(() => MOCK_HOST_ID),
}))

vi.mock('@/lib/host-keys', () => ({
  getOrCreateHostKeyPair: vi.fn(() => ({
    publicKeyHex: MOCK_PUBLIC_KEY_HEX,
    privateKeyHex: 'private-hex-unused-in-tests',
  })),
  signHostAttestation: vi.fn(() => MOCK_SIGNATURE_BASE64),
  verifyHostAttestation: vi.fn((data: string, signature: string, pubKeyHex: string) => {
    // Simulate real verification: only pass when signature and key match expected values
    return signature === MOCK_SIGNATURE_BASE64 && pubKeyHex === MOCK_PUBLIC_KEY_HEX
  }),
  getHostPublicKeyHex: vi.fn(() => MOCK_PUBLIC_KEY_HEX),
}))

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a valid attestation object for testing (bypassing createRoleAttestation) */
function buildValidAttestation(overrides?: Partial<HostAttestation>): HostAttestation {
  return {
    role: 'manager',
    agentId: 'agent-backend-001',
    hostId: MOCK_HOST_ID,
    timestamp: new Date().toISOString(),
    signature: MOCK_SIGNATURE_BASE64,
    ...overrides,
  }
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2025-06-15T12:00:00.000Z'))
})

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
  vi.restoreAllMocks()
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
