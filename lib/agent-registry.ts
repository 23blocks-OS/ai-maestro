import fs from 'fs'
import path from 'path'
import os from 'os'
import { v4 as uuidv4 } from 'uuid'
import type { Agent, AgentSummary, AgentSession, CreateAgentRequest, UpdateAgentRequest, UpdateAgentMetricsRequest, DeploymentType } from '@/types/agent'
import { parseSessionName, computeSessionName } from '@/types/agent'
import { getSelfHost, getSelfHostId } from '@/lib/hosts-config'

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
 * Get agent by name (the primary identity)
 */
export function getAgentByName(name: string): Agent | null {
  const agents = loadAgents()
  return agents.find(a => a.name?.toLowerCase() === name.toLowerCase()) || null
}

/**
 * Get agent by alias (DEPRECATED - use getAgentByName)
 * Kept for backward compatibility during migration
 */
export function getAgentByAlias(alias: string): Agent | null {
  const agents = loadAgents()
  // Try name first, then deprecated alias field
  return agents.find(a =>
    a.name?.toLowerCase() === alias.toLowerCase() ||
    a.alias?.toLowerCase() === alias.toLowerCase()
  ) || null
}

/**
 * Get agent by tmux session name
 * Uses parseSessionName to extract agent name from session (e.g., "website_1" → "website")
 */
export function getAgentBySession(sessionName: string): Agent | null {
  const { agentName } = parseSessionName(sessionName)
  return getAgentByName(agentName)
}

/**
 * Create a new agent
 */
