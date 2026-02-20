/**
 * Unit tests for lib/host-keys.ts
 *
 * Tests the Ed25519 host-level keypair management used for cross-host
 * identity attestation in the mesh network.
 *
 * Coverage: 15 tests covering all 4 exported functions + internal logic
 * - getOrCreateHostKeyPair: generation, loading, caching
 * - getHostPublicKeyHex: convenience wrapper
 * - signHostAttestation: signing with real crypto
 * - verifyHostAttestation: verification, tampered data, wrong key, error handling
 * - Edge cases: empty data, very long data
 *
 * Mocking strategy: Only the 'fs' module is mocked (external I/O).
 * All crypto operations run for real to ensure actual correctness.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import crypto from 'crypto'
import path from 'path'
import os from 'os'

// ============================================================================
// Mocks — only external I/O (filesystem)
// ============================================================================

let fsStore: Record<string, string> = {}

vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn((filePath: string) => filePath in fsStore),
    mkdirSync: vi.fn(),
    readFileSync: vi.fn((filePath: string) => {
      if (filePath in fsStore) return fsStore[filePath]
      throw new Error(`ENOENT: no such file or directory, open '${filePath}'`)
    }),
    writeFileSync: vi.fn((filePath: string, data: string) => {
      fsStore[filePath] = data
    }),
    renameSync: vi.fn((oldPath: string, newPath: string) => {
      if (oldPath in fsStore) {
        fsStore[newPath] = fsStore[oldPath]
        delete fsStore[oldPath]
      } else {
        throw new Error(`ENOENT: no such file or directory, rename '${oldPath}'`)
      }
    }),
  },
}))

// Derived paths matching the module's constants
const HOST_KEYS_DIR = path.join(os.homedir(), '.aimaestro', 'host-keys')
const PRIVATE_KEY_PATH = path.join(HOST_KEYS_DIR, 'private.hex')
const PUBLIC_KEY_PATH = path.join(HOST_KEYS_DIR, 'public.hex')

// ============================================================================
// Setup — clear fs store AND module cache before each test
// ============================================================================

beforeEach(async () => {
  fsStore = {}
  vi.clearAllMocks()

  // Reset the in-memory cached keypair inside the module by re-importing.
  // vi.resetModules() forces vitest to re-evaluate the module, which resets
  // the module-level `cachedKeyPair` variable back to null.
  vi.resetModules()
})

/**
 * Helper: dynamically import the module fresh (after resetModules).
 * This ensures each test starts with cachedKeyPair = null.
 */
async function importHostKeys() {
  const mod = await import('@/lib/host-keys')
  return mod
}

// ============================================================================
// getOrCreateHostKeyPair — Key Generation
// ============================================================================

describe('getOrCreateHostKeyPair', () => {
  it('generates a new keypair when no keys exist on disk', async () => {
    /** First call with empty fs should generate and persist keys */
    const { getOrCreateHostKeyPair } = await importHostKeys()

    const keyPair = getOrCreateHostKeyPair()

    // Keys must be non-empty hex strings
    expect(keyPair.publicKeyHex).toMatch(/^[a-f0-9]+$/)
    expect(keyPair.privateKeyHex).toMatch(/^[a-f0-9]+$/)

    // Ed25519 SPKI DER public key = 44 bytes = 88 hex chars
    expect(keyPair.publicKeyHex.length).toBe(88)
    // Ed25519 PKCS8 DER private key = 48 bytes = 96 hex chars
    expect(keyPair.privateKeyHex.length).toBe(96)
  })

  it('returns the same keys on subsequent calls (from cache)', async () => {
    /** Second call should return cached keypair, identical object reference */
    const { getOrCreateHostKeyPair } = await importHostKeys()

    const first = getOrCreateHostKeyPair()
    const second = getOrCreateHostKeyPair()

    // Same object reference proves cache is used
    expect(first).toBe(second)
    expect(first.publicKeyHex).toBe(second.publicKeyHex)
    expect(first.privateKeyHex).toBe(second.privateKeyHex)
  })

  it('loads existing keys from disk instead of regenerating', async () => {
    /** Pre-populate fs with valid keys, verify module loads them */

    // Generate a real keypair to pre-populate the fs store
    const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519', {
      publicKeyEncoding: { type: 'spki', format: 'der' },
      privateKeyEncoding: { type: 'pkcs8', format: 'der' },
    })
    const existingPrivateHex = (privateKey as Buffer).toString('hex')
    const existingPublicHex = (publicKey as Buffer).toString('hex')

    fsStore[PRIVATE_KEY_PATH] = existingPrivateHex
    fsStore[PUBLIC_KEY_PATH] = existingPublicHex

    const { getOrCreateHostKeyPair } = await importHostKeys()
    const keyPair = getOrCreateHostKeyPair()

    // Must match the pre-populated keys, not generate new ones
    expect(keyPair.privateKeyHex).toBe(existingPrivateHex)
    expect(keyPair.publicKeyHex).toBe(existingPublicHex)
  })

  it('regenerates keys when existing files are corrupt (too short)', async () => {
    /** Corrupt key files (too short) should trigger regeneration */
    fsStore[PRIVATE_KEY_PATH] = 'abcd' // Way too short for a valid DER key
    fsStore[PUBLIC_KEY_PATH] = 'ef01'

    const { getOrCreateHostKeyPair } = await importHostKeys()
    const keyPair = getOrCreateHostKeyPair()

    // Should have generated fresh valid-length keys
    expect(keyPair.publicKeyHex.length).toBe(88)
    expect(keyPair.privateKeyHex.length).toBe(96)
    // The corrupt values should be replaced
    expect(keyPair.privateKeyHex).not.toBe('abcd')
  })
})

