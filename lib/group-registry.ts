/**
 * Group Registry - File-based CRUD for group persistence
 *
 * Storage: ~/.aimaestro/teams/groups.json
 * Mirrors the pattern from lib/team-registry.ts but without governance.
 */

import fs from 'fs'
import path from 'path'
import os from 'os'
import { v4 as uuidv4 } from 'uuid'
import type { Group, GroupsFile } from '@/types/group'
// TeamsFile type not used — migration reads raw JSON to handle legacy 'open' type values
import { withLock } from '@/lib/file-lock'

// --- Group Name Validation Constants ---
const GROUP_NAME_MIN_LENGTH = 2
const GROUP_NAME_MAX_LENGTH = 64

/** Error thrown when group validation fails — caught by API routes to return proper HTTP status */
export class GroupValidationException extends Error {
  code: number
  constructor(message: string, code: number) {
    super(message)
    this.name = 'GroupValidationException'
    this.code = code
  }
}

/**
 * Sanitize a group name: strip control chars, collapse whitespace, trim.
 * Same sanitization approach used by team-registry.ts.
 */
function sanitizeGroupName(raw: string): string {
  return raw
    .replace(/[\x00-\x1F\x7F]/g, '')  // Strip control characters
    .replace(/\s+/g, ' ')              // Collapse all whitespace into single space
    .trim()
}

// --- Storage Paths ---
const AIMAESTRO_DIR = path.join(os.homedir(), '.aimaestro')
const TEAMS_DIR = path.join(AIMAESTRO_DIR, 'teams')
const GROUPS_FILE = path.join(TEAMS_DIR, 'groups.json')
const TEAMS_FILE = path.join(TEAMS_DIR, 'teams.json')
const MIGRATION_MARKER = path.join(TEAMS_DIR, '.groups-migrated')

function ensureTeamsDir() {
  if (!fs.existsSync(TEAMS_DIR)) {
    fs.mkdirSync(TEAMS_DIR, { recursive: true })
  }
}

// ---------------------------------------------------------------------------
// Migration: convert legacy open teams to groups (runs once per install)
// ---------------------------------------------------------------------------

// Module-level flag: prevents repeated migration checks within the same process
let migrationChecked = false

/**
 * One-time migration: reads teams.json, finds teams with type === 'open' or
 * type === undefined (pre-governance-simplification legacy teams), creates a
 * corresponding Group for each, removes them from teams.json, and writes a
 * marker file so the migration never runs again.
 *
 * Both files are written atomically (temp + rename) to avoid corruption.
 * The marker file (~/.aimaestro/teams/.groups-migrated) is the durable guard.
 */
