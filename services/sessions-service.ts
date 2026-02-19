/**
 * Sessions Service
 *
 * Pure business logic extracted from app/api/sessions/** routes.
 * No HTTP concepts (Request, Response, NextResponse, headers) leak into this module.
 * API routes become thin wrappers that call these functions.
 *
 * Covers:
 *   GET    /api/sessions              -> listSessions / listLocalSessions
 *   POST   /api/sessions/create       -> createSession
 *   DELETE  /api/sessions/[id]        -> deleteSession
 *   PATCH  /api/sessions/[id]/rename  -> renameSession
 *   POST   /api/sessions/[id]/command -> sendCommand
 *   GET    /api/sessions/[id]/command -> checkIdleStatus
 *   GET    /api/sessions/restore      -> listRestorableSessions
 *   POST   /api/sessions/restore      -> restoreSessions
 *   DELETE /api/sessions/restore      -> deletePersistedSession
 *   GET    /api/sessions/activity     -> getActivity
 *   POST   /api/sessions/activity/update -> broadcastActivityUpdate
 */

import { exec, execFile } from 'child_process'
import { promisify } from 'util'
import http from 'http'
import https from 'https'
import fs from 'fs'
import path from 'path'
import os from 'os'
import type { Session } from '@/types/session'
import { getAgentBySession, getAgentByName, createAgent, deleteAgentBySession, renameAgentSession } from '@/lib/agent-registry'
import { loadAgents } from '@/lib/agent-registry'
import { getHosts, getSelfHost, getSelfHostId, isSelf, getHostById } from '@/lib/hosts-config'
import { persistSession, loadPersistedSessions, unpersistSession } from '@/lib/session-persistence'
import { parseNameForDisplay } from '@/types/agent'
import { initAgentAMPHome, getAgentAMPDir } from '@/lib/amp-inbox-writer'
import { sessionActivity, broadcastStatusUpdate } from '@/services/shared-state'
import { getRuntime } from '@/lib/agent-runtime'
import crypto from 'crypto'

const execAsync = promisify(exec)
const execFileAsync = promisify(execFile)

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ServiceResult<T> {
  data?: T
  error?: string
  status: number  // HTTP-like status code for the route to use
}

export type SessionActivityStatus = 'active' | 'idle' | 'waiting'

export interface SessionActivityInfo {
  lastActivity: string
  status: SessionActivityStatus
  hookStatus?: string
  notificationType?: string
}

export interface CreateSessionParams {
  name: string
  workingDirectory?: string
  agentId?: string
  hostId?: string
  label?: string
  avatar?: string
  programArgs?: string
  program?: string
}

export interface RestoreResult {
  sessionId: string
  status: 'restored' | 'already_exists' | 'failed'
}

// ---------------------------------------------------------------------------
// Caching (for listSessions)
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 3000

let cachedSessions: Session[] | null = null
let cacheTimestamp = 0
let pendingRequest: Promise<Session[]> | null = null

// Read version from package.json (once at module load)
const packageJson = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf-8')
)
const AI_MAESTRO_VERSION: string = packageJson.version

// Idle threshold in milliseconds (30 seconds) — for command endpoint
const IDLE_THRESHOLD_MS = 30 * 1000

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** HTTP GET using native Node.js http module (fetch/undici is broken for local networks) */
async function httpGet(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url)
    const client = urlObj.protocol === 'https:' ? https : http

    const req = client.get(url, { timeout: 2000 }, (res) => {
      let data = ''
      res.on('data', (chunk: string) => data += chunk)
      res.on('end', () => {
        try {
          resolve(JSON.parse(data))
        } catch {
          reject(new Error(`Invalid JSON from ${url}`))
        }
      })
    })

    req.on('error', (error: Error) => reject(error))
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')) })
  })
}

/** HTTP POST using native fetch */
async function httpPost(url: string, body: any, timeout = 10000): Promise<any> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeout)
  })

  const data = await response.text()

  if (response.ok) {
    try { return JSON.parse(data) } catch { throw new Error(`Invalid JSON: ${data.substring(0, 100)}`) }
  } else {
    try {
      const errorData = JSON.parse(data)
      throw new Error(errorData.error || `HTTP ${response.status}`)
    } catch (e) {
      if (e instanceof Error && e.message.includes('HTTP')) throw e
      throw new Error(`HTTP ${response.status}: ${data.substring(0, 100)}`)
    }
  }
}

