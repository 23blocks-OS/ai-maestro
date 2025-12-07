import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import os from 'os'

const AGENTS_DIR = path.join(os.homedir(), '.aimaestro', 'agents')

/**
 * Discover agent databases from filesystem (source of truth)
 */
function discoverAgentDatabases(): string[] {
  if (!fs.existsSync(AGENTS_DIR)) {
    return []
  }
  try {
    const entries = fs.readdirSync(AGENTS_DIR, { withFileTypes: true })
    return entries.filter(entry => entry.isDirectory()).map(entry => entry.name)
  } catch {
    return []
  }
}

interface AgentSubconsciousStatus {
  agentId: string
  isRunning: boolean
  initialized: boolean
  isWarmingUp: boolean
  status: {
    lastMemoryRun: number | null
    lastMessageRun: number | null
    lastMemoryResult: {
      success: boolean
      messagesProcessed?: number
      error?: string
    } | null
    lastMessageResult: {
      success: boolean
      unreadCount?: number
      error?: string
    } | null
    totalMemoryRuns: number
    totalMessageRuns: number
  } | null
}

/**
 * Fetch subconscious status for a single agent
 */
async function fetchAgentStatus(agentId: string): Promise<AgentSubconsciousStatus | null> {
  try {
    const response = await fetch(`http://localhost:23000/api/agents/${agentId}/subconscious`, {
      cache: 'no-store'
    })
    if (!response.ok) return null
    const data = await response.json()
    return {
      agentId,
      isRunning: data.isRunning || false,
      initialized: data.initialized || false,
      isWarmingUp: data.isWarmingUp || false,
      status: data.status || null
    }
  } catch {
    return null
  }
}

/**
 * GET /api/subconscious
 * Get the global subconscious status across all agents
 *
 * This API aggregates status from per-agent subconscious endpoints
 * to work around Next.js module isolation issues.
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

    // Fetch status for all agents in parallel (limit to 100 for performance)
    const agentIdsToCheck = discoveredAgentIds.slice(0, 100)
    const statusPromises = agentIdsToCheck.map(fetchAgentStatus)
    const statuses = await Promise.all(statusPromises)
    const validStatuses = statuses.filter((s): s is AgentSubconsciousStatus => s !== null)

    // Aggregate stats
    const activeAgents = validStatuses.filter(s => s.initialized).length
    const runningSubconscious = validStatuses.filter(s => s.isRunning).length
    const warmingUpCount = validStatuses.filter(s => s.isWarmingUp).length

    // Find most recent runs
    let lastMemoryRun: number | null = null
    let lastMessageRun: number | null = null
    let lastMemoryResult: { success: boolean; messagesProcessed?: number; error?: string } | null = null
    let lastMessageResult: { success: boolean; unreadCount?: number; error?: string } | null = null
    let totalMemoryRuns = 0
    let totalMessageRuns = 0

    for (const s of validStatuses) {
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
      agents: validStatuses.map(s => ({
        agentId: s.agentId,
        status: s.isRunning ? {
          isRunning: s.isRunning,
          ...s.status
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
