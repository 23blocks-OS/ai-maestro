import { NextResponse } from 'next/server'
import { exec } from 'child_process'
import { promisify } from 'util'
import http from 'http'
import https from 'https'
import fs from 'fs'
import path from 'path'
import os from 'os'
import type { Session } from '@/types/session'
import { getAgentBySession } from '@/lib/agent-registry'
import { getHosts, getLocalHost } from '@/lib/hosts-config'

const execAsync = promisify(exec)

// Read version from package.json
const packageJson = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf-8')
)
const AI_MAESTRO_VERSION = packageJson.version

// Force this route to be dynamic (not statically generated at build time)
export const dynamic = 'force-dynamic'

/**
 * HTTP GET using native Node.js http module (fetch/undici is broken for local networks)
 */
async function httpGet(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url)
    const client = urlObj.protocol === 'https:' ? https : http

    console.log(`[Sessions] DEBUG: Attempting http.get`)
    console.log(`[Sessions] DEBUG: URL:`, url)
    console.log(`[Sessions] DEBUG: Protocol:`, urlObj.protocol)
    console.log(`[Sessions] DEBUG: Hostname:`, urlObj.hostname)
    console.log(`[Sessions] DEBUG: Port:`, urlObj.port)
    console.log(`[Sessions] DEBUG: Process PID:`, process.pid)
    console.log(`[Sessions] DEBUG: Process ENV NODE_ENV:`, process.env.NODE_ENV)

    const req = client.get(url, { timeout: 5000 }, (res) => {
      console.log(`[Sessions] DEBUG: Got response, status:`, res.statusCode)
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        console.log(`[Sessions] DEBUG: Response complete, length:`, data.length)
        try {
          resolve(JSON.parse(data))
        } catch (error) {
          console.error(`[Sessions] DEBUG: JSON parse failed:`, error)
          reject(new Error(`Invalid JSON: ${data.substring(0, 100)}`))
        }
      })
    })

    req.on('error', (error) => {
      console.error(`[Sessions] DEBUG: Request error occurred`)
      console.error(`[Sessions] DEBUG: Error code:`, (error as NodeJS.ErrnoException).code)
      console.error(`[Sessions] DEBUG: Error message:`, error.message)
      console.error(`[Sessions] DEBUG: Error syscall:`, (error as NodeJS.ErrnoException).syscall)
      console.error(`[Sessions] DEBUG: Full error:`, error)
      reject(error)
    })

    req.on('timeout', () => {
      console.error(`[Sessions] DEBUG: Request timeout`)
      req.destroy()
      reject(new Error('Request timeout'))
    })

    req.on('socket', (socket) => {
      console.log(`[Sessions] DEBUG: Socket assigned`)
      console.log(`[Sessions] DEBUG: Socket localAddress:`, socket.localAddress)
      console.log(`[Sessions] DEBUG: Socket localPort:`, socket.localPort)

      socket.on('connect', () => {
        console.log(`[Sessions] DEBUG: Socket connected`)
        console.log(`[Sessions] DEBUG: Socket remoteAddress:`, socket.remoteAddress)
        console.log(`[Sessions] DEBUG: Socket remotePort:`, socket.remotePort)
      })

      socket.on('error', (err) => {
        console.error(`[Sessions] DEBUG: Socket error:`, err)
      })
    })
  })
}

/**
 * Fetch sessions from a remote host using native http module
 */
async function fetchRemoteSessions(hostUrl: string, hostId: string): Promise<Session[]> {
  try {
    const data = await httpGet(`${hostUrl}/api/sessions`)
    const remoteSessions = data.sessions || []

    console.log(`[Sessions] Successfully fetched ${remoteSessions.length} session(s) from ${hostUrl}`)

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
          version: AI_MAESTRO_VERSION,
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
                version: AI_MAESTRO_VERSION,
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
