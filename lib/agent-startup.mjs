/**
 * Agent Startup (ESM version for server.mjs)
 * Initialize all registered agents on server boot
 */

import fs from 'fs'
import path from 'path'
import os from 'os'

const AGENTS_DIR = path.join(os.homedir(), '.aimaestro', 'agents')

/**
 * Discover all agent database directories
 */
export function discoverAgentDatabases() {
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
 * Initialize agents by calling the index-delta API for each
 * This is necessary because the agentRegistry is in a different module context
 */
export async function initializeAgentsViaAPI(port = 23000) {
  console.log('[AgentStartup] Starting agent initialization...')

  const agentIds = discoverAgentDatabases()

  if (agentIds.length === 0) {
    console.log('[AgentStartup] No agents to initialize')
    return { initialized: [], failed: [] }
  }

  console.log(`[AgentStartup] Found ${agentIds.length} agent database(s)`)

  const initialized = []
  const failed = []

  // Initialize agents in parallel with concurrency limit
  const CONCURRENCY = 5
  for (let i = 0; i < agentIds.length; i += CONCURRENCY) {
    const batch = agentIds.slice(i, i + CONCURRENCY)

    await Promise.all(
      batch.map(async (agentId) => {
        try {
          // Call the index-delta API which will initialize the agent
          const response = await fetch(`http://localhost:${port}/api/agents/${agentId}/index-delta`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
          })

          if (response.ok) {
            initialized.push(agentId)
            console.log(`[AgentStartup] Initialized: ${agentId.substring(0, 12)}...`)
          } else {
            failed.push({ agentId, error: `HTTP ${response.status}` })
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error'
          failed.push({ agentId, error: errorMsg })
          console.error(`[AgentStartup] Failed ${agentId.substring(0, 12)}...: ${errorMsg}`)
        }
      })
    )
  }

  console.log(`[AgentStartup] Complete: ${initialized.length} initialized, ${failed.length} failed`)

  return { initialized, failed }
}
