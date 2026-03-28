/**
 * Agents Core Service
 *
 * Pure business logic extracted from app/api/agents/** routes.
 * No HTTP concepts (Request, Response, NextResponse, headers) leak into this module.
 * API routes become thin wrappers that call these functions.
 *
 * Covers:
 *   GET    /api/agents                    -> listAgents / searchAgentsByQuery
 *   POST   /api/agents                    -> createNewAgent
 *   GET    /api/agents/[id]               -> getAgentById
 *   PATCH  /api/agents/[id]               -> updateAgentById
 *   DELETE /api/agents/[id]               -> deleteAgentById
 *   POST   /api/agents/register           -> registerAgent
 *   GET    /api/agents/by-name/[name]     -> lookupAgentByName
 *   GET    /api/agents/unified            -> getUnifiedAgents
 *   GET    /api/agents/[id]/session       -> getAgentSessionStatus
 *   POST   /api/agents/[id]/session       -> linkAgentSession
 *   PATCH  /api/agents/[id]/session       -> sendAgentSessionCommand
 *   DELETE /api/agents/[id]/session       -> unlinkOrDeleteAgentSession
 *   POST   /api/agents/[id]/wake          -> wakeAgent
 *   POST   /api/agents/[id]/hibernate     -> hibernateAgent
 *   POST   /api/agents/startup            -> initializeStartup
 *   GET    /api/agents/startup            -> getStartupInfo
 *   POST   /api/agents/health             -> proxyHealthCheck
 */

import fs from 'fs'
import path from 'path'
import os from 'os'
import { execSync } from 'child_process'
import { v4 as uuidv4 } from 'uuid'
import type {
  Agent,
  AgentSession,
  AgentSessionStatus,
  AgentStats,
  CreateAgentRequest,
  UpdateAgentRequest,
} from '@/types/agent'
import {
  parseSessionName,
  parseNameForDisplay,
  computeSessionName,
} from '@/types/agent'
import {
  loadAgents,
  saveAgents,
  createAgent,
  getAgent,
  getAgentByName,
  getAgentBySession,
  updateAgent,
  deleteAgent,
  searchAgents,
  linkSession,
  unlinkSession,
} from '@/lib/agent-registry'
import { resolveAgentIdentifier } from '@/lib/messageQueue'
import { getHosts, getSelfHost, getSelfHostId, isSelf } from '@/lib/hosts-config'
import { persistSession, unpersistSession } from '@/lib/session-persistence'
import { initAgentAMPHome, getAgentAMPDir } from '@/lib/amp-inbox-writer'
import { initializeAllAgents, getStartupStatus } from '@/lib/agent-startup'
import { sessionActivity } from '@/services/shared-state'
import { getRuntime } from '@/lib/agent-runtime'
import { isManager, isChiefOfStaffAnywhere } from '@/lib/governance'
import { isValidUuid } from '@/lib/validation'
import { loadTeams } from '@/lib/team-registry'
import type { Host } from '@/types/host'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

import { ServiceResult } from '@/types/service'
// NT-006: ServiceResult re-export removed — import directly from @/types/service

interface DiscoveredSession {
  name: string
  workingDirectory: string
  status: 'active' | 'idle' | 'disconnected'
  createdAt: string
  lastActivity: string
  windows: number
}

interface HostAgentResponse {
  agents: Agent[]
  stats: AgentStats
  hostInfo: {
    id: string
    name: string
    url: string
  }
}

interface UnifiedAgentResult {
  agent: Agent
  sourceHost: {
    id: string
    name: string
    url: string
  }
  qualifiedName: string // agent@host format
}

interface HostFetchResult {
  host: Host
  success: boolean
  agents: Agent[]
  stats: AgentStats | null
  error?: string
}

export interface RegisterAgentParams {
  // WorkTree format
  sessionName?: string
  workingDirectory?: string
  // Cloud agent format
  id?: string
  deployment?: {
    cloud?: {
      websocketUrl: string
    }
  }
  // NT-006: Replaced index signature with explicit field for cloud-specific extras
  cloudConfig?: Record<string, unknown>
}

export interface WakeAgentParams {
  startProgram?: boolean
  sessionIndex?: number
  program?: string
}

export interface HibernateAgentParams {
  sessionIndex?: number
}

export interface AgentSessionCommandParams {
  command: string
  requireIdle?: boolean
  addNewline?: boolean
}

export interface LinkSessionParams {
  sessionName: string
  workingDirectory?: string
}

export interface UnlinkSessionParams {
  kill?: boolean
  deleteAgent?: boolean
  // Which session index to target when computing the tmux session name (defaults to 0)
  sessionIndex?: number
}

