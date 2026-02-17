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
 * Rules enforced:
 * - R1.3/R1.4: Closed team must have a COS (COS-closed invariant)
 * - R1.7: TeamType must be 'open' or 'closed'
 * - R1.8: COS can only be set on a closed team
 * - R2.1/R2.3: Team names must be unique (case-insensitive)
 * - R4.1: Normal agents can be in at most one closed team
 * - R4.6: COS must be a member of the team (auto-added to agentIds)
 * - R4.7: Cannot remove COS from agentIds while they are chiefOfStaffId
 * - Team name sanitization: min 4 chars, max 64 chars, alphanumeric start, safe characters only
 *
 * @param teams - Current teams list (for uniqueness and multi-closed checks)
 * @param teamId - null for create, team ID for update
 * @param data - Proposed team data or updates
 * @param managerId - Current MANAGER agent ID (for multi-closed-team exemption check)
 * @param reservedNames - Optional list of names that cannot be used (e.g., agent names) — prevents team/agent name collisions
 * @returns Object with valid:true and sanitized corrections, or valid:false with error details
 */
export function validateTeamMutation(
  teams: Team[],
  teamId: string | null,
  data: {
    name?: string
    type?: string         // Intentionally string (not TeamType) to catch invalid values
    chiefOfStaffId?: string | null
    agentIds?: string[]
  },
  managerId: string | null,
  reservedNames?: string[]
): { valid: true; sanitized: Record<string, unknown> } | { valid: false; error: string; code: number } {
  const sanitized: Record<string, unknown> = {}

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

  // --- TeamType Validation (R1.7) ---
  if (data.type !== undefined) {
    if (data.type !== 'open' && data.type !== 'closed') {
      return { valid: false, error: `Invalid team type: "${data.type}" (must be "open" or "closed")`, code: 400 }
    }
  }

  // Resolve effective state after this mutation is applied
  const existingTeam = teamId ? teams.find(t => t.id === teamId) : null
  const effectiveType = (data.type ?? existingTeam?.type ?? 'open') as string
  const effectiveCOS = data.chiefOfStaffId !== undefined ? data.chiefOfStaffId : (existingTeam?.chiefOfStaffId ?? null)
  const effectiveAgentIds = data.agentIds ?? existingTeam?.agentIds ?? []

  // --- COS-Closed Invariant (R1.3, R1.4) ---
  if (effectiveType === 'closed' && !effectiveCOS) {
    return { valid: false, error: 'A closed team must have a Chief-of-Staff assigned', code: 400 }
  }
  // --- COS on open team is invalid (R1.8) ---
  if (effectiveType === 'open' && effectiveCOS) {
    return { valid: false, error: 'Cannot assign a Chief-of-Staff to an open team (change type to closed first)', code: 400 }
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

  // --- Multi-Closed-Team Constraint for Normal Agents (R4.1) ---
  // MANAGER (R4.3) and COS (R4.4) are exempt and can be in multiple closed teams
  if (effectiveType === 'closed') {
    for (const agentId of finalAgentIds) {
      // Skip agents already in the existing team (not newly added)
      if (existingTeam?.agentIds.includes(agentId)) continue

      // MANAGER is exempt (R4.3)
      if (agentId === managerId) continue
      // Agent being assigned as COS in this mutation is exempt (R4.4)
      if (agentId === effectiveCOS) continue
      // Agent who is COS in any existing team is exempt (R4.4)
      const isCOSAnywhere = teams.some(t => t.chiefOfStaffId === agentId)
      if (isCOSAnywhere) continue

      // Normal agent: must not be in another closed team already
      const otherClosedTeam = teams.find(t =>
        t.type === 'closed' && t.id !== teamId && t.agentIds.includes(agentId)
      )
      if (otherClosedTeam) {
        return {
          valid: false,
          error: `Agent ${agentId} is already in closed team "${otherClosedTeam.name}" — normal agents can only be in one closed team`,
          code: 409,
        }
      }
    }
  }

  return { valid: true, sanitized }
}

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

    // One-time idempotent migration: safe without lock because migration is append-only and convergent
    // Migration: ensure all teams have a type field (default to 'open')
    let needsSave = false
    for (const team of teams) {
      if (!team.type) {
        team.type = 'open'
        needsSave = true
      }
    }
    if (needsSave) {
      saveTeams(teams)
    }

    return teams
  } catch (error) {
    console.error('Failed to load teams:', error)
    return []
  }
}

export function saveTeams(teams: Team[]): boolean {
  try {
    ensureTeamsDir()
    const file: TeamsFile = { version: 1, teams }
    fs.writeFileSync(TEAMS_FILE, JSON.stringify(file, null, 2), 'utf-8')
    return true
  } catch (error) {
    console.error('Failed to save teams:', error)
    return false
  }
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
  return withLock('teams', () => {
    const teams = loadTeams()

    // Validate all business rules before creation (R1-R4, name sanitization, agent name collision)
    const result = validateTeamMutation(teams, null, data, managerId ?? null, reservedNames)
    if (!result.valid) {
      throw new TeamValidationException(result.error, result.code)
    }

    const now = new Date().toISOString()
    const team: Team = {
      id: uuidv4(),
      name: (result.sanitized.name as string) ?? data.name,
      description: data.description,
      agentIds: (result.sanitized.agentIds as string[]) ?? data.agentIds,
      type: data.type || 'open',
      chiefOfStaffId: data.chiefOfStaffId,
      createdAt: now,
      updatedAt: now,
    }

    teams.push(team)
    saveTeams(teams)
    return team
  })
}

export async function updateTeam(
  id: string,
  updates: Partial<Pick<Team, 'name' | 'description' | 'agentIds' | 'lastMeetingAt' | 'instructions' | 'lastActivityAt' | 'type' | 'chiefOfStaffId'>>,
  managerId?: string | null
): Promise<Team | null> {
  return withLock('teams', () => {
    const teams = loadTeams()
    const index = teams.findIndex(t => t.id === id)
    if (index === -1) return null

    // Validate all business rules before applying the update (R1-R4, name sanitization)
    // Extract only governance-relevant fields for validation (avoids unsafe Record cast)
    const govFields = { name: updates.name, type: updates.type, chiefOfStaffId: updates.chiefOfStaffId, agentIds: updates.agentIds }
    const result = validateTeamMutation(teams, id, govFields, managerId ?? null)
    if (!result.valid) {
      throw new TeamValidationException(result.error, result.code)
    }

    // Apply sanitized corrections (e.g., trimmed name, COS auto-added to agentIds)
    const finalUpdates = { ...updates, ...result.sanitized }

    teams[index] = {
      ...teams[index],
      ...finalUpdates,
      updatedAt: new Date().toISOString(),
    }

    saveTeams(teams)
    return teams[index]
  })
}

export async function deleteTeam(id: string): Promise<boolean> {
  return withLock('teams', () => {
    const teams = loadTeams()
    const filtered = teams.filter(t => t.id !== id)
    if (filtered.length === teams.length) return false
    saveTeams(filtered)
    // Clean up orphaned task file for the deleted team
    // Defense-in-depth: validate UUID format before constructing file path to prevent path traversal
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      const taskFile = path.join(TEAMS_DIR, path.basename(`tasks-${id}.json`))
      try { if (fs.existsSync(taskFile)) fs.unlinkSync(taskFile) } catch { /* ignore */ }
    }
    return true
  })
}
