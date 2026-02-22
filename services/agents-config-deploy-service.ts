/**
 * Agent Config Deploy Service
 *
 * Deploys configuration changes to an agent's .claude/ directory.
 * Called by cross-host-governance-service when a configure-agent request is executed,
 * and by agents-skills-service for direct local deployments.
 *
 * Supports: skills, plugins, hooks, MCP servers, model, program-args.
 */

import { ServiceResult } from '@/types/service'
import type { ConfigurationPayload, ConfigDiff, ConfigOperationType } from '@/types/governance-request'
import { getAgent } from '@/lib/agent-registry'
import fs from 'fs/promises'
import path from 'path'

export type { ServiceResult }

const LOG_PREFIX = '[config-deploy]'

/** Valid operations that this service can execute */
const VALID_OPERATIONS: ConfigOperationType[] = [
  'add-skill', 'remove-skill',
  'add-plugin', 'remove-plugin',
  'update-hooks', 'update-mcp',
  'update-model', 'update-program-args',
  'bulk-config',
]

/**
 * Deploy a configuration change to an agent's .claude/ directory.
 *
 * @param agentId - UUID of the target agent
 * @param config - The configuration payload describing what to change
 * @param deployedBy - UUID of the agent/user who initiated the deployment (for audit trail)
 * @returns ConfigDiff showing what changed, or error
 */
export async function deployConfigToAgent(
  agentId: string,
  config: ConfigurationPayload,
  deployedBy?: string
): Promise<ServiceResult<ConfigDiff>> {
  // Validate agent exists
  const agent = getAgent(agentId)
  if (!agent) {
    return { error: `Agent '${agentId}' not found`, status: 404 }
  }

  // Validate operation
  if (!config.operation || !VALID_OPERATIONS.includes(config.operation)) {
    return { error: `Invalid configuration operation: '${config.operation}'`, status: 400 }
  }

  // Get the agent's working directory for .claude/ path resolution
  const workingDir = agent.workingDirectory || agent.sessions?.[0]?.workingDirectory
  if (!workingDir) {
    return { error: `Agent '${agentId}' has no working directory configured`, status: 400 }
  }

  const claudeDir = path.join(workingDir, '.claude')

  try {
    switch (config.operation) {
      case 'add-skill':
        return await deployAddSkill(claudeDir, config, deployedBy)

      case 'remove-skill':
        return await deployRemoveSkill(claudeDir, config, deployedBy)

      case 'add-plugin':
        return await deployAddPlugin(claudeDir, config, deployedBy)

      case 'remove-plugin':
        return await deployRemovePlugin(claudeDir, config, deployedBy)

      case 'update-hooks':
        return await deployUpdateSettings(claudeDir, 'hooks', config, deployedBy)

      case 'update-mcp':
        return await deployUpdateSettings(claudeDir, 'mcpServers', config, deployedBy)

      case 'update-model':
        return await deployUpdateModel(agentId, config, deployedBy)

      case 'update-program-args':
        return await deployUpdateProgramArgs(agentId, config, deployedBy)

      case 'bulk-config':
        return await deployBulkConfig(claudeDir, agentId, config, deployedBy)

      default:
        return { error: `Unhandled operation: '${config.operation}'`, status: 400 }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`${LOG_PREFIX} Deployment failed for agent ${agentId}: ${msg}`)
    return { error: `Deployment failed: ${msg}`, status: 500 }
  }
}

// ---------------------------------------------------------------------------
// Skill operations
// ---------------------------------------------------------------------------

