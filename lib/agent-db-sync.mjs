/**
 * ESM wrapper for agent database synchronization
 * This file allows server.mjs to import and use the TypeScript sync function
 */

import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

/**
 * Get all registered agents from the registry
 */
function getRegisteredAgents() {
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
function agentHasDatabase(agentId) {
  const dbPath = path.join(os.homedir(), '.aimaestro', 'agents', agentId, 'agent.db')
  return fs.existsSync(dbPath)
}

/**
 * Initialize database for a single agent
 */
async function initializeAgentDatabase(agentId) {
  try {
    console.log(`[DB-SYNC] Initializing database for agent: ${agentId}`)

    // Dynamic import from Next.js server build output
    const cozoDbModule = await import('../.next/server/app/api/agents/[id]/database/route.js')
      .catch(async () => {
        // Fallback: Try to use the built version from lib
        return await import(path.join(process.cwd(), '.next/server/chunks/[name].js'))
      })
      .catch(async () => {
        // Last resort: Use cozo-node directly
        const { CozoDb } = await import('cozo-node')

        const aiMaestroDir = path.join(os.homedir(), '.aimaestro', 'agents', agentId)
        const dbPath = path.join(aiMaestroDir, 'agent.db')

        if (!fs.existsSync(aiMaestroDir)) {
          fs.mkdirSync(aiMaestroDir, { recursive: true })
        }

        const db = new CozoDb('sqlite', dbPath)

        // Create metadata table
        db.run(`
          :create agent_metadata {
            key: String,
            value: String,
            created_at: Int,
            updated_at: Int
          }
        `)

        // Store metadata
        const now = Date.now()
        db.run(`
          ?[key, value, created_at, updated_at] <- [
            ['agent_id', '${agentId}', ${now}, ${now}],
            ['created_at', '${now}', ${now}, ${now}],
            ['db_version', '0.1.0', ${now}, ${now}]
          ]
          :put agent_metadata {key => value, created_at, updated_at}
        `)

        db.close()
        return true
      })

    console.log(`[DB-SYNC] ✅ Database initialized for ${agentId}`)
    return true
  } catch (error) {
    console.error(`[DB-SYNC] ❌ Failed to initialize database for ${agentId}:`, error.message)
    return false
  }
}

/**
 * Synchronize databases for all registered agents
 * Creates missing databases and reports statistics
 */
export async function syncAgentDatabases() {
  console.log('[DB-SYNC] Starting agent database synchronization...')

  const agents = getRegisteredAgents()
  const results = {
    total: agents.length,
    existing: 0,
    created: 0,
    failed: 0,
    agents: []
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
