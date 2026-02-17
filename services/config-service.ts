/**
 * Config Service
 *
 * Pure business logic extracted from miscellaneous config/system routes.
 * No HTTP concepts (Request, Response, NextResponse, headers) leak into this module.
 * API routes become thin wrappers that call these functions.
 *
 * Covers:
 *   GET    /api/config                            -> getSystemConfig
 *   GET    /api/organization                      -> getOrganization
 *   POST   /api/organization                      -> setOrganizationName
 *   GET    /api/subconscious                      -> getSubconsciousStatus
 *   GET    /api/debug/pty                         -> getPtyDebugInfo
 *   GET    /api/docker/info                       -> getDockerInfo
 *   POST   /api/conversations/parse               -> parseConversationFile
 *   GET    /api/conversations/[file]/messages      -> getConversationMessages
 *   GET    /api/export/jobs/[jobId]               -> getExportJobStatus
 *   DELETE /api/export/jobs/[jobId]               -> deleteExportJob
 */

import os from 'os'
import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import { exec } from 'child_process'
import { promisify } from 'util'
import { discoverAgentDatabases } from '@/lib/agent-startup'
import { agentRegistry } from '@/lib/agent'
import {
  getOrganizationInfo,
  setOrganization,
  isValidOrganizationName,
} from '@/lib/hosts-config'
import type {
  MemoryRunResult,
  MessageCheckResult,
} from '@/types/subconscious'

const execAsync = promisify(exec)

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ServiceResult<T> {
  data?: T
  error?: string
  status: number // HTTP-like status code for the route to use
}

// -- Config types --

export interface SystemConfig {
  version: string
  loggingEnabled: boolean
  platform: string
  nodeVersion: string
  port: string
}

// -- Organization types --

export interface OrganizationInfo {
  organization: string | null
  setAt: string | null
  setBy: string | null
  isSet: boolean
}

export interface SetOrganizationParams {
  organization: string
  setBy?: string
}

// -- Subconscious types --

interface StatusFileContent {
  agentId: string
  lastUpdated: number
  isRunning: boolean
  activityState: 'active' | 'idle' | 'disconnected'
  startedAt: number | null
  memoryCheckInterval: number
  messageCheckInterval: number
  lastMemoryRun: number | null
  lastMessageRun: number | null
  lastMemoryResult: MemoryRunResult | null
  lastMessageResult: MessageCheckResult | null
  totalMemoryRuns: number
  totalMessageRuns: number
  cumulativeMessagesIndexed: number
  cumulativeConversationsIndexed: number
  consolidation?: {
    enabled: boolean
    scheduledHour: number
    lastRun: number | null
    nextRun: number | null
    lastResult: unknown | null
    totalRuns: number
  }
}

interface AgentStatus {
  agentId: string
  isRunning: boolean
  initialized: boolean
  hasStatusFile: boolean
  lastUpdated: number | null
  status: {
    lastMemoryRun: number | null
    lastMessageRun: number | null
    lastMemoryResult: MemoryRunResult | null
    lastMessageResult: MessageCheckResult | null
    totalMemoryRuns: number
    totalMessageRuns: number
  } | null
  cumulativeMessagesIndexed: number
  cumulativeConversationsIndexed: number
}

// -- PTY Debug types --

export interface PtyDebugInfo {
  health: 'healthy' | 'warning' | 'critical'
  system: {
    ptyLimit: number
    ptyInUse: number
    usagePercent: number
    topProcesses: { command: string; count: number }[]
  }
  aiMaestro: { activeSessions: number; sessions: any[] }
  timestamp: string
}

// -- Docker types --

export interface DockerInfo {
  available: boolean
  version?: string
  error?: string
}

// -- Conversation types --

export interface ParsedConversation {
  success: boolean
  messages: any[]
  metadata: {
    sessionId?: string
    cwd?: string
    gitBranch?: string
    claudeVersion?: string
    model?: string
    firstMessageAt?: Date
    lastMessageAt?: Date
    totalMessages: number
    toolsUsed: string[]
  }
}

