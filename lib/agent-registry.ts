import fs from 'fs'
import path from 'path'
import os from 'os'
import { v4 as uuidv4 } from 'uuid'
import type { Agent, AgentSummary, CreateAgentRequest, UpdateAgentRequest, UpdateAgentMetricsRequest } from '@/types/agent'

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

  // Create agent
  const agent: Agent = {
    id: uuidv4(),
    alias: request.alias,
    displayName: request.displayName,
    avatar: request.avatar,
    program: request.program,
    model: request.model,
    taskDescription: request.taskDescription,
    tags: request.tags || [],
    capabilities: [],
    owner: request.owner,
    team: request.team,
    documentation: request.documentation,
    metadata: request.metadata,
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
  metric: keyof UpdateAgentMetricsRequest,
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

  const currentValue = (agents[index].metrics[metric] as number) || 0
  agents[index].metrics[metric] = currentValue + amount
  agents[index].metrics.lastCostUpdate = new Date().toISOString()
  agents[index].lastActive = new Date().toISOString()

  return saveAgents(agents)
}

/**
 * Delete an agent
 */
export function deleteAgent(id: string): boolean {
  const agents = loadAgents()
  const filtered = agents.filter(a => a.id !== id)

  if (filtered.length === agents.length) {
    return false // Agent not found
  }

  saveAgents(filtered)

  // TODO: Clean up agent directory (messages, etc.)
  // const agentDir = path.join(AGENTS_DIR, id)
  // if (fs.existsSync(agentDir)) {
  //   fs.rmSync(agentDir, { recursive: true })
  // }

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
    status: a.status,
    lastActive: a.lastActive,
    currentSession: a.tools.session?.tmuxSessionName
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
