/**
 * Host-Level Ed25519 Key Management
 *
 * Manages a single Ed25519 keypair for the host machine, used for
 * cross-host identity attestation in the mesh network. Unlike agent keys
 * (per-agent, stored in ~/.aimaestro/agents/{id}/keys/), the host key
 * is shared by all agents on this machine and attests that a message
 * originated from this host.
 *
 * Storage: ~/.aimaestro/host-keys/private.hex and public.hex
 * Format: hex-encoded Ed25519 DER keys
 */

import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import os from 'os'

const HOST_KEYS_DIR = path.join(os.homedir(), '.aimaestro', 'host-keys')
const PRIVATE_KEY_PATH = path.join(HOST_KEYS_DIR, 'private.hex')
const PUBLIC_KEY_PATH = path.join(HOST_KEYS_DIR, 'public.hex')

// In-memory cache: loaded once, reused across all calls
let cachedKeyPair: { publicKeyHex: string; privateKeyHex: string } | null = null

/**
 * Ensure the host-keys directory exists with restrictive permissions (0o700).
 * Only the owning user can read/write/traverse the directory.
 */
function ensureHostKeysDir(): void {
  if (!fs.existsSync(HOST_KEYS_DIR)) {
    fs.mkdirSync(HOST_KEYS_DIR, { recursive: true, mode: 0o700 })
  }
}

/**
 * Generate a fresh Ed25519 keypair and persist both keys to disk.
 * Uses atomic write pattern (write .tmp then rename) to prevent corruption
 * if the process crashes mid-write, matching the pattern in governance.ts.
 */
function generateAndStoreKeyPair(): { publicKeyHex: string; privateKeyHex: string } {
  ensureHostKeysDir()

  // Generate Ed25519 keypair using Node.js built-in crypto
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'der' },
    privateKeyEncoding: { type: 'pkcs8', format: 'der' },
  })

  const privateKeyHex = (privateKey as Buffer).toString('hex')
  const publicKeyHex = (publicKey as Buffer).toString('hex')

  // Atomic write: write to .tmp then rename to avoid half-written files
  const privateTmp = PRIVATE_KEY_PATH + '.tmp'
  const publicTmp = PUBLIC_KEY_PATH + '.tmp'

  // Private key: owner-only read/write (0o600)
  fs.writeFileSync(privateTmp, privateKeyHex, { mode: 0o600 })
  fs.renameSync(privateTmp, PRIVATE_KEY_PATH)

  // Public key: owner-only read/write (0o600) since it lives in a restricted dir
  fs.writeFileSync(publicTmp, publicKeyHex, { mode: 0o600 })
  fs.renameSync(publicTmp, PUBLIC_KEY_PATH)

  console.log('[host-keys] Generated new Ed25519 host keypair')

  return { publicKeyHex, privateKeyHex }
}

/**
 * Load the host keypair from disk.
 * Returns null if either key file is missing or unreadable.
 */
function loadKeyPairFromDisk(): { publicKeyHex: string; privateKeyHex: string } | null {
  if (!fs.existsSync(PRIVATE_KEY_PATH) || !fs.existsSync(PUBLIC_KEY_PATH)) {
    return null
  }

  const privateKeyHex = fs.readFileSync(PRIVATE_KEY_PATH, 'utf-8').trim()
  const publicKeyHex = fs.readFileSync(PUBLIC_KEY_PATH, 'utf-8').trim()

  // Sanity check: Ed25519 DER-encoded keys have known lengths
  // PKCS8 private DER = 48 bytes = 96 hex chars
  // SPKI public DER = 44 bytes = 88 hex chars
  if (privateKeyHex.length < 90 || publicKeyHex.length < 80) {
    console.error('[host-keys] Key files exist but appear corrupt (unexpected length), regenerating')
    return null
  }

  return { publicKeyHex, privateKeyHex }
}

/**
 * Get or create the host's Ed25519 keypair.
 * Cached in memory after first load -- subsequent calls return instantly.
 */
export function getOrCreateHostKeyPair(): { publicKeyHex: string; privateKeyHex: string } {
  // Return cached keypair if available
  if (cachedKeyPair) {
    return cachedKeyPair
  }

  // Try loading from disk first
  const loaded = loadKeyPairFromDisk()
  if (loaded) {
    cachedKeyPair = loaded
    return cachedKeyPair
  }

  // No keys on disk -- generate fresh keypair
  cachedKeyPair = generateAndStoreKeyPair()
  return cachedKeyPair
}

/**
 * Convenience: get just the public key hex string.
 * Useful for sharing this host's identity with other hosts in the mesh.
 */
export function getHostPublicKeyHex(): string {
  return getOrCreateHostKeyPair().publicKeyHex
}

/**
 * Sign arbitrary data with the host's private key.
 * Returns a base64-encoded Ed25519 signature.
 *
 * The private key is reconstructed from its DER hex representation
 * and used with crypto.sign(null, ...) where null indicates Ed25519
 * (which does not use a separate hash algorithm).
 */
export function signHostAttestation(data: string): string {
  const { privateKeyHex } = getOrCreateHostKeyPair()

  // Reconstruct the private key object from DER hex
  const privateKeyDer = Buffer.from(privateKeyHex, 'hex')
  const privateKey = crypto.createPrivateKey({
    key: privateKeyDer,
    format: 'der',
    type: 'pkcs8',
  })

  // Ed25519 uses null algorithm (hash is built into the signing process)
  const signature = crypto.sign(null, Buffer.from(data), privateKey)
  return signature.toString('base64')
}

/**
 * Verify a signature against data using a given public key hex.
 * Used to verify attestations from remote hosts in the mesh network.
 *
 * @param data - The original signed data string
 * @param signatureBase64 - The base64-encoded signature to verify
 * @param publicKeyHex - The hex-encoded SPKI DER public key of the signing host
 * @returns true if the signature is valid, false otherwise
 */
export function verifyHostAttestation(
  data: string,
  signatureBase64: string,
  publicKeyHex: string
): boolean {
  try {
    // Reconstruct the public key object from DER hex
    const publicKeyDer = Buffer.from(publicKeyHex, 'hex')
    const publicKey = crypto.createPublicKey({
      key: publicKeyDer,
      format: 'der',
      type: 'spki',
    })

    const signatureBuffer = Buffer.from(signatureBase64, 'base64')

    // Ed25519 uses null algorithm (hash is built into the verification process)
    return crypto.verify(null, Buffer.from(data), publicKey, signatureBuffer)
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error)
    console.warn(`[host-keys] Attestation verification failed: ${errMsg}`)
    return false
  }
}