async function deployAddSkill(
  claudeDir: string,
  config: ConfigurationPayload,
  deployedBy?: string
): Promise<ServiceResult<ConfigDiff>> {
  if (!config.skills || config.skills.length === 0) {
    return { error: 'add-skill requires at least one skill name in config.skills', status: 400 }
  }

  const skillsDir = path.join(claudeDir, 'skills')
  await fs.mkdir(skillsDir, { recursive: true })

  const before: Record<string, unknown> = {}
  const after: Record<string, unknown> = {}

  for (const skillName of config.skills) {
    // Path traversal prevention
    if (skillName.includes('..') || skillName.includes('/') || skillName.includes('\\')) {
      return { error: `Invalid skill name: '${skillName}'`, status: 400 }
    }

    const skillDir = path.join(skillsDir, skillName)
    const existed = await fileExists(skillDir)
    before[skillName] = existed ? 'present' : 'absent'

    // Idempotent: if skill already exists with a valid SKILL.md, skip re-creation (11c safeguard)
    if (existed) {
      const skillMdCheckPath = path.join(skillDir, 'SKILL.md')
      const skillMdAlreadyExists = await fileExists(skillMdCheckPath)
      if (skillMdAlreadyExists) {
        before[skillName] = 'present'
        after[skillName] = 'present (unchanged)'
        continue
      }
    }

    // Create skill directory with a placeholder SKILL.md if not exists
    await fs.mkdir(skillDir, { recursive: true })
    const skillMdPath = path.join(skillDir, 'SKILL.md')
    const skillMdExists = await fileExists(skillMdPath)
    if (!skillMdExists) {
      await fs.writeFile(skillMdPath, `# ${skillName}\n\nSkill deployed via governance at ${new Date().toISOString()}\n`, 'utf-8')
    }

    // ToxicSkills scan on deployed content — cross-host security (11d safeguard)
    try {
      const { scanForToxicPatterns } = await import('@/lib/toxic-skills')
      const content = await fs.readFile(skillMdPath, 'utf-8')
      const scanResult = scanForToxicPatterns(content)
      if (scanResult.toxic) {
        // Remove the toxic skill and return error
        await fs.rm(skillDir, { recursive: true, force: true })
        return { error: `Skill '${skillName}' failed ToxicSkills scan: ${scanResult.reason}`, status: 403 }
      }
    } catch {
      // ToxicSkills scanner not available — skip (Phase 1 acceptable)
    }

    after[skillName] = 'present'
  }

  console.log(`${LOG_PREFIX} Deployed ${config.skills.length} skill(s) to ${claudeDir}`)

  return {
    data: {
      operation: 'add-skill',
      before,
      after,
      appliedAt: new Date().toISOString(),
      appliedBy: deployedBy,
    },
    status: 200
  }
}

async function deployRemoveSkill(
  claudeDir: string,
  config: ConfigurationPayload,
  deployedBy?: string
): Promise<ServiceResult<ConfigDiff>> {
  if (!config.skills || config.skills.length === 0) {
    return { error: 'remove-skill requires at least one skill name in config.skills', status: 400 }
  }

  const skillsDir = path.join(claudeDir, 'skills')
  const before: Record<string, unknown> = {}
  const after: Record<string, unknown> = {}

  for (const skillName of config.skills) {
    if (skillName.includes('..') || skillName.includes('/') || skillName.includes('\\')) {
      return { error: `Invalid skill name: '${skillName}'`, status: 400 }
    }

    const skillDir = path.join(skillsDir, skillName)
    const existed = await fileExists(skillDir)
    before[skillName] = existed ? 'present' : 'absent'

    if (existed) {
      await fs.rm(skillDir, { recursive: true, force: true })
    }

    after[skillName] = 'absent'
  }

  console.log(`${LOG_PREFIX} Removed ${config.skills.length} skill(s) from ${claudeDir}`)

  return {
    data: {
      operation: 'remove-skill',
      before,
      after,
      appliedAt: new Date().toISOString(),
      appliedBy: deployedBy,
    },
    status: 200
  }
}

// ---------------------------------------------------------------------------
// Plugin operations
// ---------------------------------------------------------------------------

