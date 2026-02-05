/**
 * Agent Directory (Phase 3: AMP Protocol Fix)
 *
 * A distributed directory service for locating agents across the mesh network.
 * Each AI Maestro instance maintains its own directory of known agents.
 *
 * Key features:
 * - Fast agent name -> host location lookups
 * - Mesh-wide agent discovery
 * - Periodic sync with peer hosts
 * - Caching with TTL for performance
 */

import fs from 'fs'
import path from 'path'
import os from 'os'
import { getSelfHostId, getPeerHosts } from './hosts-config'
import { loadAgents, normalizeHostId } from './agent-registry'

const AIMAESTRO_DIR = path.join(os.homedir(), '.aimaestro')
const DIRECTORY_FILE = path.join(AIMAESTRO_DIR, 'agent-directory.json')

// Cache TTL in milliseconds (5 minutes)
const CACHE_TTL = 5 * 60 * 1000

// Directory sync interval (1 minute)
const SYNC_INTERVAL = 60 * 1000

// ============================================================================
// Types
// ============================================================================

/**
 * Directory entry for a single agent
 */
export interface AgentDirectoryEntry {
  name: string                  // Agent name (e.g., "backend-api")
  hostId: string                // Host where agent lives
  hostUrl?: string              // URL to reach the host
  ampAddress?: string           // Full AMP address (e.g., "backend-api@acme.aimaestro.local")
  ampRegistered: boolean        // Is this a proper AMP-registered agent?
  lastSeen: string              // ISO timestamp of last verification
  source: 'local' | 'remote'    // Where we learned about this agent
}

/**
 * Full agent directory state
 */
export interface AgentDirectory {
  version: number               // Directory version (increments on changes)
  lastSync: string              // When directory was last synced
  entries: Record<string, AgentDirectoryEntry>  // name -> entry
}

// ============================================================================
// Directory Storage
// ============================================================================

let directoryCache: AgentDirectory | null = null
let cacheTimestamp: number = 0

/**
 * Ensure the .aimaestro directory exists
 */
function ensureDir(): void {
  if (!fs.existsSync(AIMAESTRO_DIR)) {
    fs.mkdirSync(AIMAESTRO_DIR, { recursive: true })
  }
}

/**
 * Load directory from disk
 */
function loadDirectory(): AgentDirectory {
  // Check cache
  if (directoryCache && (Date.now() - cacheTimestamp) < CACHE_TTL) {
    return directoryCache
  }

  ensureDir()

  if (!fs.existsSync(DIRECTORY_FILE)) {
    const emptyDir: AgentDirectory = {
      version: 0,
      lastSync: new Date().toISOString(),
      entries: {}
    }
    return emptyDir
  }

  try {
    const data = fs.readFileSync(DIRECTORY_FILE, 'utf-8')
    directoryCache = JSON.parse(data)
    cacheTimestamp = Date.now()
    return directoryCache!
  } catch (error) {
    console.error('[Agent Directory] Failed to load directory:', error)
    return {
      version: 0,
      lastSync: new Date().toISOString(),
      entries: {}
    }
  }
}

/**
 * Save directory to disk
 */
function saveDirectory(directory: AgentDirectory): boolean {
  ensureDir()

  try {
    directory.version++
    directory.lastSync = new Date().toISOString()
    fs.writeFileSync(DIRECTORY_FILE, JSON.stringify(directory, null, 2), 'utf-8')
    directoryCache = directory
    cacheTimestamp = Date.now()
    return true
  } catch (error) {
    console.error('[Agent Directory] Failed to save directory:', error)
    return false
  }
}

/**
 * Clear directory cache
 */
export function clearDirectoryCache(): void {
  directoryCache = null
  cacheTimestamp = 0
}

// ============================================================================
// Directory Operations
// ============================================================================

/**
 * Rebuild directory from local agents
 * Called on startup or when agents change
 */
export function rebuildLocalDirectory(): AgentDirectory {
  const directory = loadDirectory()
  const agents = loadAgents()
  const selfHostId = normalizeHostId(getSelfHostId())

  // Remove stale local entries
  for (const [name, entry] of Object.entries(directory.entries)) {
    if (entry.source === 'local' && entry.hostId === selfHostId) {
      // Check if agent still exists locally
      const stillExists = agents.some(a =>
        (a.name || a.alias)?.toLowerCase() === name.toLowerCase() &&
        normalizeHostId(a.hostId) === selfHostId
      )
      if (!stillExists) {
        delete directory.entries[name]
      }
    }
  }

  // Add/update local agents
  for (const agent of agents) {
    const name = (agent.name || agent.alias)?.toLowerCase()
    if (!name) continue

    const hostId = normalizeHostId(agent.hostId)
    if (hostId !== selfHostId) continue  // Only local agents

    directory.entries[name] = {
      name,
      hostId,
      hostUrl: agent.hostUrl,
      ampAddress: agent.metadata?.amp?.address,
      ampRegistered: agent.ampRegistered === true,
      lastSeen: new Date().toISOString(),
      source: 'local'
    }
  }

  saveDirectory(directory)
  return directory
}

