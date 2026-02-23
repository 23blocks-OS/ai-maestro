/**
 * AMP Authentication & API Key Management
 *
 * Handles API key generation, validation, and management for AMP protocol.
 * Keys are stored hashed for security.
 *
 * Key format: amp_<environment>_<type>_<random>
 * Example: amp_live_sk_abc123def456...
 */

import fs from 'fs'
import path from 'path'
import os from 'os'
import { createHash, randomBytes, timingSafeEqual } from 'crypto'
import type { AMPApiKeyRecord, AMPKeyRotationResponse, AMPErrorCode } from './types/amp'
// SF-004: File locking for read-modify-write operations
import { withLock } from '@/lib/file-lock'

const AIMAESTRO_DIR = path.join(os.homedir(), '.aimaestro')
const API_KEYS_FILE = path.join(AIMAESTRO_DIR, 'amp-api-keys.json')

// Key format constants
const KEY_PREFIX_LIVE = 'amp_live_sk_'
const KEY_PREFIX_TEST = 'amp_test_sk_'
const KEY_LENGTH = 32 // 32 random bytes = 64 hex chars

// Grace period for old keys after rotation (24 hours)
const KEY_ROTATION_GRACE_PERIOD_MS = 24 * 60 * 60 * 1000

// ============================================================================
// Storage Helpers
// ============================================================================

/**
 * Ensure the AIMaestro directory exists
 */
function ensureDir(): void {
  if (!fs.existsSync(AIMAESTRO_DIR)) {
    fs.mkdirSync(AIMAESTRO_DIR, { recursive: true, mode: 0o700 })
  }
}

// CC-P4-006: In-memory cache for API keys to avoid reading the file on every auth request.
// Invalidated on write (saveApiKeys) and expires after TTL.
const API_KEYS_CACHE_TTL_MS = 30_000 // 30 seconds
let _apiKeysCache: AMPApiKeyRecord[] | null = null
let _apiKeysCacheTimestamp = 0

/**
 * Internal: Load API keys and return the raw cache reference.
 * Used only by validateApiKey for in-place last_used_at mutation (SF-039).
 * All other callers MUST use loadApiKeys() which returns a defensive copy (SF-037).
 */
function _loadApiKeysRaw(): AMPApiKeyRecord[] {
  const now = Date.now()
  if (_apiKeysCache !== null && (now - _apiKeysCacheTimestamp) < API_KEYS_CACHE_TTL_MS) {
    return _apiKeysCache
  }

  ensureDir()

  if (!fs.existsSync(API_KEYS_FILE)) {
    _apiKeysCache = []
    _apiKeysCacheTimestamp = now
    return _apiKeysCache
  }

  try {
    const data = fs.readFileSync(API_KEYS_FILE, 'utf-8')
    _apiKeysCache = JSON.parse(data) as AMPApiKeyRecord[]
    _apiKeysCacheTimestamp = now
    return _apiKeysCache
  } catch (error) {
    console.error('[AMP Auth] Failed to load API keys:', error)
    return []
  }
}

/**
 * Load all API key records (uses in-memory cache with TTL).
 * SF-037: Returns a defensive shallow copy so external mutations cannot corrupt the cache.
 */
function loadApiKeys(): AMPApiKeyRecord[] {
  return [..._loadApiKeysRaw()]
}

/**
 * Save API key records
 * NT-031: Uses atomic write (temp + rename) to prevent file corruption on crash
 */
function saveApiKeys(keys: AMPApiKeyRecord[]): void {
  ensureDir()

  try {
    const tmpFile = API_KEYS_FILE + `.tmp.${process.pid}`
    fs.writeFileSync(tmpFile, JSON.stringify(keys, null, 2), { mode: 0o600 })
    fs.renameSync(tmpFile, API_KEYS_FILE)
    // CC-P4-006: Eagerly populate cache so next read picks up fresh data
    _apiKeysCache = keys
    _apiKeysCacheTimestamp = Date.now()
  } catch (error) {
    console.error('[AMP Auth] Failed to save API keys:', error)
    throw new Error('Failed to save API key')
  }
}

// ============================================================================
// Key Hashing
// ============================================================================

/**
 * Hash an API key for secure storage
 * Uses SHA-256 with a prefix to identify the hash type.
 * SF-054/SF-065: Unsalted SHA-256 acceptable for high-entropy API keys (256-bit).
 * Salting would require per-key salt storage and prevent O(1) hash lookup.
 * Phase 2: Consider HMAC-SHA256 with per-record salt for defense-in-depth.
 */
export function hashApiKey(apiKey: string): string {
  return 'sha256:' + createHash('sha256').update(apiKey).digest('hex')
}

/**
 * Compare a plain API key with a stored hash using constant-time comparison
 * to prevent timing attacks on hash values.
 */
