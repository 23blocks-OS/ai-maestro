/**
 * Role Attestation for Cross-Host Mesh Messages
 *
 * When a MANAGER or COS sends a message that gets forwarded to another host,
 * their role is attested with a cryptographic signature so the receiving host
 * can trust it. The attestation proves that agentId has the given role on the
 * originating host, signed by that host's Ed25519 private key.
 *
 * Data format signed: "role|agentId|hostId|timestamp[|recipientHostId]"
 */

import { signHostAttestation, verifyHostAttestation } from '@/lib/host-keys'
import { getSelfHostId } from '@/lib/hosts-config'
import type { HostAttestation } from '@/types/governance'
import type { AgentRole } from '@/types/agent'

/** Maximum age of an attestation before it is considered expired (5 minutes) */
const ATTESTATION_MAX_AGE_MS = 5 * 60 * 1000

/**
 * Build the canonical data string that gets signed/verified.
 * Format: "role|agentId|hostId|timestamp" or "role|agentId|hostId|timestamp|recipientHostId"
 * The recipientHostId suffix binds the attestation to a specific target host,
 * preventing cross-target replay attacks.
 */
function buildAttestationData(attestation: Pick<HostAttestation, 'role' | 'agentId' | 'hostId' | 'timestamp' | 'recipientHostId'>): string {
  const base = `${attestation.role}|${attestation.agentId}|${attestation.hostId}|${attestation.timestamp}`
  return attestation.recipientHostId ? `${base}|${attestation.recipientHostId}` : base
}

/**
 * Create a signed role attestation for an agent on this host.
 * The attestation proves that agentId has the given role on this host,
 * signed by the host's Ed25519 private key.
 *
 * Data format signed: "role|agentId|hostId|timestamp[|recipientHostId]"
 * When recipientHostId is provided, the attestation is bound to that specific
 * target host, preventing cross-target replay attacks.
 */
export function createRoleAttestation(agentId: string, role: AgentRole, recipientHostId?: string): HostAttestation {
  const hostId = getSelfHostId()
  const timestamp = new Date().toISOString()

  const data = buildAttestationData({ role, agentId, hostId, timestamp, recipientHostId })
  const signature = signHostAttestation(data)

  const attestation: HostAttestation = {
    role,
    agentId,
    hostId,
    timestamp,
    signature,
  }
  // Only include recipientHostId when provided, keeping backward compatibility
  if (recipientHostId) {
    attestation.recipientHostId = recipientHostId
  }
  return attestation
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
  expectedRecipientHostId?: string,
): boolean {
  // Check timestamp freshness -- reject expired attestations
  const attestationAge = Date.now() - new Date(attestation.timestamp).getTime()
  if (attestationAge > ATTESTATION_MAX_AGE_MS || attestationAge < 0) {
    return false
  }

  // SF-001 (P5): When expectedRecipientHostId is provided, verify the attestation was
  // intended for this host -- prevents cross-target replay attacks
  if (expectedRecipientHostId && attestation.recipientHostId !== expectedRecipientHostId) {
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
// CC-P4-007: Allowlist of valid AgentRole values for attestation deserialization
const VALID_AGENT_ROLES: readonly string[] = ['manager', 'chief-of-staff', 'member'] as const

export function deserializeAttestation(base64Json: string): HostAttestation | null {
  try {
    const json = Buffer.from(base64Json, 'base64').toString()
    const parsed = JSON.parse(json)
    // Validate required fields exist and role is a valid AgentRole value
    if (
      typeof parsed.role === 'string' &&
      VALID_AGENT_ROLES.includes(parsed.role) &&
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
