/**
 * Team Resource ACL — checks whether an agent (or web UI request)
 * is allowed to access a given team's resources.
 *
 * All teams are closed after governance simplification (2026-03-27).
 * Access is restricted to the manager, chief-of-staff, and team members only.
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
 * Decision order (all teams are closed after governance simplification):
 *  1. Web UI (no agentId)      → allowed
 *  2. Team not found           → denied (caller handles 404)
 *  3. Requester is MANAGER     → allowed
 *  4. Requester is chief-of-staff → allowed
 *  5. Requester is a member    → allowed
 *  6. Otherwise                → denied
 */
export function checkTeamAccess(input: TeamAccessInput): TeamAccessResult {
  // 1. Web UI requests (no X-Agent-Id header) always pass.
  // KNOWN LIMITATION (Phase 1, localhost-only): Any local process that omits X-Agent-Id
  // gets full access, not just the web UI. Acceptable because Phase 1 runs on localhost
  // where all local processes are trusted.
  // TODO Phase 2: Add X-Request-Source header with per-session CSRF token to distinguish
  // genuine web UI requests from other local processes.
  if (input.requestingAgentId === undefined) {
    return { allowed: true }
  }

  // 2. Team not found — deny access; callers should check team existence for 404 responses
  const team = getTeam(input.teamId)
  if (!team) {
    return { allowed: false, reason: 'Team not found' }
  }

  // All teams are closed — always enforce ACL (open team bypass removed in governance simplification)

  // 3. MANAGER role always has access
  if (isManager(input.requestingAgentId)) {
    return { allowed: true }
  }

  // 4. Chief-of-Staff of this team has access
  if (team.chiefOfStaffId === input.requestingAgentId) {
    return { allowed: true }
  }

  // 5. Team members have access
  if (team.agentIds.includes(input.requestingAgentId)) {
    return { allowed: true }
  }

  // 6. Everyone else is denied
  return { allowed: false, reason: 'Access denied: you are not a member of this team' }
}
