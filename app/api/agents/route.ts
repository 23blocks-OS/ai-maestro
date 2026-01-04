import { NextResponse } from 'next/server'
import { exec } from 'child_process'
import { promisify } from 'util'
import os from 'os'
import { v4 as uuidv4 } from 'uuid'
import type { Agent, UnifiedAgent, AgentSessionStatus, CreateAgentRequest } from '@/types/agent'
import { loadAgents, saveAgents, createAgent, searchAgents } from '@/lib/agent-registry'
import { getLocalHost } from '@/lib/hosts-config'

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
 * Match a session to an agent using various patterns
 * Returns the agent if found, null otherwise
 */
function matchSessionToAgent(sessionName: string, agents: Agent[]): Agent | null {
  // 1. Exact match on tmuxSessionName
  const exactMatch = agents.find(a => a.tools.session?.tmuxSessionName === sessionName)
  if (exactMatch) return exactMatch

  // 2. Match by alias (case-insensitive)
  const aliasMatch = agents.find(a =>
    a.alias.toLowerCase() === sessionName.toLowerCase()
  )
  if (aliasMatch) return aliasMatch

  // 3. Session name ends with agent alias (e.g., "23blocks-api-authentication" matches "authentication")
  const suffixMatch = agents.find(a => {
    const alias = a.alias.toLowerCase()
    const session = sessionName.toLowerCase()
    return session.endsWith(`-${alias}`) || session.endsWith(`_${alias}`)
  })
  if (suffixMatch) return suffixMatch

  // 4. Session name's LAST segment matches agent alias (e.g., "23blocks-apps-prompthub" matches "prompthub")
  // Note: Only match on last segment to avoid false positives (e.g., "23blocks-api-company" should NOT match "api")
  const segmentMatch = agents.find(a => {
    const alias = a.alias.toLowerCase()
    const session = sessionName.toLowerCase()
    const segments = session.split(/[-_]/)
    // Only match if the LAST segment equals the alias
    return segments.length > 0 && segments[segments.length - 1] === alias
  })
  if (segmentMatch) return segmentMatch

  return null
}

/**
 * Parse session name into tags
 * e.g., "23blocks-api-authentication" → tags: ['23blocks', 'api'], alias: 'authentication'
 */
function parseSessionNameToTags(sessionName: string): { tags: string[], alias: string } {
  const segments = sessionName.split(/[-_]/).filter(s => s.length > 0)

  if (segments.length === 1) {
    return { tags: [], alias: segments[0] }
  }

  // Last segment is the alias, rest are tags
  const alias = segments[segments.length - 1]
  const tags = segments.slice(0, -1)

  return { tags, alias }
}

/**
 * Auto-create an agent for an orphan session
 */
