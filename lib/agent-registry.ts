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

// Real names containing "IA" (feminine) or "AI" (masculine) to match avatar gender
const FEMALE_NAMES = [
  'Maria', 'Sofia', 'Lucia', 'Julia', 'Natalia', 'Olivia', 'Victoria', 'Valeria',
  'Cecilia', 'Emilia', 'Amelia', 'Patricia', 'Sylvia', 'Lydia', 'Gloria',
  'Virginia', 'Eugenia', 'Aurelia', 'Daria', 'Flavia', 'Livia', 'Nadia', 'Ophelia',
  'Saskia', 'Talia', 'Alicia', 'Anastasia', 'Antonia', 'Dahlia', 'Giulia', 'Octavia',
  'Tatiana', 'Xenia', 'Aria', 'Mia', 'Kaia', 'Gia', 'Laetitia', 'Cynthia',
  'Titania', 'Acacia', 'Cassia', 'Cordelia', 'Fuchsia', 'Honoria', 'Lavinia', 'Luciana',
]
const MALE_NAMES = [
  'Kai', 'Nikolai', 'Malachi', 'Cain', 'Blaine', 'Zain', 'Aidan', 'Rainer',
  'Gaius', 'Caius', 'Daire', 'Jairus', 'Zaire', 'Jair', 'Malakai', 'Raiden',
  'Craig', 'Aiken', 'Kaine', 'Zaiden', 'Caiden', 'Faisal', 'Naim', 'Chaim',
  'Blaise', 'Raimundo', 'Kairo', 'Saif', 'Raine', 'Dailey', 'Aindrea', 'Laird',
  'Rais', 'Aime', 'Baird', 'Cais', 'Daimhin', 'Ephraim', 'Germain', 'Haim',
]

/**
 * Compute hash from string (same algorithm as AgentBadge.tsx)
 */
function computeHash(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return hash
}

/**
 * Determine gender from agent ID (same logic as avatar selection)
 */
function getGenderFromId(agentId: string): 'male' | 'female' {
  const hash = computeHash(agentId)
  return (Math.abs(hash >> 8) % 2 === 0) ? 'male' : 'female'
}

/**
 * Generate avatar URL from agent ID (same as AgentBadge.tsx)
 * RandomUser.me has 100 men + 100 women = 200 unique portraits
 */
function generateAvatarUrl(agentId: string): string {
  const hash = computeHash(agentId)
  const index = Math.abs(hash) % 100
  const gender = getGenderFromId(agentId) === 'male' ? 'men' : 'women'
  return `/avatars/${gender}_${index.toString().padStart(2, '0')}.png`
}

/**
 * Get all used labels and avatars for a specific host
 */
function getUsedLabelsAndAvatars(hostId: string): { labels: Set<string>, avatars: Set<string> } {
  const agents = loadAgents()
  const labels = new Set<string>()
  const avatars = new Set<string>()

  for (const agent of agents) {
    if (agent.hostId === hostId) {
      if (agent.label) labels.add(agent.label)
      if (agent.avatar) avatars.add(agent.avatar)
    }
  }

  return { labels, avatars }
}

/**
 * Generate a unique persona name that matches the avatar gender
 * Ensures no duplicate names on the same host
 */
function generateUniquePersonaName(agentId: string, usedLabels: Set<string>): string {
  const hash = computeHash(agentId)
  const isMale = getGenderFromId(agentId) === 'male'
  const names = isMale ? MALE_NAMES : FEMALE_NAMES

  // Start with hash-based index, find next available
  let index = Math.abs(hash) % names.length
  let attempts = 0

  while (usedLabels.has(names[index]) && attempts < names.length) {
    index = (index + 1) % names.length
    attempts++
  }

  return names[index]
}

/**
 * Generate a unique avatar URL
 * Ensures no duplicate avatars on the same host
 */
function generateUniqueAvatarUrl(agentId: string, usedAvatars: Set<string>): string {
  const hash = computeHash(agentId)
  const gender = getGenderFromId(agentId) === 'male' ? 'men' : 'women'

  // Start with hash-based index, find next available
  let index = Math.abs(hash) % 100
  let attempts = 0

  while (attempts < 100) {
    const url = `/avatars/${gender}_${index.toString().padStart(2, '0')}.png`
    if (!usedAvatars.has(url)) {
      return url
    }
    index = (index + 1) % 100
    attempts++
  }

  // Fallback if all 100 are used (unlikely)
  return `/avatars/${gender}_${(Math.abs(hash) % 100).toString().padStart(2, '0')}.png`
}

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
 * Names are unique per-host, like email addresses (auth@macbook-pro ≠ auth@mac-mini)
 *
 * @param name - Agent name (case-insensitive)
 * @param hostId - Optional host ID. If provided, searches on that host. If not, searches on self host.
 */
