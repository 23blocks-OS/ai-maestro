/**
 * Cross-Host Governance Request Types (Layer 3)
 *
 * Defines the state machine for governance operations that span host boundaries.
 * Examples: adding an agent from host B to a team on host A, transferring agents
 * between hosts, assigning COS on a remote host.
 */

import type { AgentRole } from './agent'

/** Types of cross-host governance operations */
export type GovernanceRequestType =
  | 'add-to-team'
  | 'remove-from-team'
  | 'assign-cos'
  | 'remove-cos'
  | 'transfer-agent'
  | 'create-agent'
  | 'delete-agent'
  | 'configure-agent'

/** Status progression: pending -> remote-approved/local-approved -> executed/rejected */
export type GovernanceRequestStatus =
  | 'pending'
  | 'remote-approved'
  | 'local-approved'
  | 'executed'
  | 'rejected'

/** Individual approval record */
export interface GovernanceApproval {
  approved: boolean
  agentId: string       // Agent UUID who approved/rejected
  at: string            // ISO timestamp
}

/** All possible approvals for a governance request */
export interface GovernanceApprovals {
  sourceCOS?: GovernanceApproval
  sourceManager?: GovernanceApproval
  targetCOS?: GovernanceApproval
  targetManager?: GovernanceApproval
}

/** Payload for a governance request (type-specific fields) */
export interface GovernanceRequestPayload {
  agentId: string                           // Agent being operated on
  teamId?: string                           // Target team
  fromTeamId?: string                       // Source team (for transfers)
  toTeamId?: string                         // Destination team (for transfers)
  role?: AgentRole                          // Role to assign
  configuration?: Record<string, unknown>   // Agent configuration (for configure-agent)
}

/** A cross-host governance request */
export interface GovernanceRequest {
  id: string                          // UUID
  type: GovernanceRequestType
  sourceHostId: string                // Host that initiated the request
  targetHostId: string                // Host that must execute the operation
  requestedBy: string                 // agentId of who initiated (format: agentId@hostId)
  requestedByRole: AgentRole
  payload: GovernanceRequestPayload
  approvals: GovernanceApprovals
  status: GovernanceRequestStatus
  createdAt: string                   // ISO timestamp
  updatedAt: string                   // ISO timestamp
  note?: string                       // Optional note from requester
  rejectReason?: string               // Reason for rejection
}

/** File format for governance requests storage */
export interface GovernanceRequestsFile {
  version: 1
  requests: GovernanceRequest[]
}

/** Default empty governance requests file */
export const DEFAULT_GOVERNANCE_REQUESTS_FILE: GovernanceRequestsFile = {
  version: 1,
  requests: [],
}
