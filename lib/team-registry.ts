/**
 * Team Registry - File-based CRUD for team persistence
 *
 * Storage: ~/.aimaestro/teams/teams.json
 * Mirrors the pattern from lib/agent-registry.ts
 */

import fs from 'fs'
import path from 'path'
import os from 'os'
import { v4 as uuidv4 } from 'uuid'
import type { Team, TeamsFile } from '@/types/team'
import type { TeamType } from '@/types/governance'
import { withLock } from '@/lib/file-lock'
import { broadcastGovernanceSync } from '@/lib/governance-sync'

// --- Team Name Validation Constants ---
// Mirrors agent name rigor from app/api/v1/register/route.ts but allows spaces/display chars
const TEAM_NAME_MIN_LENGTH = 4
const TEAM_NAME_MAX_LENGTH = 64

/** Error thrown when team validation fails — caught by API routes to return proper HTTP status */
export class TeamValidationException extends Error {
  code: number
  constructor(message: string, code: number) {
    super(message)
    this.name = 'TeamValidationException'
    this.code = code
  }
}

/**
 * Sanitize a team name: strip control chars, collapse whitespace, trim.
 * Same sanitization approach used by AI Maestro agent name validation
 * but adapted for display names (allows spaces, mixed case).
 */
export function sanitizeTeamName(raw: string): string {
  return raw
    .replace(/[\x00-\x1F\x7F]/g, '')  // Strip control characters (same as agent name sanitization)
    .replace(/\s+/g, ' ')              // Collapse all whitespace into single space
    .trim()
}

/**
 * Validate a team mutation (create or update) against all governance business rules.
 *
 * Rules enforced (post-simplification — all teams are closed):
 * - R1.3/R1.4: Every team must have a COS
 * - R2.1/R2.3: Team names must be unique (case-insensitive)
 * - R4.1: Normal agents can be in at most ONE team (single-team membership)
 * - R4.6: COS must be a member of the team (auto-added to agentIds)
 * - R4.7: Cannot remove COS from agentIds while they are chiefOfStaffId
 * - Team name sanitization: min 4 chars, max 64 chars, alphanumeric start, safe characters only
 *
 * @param teams - Current teams list (for uniqueness and single-team checks)
 * @param teamId - null for create, team ID for update
 * @param data - Proposed team data or updates
 * @param managerId - Current MANAGER agent ID (MANAGER can self-join/leave any team)
 * @param reservedNames - Optional list of names that cannot be used (e.g., agent names) — prevents team/agent name collisions
 * @returns Object with valid:true and sanitized corrections, or valid:false with error details
 */