export function getAgentByName(name: string, hostId?: string): Agent | null {
  const agents = loadAgents()
  const normalizedName = name.toLowerCase()

  if (hostId) {
    // Scoped to specific host
    return agents.find(a =>
      a.name?.toLowerCase() === normalizedName &&
      a.hostId?.toLowerCase() === hostId.toLowerCase()
    ) || null
  }

  // Default: search on self host only
  const selfHostId = getSelfHostId().toLowerCase()
  return agents.find(a =>
    a.name?.toLowerCase() === normalizedName &&
    a.hostId?.toLowerCase() === selfHostId
  ) || null
}

/**
 * Get agent by name from ANY host (global search)
 * Use sparingly - prefer getAgentByName(name, hostId) for per-host lookups
 */
export function getAgentByNameAnyHost(name: string): Agent | null {
  const agents = loadAgents()
  return agents.find(a => a.name?.toLowerCase() === name.toLowerCase()) || null
}

/**
 * Get agent by alias (DEPRECATED - use getAgentByName)
 * Kept for backward compatibility during migration
 *
 * @param alias - Agent alias or name (case-insensitive)
 * @param hostId - Optional host ID for per-host lookup
 */
export function getAgentByAlias(alias: string, hostId?: string): Agent | null {
  const agents = loadAgents()
  const normalizedAlias = alias.toLowerCase()

  // Determine which host to search on
  const targetHostId = hostId?.toLowerCase() || getSelfHostId().toLowerCase()

  // Try name first (on specific host), then deprecated alias field
  return agents.find(a =>
    (a.name?.toLowerCase() === normalizedAlias ||
     a.alias?.toLowerCase() === normalizedAlias) &&
    a.hostId?.toLowerCase() === targetHostId
  ) || null
}

/**
 * Get agent by alias from ANY host (global search)
 * DEPRECATED - use getAgentByAlias(alias, hostId) for per-host lookups
 */
export function getAgentByAliasAnyHost(alias: string): Agent | null {
  const agents = loadAgents()
  const normalizedAlias = alias.toLowerCase()
  return agents.find(a =>
    a.name?.toLowerCase() === normalizedAlias ||
    a.alias?.toLowerCase() === normalizedAlias
  ) || null
}

/**
 * Get agent by tmux session name
 * Uses parseSessionName to extract agent name from session (e.g., "website_1" → "website")
 *
 * @param sessionName - tmux session name
 * @param hostId - Optional host ID for per-host lookup
 */
export function getAgentBySession(sessionName: string, hostId?: string): Agent | null {
  const { agentName } = parseSessionName(sessionName)
  return getAgentByName(agentName, hostId)
}

/**
 * Create a new agent
 */