/**
 * Look up an agent in the directory
 */
export function lookupAgent(name: string): AgentDirectoryEntry | null {
  const directory = loadDirectory()
  const normalizedName = name.toLowerCase()
  return directory.entries[normalizedName] || null
}

/**
 * Register a remote agent in the directory
 * Called when we learn about agents from peer hosts
 */
export function registerRemoteAgent(entry: Omit<AgentDirectoryEntry, 'source' | 'lastSeen'>): boolean {
  const directory = loadDirectory()
  const normalizedName = entry.name.toLowerCase()

  // Don't overwrite local entries with remote ones
  const existing = directory.entries[normalizedName]
  if (existing && existing.source === 'local') {
    console.log(`[Agent Directory] Skipping remote update for local agent: ${normalizedName}`)
    return false
  }

  directory.entries[normalizedName] = {
    ...entry,
    name: normalizedName,
    lastSeen: new Date().toISOString(),
    source: 'remote'
  }

  return saveDirectory(directory)
}

/**
 * Remove an agent from the directory
 */
export function unregisterAgent(name: string): boolean {
  const directory = loadDirectory()
  const normalizedName = name.toLowerCase()

  if (!directory.entries[normalizedName]) {
    return false
  }

  delete directory.entries[normalizedName]
  return saveDirectory(directory)
}

/**
 * Get all entries in the directory
 */
export function getAllDirectoryEntries(): AgentDirectoryEntry[] {
  const directory = loadDirectory()
  return Object.values(directory.entries)
}

/**
 * Get directory statistics
 */
export function getDirectoryStats(): {
  total: number
  local: number
  remote: number
  ampRegistered: number
  version: number
  lastSync: string
} {
  const directory = loadDirectory()
  const entries = Object.values(directory.entries)

  return {
    total: entries.length,
    local: entries.filter(e => e.source === 'local').length,
    remote: entries.filter(e => e.source === 'remote').length,
    ampRegistered: entries.filter(e => e.ampRegistered).length,
    version: directory.version,
    lastSync: directory.lastSync
  }
}

// ============================================================================
// Mesh Sync
// ============================================================================

/**
 * Sync directory with peer hosts
 * Fetches agent lists from all known peers and updates directory
 */
export async function syncWithPeers(timeout: number = 5000): Promise<{
  synced: string[]
  failed: string[]
  newAgents: number
}> {
  const peerHosts = getPeerHosts()
  const result = {
    synced: [] as string[],
    failed: [] as string[],
    newAgents: 0
  }

  for (const host of peerHosts) {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeout)

      const response = await fetch(`${host.url}/api/agents/directory`, {
        signal: controller.signal
      })
      clearTimeout(timeoutId)

      if (!response.ok) {
        result.failed.push(host.id)
        continue
      }

      const data = await response.json()
      if (data.entries && Array.isArray(data.entries)) {
        for (const entry of data.entries) {
          // Only import entries from the peer's local agents
          if (entry.source === 'local' && entry.hostId === host.id) {
            const existing = lookupAgent(entry.name)
            if (!existing || existing.source === 'remote') {
              registerRemoteAgent({
                name: entry.name,
                hostId: entry.hostId,
                hostUrl: entry.hostUrl || host.url,
                ampAddress: entry.ampAddress,
                ampRegistered: entry.ampRegistered
              })
              result.newAgents++
            }
          }
        }
      }

      result.synced.push(host.id)
    } catch (error) {
      result.failed.push(host.id)
    }
  }

  return result
}

/**
 * Get local entries for sharing with peers
 */
export function getLocalEntriesForSync(): AgentDirectoryEntry[] {
  const directory = loadDirectory()
  return Object.values(directory.entries).filter(e => e.source === 'local')
}

// ============================================================================
// Background Sync (Optional)
// ============================================================================

let syncInterval: NodeJS.Timeout | null = null

/**
 * Start periodic directory sync with peers
 */
export function startDirectorySync(intervalMs: number = SYNC_INTERVAL): void {
  if (syncInterval) {
    clearInterval(syncInterval)
  }

  // Do initial sync
  rebuildLocalDirectory()
  syncWithPeers().then(result => {
    if (result.newAgents > 0) {
      console.log(`[Agent Directory] Initial sync: discovered ${result.newAgents} new agents`)
    }
  }).catch(err => {
    console.error('[Agent Directory] Initial sync failed:', err)
  })

  // Set up periodic sync
  syncInterval = setInterval(async () => {
    try {
      const result = await syncWithPeers()
      if (result.newAgents > 0) {
        console.log(`[Agent Directory] Sync: discovered ${result.newAgents} new agents`)
      }
    } catch (err) {
      console.error('[Agent Directory] Periodic sync failed:', err)
    }
  }, intervalMs)

  console.log(`[Agent Directory] Started periodic sync (every ${intervalMs / 1000}s)`)
}

/**
 * Stop periodic directory sync
 */
export function stopDirectorySync(): void {
  if (syncInterval) {
    clearInterval(syncInterval)
    syncInterval = null
    console.log('[Agent Directory] Stopped periodic sync')
  }
}