// ============================================================================
// Key Persistence — atomic write pattern
// ============================================================================

describe('key persistence', () => {
  it('writes keys to disk using atomic rename pattern', async () => {
    /** Keys should be written via tmp file then renamed for crash safety */
    const fs = (await import('fs')).default

    const { getOrCreateHostKeyPair } = await importHostKeys()
    getOrCreateHostKeyPair()

    // writeFileSync should have been called for the .tmp files
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      PRIVATE_KEY_PATH + '.tmp',
      expect.stringMatching(/^[a-f0-9]+$/),
      { mode: 0o600 }
    )
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      PUBLIC_KEY_PATH + '.tmp',
      expect.stringMatching(/^[a-f0-9]+$/),
      { mode: 0o600 }
    )

    // renameSync should have been called to atomically move tmp to final
    expect(fs.renameSync).toHaveBeenCalledWith(
      PRIVATE_KEY_PATH + '.tmp',
      PRIVATE_KEY_PATH
    )
    expect(fs.renameSync).toHaveBeenCalledWith(
      PUBLIC_KEY_PATH + '.tmp',
      PUBLIC_KEY_PATH
    )
  })

  it('creates the host-keys directory if it does not exist', async () => {
    /** ensureHostKeysDir should call mkdirSync when dir is missing */
    const fs = (await import('fs')).default

    const { getOrCreateHostKeyPair } = await importHostKeys()
    getOrCreateHostKeyPair()

    expect(fs.mkdirSync).toHaveBeenCalledWith(
      HOST_KEYS_DIR,
      { recursive: true, mode: 0o700 }
    )
  })
})

// ============================================================================
// getHostPublicKeyHex
// ============================================================================

describe('getHostPublicKeyHex', () => {
  it('returns only the public key hex string', async () => {
    /** Convenience wrapper should return just the public key portion */
    const { getHostPublicKeyHex, getOrCreateHostKeyPair } = await importHostKeys()

    const fullPair = getOrCreateHostKeyPair()
    const pubHex = getHostPublicKeyHex()

    expect(pubHex).toBe(fullPair.publicKeyHex)
    expect(pubHex.length).toBe(88)
  })
})

// ============================================================================
// signHostAttestation — real crypto signing
// ============================================================================

describe('signHostAttestation', () => {
  it('produces a valid base64 signature for given data', async () => {
    /** Signature must be non-empty base64 that decodes to 64 bytes (Ed25519) */
    const { signHostAttestation } = await importHostKeys()

    const signature = signHostAttestation('hello world')

    // Must be valid base64
    expect(signature).toMatch(/^[A-Za-z0-9+/]+=*$/)

    // Ed25519 signatures are always 64 bytes
    const sigBuffer = Buffer.from(signature, 'base64')
    expect(sigBuffer.length).toBe(64)
  })

  it('produces different signatures for different data', async () => {
    /** Different input data must produce different signatures */
    const { signHostAttestation } = await importHostKeys()

    const sig1 = signHostAttestation('message one')
    const sig2 = signHostAttestation('message two')

    expect(sig1).not.toBe(sig2)
  })
})

