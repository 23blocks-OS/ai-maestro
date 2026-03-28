/**
 * Governance Library - Password management, manager role, and team role checks
 *
 * Storage: ~/.aimaestro/governance.json
 * Follows the same synchronous file I/O pattern as lib/team-registry.ts
 */

import fs from 'fs'
import path from 'path'
import os from 'os'
import bcrypt from 'bcryptjs'
import { loadTeams, getTeam } from './team-registry'
import { withLock } from '@/lib/file-lock'
import type { GovernanceConfig } from '@/types/governance'
import { DEFAULT_GOVERNANCE_CONFIG } from '@/types/governance'
import { broadcastGovernanceSync } from '@/lib/governance-sync'
import type { Team } from '@/types/team'

const AIMAESTRO_DIR = path.join(os.homedir(), '.aimaestro')
const GOVERNANCE_FILE = path.join(AIMAESTRO_DIR, 'governance.json')

const BCRYPT_SALT_ROUNDS = 12

/** Ensure ~/.aimaestro directory exists */
function ensureAimaestroDir() {
  if (!fs.existsSync(AIMAESTRO_DIR)) {
    fs.mkdirSync(AIMAESTRO_DIR, { recursive: true })
  }
}

/** Load governance config from disk, creating with defaults if missing */
export function loadGovernance(): GovernanceConfig {
  ensureAimaestroDir()
  if (!fs.existsSync(GOVERNANCE_FILE)) {
    // First-time initialization: write defaults and return them
    saveGovernance(DEFAULT_GOVERNANCE_CONFIG)
    return { ...DEFAULT_GOVERNANCE_CONFIG }
  }
  try {
    const data = fs.readFileSync(GOVERNANCE_FILE, 'utf-8')
    const parsed: GovernanceConfig = JSON.parse(data)
    // SF-025: Runtime version check -- TypeScript literal type `1` is not enforced after JSON.parse
    // NT-021: Version mismatch is NOT healed (unlike JSON corruption) because it may indicate
    // a deliberate schema upgrade from a newer version. Healing would destroy newer-format data.
    // Instead, return defaults and log prominently so the operator can migrate manually.
    if (parsed.version !== 1) {
      console.error(`[governance] Unsupported config version: ${parsed.version} (expected 1). Returning defaults. File NOT overwritten -- manual migration required: ${GOVERNANCE_FILE}`)
      return { ...DEFAULT_GOVERNANCE_CONFIG }
    }
    return parsed
  } catch (error) {
    // Distinguish read errors from parse errors — parse errors indicate disk corruption
    if (error instanceof SyntaxError) {
      console.error('[governance] CORRUPTION: governance.json contains invalid JSON — returning defaults. Manual inspection required:', GOVERNANCE_FILE)
      // Backup corrupted file before returning defaults to prevent silent data loss
      try {
        const backupPath = GOVERNANCE_FILE + '.corrupted.' + Date.now()
        fs.copyFileSync(GOVERNANCE_FILE, backupPath)
        console.error(`[governance] Corrupted config backed up to ${backupPath}`)
      } catch { /* backup is best-effort */ }
      // Heal the corrupted file by writing defaults, matching the first-time init path (lines 34-36)
      saveGovernance(DEFAULT_GOVERNANCE_CONFIG)
    } else {
      // NT-029: Distinguish ENOENT (expected on first run race) from permission/other errors.
      // EACCES or other I/O errors are logged at error level to surface misconfiguration.
      const code = (error as NodeJS.ErrnoException).code
      if (code === 'ENOENT') {
        // File was deleted between existsSync and readFileSync — treat as first-time init
        console.warn('[governance] governance.json disappeared between check and read — reinitializing defaults')
        saveGovernance(DEFAULT_GOVERNANCE_CONFIG)
      } else {
        console.error(`[governance] Failed to read governance config (${code ?? 'unknown'}):`, error)
      }
    }
    return { ...DEFAULT_GOVERNANCE_CONFIG }
  }
}

/** Write governance config to disk using atomic temp-file-then-rename pattern */
export function saveGovernance(config: GovernanceConfig): void {
  // Fail-fast: let errors propagate to callers (all wrapped in withLock try/catch)
  ensureAimaestroDir()
  // Atomic write: write to temp file then rename to avoid corruption on crash
  // SF-040: Include process.pid for multi-process safety
  const tmpFile = GOVERNANCE_FILE + `.tmp.${process.pid}`
  fs.writeFileSync(tmpFile, JSON.stringify(config, null, 2), 'utf-8')
  fs.renameSync(tmpFile, GOVERNANCE_FILE)
}

/** Set governance password (bcrypt hash with 12 salt rounds) */
export async function setPassword(plaintext: string): Promise<void> {
  return withLock('governance', async () => {
    const config = loadGovernance()
    config.passwordHash = await bcrypt.hash(plaintext, BCRYPT_SALT_ROUNDS)
    config.passwordSetAt = new Date().toISOString()
    saveGovernance(config)
  })
}

