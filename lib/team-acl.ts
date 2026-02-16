/**
 * Team Resource ACL — checks whether an agent (or web UI request)
 * is allowed to access a given team's resources.
 *
 * Open teams (type undefined or 'open') impose no restrictions.
 * Closed teams restrict access to the manager, chief-of-staff,
 * and team members only.
 */

import { isManager } from './governance'
import { getTeam } from './team-registry'

export interface TeamAccessInput {
  teamId: string
  requestingAgentId?: string // undefined = web UI request (always allowed)
}

export interface TeamAccessResult {
  allowed: boolean
  reason?: string
}

/**
 * Determine whether the requester may access the team's resources.
 *
 * Decision order:
 *  1. Web UI (no agentId)      → allowed
 *  2. Team not found           → allowed (caller handles 404)
 *  3. Team is open / untyped   → allowed
 *  4. Requester is MANAGER     → allowed
 *  5. Requester is chief-of-staff → allowed
 *  6. Requester is a member    → allowed
 *  7. Otherwise                → denied
 */
export function checkTeamAccess(input: TeamAccessInput): TeamAccessResult {
  // 1. Web UI requests (no X-Agent-Id header) always pass
  if (input.requestingAgentId === undefined) {
    return { allowed: true }
  }

  // 2. Team not found — let the caller deal with 404
  const team = getTeam(input.teamId)
  if (!team) {
    return { allowed: true }
  }

  // 3. Open teams (or teams with no explicit type) have no ACL
  if (team.type !== 'closed') {
    return { allowed: true }
  }

  // 4. MANAGER role always has access
  if (isManager(input.requestingAgentId)) {
    return { allowed: true }
  }

  // 5. Chief-of-Staff of this team has access
  if (team.chiefOfStaffId === input.requestingAgentId) {
    return { allowed: true }
  }

  // 6. Team members have access
  if (team.agentIds.includes(input.requestingAgentId)) {
    return { allowed: true }
  }

  // 7. Everyone else is denied
  return { allowed: false, reason: 'Access denied: you are not a member of this closed team' }
}