function migrateOpenTeamsToGroups(): void {
  // Fast check: skip if marker file already exists
  if (fs.existsSync(MIGRATION_MARKER)) return

  ensureTeamsDir()

  // Read teams.json — if it doesn't exist, nothing to migrate
  if (!fs.existsSync(TEAMS_FILE)) {
    // Write marker so we never check again
    fs.writeFileSync(MIGRATION_MARKER, new Date().toISOString(), 'utf-8')
    return
  }

  // Parse raw JSON without strict Team typing — we need to read the 'type' field
  // which may be 'open' or undefined (values that the current Team type doesn't allow)
  let teamsRaw: { teams?: Array<Record<string, unknown>> }
  try {
    teamsRaw = JSON.parse(fs.readFileSync(TEAMS_FILE, 'utf-8'))
  } catch {
    // Corrupt teams.json — write marker and bail, don't block startup
    fs.writeFileSync(MIGRATION_MARKER, new Date().toISOString(), 'utf-8')
    return
  }

  const allTeams = Array.isArray(teamsRaw.teams) ? teamsRaw.teams : []

  // Find teams that are open or have no type (legacy open teams)
  const openTeams = allTeams.filter(
    t => t.type === 'open' || t.type === undefined
  )

  if (openTeams.length === 0) {
    // No open teams — write marker and return
    fs.writeFileSync(MIGRATION_MARKER, new Date().toISOString(), 'utf-8')
    return
  }

  // Load existing groups (if any)
  let existingGroups: Group[] = []
  try {
    if (fs.existsSync(GROUPS_FILE)) {
      const gData: GroupsFile = JSON.parse(fs.readFileSync(GROUPS_FILE, 'utf-8'))
      existingGroups = Array.isArray(gData.groups) ? gData.groups : []
    }
  } catch {
    existingGroups = []
  }

  const now = new Date().toISOString()
  const newGroups: Group[] = []

  for (const team of openTeams) {
    // Skip if a group with the same name already exists (case-insensitive)
    const nameLower = (String(team.name || '')).toLowerCase()
    if (existingGroups.some(g => g.name.toLowerCase() === nameLower)) {
      continue
    }
    if (newGroups.some(g => g.name.toLowerCase() === nameLower)) {
      continue
    }

    newGroups.push({
      id: uuidv4(),
      name: String(team.name || `Migrated-Group-${uuidv4().slice(0, 8)}`),
      description: String(team.description || `Migrated from open team "${team.name}"`),
      subscriberIds: Array.isArray(team.agentIds) ? (team.agentIds as string[]) : [],
      createdAt: String(team.createdAt || now),
      updatedAt: now,
    })
  }

  // Remove migrated open teams from teams.json
  const openTeamIds = new Set(openTeams.map(t => String(t.id)))
  const remainingTeams = allTeams.filter(t => !openTeamIds.has(String(t.id)))

  // Write groups.json atomically
  const allGroups = [...existingGroups, ...newGroups]
  const groupsFile: GroupsFile = { version: 1, groups: allGroups }
  const groupsTmp = GROUPS_FILE + '.tmp.' + process.pid
  fs.writeFileSync(groupsTmp, JSON.stringify(groupsFile, null, 2), 'utf-8')
  fs.renameSync(groupsTmp, GROUPS_FILE)

  // Write teams.json atomically (without the migrated open teams)
  const teamsFile = { version: 1, teams: remainingTeams }
  const teamsTmp = TEAMS_FILE + '.tmp.' + process.pid
  fs.writeFileSync(teamsTmp, JSON.stringify(teamsFile, null, 2), 'utf-8')
  fs.renameSync(teamsTmp, TEAMS_FILE)

  // Write marker file so migration never runs again
  fs.writeFileSync(MIGRATION_MARKER, now, 'utf-8')

  console.log(
    `[group-registry] Migrated ${newGroups.length} open team(s) to groups: ` +
    newGroups.map(g => g.name).join(', ')
  )
}

// ---------------------------------------------------------------------------
// Load / Save
// ---------------------------------------------------------------------------

export function loadGroups(): Group[] {
  try {
    ensureTeamsDir()

    // Lazy one-time migration: convert legacy open teams to groups (locked to prevent races)
    if (!migrationChecked) {
      migrationChecked = true
      try {
        withLock('groups-migration', () => { migrateOpenTeamsToGroups() })
      } catch (err) {
        // Migration failure must not block normal group loading
        console.error('[group-registry] Migration failed (non-fatal):', err)
      }
    }

    if (!fs.existsSync(GROUPS_FILE)) {
      return []
    }
    const data = fs.readFileSync(GROUPS_FILE, 'utf-8')
    const parsed: GroupsFile = JSON.parse(data)
    return Array.isArray(parsed.groups) ? parsed.groups : []
  } catch (error) {
    console.error('Failed to load groups:', error)
    return []
  }
}

export function saveGroups(groups: Group[]): void {
  ensureTeamsDir()
  const file: GroupsFile = { version: 1, groups }
  // Atomic write: write to temp file then rename to avoid corruption on crash
  const tmpFile = GROUPS_FILE + '.tmp.' + process.pid
  fs.writeFileSync(tmpFile, JSON.stringify(file, null, 2), 'utf-8')
  fs.renameSync(tmpFile, GROUPS_FILE)
}

// ---------------------------------------------------------------------------
// CRUD Operations
// ---------------------------------------------------------------------------

export function getGroup(id: string): Group | null {
  const groups = loadGroups()
  return groups.find(g => g.id === id) || null
}

/**
 * Validate group name and check uniqueness (case-insensitive).
 * Throws GroupValidationException on invalid input.
 */
