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
import { sessionActivity, agentActivity } from '@/services/shared-state'
import { getRuntime } from '@/lib/agent-runtime'
import {
  capturePaneFromContainer,
  inspectContainerStatus,
  removeContainer,
  sendKeysToContainer,
  startContainer,
  stopContainer,
  tmuxHasSessionInContainer,
} from '@/lib/container-utils'
import type { Host } from '@/types/host'
import { type ServiceResult, missingField, notFound, invalidField, invalidRequest, operationFailed, gone, timeout } from '@/services/service-errors'

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
  [key: string]: any // Allow additional fields for cloud config
}

export interface WakeAgentParams {
  startProgram?: boolean
  sessionIndex?: number
  program?: string
  projectDirectory?: string  // Runtime: where the agent works (Lane 2)
  /**
   * Opt-in: for cloud (containerized) agents, allow falling back to a host-native
   * tmux wake when the container is unavailable (missing / docker daemon down).
   * Default false — sandboxing is preserved by failing loudly. See swickson/ai-maestro#6.
   */
  allowHostFallback?: boolean
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

/** Sanitize shell arguments: only allow safe CLI flag characters */
function sanitizeArgs(args: string): string {
  return args.replace(/[^a-zA-Z0-9\s\-_.=/:,~@]/g, '').trim()
}

/** Resolve program name to CLI command */
function resolveStartCommand(program: string): string {
  if (program.includes('claude') || program.includes('claude code')) {
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
  }
  return 'claude' // Default
}

/**
 * Wait until the CLI program in a tmux session is ready to accept input.
 * Polls capturePane looking for a prompt indicator (>, ❯, $, %).
 * Returns true if a prompt was detected, false on timeout.
 */
async function waitForPrompt(
  sessionName: string,
  runtime: any,
  { timeoutMs = 30000, pollIntervalMs = 500, initialDelayMs = 2000 } = {}
): Promise<boolean> {
  // Give the program time to start before polling
  await new Promise(resolve => setTimeout(resolve, initialDelayMs))

  const deadline = Date.now() + timeoutMs
  // Prompt indicators for various CLIs:
  // Claude: ">", Codex: ">", Gemini: "❯", Aider: ">", Shell: "$" or "%"
  // Also match "? for shortcuts" (Claude) and "shortcuts" (end of TUI init)
  const promptPattern = /[>❯$%]\s*$/m
  const tuiReadyPattern = /\?\s*for\s*shortcuts|waiting for input|ready/i

  while (Date.now() < deadline) {
    try {
      const paneContent = await runtime.capturePane(sessionName, 50)
      // Strip non-printable/TUI control characters that CLIs emit
      // (box-drawing, cursor positioning, etc.)
      const cleaned = paneContent.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, '')
        .replace(/\u2500[\u2500-\u257F]*/g, '') // box-drawing sequences
      const lines = cleaned.split('\n').filter((l: string) => l.trim().length > 0)
      const tail = lines.slice(-5).join('\n')
      if (promptPattern.test(tail) || tuiReadyPattern.test(tail)) {
        console.log(`[Hook] Prompt detected in ${sessionName}, tail: ${tail.slice(-80)}`)
        return true
      }
    } catch {
      // capturePane failed, keep trying
    }
    await new Promise(resolve => setTimeout(resolve, pollIntervalMs))
  }

  console.warn(`[Hook] Prompt not detected in ${sessionName} after ${timeoutMs}ms, proceeding anyway`)
  return false
}

/**
 * Short mesh-awareness primer prepended to prompt-type on-wake hooks.
 *
 * Universal (provider-agnostic): works for Claude (with or without the
 * agent-messaging skill installed), Gemini, and Codex. Uses a self-
 * dereferencing design — the primer is short, and points at amp-primer
 * as the escape hatch for full protocol detail.
 *
 * Opt-out per-agent via Agent.meshAware === false.
 *
 * NOTE: No ${variable} interpolation is applied to MESH_PRIMER. The hook
 * variables (${projectDirectory}, ${agentName}) are interpolated only on
 * the user's hook string in executeHook. If you need dynamic values in
 * the primer in the future, run the interpolation loop over finalPrompt
 * instead of resolved.
 *
 * Command syntax here MUST match the real amp-* CLI surface in
 * plugins/ai-maestro/scripts/amp-*.sh — if you edit this string, re-run
 * `amp-send --help` (or equivalent) to verify the flags and values stay
 * in sync. The test suite contains a regex smoke check as a safety net.
 */
