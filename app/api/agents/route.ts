import { NextResponse } from 'next/server'
import { exec } from 'child_process'
import { promisify } from 'util'
import os from 'os'
import { v4 as uuidv4 } from 'uuid'
import type { Agent, AgentSession, AgentSessionStatus, CreateAgentRequest } from '@/types/agent'
import { parseSessionName, parseNameForDisplay, computeSessionName } from '@/types/agent'
import { loadAgents, saveAgents, createAgent, searchAgents, getAgentByName } from '@/lib/agent-registry'
import { getSelfHost } from '@/lib/hosts-config'

const execAsync = promisify(exec)

// Force this route to be dynamic (not statically generated at build time)
export const dynamic = 'force-dynamic'

interface DiscoveredSession {
  name: string
  workingDirectory: string
  status: 'active' | 'idle' | 'disconnected'
  createdAt: string
  lastActivity: string
  windows: number
}

/**
 * Discover all tmux sessions on this host
 */
async function discoverLocalSessions(): Promise<DiscoveredSession[]> {
  try {
    const { stdout } = await execAsync('tmux list-sessions 2>/dev/null || echo ""')

    if (!stdout.trim()) {
      return []
    }

    const sessionPromises = stdout
      .trim()
      .split('\n')
      .map(async (line) => {
        const match = line.match(/^([^:]+):\s+(\d+)\s+windows?\s+\(created\s+(.+?)\)/)
        if (!match) return null

        const [, name, windows, createdStr] = match
        const normalizedDate = createdStr.trim().replace(/\s+/g, ' ')

        let createdAt: string
        try {
          const parsedDate = new Date(normalizedDate)
          createdAt = isNaN(parsedDate.getTime())
            ? new Date().toISOString()
            : parsedDate.toISOString()
        } catch {
          createdAt = new Date().toISOString()
        }

        // Get last activity from global sessionActivity Map
        let lastActivity: string
        let status: 'active' | 'idle' | 'disconnected'

        const activityTimestamp = (global as any).sessionActivity?.get(name)

        if (activityTimestamp) {
          lastActivity = new Date(activityTimestamp).toISOString()
          const secondsSinceActivity = (Date.now() - activityTimestamp) / 1000
          status = secondsSinceActivity > 3 ? 'idle' : 'active'
        } else {
          lastActivity = createdAt
          status = 'disconnected'
        }

        // Get working directory from tmux
        let workingDirectory = ''
        try {
          const { stdout: cwdOutput } = await execAsync(
            `tmux display-message -t "${name}" -p "#{pane_current_path}" 2>/dev/null || echo ""`
          )
          workingDirectory = cwdOutput.trim()
        } catch {
          workingDirectory = ''
        }

        return {
          name,
          workingDirectory,
          status,
          createdAt,
          lastActivity,
          windows: parseInt(windows, 10),
        }
      })

    const sessions = (await Promise.all(sessionPromises))
      .filter((s): s is DiscoveredSession => s !== null)

    return sessions
  } catch (error) {
    console.error('[Agents] Error discovering local sessions:', error)
    return []
  }
}

/**
 * Auto-create an agent for an orphan session
 * Uses parseSessionName to extract agent name from tmux session name
 */
