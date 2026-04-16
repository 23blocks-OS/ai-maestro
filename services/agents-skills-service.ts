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
import fs from 'fs/promises'
import path from 'path'
import { type ServiceResult, missingField, notFound, invalidField, operationFailed } from '@/services/service-errors'

// ── Public Functions ────────────────────────────────────────────────────────

/**
 * Get agent's current skills configuration.
 */
export function getSkillsConfig(agentId: string): ServiceResult<Record<string, unknown>> {
  const skills = getAgentSkills(agentId)
  if (!skills) {
    return notFound('Agent', agentId)
  }
  return { data: skills as unknown as Record<string, unknown>, status: 200 }
}

/**
 * Update agent's skills - add/remove marketplace skills, update AI Maestro config.
 */
export async function updateSkills(
  agentId: string,
  body: { add?: string[]; remove?: string[]; aiMaestro?: { enabled?: boolean; skills?: string[] } }
): Promise<ServiceResult<Record<string, unknown>>> {
  const agent = getAgent(agentId)
  if (!agent) {
    return notFound('Agent', agentId)
  }

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
        return notFound('Skill', skillId)
      }
      skillsToAdd.push({
        id: skill.id,
        marketplace: skill.marketplace,
        plugin: skill.plugin,
        name: skill.name,
        version: skill.version,
      })
    }

    const result = addMarketplaceSkills(agentId, skillsToAdd)
    if (!result) {
      return operationFailed('add skills')
    }
  }

  // Handle skill removals
  if (body.remove && Array.isArray(body.remove) && body.remove.length > 0) {
    const result = removeMarketplaceSkills(agentId, body.remove)
    if (!result) {
      return operationFailed('remove skills')
    }
  }

  // Handle AI Maestro config update
  if (body.aiMaestro) {
    const result = updateAiMaestroSkills(agentId, body.aiMaestro)
    if (!result) {
      return operationFailed('update AI Maestro skills')
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
export function addSkill(
  agentId: string,
  body: { name: string; content: string; description?: string }
): ServiceResult<Record<string, unknown>> {
  const agent = getAgent(agentId)
  if (!agent) {
    return notFound('Agent', agentId)
  }

  if (!body.name || typeof body.name !== 'string') {
    return missingField('name')
  }

  if (!body.content || typeof body.content !== 'string') {
    return missingField('content')
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(body.name)) {
    return invalidField('name', 'Invalid skill name. Use only alphanumeric characters, hyphens, and underscores.')
  }

  const result = addCustomSkill(agentId, {
    name: body.name,
    content: body.content,
    description: body.description,
  })

  if (!result) {
    return operationFailed('add custom skill')
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
export function removeSkill(
  agentId: string,
  skillId: string,
  type: string = 'auto'
): ServiceResult<Record<string, unknown>> {
  const agent = getAgent(agentId)
  if (!agent) {
    return notFound('Agent', agentId)
  }

  const isMarketplaceSkill = type === 'marketplace' || (type === 'auto' && skillId.includes(':'))

  let result = null
  if (isMarketplaceSkill) {
    result = removeMarketplaceSkills(agentId, [skillId])
  } else {
    result = removeCustomSkill(agentId, skillId)
  }

  if (!result) {
    return operationFailed('remove skill')
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
  const agent = await agentRegistry.getAgent(agentId)
  if (!agent) {
    return notFound('Agent', agentId)
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
  settings: Record<string, unknown>
): Promise<ServiceResult<Record<string, unknown>>> {
  if (!settings) {
    return missingField('settings')
  }

  const agent = await agentRegistry.getAgent(agentId)
  if (!agent) {
    return notFound('Agent', agentId)
  }

  const homeDir = process.env.HOME || process.env.USERPROFILE || ''
  const settingsPath = path.join(homeDir, '.aimaestro', 'agents', agentId, 'skill-settings.json')

  await fs.mkdir(path.dirname(settingsPath), { recursive: true })
  await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf-8')

  if ((settings as any).memory) {
    const subconscious = agent.getSubconscious()
    if (subconscious) {
      console.log(`[Skills Service] Updated memory settings for agent ${agentId.substring(0, 8)}`)
    }
  }

  return { data: { success: true, message: 'Settings saved' }, status: 200 }
}
