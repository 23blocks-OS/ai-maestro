import fs from 'fs'
import path from 'path'
import os from 'os'
import { v4 as uuidv4 } from 'uuid'
import type { Agent, AgentSummary, CreateAgentRequest, UpdateAgentRequest, UpdateAgentMetricsRequest, DeploymentType } from '@/types/agent'
import { getLocalHost } from '@/lib/hosts-config'

const AIMAESTRO_DIR = path.join(os.homedir(), '.aimaestro')
const AGENTS_DIR = path.join(AIMAESTRO_DIR, 'agents')
const REGISTRY_FILE = path.join(AGENTS_DIR, 'registry.json')

/**
 * Ensure agents directory exists
 */
function ensureAgentsDir() {
  if (!fs.existsSync(AGENTS_DIR)) {
    fs.mkdirSync(AGENTS_DIR, { recursive: true })
  }
}

/**
 * Load all agents from registry
 */
export function loadAgents(): Agent[] {
  try {
    ensureAgentsDir()

    if (!fs.existsSync(REGISTRY_FILE)) {
      return []
    }

    const data = fs.readFileSync(REGISTRY_FILE, 'utf-8')
    const agents = JSON.parse(data)

    return Array.isArray(agents) ? agents : []
  } catch (error) {
    console.error('Failed to load agents:', error)
    return []
  }
}

/**
 * Save agents to registry
 */
export function saveAgents(agents: Agent[]): boolean {
  try {
    ensureAgentsDir()

    const data = JSON.stringify(agents, null, 2)
    fs.writeFileSync(REGISTRY_FILE, data, 'utf-8')

    return true
  } catch (error) {
    console.error('Failed to save agents:', error)
    return false
  }
}

/**
 * Get agent by ID
 */
export function getAgent(id: string): Agent | null {
  const agents = loadAgents()
  return agents.find(a => a.id === id) || null
}

/**
 * Get agent by alias
 */
export function getAgentByAlias(alias: string): Agent | null {
  const agents = loadAgents()
  return agents.find(a => a.alias.toLowerCase() === alias.toLowerCase()) || null
}

/**
 * Get agent by session name
 */
export function getAgentBySession(sessionName: string): Agent | null {
  const agents = loadAgents()
  return agents.find(a => a.tools.session?.tmuxSessionName === sessionName) || null
}

/**
 * Create a new agent
 */
export function createAgent(request: CreateAgentRequest): Agent {
  const agents = loadAgents()

  // Check if alias already exists
  const existing = getAgentByAlias(request.alias)
  if (existing) {
    throw new Error(`Agent with alias "${request.alias}" already exists`)
  }

  // Determine deployment type
  const deploymentType: DeploymentType = request.deploymentType || 'local'

  // Get host information
  const localHost = getLocalHost()
  const hostId = request.hostId || localHost?.id || 'local'
  const hostName = localHost?.name || os.hostname()
  const hostUrl = localHost?.url || 'http://localhost:23000'

  // Create agent
  const agent: Agent = {
    id: uuidv4(),
    alias: request.alias,
    displayName: request.displayName,
    avatar: request.avatar,
    hostId,
    hostName,
    hostUrl,
    program: request.program,
    model: request.model,
    taskDescription: request.taskDescription,
    tags: normalizeTags(request.tags),
    capabilities: [],
    owner: request.owner,
    team: request.team,
    documentation: request.documentation,
    metadata: request.metadata,
    deployment: {
      type: deploymentType,
      ...(deploymentType === 'local' && {
        local: {
          hostname: os.hostname(),
          platform: os.platform(),
        }
      })
    },
    metrics: {
      // Initialize metrics with zeros
      totalSessions: 0,
      totalMessages: 0,
      totalTasksCompleted: 0,
      uptimeHours: 0,
      totalApiCalls: 0,
      totalTokensUsed: 0,
      estimatedCost: 0,
      lastCostUpdate: new Date().toISOString(),
    },
    tools: {
      // Session tool (if requested)
      ...(request.createSession && {
        session: {
          tmuxSessionName: generateSessionName(request.alias, request.tags),
          workingDirectory: request.workingDirectory || process.cwd(),
          status: 'stopped',
          createdAt: new Date().toISOString(),
        }
      })
    },
    status: 'offline',
    createdAt: new Date().toISOString(),
    lastActive: new Date().toISOString(),
    preferences: {
      defaultWorkingDirectory: request.workingDirectory,
    }
  }

  agents.push(agent)
  saveAgents(agents)

  return agent
}