export function validateTeamMutation(
  teams: Team[],
  teamId: string | null,
  data: {
    name?: string
    type?: string         // Intentionally string (not TeamType) to catch invalid values — ignored post-simplification
    chiefOfStaffId?: string | null
    agentIds?: string[]
  },
  managerId: string | null,
  reservedNames?: string[]
): { valid: true; sanitized: { name?: string; type?: TeamType; chiefOfStaffId?: string | null; agentIds?: string[] } } | { valid: false; error: string; code: number } {
  const sanitized: { name?: string; type?: TeamType; chiefOfStaffId?: string | null; agentIds?: string[] } = {}

  // --- Team Name Validation (R2.1, R2.2, R2.3) ---
  if (data.name !== undefined) {
    const clean = sanitizeTeamName(data.name)

    if (clean.length < TEAM_NAME_MIN_LENGTH) {
      return { valid: false, error: `Team name must be at least ${TEAM_NAME_MIN_LENGTH} characters`, code: 400 }
    }
    if (clean.length > TEAM_NAME_MAX_LENGTH) {
      return { valid: false, error: `Team name must be at most ${TEAM_NAME_MAX_LENGTH} characters`, code: 400 }
    }
    // Must start with letter or digit (same pattern as agent names)
    if (!/^[a-zA-Z0-9]/.test(clean)) {
      return { valid: false, error: 'Team name must start with a letter or number', code: 400 }
    }
    // Only safe display characters: letters, digits, spaces, hyphens, underscores, dots, ampersands, parens
    // CC-009: Note: \w includes underscore implicitly (equivalent to [a-zA-Z0-9_])
    if (/[^\w \-.&()]/.test(clean)) {
      return { valid: false, error: 'Team name contains invalid characters (allowed: letters, numbers, spaces, hyphens, underscores, dots, ampersands, parentheses)', code: 400 }
    }

    // Duplicate name check — case-insensitive, excludes self on update (R2.1, R2.3)
    const lowerName = clean.toLowerCase()
    const duplicate = teams.find(t => t.name.toLowerCase() === lowerName && t.id !== teamId)
    if (duplicate) {
      return { valid: false, error: `A team named "${duplicate.name}" already exists`, code: 409 }
    }

    // Agent name collision check — prevent team names that match existing agent names
    if (reservedNames && reservedNames.length > 0) {
      const collision = reservedNames.find(n => n.toLowerCase() === lowerName)
      if (collision) {
        return { valid: false, error: `Name "${collision}" is already used by an agent`, code: 409 }
      }
    }

    sanitized.name = clean
  }

  // --- TeamType is always 'closed' after governance simplification (2026-03-27) ---
  // The `type` field in data is ignored; all teams are closed.

  // Resolve effective state after this mutation is applied
  const existingTeam = teamId ? teams.find(t => t.id === teamId) : null
  const effectiveCOS = data.chiefOfStaffId !== undefined ? data.chiefOfStaffId : (existingTeam?.chiefOfStaffId ?? null)
  const effectiveAgentIds = data.agentIds ?? existingTeam?.agentIds ?? []

  // --- COS Already-Assigned-Elsewhere Check (G3, v2 Rule 7) ---
  // An agent already serving as COS of another team cannot be assigned as COS of this team
  if (effectiveCOS) {
    const alreadyCOSOf = teams.find(t => t.chiefOfStaffId === effectiveCOS && t.id !== teamId)
    if (alreadyCOSOf) {
      return { valid: false, error: `Agent is already Chief-of-Staff of team "${alreadyCOSOf.name}"`, code: 409 }
    }
  }

  // --- COS Membership Invariant (R4.6) — auto-add COS to agentIds if missing ---
  let finalAgentIds = effectiveAgentIds
  if (effectiveCOS && !effectiveAgentIds.includes(effectiveCOS)) {
    finalAgentIds = [...effectiveAgentIds, effectiveCOS]
    sanitized.agentIds = finalAgentIds
  }

  // --- COS Removal Guard (R4.7) — cannot remove COS from agentIds ---
  if (data.agentIds !== undefined && existingTeam?.chiefOfStaffId) {
    // Determine the COS after this mutation
    const cosAfterMutation = data.chiefOfStaffId !== undefined ? data.chiefOfStaffId : existingTeam.chiefOfStaffId
    if (cosAfterMutation && !data.agentIds.includes(cosAfterMutation)) {
      return { valid: false, error: 'Cannot remove the Chief-of-Staff from team members — remove the COS role first', code: 400 }
    }
  }

  // --- Single-Team Membership Constraint (R4.1, governance simplification) ---
  // Every agent can be in at most ONE team. MANAGER is exempt (can self-join/leave any team).
  for (const agentId of finalAgentIds) {
    // Skip agents already in the existing team (they're not joining a new one)
    if (existingTeam && existingTeam.agentIds.includes(agentId)) continue

    // MANAGER is exempt — can be in any team at will (self-service join/leave)
    if (agentId === managerId) continue

    // Agent must not be in another team already (single-team membership rule)
    const otherTeam = teams.find(t =>
      t.id !== teamId && t.agentIds.includes(agentId)
    )
    if (otherTeam) {
      return {
        valid: false,
        error: `Agent ${agentId} is already in team "${otherTeam.name}". Remove from that team first.`,
        code: 409,
      }
    }
  }

  // --- Propagate chiefOfStaffId into sanitized output ---
  // SF-034: If chiefOfStaffId was explicitly provided in data, carry it through to sanitized
  // so callers can rely on result.sanitized.chiefOfStaffId being the authoritative value.
  if (data.chiefOfStaffId !== undefined) {
    sanitized.chiefOfStaffId = data.chiefOfStaffId
  }

  return { valid: true, sanitized }
}

// Module-level flag: ensures migration save runs at most once per process lifetime
let migrationDone = false

const AIMAESTRO_DIR = path.join(os.homedir(), '.aimaestro')
const TEAMS_DIR = path.join(AIMAESTRO_DIR, 'teams')
const TEAMS_FILE = path.join(TEAMS_DIR, 'teams.json')

function ensureTeamsDir() {
  if (!fs.existsSync(TEAMS_DIR)) {
    fs.mkdirSync(TEAMS_DIR, { recursive: true })
  }
}

