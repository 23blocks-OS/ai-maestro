/**
 * Role Attestation for Cross-Host Mesh Messages
 *
 * When a MANAGER or COS sends a message that gets forwarded to another host,
 * their role is attested with a cryptographic signature so the receiving host
 * can trust it. The attestation proves that agentId has the given role on the
 * originating host, signed by that host's Ed25519 private key.
 *
 * Data format signed: "role|agentId|hostId|timestamp"
 */

import { signHostAttestation, verifyHostAttestation } from '@/lib/host-keys'
import { getSelfHostId } from '@/lib/hosts-config'
import type { HostAttestation } from '@/types/governance'
import type { AgentRole } from '@/types/agent'

/** Maximum age of an attestation before it is considered expired (5 minutes) */
const ATTESTATION_MAX_AGE_MS = 5 * 60 * 1000

/**
 * Build the canonical data string that gets signed/verified.
 * Format: "role|agentId|hostId|timestamp"
 */
function buildAttestationData(attestation: Pick<HostAttestation, 'role' | 'agentId' | 'hostId' | 'timestamp'>): string {
  return `${attestation.role}|${attestation.agentId}|${attestation.hostId}|${attestation.timestamp}`
}

/**
 * Create a signed role attestation for an agent on this host.
 * The attestation proves that agentId has the given role on this host,
 * signed by the host's Ed25519 private key.
 *
 * Data format signed: "role|agentId|hostId|timestamp"
 */
export function createRoleAttestation(agentId: string, role: AgentRole): HostAttestation {
  const hostId = getSelfHostId()
  const timestamp = new Date().toISOString()

  const data = buildAttestationData({ role, agentId, hostId, timestamp })
  const signature = signHostAttestation(data)

  return {
    role,
    agentId,
    hostId,
    timestamp,
    signature,
  }
}

/**
 * Verify a role attestation from a peer host.
 * Checks:
 * 1. Signature is valid against the expected host's public key
 * 2. Timestamp is fresh (within ATTESTATION_MAX_AGE_MS)
 * Returns true only if both checks pass.
 */
export function verifyRoleAttestation(
  attestation: HostAttestation,
  expectedHostPublicKeyHex: string,
): boolean {
  // Check timestamp freshness -- reject expired attestations
  const attestationAge = Date.now() - new Date(attestation.timestamp).getTime()
  if (attestationAge > ATTESTATION_MAX_AGE_MS || attestationAge < 0) {
    return false
  }

  // Rebuild the data string and verify the signature
  const data = buildAttestationData(attestation)
  return verifyHostAttestation(data, attestation.signature, expectedHostPublicKeyHex)
}

/**
 * Serialize a HostAttestation to a base64 JSON string (for HTTP headers).
 */
export function serializeAttestation(attestation: HostAttestation): string {
  return Buffer.from(JSON.stringify(attestation)).toString('base64')
}

/**
 * Deserialize a base64 JSON string back to a HostAttestation.
 * Returns null if the string is invalid.
 */
export function deserializeAttestation(base64Json: string): HostAttestation | null {
  try {
    const json = Buffer.from(base64Json, 'base64').toString()
    const parsed = JSON.parse(json)
    // Validate required fields exist
    if (
      typeof parsed.role === 'string' &&
      typeof parsed.agentId === 'string' &&
      typeof parsed.hostId === 'string' &&
      typeof parsed.timestamp === 'string' &&
      typeof parsed.signature === 'string'
    ) {
      return parsed as HostAttestation
    }
    return null
  } catch {
    return null
  }
}
