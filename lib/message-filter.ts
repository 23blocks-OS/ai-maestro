/**
 * Message Filter — enforces closed-team messaging isolation
 *
 * Determines whether a message from sender to recipient is allowed
 * based on governance roles (MANAGER, Chief-of-Staff) and closed-team
 * membership. Open-world agents (not in any closed team) can message
 * freely unless the recipient is inside a closed team.
 */

import { loadGovernance } from './governance'
import { loadTeams } from './team-registry'
import { isValidUuid } from './validation'
import type { AgentRole } from '@/types/agent'

export interface MessageFilterInput {
  senderAgentId: string | null // null = mesh-forwarded message with no attestation
  recipientAgentId: string
  // Layer 2: attested sender identity from a verified role attestation (cross-host)
  senderRole?: AgentRole | null       // verified governance role from attestation
  senderHostId?: string | null        // host that signed the attestation
}

export interface MessageFilterResult {
  allowed: boolean
  reason?: string
}

/**
 * Check whether a message from sender to recipient is allowed.
 *
 * Algorithm (R6.1–R6.7):
 * 1. Mesh-forwarded (senderAgentId null): denied if recipient is in a closed team (unverified sender)
 * 1b. Unresolved recipient (alias, not UUID) from closed-team sender: denied (prevents bypass)
 * 2. Neither in a closed team: allowed (open world, current behavior) (R6.4)
 * 3. Sender is MANAGER: always allowed (R6.3)
 * 4. Sender is COS of any closed team: can reach MANAGER, other COS, own team members (R6.2)
 * 5. Normal closed-team member: can reach same-team members and own COS (R6.1)
 * 6. Outside sender to closed-team recipient: denied (R6.5) — always reached after Steps 2–5
 *
 * IMPORTANT (R6.7): Uses getClosedTeamsForAgent (plural) to correctly handle
 * COS agents who belong to multiple closed teams simultaneously.
 */