export function createAgent(request: CreateAgentRequest): Agent {
  const agents = loadAgents()

  // Support both new 'name' and deprecated 'alias'
  const agentName = request.name || request.alias
  if (!agentName) {
    throw new Error('Agent name is required')
  }

  // Check if name already exists
  const existing = getAgentByName(agentName)
  if (existing) {
    throw new Error(`Agent with name "${agentName}" already exists`)
  }

  // Determine deployment type
  const deploymentType: DeploymentType = request.deploymentType || 'local'

  // Get host information
  // Use hostname as hostId for cross-host compatibility
  const selfHost = getSelfHost()
  const selfHostIdValue = getSelfHostId()
  const hostId = request.hostId || selfHost?.id || selfHostIdValue
  const hostName = selfHost?.name || selfHostIdValue
  const hostUrl = selfHost?.url || 'http://localhost:23000'

  // Create initial sessions array
  const sessions: AgentSession[] = []
  if (request.createSession) {
    const sessionIndex = request.sessionIndex || 0
    sessions.push({
      index: sessionIndex,
      status: 'offline',
      workingDirectory: request.workingDirectory,
      createdAt: new Date().toISOString(),
    })
  }

  // Create agent with new schema
  const agent: Agent = {
    id: uuidv4(),
    name: agentName,
    label: request.label || request.displayName,
    avatar: request.avatar,
    workingDirectory: request.workingDirectory || process.cwd(),
    sessions,
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
      // Keep tools object for backward compatibility with other tools
      // Session is now in agent.sessions array
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

  // Support both new 'name' and deprecated 'alias'
  const newName = updates.name || updates.alias
  const currentName = agents[index].name || agents[index].alias

  // Check name uniqueness if being updated
  if (newName && newName !== currentName) {
    const existing = getAgentByName(newName)
    if (existing) {
      throw new Error(`Agent with name "${newName}" already exists`)
    }

    // Also rename the tmux session if it exists
    if (currentName) {
      try {
        const { execSync } = require('child_process')
        // Check if tmux session exists
        try {
          execSync(`tmux has-session -t "${currentName}" 2>/dev/null`)
          // Session exists, rename it
          execSync(`tmux rename-session -t "${currentName}" "${newName}"`)
          console.log(`[Agent Registry] Renamed tmux session: ${currentName} -> ${newName}`)
        } catch {
          // Session doesn't exist, that's fine
        }
      } catch (err) {
        console.error(`[Agent Registry] Failed to rename tmux session:`, err)
        // Don't fail the agent update if tmux rename fails
      }
    }
  }

  // Normalize tags if being updated
  if (updates.tags) {
    updates.tags = normalizeTags(updates.tags)
  }

  // Build update object
  const updateData: Partial<Agent> = {
    ...updates,
    // Map deprecated fields to new fields
    ...(newName && { name: newName }),
    ...(updates.label || updates.displayName ? { label: updates.label || updates.displayName } : {}),
  }

  // Remove deprecated fields from update
  delete (updateData as any).alias
  delete (updateData as any).displayName

  // Update agent
  agents[index] = {
    ...agents[index],
    ...updateData,
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
 * Also kills any tmux sessions belonging to this agent
 */
export function deleteAgent(id: string): boolean {
  const agents = loadAgents()
  const agentToDelete = agents.find(a => a.id === id)

  if (!agentToDelete) {
    return false // Agent not found
  }

  // Get agent name (use new name field, fallback to deprecated alias)
  const agentName = agentToDelete.name || agentToDelete.alias

  // Kill all tmux sessions belonging to this agent
  if (agentName) {
    const { execSync } = require('child_process')

    // Kill sessions for all indices in the sessions array
    const sessions = agentToDelete.sessions || []
    for (const session of sessions) {
      const sessionName = computeSessionName(agentName, session.index)
      try {
        execSync(`tmux kill-session -t "${sessionName}" 2>/dev/null || true`, { encoding: 'utf-8' })
        console.log(`[Agent Registry] Killed tmux session: ${sessionName}`)
      } catch (error) {
        console.log(`[Agent Registry] Could not kill tmux session ${sessionName} (may not exist)`)
      }
    }

    // Also try to kill the base session name (in case sessions array is empty)
    if (sessions.length === 0) {
      try {
        execSync(`tmux kill-session -t "${agentName}" 2>/dev/null || true`, { encoding: 'utf-8' })
        console.log(`[Agent Registry] Killed tmux session: ${agentName}`)
      } catch (error) {
        console.log(`[Agent Registry] Could not kill tmux session ${agentName} (may not exist)`)
      }
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

  return agents.map(a => {
    const agentName = a.name || a.alias || 'unknown'
    const sessions: AgentSession[] = a.sessions || []

    // Find first online session for deprecated currentSession field
    const onlineSession = sessions.find(s => s.status === 'online')
    const currentSession = onlineSession ? computeSessionName(agentName, onlineSession.index) : undefined

    return {
      id: a.id,
      name: agentName,
      label: a.label,
      avatar: a.avatar,
      hostId: a.hostId || getSelfHostId(),
      hostUrl: a.hostUrl,
      status: a.status,
      lastActive: a.lastActive,
      sessions,
      deployment: a.deployment,
      // DEPRECATED: for backward compatibility
      alias: agentName,
      currentSession,
    }
  })
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
 * Uses parseSessionName to determine session index from tmux session name
 */
export function linkSession(agentId: string, sessionName: string, workingDirectory: string): boolean {
  const agents = loadAgents()
  const index = agents.findIndex(a => a.id === agentId)

  if (index === -1) {
    return false
  }

  // Parse session name to get index
  const { index: sessionIndex } = parseSessionName(sessionName)

  // Initialize sessions array if needed
  if (!agents[index].sessions) {
    agents[index].sessions = []
  }

  // Find or create session entry
  const existingSessionIdx = agents[index].sessions.findIndex(s => s.index === sessionIndex)
  const sessionData: AgentSession = {
    index: sessionIndex,
    status: 'online',
    workingDirectory,
    createdAt: new Date().toISOString(),
    lastActive: new Date().toISOString(),
  }

  if (existingSessionIdx >= 0) {
    agents[index].sessions[existingSessionIdx] = sessionData
  } else {
    agents[index].sessions.push(sessionData)
  }

  // Update agent-level working directory if not set
  if (!agents[index].workingDirectory) {
    agents[index].workingDirectory = workingDirectory
  }

  agents[index].status = 'active'
  agents[index].lastActive = new Date().toISOString()

  return saveAgents(agents)
}

/**
 * Update just the working directory for an agent's session
 * Used when the live tmux pwd differs from the stored workingDirectory
 */
export function updateAgentWorkingDirectory(agentId: string, workingDirectory: string, sessionIndex: number = 0): boolean {
  const agents = loadAgents()
  const index = agents.findIndex(a => a.id === agentId)

  if (index === -1) {
    return false
  }

  const oldWd = agents[index].workingDirectory
  if (oldWd === workingDirectory) {
    return true // No change needed
  }

  console.log(`[Agent Registry] Updating workingDirectory for ${agentId.substring(0, 8)}:`)
  console.log(`[Agent Registry]   Old: ${oldWd}`)
  console.log(`[Agent Registry]   New: ${workingDirectory}`)

  // Update agent-level working directory
  agents[index].workingDirectory = workingDirectory
  agents[index].lastActive = new Date().toISOString()

  // Also update specific session if it exists
  if (agents[index].sessions) {
    const sessionIdx = agents[index].sessions.findIndex(s => s.index === sessionIndex)
    if (sessionIdx >= 0) {
      agents[index].sessions[sessionIdx].workingDirectory = workingDirectory
      agents[index].sessions[sessionIdx].lastActive = new Date().toISOString()
    }
  }

  // Also update preferences if they exist
  if (agents[index].preferences) {
    agents[index].preferences.defaultWorkingDirectory = workingDirectory
  }

  return saveAgents(agents)
}

/**
 * Unlink session from agent (mark as offline)
 * If sessionIndex provided, only marks that session offline
 * If no sessionIndex, marks all sessions offline
 */
export function unlinkSession(agentId: string, sessionIndex?: number): boolean {
  const agents = loadAgents()
  const index = agents.findIndex(a => a.id === agentId)

  if (index === -1) {
    return false
  }

  // Update sessions array
  if (agents[index].sessions) {
    if (sessionIndex !== undefined) {
      // Mark specific session offline
      const sessionIdx = agents[index].sessions.findIndex(s => s.index === sessionIndex)
      if (sessionIdx >= 0) {
        agents[index].sessions[sessionIdx].status = 'offline'
        agents[index].sessions[sessionIdx].lastActive = new Date().toISOString()
      }
    } else {
      // Mark all sessions offline
      agents[index].sessions.forEach(s => {
        s.status = 'offline'
        s.lastActive = new Date().toISOString()
      })
    }
  }

  // Check if any sessions are still online
  const hasOnlineSession = agents[index].sessions?.some(s => s.status === 'online') ?? false
  agents[index].status = hasOnlineSession ? 'active' : 'offline'
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
 * Search agents by query (name, label, taskDescription, tags)
 */
export function searchAgents(query: string): Agent[] {
  const agents = loadAgents()
  const lowerQuery = query.toLowerCase()

  return agents.filter(a => {
    const agentName = a.name || a.alias || ''
    const agentLabel = a.label || ''
    return (
      agentName.toLowerCase().includes(lowerQuery) ||
      agentLabel.toLowerCase().includes(lowerQuery) ||
      a.taskDescription?.toLowerCase().includes(lowerQuery) ||
      a.tags?.some(tag => tag.toLowerCase().includes(lowerQuery))
    )
  })
}

/**
 * Resolve name/alias to agent ID
 * Used for messaging and other operations that reference agents by name
 */
export function resolveAlias(nameOrId: string): string | null {
  // Try by name first, then by ID
  const agent = getAgentByName(nameOrId) || getAgent(nameOrId)
  return agent?.id || null
}

/**
 * Rename agent
 * Updates the agent name (which affects all derived session names)
 */
export function renameAgent(agentId: string, newName: string): boolean {
  const agents = loadAgents()
  const index = agents.findIndex(a => a.id === agentId)

  if (index === -1) {
    return false
  }

  // Check if new name already exists
  const existing = getAgentByName(newName)
  if (existing && existing.id !== agentId) {
    console.error(`[Agent Registry] Cannot rename: agent with name "${newName}" already exists`)
    return false
  }

  const oldName = agents[index].name || agents[index].alias
  console.log(`[Agent Registry] Renaming agent from "${oldName}" to "${newName}"`)

  agents[index].name = newName
  // Clear deprecated alias
  delete agents[index].alias
  agents[index].lastActive = new Date().toISOString()

  return saveAgents(agents)
}

/**
 * @deprecated Use renameAgent instead
 * Kept for backward compatibility
 */
export function renameAgentSession(oldSessionName: string, newSessionName: string): boolean {
  // Parse old session name to find agent
  const { agentName: oldAgentName } = parseSessionName(oldSessionName)
  const { agentName: newAgentName } = parseSessionName(newSessionName)

  const agent = getAgentByName(oldAgentName)
  if (!agent) {
    return false
  }

  // If agent name changed, rename the agent
  if (oldAgentName !== newAgentName) {
    return renameAgent(agent.id, newAgentName)
  }

  return true // Same agent name, nothing to do
}

/**
 * Delete agent by session name
 * Parses session name to find agent, then deletes it
 */
export function deleteAgentBySession(sessionName: string): boolean {
  const agent = getAgentBySession(sessionName)
  if (!agent) {
    return false
  }

  return deleteAgent(agent.id)
}

/**
 * Add a session to an existing agent (for multi-session support)
 * Returns the new session index
 */
export function addSessionToAgent(agentId: string, workingDirectory?: string, role?: string): number | null {
  const agents = loadAgents()
  const index = agents.findIndex(a => a.id === agentId)

  if (index === -1) {
    return null
  }

  // Initialize sessions array if needed
  if (!agents[index].sessions) {
    agents[index].sessions = []
  }

  // Find next available index
  const existingIndices = agents[index].sessions.map(s => s.index)
  let nextIndex = 0
  while (existingIndices.includes(nextIndex)) {
    nextIndex++
  }

  // Add new session
  agents[index].sessions.push({
    index: nextIndex,
    status: 'offline',
    workingDirectory: workingDirectory || agents[index].workingDirectory,
    role,
    createdAt: new Date().toISOString(),
  })

  agents[index].lastActive = new Date().toISOString()
  saveAgents(agents)

  return nextIndex
}

/**
 * Remove a session from an agent
 */
export function removeSessionFromAgent(agentId: string, sessionIndex: number): boolean {
  const agents = loadAgents()
  const index = agents.findIndex(a => a.id === agentId)

  if (index === -1) {
    return false
  }

  if (!agents[index].sessions) {
    return false
  }

  const sessionIdx = agents[index].sessions.findIndex(s => s.index === sessionIndex)
  if (sessionIdx === -1) {
    return false
  }

  // Kill the tmux session first
  const agentName = agents[index].name || agents[index].alias
  if (agentName) {
    const sessionName = computeSessionName(agentName, sessionIndex)
    try {
      const { execSync } = require('child_process')
      execSync(`tmux kill-session -t "${sessionName}" 2>/dev/null || true`, { encoding: 'utf-8' })
      console.log(`[Agent Registry] Killed tmux session: ${sessionName}`)
    } catch (error) {
      // Session might not exist
    }
  }

  // Remove from array
  agents[index].sessions.splice(sessionIdx, 1)
  agents[index].lastActive = new Date().toISOString()

  return saveAgents(agents)
}