function createOrphanAgent(session: DiscoveredSession, hostId: string, hostName: string, hostUrl: string): Agent {
  // Parse session name to get agent name and index
  const { agentName, index } = parseSessionName(session.name)
  // Parse agent name to get display hierarchy
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
    label: undefined, // No label for auto-registered agents
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
 * GET /api/agents
 * Returns all agents registered on THIS host with their live session status.
 * Frontend is responsible for aggregating across multiple hosts.
 *
 * AGENT-FIRST ARCHITECTURE:
 * - No pattern matching - agents own their name, sessions derive from it
 * - Session names follow pattern: {agent.name} or {agent.name}_{index}
 * - Orphan sessions are parsed to find agent name, then auto-registered
 *
 * Query params:
 *   - q: Search query (searches name, label, taskDescription, tags)
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const query = searchParams.get('q')

    // If search query provided, return simple search results
    if (query) {
      const agents = searchAgents(query)
      return NextResponse.json({ agents })
    }

    // Get this host's info for response
    const selfHost = getSelfHost()
    const hostName = selfHost?.name || os.hostname()
    const hostId = selfHost?.id || hostName
    const hostUrl = selfHost?.url || `http://localhost:23000`

    // 1. Load all registered agents from this host's registry
    let agents = loadAgents()

    // 2. Discover local tmux sessions
    const discoveredSessions = await discoverLocalSessions()

    console.log(`[Agents] Found ${discoveredSessions.length} local tmux session(s)`)

    // 3. Group discovered sessions by agent name
    const sessionsByAgentName = new Map<string, DiscoveredSession[]>()
    for (const session of discoveredSessions) {
      const { agentName } = parseSessionName(session.name)
      if (!sessionsByAgentName.has(agentName)) {
        sessionsByAgentName.set(agentName, [])
      }
      sessionsByAgentName.get(agentName)!.push(session)
    }

    // 4. Process agents and update their session status
    const resultAgents: Agent[] = []
    const newOrphanAgents: Agent[] = []
    const processedAgentNames = new Set<string>()

    for (const agent of agents) {
      // Get agent name (new field, fallback to deprecated alias)
      const agentName = agent.name || agent.alias
      if (!agentName) continue

      processedAgentNames.add(agentName)

      // Find all sessions for this agent
      const agentSessions = sessionsByAgentName.get(agentName) || []

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

      // Sort sessions by index
      updatedSessions.sort((a, b) => a.index - b.index)

      // Determine agent status based on sessions
      const hasOnlineSession = updatedSessions.some(s => s.status === 'online')

      // Create session status for API response (backward compatibility)
      const primarySession = updatedSessions.find(s => s.index === 0) || updatedSessions[0]
      const onlineSession = updatedSessions.find(s => s.status === 'online')
      const sessionStatus: AgentSessionStatus = onlineSession
        ? {
            status: 'online',
            tmuxSessionName: computeSessionName(agentName, onlineSession.index),
            workingDirectory: onlineSession.workingDirectory,
            lastActivity: onlineSession.lastActive,
            // GAP6 FIX: Include host context in session status
            hostId,
            hostName,
          }
        : {
            status: 'offline',
            workingDirectory: agent.workingDirectory || primarySession?.workingDirectory,
            // GAP6 FIX: Include host context in session status
            hostId,
            hostName,
          }

      // Update agent with new sessions
      const updatedAgent: Agent = {
        ...agent,
        name: agentName,
        sessions: updatedSessions,
        status: hasOnlineSession ? 'active' : 'offline',
        lastActive: hasOnlineSession ? new Date().toISOString() : agent.lastActive,
      }

      resultAgents.push(mergeAgentWithSession(updatedAgent, sessionStatus, hostId, hostName, hostUrl, false))
    }

    // 5. Process orphan sessions (sessions without matching agents)
    for (const [agentName, sessions] of sessionsByAgentName.entries()) {
      if (!processedAgentNames.has(agentName)) {
        // This is an orphan - auto-register it
        // Use the first session to create the agent
        const primarySession = sessions.find(s => {
          const { index } = parseSessionName(s.name)
          return index === 0
        }) || sessions[0]

        const orphanAgent = createOrphanAgent(primarySession, hostId, hostName, hostUrl)

        // Add all sessions for this agent
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

        const sessionStatus: AgentSessionStatus = {
          status: 'online',
          tmuxSessionName: primarySession.name,
          workingDirectory: primarySession.workingDirectory,
          lastActivity: primarySession.lastActivity,
          windows: primarySession.windows,
          // GAP6 FIX: Include host context in session status
          hostId,
          hostName,
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
      // Online first
      if (a.session?.status === 'online' && b.session?.status !== 'online') return -1
      if (a.session?.status !== 'online' && b.session?.status === 'online') return 1

      // Then alphabetically by name (case-insensitive)
      const nameA = a.name || a.alias || ''
      const nameB = b.name || b.alias || ''
      return nameA.toLowerCase().localeCompare(nameB.toLowerCase())
    })

    return NextResponse.json({
      agents: resultAgents,
      stats: {
        total: resultAgents.length,
        online: resultAgents.filter(a => a.session?.status === 'online').length,
        offline: resultAgents.filter(a => a.session?.status === 'offline').length,
        orphans: resultAgents.filter(a => a.isOrphan).length,
        newlyRegistered: newOrphanAgents.length
      },
      hostInfo: {
        id: hostId,
        name: hostName,
        url: hostUrl,
        isSelf: true,  // This host is serving the API
      }
    })
  } catch (error) {
    console.error('[Agents] Failed to fetch agents:', error)
    return NextResponse.json(
      { error: 'Failed to fetch agents', agents: [] },
      { status: 500 }
    )
  }
}

/**
 * POST /api/agents
 * Create a new agent
 */
export async function POST(request: Request) {
  try {
    const body: CreateAgentRequest = await request.json()

    const agent = createAgent(body)
    return NextResponse.json({ agent }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create agent'
    console.error('Failed to create agent:', error)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
