/**
 * AMP Key Management
 *
 * Handles Ed25519 keypair generation, storage, and management for agents.
 * Each agent owns their own keypair - keys travel with the agent when transferred.
 *
 * Directory Structure:
 * ~/.aimaestro/agents/{id}/
 *   ├── keys/
 *   │   ├── private.pem       # Agent's private key (NEVER shared)
 *   │   └── public.pem        # Agent's public key
 *   └── registrations/        # External provider registrations
 *       └── crabmail.json     # Crabmail registration (if registered)
 */

import fs from 'fs'
import path from 'path'
import os from 'os'
import { createHash } from 'crypto'
import type { AMPAgentIdentity, AMPExternalRegistration } from '@/types/agent'

// Import host identification for mesh routing
// The hostId becomes the "tenant" in AMP addresses for mesh routing
let _selfHostId: string = ''
function getSelfHostIdForAMP(): string {
  if (_selfHostId) return _selfHostId
  try {
    // Dynamic import to avoid bundling issues
    const { getSelfHostId } = require('./hosts-config-server.mjs')
    _selfHostId = getSelfHostId() || os.hostname().toLowerCase().replace(/\.local$/, '')
    return _selfHostId
  } catch {
    // Fallback to hostname
    _selfHostId = os.hostname().toLowerCase().replace(/\.local$/, '')
    return _selfHostId
  }
}

const AIMAESTRO_DIR = path.join(os.homedir(), '.aimaestro')
const AGENTS_DIR = path.join(AIMAESTRO_DIR, 'agents')

// ============================================================================
// Directory Helpers
// ============================================================================

/**
 * Get the keys directory for an agent
 */
export function getKeysDir(agentId: string): string {
  return path.join(AGENTS_DIR, agentId, 'keys')
}

/**
 * Get the registrations directory for an agent
 */
export function getRegistrationsDir(agentId: string): string {
  return path.join(AGENTS_DIR, agentId, 'registrations')
}

/**
 * Ensure agent directories exist
 */
function ensureAgentDirs(agentId: string): void {
  const keysDir = getKeysDir(agentId)
  const registrationsDir = getRegistrationsDir(agentId)

  if (!fs.existsSync(keysDir)) {
    fs.mkdirSync(keysDir, { recursive: true, mode: 0o700 })
  }

  if (!fs.existsSync(registrationsDir)) {
    fs.mkdirSync(registrationsDir, { recursive: true, mode: 0o700 })
  }
}

// ============================================================================
// Ed25519 Key Generation
// ============================================================================

export interface KeyPair {
  privatePem: string
  publicPem: string
  publicHex: string
  fingerprint: string
}

/**
 * Generate a new Ed25519 keypair for an agent
 * Uses Node.js crypto module for Ed25519 key generation
 */
export async function generateKeyPair(): Promise<KeyPair> {
  // Dynamic import to avoid issues with browser bundling
  const { generateKeyPairSync, createPublicKey } = await import('crypto')

  // Generate Ed25519 keypair
  const { privateKey, publicKey } = generateKeyPairSync('ed25519', {
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem'
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem'
    }
  })

  // Extract raw public key bytes for hex representation
  const pubKeyObj = createPublicKey(publicKey)
  const rawPubKey = pubKeyObj.export({ type: 'spki', format: 'der' })
  // Ed25519 SPKI format: 12-byte header + 32-byte key
  const publicKeyBytes = rawPubKey.subarray(12)
  const publicHex = publicKeyBytes.toString('hex')

  // Calculate fingerprint
  const fingerprint = calculateFingerprint(publicHex)

  return {
    privatePem: privateKey,
    publicPem: publicKey,
    publicHex,
    fingerprint
  }
}

/**
 * Calculate SHA256 fingerprint from public key hex
 * Returns format: "SHA256:base64..."
 */
export function calculateFingerprint(publicKeyHex: string): string {
  const publicKeyBytes = Buffer.from(publicKeyHex, 'hex')
  const hash = createHash('sha256').update(publicKeyBytes).digest('base64')
  return `SHA256:${hash}`
}

// ============================================================================
// Key Storage
// ============================================================================

/**
 * Save keypair to agent's keys directory
 */
export function saveKeyPair(agentId: string, keyPair: KeyPair): void {
  ensureAgentDirs(agentId)
  const keysDir = getKeysDir(agentId)

  // Write private key with restricted permissions
  const privateKeyPath = path.join(keysDir, 'private.pem')
  fs.writeFileSync(privateKeyPath, keyPair.privatePem, { mode: 0o600 })

  // Write public key
  const publicKeyPath = path.join(keysDir, 'public.pem')
  fs.writeFileSync(publicKeyPath, keyPair.publicPem, { mode: 0o644 })

  console.log(`[AMP Keys] Saved keypair for agent ${agentId.substring(0, 8)}...`)
}