export function loadTeams(): Team[] {
  try {
    ensureTeamsDir()
    if (!fs.existsSync(TEAMS_FILE)) {
      return []
    }
    const data = fs.readFileSync(TEAMS_FILE, 'utf-8')
    const parsed: TeamsFile = JSON.parse(data)
    const teams = Array.isArray(parsed.teams) ? parsed.teams : []

    // Idempotent convergent migration: ensure all teams have type='closed'.
    // Post governance simplification (2026-03-27), all teams are closed.
    // Migrates legacy 'open' teams and teams missing the type field.
    let needsSave = false
    for (const team of teams) {
      if (team.type !== 'closed') {
        team.type = 'closed'
        needsSave = true
      }
    }
    // CC-003: Migration write is idempotent and safe without lock — worst case is a redundant write.
    // When called from getTeam() (no lock), two concurrent migrations may both write, but produce identical output.
    if (needsSave && !migrationDone) {
      migrationDone = true
      saveTeams(teams)
    }

    return teams
  } catch (error) {
    console.error('Failed to load teams:', error)
    return []
  }
}

export function saveTeams(teams: Team[]): void {
  ensureTeamsDir()
  const file: TeamsFile = { version: 1, teams }
  // Atomic write: write to temp file then rename to avoid corruption on crash
  const tmpFile = TEAMS_FILE + '.tmp.' + process.pid
  fs.writeFileSync(tmpFile, JSON.stringify(file, null, 2), 'utf-8')
  fs.renameSync(tmpFile, TEAMS_FILE)
}

export function getTeam(id: string): Team | null {
  const teams = loadTeams()
  return teams.find(t => t.id === id) || null
}

export async function createTeam(
  data: { name: string; description?: string; agentIds: string[]; type?: TeamType; chiefOfStaffId?: string },
  managerId?: string | null,
  reservedNames?: string[]
): Promise<Team> {
  const team = await withLock('teams', () => {
    const teams = loadTeams()

    // Validate all business rules before creation (name, single-team membership, COS)
    const result = validateTeamMutation(teams, null, data, managerId ?? null, reservedNames)
    if (!result.valid) {
      throw new TeamValidationException(result.error, result.code)
    }

    const now = new Date().toISOString()
    const newTeam: Team = {
      id: uuidv4(),
      name: result.sanitized.name ?? data.name,
      description: data.description,
      agentIds: result.sanitized.agentIds ?? data.agentIds,
      type: 'closed',  // All teams are closed after governance simplification
      // SF-034: Prefer sanitized COS ID if present; fall back to raw input; default to null.
      // Three-way chain: sanitized value (if validation set it) -> raw data -> null (no COS).
      // Uses !== undefined because sanitized.chiefOfStaffId can legitimately be null (explicit unset).
      chiefOfStaffId: (result.sanitized.chiefOfStaffId !== undefined
        ? result.sanitized.chiefOfStaffId
        : data.chiefOfStaffId) ?? null,
      createdAt: now,
      updatedAt: now,
    }

    teams.push(newTeam)

    // Single save: new team with validated single-team membership
    saveTeams(teams)

    return newTeam
  })
  // Fire-and-forget: broadcast team creation to mesh peers after lock is released
  broadcastGovernanceSync('team-updated', { teamId: team.id }).catch((err: unknown) => {
    console.error(`Failed to broadcast team creation for team ${team.id}:`, err)
  })
  return team
}

export async function updateTeam(
  id: string,
  updates: Partial<Pick<Team, 'name' | 'description' | 'agentIds' | 'lastMeetingAt' | 'instructions' | 'lastActivityAt' | 'type' | 'chiefOfStaffId' | 'orchestratorId' | 'githubProject' | 'kanbanConfig'>>,
  managerId?: string | null,
  reservedNames?: string[]
): Promise<Team | null> {
  const updatedTeam = await withLock('teams', () => {
    const teams = loadTeams()
    const index = teams.findIndex(t => t.id === id)
    if (index === -1) return null

    // Validate all business rules before applying the update (name, single-team membership, COS)
    // Extract only governance-relevant fields for validation (avoids unsafe Record cast)
    const govFields = { name: updates.name, type: updates.type, chiefOfStaffId: updates.chiefOfStaffId, agentIds: updates.agentIds }
    const result = validateTeamMutation(teams, id, govFields, managerId ?? null, reservedNames)
    if (!result.valid) {
      throw new TeamValidationException(result.error, result.code)
    }

    // Apply sanitized corrections (e.g., trimmed name, COS auto-added to agentIds)
    // Force type to 'closed' — all teams are closed after governance simplification
    const finalUpdates = { ...updates, ...result.sanitized, type: 'closed' as const }

    teams[index] = {
      ...teams[index],
      ...finalUpdates,
      updatedAt: new Date().toISOString(),
    }

    const result2 = teams[index]

    // Single save: includes team updates with single-team membership validation
    saveTeams(teams)

    return result2
  })
  // Fire-and-forget: broadcast team update to mesh peers after lock is released
  if (updatedTeam) {
    broadcastGovernanceSync('team-updated', { teamId: updatedTeam.id }).catch((err: unknown) => {
      console.error(`Failed to broadcast team update for team ${updatedTeam.id}:`, err)
    })
  }
  return updatedTeam
}