export const MESH_PRIMER = [
  'You are running as part of an AI Maestro agent mesh. Other agents in the mesh can send you messages and you can send messages to them.',
  'To send a message: use your agent-messaging skill if available, otherwise invoke amp-send <recipient> "<subject>" "<body>" [--priority low|normal|high|urgent] [--type request|response|notification|task|status]. Quote multi-word subjects and bodies so the shell does not split them into separate positional args.',
  'For the full mesh protocol, command reference, and peer list, run: amp-primer (available in your PATH alongside the other amp-* commands).',
].join(' ')

/**
 * Load mesh-awareness primer content for an agent.
 * Returns empty string if the agent has opted out via meshAware === false.
 * Defaults to enabled (returns the primer) when meshAware is unset.
 *
 * Exported for direct unit testing; the wake flow calls it internally.
 */
export function loadMeshPrimer(agent: Agent): string {
  if (agent.meshAware === false) return ''
  return MESH_PRIMER
}

/**
 * Execute a lifecycle hook, interpolating runtime variables.
 * Supports "prompt:..." (typed into agent stdin) or shell commands.
 * Waits for the CLI prompt to be ready before sending input.
 *
 * If meshPrimer is provided, it is prepended to prompt-type hooks so the
 * agent gains mesh awareness on wake. Shell-command hooks are unaffected.
 */
async function executeHook(
  sessionName: string,
  hookValue: string,
  runtime: any,
  variables: Record<string, string> = {},
  meshPrimer: string = '',
): Promise<void> {
  // Interpolate variables: ${projectDirectory}, ${agentName}, etc.
  let resolved = hookValue
  for (const [key, value] of Object.entries(variables)) {
    resolved = resolved.replaceAll(`\${${key}}`, value)
  }

  // Wait for the CLI to be ready instead of a fixed delay
  await waitForPrompt(sessionName, runtime)

  if (resolved.startsWith('prompt:')) {
    const userPrompt = resolved.slice('prompt:'.length).trim()
    const finalPrompt = meshPrimer ? `${meshPrimer}\n\n${userPrompt}` : userPrompt
    await runtime.sendKeys(sessionName, finalPrompt, { literal: true, enter: true })
  } else {
    const sanitized = sanitizeArgs(resolved)
    if (sanitized) {
      await runtime.sendKeys(sessionName, `"${sanitized}"`, { enter: true })
    }
  }
}

/**
 * Poll until the in-container tmux server has the named session ready, or
 * give up. agent-server.js inside the container creates the session within
 * ~1s of `docker start`; 5s ceiling leaves headroom without slowing the
 * happy-path wake. Returns true if the session appeared.
 */
async function waitForContainerTmux(
  containerName: string,
  sessionName: string,
  { timeoutMs = 5000, pollIntervalMs = 250 } = {}
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await tmuxHasSessionInContainer(containerName, sessionName)) return true
    await new Promise(resolve => setTimeout(resolve, pollIntervalMs))
  }
  return false
}

// PR #87 chowns ~/.claude on every container recreate, so claude/gemini hit
// first-launch modals on every fresh wake — the Trust-folder dialog AND the
// theme picker (no theme set in the per-container settings.json today). The
// default waitForPrompt regexes ignore both; without auto-dismiss the on-wake
// hook gets typed into the menu where the first character can fire a
// destructive choice.
//
// Auto-dismiss strategy: press Enter, which selects the highlighted default —
// option 1 "Trust folder (workspace)" for Trust, option 2 "Dark mode" for
// theme picker. Both safe for a sandboxed cloud agent confined to its
// workspace mount. Suppressing these modals at provision-time is the right
// long-term fix (kanban to file post-merge).
export const FIRST_RUN_MODAL_PATTERN = /Trust folder|Trust this folder|Don'?t trust|Trust parent folder|Choose the text style|theme that looks best|Auto \(match terminal\)/i

/**
 * In-container variant of waitForPrompt: polls capturePaneFromContainer,
 * matches the same prompt indicators as the host path, AND auto-dismisses
 * the first-launch Trust-folder modal by selecting option 1 ("Trust this
 * folder"). Workspace-only opt-in mount makes option 1 the safe answer for
 * a sandboxed cloud agent.
 *
 * initialDelayMs covers the race between agent-server.js creating the tmux
 * session and issuing the AI_TOOL send-keys — without it the poll catches
 * the empty bash `$` prompt and returns prematurely, sending the hook into
 * a shell instead of the AI program.
 */