/**
 * Load keypair from agent's keys directory
 */
export function loadKeyPair(agentId: string): KeyPair | null {
  const keysDir = getKeysDir(agentId)
  const privateKeyPath = path.join(keysDir, 'private.pem')
  const publicKeyPath = path.join(keysDir, 'public.pem')

  if (!fs.existsSync(privateKeyPath) || !fs.existsSync(publicKeyPath)) {
    return null
  }

  try {
    const privatePem = fs.readFileSync(privateKeyPath, 'utf-8')
    const publicPem = fs.readFileSync(publicKeyPath, 'utf-8')

    // Extract public key hex
    const { createPublicKey } = require('crypto')
    const pubKeyObj = createPublicKey(publicPem)
    const rawPubKey = pubKeyObj.export({ type: 'spki', format: 'der' })
    const publicKeyBytes = rawPubKey.subarray(12)
    const publicHex = publicKeyBytes.toString('hex')

    const fingerprint = calculateFingerprint(publicHex)

    return {
      privatePem,
      publicPem,
      publicHex,
      fingerprint
    }
  } catch (error) {
    console.error(`[AMP Keys] Failed to load keypair for agent ${agentId}:`, error)
    return null
  }
}

/**
 * Check if agent has a keypair
 */
export function hasKeyPair(agentId: string): boolean {
  const keysDir = getKeysDir(agentId)
  const privateKeyPath = path.join(keysDir, 'private.pem')
  const publicKeyPath = path.join(keysDir, 'public.pem')
  return fs.existsSync(privateKeyPath) && fs.existsSync(publicKeyPath)
}

/**
 * Delete agent's keypair
 */
export function deleteKeyPair(agentId: string): boolean {
  const keysDir = getKeysDir(agentId)

  try {
    if (fs.existsSync(keysDir)) {
      fs.rmSync(keysDir, { recursive: true })
      console.log(`[AMP Keys] Deleted keypair for agent ${agentId.substring(0, 8)}...`)
      return true
    }
    return false
  } catch (error) {
    console.error(`[AMP Keys] Failed to delete keypair for agent ${agentId}:`, error)
    return false
  }
}

// ============================================================================
// AMP Identity
// ============================================================================

/**
 * Get or create AMP identity for an agent
 * If the agent doesn't have a keypair, generates one.
 *
 * Address format: agentname@hostid.aimaestro.local
 * The hostId acts as the "tenant" for mesh routing - messages addressed
 * to agent@otherhostid.aimaestro.local will be routed to that host.
 *
 * @param agentId - Agent UUID
 * @param agentName - Agent name (used in address)
 * @param tenant - Optional tenant override (defaults to this host's ID for mesh routing)
 */
export async function getOrCreateAMPIdentity(
  agentId: string,
  agentName: string,
  tenant?: string
): Promise<AMPAgentIdentity> {
  // Default tenant to hostId for mesh routing
  const effectiveTenant = tenant || getSelfHostIdForAMP()
  let keyPair = loadKeyPair(agentId)

  if (!keyPair) {
    console.log(`[AMP Keys] Generating new keypair for agent ${agentName}`)
    keyPair = await generateKeyPair()
    saveKeyPair(agentId, keyPair)
  }

  return {
    fingerprint: keyPair.fingerprint,
    publicKeyHex: keyPair.publicHex,
    keyAlgorithm: 'Ed25519',
    createdAt: new Date().toISOString(),
    ampAddress: `${agentName}@${effectiveTenant}.aimaestro.local`,
    tenant: effectiveTenant
  }
}

/**
 * Get AMP identity from existing keypair
 * Returns null if no keypair exists
 *
 * Address format: agentname@hostid.aimaestro.local
 */
export function getAMPIdentity(
  agentId: string,
  agentName: string,
  tenant?: string
): AMPAgentIdentity | null {
  const effectiveTenant = tenant || getSelfHostIdForAMP()
  const keyPair = loadKeyPair(agentId)

  if (!keyPair) {
    return null
  }

  return {
    fingerprint: keyPair.fingerprint,
    publicKeyHex: keyPair.publicHex,
    keyAlgorithm: 'Ed25519',
    createdAt: new Date().toISOString(),
    ampAddress: `${agentName}@${effectiveTenant}.aimaestro.local`,
    tenant: effectiveTenant
  }
}

// ============================================================================
// External Registrations
// ============================================================================

/**
 * Save an external provider registration
 */