export function verifyApiKeyHash(apiKey: string, storedHash: string): boolean {
  const computedHash = hashApiKey(apiKey)
  const a = Buffer.from(computedHash, 'utf8')
  const b = Buffer.from(storedHash, 'utf8')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

// ============================================================================
// Key Generation
// ============================================================================

/**
 * Generate a new API key
 * Format: amp_live_sk_{random_hex}
 */
export function generateApiKey(isTest: boolean = false): string {
  const prefix = isTest ? KEY_PREFIX_TEST : KEY_PREFIX_LIVE
  const randomPart = randomBytes(KEY_LENGTH).toString('hex')
  return `${prefix}${randomPart}`
}

/**
 * Check if a string looks like a valid API key format
 */
export function isValidApiKeyFormat(apiKey: string): boolean {
  return (
    (apiKey.startsWith(KEY_PREFIX_LIVE) || apiKey.startsWith(KEY_PREFIX_TEST)) &&
    apiKey.length === KEY_PREFIX_LIVE.length + (KEY_LENGTH * 2)
  )
}

// ============================================================================
// Key Management
// ============================================================================

/**
 * Create a new API key for an agent
 * Returns the plain API key (shown ONLY ONCE to the user)
 */
export async function createApiKey(
  agentId: string,
  tenantId: string,
  address: string
): Promise<string> {
  // SF-004: Serialize read-modify-write on the API keys file
  return withLock('amp-api-keys', () => {
    const apiKey = generateApiKey()
    const keyHash = hashApiKey(apiKey)

    const record: AMPApiKeyRecord = {
      key_hash: keyHash,
      agent_id: agentId,
      tenant_id: tenantId,
      address,
      created_at: new Date().toISOString(),
      expires_at: null,
      status: 'active'
    }

    const keys = loadApiKeys()
    keys.push(record)
    saveApiKeys(keys)

    console.log(`[AMP Auth] Created API key for agent ${agentId.substring(0, 8)}... (${address})`)

    return apiKey
  }) // end withLock('amp-api-keys')
}

/**
 * Validate an API key and return the associated record
 * Returns null if invalid or expired
 */
// Debounce lastUsed writes: only save at most once per 60 seconds per key
const _lastUsedWriteTimestamps = new Map<string, number>()
const LAST_USED_WRITE_INTERVAL_MS = 60_000

export function validateApiKey(apiKey: string): AMPApiKeyRecord | null {
  if (!isValidApiKeyFormat(apiKey)) {
    return null
  }

  // SF-004: validateApiKey remains sync because lastUsed writes are debounced (60s),
  // making concurrent write conflicts extremely unlikely. The mutating functions
  // (createApiKey, rotateApiKey, revokeApiKey) use withLock for safety.
  //
  // SF-037: loadApiKeys() returns a defensive copy for external callers. For the
  // validation hot path we need the raw cache reference so last_used_at mutations
  // persist in the cache without cloning on every call.
  const keys = _loadApiKeysRaw()
  const keyHash = hashApiKey(apiKey)

  // SF-034: Iterate ALL keys to prevent timing side-channel from early-exit find().
  // Even though 256-bit entropy makes timing attacks impractical, constant-time iteration
  // is the correct pattern for credential validation.
  let record: AMPApiKeyRecord | null = null
  for (const k of keys) {
    const a = Buffer.from(k.key_hash, 'utf8')
    const b = Buffer.from(keyHash, 'utf8')
    const hashMatch = a.length === b.length && timingSafeEqual(a, b)
    const isValid = hashMatch &&
      k.status === 'active' &&
      (!k.expires_at || new Date(k.expires_at) > new Date())
    // Always evaluate every key; capture the first match without breaking
    if (isValid && record === null) {
      record = k
    }
  }

  if (record) {
    // SF-039: Intentionally mutates cached array in-place for last_used_at tracking.
    // The debounce below limits disk writes. The mutation avoids cloning the entire
    // array on every validation call (hot path).
    const now = Date.now()
    const lastWrite = _lastUsedWriteTimestamps.get(keyHash) || 0
    if (now - lastWrite > LAST_USED_WRITE_INTERVAL_MS) {
      record.last_used_at = new Date().toISOString()
      saveApiKeys(keys)
      _lastUsedWriteTimestamps.set(keyHash, now)
    }
  }

  return record || null
}

/**
 * Get agent ID from API key
 * Convenience wrapper around validateApiKey
 */
export function getAgentIdFromApiKey(apiKey: string): string | null {
  const record = validateApiKey(apiKey)
  return record?.agent_id || null
}

/**
 * Extract API key from Authorization header
 * Supports "Bearer <token>" format
 */
export function extractApiKeyFromHeader(authHeader: string | null): string | null {
  if (!authHeader) return null

  if (authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7)
  }

  // Also accept raw key for convenience
  if (isValidApiKeyFormat(authHeader)) {
    return authHeader
  }

  return null
}

/**
 * Rotate an API key
 * Creates a new key and sets expiration on the old one
 */
