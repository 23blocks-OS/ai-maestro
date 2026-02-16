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

export interface MessageFilterInput {
  senderAgentId: string | null // null = mesh-forwarded message
  recipientAgentId: string
}

export interface MessageFilterResult {
  allowed: boolean
  reason?: string
}

/**
 * Check whether a message from sender to recipient is allowed.
 *
 * Algorithm (R6.1–R6.7):
 * 1. Mesh-forwarded (senderAgentId null): always allowed (trust mesh peers)
 * 2. Neither in a closed team: allowed (open world, current behavior) (R6.4)
 * 3. Sender is MANAGER: always allowed (R6.3)
 * 4. Sender is COS of any closed team: can reach MANAGER, other COS, own team members (R6.2)
 * 5. Normal closed-team member: can reach same-team members and own COS (R6.1)
 * 6. Outside sender to closed-team recipient: denied (R6.5)
 * 7. Default: allowed
 *
 * IMPORTANT (R6.7): Uses getClosedTeamsForAgent (plural) to correctly handle
 * COS agents who belong to multiple closed teams simultaneously.
 */
export function checkMessageAllowed(input: MessageFilterInput): MessageFilterResult {
  const { senderAgentId, recipientAgentId } = input

  // Step 1: Mesh-forwarded messages are always trusted
  if (senderAgentId === null) {
    return { allowed: true }
  }

  // Single snapshot of all state — avoids redundant file reads from governance helpers
  const teams = loadTeams()
  const governance = loadGovernance()

  // Derive closed-team membership from the single snapshot
  const closedTeams = teams.filter(t => t.type === 'closed')
  const senderTeams = closedTeams.filter(t => t.agentIds.includes(senderAgentId))
  const recipientTeams = closedTeams.filter(t => t.agentIds.includes(recipientAgentId))
  const senderInClosed = senderTeams.length > 0
  const recipientInClosed = recipientTeams.length > 0

  // Helper: is the given agentId the manager?
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
    if (senderTeams.some(team => team.agentIds.includes(recipientAgentId))) {
      return { allowed: true }
    }
    return {
      allowed: false,
      reason: 'Chief-of-Staff can only message MANAGER, other Chiefs-of-Staff, and own team members',
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

  // Step 6: Sender is NOT in any closed team but recipient IS in a closed team (R6.5)
  if (!senderInClosed && recipientInClosed) {
    return {
      allowed: false,
      reason: 'Cannot message agents in closed teams from outside',
    }
  }

  // Step 7: Default — allow
  return { allowed: true }
}