/**
 * Update an agent
 */
export function updateAgent(id: string, updates: UpdateAgentRequest): Agent | null {
  const agents = loadAgents()
  const index = agents.findIndex(a => a.id === id)

  if (index === -1) {
    return null
  }

  // Check alias uniqueness if being updated
  if (updates.alias && updates.alias !== agents[index].alias) {
    const existing = getAgentByAlias(updates.alias)
    if (existing) {
      throw new Error(`Agent with alias "${updates.alias}" already exists`)
    }
  }

  // Normalize tags if being updated
  if (updates.tags) {
    updates.tags = normalizeTags(updates.tags)
  }

  // Update agent
  agents[index] = {
    ...agents[index],
    ...updates,
    documentation: {
      ...agents[index].documentation,
      ...updates.documentation
    },
    metadata: {
      ...agents[index].metadata,
      ...updates.metadata
    },
    preferences: {
      ...agents[index].preferences,
      ...updates.preferences
    },
    lastActive: new Date().toISOString()
  }

  saveAgents(agents)
  return agents[index]
}

/**
 * Update agent metrics
 */
export function updateAgentMetrics(id: string, metrics: UpdateAgentMetricsRequest): Agent | null {
  const agents = loadAgents()
  const index = agents.findIndex(a => a.id === id)

  if (index === -1) {
    return null
  }

  agents[index].metrics = {
    ...agents[index].metrics,
    ...metrics,
    lastCostUpdate: new Date().toISOString()
  }

  agents[index].lastActive = new Date().toISOString()

  saveAgents(agents)
  return agents[index]
}

/**
 * Increment agent metric by a specific amount
 */
export function incrementAgentMetric(
  id: string,
  metric: keyof Omit<UpdateAgentMetricsRequest, 'customMetrics'>,
  amount: number = 1
): boolean {
  const agents = loadAgents()
  const index = agents.findIndex(a => a.id === id)

  if (index === -1) {
    return false
  }

  if (!agents[index].metrics) {
    agents[index].metrics = {}
  }

  // Type-safe assignment for numeric metrics only
  const currentValue = (agents[index].metrics![metric] as number) || 0
  ;(agents[index].metrics! as any)[metric] = currentValue + amount
  agents[index].metrics!.lastCostUpdate = new Date().toISOString()
  agents[index].lastActive = new Date().toISOString()

  return saveAgents(agents)
}

/**
 * Delete an agent and clean up associated data
 * Also kills the tmux session if running
 */
export function deleteAgent(id: string): boolean {
  const agents = loadAgents()
  const agentToDelete = agents.find(a => a.id === id)

  if (!agentToDelete) {
    return false // Agent not found
  }

  // Kill tmux session if the agent has one
  const tmuxSessionName = agentToDelete.tools.session?.tmuxSessionName || agentToDelete.alias
  if (tmuxSessionName) {
    try {
      const { execSync } = require('child_process')
      // Check if session exists and kill it
      execSync(`tmux kill-session -t "${tmuxSessionName}" 2>/dev/null || true`, { encoding: 'utf-8' })
      console.log(`[Agent Registry] Killed tmux session: ${tmuxSessionName}`)
    } catch (error) {
      // Session might not exist, that's okay
      console.log(`[Agent Registry] Could not kill tmux session ${tmuxSessionName} (may not exist)`)
    }
  }

  const filtered = agents.filter(a => a.id !== id)
  saveAgents(filtered)

  // Clean up agent-specific directory (database, etc.)
  const agentDir = path.join(AGENTS_DIR, id)
  if (fs.existsSync(agentDir)) {
    try {
      fs.rmSync(agentDir, { recursive: true })
    } catch (error) {
      console.error(`[Agent Registry] Failed to clean up agent directory ${id}:`, error)
    }
  }

  // Clean up message directories for this agent
  const messageBaseDir = path.join(AIMAESTRO_DIR, 'messages')
  const messageBoxes = ['inbox', 'sent', 'archived']

  for (const box of messageBoxes) {
    const boxDir = path.join(messageBaseDir, box, id)
    if (fs.existsSync(boxDir)) {
      try {
        fs.rmSync(boxDir, { recursive: true })
        console.log(`[Agent Registry] Cleaned up ${box} messages for agent ${id}`)
      } catch (error) {
        console.error(`[Agent Registry] Failed to clean up ${box} messages for agent ${id}:`, error)
      }
    }
  }

  return true
}

