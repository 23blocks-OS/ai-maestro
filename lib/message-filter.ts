/**
 * Message Filter — enforces closed-team messaging isolation
 *
 * Determines whether a message from sender to recipient is allowed
 * based on governance roles (MANAGER, Chief-of-Staff) and closed-team
 * membership. Open-world agents (not in any closed team) can message
 * freely unless the recipient is inside a closed team.
 */

import { isManager, isChiefOfStaffAnywhere, getClosedTeamForAgent } from './governance'

export interface MessageFilterInput {
  senderAgentId: string | null // null = mesh-forwarded message
  recipientAgentId: string
  isMeshForwarded?: boolean
}

export interface MessageFilterResult {
  allowed: boolean
  reason?: string
}

/**
 * Check whether a message from sender to recipient is allowed.
 *
 * Algorithm:
 * 1. Mesh-forwarded (senderAgentId null): always allowed (trust mesh peers)
 * 2. Neither in a closed team: allowed (open world, current behavior)
 * 3. Sender is MANAGER: always allowed
 * 4. Sender is COS of any closed team: can reach MANAGER, other COS, own team members
 * 5. Normal closed-team member: can reach same-team members and own COS
 * 6. Outside sender to closed-team recipient: denied
 * 7. Default: allowed
 */
export function checkMessageAllowed(input: MessageFilterInput): MessageFilterResult {
  const { senderAgentId, recipientAgentId } = input

  // Step 1: Mesh-forwarded messages are always trusted
  if (senderAgentId === null) {
    return { allowed: true }
  }

  // Load team membership for both parties
  const senderTeam = getClosedTeamForAgent(senderAgentId)
  const recipientTeam = getClosedTeamForAgent(recipientAgentId)

  // Step 2: Neither party is in a closed team — open world, allow freely
  if (senderTeam === null && recipientTeam === null) {
    return { allowed: true }
  }

  // Step 3: MANAGER can message anyone
  if (isManager(senderAgentId)) {
    return { allowed: true }
  }

  // Step 4: Sender is Chief-of-Staff of some closed team
  if (isChiefOfStaffAnywhere(senderAgentId)) {
    // COS can always reach the MANAGER
    if (isManager(recipientAgentId)) {
      return { allowed: true }
    }
    // COS-to-COS bridge: any COS can message any other COS
    if (isChiefOfStaffAnywhere(recipientAgentId)) {
      return { allowed: true }
    }
    // COS can message members of their own closed team
    if (senderTeam !== null && senderTeam.agentIds.includes(recipientAgentId)) {
      return { allowed: true }
    }
    return {
      allowed: false,
      reason: 'Chief-of-Staff can only message MANAGER, other Chiefs-of-Staff, and own team members',
    }
  }

  // Step 5: Sender is a normal member of a closed team
  if (senderTeam !== null) {
    // Can message members of the same closed team
    if (recipientTeam !== null && senderTeam.id === recipientTeam.id) {
      return { allowed: true }
    }
    // Can message the COS of their own team
    if (senderTeam.chiefOfStaffId === recipientAgentId) {
      return { allowed: true }
    }
    return {
      allowed: false,
      reason: 'Closed team members can only message within their team',
    }
  }

  // Step 6: Sender is NOT in any closed team but recipient IS in a closed team
  if (senderTeam === null && recipientTeam !== null) {
    return {
      allowed: false,
      reason: 'Cannot message agents in closed teams from outside',
    }
  }

  // Step 7: Default — allow
  return { allowed: true }
}
