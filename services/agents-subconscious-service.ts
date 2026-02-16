/**
 * Agents Subconscious Service
 *
 * Business logic for agent subconscious status and control.
 * Routes are thin wrappers that call these functions.
 */

import { agentRegistry } from '@/lib/agent'

// ── Types ───────────────────────────────────────────────────────────────────

export interface ServiceResult<T> {
  data?: T
  error?: string
  status: number
}

// ── Public Functions ────────────────────────────────────────────────────────

/**
 * Get the subconscious status for an agent.
 * This will initialize the agent if it doesn't exist yet.
 */
export async function getSubconsciousStatus(agentId: string): Promise<ServiceResult<Record<string, unknown>>> {
  const agent = await agentRegistry.getAgent(agentId)

  const subconscious = agent.getSubconscious()
  const status = subconscious?.getStatus() || null

  // Get database memory stats
  let memoryStats = null
  try {
    const db = await agent.getDatabase()
    if (db) {
      memoryStats = await db.getMemoryStats()
    }
  } catch {
    // Database stats not available
  }

  return {
    data: {
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
      consolidation: status?.consolidation || null,
      memoryStats
    },
    status: 200
  }
}

/**
 * Trigger subconscious actions (consolidate, index).
 */
export async function triggerSubconsciousAction(
  agentId: string,
  action: string
): Promise<ServiceResult<Record<string, unknown>>> {
  const agent = await agentRegistry.getAgent(agentId)
  const subconscious = agent.getSubconscious()

  if (!subconscious) {
    return { error: 'Subconscious not initialized', status: 400 }
  }

  switch (action) {
    case 'consolidate': {
      console.log(`[Agent ${agentId.substring(0, 8)}] Manual consolidation triggered`)
      const result = await subconscious.triggerConsolidation()
      return {
        data: {
          success: result?.success ?? false,
          action: 'consolidate',
          result
        },
        status: 200
      }
    }

    case 'index': {
      console.log(`[Agent ${agentId.substring(0, 8)}] Manual indexing triggered`)
      return {
        data: {
          success: true,
          action: 'index',
          message: 'Indexing will run on next interval'
        },
        status: 200
      }
    }

    default:
      return { error: `Unknown action: ${action}`, status: 400 }
  }
}
