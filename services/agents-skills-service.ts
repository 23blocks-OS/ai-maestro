/**
 * Agents Skills Service
 *
 * Business logic for agent skill management (marketplace, custom, AI Maestro).
 * Routes are thin wrappers that call these functions.
 */

import {
  getAgentSkills,
  addMarketplaceSkills,
  removeMarketplaceSkills,
  addCustomSkill,
  removeCustomSkill,
  updateAiMaestroSkills,
  getAgent,
} from '@/lib/agent-registry'
import { getSkillById } from '@/lib/marketplace-skills'
import { agentRegistry } from '@/lib/agent'
import { isManager, isChiefOfStaff, getClosedTeamsForAgent } from '@/lib/governance'
import { isValidUuid } from '@/lib/validation'
import type { ConfigOperationType, ConfigScope } from '@/types/governance-request'
import fs from 'fs/promises'
import path from 'path'

// ── Types ───────────────────────────────────────────────────────────────────

import { ServiceResult } from '@/types/service'
export type { ServiceResult }

// ── Governance ──────────────────────────────────────────────────────────────

/**
 * Check if the requesting agent has governance permission for the config operation.
 * Returns null if allowed, or a ServiceResult error if denied.
 *
 * Phase 1 backward compat: if requestingAgentId is null (no auth header),
 * governance is NOT enforced -- same opt-in pattern as agents-core-service.ts.
 */
function checkConfigGovernance(
  agentId: string,
  requestingAgentId: string | null,
  operation: ConfigOperationType,
  scope: ConfigScope = 'local'
): ServiceResult<void> | null {
  // No auth header = no governance enforcement (Phase 1 backward compat)
  if (requestingAgentId === null) return null

  // user/project scope: MANAGER only
  if (scope === 'user' || scope === 'project') {
    if (!isManager(requestingAgentId)) {
      return { error: `Only the MANAGER can modify ${scope}-scope configuration`, status: 403 }
    }
    return null
  }

  // local scope: MANAGER always allowed
  if (isManager(requestingAgentId)) return null

  // local scope: COS allowed only for agents in their team(s)
  const targetTeams = getClosedTeamsForAgent(agentId)
  for (const team of targetTeams) {
    if (isChiefOfStaff(requestingAgentId, team.id)) {
      return null
    }
  }

  // If target agent is not in any closed team, only MANAGER can configure
  if (targetTeams.length === 0) {
    return { error: 'Only the MANAGER can configure agents not in a closed team', status: 403 }
  }

  return { error: 'Insufficient governance permissions. Must be MANAGER or COS of the agent\'s team.', status: 403 }
}

// ── Public Functions ────────────────────────────────────────────────────────

/**
 * Get agent's current skills configuration.
 */
export function getSkillsConfig(agentId: string): ServiceResult<Record<string, unknown>> {
  const skills = getAgentSkills(agentId)
  if (!skills) {
    return { error: 'Agent not found', status: 404 }
  }
  return { data: skills as unknown as Record<string, unknown>, status: 200 }
}

/**
 * Update agent's skills - add/remove marketplace skills, update AI Maestro config.
 */
export async function updateSkills(
  agentId: string,
  body: { add?: string[]; remove?: string[]; aiMaestro?: { enabled?: boolean; skills?: string[] } },
  requestingAgentId: string | null = null
): Promise<ServiceResult<Record<string, unknown>>> {
  // NT-008: getAgent (sync, file-based registry) used here for RBAC/governance checks
  const agent = getAgent(agentId)
  if (!agent) {
    return { error: 'Agent not found', status: 404 }
  }

  // SF-004: Layer 5 governance RBAC -- choose operation type based on which fields are present
  const govOperation: ConfigOperationType = body.remove && !body.add
    ? 'remove-skill'
    : body.add && body.remove
      ? 'bulk-config'
      : 'add-skill'
  const govCheck = checkConfigGovernance(agentId, requestingAgentId, govOperation)
  if (govCheck) return govCheck as ServiceResult<Record<string, unknown>>

  // Handle skill additions
  if (body.add && Array.isArray(body.add) && body.add.length > 0) {
    const skillsToAdd: Array<{
      id: string
      marketplace: string
      plugin: string
      name: string
      version?: string
    }> = []

    for (const skillId of body.add) {
      const skill = await getSkillById(skillId, false)
      if (!skill) {
        return { error: `Skill not found: ${skillId}`, status: 400 }
      }
      skillsToAdd.push({
        id: skill.id,
        marketplace: skill.marketplace,
        plugin: skill.plugin,
        name: skill.name,
        version: skill.version,
      })
    }

    const result = await addMarketplaceSkills(agentId, skillsToAdd)
    if (!result) {
      return { error: 'Failed to add skills', status: 500 }
    }
  }

  // Handle skill removals
  if (body.remove && Array.isArray(body.remove) && body.remove.length > 0) {
    const result = await removeMarketplaceSkills(agentId, body.remove)
    if (!result) {
      return { error: 'Failed to remove skills', status: 500 }
    }
  }

  // Handle AI Maestro config update
  if (body.aiMaestro) {
    const result = await updateAiMaestroSkills(agentId, body.aiMaestro)
    if (!result) {
      return { error: 'Failed to update AI Maestro skills', status: 500 }
    }
  }

  const updatedSkills = getAgentSkills(agentId)
  return {
    data: { success: true, skills: updatedSkills },
    status: 200
  }
}