// ============================================================================
// verifyHostAttestation — real crypto verification
// ============================================================================

describe('verifyHostAttestation', () => {
  it('returns true for a valid signature matching data and key', async () => {
    /** Sign then verify with same key — must succeed */
    const { signHostAttestation, verifyHostAttestation, getHostPublicKeyHex } =
      await importHostKeys()

    const data = 'attestation payload for mesh network'
    const signature = signHostAttestation(data)
    const pubKeyHex = getHostPublicKeyHex()

    const result = verifyHostAttestation(data, signature, pubKeyHex)
    expect(result).toBe(true)
  })

  it('returns false when data has been tampered with', async () => {
    /** Modifying signed data must cause verification to fail */
    const { signHostAttestation, verifyHostAttestation, getHostPublicKeyHex } =
      await importHostKeys()

    const data = 'original attestation data'
    const signature = signHostAttestation(data)
    const pubKeyHex = getHostPublicKeyHex()

    const result = verifyHostAttestation('tampered attestation data', signature, pubKeyHex)
    expect(result).toBe(false)
  })

  it('returns false when verified with a different public key', async () => {
    /** Signature from key A must not verify with key B */
    const { signHostAttestation, verifyHostAttestation } = await importHostKeys()

    const data = 'data signed by host A'
    const signature = signHostAttestation(data)

    // Generate a completely different keypair to simulate another host
    const { publicKey: otherPubKey } = crypto.generateKeyPairSync('ed25519', {
      publicKeyEncoding: { type: 'spki', format: 'der' },
      privateKeyEncoding: { type: 'pkcs8', format: 'der' },
    })
    const otherPubKeyHex = (otherPubKey as Buffer).toString('hex')

    const result = verifyHostAttestation(data, signature, otherPubKeyHex)
    expect(result).toBe(false)
  })

  it('returns false for malformed signature input without throwing', async () => {
    /** Invalid base64 or garbage signature should return false, not throw */
    const { verifyHostAttestation, getHostPublicKeyHex } = await importHostKeys()

    const pubKeyHex = getHostPublicKeyHex()
    const result = verifyHostAttestation('some data', 'not-valid-base64!!!', pubKeyHex)
    expect(result).toBe(false)
  })
})

// ============================================================================
// Edge Cases
// ============================================================================

describe('edge cases', () => {
  it('signs and verifies empty string data', async () => {
    /** Empty string is a valid input — must sign and verify correctly */
    const { signHostAttestation, verifyHostAttestation, getHostPublicKeyHex } =
      await importHostKeys()

    const signature = signHostAttestation('')
    const pubKeyHex = getHostPublicKeyHex()

    // Ed25519 signature should still be 64 bytes
    const sigBuffer = Buffer.from(signature, 'base64')
    expect(sigBuffer.length).toBe(64)

    // Must verify
    expect(verifyHostAttestation('', signature, pubKeyHex)).toBe(true)

    // Must NOT verify against non-empty data
    expect(verifyHostAttestation('non-empty', signature, pubKeyHex)).toBe(false)
  })

  it('signs and verifies very long data (100KB)', async () => {
    /** Large payloads must be handled without error */
    const { signHostAttestation, verifyHostAttestation, getHostPublicKeyHex } =
      await importHostKeys()

    // 100KB of realistic-ish data
    const longData = 'A'.repeat(100_000) + '\n' + JSON.stringify({ ts: '2025-01-01T00:00:00Z', host: 'mesh-node-42' })
    const signature = signHostAttestation(longData)
    const pubKeyHex = getHostPublicKeyHex()

    // Signature is still exactly 64 bytes (Ed25519 is fixed-size)
    const sigBuffer = Buffer.from(signature, 'base64')
    expect(sigBuffer.length).toBe(64)

    // Must verify correctly
    expect(verifyHostAttestation(longData, signature, pubKeyHex)).toBe(true)

    // Slightly modified long data must fail
    const tamperedLong = 'B' + longData.slice(1)
    expect(verifyHostAttestation(tamperedLong, signature, pubKeyHex)).toBe(false)
  })
})