async function waitForPromptInContainer(
  containerName: string,
  sessionName: string,
  { timeoutMs = 30000, pollIntervalMs = 500, initialDelayMs = 2000 } = {}
): Promise<boolean> {
  await new Promise(resolve => setTimeout(resolve, initialDelayMs))
  const deadline = Date.now() + timeoutMs
  const promptPattern = /[>❯$%]\s*$/m
  const tuiReadyPattern = /\?\s*for\s*shortcuts|waiting for input|ready/i
  let modalDismissCount = 0

  while (Date.now() < deadline) {
    const paneContent = await capturePaneFromContainer(containerName, sessionName, 50)
    const cleaned = paneContent.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, '')
      .replace(/─[─-╿]*/g, '')
    const lines = cleaned.split('\n').filter((l: string) => l.trim().length > 0)
    const tail = lines.slice(-15).join('\n')

    // Cap dismisses at 3 — one per modal claude could plausibly stack
    // (theme + trust + future). Beyond that something is wrong; bail.
    if (modalDismissCount < 3 && FIRST_RUN_MODAL_PATTERN.test(tail)) {
      console.log(`[Wake/Cloud] First-run modal detected in ${containerName} (dismiss #${modalDismissCount + 1}), pressing Enter to accept default`)
      try {
        await sendKeysToContainer(containerName, sessionName, '', { literal: false, enter: true })
        modalDismissCount += 1
      } catch (err) {
        console.warn(`[Wake/Cloud] Modal auto-dismiss failed:`, err)
      }
      await new Promise(resolve => setTimeout(resolve, pollIntervalMs))
      continue
    }

    if (promptPattern.test(tail) || tuiReadyPattern.test(tail)) {
      console.log(`[Wake/Cloud] Prompt detected in ${containerName}/${sessionName}`)
      return true
    }
    await new Promise(resolve => setTimeout(resolve, pollIntervalMs))
  }

  console.warn(
    `[Wake/Cloud] Prompt not detected in ${containerName}/${sessionName} after ${timeoutMs}ms ` +
    `(modalDismissCount=${modalDismissCount}). Proceeding to dispatch hook anyway. ` +
    `If this is a codex container, the hook may be lost — codex first-launch shows a non-Trust ` +
    `auth picker that this handler does not dismiss; see PR #90 known-issue.`
  )
  return false
}

/**
 * Cloud-branch counterpart of executeHook. Mirrors the host path's variable
 * interpolation + meshPrimer prepend, but dispatches via sendKeysToContainer
 * against the in-container tmux session instead of host runtime.sendKeys.
 *
 * Kept as a separate function (not a refactor of executeHook) per Watson's
 * §E review: smaller blast radius for this PR. Post-merge follow-up tracked
 * to unify both behind a single primitive.
 */