export interface ConversationMessages {
  success: boolean
  messages: any[]
  metadata: {
    totalMessages: number
    source: string
    conversationFile: string
  }
}

// -- Export Job types --

type ExportJobStatus = 'pending' | 'processing' | 'completed' | 'failed'
type ExportType = 'json' | 'markdown' | 'plaintext'

interface ExportJob {
  id: string
  agentId: string
  agentName: string
  sessionId?: string
  type: ExportType
  status: ExportJobStatus
  createdAt: string
  startedAt?: string
  completedAt?: string
  progress: number
  filePath?: string
  errorMessage?: string
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Read subconscious status from file (no agent loading!)
 * Reads static files instead of loading agents into memory.
 */
function readAgentStatusFile(agentId: string): AgentStatus {
  const statusPath = path.join(os.homedir(), '.aimaestro', 'agents', agentId, 'status.json')

  const defaultStatus: AgentStatus = {
    agentId,
    isRunning: false,
    initialized: false,
    hasStatusFile: false,
    lastUpdated: null,
    status: null,
    cumulativeMessagesIndexed: 0,
    cumulativeConversationsIndexed: 0,
  }

  try {
    if (!fs.existsSync(statusPath)) {
      return defaultStatus
    }

    const content = fs.readFileSync(statusPath, 'utf-8')
    const data = JSON.parse(content) as StatusFileContent

    const staleThreshold = 10 * 60 * 1000 // 10 minutes
    const isStale = data.lastUpdated && (Date.now() - data.lastUpdated) > staleThreshold
    const isRunning = data.isRunning && !isStale

    return {
      agentId,
      isRunning,
      initialized: true,
      hasStatusFile: true,
      lastUpdated: data.lastUpdated,
      status: {
        lastMemoryRun: data.lastMemoryRun,
        lastMessageRun: data.lastMessageRun,
        lastMemoryResult: data.lastMemoryResult,
        lastMessageResult: data.lastMessageResult,
        totalMemoryRuns: data.totalMemoryRuns || 0,
        totalMessageRuns: data.totalMessageRuns || 0,
      },
      cumulativeMessagesIndexed: data.cumulativeMessagesIndexed || 0,
      cumulativeConversationsIndexed: data.cumulativeConversationsIndexed || 0,
    }
  } catch (error) {
    console.error(`[Subconscious API] Error reading status for ${agentId}:`, error)
    return defaultStatus
  }
}

// ===========================================================================
// PUBLIC API -- called by API routes
// ===========================================================================

// ---------------------------------------------------------------------------
// GET /api/config
// ---------------------------------------------------------------------------

/**
 * Get system configuration and version info.
 */
export function getSystemConfig(): ServiceResult<SystemConfig> {
  let version = 'unknown'
  try {
    const versionPath = path.join(process.cwd(), 'version.json')
    const versionData = JSON.parse(fs.readFileSync(versionPath, 'utf-8'))
    version = versionData.version || 'unknown'
  } catch (err) {
    console.error('[Config API] Failed to read version.json:', err)
  }

  const globalLoggingEnabled = process.env.ENABLE_LOGGING === 'true'

  return {
    data: {
      version,
      loggingEnabled: globalLoggingEnabled,
      platform: os.platform(),
      nodeVersion: process.version,
      port: process.env.PORT || '23000',
    },
    status: 200,
  }
}

// ---------------------------------------------------------------------------
// GET /api/organization
// ---------------------------------------------------------------------------

/**
 * Get the current organization configuration.
 */
export function getOrganization(): ServiceResult<OrganizationInfo> {
  const info = getOrganizationInfo()

  return {
    data: {
      organization: info.organization,
      setAt: info.setAt,
      setBy: info.setBy,
      isSet: info.organization !== null,
    },
    status: 200,
  }
}

// ---------------------------------------------------------------------------
// POST /api/organization
// ---------------------------------------------------------------------------

/**
 * Set the organization name. Can only be done once.
 */
export function setOrganizationName(
  params: SetOrganizationParams
): ServiceResult<{
  success: boolean
  organization?: string | null
  setAt?: string | null
  setBy?: string | null
  error?: string
  currentOrganization?: string | null
  examples?: string[]
}> {
  const { organization, setBy } = params

  if (!organization || typeof organization !== 'string') {
    return {
      data: {
        success: false,
        error: 'Organization name is required',
      },
      status: 400,
    }
  }

  const normalizedName = organization.toLowerCase().trim()

  if (!isValidOrganizationName(normalizedName)) {
    return {
      data: {
        success: false,
        error: 'Invalid organization name. Must be 1-63 lowercase characters (letters, numbers, hyphens). Must start with a letter and cannot start/end with a hyphen.',
        examples: ['acme-corp', 'mycompany', 'team-alpha'],
      },
      status: 400,
    }
  }

  const result = setOrganization(normalizedName, setBy)

  if (!result.success) {
    const currentInfo = getOrganizationInfo()
    if (currentInfo.organization) {
      return {
        data: {
          success: false,
          error: result.error,
          currentOrganization: currentInfo.organization,
        },
        status: 409,
      }
    }

    return {
      data: {
        success: false,
        error: result.error,
      },
      status: 400,
    }
  }

  const newInfo = getOrganizationInfo()
  return {
    data: {
      success: true,
      organization: newInfo.organization,
      setAt: newInfo.setAt,
      setBy: newInfo.setBy,
    },
    status: 200,
  }
}

// ---------------------------------------------------------------------------
// GET /api/subconscious
// ---------------------------------------------------------------------------

/**
 * Get the global subconscious status across all agents.
 * Reads from status FILES instead of loading agents into memory.
 */
export function getSubconsciousStatus(): ServiceResult<any> {
  try {
    const discoveredAgentIds = discoverAgentDatabases()

    if (discoveredAgentIds.length === 0) {
      return {
        data: {
          success: true,
          discoveredAgents: 0,
          activeAgents: 0,
          runningSubconscious: 0,
          isWarmingUp: false,
          totalMemoryRuns: 0,
          totalMessageRuns: 0,
          lastMemoryRun: null,
          lastMessageRun: null,
          lastMemoryResult: null,
          lastMessageResult: null,
          agents: [],
        },
        status: 200,
      }
    }

    const statuses = discoveredAgentIds.map(readAgentStatusFile)

    const activeAgents = statuses.filter(s => s.initialized).length
    const runningSubconscious = statuses.filter(s => s.isRunning).length

    let lastMemoryRun: number | null = null
    let lastMessageRun: number | null = null
    let lastMemoryResult: MemoryRunResult | null = null
    let lastMessageResult: MessageCheckResult | null = null
    let totalMemoryRuns = 0
    let totalMessageRuns = 0
    let cumulativeMessagesIndexed = 0
    let cumulativeConversationsIndexed = 0

    for (const s of statuses) {
      if (s.status) {
        totalMemoryRuns += s.status.totalMemoryRuns || 0
        totalMessageRuns += s.status.totalMessageRuns || 0

        if (s.status.lastMemoryRun && (!lastMemoryRun || s.status.lastMemoryRun > lastMemoryRun)) {
          lastMemoryRun = s.status.lastMemoryRun
          lastMemoryResult = s.status.lastMemoryResult
        }
        if (s.status.lastMessageRun && (!lastMessageRun || s.status.lastMessageRun > lastMessageRun)) {
          lastMessageRun = s.status.lastMessageRun
          lastMessageResult = s.status.lastMessageResult
        }
      }

      cumulativeMessagesIndexed += s.cumulativeMessagesIndexed || 0
      cumulativeConversationsIndexed += s.cumulativeConversationsIndexed || 0
    }

    const isWarmingUp = discoveredAgentIds.length > 0 && runningSubconscious === 0

    return {
      data: {
        success: true,
        discoveredAgents: discoveredAgentIds.length,
        activeAgents,
        runningSubconscious,
        isWarmingUp,
        totalMemoryRuns,
        totalMessageRuns,
        lastMemoryRun,
        lastMessageRun,
        lastMemoryResult,
        lastMessageResult,
        cumulativeMessagesIndexed,
        cumulativeConversationsIndexed,
        agents: statuses.map(s => ({
          agentId: s.agentId,
          hasStatusFile: s.hasStatusFile,
          lastUpdated: s.lastUpdated,
          status: s.isRunning ? {
            isRunning: s.isRunning,
            ...s.status,
            cumulativeMessagesIndexed: s.cumulativeMessagesIndexed,
            cumulativeConversationsIndexed: s.cumulativeConversationsIndexed,
          } : null,
        })),
      },
      status: 200,
    }
  } catch (error) {
    console.error('[Subconscious API] Error:', error)
    return {
      error: error instanceof Error ? error.message : 'Unknown error',
      status: 500,
    }
  }
}

// ---------------------------------------------------------------------------
// GET /api/debug/pty
// ---------------------------------------------------------------------------

/**
 * Get PTY usage statistics for monitoring and debugging PTY leaks.
 */
export async function getPtyDebugInfo(): Promise<ServiceResult<PtyDebugInfo>> {
  try {
    // Get session data from server.mjs internal endpoint
    let aiMaestroData = { activeSessions: 0, sessions: [] as any[] }
    try {
      const internalResponse = await fetch('http://127.0.0.1:23000/api/internal/pty-sessions', {
        cache: 'no-store',
      })
      if (internalResponse.ok) {
        aiMaestroData = await internalResponse.json()
      }
    } catch {
      // Internal endpoint may not be available during startup
    }

    // Get system PTY info (macOS specific)
    let systemPtyCount = 0
    let ptyLimit = 511 // Default macOS limit
    let ptyProcesses: { command: string; count: number }[] = []

    try {
      const limitOutput = execSync('sysctl -n kern.tty.ptmx_max 2>/dev/null || echo 511', { encoding: 'utf8' })
      ptyLimit = parseInt(limitOutput.trim()) || 511

      const ptyCountOutput = execSync('ls /dev/ttys* 2>/dev/null | wc -l', { encoding: 'utf8' })
      systemPtyCount = parseInt(ptyCountOutput.trim()) || 0

      const lsofOutput = execSync(
        "lsof /dev/ttys* 2>/dev/null | awk '{print $1}' | sort | uniq -c | sort -rn | head -10",
        { encoding: 'utf8' }
      )
      ptyProcesses = lsofOutput
        .trim()
        .split('\n')
        .filter(line => line.trim())
        .map(line => {
          const match = line.trim().match(/^(\d+)\s+(.+)$/)
          if (match) {
            return { count: parseInt(match[1]), command: match[2] }
          }
          return null
        })
        .filter(Boolean) as { command: string; count: number }[]
    } catch {
      // Commands may fail on non-macOS systems
    }

    const usagePercent = (systemPtyCount / ptyLimit) * 100
    let health: 'healthy' | 'warning' | 'critical' = 'healthy'
    if (usagePercent > 80) health = 'critical'
    else if (usagePercent > 60) health = 'warning'

    return {
      data: {
        health,
        system: {
          ptyLimit,
          ptyInUse: systemPtyCount,
          usagePercent: Math.round(usagePercent * 10) / 10,
          topProcesses: ptyProcesses,
        },
        aiMaestro: aiMaestroData,
        timestamp: new Date().toISOString(),
      },
      status: 200,
    }
  } catch (error) {
    console.error('[Debug PTY] Error:', error)
    return {
      error: error instanceof Error ? error.message : 'Unknown error',
      status: 500,
    }
  }
}

// ---------------------------------------------------------------------------
// GET /api/docker/info
// ---------------------------------------------------------------------------

/**
 * Check if Docker is available on this host.
 */
export async function getDockerInfo(): Promise<ServiceResult<DockerInfo>> {
  try {
    const { stdout } = await execAsync("docker version --format '{{.Server.Version}}'", {
      timeout: 5000,
    })
    const version = stdout.trim().replace(/'/g, '')
    return {
      data: { available: true, version },
      status: 200,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Docker not available'
    return {
      data: { available: false, error: message },
      status: 200,
    }
  }
}

// ---------------------------------------------------------------------------
// POST /api/conversations/parse
// ---------------------------------------------------------------------------

/**
 * Parse a JSONL conversation file and return messages with metadata.
 */
export function parseConversationFile(conversationFile: string): ServiceResult<ParsedConversation> {
  if (!conversationFile) {
    console.error('[Parse Conversation] Missing conversationFile parameter')
    return {
      error: 'conversationFile is required',
      status: 400,
    }
  }

  if (!fs.existsSync(conversationFile)) {
    console.error('[Parse Conversation] File not found:', conversationFile)
    return {
      error: `Conversation file not found: ${conversationFile}`,
      status: 404,
    }
  }

  try {
    const fileContent = fs.readFileSync(conversationFile, 'utf-8')
    const lines = fileContent.split('\n').filter(line => line.trim())

    const messages: any[] = []
    const metadata: {
      sessionId?: string
      cwd?: string
      gitBranch?: string
      claudeVersion?: string
      model?: string
      firstMessageAt?: Date
      lastMessageAt?: Date
      totalMessages: number
      toolsUsed: Set<string>
    } = {
      totalMessages: 0,
      toolsUsed: new Set(),
    }

    for (const line of lines) {
      try {
        const message = JSON.parse(line)

        // Extract thinking blocks from assistant messages
        if (message.type === 'assistant' && message.message?.content) {
          const content = message.message.content
          if (Array.isArray(content)) {
            for (const block of content) {
              if (block.type === 'thinking' && block.thinking) {
                messages.push({
                  type: 'thinking',
                  thinking: block.thinking,
                  signature: block.signature,
                  timestamp: message.timestamp,
                  uuid: message.uuid,
                  sessionId: message.sessionId,
                })
                metadata.totalMessages++
                console.log('[Parse] Extracted thinking message from assistant content')
              }
            }
          }
        }

        // Detect skill expansion messages
        if (message.type === 'user' && message.message?.content) {
          const content = typeof message.message.content === 'string'
            ? message.message.content
            : Array.isArray(message.message.content)
              ? message.message.content.find((b: any) => b.type === 'text')?.text || ''
              : ''

          if (
            content.includes('Base directory for this skill:') ||
            content.includes('<skill>') ||
            content.match(/^#\s+\w+/m)
          ) {
            message.isSkill = true
            message.originalType = message.type
            message.type = 'skill'
          }
        }

        // Extract metadata from early messages
        if (!metadata.sessionId && message.sessionId) {
          metadata.sessionId = message.sessionId
        }
        if (!metadata.cwd && message.cwd) {
          metadata.cwd = message.cwd
        }
        if (!metadata.gitBranch && message.gitBranch) {
          metadata.gitBranch = message.gitBranch
        }
        if (!metadata.claudeVersion && message.version) {
          metadata.claudeVersion = message.version
        }
        if (!metadata.model && message.message?.model) {
          metadata.model = message.message.model
        }

        // Track timestamps
        if (message.timestamp) {
          const ts = new Date(message.timestamp)
          if (!metadata.firstMessageAt || ts < metadata.firstMessageAt) {
            metadata.firstMessageAt = ts
          }
          if (!metadata.lastMessageAt || ts > metadata.lastMessageAt) {
            metadata.lastMessageAt = ts
          }
        }

        // Track tool usage
        if (message.type === 'tool_use' && message.toolName) {
          metadata.toolsUsed.add(message.toolName)
        }

        messages.push(message)
        metadata.totalMessages++
      } catch (parseErr) {
        console.error('[Parse Conversation] Failed to parse line:', parseErr)
        console.error('[Parse Conversation] Problematic line:', line.substring(0, 200))
      }
    }

    const thinkingMessages = messages.filter(m => m.type === 'thinking')
    console.log('[Parse] Returning', messages.length, 'messages,', thinkingMessages.length, 'thinking messages')

    return {
      data: {
        success: true,
        messages,
        metadata: {
          ...metadata,
          toolsUsed: Array.from(metadata.toolsUsed),
        },
      },
      status: 200,
    }
  } catch (error) {
    console.error('[Parse Conversation] Error:', error)
    return {
      error: error instanceof Error ? error.message : 'Unknown error',
      status: 500,
    }
  }
}

// ---------------------------------------------------------------------------
// GET /api/conversations/[file]/messages
// ---------------------------------------------------------------------------

/**
 * Get messages for a conversation from the RAG database (fast, cached).
 */
export async function getConversationMessages(
  encodedFile: string,
  agentId: string
): Promise<ServiceResult<ConversationMessages | { error: string; fallback_to_parse: boolean; conversation_file: string }>> {
  if (!agentId) {
    return {
      error: 'agentId query parameter is required',
      status: 400,
    }
  }

  try {
    const conversationFile = decodeURIComponent(encodedFile)

    const agent = await agentRegistry.getAgent(agentId)
    const agentDb = await agent.getDatabase()

    const result = await agentDb.run(`
      ?[msg_id, conversation_file, role, ts, text] :=
        *messages{msg_id, conversation_file, role, ts, text},
        conversation_file = '${conversationFile.replace(/'/g, "''")}'

      :order ts
    `)

    if (!result.rows || result.rows.length === 0) {
      return {
        data: {
          error: 'No messages found in RAG database. Conversation may not be indexed yet.',
          fallback_to_parse: true,
          conversation_file: conversationFile,
        } as any,
        status: 404,
      }
    }

    const messages = result.rows.map((row: any[]) => ({
      msg_id: row[0],
      conversation_file: row[1],
      type: row[2],
      timestamp: new Date(row[3]).toISOString(),
      message: {
        content: row[4],
      },
    }))

    return {
      data: {
        success: true,
        messages,
        metadata: {
          totalMessages: messages.length,
          source: 'rag_database',
          conversationFile,
        },
      },
      status: 200,
    }
  } catch (error) {
    console.error('[Messages API] Error:', error)
    return {
      error: error instanceof Error ? error.message : 'Unknown error',
      status: 500,
    }
  }
}

// ---------------------------------------------------------------------------
// GET /api/export/jobs/[jobId]
// ---------------------------------------------------------------------------

/**
 * Get status of a specific export job.
 */
export function getExportJobStatus(jobId: string): ServiceResult<{
  success: boolean
  job: ExportJob
  message: string
}> {
  if (!jobId || typeof jobId !== 'string') {
    return {
      error: 'Invalid job ID',
      status: 400,
    }
  }

  console.log(`[Export Jobs API] Get status: Job=${jobId}`)

  // TODO: Load export job from database or file system
  const exportJob: ExportJob = {
    id: jobId,
    agentId: 'unknown',
    agentName: 'Unknown Agent',
    sessionId: undefined,
    type: 'json',
    status: 'pending',
    createdAt: new Date().toISOString(),
    progress: 0,
    filePath: undefined,
    errorMessage: undefined,
  }

  return {
    data: {
      success: true,
      job: exportJob,
      message: 'Export job status retrieved (placeholder - Phase 5 implementation pending)',
    },
    status: 200,
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/export/jobs/[jobId]
// ---------------------------------------------------------------------------

/**
 * Cancel or delete an export job.
 */
export function deleteExportJob(jobId: string): ServiceResult<{
  success: boolean
  message: string
}> {
  if (!jobId || typeof jobId !== 'string') {
    return {
      error: 'Invalid job ID',
      status: 400,
    }
  }

  console.log(`[Export Jobs API] Delete job: Job=${jobId}`)

  // TODO: Delete export job from database or file system
  return {
    data: {
      success: true,
      message: 'Export job deleted (placeholder - Phase 5 implementation pending)',
    },
    status: 200,
  }
}