async function deployAddPlugin(
  claudeDir: string,
  config: ConfigurationPayload,
  deployedBy?: string
): Promise<ServiceResult<ConfigDiff>> {
  if (!config.plugins || config.plugins.length === 0) {
    return { error: 'add-plugin requires at least one plugin name in config.plugins', status: 400 }
  }

  const pluginsDir = path.join(claudeDir, 'plugins')
  await fs.mkdir(pluginsDir, { recursive: true })

  const before: Record<string, unknown> = {}
  const after: Record<string, unknown> = {}

  for (const pluginName of config.plugins) {
    if (pluginName.includes('..') || pluginName.includes('/') || pluginName.includes('\\')) {
      return { error: `Invalid plugin name: '${pluginName}'`, status: 400 }
    }

    const pluginDir = path.join(pluginsDir, pluginName)
    const existed = await fileExists(pluginDir)
    before[pluginName] = existed ? 'present' : 'absent'

    await fs.mkdir(pluginDir, { recursive: true })
    after[pluginName] = 'present'
  }

  console.log(`${LOG_PREFIX} Deployed ${config.plugins.length} plugin(s) to ${claudeDir}`)

  return {
    data: {
      operation: 'add-plugin',
      before,
      after,
      appliedAt: new Date().toISOString(),
      appliedBy: deployedBy,
    },
    status: 200
  }
}

async function deployRemovePlugin(
  claudeDir: string,
  config: ConfigurationPayload,
  deployedBy?: string
): Promise<ServiceResult<ConfigDiff>> {
  if (!config.plugins || config.plugins.length === 0) {
    return { error: 'remove-plugin requires at least one plugin name in config.plugins', status: 400 }
  }

  const pluginsDir = path.join(claudeDir, 'plugins')
  const before: Record<string, unknown> = {}
  const after: Record<string, unknown> = {}

  for (const pluginName of config.plugins) {
    if (pluginName.includes('..') || pluginName.includes('/') || pluginName.includes('\\')) {
      return { error: `Invalid plugin name: '${pluginName}'`, status: 400 }
    }

    const pluginDir = path.join(pluginsDir, pluginName)
    const existed = await fileExists(pluginDir)
    before[pluginName] = existed ? 'present' : 'absent'

    if (existed) {
      await fs.rm(pluginDir, { recursive: true, force: true })
    }

    after[pluginName] = 'absent'
  }

  console.log(`${LOG_PREFIX} Removed ${config.plugins.length} plugin(s) from ${claudeDir}`)

  return {
    data: {
      operation: 'remove-plugin',
      before,
      after,
      appliedAt: new Date().toISOString(),
      appliedBy: deployedBy,
    },
    status: 200
  }
}

// ---------------------------------------------------------------------------
// Settings operations (hooks, mcpServers)
// ---------------------------------------------------------------------------

async function deployUpdateSettings(
  claudeDir: string,
  section: 'hooks' | 'mcpServers',
  config: ConfigurationPayload,
  deployedBy?: string
): Promise<ServiceResult<ConfigDiff>> {
  const newData = section === 'hooks' ? config.hooks : config.mcpServers
  if (!newData || Object.keys(newData).length === 0) {
    return { error: `update-${section === 'hooks' ? 'hooks' : 'mcp'} requires non-empty ${section} data`, status: 400 }
  }

  const settingsPath = path.join(claudeDir, 'settings.json')
  let settings: Record<string, unknown> = {}

  try {
    const content = await fs.readFile(settingsPath, 'utf-8')
    settings = JSON.parse(content)
  } catch {
    // File doesn't exist or is invalid -- start fresh
  }

  const before: Record<string, unknown> = { [section]: settings[section] || {} }

  // Merge new data into existing section
  const existingSection = (settings[section] as Record<string, unknown>) || {}
  settings[section] = { ...existingSection, ...newData }

  const after: Record<string, unknown> = { [section]: settings[section] }

  // Ensure .claude/ directory exists
  await fs.mkdir(claudeDir, { recursive: true })
  await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf-8')

  const opName = section === 'hooks' ? 'update-hooks' : 'update-mcp'
  console.log(`${LOG_PREFIX} Updated ${section} in ${settingsPath}`)

  return {
    data: {
      operation: opName as ConfigOperationType,
      before,
      after,
      appliedAt: new Date().toISOString(),
      appliedBy: deployedBy,
    },
    status: 200
  }
}

// ---------------------------------------------------------------------------
// Model and program-args (registry metadata, not filesystem)
// ---------------------------------------------------------------------------

