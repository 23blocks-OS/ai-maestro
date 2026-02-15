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
import { getHosts, getSelfHost, isSelf } from '@/lib/hosts-config'

const execAsync = promisify(exec)

// ============================================================================
// CACHING & DEDUPLICATION: Prevent API overload from multiple rapid requests
// ============================================================================
const CACHE_TTL_MS = 3000  // Cache results for 3 seconds

let cachedSessions: Session[] | null = null
let cacheTimestamp = 0
let pendingRequest: Promise<Session[]> | null = null

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

    const req = client.get(url, { timeout: 2000 }, (res) => {
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
 * Fetch sessions from a remote host using native http module
 */
async function fetchRemoteSessions(hostUrl: string, hostId: string): Promise<Session[]> {
  try {
    // Pass local=true so the remote host only returns its own sessions (no cascading fan-out)
    const data = await httpGet(`${hostUrl}/api/sessions?local=true`)
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
          const hasSession = agentData.sessions && agentData.sessions.length > 0
          if (agentData.deployment?.type === 'cloud' && hasSession) {
            const agentName = agentData.name || agentData.alias

            // Check if already in list from tmux
            if (agentName && !sessions.find(s => s.name === agentName)) {
              const activityTimestamp = (global as any).sessionActivity?.get(agentName)
              let status: 'active' | 'idle' | 'disconnected' = 'disconnected'
              let lastActivity = agentData.lastActive || agentData.createdAt

              if (activityTimestamp) {
                lastActivity = new Date(activityTimestamp).toISOString()
                const secondsSinceActivity = (Date.now() - activityTimestamp) / 1000
                status = secondsSinceActivity > 3 ? 'idle' : 'active'
              }

              const workingDirectory = agentData.workingDirectory ||
                                       agentData.sessions?.[0]?.workingDirectory ||
                                       '/workspace'

              sessions.push({
                id: agentName,
                name: agentName,
                workingDirectory,
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

    // Discover Docker container agents (containers named aim-*)
    try {
      const { stdout: dockerOutput } = await execAsync(
        "docker ps --filter 'name=aim-' --format '{{.Names}}\t{{.Status}}\t{{.Ports}}' 2>/dev/null || echo ''"
      )

      if (dockerOutput.trim()) {
        for (const line of dockerOutput.trim().split('\n')) {
          if (!line.trim()) continue
          const [containerName, containerStatus, ports] = line.split('\t')
          if (!containerName) continue

          // Extract agent name from container name (aim-xxx -> xxx)
          const agentName = containerName.replace(/^aim-/, '')

          // Skip if already in sessions list (from tmux or cloud agents)
          if (sessions.find(s => s.name === agentName)) continue

          // Extract host port from ports column (e.g. "0.0.0.0:23005->23000/tcp")
          let containerPort: number | undefined
          const portMatch = ports?.match(/(\d+)->23000/)
          if (portMatch) {
            containerPort = parseInt(portMatch[1], 10)
          }

          const isUp = containerStatus?.toLowerCase().includes('up')

          sessions.push({
            id: agentName,
            name: agentName,
            workingDirectory: '/workspace',
            status: isUp ? 'idle' : 'disconnected',
            createdAt: new Date().toISOString(),
            lastActivity: new Date().toISOString(),
            windows: 1,
            hostId,
            version: AI_MAESTRO_VERSION,
            containerAgent: true,
            containerPort,
          })
        }
      }
    } catch {
      // Docker not available or no containers - continue silently
    }

    return sessions
  } catch (error) {
    console.error('[Sessions] Error fetching local sessions:', error)
    return []
  }
}

/**
 * Internal function to actually fetch sessions from all hosts.
 * Local sessions are fetched first; remote fetches race against a short deadline
 * so unreachable hosts don't block the response.
 */
async function fetchAllSessions(): Promise<Session[]> {
  const hosts = getHosts()
  const selfHost = getSelfHost()

  console.log(`[Sessions] Fetching from ${hosts.length} host(s)...`)

  // Fetch local sessions first (fast, no network)
  const localSessions = selfHost
    ? await fetchLocalSessions(selfHost.id)
    : []

  console.log(`[Agents] Found ${localSessions.length} local tmux session(s)`)

  // Fetch remote hosts in parallel with a tight deadline
  const remoteHosts = hosts.filter(h => !isSelf(h.id))

  if (remoteHosts.length === 0) {
    return localSessions
  }

  const remotePromises = remoteHosts.map(host =>
    fetchRemoteSessions(host.url, host.id)
  )

  const remoteResults = await Promise.all(remotePromises)
  const remoteSessions = remoteResults.flat()

  const allSessions = [...localSessions, ...remoteSessions]
  console.log(`[Sessions] Found ${allSessions.length} total session(s) across all hosts`)

  return allSessions
}

/**
 * GET /api/sessions
 * Fetches sessions from all configured hosts (local + remote workers)
 *
 * Uses caching + request deduplication to prevent overload:
 * - Results are cached for 3 seconds
 * - Concurrent requests share the same pending promise
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const localOnly = searchParams.get('local') === 'true'

    // If local=true, skip caching/dedup and return local sessions directly.
    // This prevents cascading fan-out when remote hosts call each other.
    if (localOnly) {
      const selfHost = getSelfHost()
      const sessions = selfHost ? await fetchLocalSessions(selfHost.id) : []
      console.log(`[Agents] Found ${sessions.length} local tmux session(s)`)
      return NextResponse.json({ sessions, fromCache: false })
    }

    const now = Date.now()

    // Return cached result if still valid
    if (cachedSessions && (now - cacheTimestamp) < CACHE_TTL_MS) {
      return NextResponse.json({ sessions: cachedSessions, fromCache: true })
    }

    // If there's already a request in flight, wait for it (deduplication)
    if (pendingRequest) {
      const sessions = await pendingRequest
      return NextResponse.json({ sessions, fromCache: false })
    }

    // Start a new request
    pendingRequest = fetchAllSessions()

    try {
      const sessions = await pendingRequest

      // Update cache
      cachedSessions = sessions
      cacheTimestamp = Date.now()

      return NextResponse.json({ sessions, fromCache: false })
    } finally {
      // Clear pending request
      pendingRequest = null
    }
  } catch (error) {
    console.error('[Sessions] Failed to fetch sessions:', error)
    pendingRequest = null  // Clear on error too
    return NextResponse.json(
      { error: 'Failed to fetch sessions', sessions: [] },
      { status: 500 }
    )
  }
}