/** Hash working directory to find hook state file */
function hashCwd(cwd: string): string {
  return crypto.createHash('md5').update(cwd || '').digest('hex').substring(0, 16)
}

/** Read hook state for a given working directory */
function getHookState(workingDir: string): { status: string; notificationType?: string } | null {
  if (!workingDir) return null

  const stateDir = path.join(os.homedir(), '.aimaestro', 'chat-state')
  const cwdHash = hashCwd(workingDir)
  const stateFile = path.join(stateDir, `${cwdHash}.json`)

  try {
    if (fs.existsSync(stateFile)) {
      const content = fs.readFileSync(stateFile, 'utf-8')
      const state = JSON.parse(content)

      const isWaitingState = state.status === 'waiting_for_input' || state.status === 'permission_request'
      if (!isWaitingState) {
        const stateAge = Date.now() - new Date(state.updatedAt).getTime()
        if (stateAge > 60000) return null
      }

      return { status: state.status, notificationType: state.notificationType }
    }
  } catch {
    // Ignore errors reading state files
  }

  return null
}

/** Check if a session is idle based on activity threshold */
function isSessionIdle(sessionName: string): boolean {
  const activity = sessionActivity.get(sessionName)
  if (!activity) return true
  return (Date.now() - activity) > IDLE_THRESHOLD_MS
}

/** Fetch sessions from a remote host */
async function fetchRemoteSessions(hostUrl: string, hostId: string): Promise<Session[]> {
  try {
    const data = await httpGet(`${hostUrl}/api/sessions?local=true`)
    const remoteSessions = data.sessions || []
    console.log(`[Sessions] Successfully fetched ${remoteSessions.length} session(s) from ${hostUrl}`)
    return remoteSessions.map((session: Session) => ({ ...session, hostId }))
  } catch (error) {
    console.error(`[Sessions] Error fetching from ${hostUrl}:`, error)
    return []
  }
}