/**
 * Add a custom skill to an agent.
 */
export async function addSkill(
  agentId: string,
  body: { name: string; content: string; description?: string },
  requestingAgentId: string | null = null
): Promise<ServiceResult<Record<string, unknown>>> {
  // SF-040 (P5): Validate agentId is a UUID before any path construction -- defense-in-depth
  // against path traversal (getAgent also rejects invalid IDs, but this fails earlier and explicitly)
  if (!isValidUuid(agentId)) {
    return { error: 'Invalid agent ID format', status: 400 }
  }

  const agent = getAgent(agentId)
  if (!agent) {
    return { error: 'Agent not found', status: 404 }
  }

  // Layer 5: governance RBAC enforcement
  const govCheck = checkConfigGovernance(agentId, requestingAgentId, 'add-skill')
  if (govCheck) return govCheck as ServiceResult<Record<string, unknown>>

  if (!body.name || typeof body.name !== 'string') {
    return { error: 'Missing required field: name', status: 400 }
  }

  if (!body.content || typeof body.content !== 'string') {
    return { error: 'Missing required field: content', status: 400 }
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(body.name)) {
    return { error: 'Invalid skill name. Use only alphanumeric characters, hyphens, and underscores.', status: 400 }
  }

  const result = await addCustomSkill(agentId, {
    name: body.name,
    content: body.content,
    description: body.description,
  })

  if (!result) {
    return { error: 'Failed to add custom skill', status: 500 }
  }

  const updatedSkills = getAgentSkills(agentId)
  return {
    data: { success: true, skills: updatedSkills },
    status: 200
  }
}

/**
 * Remove a skill from an agent.
 */
export async function removeSkill(
  agentId: string,
  skillId: string,
  type: string = 'auto',
  requestingAgentId: string | null = null
): Promise<ServiceResult<Record<string, unknown>>> {
  const agent = getAgent(agentId)
  if (!agent) {
    return { error: 'Agent not found', status: 404 }
  }

  // Layer 5: governance RBAC enforcement
  const govCheck = checkConfigGovernance(agentId, requestingAgentId, 'remove-skill')
  if (govCheck) return govCheck as ServiceResult<Record<string, unknown>>

  const isMarketplaceSkill = type === 'marketplace' || (type === 'auto' && skillId.includes(':'))

  let result = null
  if (isMarketplaceSkill) {
    result = await removeMarketplaceSkills(agentId, [skillId])
  } else {
    result = await removeCustomSkill(agentId, skillId)
  }

  if (!result) {
    return { error: 'Failed to remove skill', status: 500 }
  }

  const updatedSkills = getAgentSkills(agentId)
  return {
    data: { success: true, skills: updatedSkills },
    status: 200
  }
}

/**
 * Get skill settings for an agent.
 */
export async function getSkillSettings(agentId: string): Promise<ServiceResult<Record<string, unknown>>> {
  // SF-030 + NT-009: Use shared isValidUuid from @/lib/validation instead of inline regex
  if (!agentId || !isValidUuid(agentId)) {
    return { error: 'Invalid agent ID format', status: 400 }
  }

  // NT-008: agentRegistry.getAgent (async, in-memory) used here for runtime operations (subconscious access)
  const agent = await agentRegistry.getAgent(agentId)
  if (!agent) {
    return { error: 'Agent not found', status: 404 }
  }

  const homeDir = process.env.HOME || process.env.USERPROFILE || ''
  const settingsPath = path.join(homeDir, '.aimaestro', 'agents', agentId, 'skill-settings.json')

  try {
    const content = await fs.readFile(settingsPath, 'utf-8')
    const settings = JSON.parse(content)
    return { data: { success: true, settings }, status: 200 }
  } catch {
    return { data: { success: true, settings: null }, status: 200 }
  }
}

/**
 * Save skill settings for an agent.
 */
export async function saveSkillSettings(
  agentId: string,
  settings: Record<string, unknown>,
  requestingAgentId: string | null = null
): Promise<ServiceResult<Record<string, unknown>>> {
  if (!settings) {
    return { error: 'Settings are required', status: 400 }
  }

  // SF-030 + NT-009: Use shared isValidUuid from @/lib/validation instead of inline regex
  if (!agentId || !isValidUuid(agentId)) {
    return { error: 'Invalid agent ID format', status: 400 }
  }

  const agent = await agentRegistry.getAgent(agentId)
  if (!agent) {
    return { error: 'Agent not found', status: 404 }
  }

  // SF-005: Layer 5 governance RBAC -- use bulk-config (general-purpose) instead of update-hooks
  const govCheck = checkConfigGovernance(agentId, requestingAgentId, 'bulk-config')
  if (govCheck) return govCheck as ServiceResult<Record<string, unknown>>

  const homeDir = process.env.HOME || process.env.USERPROFILE || ''
  const settingsPath = path.join(homeDir, '.aimaestro', 'agents', agentId, 'skill-settings.json')

  await fs.mkdir(path.dirname(settingsPath), { recursive: true })
  await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf-8')

  // NT-007: Removed dead code block that checked settings.memory but did nothing useful

  return { data: { success: true, message: 'Settings saved' }, status: 200 }
}