export async function deleteTeam(id: string): Promise<boolean> {
  const deleted = await withLock('teams', () => {
    const teams = loadTeams()
    const filtered = teams.filter(t => t.id !== id)
    if (filtered.length === teams.length) return false
    saveTeams(filtered)
    // Local task/doc files no longer exist (kanban uses GitHub Projects exclusively)
    // Document cleanup preserved for backward compatibility with any remaining docs-{id}.json files
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      const docsFile = path.join(TEAMS_DIR, path.basename(`docs-${id}.json`))
      try { if (fs.existsSync(docsFile)) fs.unlinkSync(docsFile) } catch { /* ignore */ }
    }
    return true
  })
  // Fire-and-forget: broadcast team deletion to mesh peers after lock is released
  if (deleted) {
    broadcastGovernanceSync('team-deleted', { teamId: id }).catch((err: unknown) => {
      console.error(`Failed to broadcast team deletion for team ${id}:`, err)
    })
  }
  return deleted
}

// ═══════════════════════════════════════════════════════════
// Manager-gated team blocking
// ═══════════════════════════════════════════════════════════

/**
 * Block all teams on this host. Called when MANAGER is removed or missing at startup.
 * Sets `blocked: true` on every team, then hibernates all team agents.
 * Returns the list of agent IDs that were hibernated.
 */
export async function blockAllTeams(): Promise<string[]> {
  const teams = loadTeams()
  if (teams.length === 0) return []

  // Set blocked flag on all teams
  let anyChanged = false
  for (const team of teams) {
    if (!team.blocked) {
      team.blocked = true
      team.updatedAt = new Date().toISOString()
      anyChanged = true
    }
  }
  if (anyChanged) saveTeams(teams)

  // Collect all unique agent IDs across all teams
  const teamAgentIds = new Set<string>()
  for (const team of teams) {
    for (const id of team.agentIds) teamAgentIds.add(id)
    if (team.chiefOfStaffId) teamAgentIds.add(team.chiefOfStaffId)
    if (team.orchestratorId) teamAgentIds.add(team.orchestratorId)
  }

  // Hibernate each team agent (kill tmux session)
  const hibernated: string[] = []
  for (const agentId of teamAgentIds) {
    try {
      const { getAgent } = await import('@/lib/agent-registry')
      const agent = getAgent(agentId)
      if (!agent) continue
      const sessionName = agent.name
      if (!sessionName) continue
      // Kill tmux session (hibernate)
      const { execSync } = await import('child_process')
      try {
        execSync(`tmux kill-session -t "${sessionName}" 2>/dev/null`, { timeout: 5000 })
        hibernated.push(agentId)
        console.log(`[blockAllTeams] Hibernated team agent "${sessionName}" (${agentId})`)
      } catch {
        // Session may not exist (already offline) — not an error
      }
    } catch {
      // Agent not found in registry — skip
    }
  }

  console.log(`[blockAllTeams] Blocked ${teams.length} team(s), hibernated ${hibernated.length} agent(s)`)
  return hibernated
}

/**
 * Unblock all teams on this host. Called when a MANAGER is assigned.
 * Clears `blocked` flag. Does NOT wake agents — user/MANAGER must do that manually.
 */
export function unblockAllTeams(): void {
  const teams = loadTeams()
  let anyChanged = false
  for (const team of teams) {
    if (team.blocked) {
      team.blocked = false
      team.updatedAt = new Date().toISOString()
      anyChanged = true
    }
  }
  if (anyChanged) {
    saveTeams(teams)
    console.log(`[unblockAllTeams] Unblocked ${teams.length} team(s) — agents remain hibernated until manually woken`)
  }
}

/**
 * Check if an agent belongs to any team (used by wake guard).
 */
export function isAgentInAnyTeam(agentId: string): boolean {
  const teams = loadTeams()
  return teams.some(t =>
    t.agentIds.includes(agentId) ||
    t.chiefOfStaffId === agentId ||
    t.orchestratorId === agentId
  )
}