function createOrphanAgent(session: DiscoveredSession, hostId: string, hostName: string, hostUrl: string): Agent {
  const { tags, alias } = parseSessionNameToTags(session.name)

  const agent: Agent = {
    id: uuidv4(),
    alias,
    displayName: session.name, // Use full session name as display name
    hostId,                    // Set host directly on agent
    hostName,
    hostUrl,
    program: 'claude-code', // Assume Claude Code
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
    tools: {
      session: {
        tmuxSessionName: session.name,
        workingDirectory: session.workingDirectory || process.cwd(),
        status: 'running',
        createdAt: session.createdAt,
        lastActive: session.lastActivity,
      }
    },
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
 * Query params:
 *   - q: Search query (searches alias, displayName, taskDescription, tags)
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const query = searchParams.get('q')

    // If search query provided, return simple search results (backward compatibility)
    if (query) {
      const agents = searchAgents(query)
      return NextResponse.json({ agents })
    }

    // Get local host info for response
    const localHost = getLocalHost()
    const hostId = localHost?.id || 'local'
    const hostName = localHost?.name || os.hostname()
    const hostUrl = localHost?.url || `http://localhost:23000`

    // 1. Load all registered agents from this host's registry
    let agents = loadAgents()

    // 2. Discover local tmux sessions only (no remote fetching)
    const discoveredSessions = await discoverLocalSessions()

    console.log(`[Agents] Found ${discoveredSessions.length} local tmux session(s)`)

    // 3. Create a map of session names for quick lookup
    const sessionMap = new Map<string, DiscoveredSession>()
    for (const session of discoveredSessions) {
      sessionMap.set(session.name, session)
    }

    // 4. Track which sessions have been matched
    const matchedSessionNames = new Set<string>()
    const resultAgents: Agent[] = []
    const newOrphanAgents: Agent[] = []

    // 5. Process each registered agent
    const agentsToUpdate: Agent[] = [] // Track agents that need registry update

    for (const agent of agents) {
      const tmuxSessionName = agent.tools.session?.tmuxSessionName

      // Try to find matching session
      let matchedSession: DiscoveredSession | null = null
      let sessionNameChanged = false

      if (tmuxSessionName && sessionMap.has(tmuxSessionName)) {
        // Exact match by tmuxSessionName
        matchedSession = sessionMap.get(tmuxSessionName)!
        matchedSessionNames.add(tmuxSessionName)
      } else {
        // Try pattern matching
        for (const session of discoveredSessions) {
          if (!matchedSessionNames.has(session.name)) {
            const matched = matchSessionToAgent(session.name, [agent])
            if (matched) {
              matchedSession = session
              matchedSessionNames.add(session.name)
              // Session name is different from registry - flag for update
              if (tmuxSessionName !== session.name) {
                sessionNameChanged = true
                console.log(`[Agents] Session name changed for ${agent.alias}: ${tmuxSessionName} → ${session.name}`)
              }
              break
            }
          }
        }
      }

      // Update registry if session name changed (prevents hibernate from using stale name)
      if (sessionNameChanged && matchedSession) {
        const agentIndex = agents.findIndex(a => a.id === agent.id)
        if (agentIndex !== -1 && agents[agentIndex].tools.session) {
          agents[agentIndex].tools.session.tmuxSessionName = matchedSession.name
          agents[agentIndex].tools.session.workingDirectory = matchedSession.workingDirectory || agents[agentIndex].tools.session.workingDirectory
          agentsToUpdate.push(agents[agentIndex])
        }
      }

      // Create session status (runtime tmux state only, no host info)
      const sessionStatus: AgentSessionStatus = matchedSession
        ? {
            status: 'online',
            tmuxSessionName: matchedSession.name,
            workingDirectory: matchedSession.workingDirectory,
            lastActivity: matchedSession.lastActivity,
            windows: matchedSession.windows
          }
        : {
            status: 'offline',
            workingDirectory: agent.tools.session?.workingDirectory
          }

      resultAgents.push(mergeAgentWithSession(agent, sessionStatus, hostId, hostName, hostUrl, false))
    }

    // 6. Process orphan sessions (sessions without matching agents)
    for (const session of discoveredSessions) {
      if (!matchedSessionNames.has(session.name)) {
        // This is an orphan session - auto-register it
        const orphanAgent = createOrphanAgent(session, hostId, hostName, hostUrl)
        newOrphanAgents.push(orphanAgent)

        const sessionStatus: AgentSessionStatus = {
          status: 'online',
          tmuxSessionName: session.name,
          workingDirectory: session.workingDirectory,
          lastActivity: session.lastActivity,
          windows: session.windows
        }

        // orphanAgent already has hostId set, just add session status
        resultAgents.push({
          ...orphanAgent,
          session: sessionStatus,
          isOrphan: true
        })
      }
    }

    // 7. Save registry updates (orphan agents + session name corrections)
    if (newOrphanAgents.length > 0 || agentsToUpdate.length > 0) {
      const updatedAgents = [...agents, ...newOrphanAgents]
      saveAgents(updatedAgents)
      if (newOrphanAgents.length > 0) {
        console.log(`[Agents] Auto-registered ${newOrphanAgents.length} orphan session(s) as agents`)
      }
      if (agentsToUpdate.length > 0) {
        console.log(`[Agents] Updated session names for ${agentsToUpdate.length} agent(s)`)
      }
    }

    // 8. Sort: online agents first, then alphabetically by alias
    resultAgents.sort((a, b) => {
      // Online first
      if (a.session?.status === 'online' && b.session?.status !== 'online') return -1
      if (a.session?.status !== 'online' && b.session?.status === 'online') return 1

      // Then alphabetically by alias (case-insensitive)
      return a.alias.toLowerCase().localeCompare(b.alias.toLowerCase())
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
        type: 'local' as const
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