async function executeHookInContainer(
  containerName: string,
  sessionName: string,
  hookValue: string,
  variables: Record<string, string> = {},
  meshPrimer: string = '',
): Promise<void> {
  let resolved = hookValue
  for (const [key, value] of Object.entries(variables)) {
    resolved = resolved.replaceAll(`\${${key}}`, value)
  }

  await waitForPromptInContainer(containerName, sessionName)

  if (resolved.startsWith('prompt:')) {
    const userPrompt = resolved.slice('prompt:'.length).trim()
    const finalPrompt = meshPrimer ? `${meshPrimer}\n\n${userPrompt}` : userPrompt
    await sendKeysToContainer(containerName, sessionName, finalPrompt, { literal: true, enter: true })
  } else {
    const sanitized = sanitizeArgs(resolved)
    if (sanitized) {
      await sendKeysToContainer(containerName, sessionName, sanitized, { literal: true, enter: true })
    }
  }
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
    preferences: {
      defaultWorkingDirectory: session.workingDirectory || process.cwd(),
    },
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

    // 1. Load all registered agents from this host's registry
    // Filter out soft-deleted agents (those with deletedAt timestamp)
    const allAgents = loadAgents()
    const agents = allAgents.filter(a => !a.deletedAt)

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
      const agentName = agent.name || agent.alias
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

      // Check for standalone agent heartbeat (agents without tmux sessions)
      const heartbeatTs = agentActivity.get(agent.id)
      const heartbeatAge = heartbeatTs ? (Date.now() - heartbeatTs) / 1000 : Infinity
      const hasRecentHeartbeat = heartbeatAge < 120 // 2 minutes
      const isOnline = hasOnlineSession || hasRecentHeartbeat
      // Standalone = no tmux sessions discovered AND not a cloud agent
      const isStandalone = agentSessions.length === 0 && agent.deployment?.type !== 'cloud'

      // Create session status for API response (backward compatibility)
      const onlineSession = updatedSessions.find(s => s.status === 'online')
      const primarySession = updatedSessions.find(s => s.index === 0) || updatedSessions[0]
      const onlineDiscoveredSession = onlineSession
        ? agentSessions.find(s => parseSessionName(s.name).index === onlineSession.index)
        : undefined

      const sessionStatus: AgentSessionStatus = onlineSession
        ? {
            status: 'online',
            tmuxSessionName: onlineDiscoveredSession?.name || computeSessionName(agentName, onlineSession.index),
            workingDirectory: onlineSession.workingDirectory,
            lastActivity: onlineSession.lastActive,
            hostId,
            hostName,
          }
        : hasRecentHeartbeat
        ? {
            status: 'online',
            workingDirectory: agent.workingDirectory || primarySession?.workingDirectory,
            lastActivity: new Date(heartbeatTs!).toISOString(),
            hostId,
            hostName,
            standalone: true,
          }
        : {
            status: 'offline',
            workingDirectory: agent.workingDirectory || primarySession?.workingDirectory,
            hostId,
            hostName,
            ...(isStandalone && { standalone: true }),
          }

      const updatedAgent: Agent = {
        ...agent,
        name: agentName,
        sessions: updatedSessions,
        status: isOnline ? 'active' : 'offline',
        lastActive: isOnline ? new Date().toISOString() : agent.lastActive,
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

        const sessionStatus: AgentSessionStatus = {
          status: 'online',
          tmuxSessionName: primarySession.name,
          workingDirectory: primarySession.workingDirectory,
          lastActivity: primarySession.lastActivity,
          windows: primarySession.windows,
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
    return operationFailed('fetch agents', (error as Error).message)
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

export function createNewAgent(body: CreateAgentRequest): ServiceResult<{ agent: Agent }> {
  try {
    const agent = createAgent(body)
    return { data: { agent }, status: 201 }
  } catch (error) {
    console.error('Failed to create agent:', error)
    return invalidRequest((error as Error).message || 'Failed to create agent')
  }
}

// ---------------------------------------------------------------------------
// GET /api/agents/[id] -- get agent by ID
// ---------------------------------------------------------------------------

export function getAgentById(id: string): ServiceResult<{ agent: Agent }> {
  try {
    const agent = getAgent(id)
    if (!agent) {
      return notFound('Agent', id)
    }
    return { data: { agent }, status: 200 }
  } catch (error) {
    console.error('Failed to get agent:', error)
    return operationFailed('get agent', (error as Error).message)
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/agents/[id] -- update agent
// ---------------------------------------------------------------------------

export function updateAgentById(id: string, body: UpdateAgentRequest): ServiceResult<{ agent: Agent }> {
  try {
    // Check if agent exists and is not soft-deleted
    const existing = getAgent(id, true) // include deleted to distinguish 404 vs 410
    if (!existing) {
      return notFound('Agent', id)
    }
    if (existing.deletedAt) {
      return gone('Agent')
    }

    const agent = updateAgent(id, body)
    if (!agent) {
      return notFound('Agent', id)
    }

    return { data: { agent }, status: 200 }
  } catch (error) {
    console.error('Failed to update agent:', error)
    return invalidRequest((error as Error).message || 'Failed to update agent')
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/agents/[id] -- delete agent (soft or hard)
// ---------------------------------------------------------------------------

export async function deleteAgentById(id: string, hard: boolean): Promise<ServiceResult<{ success: boolean; hard: boolean }>> {
  try {
    const agent = getAgent(id, true) // include deleted to distinguish 404 vs 410
    if (!agent) {
      return notFound('Agent', id)
    }
    if (agent.deletedAt && !hard) {
      return gone('Agent')
    }

    // ─── Cloud (containerized) agents: tear down the docker container ────────
    // Fixes issue #84 — without this, hard-delete clears the registry + AMP
    // keystore but leaves `aim-<name>` running, which both leaks resources and
    // blocks recreate-with-same-name (the `aim-<name>` slot stays occupied).
    // Mirrors hibernateAgent's cloud branch shape (line ~1804); soft-delete is
    // intentionally skipped — it's recoverable, and nuking the container would
    // defeat that.
    if (hard && agent.deployment?.type === 'cloud' && agent.deployment.cloud?.provider === 'local-container') {
      const containerName = agent.deployment.cloud.containerName
      if (containerName) {
        const status = await inspectContainerStatus(containerName)
        if (status === 'running' || status === 'paused') {
          await stopContainer(containerName).catch(err =>
            console.warn(`[Delete] stop ${containerName} failed: ${(err as Error).message}`)
          )
        }
        // Skip rm when container doesn't exist or daemon is unreachable. Other
        // states ('stopped', 'created') still need rm to free the name slot for
        // recreate-with-same-name. Failures are non-fatal so registry/keystore
        // cleanup proceeds — the operator already chose to nuke the agent.
        if (status !== 'missing' && status !== 'docker_down') {
          await removeContainer(containerName).catch(err =>
            console.warn(`[Delete] rm ${containerName} failed: ${(err as Error).message}`)
          )
        }
      }
    }

    const success = deleteAgent(id, hard)
    if (!success) {
      return notFound('Agent', id)
    }

    return { data: { success: true, hard }, status: 200 }
  } catch (error) {
    console.error('Failed to delete agent:', error)
    return operationFailed('delete agent', (error as Error).message)
  }
}

// ---------------------------------------------------------------------------
// POST /api/agents/register -- register agent from session or cloud
// ---------------------------------------------------------------------------

export function registerAgent(body: RegisterAgentParams): ServiceResult<{
  success: boolean
  message: string
  agentId: string
  agent: any
  registryAgent: { id: string; name: string } | null
}> {
  try {
    let agentId: string
    let agentConfig: any
    let registryAgent: Agent | null = null

    if (body.sessionName && !body.id) {
      // WorkTree format - create agent from session name
      const { sessionName, workingDirectory } = body

      if (!sessionName) {
        return missingField('sessionName')
      }

      agentId = sessionName.replace(/[^a-zA-Z0-9_-]/g, '-')

      agentConfig = {
        id: agentId,
        sessionName,
        workingDirectory: workingDirectory || process.cwd(),
        createdAt: Date.now(),
      }

      // Check if agent already exists in registry by session name
      const existingAgent = getAgentBySession(sessionName)
      if (existingAgent) {
        linkSession(existingAgent.id, sessionName, workingDirectory || process.cwd())
        registryAgent = existingAgent
      } else {
        const parts = sessionName.split('-')
        const shortName = parts[parts.length - 1] || sessionName
        const tags = parts.slice(0, -1).map((t: string) => t.toLowerCase())

        try {
          registryAgent = createAgent({
            name: sessionName,
            label: shortName !== sessionName ? shortName : undefined,
            program: 'claude-code',
            model: 'claude-sonnet-4-5',
            taskDescription: `Agent for ${sessionName}`,
            tags,
            owner: os.userInfo().username,
            createSession: true,
            workingDirectory: workingDirectory || process.cwd()
          })
        } catch (createError) {
          console.warn(`[Register] Could not create registry entry for ${sessionName}:`, createError)
        }
      }
    } else {
      // Full agent config format (cloud agents)
      if (!body.id || !body.deployment?.cloud?.websocketUrl) {
        return missingField('id and websocketUrl')
      }

      agentId = body.id
      agentConfig = body
    }

    // Ensure agents directory exists
    const agentsDir = path.join(os.homedir(), '.aimaestro', 'agents')
    if (!fs.existsSync(agentsDir)) {
      fs.mkdirSync(agentsDir, { recursive: true })
    }

    // Save agent configuration to individual file
    const agentFilePath = path.join(agentsDir, `${agentId}.json`)
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
    return operationFailed('register agent', (error as Error).message)
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
    return operationFailed('lookup agent', error instanceof Error ? error.message : 'Internal server error')
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
        id: selfHost.id,
        name: selfHost.name,
        url: selfHost.url,
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
      return notFound('Agent', agentId)
    }

    const sessionName = agent.name || agent.alias
    if (!sessionName) {
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
    return operationFailed('get session status', (error as Error).message)
  }
}

// ---------------------------------------------------------------------------
// POST /api/agents/[id]/session -- link session to agent
// ---------------------------------------------------------------------------

export function linkAgentSession(agentId: string, params: LinkSessionParams): ServiceResult<{ success: boolean }> {
  try {
    const { sessionName, workingDirectory } = params

    if (!sessionName) {
      return missingField('sessionName')
    }

    const success = linkSession(agentId, sessionName, workingDirectory || process.cwd())
    if (!success) {
      return notFound('Agent', agentId)
    }

    return { data: { success: true }, status: 200 }
  } catch (error) {
    console.error('Failed to link session:', error)
    return invalidRequest((error as Error).message || 'Failed to link session')
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
      return missingField('command')
    }

    const agent = getAgent(agentId)
    if (!agent) {
      return notFound('Agent', agentId)
    }

    const sessionName = agent.name || agent.alias
    if (!sessionName) {
      return invalidField('name', 'Agent has no name configured')
    }

    const runtime = getRuntime()
    const exists = await runtime.sessionExists(sessionName)
    if (!exists) {
      return notFound('Tmux session', sessionName)
    }

    if (requireIdle && !isSessionIdle(sessionName)) {
      const lastActivity = sessionActivity.get(sessionName)
      const timeSinceActivity = lastActivity ? Date.now() - lastActivity : 0
      return {
        data: {
          success: false,
          idle: false,
          timeSinceActivity,
          idleThreshold: IDLE_THRESHOLD_MS,
        },
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
    return operationFailed('send session command', (error as Error).message)
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
    const { kill: killSession = false, deleteAgent: shouldDeleteAgent = false } = params

    const agent = getAgent(agentId)
    if (!agent) {
      return notFound('Agent', agentId)
    }

    const runtime = getRuntime()
    const sessionName = agent.name || agent.alias

    if (shouldDeleteAgent) {
      // Kill tmux session if requested and exists
      if (sessionName && killSession) {
        const exists = await runtime.sessionExists(sessionName)
        if (exists) {
          await runtime.killSession(sessionName)
          unpersistSession(sessionName)
        }
      }

      // Hard delete with backup
      const success = deleteAgent(agentId, true)
      if (!success) {
        return operationFailed('delete agent')
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
    if (sessionName && killSession) {
      const exists = await runtime.sessionExists(sessionName)
      if (exists) {
        await runtime.killSession(sessionName)
        unpersistSession(sessionName)
      }
    }

    const success = unlinkSession(agentId)
    if (!success) {
      return notFound('Agent', agentId)
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
    return operationFailed('unlink session', (error as Error).message)
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
  projectDirectory?: string
  hooksExecuted?: boolean
  woken: boolean
  alreadyRunning?: boolean
  programStarted?: boolean
  message: string
}>> {
  try {
    const { startProgram = true, sessionIndex = 0, program: programOverride } = params

    // Check including soft-deleted to give a better error message (410 Gone vs 404)
    const agent = getAgent(agentId, true)
    if (!agent) {
      return notFound('Agent', agentId)
    }
    if (agent.deletedAt) {
      return gone('Agent')
    }

    const agentName = agent.name || agent.alias
    if (!agentName) {
      return invalidField('name', 'Agent has no name configured')
    }

    const workingDirectory = agent.workingDirectory ||
                            agent.preferences?.defaultWorkingDirectory ||
                            process.cwd()

    const sessionName = computeSessionName(agentName, sessionIndex)

    // ─── Cloud (containerized) agents: dispatch to docker before host tmux ───
    // Fixes swickson/ai-maestro#6 — without this branch, wakeAgent silently runs
    // every cloud agent on the host via tmux, bypassing the container sandbox.
    if (agent.deployment?.type === 'cloud' && agent.deployment.cloud?.provider === 'local-container') {
      const containerName = agent.deployment.cloud.containerName
      if (!containerName) {
        return invalidField('deployment.cloud.containerName', 'Cloud agent has no containerName configured')
      }

      const status = await inspectContainerStatus(containerName)

      if (status === 'running' || status === 'paused') {
        console.log(`[Wake] Agent ${agentName} (${agentId}) — running in CONTAINER ${containerName} (already ${status})`)
        updateAgentSessionInRegistry(agentId, sessionIndex, 'online', workingDirectory)
        return {
          data: {
            success: true,
            agentId,
            name: agentName,
            sessionName,
            sessionIndex,
            workingDirectory,
            woken: true,
            alreadyRunning: true,
            message: `Agent "${agentName}" container ${containerName} is already running`,
          },
          status: 200,
        }
      }

      if (status === 'stopped' || status === 'created') {
        try {
          await startContainer(containerName)
          console.log(`[Wake] Agent ${agentName} (${agentId}) — running in CONTAINER ${containerName} (started)`)
          updateAgentSessionInRegistry(agentId, sessionIndex, 'online', workingDirectory, true)

          // Dispatch on-wake hook into the in-container tmux session. agent-server.js
          // re-launches AI_TOOL from baked env on every container start; we only
          // need to push the hook prompt (program is restored by the container's
          // own boot path). Non-blocking + non-fatal — wake reports success even
          // if the hook can't be delivered, matching the host path's lifecycle.
          if (agent.hooks?.['on-wake']) {
            const { projectDirectory } = params
            const hookVars: Record<string, string> = {
              projectDirectory: projectDirectory || workingDirectory,
              agentName: agentName,
            }
            const meshPrimer = loadMeshPrimer(agent)
            ;(async () => {
              const tmuxReady = await waitForContainerTmux(containerName, sessionName)
              if (!tmuxReady) {
                console.warn(`[Wake/Cloud] tmux session ${sessionName} not ready in ${containerName} after timeout — skipping on-wake hook`)
                return
              }
              await executeHookInContainer(containerName, sessionName, agent.hooks!['on-wake']!, hookVars, meshPrimer)
            })().catch(err => console.warn(`[Wake/Cloud] on-wake hook failed for ${agentName}:`, err))
          }

          return {
            data: {
              success: true,
              agentId,
              name: agentName,
              sessionName,
              sessionIndex,
              workingDirectory,
              woken: true,
              programStarted: true,
              hooksExecuted: !!agent.hooks?.['on-wake'],
              message: `Agent "${agentName}" container ${containerName} has been started`,
            },
            status: 200,
          }
        } catch (err) {
          console.error(`[Wake] Failed to start container ${containerName}:`, err)
          if (!params.allowHostFallback) {
            return operationFailed(
              `start container ${containerName}`,
              `${(err as Error).message}. Refusing host-native fallback (would lose sandboxing). Pass allowHostFallback=true to override.`
            )
          }
          console.warn(`[Wake] Falling back to HOST tmux for ${agentName} — sandboxing LOST (allowHostFallback=true)`)
          // fall through to existing host tmux path
        }
      } else {
        // status === 'missing' or 'docker_down'
        if (!params.allowHostFallback) {
          const reason = status === 'missing'
            ? `container ${containerName} does not exist`
            : 'docker daemon is unreachable'
          return invalidRequest(
            `Agent "${agentName}" is configured as a sandboxed cloud agent but ${reason}. ` +
            `Refusing host-native fallback (would lose sandboxing). ` +
            `Pass allowHostFallback=true to override, or recreate the container. See swickson/ai-maestro#6.`
          )
        }
        console.warn(`[Wake] Container ${containerName} ${status}, falling back to HOST tmux for ${agentName} — sandboxing LOST (allowHostFallback=true)`)
        // fall through to existing host tmux path
      }
    }

    const runtime = getRuntime()

    // Check if session already exists
    const exists = await runtime.sessionExists(sessionName)
    if (exists) {
      console.log(`[Wake] Agent ${agentName} (${agentId}) — running on HOST tmux session ${sessionName} (already running)`)
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
      console.log(`[Wake] Agent ${agentName} (${agentId}) — running on HOST tmux session ${sessionName} (created)`)
    } catch (error) {
      console.error(`[Wake] Failed to create tmux session:`, error)
      return operationFailed('create tmux session', (error as Error).message)
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
        try {
          await runtime.sendKeys(sessionName, `"export AMP_DIR='${ampDir}' AIM_AGENT_NAME='${agentName}' AIM_AGENT_ID='${agentId}'; unset CLAUDECODE"`, { enter: true })
        } catch { /* non-fatal */ }
        console.log(`[Wake] Terminal only mode - no AI program started`)
      } else {
        let startCommand = resolveStartCommand(program)

        // Build full command with programArgs and model
        let fullCommand = startCommand
        if (agent.programArgs) {
          const args = sanitizeArgs(agent.programArgs)
          if (args) {
            fullCommand = `${startCommand} ${args}`
          }
        }
        if (agent.model) {
          fullCommand = `${fullCommand} --model ${agent.model}`
        }

        // Small delay to let the session initialize
        await new Promise(resolve => setTimeout(resolve, 300))

        // Single send-keys: export env vars, unset CLAUDECODE, then launch program
        try {
          const envExport = ampDir
            ? `export AMP_DIR='${ampDir}' AIM_AGENT_NAME='${agentName}' AIM_AGENT_ID='${agentId}'; `
            : ''
          await runtime.sendKeys(sessionName, `"${envExport}unset CLAUDECODE; ${fullCommand}"`, { enter: true })
        } catch (error) {
          console.error(`[Wake] Failed to start program:`, error)
        }
      }
    }

    // Update agent status in registry
    updateAgentSessionInRegistry(agentId, sessionIndex, 'online', workingDirectory, true)

    console.log(`[Wake] Agent ${agentName} (${agentId}) session ${sessionIndex} woken up successfully`)

    // Execute on-wake hook AFTER program is running (non-blocking, non-fatal)
    const { projectDirectory } = params
    if (agent.hooks?.['on-wake']) {
      const hookVars: Record<string, string> = {
        projectDirectory: projectDirectory || workingDirectory,
        agentName: agentName,
      }
      const meshPrimer = loadMeshPrimer(agent)
      executeHook(sessionName, agent.hooks['on-wake'], runtime, hookVars, meshPrimer)
        .catch(err => console.warn(`[Wake] on-wake hook failed for ${agentName}:`, err))
    }

    return {
      data: {
        success: true,
        agentId,
        name: agentName,
        sessionName,
        sessionIndex,
        workingDirectory,
        projectDirectory,
        hooksExecuted: !!agent.hooks?.['on-wake'],
        woken: true,
        programStarted: startProgram,
        message: `Agent "${agentName}" session ${sessionIndex} has been woken up and is ready to use.`,
      },
      status: 200,
    }
  } catch (error) {
    console.error('[Wake] Error:', error)
    return operationFailed('wake agent', (error as Error).message)
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
      return notFound('Agent', agentId)
    }

    const agentName = agent.name || agent.alias
    if (!agentName) {
      return invalidField('name', 'Agent has no name configured')
    }

    const runtime = getRuntime()
    const sessionName = computeSessionName(agentName, sessionIndex)

    // ─── Cloud (containerized) agents: stop the docker container ─────────────
    // Mirrors wakeAgent's cloud branch (line ~1413). Without this, hibernate of
    // a cloud agent falls into the host-tmux check below — that runtime call
    // returns false (the agent's tmux lives inside its container, not on the
    // host) and the function takes the early-return at "Session was already
    // terminated", marking the agent offline while the container stays up.
    if (agent.deployment?.type === 'cloud' && agent.deployment.cloud?.provider === 'local-container') {
      const containerName = agent.deployment.cloud.containerName
      if (!containerName) {
        return invalidField('deployment.cloud.containerName', 'Cloud agent has no containerName configured')
      }

      const status = await inspectContainerStatus(containerName)

      // 'created' = docker-created but never started, semantically already-not-running
      // (and `docker stop` on it is a no-op-or-error depending on docker version).
      // Mirrors wake's bundling (which groups stopped+created → start) inversely.
      if (status === 'stopped' || status === 'missing' || status === 'created') {
        updateAgentSessionInRegistry(agentId, sessionIndex, 'offline')
        agentActivity.delete(agentId)
        const message = status === 'missing'
          ? `Agent "${agentName}" container ${containerName} does not exist; registry updated`
          : status === 'created'
          ? `Agent "${agentName}" container ${containerName} was created but never started; registry updated`
          : `Agent "${agentName}" container ${containerName} was already stopped; registry updated`
        return {
          data: { success: true, agentId, name: agentName, sessionName, sessionIndex, hibernated: true, message },
          status: 200,
        }
      }

      if (status === 'docker_down') {
        return operationFailed(
          `inspect container ${containerName}`,
          'Docker daemon unreachable; cannot hibernate cloud agent'
        )
      }

      // status is 'running' or 'paused' — stop it
      try {
        await stopContainer(containerName)
        console.log(`[Hibernate] Agent ${agentName} (${agentId}) — stopped CONTAINER ${containerName}`)
        updateAgentSessionInRegistry(agentId, sessionIndex, 'offline')
        agentActivity.delete(agentId)
        return {
          data: {
            success: true,
            agentId,
            name: agentName,
            sessionName,
            sessionIndex,
            hibernated: true,
            message: `Agent "${agentName}" container ${containerName} has been stopped`,
          },
          status: 200,
        }
      } catch (err) {
        console.error(`[Hibernate] Failed to stop container ${containerName}:`, err)
        return operationFailed(`stop container ${containerName}`, (err as Error).message)
      }
    }

    // Check if session exists
    const exists = await runtime.sessionExists(sessionName)
    if (!exists) {
      // Session doesn't exist, just update the status
      updateAgentSessionInRegistry(agentId, sessionIndex, 'offline')
      agentActivity.delete(agentId)

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

    // Update agent status in registry
    updateAgentSessionInRegistry(agentId, sessionIndex, 'offline')

    // Clear the in-memory heartbeat so /api/agents stops counting this agent
    // as online via hasRecentHeartbeat (line ~597). Without this, the UI keeps
    // the hibernate button instead of flipping to wake for up to 120s while
    // the stale timestamp ages out — symptom Shane saw on cloud agents but
    // the host/tmux path has the same shape so we clear it here too.
    agentActivity.delete(agentId)

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
    return operationFailed('hibernate agent', (error as Error).message)
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
    return operationFailed('initialize startup', (error as Error).message)
  }
}

// ---------------------------------------------------------------------------
// GET /api/agents/startup -- get startup status
// ---------------------------------------------------------------------------

export function getStartupInfo(): ServiceResult<any> {
  try {
    const status = getStartupStatus()
    return { data: { success: true, ...status }, status: 200 }
  } catch (error) {
    console.error('[Startup] Error:', error)
    return operationFailed('get startup info', (error as Error).message)
  }
}

// ---------------------------------------------------------------------------
// POST /api/agents/health -- proxy health check
// ---------------------------------------------------------------------------

export async function proxyHealthCheck(url: string): Promise<ServiceResult<any>> {
  try {
    if (!url || typeof url !== 'string') {
      return missingField('url')
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000)

    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' },
    })
    clearTimeout(timeoutId)

    if (!response.ok) {
      return operationFailed('health check', `Agent returned HTTP ${response.status}`)
    }

    const data = await response.json()
    return { data, status: 200 }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return timeout('Timeout connecting to agent')
    }
    return operationFailed('connect to agent', (error as Error).message)
  }
}