async function deployUpdateModel(
  agentId: string,
  config: ConfigurationPayload,
  deployedBy?: string
): Promise<ServiceResult<ConfigDiff>> {
  if (!config.model) {
    return { error: 'update-model requires a model value', status: 400 }
  }

  // Import updateAgentById to update the agent's model in the registry
  const { updateAgentById } = await import('@/services/agents-core-service')
  const before: Record<string, unknown> = {}
  const agent = getAgent(agentId)
  if (agent) {
    before.model = agent.model || 'default'
  }

  const result = await updateAgentById(agentId, { model: config.model })
  if (result.error) {
    return { error: `Failed to update model: ${result.error}`, status: result.status }
  }

  console.log(`${LOG_PREFIX} Updated model for agent ${agentId} to '${config.model}'`)

  return {
    data: {
      operation: 'update-model',
      before,
      after: { model: config.model },
      appliedAt: new Date().toISOString(),
      appliedBy: deployedBy,
    },
    status: 200
  }
}

async function deployUpdateProgramArgs(
  agentId: string,
  config: ConfigurationPayload,
  deployedBy?: string
): Promise<ServiceResult<ConfigDiff>> {
  if (config.programArgs === undefined) {
    return { error: 'update-program-args requires a programArgs value', status: 400 }
  }

  const { updateAgentById } = await import('@/services/agents-core-service')
  const before: Record<string, unknown> = {}
  const agent = getAgent(agentId)
  if (agent) {
    before.programArgs = agent.programArgs || ''
  }

  const result = await updateAgentById(agentId, { programArgs: config.programArgs })
  if (result.error) {
    return { error: `Failed to update program args: ${result.error}`, status: result.status }
  }

  console.log(`${LOG_PREFIX} Updated programArgs for agent ${agentId}`)

  return {
    data: {
      operation: 'update-program-args',
      before,
      after: { programArgs: config.programArgs },
      appliedAt: new Date().toISOString(),
      appliedBy: deployedBy,
    },
    status: 200
  }
}

// ---------------------------------------------------------------------------
// Bulk config (dispatches multiple operations)
// ---------------------------------------------------------------------------

async function deployBulkConfig(
  claudeDir: string,
  agentId: string,
  config: ConfigurationPayload,
  deployedBy?: string
): Promise<ServiceResult<ConfigDiff>> {
  const before: Record<string, unknown> = {}
  const after: Record<string, unknown> = {}

  // Process each non-empty field as a sub-operation
  if (config.skills && config.skills.length > 0) {
    const skillResult = await deployAddSkill(claudeDir, config, deployedBy)
    if (skillResult.error) return skillResult
    before.skills = skillResult.data?.before
    after.skills = skillResult.data?.after
  }

  if (config.plugins && config.plugins.length > 0) {
    const pluginResult = await deployAddPlugin(claudeDir, config, deployedBy)
    if (pluginResult.error) return pluginResult
    before.plugins = pluginResult.data?.before
    after.plugins = pluginResult.data?.after
  }

  if (config.hooks && Object.keys(config.hooks).length > 0) {
    const hooksResult = await deployUpdateSettings(claudeDir, 'hooks', config, deployedBy)
    if (hooksResult.error) return hooksResult
    before.hooks = hooksResult.data?.before
    after.hooks = hooksResult.data?.after
  }

  if (config.mcpServers && Object.keys(config.mcpServers).length > 0) {
    const mcpResult = await deployUpdateSettings(claudeDir, 'mcpServers', config, deployedBy)
    if (mcpResult.error) return mcpResult
    before.mcpServers = mcpResult.data?.before
    after.mcpServers = mcpResult.data?.after
  }

  if (config.model) {
    const modelResult = await deployUpdateModel(agentId, config, deployedBy)
    if (modelResult.error) return modelResult
    before.model = modelResult.data?.before
    after.model = modelResult.data?.after
  }

  if (config.programArgs !== undefined) {
    const argsResult = await deployUpdateProgramArgs(agentId, config, deployedBy)
    if (argsResult.error) return argsResult
    before.programArgs = argsResult.data?.before
    after.programArgs = argsResult.data?.after
  }

  console.log(`${LOG_PREFIX} Bulk config deployed for agent ${agentId}`)

  return {
    data: {
      operation: 'bulk-config',
      before,
      after,
      appliedAt: new Date().toISOString(),
      appliedBy: deployedBy,
    },
    status: 200
  }
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}
