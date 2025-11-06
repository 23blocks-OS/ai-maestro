import { NextResponse } from 'next/server'
import { exec } from 'child_process'
import { promisify } from 'util'
import fs from 'fs'
import path from 'path'
import os from 'os'
import type { Session } from '@/types/session'
import { getAgentBySession } from '@/lib/agent-registry'
import { getHosts, getLocalHost } from '@/lib/hosts-config'

const execAsync = promisify(exec)

// Force this route to be dynamic (not statically generated at build time)
export const dynamic = 'force-dynamic'

/**
 * Fetch sessions from a remote host
 */
async function fetchRemoteSessions(hostUrl: string, hostId: string): Promise<Session[]> {
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000) // 5 second timeout

    const response = await fetch(`${hostUrl}/api/sessions`, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
      },
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      console.error(`[Sessions] Failed to fetch from ${hostUrl}: HTTP ${response.status}`)
      return []
    }

    const data = await response.json()
    const remoteSessions = data.sessions || []

    // Tag each session with its hostId
    return remoteSessions.map((session: Session) => ({
      ...session,
      hostId,
    }))
  } catch (error) {
    console.error(`[Sessions] Error fetching from ${hostUrl}:`, error)
    return []
  }
}

/**
 * Fetch local tmux sessions
 */
async function fetchLocalSessions(hostId: string): Promise<Session[]> {
  try {
    // Execute tmux list-sessions command
    const { stdout } = await execAsync('tmux list-sessions 2>/dev/null || echo ""')

    if (!stdout.trim()) {
      // No sessions found
      return []
    }

    // Parse tmux output
    const sessionPromises = stdout
      .trim()
      .split('\n')
      .map(async (line) => {
        // Format: "session-name: 1 windows (created Wed Jan 10 14:23:45 2025) (attached)"
        // Or: "session-name: 1 windows (created Wed Jan 10 14:23:45 2025)"
        const match = line.match(/^([^:]+):\s+(\d+)\s+windows?\s+\(created\s+(.+?)\)/)

        if (!match) return null

        const [, name, windows, createdStr] = match

        // Parse tmux date format: "Thu Oct  9 12:24:58 2025"
        // Normalize multiple spaces to single space for parsing
        const normalizedDate = createdStr.trim().replace(/\s+/g, ' ')

        // Try to parse the date, fallback to current time if it fails
        let createdAt: string
        try {
          const parsedDate = new Date(normalizedDate)
          createdAt = isNaN(parsedDate.getTime())
            ? new Date().toISOString()
            : parsedDate.toISOString()
        } catch {
          createdAt = new Date().toISOString()
        }

        // Get last activity from global sessionActivity Map (populated by server.mjs)
        let lastActivity: string
        let status: 'active' | 'idle' | 'disconnected'

        const activityTimestamp = (global as any).sessionActivity?.get(name)

        if (activityTimestamp) {
          lastActivity = new Date(activityTimestamp).toISOString()

          // Calculate if session is idle (no activity for 3+ seconds)
          const secondsSinceActivity = (Date.now() - activityTimestamp) / 1000
          status = secondsSinceActivity > 3 ? 'idle' : 'active'
        } else {
          // No activity data yet - assume disconnected
          lastActivity = createdAt
          status = 'disconnected'
        }

        // Get working directory from tmux (pane_current_path of first pane)
        let workingDirectory = ''
        try {
          const { stdout: cwdOutput } = await execAsync(
            `tmux display-message -t "${name}" -p "#{pane_current_path}" 2>/dev/null || echo ""`
          )
          workingDirectory = cwdOutput.trim()
        } catch {
          // If we can't get it, leave empty
          workingDirectory = ''
        }

        // Check if this session is linked to an agent
        const agent = getAgentBySession(name)

        return {
          id: name,
          name,
          workingDirectory,
          status,
          createdAt,
          lastActivity,
          windows: parseInt(windows, 10),
          hostId, // Tag with local host ID
          ...(agent && { agentId: agent.id })
        }
      })

    const sessions = (await Promise.all(sessionPromises))
      .filter(session => session !== null) as Session[]

    // Also discover cloud agents from registry
    try {
      const agentsDir = path.join(os.homedir(), '.aimaestro', 'agents')

      if (fs.existsSync(agentsDir)) {
        const agentFiles = fs.readdirSync(agentsDir).filter(f => f.endsWith('.json'))

        for (const file of agentFiles) {
          const agentData = JSON.parse(fs.readFileSync(path.join(agentsDir, file), 'utf8'))

          // Only add cloud agents that aren't already in the tmux session list
          if (agentData.deployment?.type === 'cloud' && agentData.tools?.session?.tmuxSessionName) {
            const sessionName = agentData.tools.session.tmuxSessionName

            // Check if already in list from tmux
            if (!sessions.find(s => s.name === sessionName)) {
              const activityTimestamp = (global as any).sessionActivity?.get(sessionName)
              let status: 'active' | 'idle' | 'disconnected' = 'disconnected'
              let lastActivity = agentData.lastActive || agentData.createdAt

              if (activityTimestamp) {
                lastActivity = new Date(activityTimestamp).toISOString()
                const secondsSinceActivity = (Date.now() - activityTimestamp) / 1000
                status = secondsSinceActivity > 3 ? 'idle' : 'active'
              }

              sessions.push({
                id: sessionName,
                name: sessionName,
                workingDirectory: agentData.tools.session.workingDirectory || '/workspace',
                status,
                createdAt: agentData.createdAt,
                lastActivity,
                windows: 1,
                hostId, // Tag with local host ID
                agentId: agentData.id
              })
            }
          }
        }
      }
    } catch (error) {
      console.error('Error discovering cloud agents:', error)
      // Continue without cloud agents
    }

    return sessions
  } catch (error) {
    console.error('[Sessions] Error fetching local sessions:', error)
    return []
  }
}

/**
 * GET /api/sessions
 * Fetches sessions from all configured hosts (local + remote workers)
 */
export async function GET() {
  try {
    // Get all configured hosts
    const hosts = getHosts()
    const localHost = getLocalHost()

    console.log(`[Sessions] Fetching from ${hosts.length} host(s)...`)

    // Fetch sessions from all hosts in parallel
    const sessionPromises = hosts.map(async (host) => {
      if (host.type === 'local') {
        return fetchLocalSessions(host.id)
      } else {
        return fetchRemoteSessions(host.url, host.id)
      }
    })

    const allSessionArrays = await Promise.all(sessionPromises)

    // Flatten arrays and combine
    const allSessions = allSessionArrays.flat()

    console.log(`[Sessions] Found ${allSessions.length} total session(s) across all hosts`)

    return NextResponse.json({ sessions: allSessions })
  } catch (error) {
    console.error('[Sessions] Failed to fetch sessions:', error)
    return NextResponse.json(
      { error: 'Failed to fetch sessions', sessions: [] },
      { status: 500 }
    )
  }
}