export async function rotateApiKey(oldApiKey: string): Promise<AMPKeyRotationResponse | null> {
  // SF-004: Serialize read-modify-write on the API keys file
  return withLock('amp-api-keys', () => {
  const keys = loadApiKeys()
  const oldKeyHash = hashApiKey(oldApiKey)

  const oldRecord = keys.find(k => {
    // Use constant-time comparison for hash to prevent timing attacks
    const a = Buffer.from(k.key_hash, 'utf8')
    const b = Buffer.from(oldKeyHash, 'utf8')
    return a.length === b.length && timingSafeEqual(a, b) && k.status === 'active'
  })
  if (!oldRecord) {
    return null
  }

  // Create new key
  const newApiKey = generateApiKey()
  const newKeyHash = hashApiKey(newApiKey)

  const now = new Date()
  const graceExpiry = new Date(now.getTime() + KEY_ROTATION_GRACE_PERIOD_MS)

  // Update old key with expiration
  oldRecord.expires_at = graceExpiry.toISOString()

  // Create new key record
  const newRecord: AMPApiKeyRecord = {
    key_hash: newKeyHash,
    agent_id: oldRecord.agent_id,
    tenant_id: oldRecord.tenant_id,
    address: oldRecord.address,
    created_at: now.toISOString(),
    expires_at: null,
    status: 'active'
  }

  keys.push(newRecord)
  saveApiKeys(keys)

  console.log(`[AMP Auth] Rotated API key for agent ${oldRecord.agent_id.substring(0, 8)}...`)

  return {
    api_key: newApiKey,
    expires_at: null,
    previous_key_valid_until: graceExpiry.toISOString()
  }
  }) // end withLock('amp-api-keys')
}

/**
 * Revoke an API key
 */
export async function revokeApiKey(apiKey: string): Promise<boolean> {
  // SF-004: Serialize read-modify-write on the API keys file
  return withLock('amp-api-keys', () => {
  const keys = loadApiKeys()
  const keyHash = hashApiKey(apiKey)

  const record = keys.find(k => {
    // Use constant-time comparison for hash to prevent timing attacks
    const a = Buffer.from(k.key_hash, 'utf8')
    const b = Buffer.from(keyHash, 'utf8')
    return a.length === b.length && timingSafeEqual(a, b)
  })
  if (!record) {
    return false
  }

  record.status = 'revoked'
  saveApiKeys(keys)

  console.log(`[AMP Auth] Revoked API key for agent ${record.agent_id.substring(0, 8)}...`)

  return true
  }) // end withLock('amp-api-keys')
}

/**
 * Revoke all API keys for an agent
 */
export async function revokeAllKeysForAgent(agentId: string): Promise<number> {
  // SF-004: Serialize read-modify-write on the API keys file
  return withLock('amp-api-keys', () => {
  const keys = loadApiKeys()
  let revokedCount = 0

  for (const key of keys) {
    if (key.agent_id === agentId && key.status === 'active') {
      key.status = 'revoked'
      revokedCount++
    }
  }

  if (revokedCount > 0) {
    saveApiKeys(keys)
    console.log(`[AMP Auth] Revoked ${revokedCount} key(s) for agent ${agentId.substring(0, 8)}...`)
  }

  return revokedCount
  }) // end withLock('amp-api-keys')
}

/**
 * Clean up expired keys
 * Should be run periodically
 * SF-038: Wrapped in withLock to serialize read-modify-write on the API keys file
 */
export async function cleanupExpiredKeys(): Promise<number> {
  return withLock('amp-api-keys', () => {
  const keys = loadApiKeys()
  const now = new Date()
  let removedCount = 0

  const activeKeys = keys.filter(k => {
    if (k.status === 'revoked') {
      // Keep revoked keys for audit trail (could add retention policy)
      return true
    }

    if (k.expires_at && new Date(k.expires_at) < now) {
      removedCount++
      return false
    }

    return true
  })

  if (removedCount > 0) {
    saveApiKeys(activeKeys)
    console.log(`[AMP Auth] Cleaned up ${removedCount} expired key(s)`)
  }

  return removedCount
  }) // end withLock('amp-api-keys')
}

/**
 * Get all API keys for an agent (for admin/debugging)
 * Returns records without the actual key hashes exposed
 */
export function getKeysForAgent(agentId: string): Omit<AMPApiKeyRecord, 'key_hash'>[] {
  const keys = loadApiKeys()

  return keys
    .filter(k => k.agent_id === agentId)
    .map(({ key_hash, ...rest }) => rest)
}

// ============================================================================
// Middleware Helper
// ============================================================================

export interface AMPAuthResult {
  authenticated: boolean
  agentId?: string
  tenantId?: string
  address?: string
  error?: AMPErrorCode
  message?: string
}

/**
 * Authenticate a request using the Authorization header
 * Returns authentication result with agent info if valid
 */
export function authenticateRequest(authHeader: string | null): AMPAuthResult {
  const apiKey = extractApiKeyFromHeader(authHeader)

  if (!apiKey) {
    return {
      authenticated: false,
      error: 'unauthorized',
      message: 'Missing or invalid Authorization header'
    }
  }

  const record = validateApiKey(apiKey)

  if (!record) {
    return {
      authenticated: false,
      error: 'unauthorized',
      message: 'Invalid or expired API key'
    }
  }

  return {
    authenticated: true,
    agentId: record.agent_id,
    tenantId: record.tenant_id,
    address: record.address
  }
}
