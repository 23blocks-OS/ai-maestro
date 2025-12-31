import { NextRequest, NextResponse } from 'next/server'
import { agentRegistry } from '@/lib/agent'

/**
 * GET /api/agents/[id]/subconscious
 * Get the subconscious status for a specific agent
 *
 * This API will initialize the agent if it doesn't exist yet,
 * creating the database and starting the subconscious.
 * This enables lazy initialization when a new session is first accessed.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: agentId } = await params

    // Get or create the agent (this initializes the database and subconscious)
    // Using getAgent() ensures lazy initialization for new sessions
    const agent = await agentRegistry.getAgent(agentId)

    // Get subconscious status
    const subconscious = agent.getSubconscious()
    const status = subconscious?.getStatus() || null

    // Get database memory stats for cumulative totals
    let memoryStats = null
    try {
      const db = await agent.getDatabase()
      if (db) {
        memoryStats = await db.getMemoryStats()
      }
    } catch {
      // Database stats not available
    }

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
        totalMessageRuns: status.totalMessageRuns,
        cumulativeMessagesIndexed: status.cumulativeMessagesIndexed,
        cumulativeConversationsIndexed: status.cumulativeConversationsIndexed
      } : null,
      memoryStats
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
