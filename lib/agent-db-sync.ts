/**
 * Agent Database Synchronization
 *
 * Ensures all registered agents have their CozoDB databases initialized.
 * Run this on server startup to maintain database consistency.
 */

import { createAgentDatabase } from './cozo-db'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

interface AgentRegistryEntry {
  id: string
  type?: string
  status?: string
  [key: string]: any
}

/**
 * Get all registered agents from the registry
 */
function getRegisteredAgents(): AgentRegistryEntry[] {
  const registryPath = path.join(os.homedir(), '.aimaestro', 'agents', 'registry.json')

  if (!fs.existsSync(registryPath)) {
    console.log('[DB-SYNC] No agent registry found, skipping database sync')
    return []
  }

  try {
    const registryData = fs.readFileSync(registryPath, 'utf-8')
    const registry = JSON.parse(registryData)

    // Handle both array and object formats
    if (Array.isArray(registry)) {
      return registry
    } else if (registry.agents && Array.isArray(registry.agents)) {
      return registry.agents
    } else {
      console.warn('[DB-SYNC] Unknown registry format, skipping sync')
      return []
    }
  } catch (error) {
    console.error('[DB-SYNC] Failed to read agent registry:', error)
    return []
  }
}

/**
 * Check if an agent has a database
 */
function agentHasDatabase(agentId: string): boolean {
  const dbPath = path.join(os.homedir(), '.aimaestro', 'agents', agentId, 'agent.db')
  return fs.existsSync(dbPath)
}

/**
 * Initialize database for a single agent
 */
async function initializeAgentDatabase(agentId: string): Promise<boolean> {
  try {
    console.log(`[DB-SYNC] Initializing database for agent: ${agentId}`)

    const agentDb = await createAgentDatabase({ agentId })
    const metadata = await agentDb.getMetadata()
    await agentDb.close()

    console.log(`[DB-SYNC] ✅ Database initialized for ${agentId}`, metadata)
    return true
  } catch (error) {
    console.error(`[DB-SYNC] ❌ Failed to initialize database for ${agentId}:`, error)
    return false
  }
}

/**
 * Synchronize databases for all registered agents
 * Creates missing databases and reports statistics
 */
export async function syncAgentDatabases(): Promise<{
  total: number
  existing: number
  created: number
  failed: number
  agents: {
    id: string
    hasDb: boolean
    status: 'existing' | 'created' | 'failed'
  }[]
}> {
  console.log('[DB-SYNC] Starting agent database synchronization...')

  const agents = getRegisteredAgents()
  const results = {
    total: agents.length,
    existing: 0,
    created: 0,
    failed: 0,
    agents: [] as any[]
  }

  if (agents.length === 0) {
    console.log('[DB-SYNC] No agents registered, nothing to sync')
    return results
  }

  console.log(`[DB-SYNC] Found ${agents.length} registered agents`)

  for (const agent of agents) {
    const agentId = agent.id

    if (!agentId) {
      console.warn('[DB-SYNC] Skipping agent with no ID:', agent)
      continue
    }

    const hasDb = agentHasDatabase(agentId)

    if (hasDb) {
      console.log(`[DB-SYNC] ✓ Agent ${agentId} already has database`)
      results.existing++
      results.agents.push({
        id: agentId,
        hasDb: true,
        status: 'existing'
      })
    } else {
      console.log(`[DB-SYNC] ✗ Agent ${agentId} missing database, creating...`)
      const success = await initializeAgentDatabase(agentId)

      if (success) {
        results.created++
        results.agents.push({
          id: agentId,
          hasDb: true,
          status: 'created'
        })
      } else {
        results.failed++
        results.agents.push({
          id: agentId,
          hasDb: false,
          status: 'failed'
        })
      }
    }
  }

  console.log('[DB-SYNC] Synchronization complete:')
  console.log(`[DB-SYNC]   Total agents: ${results.total}`)
  console.log(`[DB-SYNC]   Existing databases: ${results.existing}`)
  console.log(`[DB-SYNC]   Created databases: ${results.created}`)
  console.log(`[DB-SYNC]   Failed: ${results.failed}`)

  return results
}

/**
 * Initialize database for a specific agent if it doesn't exist
 */
export async function ensureAgentDatabase(agentId: string): Promise<void> {
  if (!agentHasDatabase(agentId)) {
    console.log(`[DB-SYNC] Creating missing database for agent: ${agentId}`)
    await initializeAgentDatabase(agentId)
  }
}
