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

// ── Types ───────────────────────────────────────────────────────────────────

export interface ServiceResult<T> {
  data?: T
  error?: string
  status: number
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
  body: { add?: string[]; remove?: string[]; aiMaestro?: { enabled?: boolean; skills?: string[] } }
): Promise<ServiceResult<Record<string, unknown>>> {
  const agent = getAgent(agentId)
  if (!agent) {
    return { error: 'Agent not found', status: 404 }
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

    const result = addMarketplaceSkills(agentId, skillsToAdd)
    if (!result) {
      return { error: 'Failed to add skills', status: 500 }
    }
  }

  // Handle skill removals
  if (body.remove && Array.isArray(body.remove) && body.remove.length > 0) {
    const result = removeMarketplaceSkills(agentId, body.remove)
    if (!result) {
      return { error: 'Failed to remove skills', status: 500 }
    }
  }

  // Handle AI Maestro config update
  if (body.aiMaestro) {
    const result = updateAiMaestroSkills(agentId, body.aiMaestro)
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
export function addSkill(
  agentId: string,
  body: { name: string; content: string; description?: string }
): ServiceResult<Record<string, unknown>> {
  const agent = getAgent(agentId)
  if (!agent) {
    return { error: 'Agent not found', status: 404 }
  }

  if (!body.name || typeof body.name !== 'string') {
    return { error: 'Missing required field: name', status: 400 }
  }

  if (!body.content || typeof body.content !== 'string') {
    return { error: 'Missing required field: content', status: 400 }
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(body.name)) {
    return { error: 'Invalid skill name. Use only alphanumeric characters, hyphens, and underscores.', status: 400 }
  }

  const result = addCustomSkill(agentId, {
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
export function removeSkill(
  agentId: string,
  skillId: string,
  type: string = 'auto'
): ServiceResult<Record<string, unknown>> {
  const agent = getAgent(agentId)
  if (!agent) {
    return { error: 'Agent not found', status: 404 }
  }

  const isMarketplaceSkill = type === 'marketplace' || (type === 'auto' && skillId.includes(':'))

  let result = null
  if (isMarketplaceSkill) {
    result = removeMarketplaceSkills(agentId, [skillId])
  } else {
    result = removeCustomSkill(agentId, skillId)
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
  settings: Record<string, unknown>
): Promise<ServiceResult<Record<string, unknown>>> {
  if (!settings) {
    return { error: 'Settings are required', status: 400 }
  }

  const agent = await agentRegistry.getAgent(agentId)
  if (!agent) {
    return { error: 'Agent not found', status: 404 }
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