export interface UnifiedAgentsParams {
  query?: string | null
  includeOffline?: boolean
  timeout?: number
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Idle threshold in milliseconds (30 seconds) */
const IDLE_THRESHOLD_MS = 30 * 1000

// ---------------------------------------------------------------------------
// Internal helpers (shared across multiple endpoints)
// ---------------------------------------------------------------------------

/** Check if a session is idle based on activity threshold */
function isSessionIdle(sessionName: string): boolean {
  const activity = sessionActivity.get(sessionName)
  if (!activity) return true // No activity recorded = idle
  return (Date.now() - activity) > IDLE_THRESHOLD_MS
}

/** Strips unsafe characters from CLI arguments. Allows: a-z A-Z 0-9 space - _ . = / : , ~ @ */
function sanitizeArgs(args: string): string {
  return args.replace(/[^a-zA-Z0-9\s\-_.=/:,~@]/g, '').trim()
}

/** Resolve program name to CLI command */
function resolveStartCommand(program: string): string {
  // SF-008: Removed redundant `|| program.includes('claude code')` — 'claude code' always matches 'claude' first
  if (program.includes('claude')) {
    return 'claude'
  } else if (program.includes('codex')) {
    return 'codex'
  } else if (program.includes('aider')) {
    return 'aider'
  } else if (program.includes('cursor')) {
    return 'cursor'
  } else if (program.includes('gemini')) {
    return 'gemini'
  } else if (program.includes('opencode')) {
    return 'opencode'
  } else if (program.includes('openclaw')) {
    // SF-009: Keep resolveStartCommand in sync with sessions-service program resolution
    return 'openclaw'
  }
  return 'claude' // Default
}

/**
 * Discover all tmux sessions on this host
 */
async function discoverLocalSessions(): Promise<DiscoveredSession[]> {
  try {
    const runtime = getRuntime()
    const discovered = await runtime.listSessions()

    return discovered.map(disc => {
      const activityTimestamp = sessionActivity.get(disc.name)

      let lastActivity: string
      let status: 'active' | 'idle' | 'disconnected'

      if (activityTimestamp) {
        lastActivity = new Date(activityTimestamp).toISOString()
        const secondsSinceActivity = (Date.now() - activityTimestamp) / 1000
        status = secondsSinceActivity > 3 ? 'idle' : 'active'
      } else {
        lastActivity = disc.createdAt
        status = 'disconnected'
      }

      return {
        name: disc.name,
        workingDirectory: disc.workingDirectory,
        status,
        createdAt: disc.createdAt,
        lastActivity,
        windows: disc.windows,
      }
    })
  } catch (error) {
    console.error('[Agents] Error discovering local sessions:', error)
    return []
  }
}

/**
 * Auto-create an agent for an orphan session.
 * Uses parseSessionName to extract agent name from tmux session name.
 */
function createOrphanAgent(
  session: DiscoveredSession,
  hostId: string,
  hostName: string,
  hostUrl: string
): Agent {
  const { agentName: rawAgentName, index } = parseSessionName(session.name)
  const agentName = rawAgentName.toLowerCase()
  const { tags } = parseNameForDisplay(agentName)

  const agentSession: AgentSession = {
    index,
    status: 'online',
    workingDirectory: session.workingDirectory || process.cwd(),
    createdAt: session.createdAt,
    lastActive: session.lastActivity,
  }

  const agent: Agent = {
    id: uuidv4(),
    name: agentName,
    label: undefined,
    workingDirectory: session.workingDirectory || process.cwd(),
    sessions: [agentSession],
    hostId,
    hostName,
    hostUrl,
    program: 'claude-code',
    taskDescription: 'Auto-registered from orphan tmux session',
    tags,
    capabilities: [],
    deployment: {
      type: 'local',
      local: {
        hostname: os.hostname(),
        platform: os.platform(),
      }
    },
    tools: {},
    status: 'active',
    createdAt: session.createdAt,
    lastActive: session.lastActivity,
    metadata: {
      autoRegistered: true,
      autoRegisteredAt: new Date().toISOString(),
    }
  }

  return agent
}

/** Check what process is running in the tmux pane (e.g., "claude", "zsh", "node") */
function getPaneCommand(tmuxSessionName: string): { paneCommand: string; programRunning: boolean } {
  const SHELL_COMMANDS = new Set(['zsh', 'bash', 'sh', 'fish', 'tcsh', 'csh', 'dash'])
  try {
    const cmd = execSync(
      `tmux list-panes -t "${tmuxSessionName}" -F "#{pane_current_command}" 2>/dev/null`,
      { encoding: 'utf-8', timeout: 2000 }
    ).trim()
    const paneCommand = cmd.split('\n')[0] || ''
    return { paneCommand, programRunning: !SHELL_COMMANDS.has(paneCommand) }
  } catch {
    return { paneCommand: '', programRunning: false }
  }
}

/**
 * Merge agent with runtime session status and host info
 */
function mergeAgentWithSession(
  agent: Agent,
  sessionStatus: AgentSessionStatus,
  hostId: string,
  hostName: string,
  hostUrl: string,
  isOrphan: boolean
): Agent {
  return {
    ...agent,
    hostId,
    hostName,
    hostUrl,
    session: sessionStatus,
    isOrphan
  }
}

/**
 * Set up AMP environment for an agent in a tmux session.
 * Non-fatal -- agent still works without AMP.
 */
async function setupAMPForSession(
  sessionName: string,
  agentName: string,
  agentId?: string
): Promise<string> {
  let ampDir = ''
  try {
    const runtime = getRuntime()
    await initAgentAMPHome(agentName, agentId)
    ampDir = getAgentAMPDir(agentName, agentId)
    await runtime.setEnvironment(sessionName, 'AMP_DIR', ampDir)
    await runtime.setEnvironment(sessionName, 'AIM_AGENT_NAME', agentName)
    if (agentId) {
      await runtime.setEnvironment(sessionName, 'AIM_AGENT_ID', agentId)
    }
    await runtime.unsetEnvironment(sessionName, 'CLAUDECODE')
    console.log(`[Agents] Set AMP_DIR=${ampDir} for agent ${agentName}`)
  } catch (ampError) {
    console.warn(`[Agents] Could not set up AMP for ${agentName}:`, ampError)
  }
  return ampDir
}

/**
 * Update agent session status in the registry after wake/hibernate.
 */
function updateAgentSessionInRegistry(
  agentId: string,
  sessionIndex: number,
  status: 'online' | 'offline',
  workingDirectory?: string,
  incrementLaunch: boolean = false
): void {
  const agents = loadAgents()
  const index = agents.findIndex(a => a.id === agentId)
  if (index === -1) return

  if (!agents[index].sessions) {
    agents[index].sessions = []
  }

  const sessionIdx = agents[index].sessions.findIndex(s => s.index === sessionIndex)

  if (status === 'online') {
    const sessionData: AgentSession = {
      index: sessionIndex,
      status: 'online',
      workingDirectory: workingDirectory || agents[index].workingDirectory,
      createdAt: new Date().toISOString(),
      lastActive: new Date().toISOString(),
    }
    if (sessionIdx >= 0) {
      agents[index].sessions[sessionIdx] = sessionData
    } else {
      agents[index].sessions.push(sessionData)
    }
    agents[index].status = 'active'
  } else {
    if (sessionIdx >= 0) {
      agents[index].sessions[sessionIdx].status = 'offline'
      agents[index].sessions[sessionIdx].lastActive = new Date().toISOString()
    }
    const hasOnlineSession = agents[index].sessions?.some(s => s.status === 'online') ?? false
    agents[index].status = hasOnlineSession ? 'active' : 'offline'
  }

  agents[index].lastActive = new Date().toISOString()

  if (incrementLaunch) {
    agents[index].launchCount = (agents[index].launchCount || 0) + 1
  }

  saveAgents(agents)
}

// ===========================================================================
// PUBLIC API -- called by API routes
// ===========================================================================

// ---------------------------------------------------------------------------
// GET /api/agents -- list agents with tmux discovery + search
// ---------------------------------------------------------------------------

export async function listAgents(): Promise<ServiceResult<{
  agents: Agent[]
  stats: AgentStats
  hostInfo: { id: string; name: string; url: string; isSelf: boolean }
}>> {
  try {
    const selfHost = getSelfHost()
    const hostName = selfHost?.name || os.hostname()
    const hostId = selfHost?.id || hostName
    const hostUrl = selfHost?.url || `http://${os.hostname().toLowerCase()}:23000`

    // 1. Load all registered agents from this host's registry (exclude soft-deleted)
    const agents = loadAgents().filter(a => !a.deletedAt)

    // 2. Discover local tmux sessions
    const discoveredSessions = await discoverLocalSessions()
    console.log(`[Agents] Found ${discoveredSessions.length} local tmux session(s)`)

    // 3. Group discovered sessions by agent name (NORMALIZED TO LOWERCASE)
    const sessionsByAgentName = new Map<string, DiscoveredSession[]>()
    for (const session of discoveredSessions) {
      const { agentName } = parseSessionName(session.name)
      const normalizedName = agentName.toLowerCase()
      if (!sessionsByAgentName.has(normalizedName)) {
        sessionsByAgentName.set(normalizedName, [])
      }
      sessionsByAgentName.get(normalizedName)!.push(session)
    }

    // 4. Process agents and update their session status
    const resultAgents: Agent[] = []
    const newOrphanAgents: Agent[] = []
    const processedAgentNames = new Set<string>()

    for (const agent of agents) {
      // Use agent.id as last-resort fallback so agents without name/alias are never silently dropped
      const agentName = agent.name || agent.alias || agent.id
      if (!agentName) continue

      const normalizedAgentName = agentName.toLowerCase()
      processedAgentNames.add(normalizedAgentName)

      const agentSessions = sessionsByAgentName.get(normalizedAgentName) || []

      // Build updated sessions array from discovered tmux sessions
      const updatedSessions: AgentSession[] = []
      for (const session of agentSessions) {
        const { index } = parseSessionName(session.name)
        updatedSessions.push({
          index,
          status: 'online',
          workingDirectory: session.workingDirectory,
          createdAt: session.createdAt,
          lastActive: session.lastActivity,
        })
      }

      // Add offline sessions from registry that weren't discovered
      const existingSessions = agent.sessions || []
      for (const existingSession of existingSessions) {
        const alreadyUpdated = updatedSessions.some(s => s.index === existingSession.index)
        if (!alreadyUpdated) {
          updatedSessions.push({
            ...existingSession,
            status: 'offline',
          })
        }
      }

      updatedSessions.sort((a, b) => a.index - b.index)

      const hasOnlineSession = updatedSessions.some(s => s.status === 'online')

      // Create session status for API response (backward compatibility)
      const onlineSession = updatedSessions.find(s => s.status === 'online')
      const primarySession = updatedSessions.find(s => s.index === 0) || updatedSessions[0]
      const onlineDiscoveredSession = onlineSession
        ? agentSessions.find(s => parseSessionName(s.name).index === onlineSession.index)
        : undefined

      const tmuxName = onlineDiscoveredSession?.name || computeSessionName(agentName, onlineSession?.index ?? 0)
      const paneInfo = onlineSession ? getPaneCommand(tmuxName) : { paneCommand: '', programRunning: false }

      const sessionStatus: AgentSessionStatus = onlineSession
        ? {
            status: 'online',
            tmuxSessionName: tmuxName,
            workingDirectory: onlineSession.workingDirectory,
            lastActivity: onlineSession.lastActive,
            windows: onlineDiscoveredSession?.windows,
            hostId,
            hostName,
            ...paneInfo,
          }
        : {
            status: 'offline',
            workingDirectory: agent.workingDirectory || primarySession?.workingDirectory,
            windows: undefined,
            hostId,
            hostName,
          }

      const updatedAgent: Agent = {
        ...agent,
        // Preserve the canonical name/alias fields; do not promote alias to name
        name: agent.name,
        alias: agent.alias,
        sessions: updatedSessions,
        status: hasOnlineSession ? 'active' : 'offline',
        // Use the actual lastActive from the online session rather than the current timestamp
        // so the field reflects true last activity, not the polling time
        lastActive: (onlineSession?.lastActive ?? agent.lastActive) || new Date().toISOString(),
      }

      resultAgents.push(mergeAgentWithSession(updatedAgent, sessionStatus, hostId, hostName, hostUrl, false))
    }

    // 5. Process orphan sessions (sessions without matching agents)
    for (const [agentName, sessions] of sessionsByAgentName.entries()) {
      if (!processedAgentNames.has(agentName)) {
        const primarySession = sessions.find(s => {
          const { index } = parseSessionName(s.name)
          return index === 0
        }) || sessions[0]

        const orphanAgent = createOrphanAgent(primarySession, hostId, hostName, hostUrl)

        orphanAgent.sessions = sessions.map(session => {
          const { index } = parseSessionName(session.name)
          return {
            index,
            status: 'online' as const,
            workingDirectory: session.workingDirectory,
            createdAt: session.createdAt,
            lastActive: session.lastActivity,
          }
        }).sort((a, b) => a.index - b.index)

        newOrphanAgents.push(orphanAgent)

        const orphanPaneInfo = getPaneCommand(primarySession.name)
        const sessionStatus: AgentSessionStatus = {
          status: 'online',
          tmuxSessionName: primarySession.name,
          workingDirectory: primarySession.workingDirectory,
          lastActivity: primarySession.lastActivity,
          windows: primarySession.windows,
          hostId,
          hostName,
          ...orphanPaneInfo,
        }

        resultAgents.push({
          ...orphanAgent,
          session: sessionStatus,
          isOrphan: true
        })
      }
    }

    // 6. Save registry updates (orphan agents)
    if (newOrphanAgents.length > 0) {
      const updatedAgents = [...agents, ...newOrphanAgents]
      saveAgents(updatedAgents)
      console.log(`[Agents] Auto-registered ${newOrphanAgents.length} orphan session(s) as agents`)
    }

    // 7. Sort: online agents first, then alphabetically by name
    resultAgents.sort((a, b) => {
      if (a.session?.status === 'online' && b.session?.status !== 'online') return -1
      if (a.session?.status !== 'online' && b.session?.status === 'online') return 1
      const nameA = a.name || a.alias || ''
      const nameB = b.name || b.alias || ''
      return nameA.toLowerCase().localeCompare(nameB.toLowerCase())
    })

    return {
      data: {
        agents: resultAgents,
        stats: {
          total: resultAgents.length,
          online: resultAgents.filter(a => a.session?.status === 'online').length,
          offline: resultAgents.filter(a => a.session?.status === 'offline').length,
          orphans: resultAgents.filter(a => a.isOrphan).length,
          newlyRegistered: newOrphanAgents.length,
        },
        hostInfo: {
          id: hostId,
          name: hostName,
          url: hostUrl,
          isSelf: true,
        },
      },
      status: 200,
    }
  } catch (error) {
    console.error('[Agents] Failed to fetch agents:', error)
    return { error: 'Failed to fetch agents', status: 500 }
  }
}

// ---------------------------------------------------------------------------
// GET /api/agents?q=... -- search agents
// ---------------------------------------------------------------------------

export function searchAgentsByQuery(query: string): ServiceResult<{ agents: Agent[] }> {
  const agents = searchAgents(query)
  return { data: { agents }, status: 200 }
}

// ---------------------------------------------------------------------------
// POST /api/agents -- create new agent
// ---------------------------------------------------------------------------

export async function createNewAgent(body: CreateAgentRequest, requestingAgentId?: string | null): Promise<ServiceResult<{ agent: Agent }>> {
  // Layer 5: When a requesting agent is identified, enforce governance roles.
  // SF-058 (P5): This enforcement is opt-in -- when no X-Agent-Id / Authorization header
  // is provided, requestingAgentId is null and governance checks are skipped (Phase 1 behavior).
  if (requestingAgentId) {
    const isReqManager = isManager(requestingAgentId)
    const isReqCOS = isChiefOfStaffAnywhere(requestingAgentId)
    if (!isReqManager && !isReqCOS) {
      return { error: 'Only MANAGER or Chief-of-Staff can create agents', status: 403 }
    }
  }

  try {
    const agent = await createAgent(body)

    // Auto-install ai-maestro skills for non-Claude clients (Codex, Gemini, Cursor).
    // Non-fatal: agent creation succeeds even if skill installation fails.
    const { detectClientType } = await import('@/lib/client-capabilities')
    const clientType = detectClientType(agent.program || 'claude')
    if (clientType !== 'claude' && clientType !== 'aider' && clientType !== 'unknown') {
      const workDir = agent.workingDirectory || agent.sessions?.[0]?.workingDirectory
      if (workDir) {
        try {
          const { installSkillsForClient } = await import('@/services/cross-client-skill-service')
          const result = await installSkillsForClient(clientType, workDir)
          console.log(`[agents] Installed ${result.installed.length} skills for ${clientType} agent "${agent.name}"`)
        } catch (err) {
          console.warn(`[agents] Failed to install skills for ${clientType}:`, err instanceof Error ? err.message : err)
        }
      }
    }

    return { data: { agent }, status: 201 }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create agent'
    console.error('Failed to create agent:', error)
    return { error: message, status: 400 }
  }
}

// ---------------------------------------------------------------------------
// GET /api/agents/[id] -- get agent by ID
// ---------------------------------------------------------------------------

export function getAgentById(id: string): ServiceResult<{ agent: Agent }> {
  try {
    const agent = getAgent(id)
    if (!agent) {
      return { error: 'Agent not found', status: 404 }
    }
    return { data: { agent }, status: 200 }
  } catch (error) {
    console.error('Failed to get agent:', error)
    return { error: 'Failed to get agent', status: 500 }
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/agents/[id] -- update agent
// ---------------------------------------------------------------------------

export async function updateAgentById(id: string, body: UpdateAgentRequest, requestingAgentId?: string | null): Promise<ServiceResult<{ agent: Agent }>> {
  try {
    // Check if agent exists and is not soft-deleted
    const existing = getAgent(id, true) // include deleted to distinguish 404 vs 410
    if (!existing) {
      return { error: 'Agent not found', status: 404 }
    }
    if (existing.deletedAt) {
      return { error: 'Cannot update a deleted agent', status: 410 }
    }

    // Layer 5: When a requesting agent is identified, enforce governance roles
    if (requestingAgentId) {
      const isReqManager = isManager(requestingAgentId)
      const isReqCOS = isChiefOfStaffAnywhere(requestingAgentId)
      const isSelf = requestingAgentId === id  // Agent updating itself

      if (!isReqManager && !isReqCOS && !isSelf) {
        // Check if requester is COS of a team the target agent belongs to
        const teams = loadTeams()
        const closedTeams = teams.filter(t => t.type === 'closed')
        const agentTeams = closedTeams.filter(t => t.agentIds.includes(id))
        const isOwningCOS = agentTeams.some(t => t.chiefOfStaffId === requestingAgentId)

        if (!isOwningCOS) {
          return { error: 'Only MANAGER, owning Chief-of-Staff, or the agent itself can update this agent', status: 403 }
        }
      }
    }

    const agent = await updateAgent(id, body)
    if (!agent) {
      return { error: 'Agent not found', status: 404 }
    }

    return { data: { agent }, status: 200 }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update agent'
    console.error('Failed to update agent:', error)
    return { error: message, status: 400 }
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/agents/[id] -- delete agent (soft or hard)
// ---------------------------------------------------------------------------

export async function deleteAgentById(id: string, hard: boolean, requestingAgentId?: string | null): Promise<ServiceResult<{ success: boolean; hard: boolean }>> {
  try {
    const agent = getAgent(id, true) // include deleted to distinguish 404 vs 410
    if (!agent) {
      return { error: 'Agent not found', status: 404 }
    }
    if (agent.deletedAt && !hard) {
      // Return 410 with extra context: already deleted
      return { error: 'Agent already deleted', status: 410 }
    }

    // Layer 5: When a requesting agent is identified, only MANAGER can delete
    if (requestingAgentId) {
      const isReqManager = isManager(requestingAgentId)
      if (!isReqManager) {
        return { error: 'Only MANAGER can delete agents', status: 403 }
      }
    }

    const success = await deleteAgent(id, hard)
    if (!success) {
      return { error: 'Agent not found', status: 404 }
    }

    // SF-006: Auto-reject ALL pending governance requests targeting the deleted agent (not just configure-agent)
    try {
      const { loadGovernanceRequests, rejectGovernanceRequest } = await import('@/lib/governance-request-registry')
      const file = loadGovernanceRequests()
      const pendingForAgent = file.requests.filter((r: { type: string; status: string; payload: { agentId: string } }) =>
        r.status === 'pending' && r.payload.agentId === id
      )
      for (const req of pendingForAgent) {
        await rejectGovernanceRequest(req.id, requestingAgentId || 'system', 'Target agent deleted')
      }
      if (pendingForAgent.length > 0) {
        console.log(`[agents] Auto-rejected ${pendingForAgent.length} pending request(s) of any type for deleted agent ${id}`)
      }
    } catch (err) {
      console.warn('[agents] Failed to auto-reject pending config requests:', err instanceof Error ? err.message : err)
    }

    return { data: { success: true, hard }, status: 200 }
  } catch (error) {
    console.error('Failed to delete agent:', error)
    return { error: 'Failed to delete agent', status: 500 }
  }
}

// ---------------------------------------------------------------------------
// POST /api/agents/register -- register agent from session or cloud
// ---------------------------------------------------------------------------

export async function registerAgent(body: RegisterAgentParams): Promise<ServiceResult<{
  success: boolean
  message: string
  agentId: string
  agent: any
  registryAgent: { id: string; name: string } | null
}>> {
  try {
    let agentId: string
    let agentConfig: any
    let registryAgent: Agent | null = null

    if (body.sessionName && !body.id) {
      // WorkTree format - create agent from session name
      const { sessionName, workingDirectory } = body

      if (!sessionName) {
        return { error: 'Missing required field: sessionName', status: 400 }
      }

      // Check if agent already exists in registry by session name
      const existingAgent = getAgentBySession(sessionName)
      if (existingAgent) {
        await linkSession(existingAgent.id, sessionName, workingDirectory || process.cwd())
        registryAgent = existingAgent
        // Use the existing registry agent's UUID as the canonical ID
        agentId = existingAgent.id
      } else {
        const parts = sessionName.split('-')
        const shortName = parts[parts.length - 1] || sessionName
        const tags = parts.slice(0, -1).map((t: string) => t.toLowerCase())

        try {
          registryAgent = await createAgent({
            name: sessionName,
            label: shortName !== sessionName ? shortName : undefined,
            program: 'claude-code',
            model: 'sonnet',
            taskDescription: `Agent for ${sessionName}`,
            tags,
            owner: os.userInfo().username,
            createSession: true,
            workingDirectory: workingDirectory || process.cwd()
          })
          // createAgent always generates a UUID; use it as the canonical ID
          agentId = registryAgent.id
        } catch (createError) {
          console.warn(`[Register] Could not create registry entry for ${sessionName}:`, createError)
          // Fall back to a fresh UUID so agentConfig.id is always a valid UUID
          agentId = uuidv4()
        }
      }

      agentConfig = {
        id: agentId,
        sessionName,
        workingDirectory: workingDirectory || process.cwd(),
        createdAt: Date.now(),
      }
    } else {
      // Full agent config format (cloud agents)
      if (!body.id || !body.deployment?.cloud?.websocketUrl) {
        return { error: 'Missing required fields: id and websocketUrl', status: 400 }
      }

      agentId = body.id
      agentConfig = body
    }

    // MF-002 + SF-005: Validate agentId format — reject empty strings and non-UUID values
    if (body.id !== undefined && (!body.id || !isValidUuid(agentId))) {
      return { error: 'Invalid agent ID format', status: 400 }
    }

    // Ensure agents directory exists
    const agentsDir = path.join(os.homedir(), '.aimaestro', 'agents')
    if (!fs.existsSync(agentsDir)) {
      fs.mkdirSync(agentsDir, { recursive: true })
    }

    // MF-002: Use path.basename to prevent directory traversal in file path construction
    const agentFilePath = path.join(agentsDir, `${path.basename(agentId)}.json`)
    fs.writeFileSync(agentFilePath, JSON.stringify(agentConfig, null, 2), 'utf8')

    return {
      data: {
        success: true,
        message: `Agent ${agentId} registered successfully`,
        agentId,
        agent: agentConfig,
        registryAgent: registryAgent ? { id: registryAgent.id, name: registryAgent.name || registryAgent.alias || '' } : null,
      },
      status: 200,
    }
  } catch (error) {
    console.error('Failed to register agent:', error)
    return {
      error: `Failed to register agent: ${error instanceof Error ? error.message : 'Unknown error'}`,
      status: 500,
    }
  }
}

// ---------------------------------------------------------------------------
// GET /api/agents/by-name/[name] -- agent lookup by name (rich resolution)
// ---------------------------------------------------------------------------

export function lookupAgentByName(name: string): ServiceResult<{
  exists: boolean
  agent?: {
    id: string
    name: string
    hostId: string
    ampRegistered?: boolean
  }
}> {
  try {
    const decodedName = decodeURIComponent(name)
    const selfHostId = getSelfHostId()

    const resolved = resolveAgentIdentifier(decodedName)

    if (!resolved?.agentId) {
      return { data: { exists: false }, status: 200 }
    }

    const agent = getAgent(resolved.agentId)
    if (!agent) {
      return { data: { exists: false }, status: 200 }
    }

    return {
      data: {
        exists: true,
        agent: {
          id: agent.id,
          name: agent.name || agent.alias || '',
          hostId: agent.hostId || selfHostId,
          ampRegistered: agent.ampRegistered,
        },
      },
      status: 200,
    }
  } catch (error) {
    console.error('[Agent Lookup] Error:', error)
    return { data: { exists: false }, status: 500 }
  }
}

// ---------------------------------------------------------------------------
// GET /api/agents/unified -- unified agents across all hosts
// ---------------------------------------------------------------------------

export async function getUnifiedAgents(params: UnifiedAgentsParams): Promise<ServiceResult<{
  agents: UnifiedAgentResult[]
  stats: AgentStats
  hosts: Array<{
    host: { id: string; name: string; url: string; isSelf: boolean }
    success: boolean
    agentCount: number
    error?: string
  }>
  selfHost: { id: string; name: string; url: string }
  totalHosts: number
  successfulHosts: number
}>> {
  const { query, includeOffline = true, timeout = 3000 } = params
  const hosts = getHosts()
  const selfHost = getSelfHost()

  // Fetch agents from all hosts in parallel
  const fetchPromises: Promise<HostFetchResult>[] = hosts.map(async (host) => {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeout)

      let url = `${host.url}/api/agents`
      if (query) {
        url += `?q=${encodeURIComponent(query)}`
      }

      const response = await fetch(url, {
        signal: controller.signal,
        headers: { 'Accept': 'application/json' },
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        return {
          host,
          success: false,
          agents: [],
          stats: null,
          error: `HTTP ${response.status}: ${response.statusText}`,
        }
      }

      const data: HostAgentResponse = await response.json()
      return {
        host,
        success: true,
        agents: data.agents || [],
        stats: data.stats || null,
      }
    } catch (error) {
      const errorMessage = error instanceof Error
        ? error.name === 'AbortError' ? 'Request timeout' : error.message
        : 'Unknown error'
      return {
        host,
        success: false,
        agents: [],
        stats: null,
        error: errorMessage,
      }
    }
  })

  const results = await Promise.all(fetchPromises)

  // Aggregate agents with host context
  const unifiedAgents: UnifiedAgentResult[] = []
  const aggregatedStats: AgentStats = {
    total: 0,
    online: 0,
    offline: 0,
    orphans: 0,
    newlyRegistered: 0,
  }

  const hostResults: Array<{
    host: { id: string; name: string; url: string; isSelf: boolean }
    success: boolean
    agentCount: number
    error?: string
  }> = []

  for (const result of results) {
    hostResults.push({
      host: {
        id: result.host.id,
        name: result.host.name || result.host.id,
        url: result.host.url,
        isSelf: isSelf(result.host.id),
      },
      success: result.success,
      agentCount: result.agents.length,
      error: result.error,
    })

    if (!result.success && !includeOffline) {
      continue
    }

    for (const agent of result.agents) {
      const agentName = agent.name || agent.alias || agent.id
      const qualifiedName = `${agentName}@${result.host.id}`

      unifiedAgents.push({
        agent: {
          ...agent,
          hostId: result.host.id,
          hostName: result.host.name || result.host.id,
          hostUrl: result.host.url,
        },
        sourceHost: {
          id: result.host.id,
          name: result.host.name || result.host.id,
          url: result.host.url,
        },
        qualifiedName,
      })
    }

    if (result.stats) {
      aggregatedStats.total += result.stats.total
      aggregatedStats.online += result.stats.online
      aggregatedStats.offline += result.stats.offline
      aggregatedStats.orphans += result.stats.orphans
      aggregatedStats.newlyRegistered += result.stats.newlyRegistered
    }
  }

  // Sort agents: online first, then by name
  unifiedAgents.sort((a, b) => {
    const aOnline = a.agent.status === 'active' ? 1 : 0
    const bOnline = b.agent.status === 'active' ? 1 : 0
    if (aOnline !== bOnline) return bOnline - aOnline
    return a.qualifiedName.localeCompare(b.qualifiedName)
  })

  return {
    data: {
      agents: unifiedAgents,
      stats: aggregatedStats,
      hosts: hostResults,
      selfHost: {
        // selfHost can be null; fall back to hostname-derived values (same pattern as listAgents)
        id: selfHost?.id || os.hostname(),
        name: selfHost?.name || os.hostname(),
        url: selfHost?.url || `http://${os.hostname().toLowerCase()}:23000`,
      },
      totalHosts: hosts.length,
      successfulHosts: results.filter(r => r.success).length,
    },
    status: 200,
  }
}

// ---------------------------------------------------------------------------
// GET /api/agents/[id]/session -- get session status
// ---------------------------------------------------------------------------

export async function getAgentSessionStatus(agentId: string): Promise<ServiceResult<{
  success: boolean
  agentId: string
  sessionName?: string
  hasSession: boolean
  exists: boolean
  idle: boolean
  lastActivity?: number | null
  timeSinceActivity?: number | null
  idleThreshold: number
}>> {
  try {
    const agent = getAgent(agentId)
    if (!agent) {
      return { error: 'Agent not found', status: 404 }
    }

    const agentNameForSession = agent.name || agent.alias
    if (!agentNameForSession) {
      return {
        data: {
          success: true,
          agentId,
          hasSession: false,
          exists: false,
          idle: false,
          idleThreshold: IDLE_THRESHOLD_MS,
        },
        status: 200,
      }
    }

    // Use the primary session (index 0) if it exists; derive the real tmux session name
    // via computeSessionName so it matches the name actually created by wakeAgent/createAgent
    const primarySession = agent.sessions?.find(s => s.index === 0)
    const sessionName = primarySession
      ? computeSessionName(agentNameForSession, primarySession.index)
      : computeSessionName(agentNameForSession, 0)

    const runtime = getRuntime()
    const exists = await runtime.sessionExists(sessionName)
    const lastActivity = sessionActivity.get(sessionName) || null
    const timeSinceActivity = lastActivity ? Date.now() - lastActivity : null
    const idle = isSessionIdle(sessionName)

    return {
      data: {
        success: true,
        agentId,
        sessionName,
        hasSession: true,
        exists,
        idle,
        lastActivity,
        timeSinceActivity,
        idleThreshold: IDLE_THRESHOLD_MS,
      },
      status: 200,
    }
  } catch (error) {
    console.error('[Agent Session] Error:', error)
    return {
      error: error instanceof Error ? error.message : 'Unknown error',
      status: 500,
    }
  }
}

// ---------------------------------------------------------------------------
// POST /api/agents/[id]/session -- link session to agent
// ---------------------------------------------------------------------------

export async function linkAgentSession(agentId: string, params: LinkSessionParams): Promise<ServiceResult<{ success: boolean }>> {
  try {
    const { sessionName, workingDirectory } = params

    if (!sessionName) {
      return { error: 'sessionName is required', status: 400 }
    }

    const success = await linkSession(agentId, sessionName, workingDirectory || process.cwd())
    if (!success) {
      return { error: 'Agent not found', status: 404 }
    }

    // Record initial activity timestamp so idle/status checks are accurate immediately after linking
    sessionActivity.set(sessionName, Date.now())

    return { data: { success: true }, status: 200 }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to link session'
    console.error('Failed to link session:', error)
    return { error: message, status: 400 }
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/agents/[id]/session -- send command to agent's session
// ---------------------------------------------------------------------------

export async function sendAgentSessionCommand(
  agentId: string,
  params: AgentSessionCommandParams
): Promise<ServiceResult<{
  success: boolean
  agentId?: string
  sessionName?: string
  commandSent?: string
  method?: string
  wasIdle?: boolean
  idle?: boolean
  timeSinceActivity?: number
  idleThreshold?: number
}>> {
  try {
    const { command, requireIdle = true, addNewline = true } = params

    if (!command || typeof command !== 'string') {
      return { error: 'Command is required', status: 400 }
    }

    const agent = getAgent(agentId)
    if (!agent) {
      return { error: 'Agent not found', status: 404 }
    }

    const agentNameForSession = agent.name || agent.alias
    if (!agentNameForSession) {
      return { error: 'Agent has no name configured', status: 400 }
    }

    // Use the primary session (index 0); derive the real tmux session name via
    // computeSessionName so it matches the name used by wakeAgent/createAgent
    const primarySession = agent.sessions?.find(s => s.index === 0)
    const sessionName = primarySession
      ? computeSessionName(agentNameForSession, primarySession.index)
      : computeSessionName(agentNameForSession, 0)

    const runtime = getRuntime()
    const exists = await runtime.sessionExists(sessionName)
    if (!exists) {
      return { error: 'Tmux session not found', status: 404 }
    }

    if (requireIdle && !isSessionIdle(sessionName)) {
      // MF-001: Return ONLY error without data field to avoid ambiguous response
      return {
        error: 'Session is not idle',
        status: 409,
      }
    }

    await runtime.cancelCopyMode(sessionName)
    await runtime.sendKeys(sessionName, command, { literal: true, enter: addNewline })

    // Update activity timestamp
    sessionActivity.set(sessionName, Date.now())

    return {
      data: {
        success: true,
        agentId,
        sessionName,
        commandSent: command,
        method: 'tmux-send-keys',
        wasIdle: true,
      },
      status: 200,
    }
  } catch (error) {
    console.error('[Agent Session Command] Error:', error)
    return {
      error: error instanceof Error ? error.message : 'Unknown error',
      status: 500,
    }
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/agents/[id]/session -- unlink or delete agent session
// ---------------------------------------------------------------------------

export async function unlinkOrDeleteAgentSession(
  agentId: string,
  params: UnlinkSessionParams
): Promise<ServiceResult<{
  success: boolean
  agentId: string
  deleted?: boolean
  sessionUnlinked?: boolean
  sessionKilled?: boolean
}>> {
  try {
    const { kill: killSession = false, deleteAgent: shouldDeleteAgent = false, sessionIndex = 0 } = params

    const agent = getAgent(agentId)
    if (!agent) {
      return { error: 'Agent not found', status: 404 }
    }

    const agentName = agent.name || agent.alias
    if (!agentName) {
      return { error: 'Agent has no name configured', status: 400 }
    }

    const runtime = getRuntime()
    // Use computeSessionName to derive the correct tmux session name (same as wakeAgent/hibernateAgent)
    const sessionName = computeSessionName(agentName, sessionIndex)

    if (shouldDeleteAgent) {
      // Kill tmux session if requested and exists
      if (killSession) {
        const exists = await runtime.sessionExists(sessionName)
        if (exists) {
          await runtime.killSession(sessionName)
          unpersistSession(sessionName)
        }
      }

      // Hard delete with backup
      const success = await deleteAgent(agentId, true)
      if (!success) {
        return { error: 'Failed to delete agent', status: 500 }
      }

      return {
        data: {
          success: true,
          agentId,
          deleted: true,
          sessionKilled: killSession && !!sessionName,
        },
        status: 200,
      }
    }

    // Just unlink the session
    if (killSession) {
      const exists = await runtime.sessionExists(sessionName)
      if (exists) {
        await runtime.killSession(sessionName)
        unpersistSession(sessionName)
      }
    }

    const success = await unlinkSession(agentId)
    if (!success) {
      return { error: 'Agent not found', status: 404 }
    }

    return {
      data: {
        success: true,
        agentId,
        sessionUnlinked: true,
        sessionKilled: killSession && !!sessionName,
      },
      status: 200,
    }
  } catch (error) {
    console.error('Failed to unlink/delete session:', error)
    return { error: 'Failed to unlink session', status: 500 }
  }
}

// ---------------------------------------------------------------------------
// POST /api/agents/[id]/wake -- wake a hibernated agent
// ---------------------------------------------------------------------------

export async function wakeAgent(agentId: string, params: WakeAgentParams): Promise<ServiceResult<{
  success: boolean
  agentId: string
  name: string
  sessionName: string
  sessionIndex: number
  workingDirectory?: string
  woken: boolean
  alreadyRunning?: boolean
  programStarted?: boolean
  message: string
}>> {
  try {
    const { startProgram = true, sessionIndex = 0, program: programOverride } = params

    const agent = getAgent(agentId)
    if (!agent) {
      return { error: 'Agent not found', status: 404 }
    }

    const agentName = agent.name || agent.alias
    if (!agentName) {
      return { error: 'Agent has no name configured', status: 400 }
    }

    const workingDirectory = agent.workingDirectory ||
                            agent.preferences?.defaultWorkingDirectory ||
                            process.cwd()

    const runtime = getRuntime()
    const sessionName = computeSessionName(agentName, sessionIndex)

    // Check if session already exists
    const exists = await runtime.sessionExists(sessionName)
    if (exists) {
      updateAgentSessionInRegistry(agentId, sessionIndex, 'online', workingDirectory)
      return {
        data: {
          success: true,
          agentId,
          name: agentName,
          sessionName,
          sessionIndex,
          woken: true,
          alreadyRunning: true,
          message: `Agent "${agentName}" session ${sessionIndex} was already running`,
        },
        status: 200,
      }
    }

    // Create new tmux session
    try {
      await runtime.createSession(sessionName, workingDirectory)
    } catch (error) {
      console.error(`[Wake] Failed to create tmux session:`, error)
      return { error: 'Failed to create tmux session', status: 500 }
    }

    // Persist session metadata
    persistSession({
      id: sessionName,
      name: sessionName,
      workingDirectory,
      createdAt: new Date().toISOString(),
      agentId,
    })

    // Set up AMP
    const ampDir = await setupAMPForSession(sessionName, agentName, agentId)

    // Start the AI program if requested
    if (startProgram) {
      const program = (programOverride || agent.program || 'claude code').toLowerCase()
      console.log(`[Wake] Final program selection: "${program}" (override: ${programOverride}, agent.program: ${agent.program})`)

      if (program === 'none' || program === 'terminal') {
        // Export env vars for terminal-only mode
        // CC-P1-514: Escape single quotes in values to prevent shell injection
        const safeAmpDir = ampDir?.replace(/'/g, "'\\''") || ''
        const safeAgentName = agentName.replace(/'/g, "'\\''")
        const safeAgentId = agentId.replace(/'/g, "'\\''")
        try {
          await runtime.sendKeys(sessionName, `export AMP_DIR='${safeAmpDir}' AIM_AGENT_NAME='${safeAgentName}' AIM_AGENT_ID='${safeAgentId}'; unset CLAUDECODE`, { enter: true })
        } catch { /* non-fatal */ }
        console.log(`[Wake] Terminal only mode - no AI program started`)
      } else {
        let startCommand = resolveStartCommand(program)

        // Build full command with programArgs
        let fullCommand = startCommand
        if (agent.programArgs) {
          const args = sanitizeArgs(agent.programArgs)
          if (args) {
            fullCommand = `${startCommand} ${args}`
          }
        }

        // Small delay to let the session initialize
        await new Promise(resolve => setTimeout(resolve, 300))

        // Single send-keys: export env vars, unset CLAUDECODE, then launch program
        // CC-P1-514: Escape single quotes in values to prevent shell injection
        try {
          const safeAmpDir2 = ampDir?.replace(/'/g, "'\\''") || ''
          const safeAgentName2 = agentName.replace(/'/g, "'\\''")
          const safeAgentId2 = agentId.replace(/'/g, "'\\''")
          const envExport = ampDir
            ? `export AMP_DIR='${safeAmpDir2}' AIM_AGENT_NAME='${safeAgentName2}' AIM_AGENT_ID='${safeAgentId2}'; `
            : ''
          await runtime.sendKeys(sessionName, `${envExport}unset CLAUDECODE; ${fullCommand}`, { enter: true })
        } catch (error) {
          console.error(`[Wake] Failed to start program:`, error)
        }
      }
    }

    // Update agent status in registry
    updateAgentSessionInRegistry(agentId, sessionIndex, 'online', workingDirectory, true)

    console.log(`[Wake] Agent ${agentName} (${agentId}) session ${sessionIndex} woken up successfully`)

    return {
      data: {
        success: true,
        agentId,
        name: agentName,
        sessionName,
        sessionIndex,
        workingDirectory,
        woken: true,
        programStarted: startProgram,
        message: `Agent "${agentName}" session ${sessionIndex} has been woken up and is ready to use.`,
      },
      status: 200,
    }
  } catch (error) {
    console.error('[Wake] Error:', error)
    return {
      error: error instanceof Error ? error.message : 'Failed to wake agent',
      status: 500,
    }
  }
}

// ---------------------------------------------------------------------------
// POST /api/agents/[id]/hibernate -- hibernate an agent
// ---------------------------------------------------------------------------

export async function hibernateAgent(agentId: string, params: HibernateAgentParams): Promise<ServiceResult<{
  success: boolean
  agentId: string
  name?: string
  sessionName: string
  sessionIndex: number
  hibernated: boolean
  message: string
}>> {
  try {
    const { sessionIndex = 0 } = params

    const agent = getAgent(agentId)
    if (!agent) {
      return { error: 'Agent not found', status: 404 }
    }

    const agentName = agent.name || agent.alias
    if (!agentName) {
      return { error: 'Agent has no name configured', status: 400 }
    }

    const runtime = getRuntime()
    const sessionName = computeSessionName(agentName, sessionIndex)

    // Check if session exists
    const exists = await runtime.sessionExists(sessionName)
    if (!exists) {
      // Session doesn't exist, just update the status and clean up any stale activity entry
      updateAgentSessionInRegistry(agentId, sessionIndex, 'offline')
      // Clear stale activity so that if this session name is reused, idle-checks start fresh
      sessionActivity.delete(sessionName)

      return {
        data: {
          success: true,
          agentId,
          sessionName,
          sessionIndex,
          hibernated: true,
          message: 'Session was already terminated, agent status updated',
        },
        status: 200,
      }
    }

    // Try to gracefully stop Claude Code first
    try {
      await runtime.sendKeys(sessionName, 'C-c')
      await new Promise(resolve => setTimeout(resolve, 500))
      await runtime.sendKeys(sessionName, '"exit"', { enter: true })
      await new Promise(resolve => setTimeout(resolve, 1000))
    } catch (e) {
      console.log(`[Hibernate] Graceful shutdown attempt failed for ${sessionName}, will force kill`)
    }

    // Kill the tmux session
    try {
      await runtime.killSession(sessionName)
    } catch (e) {
      console.log(`[Hibernate] Session ${sessionName} may have already closed`)
    }

    // Remove from session persistence
    unpersistSession(sessionName)
    // Clear activity entry so that if the session name is reused later, idle-checks start fresh
    sessionActivity.delete(sessionName)

    // Update agent status in registry
    updateAgentSessionInRegistry(agentId, sessionIndex, 'offline')

    console.log(`[Hibernate] Agent ${agentName} (${agentId}) session ${sessionIndex} hibernated successfully`)

    return {
      data: {
        success: true,
        agentId,
        name: agentName,
        sessionName,
        sessionIndex,
        hibernated: true,
        message: `Agent "${agentName}" session ${sessionIndex} has been hibernated. Use wake to restart.`,
      },
      status: 200,
    }
  } catch (error) {
    console.error('[Hibernate] Error:', error)
    return {
      error: error instanceof Error ? error.message : 'Failed to hibernate agent',
      status: 500,
    }
  }
}

// ---------------------------------------------------------------------------
// POST /api/agents/startup -- initialize all agents
// ---------------------------------------------------------------------------

export async function initializeStartup(): Promise<ServiceResult<{
  success: boolean
  message: string
  initialized: string[]
  failed: Array<{ agentId: string; error: string }>
}>> {
  try {
    console.log('[Startup] Initializing all agents...')
    const result = await initializeAllAgents()
    console.log(`[Startup] Complete: ${result.initialized.length} agents initialized`)

    return {
      data: {
        success: true,
        message: `Initialized ${result.initialized.length} agent(s)`,
        initialized: result.initialized,
        failed: result.failed,
      },
      status: 200,
    }
  } catch (error) {
    console.error('[Startup] Error:', error)
    return {
      error: error instanceof Error ? error.message : 'Unknown error',
      status: 500,
    }
  }
}

// ---------------------------------------------------------------------------
// GET /api/agents/startup -- get startup status
// ---------------------------------------------------------------------------

/** NT-004: Typed return for getStartupInfo */
interface StartupInfo {
  success: boolean
  discoveredAgents: number
  activeAgents: number
  agents: Array<{ agentId: string; initialized: boolean; subconscious: boolean }>
}

export function getStartupInfo(): ServiceResult<StartupInfo> {
  try {
    const status = getStartupStatus()
    return { data: { success: true, ...status }, status: 200 }
  } catch (error) {
    console.error('[Startup] Error:', error)
    return {
      error: error instanceof Error ? error.message : 'Unknown error',
      status: 500,
    }
  }
}

// ---------------------------------------------------------------------------
// POST /api/agents/health -- proxy health check
// ---------------------------------------------------------------------------

/** NT-005: Typed return for proxyHealthCheck -- JSON shape comes from the remote agent */
interface HealthCheckResult {
  [key: string]: unknown
}

export async function proxyHealthCheck(url: string): Promise<ServiceResult<HealthCheckResult>> {
  try {
    if (!url || typeof url !== 'string') {
      return { error: 'URL is required', status: 400 }
    }

    // CC-P1-601: Validate URL scheme — only allow http/https to prevent file://, gopher://, etc.
    let parsedUrl: URL
    try {
      parsedUrl = new URL(url)
    } catch {
      return { error: 'Invalid URL format', status: 400 }
    }

    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      return { error: 'Only http and https URLs are allowed', status: 400 }
    }

    // CC-P1-601: Reject private/internal IP ranges (RFC 1918, loopback, link-local, metadata)
    const hostname = parsedUrl.hostname
    const privatePatterns = [
      /^127\./, /^10\./, /^172\.(1[6-9]|2\d|3[01])\./, /^192\.168\./,
      /^169\.254\./, /^0\./, /^::1$/, /^fc00:/i, /^fe80:/i, /^fd/i,
      /^localhost$/i,
    ]
    const isPrivateIP = privatePatterns.some(pattern => pattern.test(hostname))

    // CC-P1-601: Only allow requests to known peer hosts from hosts.json
    // SF-010 accepted risk: hosts.json is writable via /api/hosts, so a compromised host entry
    // could be used as SSRF proxy. In Phase 2 with remote access, add private IP blocking
    // regardless of hosts.json.
    const knownHosts = getHosts()
    const isKnownHost = knownHosts.some(host => {
      try {
        const hostUrl = new URL(host.url)
        if (hostUrl.hostname === hostname) return true
      } catch { /* skip malformed host URLs */ }
      // Also check aliases for IP/hostname matches
      return host.aliases?.some(alias => {
        // Alias could be an IP, hostname, or full URL
        if (alias === hostname) return true
        try {
          const aliasUrl = new URL(alias)
          return aliasUrl.hostname === hostname
        } catch {
          return alias === hostname
        }
      })
    })

    if (isPrivateIP && !isKnownHost) {
      return { error: 'URL target is not a known peer host', status: 403 }
    }

    if (!isKnownHost) {
      return { error: 'URL target is not a known peer host — only hosts from hosts.json are allowed', status: 403 }
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000)

    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' },
    })
    clearTimeout(timeoutId)

    if (!response.ok) {
      return { error: `Agent returned HTTP ${response.status}`, status: response.status }
    }

    const data = await response.json()
    return { data, status: 200 }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return { error: 'Timeout connecting to agent', status: 504 }
    }
    return {
      error: `Failed to connect to agent: ${error instanceof Error ? error.message : 'Unknown error'}`,
      status: 500,
    }
  }
}
