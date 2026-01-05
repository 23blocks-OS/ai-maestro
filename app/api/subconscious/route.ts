import { NextResponse } from 'next/server'
import { discoverAgentDatabases } from '@/lib/agent-startup'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import type {
  MemoryRunResult,
  MessageCheckResult
} from '@/types/subconscious'

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

/**
 * Read subconscious status from file (no agent loading!)
 * This is the key change - we read static files instead of loading agents into memory
 */
function readAgentStatusFile(agentId: string): AgentStatus {
  const statusPath = path.join(os.homedir(), '.aimaestro', 'agents', agentId, 'status.json')

  // Default status for agents without a status file (hibernated/never started)
  const defaultStatus: AgentStatus = {
    agentId,
    isRunning: false,
    initialized: false,
    hasStatusFile: false,
    lastUpdated: null,
    status: null,
    cumulativeMessagesIndexed: 0,
    cumulativeConversationsIndexed: 0
  }

  try {
    if (!fs.existsSync(statusPath)) {
      return defaultStatus
    }

    const content = fs.readFileSync(statusPath, 'utf-8')
    const data = JSON.parse(content) as StatusFileContent

    // Check if status file is stale (older than 10 minutes = agent likely stopped)
    const staleThreshold = 10 * 60 * 1000 // 10 minutes
    const isStale = data.lastUpdated && (Date.now() - data.lastUpdated) > staleThreshold
    const isRunning = data.isRunning && !isStale

    return {
      agentId,
      isRunning,
      initialized: true, // Has status file = was initialized at some point
      hasStatusFile: true,
      lastUpdated: data.lastUpdated,
      status: {
        lastMemoryRun: data.lastMemoryRun,
        lastMessageRun: data.lastMessageRun,
        lastMemoryResult: data.lastMemoryResult,
        lastMessageResult: data.lastMessageResult,
        totalMemoryRuns: data.totalMemoryRuns || 0,
        totalMessageRuns: data.totalMessageRuns || 0
      },
      cumulativeMessagesIndexed: data.cumulativeMessagesIndexed || 0,
      cumulativeConversationsIndexed: data.cumulativeConversationsIndexed || 0
    }
  } catch (error) {
    // File read error - treat as no status
    console.error(`[Subconscious API] Error reading status for ${agentId}:`, error)
    return defaultStatus
  }
}

/**
 * GET /api/subconscious
 * Get the global subconscious status across all agents
 *
 * IMPORTANT: This API now reads from status FILES instead of loading agents.
 * This prevents memory bloat from loading 68+ agents into memory just to check status.
 * Agents write their own status files when their subconscious runs.
 */
export async function GET() {
  try {
    // Get discovered agents from filesystem (always accurate)
    const discoveredAgentIds = discoverAgentDatabases()

    if (discoveredAgentIds.length === 0) {
      return NextResponse.json({
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
        agents: []
      })
    }

    // Read status from files (NO agent loading! This is fast and memory-efficient)
    const statuses = discoveredAgentIds.map(readAgentStatusFile)

    // Aggregate stats
    const activeAgents = statuses.filter(s => s.initialized).length
    const runningSubconscious = statuses.filter(s => s.isRunning).length

    // Find most recent runs and aggregate cumulative stats
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

      // Aggregate cumulative stats from this session
      cumulativeMessagesIndexed += s.cumulativeMessagesIndexed || 0
      cumulativeConversationsIndexed += s.cumulativeConversationsIndexed || 0
    }

    // Determine if warming up: we have discovered agents but none are running
    const isWarmingUp = discoveredAgentIds.length > 0 && runningSubconscious === 0

    return NextResponse.json({
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
          cumulativeConversationsIndexed: s.cumulativeConversationsIndexed
        } : null
      }))
    })
  } catch (error) {
    console.error('[Subconscious API] Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