export function saveRegistration(agentId: string, registration: AMPExternalRegistration): void {
  ensureAgentDirs(agentId)
  const registrationsDir = getRegistrationsDir(agentId)
  const registrationPath = path.join(registrationsDir, `${registration.provider}.json`)

  fs.writeFileSync(registrationPath, JSON.stringify(registration, null, 2), { mode: 0o600 })
  console.log(`[AMP Keys] Saved ${registration.provider} registration for agent ${agentId.substring(0, 8)}...`)
}

/**
 * Load an external provider registration
 */
export function loadRegistration(agentId: string, provider: string): AMPExternalRegistration | null {
  const registrationsDir = getRegistrationsDir(agentId)
  const registrationPath = path.join(registrationsDir, `${provider}.json`)

  if (!fs.existsSync(registrationPath)) {
    return null
  }

  try {
    const data = fs.readFileSync(registrationPath, 'utf-8')
    return JSON.parse(data) as AMPExternalRegistration
  } catch (error) {
    console.error(`[AMP Keys] Failed to load ${provider} registration for agent ${agentId}:`, error)
    return null
  }
}

/**
 * Load all external provider registrations for an agent
 */
export function loadAllRegistrations(agentId: string): AMPExternalRegistration[] {
  const registrationsDir = getRegistrationsDir(agentId)

  if (!fs.existsSync(registrationsDir)) {
    return []
  }

  try {
    const files = fs.readdirSync(registrationsDir)
    const registrations: AMPExternalRegistration[] = []

    for (const file of files) {
      if (file.endsWith('.json')) {
        const data = fs.readFileSync(path.join(registrationsDir, file), 'utf-8')
        registrations.push(JSON.parse(data) as AMPExternalRegistration)
      }
    }

    return registrations
  } catch (error) {
    console.error(`[AMP Keys] Failed to load registrations for agent ${agentId}:`, error)
    return []
  }
}

/**
 * Delete an external provider registration
 */
export function deleteRegistration(agentId: string, provider: string): boolean {
  const registrationsDir = getRegistrationsDir(agentId)
  const registrationPath = path.join(registrationsDir, `${provider}.json`)

  try {
    if (fs.existsSync(registrationPath)) {
      fs.unlinkSync(registrationPath)
      console.log(`[AMP Keys] Deleted ${provider} registration for agent ${agentId.substring(0, 8)}...`)
      return true
    }
    return false
  } catch (error) {
    console.error(`[AMP Keys] Failed to delete ${provider} registration for agent ${agentId}:`, error)
    return false
  }
}

/**
 * List registered providers for an agent
 */
export function listRegisteredProviders(agentId: string): string[] {
  const registrationsDir = getRegistrationsDir(agentId)

  if (!fs.existsSync(registrationsDir)) {
    return []
  }

  try {
    const files = fs.readdirSync(registrationsDir)
    return files
      .filter(f => f.endsWith('.json'))
      .map(f => f.replace('.json', ''))
  } catch {
    return []
  }
}

// ============================================================================
// Message Signing
// ============================================================================

/**
 * Sign a message with the agent's private key
 * Returns base64-encoded signature
 */
export function signMessage(agentId: string, message: string): string | null {
  const keyPair = loadKeyPair(agentId)

  if (!keyPair) {
    console.error(`[AMP Keys] No keypair found for agent ${agentId}`)
    return null
  }

  try {
    const { sign, createPrivateKey } = require('crypto')
    const privateKey = createPrivateKey(keyPair.privatePem)
    const signature = sign(null, Buffer.from(message), privateKey)
    return signature.toString('base64')
  } catch (error) {
    console.error(`[AMP Keys] Failed to sign message:`, error)
    return null
  }
}

/**
 * Verify a message signature with the sender's public key
 */
export function verifySignature(
  message: string,
  signature: string,
  publicKeyHex: string
): boolean {
  try {
    const { verify, createPublicKey } = require('crypto')

    // Reconstruct public key from hex
    // Ed25519 SPKI header (12 bytes) + public key (32 bytes)
    const header = Buffer.from([
      0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00
    ])
    const publicKeyBytes = Buffer.from(publicKeyHex, 'hex')
    const spkiDer = Buffer.concat([header, publicKeyBytes])

    const publicKey = createPublicKey({
      key: spkiDer,
      format: 'der',
      type: 'spki'
    })

    const signatureBuffer = Buffer.from(signature, 'base64')
    return verify(null, Buffer.from(message), publicKey, signatureBuffer)
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error)
    console.warn(`[AMP Keys] Signature verification failed: ${errMsg} (publicKeyHex length: ${publicKeyHex?.length || 0})`)
    return false
  }
}
