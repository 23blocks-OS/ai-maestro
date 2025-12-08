/**
 * Tmux Discovery Helpers
 *
 * Low-level functions to discover tmux sessions from both local and remote hosts.
 * These functions return Session objects representing raw tmux session metadata.
 *
 * For agent-centric operations, use the unified agents API instead (/api/agents/unified).
 * This module is used internally by the agents API for tmux discovery.
 */

import { Session } from '@/types/session'
import { Host } from '@/types/host'
import { exec } from 'child_process'
import { promisify } from 'util'
import { getAgentBySession } from '@/lib/agent-registry'

const execAsync = promisify(exec)

/**
 * Discover sessions from a local host (this machine)
 */
export async function discoverLocalSessions(host: Host): Promise<Session[]> {
  try {
    // Execute tmux list-sessions command
    const { stdout } = await execAsync('tmux list-sessions 2>/dev/null || echo ""')

    if (!stdout.trim()) {
      return []
    }

    // Parse tmux output
    const sessionPromises = stdout
      .trim()
      .split('\n')
      .map(async (line) => {
        // Format: "session-name: 1 windows (created Wed Jan 10 14:23:45 2025) (attached)"
        const match = line.match(/^([^:]+):\s+(\d+)\s+windows?\s+\(created\s+(.+?)\)/)

        if (!match) return null

        const [, name, windows, createdStr] = match

        // Parse tmux date format
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
          ...(agent && { agentId: agent.id }),
          // Add host metadata
          hostId: host.id,
          hostName: host.name,
          remote: false,
        } as Session
      })

    const sessions = (await Promise.all(sessionPromises)).filter(
      (session) => session !== null
    ) as Session[]

    return sessions
  } catch (error) {
    console.error(`[Discovery] Failed to discover local sessions:`, error)
    return []
  }
}

/**
 * Discover sessions from a remote host via HTTP API
 */
export async function discoverRemoteSessions(host: Host): Promise<Session[]> {
  try {
    const response = await fetch(`${host.url}/api/sessions`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      // Add timeout to prevent hanging on unreachable hosts
      signal: AbortSignal.timeout(5000), // 5 second timeout
    })

    if (!response.ok) {
      console.error(
        `[Discovery] Failed to fetch sessions from ${host.name}: HTTP ${response.status}`
      )
      return []
    }

    const data = await response.json()
    const remoteSessions = data.sessions || []

    // Add host metadata to each session
    return remoteSessions.map((session: Session) => ({
      ...session,
      hostId: host.id,
      hostName: host.name,
      remote: true,
    }))
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'TimeoutError') {
        console.error(`[Discovery] Timeout connecting to ${host.name} (${host.url})`)
      } else if (error.name === 'TypeError' && error.message.includes('fetch')) {
        console.error(`[Discovery] Network error connecting to ${host.name} (${host.url})`)
      } else {
        console.error(`[Discovery] Failed to fetch sessions from ${host.name}:`, error.message)
      }
    } else {
      console.error(`[Discovery] Unknown error fetching sessions from ${host.name}:`, error)
    }
    return []
  }
}

/**
 * Discover sessions from a single host (local or remote)
 */
export async function discoverSessionsFromHost(host: Host): Promise<Session[]> {
  if (host.type === 'local') {
    return discoverLocalSessions(host)
  } else {
    return discoverRemoteSessions(host)
  }
}

/**
 * Discover sessions from all configured hosts
 */
export async function discoverAllSessions(hosts: Host[]): Promise<Session[]> {
  // Discover sessions from all hosts in parallel
  const sessionsByHost = await Promise.all(
    hosts.map((host) => discoverSessionsFromHost(host))
  )

  // Flatten and return all sessions
  return sessionsByHost.flat()
}
