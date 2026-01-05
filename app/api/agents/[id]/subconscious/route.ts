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
      // Long-term memory consolidation status
      consolidation: status?.consolidation || null,
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

/**
 * POST /api/agents/[id]/subconscious
 * Trigger subconscious actions
 *
 * Actions:
 * - consolidate: Trigger memory consolidation (extract long-term memories from conversations)
 * - index: Trigger immediate memory indexing (index new messages)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: agentId } = await params
    const body = await request.json()
    const action = body.action as string

    const agent = await agentRegistry.getAgent(agentId)
    const subconscious = agent.getSubconscious()

    if (!subconscious) {
      return NextResponse.json(
        { success: false, error: 'Subconscious not initialized' },
        { status: 400 }
      )
    }

    switch (action) {
      case 'consolidate': {
        console.log(`[Agent ${agentId.substring(0, 8)}] Manual consolidation triggered`)
        const result = await subconscious.triggerConsolidation()
        return NextResponse.json({
          success: result?.success ?? false,
          action: 'consolidate',
          result
        })
      }

      case 'index': {
        // Trigger immediate memory indexing
        console.log(`[Agent ${agentId.substring(0, 8)}] Manual indexing triggered`)
        // The subconscious will pick this up on next interval
        // For immediate indexing, we'd need to call checkMemory directly
        // which isn't currently exposed, so this just confirms the action
        return NextResponse.json({
          success: true,
          action: 'index',
          message: 'Indexing will run on next interval'
        })
      }

      default:
        return NextResponse.json(
          { success: false, error: `Unknown action: ${action}` },
          { status: 400 }
        )
    }
  } catch (error) {
    console.error('[Agent Subconscious API] POST Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