export function checkMessageAllowed(input: MessageFilterInput): MessageFilterResult {
  const { senderAgentId, recipientAgentId } = input

  // Single snapshot of all state — avoids redundant file reads from governance helpers
  // Loaded before null-sender check so closedTeams is available for mesh-forward denial
  const teams = loadTeams()
  const governance = loadGovernance()

  // Derive closed-team membership from the single snapshot
  const closedTeams = teams.filter(t => t.type === 'closed')

  // Step 1: Mesh-forwarded messages — apply attestation-aware rules
  if (senderAgentId === null) {
    const recipientInClosedTeam = closedTeams.some(t => t.agentIds.includes(recipientAgentId))

    // Layer 2: If sender has a verified role attestation, apply governance rules
    if (input.senderRole && input.senderHostId) {
      // Attested MANAGER: always allowed (R6.3 cross-host)
      if (input.senderRole === 'manager') {
        return { allowed: true }
      }
      // Attested COS: can reach MANAGER, other COS, open-world agents
      if (input.senderRole === 'chief-of-staff') {
        // COS → MANAGER: always allowed
        if (governance.managerId === recipientAgentId) {
          return { allowed: true }
        }
        // COS → other COS: allowed
        if (closedTeams.some(t => t.chiefOfStaffId === recipientAgentId)) {
          return { allowed: true }
        }
        // COS → agent not in any closed team: allowed
        if (!recipientInClosedTeam) {
          return { allowed: true }
        }
        // COS → closed-team member: denied unless same team (requires peer cache lookup — Layer 3+)
        return { allowed: false, reason: 'Cross-host COS message denied: recipient is in a closed team on this host' }
      }
    }

    // No attestation or member role: deny if recipient is in a closed team (unverified sender)
    if (recipientInClosedTeam) {
      return { allowed: false, reason: 'Mesh message denied: recipient is in a closed team and sender identity is unverified' }
    }
    return { allowed: true }
  }

  // Step 1b: Unresolved recipient (alias instead of UUID) with sender in closed team → deny
  // Prevents governance bypass via alias that skips agentIds membership checks
  const isUuidLike = isValidUuid(recipientAgentId)
  if (!isUuidLike) {
    const senderInClosedTeam = closedTeams.some(t => t.agentIds.includes(senderAgentId))
    if (senderInClosedTeam) {
      return { allowed: false, reason: 'Cannot send to unresolved recipient from closed team' }
    }
  }

  const senderTeams = closedTeams.filter(t => t.agentIds.includes(senderAgentId))
  const recipientTeams = closedTeams.filter(t => t.agentIds.includes(recipientAgentId))
  // Defense-in-depth: also include teams where sender is COS via chiefOfStaffId,
  // in case COS was not added to agentIds (data corruption edge case).
  const senderCosTeams = closedTeams.filter(t => t.chiefOfStaffId === senderAgentId)
  const allSenderTeamIds = [...new Set([...senderTeams.map(t => t.id), ...senderCosTeams.map(t => t.id)])]
  const senderInClosed = senderTeams.length > 0 || senderCosTeams.length > 0
  const recipientInClosed = recipientTeams.length > 0

  // Helper: is the given agentId the manager?
  // When governance.managerId is null (no manager appointed), this returns false for all agents.
  const agentIsManager = (id: string) => governance.managerId === id
  // Helper: is the given agentId chief-of-staff in any closed team?
  const agentIsCOS = (id: string) => closedTeams.some(t => t.chiefOfStaffId === id)

  // Step 2: Neither party is in a closed team — open world, allow freely (R6.4)
  if (!senderInClosed && !recipientInClosed) {
    return { allowed: true }
  }

  // Step 3: MANAGER can message anyone (R6.3)
  if (agentIsManager(senderAgentId)) {
    return { allowed: true }
  }

  // Step 4: Sender is Chief-of-Staff of some closed team (R6.2)
  if (agentIsCOS(senderAgentId)) {
    // COS can always reach the MANAGER
    if (agentIsManager(recipientAgentId)) {
      return { allowed: true }
    }
    // COS-to-COS bridge: any COS can message any other COS
    if (agentIsCOS(recipientAgentId)) {
      return { allowed: true }
    }
    // COS can message members of ANY of their closed teams (R6.7 — plural, not singular)
    // Uses allSenderTeamIds to cover COS-not-in-agentIds edge case
    const cosTeamMembers = closedTeams
      .filter(t => allSenderTeamIds.includes(t.id))
      .flatMap(t => t.agentIds)
    if (cosTeamMembers.includes(recipientAgentId)) {
      return { allowed: true }
    }
    // G1: COS can message agents NOT in any closed team (v2 Rule 6)
    // This includes open-team agents and unaffiliated agents
    if (!recipientInClosed) {
      return { allowed: true }
    }
    return {
      allowed: false,
      reason: 'Chief-of-Staff can only message MANAGER, other Chiefs-of-Staff, own team members, and agents not in any closed team',
    }
  }

  // Step 5: Sender is a normal member of a closed team (R6.1)
  if (senderInClosed) {
    // Can message members of the same closed team
    const shareTeam = senderTeams.some(team =>
      recipientTeams.some(rt => rt.id === team.id)
    )
    if (shareTeam) {
      return { allowed: true }
    }
    // Can message the COS of their own team
    const canReachCOS = senderTeams.some(team => team.chiefOfStaffId === recipientAgentId)
    if (canReachCOS) {
      return { allowed: true }
    }
    return {
      allowed: false,
      reason: 'Closed team members can only message within their team',
    }
  }

  // Step 5b: Open-world agents can reach MANAGER and COS (v2 Rules 62-63)
  // After Steps 2–5, !senderInClosed && recipientInClosed is always true here.
  if (agentIsManager(recipientAgentId)) {
    return { allowed: true }
  }
  if (agentIsCOS(recipientAgentId)) {
    return { allowed: true }
  }

  // Step 6: Sender is NOT in any closed team but recipient IS in a closed team (R6.5)
  // Remaining case: open-world sender → normal closed-team member (not MANAGER/COS).
  return {
    allowed: false,
    reason: 'Cannot message agents in closed teams from outside',
  }
}
