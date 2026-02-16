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
import type { GovernanceConfig } from '@/types/governance'
import { DEFAULT_GOVERNANCE_CONFIG } from '@/types/governance'
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
  try {
    ensureAimaestroDir()
    if (!fs.existsSync(GOVERNANCE_FILE)) {
      // First-time initialization: write defaults and return them
      saveGovernance(DEFAULT_GOVERNANCE_CONFIG)
      return { ...DEFAULT_GOVERNANCE_CONFIG }
    }
    const data = fs.readFileSync(GOVERNANCE_FILE, 'utf-8')
    const parsed: GovernanceConfig = JSON.parse(data)
    return parsed
  } catch (error) {
    console.error('Failed to load governance config:', error)
    return { ...DEFAULT_GOVERNANCE_CONFIG }
  }
}

/** Write governance config to disk */
export function saveGovernance(config: GovernanceConfig): boolean {
  try {
    ensureAimaestroDir()
    fs.writeFileSync(GOVERNANCE_FILE, JSON.stringify(config, null, 2), 'utf-8')
    return true
  } catch (error) {
    console.error('Failed to save governance config:', error)
    return false
  }
}

/** Set governance password (bcrypt hash with 12 salt rounds) */
export function setPassword(plaintext: string): void {
  const config = loadGovernance()
  config.passwordHash = bcrypt.hashSync(plaintext, BCRYPT_SALT_ROUNDS)
  config.passwordSetAt = new Date().toISOString()
  saveGovernance(config)
}

/** Verify plaintext against stored password hash. Returns false if no password set. */
export function verifyPassword(plaintext: string): boolean {
  const config = loadGovernance()
  if (!config.passwordHash) {
    return false
  }
  return bcrypt.compareSync(plaintext, config.passwordHash)
}

/** Get the current manager agent ID, or null if none set */
export function getManagerId(): string | null {
  const config = loadGovernance()
  return config.managerId
}

/** Set the manager agent ID and persist */
export function setManager(agentId: string): void {
  const config = loadGovernance()
  config.managerId = agentId
  saveGovernance(config)
}

/** Remove the manager (set to null) and persist */
export function removeManager(): void {
  const config = loadGovernance()
  config.managerId = null
  saveGovernance(config)
}

/** Check if agentId is the singleton manager */
export function isManager(agentId: string): boolean {
  const config = loadGovernance()
  return config.managerId === agentId
}

/** Check if agentId is chief-of-staff for a specific team */
export function isChiefOfStaff(agentId: string, teamId: string): boolean {
  const team = getTeam(teamId)
  if (!team) return false
  return team.chiefOfStaffId === agentId
}

/** Check if agentId is chief-of-staff in any closed team */
export function isChiefOfStaffAnywhere(agentId: string): boolean {
  const teams = loadTeams()
  return teams.some(
    (team) => team.type === 'closed' && team.chiefOfStaffId === agentId
  )
}

/** Get the first closed team where agentId is a member (normal agents belong to at most one) */
export function getClosedTeamForAgent(agentId: string): Team | null {
  const teams = loadTeams()
  return (
    teams.find(
      (team) => team.type === 'closed' && team.agentIds.includes(agentId)
    ) || null
  )
}

/** Get all closed teams where agentId is a member (MANAGER/COS can be in multiple) */
export function getClosedTeamsForAgent(agentId: string): Team[] {
  const teams = loadTeams()
  return teams.filter(
    (team) => team.type === 'closed' && team.agentIds.includes(agentId)
  )
}
