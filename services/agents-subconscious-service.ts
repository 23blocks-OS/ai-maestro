/**
 * Agents Subconscious Service
 *
 * Business logic for agent subconscious status and control.
 * Routes are thin wrappers that call these functions.
 */

import fs from 'fs'
import os from 'os'
import path from 'path'
import { agentRegistry } from '@/lib/agent'
import { type ServiceResult, notInitialized, invalidRequest } from '@/services/service-errors'

/**
 * Last status the agent's subconscious wrote to disk.
 *
 * Agent.writeStatusFile() exists to decouple the dashboard from loading agents,
 * which is exactly what this read path needs — see getSubconsciousStatus.
 */
function readStatusFile(agentId: string): Record<string, unknown> | null {
  try {
    const p = path.join(os.homedir(), '.aimaestro', 'agents', agentId, 'status.json')
    return JSON.parse(fs.readFileSync(p, 'utf-8'))
  } catch {
    return null
  }
}

// ── Public Functions ────────────────────────────────────────────────────────

/**
 * Get the subconscious status for an agent — WITHOUT starting it.
 *
 * This used to call agentRegistry.getAgent(), which loads the agent and starts
 * its subconscious. That made the dashboard indicator self-fulfilling: opening
 * the UI started the very thing it claimed to be observing, and every render
 * evicted other agents from the 10-slot LRU to do it. A monitor must not create
 * the state it reports.
 *
 * So: report the live object only if the agent is ALREADY resident. Otherwise
 * fall back to the status file, which Agent.writeStatusFile() maintains for
 * exactly this purpose — but force isRunning to false, because an agent absent
 * from the registry is not running in this process no matter what the file's
 * last write claimed. The historical counters stay useful, and `lastUpdated`
 * lets the UI say how long ago it was last alive.
 *
 * Starting a subconscious is a POST (triggerSubconsciousAction) — an action,
 * not an observation.
 */
export async function getSubconsciousStatus(agentId: string): Promise<ServiceResult<Record<string, unknown>>> {
  const agent = agentRegistry.getExistingAgent(agentId)

  if (!agent) {
    const file = readStatusFile(agentId)
    return {
      data: {
        success: true,
        exists: !!file,
        initialized: false,
        resident: false,
        isRunning: false,
        isWarmingUp: false,
        lastUpdated: file?.lastUpdated ?? null,
        status: file
          ? {
              startedAt: file.startedAt,
              memoryCheckInterval: file.memoryCheckInterval,
              messageCheckInterval: file.messageCheckInterval,
              lastMemoryRun: file.lastMemoryRun,
              lastMessageRun: file.lastMessageRun,
              lastMemoryResult: file.lastMemoryResult,
              lastMessageResult: file.lastMessageResult,
              totalMemoryRuns: file.totalMemoryRuns,
              totalMessageRuns: file.totalMessageRuns,
              cumulativeMessagesIndexed: file.cumulativeMessagesIndexed,
              cumulativeConversationsIndexed: file.cumulativeConversationsIndexed,
            }
          : null,
        consolidation: (file?.consolidation as Record<string, unknown>) ?? null,
        memoryStats: null,
      },
      status: 200,
    }
  }

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
      resident: true,
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
    return notInitialized('Subconscious')
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
      return invalidRequest(`Unknown action: ${action}`)
  }
}