/**
 * List all agents (summary view)
 */
export function listAgents(): AgentSummary[] {
  const agents = loadAgents()

  return agents.map(a => ({
    id: a.id,
    alias: a.alias,
    displayName: a.displayName,
    avatar: a.avatar,
    hostId: a.hostId || 'local',
    hostUrl: a.hostUrl,
    status: a.status,
    lastActive: a.lastActive,
    currentSession: a.tools.session?.tmuxSessionName,
    deployment: a.deployment
  }))
}

/**
 * Update agent status
 */
export function updateAgentStatus(id: string, status: Agent['status']): boolean {
  const agents = loadAgents()
  const index = agents.findIndex(a => a.id === id)

  if (index === -1) {
    return false
  }

  agents[index].status = status
  agents[index].lastActive = new Date().toISOString()

  return saveAgents(agents)
}

/**
 * Link a session to an agent
 */
export function linkSession(agentId: string, sessionName: string, workingDirectory: string): boolean {
  const agents = loadAgents()
  const index = agents.findIndex(a => a.id === agentId)

  if (index === -1) {
    return false
  }

  agents[index].tools.session = {
    tmuxSessionName: sessionName,
    workingDirectory,
    status: 'running',
    createdAt: new Date().toISOString(),
    lastActive: new Date().toISOString()
  }

  agents[index].status = 'active'
  agents[index].lastActive = new Date().toISOString()

  return saveAgents(agents)
}

/**
 * Unlink session from agent
 */
export function unlinkSession(agentId: string): boolean {
  const agents = loadAgents()
  const index = agents.findIndex(a => a.id === agentId)

  if (index === -1) {
    return false
  }

  if (agents[index].tools.session) {
    agents[index].tools.session.status = 'stopped'
  }

  agents[index].status = 'offline'
  agents[index].lastActive = new Date().toISOString()

  return saveAgents(agents)
}

/**
 * Normalize tags to lowercase for case-insensitive handling
 */
function normalizeTags(tags?: string[]): string[] {
  if (!tags || tags.length === 0) return []
  return tags.map(tag => tag.toLowerCase())
}

/**
 * Search agents by query (alias, displayName, taskDescription, tags)
 */
export function searchAgents(query: string): Agent[] {
  const agents = loadAgents()
  const lowerQuery = query.toLowerCase()

  return agents.filter(a =>
    a.alias.toLowerCase().includes(lowerQuery) ||
    a.displayName?.toLowerCase().includes(lowerQuery) ||
    a.taskDescription.toLowerCase().includes(lowerQuery) ||
    a.tags?.some(tag => tag.toLowerCase().includes(lowerQuery))
  )
}

/**
 * Generate session name from alias and tags
 * Examples:
 *   alias: "ProngHub", tags: ["23blocks", "apps"] → "23blocks-apps-pronghub"
 *   alias: "BackendAPI", tags: [] → "backendapi"
 */
function generateSessionName(alias: string, tags?: string[]): string {
  const parts = [...(tags || []), alias]
  return parts.map(p => p.toLowerCase().replace(/[^a-z0-9]/g, '')).join('-')
}

/**
 * Resolve alias to agent ID
 * Used for messaging and other operations that reference agents by alias
 */
export function resolveAlias(aliasOrId: string): string | null {
  const agent = getAgentByAlias(aliasOrId) || getAgent(aliasOrId)
  return agent?.id || null
}

/**
 * Rename agent's session name
 * Updates the tmuxSessionName in registry when a session is renamed
 */
export function renameAgentSession(oldSessionName: string, newSessionName: string): boolean {
  const agents = loadAgents()
  const index = agents.findIndex(a => a.tools.session?.tmuxSessionName === oldSessionName)

  if (index === -1) {
    return false // Agent not found
  }

  if (agents[index].tools.session) {
    agents[index].tools.session.tmuxSessionName = newSessionName
    agents[index].lastActive = new Date().toISOString()
  }

  return saveAgents(agents)
}

/**
 * Delete agent by session name
 * Removes the agent from registry when its session is deleted
 */
export function deleteAgentBySession(sessionName: string): boolean {
  const agent = getAgentBySession(sessionName)
  if (!agent) {
    return false // Agent not found
  }

  // Use deleteAgent to properly clean up messages and data directories
  return deleteAgent(agent.id)
}