// Phase 1: No lock on read. Minor TOCTOU with setPassword(). Acceptable for single-user localhost.
// Returns false for both 'no password set' and 'wrong password'.
// Callers should check hasPassword (config.passwordHash) separately if they need to distinguish.
/** Verify plaintext against stored password hash. Returns false if no password set. */
export async function verifyPassword(plaintext: string): Promise<boolean> {
  const config = loadGovernance()
  if (!config.passwordHash) {
    // Phase 1 (localhost-only): timing difference between "no password" and "wrong password"
    // is accepted risk. No remote attackers can observe timing in this deployment model.
    return false
  }
  return bcrypt.compare(plaintext, config.passwordHash)
}

// Phase 1: Re-reads governance.json per call. Acceptable for localhost. TODO Phase 2: Add in-memory caching.
/** Get the current manager agent ID, or null if none set */
export function getManagerId(): string | null {
  const config = loadGovernance()
  return config.managerId
}

/** Set the manager agent ID and persist, then broadcast to mesh peers */
export async function setManager(agentId: string): Promise<void> {
  await withLock('governance', () => {
    const config = loadGovernance()
    config.managerId = agentId
    saveGovernance(config)
  })
  // Fire-and-forget: broadcast manager change to mesh peers after lock is released
  broadcastGovernanceSync('manager-changed', { agentId }).catch(() => {})
}

/** Remove the manager (set to null) and persist, then broadcast to mesh peers */
export async function removeManager(): Promise<void> {
  await withLock('governance', () => {
    const config = loadGovernance()
    config.managerId = null
    saveGovernance(config)
  })
  // Fire-and-forget: broadcast manager removal to mesh peers after lock is released
  broadcastGovernanceSync('manager-changed', { agentId: null }).catch(() => {})
}

// Phase 1: Re-reads governance.json per call. Acceptable for localhost. TODO Phase 2: Add in-memory caching.
/** Check if agentId is the singleton manager */
export function isManager(agentId: string): boolean {
  const config = loadGovernance()
  // Guard against null === null: both must be non-null strings for a valid match
  if (!config.managerId || !agentId) return false
  return config.managerId === agentId
}

// Phase 1: Re-reads governance.json per call. Acceptable for localhost. TODO Phase 2: Add in-memory caching.
/** Check if agentId is chief-of-staff for a specific team */
export function isChiefOfStaff(agentId: string, teamId: string): boolean {
  // Guard against null/undefined agentId to prevent false positive from null === null
  // (mirrors the defensive pattern in isManager above)
  if (!agentId) return false
  const team = getTeam(teamId)
  if (!team) return false
  return team.chiefOfStaffId === agentId
}

// Phase 1: Re-reads governance.json per call. Acceptable for localhost. TODO Phase 2: Add in-memory caching.
/** Check if agentId is chief-of-staff in any team */
export function isChiefOfStaffAnywhere(agentId: string): boolean {
  // NT-014: Guard against null/undefined to prevent false positive from null === null
  if (!agentId) return false
  const teams = loadTeams()
  // All teams are closed after governance simplification — no type filter needed
  return teams.some(
    (team) => team.chiefOfStaffId === agentId
  )
}

/** Check if agentId is the orchestrator for a specific team */
export function isOrchestrator(agentId: string, teamId: string): boolean {
  // Guard against null/undefined agentId to prevent false positive from null === null
  if (!agentId) return false
  const team = getTeam(teamId)
  if (!team) return false
  return team.orchestratorId === agentId
}

/** Check if agentId is an orchestrator in any team */
export function isOrchestratorAnywhere(agentId: string): boolean {
  // Guard against null/undefined to prevent false positive from null === null
  if (!agentId) return false
  const teams = loadTeams()
  return teams.some(
    (team) => team.orchestratorId === agentId
  )
}

// Phase 1: Re-reads governance.json per call. Acceptable for localhost. TODO Phase 2: Add in-memory caching.
/** Get the team where agentId is a member (agents belong to at most one team) */
export function getClosedTeamForAgent(agentId: string): Team | null {
  // NT-014: Guard against null/undefined to prevent includes(null) false positives
  if (!agentId) return null
  const teams = loadTeams()
  // All teams are closed after governance simplification — no type filter needed
  return (
    teams.find(
      (team) => team.agentIds.includes(agentId)
    ) || null
  )
}

/**
 * Get the team where agentId is a member (singular — agents belong to at most one team).
 * Alias for getClosedTeamForAgent after governance simplification (all teams are closed).
 */
export function getTeamForAgent(agentId: string): Team | null {
  return getClosedTeamForAgent(agentId)
}

// Phase 1: Re-reads governance.json per call. Acceptable for localhost. TODO Phase 2: Add in-memory caching.
/**
 * Get all teams where agentId is a member.
 * Post-simplification: returns 0 or 1 team for normal agents.
 * MANAGER may appear in one team if they self-joined.
 * @deprecated Use getClosedTeamForAgent / getTeamForAgent (singular) instead.
 */
export function getClosedTeamsForAgent(agentId: string): Team[] {
  // NT-014: Guard against null/undefined to prevent includes(null) false positives
  if (!agentId) return []
  const teams = loadTeams()
  // All teams are closed — no type filter needed
  return teams.filter(
    (team) => team.agentIds.includes(agentId)
  )
}
