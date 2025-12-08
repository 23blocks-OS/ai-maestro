import { NextResponse } from 'next/server'
import { exec } from 'child_process'
import { promisify } from 'util'
import http from 'http'
import https from 'https'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { v4 as uuidv4 } from 'uuid'
import type { Agent, UnifiedAgent, AgentSessionStatus } from '@/types/agent'
import { loadAgents, saveAgents, getAgentBySession } from '@/lib/agent-registry'
import { getHosts, getLocalHost } from '@/lib/hosts-config'

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
  hostId: string
  hostName?: string
}

/**
 * HTTP GET using native Node.js http module (fetch/undici is broken for local networks)
 */
async function httpGet(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url)
    const client = urlObj.protocol === 'https:' ? https : http

    const req = client.get(url, { timeout: 5000 }, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try {
          resolve(JSON.parse(data))
        } catch (error) {
          reject(new Error(`Invalid JSON from ${url}`))
        }
      })
    })

    req.on('error', (error) => {
      reject(error)
    })

    req.on('timeout', () => {
      req.destroy()
      reject(new Error('Request timeout'))
    })
  })
}

/**
 * Fetch sessions from a remote host
 */
async function fetchRemoteSessions(hostUrl: string, hostId: string, hostName: string): Promise<DiscoveredSession[]> {
  try {
    const data = await httpGet(`${hostUrl}/api/sessions`)
    const remoteSessions = data.sessions || []

    console.log(`[UnifiedAgents] Fetched ${remoteSessions.length} session(s) from ${hostName} (${hostUrl})`)

    return remoteSessions.map((session: any) => ({
      name: session.name || session.id,
      workingDirectory: session.workingDirectory || '',
      status: session.status || 'disconnected',
      createdAt: session.createdAt || new Date().toISOString(),
      lastActivity: session.lastActivity || session.createdAt || new Date().toISOString(),
      windows: session.windows || 1,
      hostId,
      hostName,
    }))
  } catch (error) {
    console.error(`[UnifiedAgents] Error fetching from ${hostName}:`, error)
    return []
  }
}

/**
 * Discover all tmux sessions on local host
 */
async function discoverLocalSessions(hostId: string): Promise<DiscoveredSession[]> {
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
          hostId
        }
      })

    const sessions = (await Promise.all(sessionPromises))
      .filter((s): s is DiscoveredSession => s !== null)

    return sessions
  } catch (error) {
    console.error('[UnifiedAgents] Error discovering local sessions:', error)
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

  // 4. Session name contains agent alias as a segment (e.g., "23blocks-apps-prompthub" matches "prompthub")
  const segmentMatch = agents.find(a => {
    const alias = a.alias.toLowerCase()
    const session = sessionName.toLowerCase()
    const segments = session.split(/[-_]/)
    return segments.includes(alias)
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
function createOrphanAgent(session: DiscoveredSession): Agent {
  const { tags, alias } = parseSessionNameToTags(session.name)

  const agent: Agent = {
    id: uuidv4(),
    alias,
    displayName: session.name, // Use full session name as display name
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
 * Convert agent + session status to UnifiedAgent
 */
function toUnifiedAgent(
  agent: Agent,
  sessionStatus: AgentSessionStatus,
  isOrphan: boolean
): UnifiedAgent {
  return {
    ...agent,
    session: sessionStatus,
    isOrphan
  }
}

/**
 * GET /api/agents/unified
 * Returns all agents with their session status merged
 * Also auto-registers orphan sessions as new agents
 */
export async function GET() {
  try {
    const hosts = getHosts()
    const localHost = getLocalHost()
    const defaultHostId = localHost?.id || 'local'

    // 1. Load all registered agents
    let agents = loadAgents()

    // 2. Discover sessions from ALL hosts (local + remote)
    console.log(`[UnifiedAgents] Fetching from ${hosts.length} host(s)...`)

    const sessionPromises = hosts.map(async (host) => {
      if (host.type === 'local') {
        return discoverLocalSessions(host.id)
      } else {
        return fetchRemoteSessions(host.url, host.id, host.name)
      }
    })

    const allSessionArrays = await Promise.all(sessionPromises)
    const discoveredSessions = allSessionArrays.flat()

    console.log(`[UnifiedAgents] Found ${discoveredSessions.length} total session(s) across all hosts`)

    // 3. Create a map of session names for quick lookup
    const sessionMap = new Map<string, DiscoveredSession>()
    for (const session of discoveredSessions) {
      sessionMap.set(session.name, session)
    }

    // 4. Track which sessions have been matched
    const matchedSessionNames = new Set<string>()
    const unifiedAgents: UnifiedAgent[] = []
    const newOrphanAgents: Agent[] = []

    // 5. Process each registered agent
    for (const agent of agents) {
      const tmuxSessionName = agent.tools.session?.tmuxSessionName

      // Try to find matching session
      let matchedSession: DiscoveredSession | null = null

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
              break
            }
          }
        }
      }

      // Create session status
      const sessionStatus: AgentSessionStatus = matchedSession
        ? {
            status: 'online',
            tmuxSessionName: matchedSession.name,
            workingDirectory: matchedSession.workingDirectory,
            hostId: matchedSession.hostId,
            hostName: matchedSession.hostName,
            lastActivity: matchedSession.lastActivity,
            windows: matchedSession.windows
          }
        : {
            status: 'offline',
            workingDirectory: agent.tools.session?.workingDirectory,
            hostId: defaultHostId
          }

      unifiedAgents.push(toUnifiedAgent(agent, sessionStatus, false))
    }

    // 6. Process orphan sessions (sessions without matching agents)
    for (const session of discoveredSessions) {
      if (!matchedSessionNames.has(session.name)) {
        // This is an orphan session - auto-register it
        const orphanAgent = createOrphanAgent(session)
        newOrphanAgents.push(orphanAgent)

        const sessionStatus: AgentSessionStatus = {
          status: 'online',
          tmuxSessionName: session.name,
          workingDirectory: session.workingDirectory,
          hostId: session.hostId,
          hostName: session.hostName,
          lastActivity: session.lastActivity,
          windows: session.windows
        }

        unifiedAgents.push(toUnifiedAgent(orphanAgent, sessionStatus, true))
      }
    }

    // 7. Save new orphan agents to registry
    if (newOrphanAgents.length > 0) {
      const updatedAgents = [...agents, ...newOrphanAgents]
      saveAgents(updatedAgents)
      console.log(`[UnifiedAgents] Auto-registered ${newOrphanAgents.length} orphan session(s) as agents`)
    }

    // 8. Sort: online agents first, then alphabetically by alias
    unifiedAgents.sort((a, b) => {
      // Online first
      if (a.session.status === 'online' && b.session.status !== 'online') return -1
      if (a.session.status !== 'online' && b.session.status === 'online') return 1

      // Then alphabetically by alias (case-insensitive)
      return a.alias.toLowerCase().localeCompare(b.alias.toLowerCase())
    })

    return NextResponse.json({
      agents: unifiedAgents,
      stats: {
        total: unifiedAgents.length,
        online: unifiedAgents.filter(a => a.session.status === 'online').length,
        offline: unifiedAgents.filter(a => a.session.status === 'offline').length,
        orphans: unifiedAgents.filter(a => a.isOrphan).length,
        newlyRegistered: newOrphanAgents.length
      }
    })
  } catch (error) {
    console.error('[UnifiedAgents] Failed to fetch unified agents:', error)
    return NextResponse.json(
      { error: 'Failed to fetch unified agents', agents: [] },
      { status: 500 }
    )
  }
}
