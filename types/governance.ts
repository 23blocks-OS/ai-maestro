/**
 * Team Governance types
 *
 * Defines open/closed team types, governance configuration,
 * and role-based access control for team messaging isolation.
 */

/** Team access type: open preserves current behavior, closed adds messaging isolation and ACL */
export type TeamType = 'open' | 'closed'

/** Governance configuration stored at ~/.aimaestro/governance.json */
export interface GovernanceConfig {
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
  version: 1
  requests: TransferRequest[]
}
