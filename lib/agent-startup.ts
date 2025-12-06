/**
 * Agent Startup - Initialize all registered agents on server boot
 *
 * This module solves the chicken-and-egg problem where:
 * - The subconscious only starts when an agent is accessed
 * - But nothing accesses agents on server startup
 *
 * Solution: On server boot, discover all agent databases and initialize them
 */

import fs from 'fs'
import path from 'path'
import os from 'os'
import { agentRegistry } from './agent'

const AGENTS_DIR = path.join(os.homedir(), '.aimaestro', 'agents')

/**
 * Discover all agent database directories
 * Agent databases are stored as directories (not .json files) in ~/.aimaestro/agents/
 */
export function discoverAgentDatabases(): string[] {
  if (!fs.existsSync(AGENTS_DIR)) {
    console.log('[AgentStartup] No agents directory found')
    return []
  }

  try {
    const entries = fs.readdirSync(AGENTS_DIR, { withFileTypes: true })
    const agentIds = entries
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)

    return agentIds
  } catch (error) {
    console.error('[AgentStartup] Error discovering agents:', error)
    return []
  }
}

/**
 * Initialize all discovered agents
 * This starts their subconscious processes for memory maintenance
 */
export async function initializeAllAgents(): Promise<{
  initialized: string[]
  failed: Array<{ agentId: string; error: string }>
}> {
  console.log('[AgentStartup] Starting agent initialization...')

  const agentIds = discoverAgentDatabases()

  if (agentIds.length === 0) {
    console.log('[AgentStartup] No agents to initialize')
    return { initialized: [], failed: [] }
  }

  console.log(`[AgentStartup] Found ${agentIds.length} agent database(s)`)

  const initialized: string[] = []
  const failed: Array<{ agentId: string; error: string }> = []

  // Initialize agents in parallel with concurrency limit
  const CONCURRENCY = 5
  for (let i = 0; i < agentIds.length; i += CONCURRENCY) {
    const batch = agentIds.slice(i, i + CONCURRENCY)

    await Promise.all(
      batch.map(async (agentId) => {
        try {
          // getAgent will initialize if not already initialized
          await agentRegistry.getAgent(agentId)
          initialized.push(agentId)
          console.log(`[AgentStartup] Initialized: ${agentId.substring(0, 8)}...`)
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error'
          failed.push({ agentId, error: errorMsg })
          console.error(`[AgentStartup] Failed to initialize ${agentId.substring(0, 8)}...: ${errorMsg}`)
        }
      })
    )
  }

  console.log(`[AgentStartup] Complete: ${initialized.length} initialized, ${failed.length} failed`)

  return { initialized, failed }
}

/**
 * Get summary of startup status
 */
export function getStartupStatus() {
  const registryStatus = agentRegistry.getStatus()
  return {
    discoveredAgents: discoverAgentDatabases().length,
    activeAgents: registryStatus.activeAgents,
    agents: registryStatus.agents.map(a => ({
      agentId: a.agentId,
      initialized: a.initialized,
      subconscious: a.subconscious?.isRunning || false
    }))
  }
}
