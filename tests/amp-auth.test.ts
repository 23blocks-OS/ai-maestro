import { describe, it, expect } from 'vitest'
import {
  hashApiKey,
  verifyApiKeyHash,
  generateApiKey,
  isValidApiKeyFormat,
  extractApiKeyFromHeader,
} from '@/lib/amp-auth'

// ============================================================================
// hashApiKey
// ============================================================================

describe('hashApiKey', () => {
  it('produces a sha256-prefixed hash', () => {
    const hash = hashApiKey('test-key')
    expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/)
  })

  it('produces deterministic output', () => {
    const hash1 = hashApiKey('same-key')
    const hash2 = hashApiKey('same-key')
    expect(hash1).toBe(hash2)
  })

  it('produces different hashes for different keys', () => {
    const hash1 = hashApiKey('key-one')
    const hash2 = hashApiKey('key-two')
    expect(hash1).not.toBe(hash2)
  })
})

// ============================================================================
// verifyApiKeyHash
// ============================================================================

describe('verifyApiKeyHash', () => {
  it('returns true for matching key and hash', () => {
    const key = 'my-secret-key'
    const hash = hashApiKey(key)
    expect(verifyApiKeyHash(key, hash)).toBe(true)
  })

  it('returns false for non-matching key', () => {
    const hash = hashApiKey('correct-key')
    expect(verifyApiKeyHash('wrong-key', hash)).toBe(false)
  })
})

// ============================================================================
// generateApiKey
// ============================================================================

describe('generateApiKey', () => {
  it('generates a live key by default', () => {
    const key = generateApiKey()
    expect(key).toMatch(/^amp_live_sk_[a-f0-9]{64}$/)
  })

  it('generates a test key when isTest=true', () => {
    const key = generateApiKey(true)
    expect(key).toMatch(/^amp_test_sk_[a-f0-9]{64}$/)
  })

  it('generates unique keys each time', () => {
    const key1 = generateApiKey()
    const key2 = generateApiKey()
    expect(key1).not.toBe(key2)
  })
})

// ============================================================================
// isValidApiKeyFormat
// ============================================================================

describe('isValidApiKeyFormat', () => {
  it('accepts valid live key format', () => {
    const key = generateApiKey()
    expect(isValidApiKeyFormat(key)).toBe(true)
  })

  it('accepts valid test key format', () => {
    const key = generateApiKey(true)
    expect(isValidApiKeyFormat(key)).toBe(true)
  })

  it('rejects empty string', () => {
    expect(isValidApiKeyFormat('')).toBe(false)
  })

  it('rejects random string', () => {
    expect(isValidApiKeyFormat('not-a-valid-key')).toBe(false)
  })

  it('rejects key with wrong prefix', () => {
    expect(isValidApiKeyFormat('amp_prod_sk_' + 'a'.repeat(64))).toBe(false)
  })

  it('rejects key with wrong length', () => {
    expect(isValidApiKeyFormat('amp_live_sk_tooshort')).toBe(false)
  })
})

// ============================================================================
// extractApiKeyFromHeader
// ============================================================================

describe('extractApiKeyFromHeader', () => {
  it('returns null for null header', () => {
    expect(extractApiKeyFromHeader(null)).toBeNull()
  })

  it('extracts key from Bearer token', () => {
    const key = generateApiKey()
    expect(extractApiKeyFromHeader(`Bearer ${key}`)).toBe(key)
  })

  it('accepts raw valid key without Bearer prefix', () => {
    const key = generateApiKey()
    expect(extractApiKeyFromHeader(key)).toBe(key)
  })

  it('returns null for invalid format without Bearer prefix', () => {
    expect(extractApiKeyFromHeader('some-random-string')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(extractApiKeyFromHeader('')).toBeNull()
  })
})