export function createAgent(request: CreateAgentRequest): Agent {
  const agents = loadAgents()

  // Support both new 'name' and deprecated 'alias'
  // Normalize to lowercase for case-insensitive consistency
  const agentName = (request.name || request.alias)?.toLowerCase()
  if (!agentName) {
    throw new Error('Agent name is required')
  }

  // Determine deployment type
  const deploymentType: DeploymentType = request.deploymentType || 'local'

  // Get host information FIRST (needed for uniqueness check)
  // Use hostname as hostId for cross-host compatibility
  // ALWAYS normalize hostId to canonical format (lowercase, no .local suffix)
  const selfHost = getSelfHost()
  const selfHostIdValue = getSelfHostId()
  // Normalize any provided hostId, or use self host
  const hostId = request.hostId
    ? request.hostId.toLowerCase().replace(/\.local$/, '')
    : (selfHost?.id || selfHostIdValue)
  const hostName = selfHost?.name || selfHostIdValue
  // NEVER use localhost - use actual IP from selfHost or hostname
  const hostUrl = selfHost?.url || `http://${selfHostIdValue}:23000`

  // Check if name already exists ON THIS HOST (like email: auth@host1 ≠ auth@host2)
  const existing = getAgentByName(agentName, hostId)
  if (existing) {
    throw new Error(`Agent "${agentName}" already exists on host "${hostId}"`)
  }

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

  // Generate ID first so we can use it for gender-matched persona name and avatar
  const agentId = uuidv4()

  // Get already used labels and avatars on this host
  const { labels: usedLabels, avatars: usedAvatars } = getUsedLabelsAndAvatars(hostId)

  // Auto-generate unique persona name if not provided, matching avatar gender
  let label = request.label || request.displayName
  if (!label) {
    label = generateUniquePersonaName(agentId, usedLabels)
  }

  // Auto-generate unique avatar URL if not provided
  let avatar = request.avatar
  if (!avatar) {
    avatar = generateUniqueAvatarUrl(agentId, usedAvatars)
  }

  // Create agent with new schema
  const agent: Agent = {
    id: agentId,
    name: agentName,
    label,
    avatar,
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
  // Normalize to lowercase for case-insensitive consistency
  const newName = (updates.name || updates.alias)?.toLowerCase()
  const currentName = agents[index].name || agents[index].alias
  const agentHostId = agents[index].hostId || getSelfHostId()

  // Check name uniqueness ON THIS HOST if being updated
  if (newName && newName.toLowerCase() !== currentName?.toLowerCase()) {
    const existing = getAgentByName(newName, agentHostId)
    if (existing && existing.id !== id) {
      throw new Error(`Agent "${newName}" already exists on host "${agentHostId}"`)
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
 * Supports formats: "name", "name@host", "uuid"
 * Used for messaging and other operations that reference agents by name
 *
 * @param nameOrId - Agent name, name@host, or UUID
 * @param defaultHostId - Optional default host if not specified in nameOrId
 */
export function resolveAlias(nameOrId: string, defaultHostId?: string): string | null {
  // Check for name@host format
  if (nameOrId.includes('@')) {
    const [name, hostId] = nameOrId.split('@')
    const agent = getAgentByName(name, hostId)
    return agent?.id || null
  }

  // Try by UUID first (globally unique)
  const byId = getAgent(nameOrId)
  if (byId) {
    return byId.id
  }

  // Try by name on specified or self host
  const hostId = defaultHostId || getSelfHostId()
  const agent = getAgentByName(nameOrId, hostId)
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

  // Get agent's host for per-host uniqueness check
  const agentHostId = agents[index].hostId || getSelfHostId()

  // Normalize to lowercase for case-insensitive consistency
  const normalizedNewName = newName.toLowerCase()

  // Check if new name already exists ON THIS HOST
  const existing = getAgentByName(normalizedNewName, agentHostId)
  if (existing && existing.id !== agentId) {
    console.error(`[Agent Registry] Cannot rename: agent "${normalizedNewName}" already exists on host "${agentHostId}"`)
    return false
  }

  const oldName = agents[index].name || agents[index].alias
  console.log(`[Agent Registry] Renaming agent from "${oldName}" to "${normalizedNewName}"`)

  agents[index].name = normalizedNewName
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

// ============================================================================
// Email Identity Management
// ============================================================================

import type { EmailAddress, EmailIndexEntry, EmailIndexResponse, EmailConflictError } from '@/types/agent'

/**
 * Normalize email address for case-insensitive comparison
 */
function normalizeEmail(email: string): string {
  return email.toLowerCase().trim()
}

/**
 * Validate email format (basic RFC 5322 validation)
 */
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email) && email.length <= 254
}

/**
 * Get email index - mapping of all email addresses to agent identity
 * Used by external gateways to build routing tables
 */
export function getEmailIndex(): EmailIndexResponse {
  const agents = loadAgents()
  const index: EmailIndexResponse = {}

  for (const agent of agents) {
    const agentName = agent.name || agent.alias || 'unknown'
    const addresses = agent.tools?.email?.addresses || []

    // Handle legacy single-address format
    if (agent.tools?.email?.address && addresses.length === 0) {
      const legacyEmail = normalizeEmail(agent.tools.email.address)
      index[legacyEmail] = {
        agentId: agent.id,
        agentName,
        hostId: agent.hostId || getSelfHostId(),
        primary: true,
      }
    }

    // Handle new multi-address format
    for (const addr of addresses) {
      const email = normalizeEmail(addr.address)
      index[email] = {
        agentId: agent.id,
        agentName,
        hostId: agent.hostId || getSelfHostId(),
        displayName: addr.displayName,
        primary: addr.primary || false,
        metadata: addr.metadata,
      }
    }
  }

  return index
}

/**
 * Find agent by email address (local lookup only)
 * Returns agent ID if found, null otherwise
 */
export function findAgentByEmail(email: string): string | null {
  const normalizedEmail = normalizeEmail(email)
  const agents = loadAgents()

  for (const agent of agents) {
    // Check legacy single-address format
    if (agent.tools?.email?.address) {
      if (normalizeEmail(agent.tools.email.address) === normalizedEmail) {
        return agent.id
      }
    }

    // Check new multi-address format
    const addresses = agent.tools?.email?.addresses || []
    for (const addr of addresses) {
      if (normalizeEmail(addr.address) === normalizedEmail) {
        return agent.id
      }
    }
  }

  return null
}

/**
 * Check if an email address is available (not claimed by any agent)
 * Checks local registry only - cross-host check happens at API layer
 */
export function isEmailAddressAvailableLocally(email: string, excludeAgentId?: string): boolean {
  const ownerId = findAgentByEmail(email)
  if (!ownerId) return true
  if (excludeAgentId && ownerId === excludeAgentId) return true
  return false
}

/**
 * Add an email address to an agent
 * Returns the updated agent or throws an error if address is already claimed
 */
export function addEmailAddress(
  agentId: string,
  emailAddress: EmailAddress
): Agent {
  const agents = loadAgents()
  const index = agents.findIndex(a => a.id === agentId)

  if (index === -1) {
    throw new Error(`Agent not found: ${agentId}`)
  }

  const normalizedEmail = normalizeEmail(emailAddress.address)

  // Validate email format
  if (!isValidEmail(normalizedEmail)) {
    throw new Error(`Invalid email format: ${emailAddress.address}`)
  }

  // Check uniqueness locally
  const existingOwnerId = findAgentByEmail(normalizedEmail)
  if (existingOwnerId && existingOwnerId !== agentId) {
    const existingOwner = getAgent(existingOwnerId)
    const error: EmailConflictError = {
      error: 'conflict',
      message: `Email address ${normalizedEmail} is already claimed`,
      claimedBy: {
        agentName: existingOwner?.name || existingOwner?.alias || 'unknown',
        hostId: existingOwner?.hostId || getSelfHostId(),
      }
    }
    throw error
  }

  // Initialize tools.email if needed
  if (!agents[index].tools) {
    agents[index].tools = {}
  }
  if (!agents[index].tools.email) {
    agents[index].tools.email = {
      enabled: true,
      addresses: [],
    }
  }
  if (!agents[index].tools.email.addresses) {
    agents[index].tools.email.addresses = []
  }

  // Check max addresses limit (10)
  if (agents[index].tools.email.addresses.length >= 10) {
    throw new Error('Maximum of 10 email addresses per agent')
  }

  // Check if address already exists on this agent
  const existingIdx = agents[index].tools.email.addresses.findIndex(
    a => normalizeEmail(a.address) === normalizedEmail
  )
  if (existingIdx >= 0) {
    throw new Error(`Email address ${normalizedEmail} already exists on this agent`)
  }

  // If this is marked as primary, unmark other primaries
  if (emailAddress.primary) {
    agents[index].tools.email.addresses.forEach(a => {
      a.primary = false
    })
  }

  // Add the address (normalized)
  agents[index].tools.email.addresses.push({
    ...emailAddress,
    address: normalizedEmail,
  })

  // If this is the first address, make it primary
  if (agents[index].tools.email.addresses.length === 1) {
    agents[index].tools.email.addresses[0].primary = true
  }

  agents[index].lastActive = new Date().toISOString()
  saveAgents(agents)

  return agents[index]
}

/**
 * Remove an email address from an agent
 */
export function removeEmailAddress(agentId: string, email: string): Agent {
  const agents = loadAgents()
  const index = agents.findIndex(a => a.id === agentId)

  if (index === -1) {
    throw new Error(`Agent not found: ${agentId}`)
  }

  const normalizedEmail = normalizeEmail(email)

  if (!agents[index].tools?.email?.addresses) {
    throw new Error(`Agent has no email addresses`)
  }

  const addrIndex = agents[index].tools.email.addresses.findIndex(
    a => normalizeEmail(a.address) === normalizedEmail
  )

  if (addrIndex === -1) {
    throw new Error(`Email address not found: ${email}`)
  }

  const wasRemovePrimary = agents[index].tools.email.addresses[addrIndex].primary

  // Remove the address
  agents[index].tools.email.addresses.splice(addrIndex, 1)

  // If we removed the primary, make the first remaining address primary
  if (wasRemovePrimary && agents[index].tools.email.addresses.length > 0) {
    agents[index].tools.email.addresses[0].primary = true
  }

  agents[index].lastActive = new Date().toISOString()
  saveAgents(agents)

  return agents[index]
}

/**
 * Get all email addresses for an agent
 */
export function getAgentEmailAddresses(agentId: string): EmailAddress[] {
  const agent = getAgent(agentId)
  if (!agent) return []

  const addresses: EmailAddress[] = []

  // Handle legacy single-address format
  if (agent.tools?.email?.address && (!agent.tools.email.addresses || agent.tools.email.addresses.length === 0)) {
    addresses.push({
      address: agent.tools.email.address,
      primary: true,
    })
  }

  // Handle new multi-address format
  if (agent.tools?.email?.addresses) {
    addresses.push(...agent.tools.email.addresses)
  }

  return addresses
}

/**
 * Update an existing email address on an agent
 */
export function updateEmailAddress(
  agentId: string,
  email: string,
  updates: Partial<Omit<EmailAddress, 'address'>>
): Agent {
  const agents = loadAgents()
  const index = agents.findIndex(a => a.id === agentId)

  if (index === -1) {
    throw new Error(`Agent not found: ${agentId}`)
  }

  const normalizedEmail = normalizeEmail(email)

  if (!agents[index].tools?.email?.addresses) {
    throw new Error(`Agent has no email addresses`)
  }

  const addrIndex = agents[index].tools.email.addresses.findIndex(
    a => normalizeEmail(a.address) === normalizedEmail
  )

  if (addrIndex === -1) {
    throw new Error(`Email address not found: ${email}`)
  }

  // If setting this as primary, unmark other primaries
  if (updates.primary) {
    agents[index].tools.email.addresses.forEach(a => {
      a.primary = false
    })
  }

  // Update the address
  agents[index].tools.email.addresses[addrIndex] = {
    ...agents[index].tools.email.addresses[addrIndex],
    ...updates,
  }

  agents[index].lastActive = new Date().toISOString()
  saveAgents(agents)

  return agents[index]
}

// ============================================================================
// Skills Management
// ============================================================================

import type { AgentSkillsConfig, AgentCustomSkill } from '@/types/agent'

/**
 * Default AI Maestro skills included with every agent
 */
export const DEFAULT_AI_MAESTRO_SKILLS = [
  'agent-messaging',
  'docs-search',
  'graph-query',
  'memory-search',
  'planning',
]

/**
 * Get skills configuration for an agent
 * Returns default config if agent has no skills configured
 */
export function getAgentSkills(agentId: string): AgentSkillsConfig | null {
  const agent = getAgent(agentId)
  if (!agent) return null

  return agent.skills || {
    marketplace: [],
    aiMaestro: {
      enabled: true,
      skills: DEFAULT_AI_MAESTRO_SKILLS,
    },
    custom: [],
  }
}

/**
 * Add marketplace skills to an agent
 * @param agentId - Agent ID
 * @param skillsToAdd - Array of skill objects to add
 * @returns Updated agent or null if agent not found
 */
export function addMarketplaceSkills(
  agentId: string,
  skillsToAdd: Array<{
    id: string
    marketplace: string
    plugin: string
    name: string
    version?: string
  }>
): Agent | null {
  const agents = loadAgents()
  const index = agents.findIndex(a => a.id === agentId)

  if (index === -1) {
    return null
  }

  // Initialize skills if not present
  if (!agents[index].skills) {
    agents[index].skills = {
      marketplace: [],
      aiMaestro: {
        enabled: true,
        skills: DEFAULT_AI_MAESTRO_SKILLS,
      },
      custom: [],
    }
  }

  const now = new Date().toISOString()

  for (const skill of skillsToAdd) {
    // Check if already installed
    const existing = agents[index].skills!.marketplace.find(s => s.id === skill.id)
    if (existing) {
      // Update version if provided
      if (skill.version) {
        existing.version = skill.version
      }
      continue
    }

    // Add new skill
    agents[index].skills!.marketplace.push({
      id: skill.id,
      marketplace: skill.marketplace,
      plugin: skill.plugin,
      name: skill.name,
      version: skill.version,
      installedAt: now,
    })
  }

  agents[index].lastActive = now
  saveAgents(agents)

  return agents[index]
}

/**
 * Remove marketplace skills from an agent
 * @param agentId - Agent ID
 * @param skillIds - Array of skill IDs to remove
 * @returns Updated agent or null if agent not found
 */
export function removeMarketplaceSkills(agentId: string, skillIds: string[]): Agent | null {
  const agents = loadAgents()
  const index = agents.findIndex(a => a.id === agentId)

  if (index === -1) {
    return null
  }

  if (!agents[index].skills?.marketplace) {
    return agents[index]
  }

  agents[index].skills!.marketplace = agents[index].skills!.marketplace.filter(
    s => !skillIds.includes(s.id)
  )

  agents[index].lastActive = new Date().toISOString()
  saveAgents(agents)

  return agents[index]
}

/**
 * Add a custom skill to an agent
 * Custom skills are stored in the agent's folder: ~/.aimaestro/agents/{id}/skills/
 * @param agentId - Agent ID
 * @param skill - Custom skill to add
 * @returns Updated agent or null if agent not found
 */
export function addCustomSkill(
  agentId: string,
  skill: {
    name: string
    content: string
    description?: string
  }
): Agent | null {
  const agents = loadAgents()
  const index = agents.findIndex(a => a.id === agentId)

  if (index === -1) {
    return null
  }

  // Initialize skills if not present
  if (!agents[index].skills) {
    agents[index].skills = {
      marketplace: [],
      aiMaestro: {
        enabled: true,
        skills: DEFAULT_AI_MAESTRO_SKILLS,
      },
      custom: [],
    }
  }

  const now = new Date().toISOString()

  // Check if skill with same name exists
  const existingIndex = agents[index].skills!.custom.findIndex(
    s => s.name.toLowerCase() === skill.name.toLowerCase()
  )

  // Write skill file to agent's folder
  const agentSkillsDir = path.join(AGENTS_DIR, agentId, 'skills', skill.name)
  const skillFilePath = path.join(agentSkillsDir, 'SKILL.md')
  const relativePath = path.join('skills', skill.name)

  try {
    fs.mkdirSync(agentSkillsDir, { recursive: true })
    fs.writeFileSync(skillFilePath, skill.content, 'utf-8')
  } catch (error) {
    console.error('Failed to write custom skill file:', error)
    return null
  }

  const customSkill: AgentCustomSkill = {
    name: skill.name,
    path: relativePath,
    description: skill.description,
    createdAt: existingIndex >= 0 ? agents[index].skills!.custom[existingIndex].createdAt : now,
    updatedAt: now,
  }

  if (existingIndex >= 0) {
    // Update existing
    agents[index].skills!.custom[existingIndex] = customSkill
  } else {
    // Add new
    agents[index].skills!.custom.push(customSkill)
  }

  agents[index].lastActive = now
  saveAgents(agents)

  return agents[index]
}

/**
 * Remove a custom skill from an agent
 * Also deletes the skill file from disk
 * @param agentId - Agent ID
 * @param skillName - Name of the custom skill to remove
 * @returns Updated agent or null if agent not found
 */
export function removeCustomSkill(agentId: string, skillName: string): Agent | null {
  const agents = loadAgents()
  const index = agents.findIndex(a => a.id === agentId)

  if (index === -1) {
    return null
  }

  if (!agents[index].skills?.custom) {
    return agents[index]
  }

  // Find the skill
  const skillIndex = agents[index].skills!.custom.findIndex(
    s => s.name.toLowerCase() === skillName.toLowerCase()
  )

  if (skillIndex === -1) {
    return agents[index]
  }

  // Get the path and try to delete the file
  const skill = agents[index].skills!.custom[skillIndex]
  const skillDir = path.join(AGENTS_DIR, agentId, skill.path)

  try {
    if (fs.existsSync(skillDir)) {
      fs.rmSync(skillDir, { recursive: true })
    }
  } catch (error) {
    console.error('Failed to delete custom skill folder:', error)
    // Continue anyway to remove from registry
  }

  // Remove from registry
  agents[index].skills!.custom.splice(skillIndex, 1)

  agents[index].lastActive = new Date().toISOString()
  saveAgents(agents)

  return agents[index]
}

/**
 * Update AI Maestro skills configuration for an agent
 * @param agentId - Agent ID
 * @param config - New AI Maestro config
 * @returns Updated agent or null if agent not found
 */
export function updateAiMaestroSkills(
  agentId: string,
  config: {
    enabled?: boolean
    skills?: string[]
  }
): Agent | null {
  const agents = loadAgents()
  const index = agents.findIndex(a => a.id === agentId)

  if (index === -1) {
    return null
  }

  // Initialize skills if not present
  if (!agents[index].skills) {
    agents[index].skills = {
      marketplace: [],
      aiMaestro: {
        enabled: true,
        skills: DEFAULT_AI_MAESTRO_SKILLS,
      },
      custom: [],
    }
  }

  if (config.enabled !== undefined) {
    agents[index].skills!.aiMaestro.enabled = config.enabled
  }

  if (config.skills !== undefined) {
    agents[index].skills!.aiMaestro.skills = config.skills
  }

  agents[index].lastActive = new Date().toISOString()
  saveAgents(agents)

  return agents[index]
}

// ============================================================================
// HOST ID NORMALIZATION (Phase 1: AMP Protocol Fix)
// ============================================================================

/**
 * Normalize a hostId to canonical format for AMP compatibility
 * - Lowercase for case-insensitive consistency
 * - Strip .local suffix (macOS Bonjour/mDNS)
 * - Convert legacy 'local' to actual hostname
 *
 * @param hostId - Raw host ID (could be 'local', 'Juans-MacBook-Pro.local', etc.)
 * @returns Canonical hostId (lowercase, no .local suffix)
 */
export function normalizeHostId(hostId: string | undefined): string {
  const selfHostId = getSelfHostId()

  // Handle undefined or empty
  if (!hostId || hostId === '' || hostId === 'local') {
    return selfHostId
  }

  // Normalize: lowercase and strip .local suffix
  return hostId.toLowerCase().replace(/\.local$/, '')
}

/**
 * Check if a hostId needs normalization
 * @param hostId - Host ID to check
 * @returns true if hostId is not in canonical format
 */
export function needsHostIdNormalization(hostId: string | undefined): boolean {
  if (!hostId) return true
  if (hostId === 'local') return true
  if (hostId !== hostId.toLowerCase()) return true
  if (hostId.endsWith('.local')) return true
  return false
}

/**
 * Normalize all agent hostIds to canonical format
 * Fixes agents with:
 * - Legacy 'local' hostId
 * - Mixed case hostIds (e.g., 'Juans-MacBook-Pro')
 * - .local suffix (e.g., 'juans-macbook-pro.local')
 *
 * @returns { updated: number, skipped: number, agents: { id: string, name: string, oldHostId: string, newHostId: string }[] }
 */
export function normalizeAllAgentHostIds(): {
  updated: number
  skipped: number
  agents: { id: string, name: string, oldHostId: string, newHostId: string }[]
} {
  const agents = loadAgents()
  const result = {
    updated: 0,
    skipped: 0,
    agents: [] as { id: string, name: string, oldHostId: string, newHostId: string }[]
  }

  let hasChanges = false

  for (const agent of agents) {
    const oldHostId = agent.hostId || 'local'
    const newHostId = normalizeHostId(agent.hostId)

    if (oldHostId !== newHostId) {
      agent.hostId = newHostId
      // Also normalize hostName and hostUrl if they reference this host
      if (agent.hostName) {
        agent.hostName = normalizeHostId(agent.hostName)
      }
      result.updated++
      result.agents.push({
        id: agent.id,
        name: agent.name || agent.alias || 'unknown',
        oldHostId,
        newHostId
      })
      hasChanges = true
    } else {
      result.skipped++
    }
  }

  if (hasChanges) {
    saveAgents(agents)
    console.log(`[Agent Registry] Normalized ${result.updated} agent hostIds`)
  }

  return result
}

/**
 * Get agents grouped by hostId for mesh directory
 * @returns Map of hostId -> array of agents
 */
export function getAgentsByHost(): Map<string, Agent[]> {
  const agents = loadAgents()
  const byHost = new Map<string, Agent[]>()

  for (const agent of agents) {
    const hostId = normalizeHostId(agent.hostId)
    if (!byHost.has(hostId)) {
      byHost.set(hostId, [])
    }
    byHost.get(hostId)!.push(agent)
  }

  return byHost
}

/**
 * Get a summary of hostId inconsistencies for diagnosis
 * @returns Summary of all unique hostIds and agent counts
 */
export function diagnoseHostIds(): {
  canonical: string
  hostIds: { hostId: string, count: number, needsNormalization: boolean }[]
  totalAgents: number
  agentsNeedingNormalization: number
} {
  const agents = loadAgents()
  const canonical = getSelfHostId()
  const hostIdCounts = new Map<string, number>()

  for (const agent of agents) {
    const hostId = agent.hostId || 'local'
    hostIdCounts.set(hostId, (hostIdCounts.get(hostId) || 0) + 1)
  }

  const hostIds = Array.from(hostIdCounts.entries()).map(([hostId, count]) => ({
    hostId,
    count,
    needsNormalization: needsHostIdNormalization(hostId)
  }))

  const agentsNeedingNormalization = hostIds
    .filter(h => h.needsNormalization)
    .reduce((sum, h) => sum + h.count, 0)

  return {
    canonical,
    hostIds,
    totalAgents: agents.length,
    agentsNeedingNormalization
  }
}

// ============================================================================
// MESH-WIDE AGENT OPERATIONS (Phase 2: AMP Registration Enforcement)
// ============================================================================

/**
 * Check if an agent name exists locally (on this host)
 * @param name - Agent name to check
 * @returns Agent if found, null otherwise
 */
export function checkLocalAgentExists(name: string): Agent | null {
  const selfHostId = getSelfHostId()
  return getAgentByName(name, selfHostId)
}

/**
 * Check if an agent name exists anywhere in the mesh
 * This queries all known peer hosts to ensure mesh-wide uniqueness
 *
 * @param name - Agent name to check
 * @param timeout - Timeout in ms for peer queries (default: 5000)
 * @returns { exists: boolean, host?: string, agent?: AgentSummary }
 */
export async function checkMeshAgentExists(
  name: string,
  timeout: number = 5000
): Promise<{
  exists: boolean
  host?: string
  agent?: AgentSummary
  checkedHosts: string[]
  failedHosts: string[]
}> {
  const { getPeerHosts } = await import('./hosts-config')

  const result = {
    exists: false,
    host: undefined as string | undefined,
    agent: undefined as AgentSummary | undefined,
    checkedHosts: [] as string[],
    failedHosts: [] as string[]
  }

  // Check locally first
  const selfHostId = getSelfHostId()
  const localAgent = getAgentByName(name, selfHostId)
  if (localAgent) {
    result.exists = true
    result.host = selfHostId
    result.agent = {
      id: localAgent.id,
      name: localAgent.name || localAgent.alias || '',
      label: localAgent.label,
      hostId: localAgent.hostId || selfHostId,
      status: localAgent.status,
      lastActive: localAgent.lastActive,
      sessions: localAgent.sessions || [],
      deployment: localAgent.deployment
    }
    result.checkedHosts.push(selfHostId)
    return result
  }
  result.checkedHosts.push(selfHostId)

  // Check peer hosts in parallel
  const peerHosts = getPeerHosts()
  const normalizedName = name.toLowerCase()

  const checks = peerHosts.map(async (host) => {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeout)

      const response = await fetch(`${host.url}/api/agents/by-name/${encodeURIComponent(normalizedName)}`, {
        signal: controller.signal
      })
      clearTimeout(timeoutId)

      if (response.ok) {
        const data = await response.json()
        if (data.agent) {
          return { host: host.id, agent: data.agent, success: true }
        }
      }
      return { host: host.id, success: true }
    } catch (error) {
      return { host: host.id, success: false, error }
    }
  })

  const results = await Promise.all(checks)

  for (const checkResult of results) {
    if (checkResult.success) {
      result.checkedHosts.push(checkResult.host)
      if (checkResult.agent) {
        result.exists = true
        result.host = checkResult.host
        result.agent = checkResult.agent
        // Found a match, but continue to build full list of checked hosts
      }
    } else {
      result.failedHosts.push(checkResult.host)
    }
  }

  return result
}

/**
 * Mark an agent as AMP-registered
 * Sets the ampRegistered flag and stores AMP metadata
 *
 * @param agentId - Agent ID
 * @param ampData - AMP registration data
 */
export function markAgentAsAMPRegistered(
  agentId: string,
  ampData: {
    address: string
    tenant: string
    fingerprint: string
    registeredAt: string
    apiKeyHash?: string
  }
): Agent | null {
  const agents = loadAgents()
  const index = agents.findIndex(a => a.id === agentId)

  if (index === -1) {
    return null
  }

  // Set AMP-registered flag and metadata
  agents[index].ampRegistered = true
  agents[index].metadata = {
    ...agents[index].metadata,
    amp: {
      ...agents[index].metadata?.amp,
      address: ampData.address,
      tenant: ampData.tenant,
      fingerprint: ampData.fingerprint,
      registeredAt: ampData.registeredAt,
      apiKeyHash: ampData.apiKeyHash
    }
  }
  agents[index].lastActive = new Date().toISOString()

  saveAgents(agents)
  return agents[index]
}

/**
 * Get all AMP-registered agents
 */
export function getAMPRegisteredAgents(): Agent[] {
  const agents = loadAgents()
  return agents.filter(a => a.ampRegistered === true)
}

/**
 * Get all non-AMP-registered agents (legacy agents)
 */
export function getLegacyAgents(): Agent[] {
  const agents = loadAgents()
  return agents.filter(a => a.ampRegistered !== true)
}
