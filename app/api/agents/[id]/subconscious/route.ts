import { NextRequest, NextResponse } from 'next/server'
import { agentRegistry } from '@/lib/agent'
import fs from 'fs'
import path from 'path'
import os from 'os'

const AGENTS_DIR = path.join(os.homedir(), '.aimaestro', 'agents')

/**
 * Check if agent database exists on filesystem
 */
function agentDatabaseExists(agentId: string): boolean {
  const agentDir = path.join(AGENTS_DIR, agentId)
  return fs.existsSync(agentDir)
}

/**
 * GET /api/agents/[id]/subconscious
 * Get the subconscious status for a specific agent
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: agentId } = await params

    // Check if agent exists on filesystem
    const exists = agentDatabaseExists(agentId)
    if (!exists) {
      return NextResponse.json({
        success: false,
        exists: false,
        error: 'Agent not found'
      }, { status: 404 })
    }

    // Try to get agent from in-memory registry
    const agent = agentRegistry.getExistingAgent(agentId)

    if (!agent) {
      // Agent exists on disk but not in memory (not yet initialized)
      return NextResponse.json({
        success: true,
        exists: true,
        initialized: false,
        isRunning: false,
        isWarmingUp: true,
        status: null
      })
    }

    // Get subconscious status
    const subconscious = agent.getSubconscious()
    const status = subconscious?.getStatus() || null

    return NextResponse.json({
      success: true,
      exists: true,
      initialized: true,
      isRunning: status?.isRunning || false,
      isWarmingUp: false,
      status: status ? {
        startedAt: status.startedAt,
        memoryCheckInterval: status.memoryCheckInterval,
        messageCheckInterval: status.messageCheckInterval,
        lastMemoryRun: status.lastMemoryRun,
        lastMessageRun: status.lastMessageRun,
        lastMemoryResult: status.lastMemoryResult,
        lastMessageResult: status.lastMessageResult,
        totalMemoryRuns: status.totalMemoryRuns,
        totalMessageRuns: status.totalMessageRuns
      } : null
    })
  } catch (error) {
    console.error('[Agent Subconscious API] Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