/** Fetch local tmux sessions + cloud agents + Docker containers */
async function fetchLocalSessions(hostId: string): Promise<Session[]> {
  try {
    const runtime = getRuntime()
    const discovered = await runtime.listSessions()

    const sessions: Session[] = []

    for (const disc of discovered) {
      const activityTimestamp = sessionActivity.get(disc.name)
      let lastActivity: string
      let status: 'active' | 'idle' | 'disconnected'

      if (activityTimestamp) {
        lastActivity = new Date(activityTimestamp).toISOString()
        status = ((Date.now() - activityTimestamp) / 1000) > 3 ? 'idle' : 'active'
      } else {
        lastActivity = disc.createdAt
        status = 'disconnected'
      }

      const agent = getAgentBySession(disc.name)

      sessions.push({
        id: disc.name,
        name: disc.name,
        workingDirectory: disc.workingDirectory,
        status,
        createdAt: disc.createdAt,
        lastActivity,
        windows: disc.windows,
        hostId,
        version: AI_MAESTRO_VERSION,
        ...(agent && { agentId: agent.id })
      })
    }

    // Discover cloud agents from registry
    try {
      const agentsDir = path.join(os.homedir(), '.aimaestro', 'agents')
      if (fs.existsSync(agentsDir)) {
        const agentFiles = fs.readdirSync(agentsDir).filter(f => f.endsWith('.json'))
        for (const file of agentFiles) {
          const agentData = JSON.parse(fs.readFileSync(path.join(agentsDir, file), 'utf8'))
          const hasSession = agentData.sessions && agentData.sessions.length > 0
          if (agentData.deployment?.type === 'cloud' && hasSession) {
            const agentName = agentData.name || agentData.alias
            if (agentName && !sessions.find(s => s.name === agentName)) {
              const activityTimestamp = sessionActivity.get(agentName)
              let status: 'active' | 'idle' | 'disconnected' = 'disconnected'
              let lastActivity = agentData.lastActive || agentData.createdAt
              if (activityTimestamp) {
                lastActivity = new Date(activityTimestamp).toISOString()
                status = ((Date.now() - activityTimestamp) / 1000) > 3 ? 'idle' : 'active'
              }
              sessions.push({
                id: agentName,
                name: agentName,
                workingDirectory: agentData.workingDirectory || agentData.sessions?.[0]?.workingDirectory || '/workspace',
                status,
                createdAt: agentData.createdAt,
                lastActivity,
                windows: 1,
                hostId,
                version: AI_MAESTRO_VERSION,
                agentId: agentData.id
              })
            }
          }
        }
      }
    } catch (error) {
      console.error('Error discovering cloud agents:', error)
    }

    // Discover Docker container agents
    try {
      const { stdout: dockerOutput } = await execAsync(
        "docker ps --filter 'name=aim-' --format '{{.Names}}\t{{.Status}}\t{{.Ports}}' 2>/dev/null || echo ''"
      )
      if (dockerOutput.trim()) {
        for (const line of dockerOutput.trim().split('\n')) {
          if (!line.trim()) continue
          const [containerName, containerStatus, ports] = line.split('\t')
          if (!containerName) continue
          const agentName = containerName.replace(/^aim-/, '')
          if (sessions.find(s => s.name === agentName)) continue
          let containerPort: number | undefined
          const portMatch = ports?.match(/(\d+)->23000/)
          if (portMatch) containerPort = parseInt(portMatch[1], 10)
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
      // Docker not available
    }

    // Discover OpenClaw sessions (custom tmux sockets)
    try {
      const openclawSocketDir = process.env.OPENCLAW_TMUX_SOCKET_DIR
        || path.join(os.tmpdir(), 'clawdbot-tmux-sockets')

      if (fs.existsSync(openclawSocketDir)) {
        const socketFiles = fs.readdirSync(openclawSocketDir)
          .filter(f => !f.startsWith('.'))

        for (const socketFile of socketFiles) {
          const socketPath = path.join(openclawSocketDir, socketFile)
          try {
            const { stdout } = await execFileAsync(
              'tmux', ['-S', socketPath, 'list-sessions'],
              { timeout: 3000 }
            )
            if (!stdout.trim()) continue

            for (const line of stdout.trim().split('\n')) {
              const match = line.match(/^([^:]+):\s+(\d+)\s+windows?/)
              if (!match) continue
              const [, sessionName, windows] = match
              if (sessions.find(s => s.id === sessionName)) continue

              sessions.push({
                id: sessionName,
                name: sessionName,
                workingDirectory: '',
                status: 'idle',
                createdAt: new Date().toISOString(),
                lastActivity: new Date().toISOString(),
                windows: parseInt(windows, 10),
                hostId,
                version: AI_MAESTRO_VERSION,
                socketPath,
              })
            }
          } catch { /* socket file may be stale */ }
        }
      }
    } catch {
      // OpenClaw not installed or socket dir doesn't exist
    }

    return sessions
  } catch (error) {
    console.error('[Sessions] Error fetching local sessions:', error)
    return []
  }
}

/** Fetch sessions from all hosts (local + remote) */
async function fetchAllSessions(): Promise<Session[]> {
  const hosts = getHosts()
  const selfHost = getSelfHost()

  console.log(`[Sessions] Fetching from ${hosts.length} host(s)...`)

  const localSessions = selfHost ? await fetchLocalSessions(selfHost.id) : []
  console.log(`[Agents] Found ${localSessions.length} local tmux session(s)`)

  const remoteHosts = hosts.filter(h => !isSelf(h.id))
  if (remoteHosts.length === 0) return localSessions

  const remoteResults = await Promise.all(
    remoteHosts.map(host => fetchRemoteSessions(host.url, host.id))
  )

  const allSessions = [...localSessions, ...remoteResults.flat()]
  console.log(`[Sessions] Found ${allSessions.length} total session(s) across all hosts`)
  return allSessions
}

// ===========================================================================
// PUBLIC API — called by API routes
// ===========================================================================

/**
 * List all sessions (local + remote). Cached for 3s with request deduplication.
 */
export async function listSessions(): Promise<{ sessions: Session[]; fromCache: boolean }> {
  const now = Date.now()

  if (cachedSessions && (now - cacheTimestamp) < CACHE_TTL_MS) {
    return { sessions: cachedSessions, fromCache: true }
  }

  if (pendingRequest) {
    const sessions = await pendingRequest
    return { sessions, fromCache: false }
  }

  pendingRequest = fetchAllSessions()
  try {
    const sessions = await pendingRequest
    cachedSessions = sessions
    cacheTimestamp = Date.now()
    return { sessions, fromCache: false }
  } finally {
    pendingRequest = null
  }
}

/**
 * List only local sessions (no remote fan-out).
 */
export async function listLocalSessions(): Promise<{ sessions: Session[] }> {
  const selfHost = getSelfHost()
  const sessions = selfHost ? await fetchLocalSessions(selfHost.id) : []
  console.log(`[Agents] Found ${sessions.length} local tmux session(s)`)
  return { sessions }
}

/**
 * Get session activity with hook state enrichment.
 */
export async function getActivity(): Promise<Record<string, SessionActivityInfo>> {
  const activityMap = sessionActivity
  const activity: Record<string, SessionActivityInfo> = {}

  const agents = loadAgents()
  const sessionToWorkingDir = new Map<string, string>()

  for (const agent of agents) {
    const sessionName = agent.name || agent.alias
    const workingDir = agent.workingDirectory ||
                       agent.sessions?.[0]?.workingDirectory ||
                       agent.preferences?.defaultWorkingDirectory
    if (sessionName && workingDir) {
      sessionToWorkingDir.set(sessionName, workingDir)
    }
  }

  const now = Date.now()
  activityMap.forEach((timestamp, sessionName) => {
    const terminalIdle = ((now - timestamp) / 1000) > 3
    const workingDir = sessionToWorkingDir.get(sessionName)
    const hookState = workingDir ? getHookState(workingDir) : null

    let status: SessionActivityStatus = terminalIdle ? 'idle' : 'active'
    if (hookState && (hookState.status === 'waiting_for_input' || hookState.status === 'permission_request')) {
      status = 'waiting'
    }

    activity[sessionName] = {
      lastActivity: new Date(timestamp).toISOString(),
      status,
      hookStatus: hookState?.status,
      notificationType: hookState?.notificationType
    }
  })

  return activity
}

/**
 * Broadcast a status update via WebSocket.
 */
export function broadcastActivityUpdate(
  sessionName: string,
  status: string,
  hookStatus?: string,
  notificationType?: string
): ServiceResult<{ success: boolean }> {
  if (!sessionName) {
    return { error: 'sessionName is required', status: 400 }
  }

  broadcastStatusUpdate(sessionName, status, hookStatus, notificationType)
  return { data: { success: true }, status: 200 }
}

/**
 * Create a new session (local or forwarded to remote host).
 */
export async function createSession(params: CreateSessionParams): Promise<ServiceResult<{ success: boolean; name: string; agentId?: string; type?: string }>> {
  const { name, workingDirectory, agentId, hostId, label, avatar, programArgs, program } = params

  if (!name || typeof name !== 'string') {
    return { error: 'Session name is required', status: 400 }
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    return { error: 'Session name can only contain letters, numbers, dashes, and underscores', status: 400 }
  }

  // Determine target host
  const selfHost = getSelfHost()
  const targetHost = hostId ? getHostById(hostId) : selfHost
  const isRemoteTarget = targetHost && !isSelf(targetHost.id)

  // Forward to remote host if needed
  if (isRemoteTarget && targetHost) {
    try {
      const remoteUrl = `${targetHost.url}/api/sessions/create`
      console.log(`[Sessions] Creating session "${name}" on remote host ${targetHost.name} at ${remoteUrl}`)
      const data = await httpPost(remoteUrl, { name, workingDirectory, agentId, label, avatar, programArgs, program })
      console.log(`[Sessions] Successfully created session "${name}" on ${targetHost.name}`)
      return { data, status: 200 }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      const errorCause = (error as any)?.cause
      const causeCode = errorCause?.code || ''
      const causeMessage = errorCause?.message || ''
      const fullErrorText = `${errorMessage} ${causeCode} ${causeMessage}`

      console.error(`[Sessions] Failed to connect to ${targetHost.name} (${targetHost.url}):`, { message: errorMessage, causeCode, causeMessage })

      if (errorMessage.includes('aborted') || causeCode === 'ABORT_ERR') {
        return { error: `Timeout connecting to ${targetHost.name}. Is the remote AI Maestro running?`, status: 504 }
      } else if (fullErrorText.includes('ECONNREFUSED') || causeCode === 'ECONNREFUSED') {
        return { error: `Connection refused by ${targetHost.name}. Verify the remote AI Maestro is running on ${targetHost.url}`, status: 503 }
      } else if (fullErrorText.includes('EHOSTUNREACH') || causeCode === 'EHOSTUNREACH') {
        return { error: `Cannot reach ${targetHost.name} at ${targetHost.url}. Try again or check network.`, status: 503 }
      } else if (fullErrorText.includes('ENETUNREACH') || causeCode === 'ENETUNREACH') {
        return { error: `Network unreachable to ${targetHost.name}. Are you on the same network/VPN?`, status: 503 }
      } else {
        return { error: `Failed to connect to ${targetHost.name}: ${errorMessage} (${causeCode})`, status: 500 }
      }
    }
  }

  // Local session creation
  const runtime = getRuntime()
  const normalizedName = name.toLowerCase()
  const selfHostId = getSelfHostId()
  const actualSessionName = agentId ? `${agentId}@${selfHostId}` : normalizedName

  const alreadyExists = await runtime.sessionExists(actualSessionName)
  if (alreadyExists) {
    return { error: 'Session already exists', status: 409 }
  }

  const cwd = workingDirectory || process.cwd()
  await runtime.createSession(actualSessionName, cwd)

  // Register agent
  const agentName = normalizedName
  let registeredAgent = getAgentByName(agentName)

  if (!registeredAgent) {
    try {
      const { tags } = parseNameForDisplay(agentName)
      registeredAgent = createAgent({
        name: agentName,
        label,
        avatar,
        program: program || 'claude-code',
        taskDescription: `Agent for ${agentName}`,
        tags,
        owner: os.userInfo().username,
        createSession: true,
        workingDirectory: cwd,
        programArgs: programArgs || '',
      })
      console.log(`[Sessions] Registered new agent: ${agentName} (${registeredAgent.id})`)
    } catch (createError) {
      console.warn(`[Sessions] Could not register agent ${agentName}:`, createError)
    }
  }

  // Persist session metadata (legacy)
  persistSession({
    id: actualSessionName,
    name: actualSessionName,
    workingDirectory: cwd,
    createdAt: new Date().toISOString(),
    ...(agentId && { agentId }),
    ...(registeredAgent && { agentId: registeredAgent.id })
  })

  // Initialize AMP
  const registeredAgentId = registeredAgent?.id
  try {
    await initAgentAMPHome(agentName, registeredAgentId)
    const ampDir = getAgentAMPDir(agentName, registeredAgentId)
    await runtime.setEnvironment(actualSessionName, 'AMP_DIR', ampDir)
    await runtime.setEnvironment(actualSessionName, 'AIM_AGENT_NAME', agentName)
    if (registeredAgentId) {
      await runtime.setEnvironment(actualSessionName, 'AIM_AGENT_ID', registeredAgentId)
    }
    await runtime.unsetEnvironment(actualSessionName, 'CLAUDECODE')
    const exportCmd = registeredAgentId
      ? `export AMP_DIR='${ampDir}' AIM_AGENT_NAME='${agentName}' AIM_AGENT_ID='${registeredAgentId}'; unset CLAUDECODE`
      : `export AMP_DIR='${ampDir}' AIM_AGENT_NAME='${agentName}'; unset CLAUDECODE`
    await runtime.sendKeys(actualSessionName, `"${exportCmd}"`, { enter: true })
    console.log(`[Sessions] Set AMP_DIR=${ampDir} for agent ${agentName}`)
  } catch (ampError) {
    console.warn(`[Sessions] Could not set up AMP for ${agentName}:`, ampError)
  }

  // Launch program
  const selectedProgram = (program || 'claude-code').toLowerCase()
  if (selectedProgram !== 'none' && selectedProgram !== 'terminal') {
    let startCommand = ''
    if (selectedProgram.includes('claude')) startCommand = 'claude'
    else if (selectedProgram.includes('codex')) startCommand = 'codex'
    else if (selectedProgram.includes('aider')) startCommand = 'aider'
    else if (selectedProgram.includes('cursor')) startCommand = 'cursor'
    else if (selectedProgram.includes('gemini')) startCommand = 'gemini'
    else if (selectedProgram.includes('opencode')) startCommand = 'opencode'
    else if (selectedProgram.includes('openclaw')) startCommand = 'openclaw'
    else startCommand = 'claude'

    if (programArgs && typeof programArgs === 'string') {
      const sanitized = programArgs.replace(/[^a-zA-Z0-9\s\-_.=/:,~@]/g, '').trim()
      if (sanitized) startCommand = `${startCommand} ${sanitized}`
    }

    await new Promise(resolve => setTimeout(resolve, 300))

    try {
      await runtime.sendKeys(actualSessionName, `"${startCommand}"`, { enter: true })
      console.log(`[Sessions] Launched program "${startCommand}" in session ${actualSessionName}`)
    } catch (progError) {
      console.warn(`[Sessions] Could not launch program in ${actualSessionName}:`, progError)
    }
  }

  return { data: { success: true, name: actualSessionName, agentId: registeredAgent?.id }, status: 200 }
}

/**
 * Delete a session (kill tmux + remove agent).
 */
export async function deleteSession(sessionName: string): Promise<ServiceResult<{ success: boolean; name: string; type?: string }>> {
  const agent = getAgentBySession(sessionName)
  const isCloudAgent = agent?.deployment?.type === 'cloud'

  if (isCloudAgent) {
    deleteAgentBySession(sessionName, true)
    return { data: { success: true, name: sessionName, type: 'cloud' }, status: 200 }
  }

  const runtime = getRuntime()
  const exists = await runtime.sessionExists(sessionName)
  if (!exists) {
    return { error: 'Session not found', status: 404 }
  }

  await runtime.killSession(sessionName)
  unpersistSession(sessionName)
  deleteAgentBySession(sessionName, true)

  return { data: { success: true, name: sessionName }, status: 200 }
}

/**
 * Rename a session (tmux + registry + cloud agent files).
 */
export async function renameSession(oldName: string, newName: string): Promise<ServiceResult<{ success: boolean; oldName: string; newName: string; type?: string }>> {
  if (!newName || typeof newName !== 'string') {
    return { error: 'New session name is required', status: 400 }
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(newName)) {
    return { error: 'Session name can only contain letters, numbers, dashes, and underscores', status: 400 }
  }

  // Check if cloud agent
  const agentsDir = path.join(os.homedir(), '.aimaestro', 'agents')
  const oldAgentFilePath = path.join(agentsDir, `${oldName}.json`)
  const newAgentFilePath = path.join(agentsDir, `${newName}.json`)
  const isCloudAgent = fs.existsSync(oldAgentFilePath)

  if (isCloudAgent) {
    if (fs.existsSync(newAgentFilePath)) {
      return { error: 'Agent name already exists', status: 409 }
    }
    const agentConfig = JSON.parse(fs.readFileSync(oldAgentFilePath, 'utf8'))
    agentConfig.id = newName
    agentConfig.name = newName
    agentConfig.alias = newName
    fs.writeFileSync(newAgentFilePath, JSON.stringify(agentConfig, null, 2), 'utf8')
    fs.unlinkSync(oldAgentFilePath)
    renameAgentSession(oldName, newName)
    return { data: { success: true, oldName, newName, type: 'cloud' }, status: 200 }
  }

  // Local tmux session
  const runtime = getRuntime()
  const oldExists = await runtime.sessionExists(oldName)
  if (!oldExists) {
    return { error: 'Session not found', status: 404 }
  }

  const newExists = await runtime.sessionExists(newName)
  if (newExists) {
    return { error: 'Session name already exists', status: 409 }
  }

  await runtime.renameSession(oldName, newName)
  renameAgentSession(oldName, newName)

  return { data: { success: true, oldName, newName }, status: 200 }
}

/**
 * Send a command to a tmux session.
 */
export async function sendCommand(
  sessionName: string,
  command: string,
  options: { requireIdle?: boolean; addNewline?: boolean } = {}
): Promise<ServiceResult<{ success: boolean; sessionName: string; commandSent?: string; method?: string; wasIdle?: boolean; idle?: boolean; timeSinceActivity?: number; idleThreshold?: number }>> {
  const requireIdle = options.requireIdle !== false
  const addNewline = options.addNewline !== false

  if (!command || typeof command !== 'string') {
    return { error: 'Command is required', status: 400 }
  }

  const runtime = getRuntime()
  const exists = await runtime.sessionExists(sessionName)
  if (!exists) {
    return { error: 'Tmux session not found', status: 404 }
  }

  if (requireIdle && !isSessionIdle(sessionName)) {
    const lastActivity = sessionActivity.get(sessionName)
    const timeSinceActivity = lastActivity ? Date.now() - lastActivity : 0
    return {
      data: { success: false, sessionName, idle: false, timeSinceActivity, idleThreshold: IDLE_THRESHOLD_MS },
      error: 'Session is not idle',
      status: 409
    }
  }

  await runtime.cancelCopyMode(sessionName)
  await runtime.sendKeys(sessionName, command, { literal: true, enter: addNewline })

  sessionActivity.set(sessionName, Date.now())

  return { data: { success: true, sessionName, commandSent: command, method: 'tmux-send-keys', wasIdle: true }, status: 200 }
}

/**
 * Check if a session is idle and ready for commands.
 */
export async function checkIdleStatus(sessionName: string): Promise<{
  sessionName: string
  exists: boolean
  idle: boolean
  lastActivity: number | null
  timeSinceActivity: number | null
  idleThreshold: number
}> {
  const runtime = getRuntime()
  const exists = await runtime.sessionExists(sessionName)
  if (!exists) {
    return { sessionName, exists: false, idle: false, lastActivity: null, timeSinceActivity: null, idleThreshold: IDLE_THRESHOLD_MS }
  }

  const lastActivity = sessionActivity.get(sessionName) || null
  const timeSinceActivity = lastActivity ? Date.now() - lastActivity : null
  const idle = isSessionIdle(sessionName)

  return { sessionName, exists: true, idle, lastActivity, timeSinceActivity, idleThreshold: IDLE_THRESHOLD_MS }
}

/**
 * List persisted sessions that can be restored.
 */
export async function listRestorableSessions(): Promise<{ sessions: any[]; count: number }> {
  const persistedSessions = loadPersistedSessions()
  const runtime = getRuntime()
  const discovered = await runtime.listSessions()
  const activeSessions = discovered.map(s => s.name)
  const restorableSessions = persistedSessions.filter(
    session => !activeSessions.includes(session.id)
  )
  return { sessions: restorableSessions, count: restorableSessions.length }
}

/**
 * Restore one or all persisted sessions.
 */
export async function restoreSessions(params: { sessionId?: string; all?: boolean }): Promise<ServiceResult<{ results: RestoreResult[]; summary: { restored: number; failed: number; alreadyExisted: number; total: number } }>> {
  const persistedSessions = loadPersistedSessions()
  const sessionsToRestore = params.all
    ? persistedSessions
    : persistedSessions.filter(s => s.id === params.sessionId)

  if (sessionsToRestore.length === 0) {
    return { error: 'No sessions to restore', status: 404 }
  }

  const runtime = getRuntime()
  const results: RestoreResult[] = []

  for (const session of sessionsToRestore) {
    try {
      const exists = await runtime.sessionExists(session.id)
      if (!exists) {
        await runtime.createSession(session.id, session.workingDirectory)
        results.push({ sessionId: session.id, status: 'restored' })
      } else {
        results.push({ sessionId: session.id, status: 'already_exists' })
      }
    } catch {
      results.push({ sessionId: session.id, status: 'failed' })
    }
  }

  return {
    data: {
      results,
      summary: {
        restored: results.filter(r => r.status === 'restored').length,
        failed: results.filter(r => r.status === 'failed').length,
        alreadyExisted: results.filter(r => r.status === 'already_exists').length,
        total: results.length
      }
    },
    status: 200
  }
}

/**
 * Delete a persisted session from storage.
 */
export function deletePersistedSession(sessionId: string): ServiceResult<{ success: boolean }> {
  if (!sessionId) {
    return { error: 'Session ID is required', status: 400 }
  }
  const success = unpersistSession(sessionId)
  if (!success) {
    return { error: 'Failed to delete session', status: 500 }
  }
  return { data: { success: true }, status: 200 }
}