function validateGroupName(name: string, groups: Group[], excludeId: string | null): string {
  const clean = sanitizeGroupName(name)

  if (clean.length < GROUP_NAME_MIN_LENGTH) {
    throw new GroupValidationException(
      `Group name must be at least ${GROUP_NAME_MIN_LENGTH} characters`,
      400
    )
  }
  if (clean.length > GROUP_NAME_MAX_LENGTH) {
    throw new GroupValidationException(
      `Group name must be at most ${GROUP_NAME_MAX_LENGTH} characters`,
      400
    )
  }
  // Must start with letter or digit
  if (!/^[a-zA-Z0-9]/.test(clean)) {
    throw new GroupValidationException('Group name must start with a letter or number', 400)
  }

  // Duplicate name check — case-insensitive, excludes self on update
  const lowerName = clean.toLowerCase()
  const duplicate = groups.find(g => g.name.toLowerCase() === lowerName && g.id !== excludeId)
  if (duplicate) {
    throw new GroupValidationException(`A group named "${duplicate.name}" already exists`, 409)
  }

  return clean
}

export async function createGroup(
  data: { name: string; description?: string; subscriberIds?: string[] }
): Promise<Group> {
  return withLock('groups', () => {
    const groups = loadGroups()

    // Validate name and uniqueness
    const cleanName = validateGroupName(data.name, groups, null)

    const now = new Date().toISOString()
    const newGroup: Group = {
      id: uuidv4(),
      name: cleanName,
      description: data.description,
      subscriberIds: data.subscriberIds ?? [],
      createdAt: now,
      updatedAt: now,
    }

    groups.push(newGroup)
    saveGroups(groups)

    return newGroup
  })
}

export async function updateGroup(
  id: string,
  updates: Partial<Pick<Group, 'name' | 'description' | 'subscriberIds' | 'lastMeetingAt'>>
): Promise<Group | null> {
  return withLock('groups', () => {
    const groups = loadGroups()
    const index = groups.findIndex(g => g.id === id)
    if (index === -1) return null

    // Validate name uniqueness if name is being changed
    if (updates.name !== undefined) {
      const cleanName = validateGroupName(updates.name, groups, id)
      updates = { ...updates, name: cleanName }
    }

    groups[index] = {
      ...groups[index],
      ...updates,
      updatedAt: new Date().toISOString(),
    }

    const result = groups[index]
    saveGroups(groups)

    return result
  })
}

export async function deleteGroup(id: string): Promise<boolean> {
  return withLock('groups', () => {
    const groups = loadGroups()
    const filtered = groups.filter(g => g.id !== id)
    if (filtered.length === groups.length) return false
    saveGroups(filtered)
    return true
  })
}

/**
 * Add an agent to a group's subscriberIds inside the file lock.
 * Idempotent — returns the group unchanged if the agent is already subscribed.
 * Returns null if the group does not exist.
 */
export async function addSubscriber(groupId: string, agentId: string): Promise<Group | null> {
  return withLock('groups', () => {
    const groups = loadGroups()
    const index = groups.findIndex(g => g.id === groupId)
    if (index === -1) return null

    // Idempotent: skip if already subscribed
    if (groups[index].subscriberIds.includes(agentId)) {
      return groups[index]
    }

    groups[index] = {
      ...groups[index],
      subscriberIds: [...groups[index].subscriberIds, agentId],
      updatedAt: new Date().toISOString(),
    }

    saveGroups(groups)
    return groups[index]
  })
}

/**
 * Remove an agent from a group's subscriberIds inside the file lock.
 * Idempotent — returns the group unchanged if the agent is not subscribed.
 * Returns null if the group does not exist.
 */
export async function removeSubscriber(groupId: string, agentId: string): Promise<Group | null> {
  return withLock('groups', () => {
    const groups = loadGroups()
    const index = groups.findIndex(g => g.id === groupId)
    if (index === -1) return null

    // Idempotent: skip if not subscribed
    if (!groups[index].subscriberIds.includes(agentId)) {
      return groups[index]
    }

    groups[index] = {
      ...groups[index],
      subscriberIds: groups[index].subscriberIds.filter(id => id !== agentId),
      updatedAt: new Date().toISOString(),
    }

    saveGroups(groups)
    return groups[index]
  })
}
