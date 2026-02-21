/**
 * Team Governance types
 *
 * Defines open/closed team types, governance configuration,
 * and role-based access control for team messaging isolation.
 */

import type { AgentRole } from './agent'
import type { TeamType } from './team'

// Re-export TeamType from its canonical location in types/team.ts
export type { TeamType } from './team'

/**
 * GovernanceRole is an alias for AgentRole — both define the same role taxonomy.
 * Canonical definition lives in types/agent.ts (AgentRole).
 * 'member' replaced 'normal' in v0.26.0 to align with upstream.
 */
export type GovernanceRole = AgentRole

/** Governance configuration stored at ~/.aimaestro/governance.json */
export interface GovernanceConfig {
  // Strict discriminant for future schema migrations
  version: 1
  passwordHash: string | null   // bcrypt hash of governance password, null = not set
  passwordSetAt: string | null  // ISO timestamp when password was last set
  managerId: string | null      // Agent UUID of the singleton MANAGER role
}

/** Default governance config for first-time initialization */
export const DEFAULT_GOVERNANCE_CONFIG: GovernanceConfig = {
  version: 1,
  passwordHash: null,
  passwordSetAt: null,
  managerId: null,
}

/** Status of a team transfer request */
export type TransferRequestStatus = 'pending' | 'approved' | 'rejected'

/** A request to transfer an agent from one closed team to another */
export interface TransferRequest {
  id: string                        // UUID
  agentId: string                   // Agent being transferred
  fromTeamId: string                // Source closed team
  toTeamId: string                  // Destination team
  requestedBy: string               // Agent UUID of who initiated the transfer
  status: TransferRequestStatus
  createdAt: string                 // ISO timestamp
  resolvedAt?: string               // ISO timestamp when approved/rejected
  resolvedBy?: string               // Agent UUID of COS who approved/rejected
  note?: string                     // Optional note from requester
  rejectReason?: string             // Optional reason for rejection
}

/** File format for transfer requests storage */
export interface TransfersFile {
  // Strict discriminant for future schema migrations
  version: 1
  requests: TransferRequest[]
}

// ─── Multi-Host Governance (Layer 1: State Replication) ────────────────────

/** Types of governance state changes that get broadcast to mesh peers */
export type GovernanceSyncType = 'manager-changed' | 'team-updated' | 'team-deleted' | 'transfer-update'

/** Message payload sent between hosts for governance state synchronization */
export interface GovernanceSyncMessage {
  type: GovernanceSyncType
  fromHostId: string
  timestamp: string          // ISO — used for conflict ordering
  payload: Record<string, unknown>  // type-specific data
}

/** Summary of a team as seen from a peer host (subset of Team) */
export interface PeerTeamSummary {
  id: string
  name: string
  type: TeamType
  chiefOfStaffId: string | null
  agentIds: string[]
}

/** Cached governance state from a single peer host */
export interface GovernancePeerState {
  hostId: string
  managerId: string | null
  managerName: string | null
  teams: PeerTeamSummary[]
  lastSyncAt: string         // ISO — when this peer last sent us an update
  ttl: number                // Seconds before this data is considered stale (default 300)
}

// ─── Cross-Host Role Attestation (Layer 2) ──────────────────────────────────

/** Signed role attestation for cross-host mesh messages */
export interface HostAttestation {
  role: AgentRole
  agentId: string
  hostId: string
  timestamp: string  // ISO
  signature: string  // base64
  recipientHostId?: string  // Binds attestation to intended recipient, prevents cross-target replay
}
