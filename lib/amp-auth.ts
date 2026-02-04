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
import { createHash, randomBytes } from 'crypto'
import type { AMPApiKeyRecord, AMPKeyRotationResponse, AMPErrorCode } from './types/amp'

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

/**
 * Load all API key records
 */
function loadApiKeys(): AMPApiKeyRecord[] {
  ensureDir()

  if (!fs.existsSync(API_KEYS_FILE)) {
    return []
  }

  try {
    const data = fs.readFileSync(API_KEYS_FILE, 'utf-8')
    return JSON.parse(data) as AMPApiKeyRecord[]
  } catch (error) {
    console.error('[AMP Auth] Failed to load API keys:', error)
    return []
  }
}

/**
 * Save API key records
 */
function saveApiKeys(keys: AMPApiKeyRecord[]): void {
  ensureDir()

  try {
    fs.writeFileSync(API_KEYS_FILE, JSON.stringify(keys, null, 2), { mode: 0o600 })
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
 * Uses SHA-256 with a prefix to identify the hash type
 */
export function hashApiKey(apiKey: string): string {
  return 'sha256:' + createHash('sha256').update(apiKey).digest('hex')
}

/**
 * Compare a plain API key with a stored hash
 */
export function verifyApiKeyHash(apiKey: string, storedHash: string): boolean {
  const computedHash = hashApiKey(apiKey)
  return computedHash === storedHash
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
export function createApiKey(
  agentId: string,
  tenantId: string,
  address: string
): string {
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
}

/**
 * Validate an API key and return the associated record
 * Returns null if invalid or expired
 */
export function validateApiKey(apiKey: string): AMPApiKeyRecord | null {
  if (!isValidApiKeyFormat(apiKey)) {
    return null
  }

  const keys = loadApiKeys()
  const keyHash = hashApiKey(apiKey)

  const record = keys.find(k =>
    k.key_hash === keyHash &&
    k.status === 'active' &&
    (!k.expires_at || new Date(k.expires_at) > new Date())
  )

  if (record) {
    // Update last_used_at
    record.last_used_at = new Date().toISOString()
    saveApiKeys(keys)
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
export function rotateApiKey(oldApiKey: string): AMPKeyRotationResponse | null {
  const keys = loadApiKeys()
  const oldKeyHash = hashApiKey(oldApiKey)

  const oldRecord = keys.find(k => k.key_hash === oldKeyHash && k.status === 'active')
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
}

/**
 * Revoke an API key
 */
export function revokeApiKey(apiKey: string): boolean {
  const keys = loadApiKeys()
  const keyHash = hashApiKey(apiKey)

  const record = keys.find(k => k.key_hash === keyHash)
  if (!record) {
    return false
  }

  record.status = 'revoked'
  saveApiKeys(keys)

  console.log(`[AMP Auth] Revoked API key for agent ${record.agent_id.substring(0, 8)}...`)

  return true
}

/**
 * Revoke all API keys for an agent
 */
export function revokeAllKeysForAgent(agentId: string): number {
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
}

/**
 * Clean up expired keys
 * Should be run periodically
 */
export function cleanupExpiredKeys(): number {
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
