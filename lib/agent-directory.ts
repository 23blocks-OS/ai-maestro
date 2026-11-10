/**
 * Agent Directory (Phase 3: AMP Protocol Fix)
 *
 * A distributed directory service for locating agents across the mesh network.
 * Each AI Maestro instance maintains its own directory of known agents.
 *
 * Local agents are kept in ~/.aimaestro/agent-directory.json (rebuilt from the registry).
 * Other hosts' agents are read from the copies /mesh keeps (docs/SPEC-MESH-SYNC.md):
 * a host on the mesh is listed, a host off it is not. Nothing here asks a peer.
 */

import fs from 'fs'
import path from 'path'
import os from 'os'
import { getSelfHostId, getPeerHosts } from './hosts-config'
import { peerAgents } from '@/services/shared-state'
import { loadAgents, normalizeHostId } from './agent-registry'

const AIMAESTRO_DIR = path.join(os.homedir(), '.aimaestro')
const DIRECTORY_FILE = path.join(AIMAESTRO_DIR, 'agent-directory.json')

// Cache TTL in milliseconds (5 minutes)
const CACHE_TTL = 5 * 60 * 1000

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
  const normalizedName = name.toLowerCase()
  const local = loadDirectory().entries[normalizedName]
  if (local?.source === 'local') return local
  return meshEntries()[normalizedName] || null
}

/** Every agent of the peers on /mesh, as the registry records them (for label and alias lookups) */
export function meshAgents(): any[] {
  const out: any[] = []
  for (const [hostId, copy] of peerAgents) {
    if (copy.connected) for (const a of Object.values(copy.items) as any[]) out.push({ ...a, hostId: a.hostId || hostId })
  }
  return out
}

/** The directory entry of one peer's agent, even when an agent here has the same name */
export function lookupMeshAgent(name: string, hostId: string): AgentDirectoryEntry | null {
  const e = meshEntries(hostId)[name.toLowerCase()]
  return e || null
}

/** Entries for the agents of every peer on /mesh (or of one), by lowercase name */
function meshEntries(onlyHost?: string): Record<string, AgentDirectoryEntry> {
  const out: Record<string, AgentDirectoryEntry> = {}
  let urls = new Map<string, string>()
  try { urls = new Map(getPeerHosts().map(h => [h.id, h.url])) } catch { /* no host list */ }
  for (const [hostId, copy] of peerAgents) {
    if (!copy.connected || (onlyHost && hostId !== onlyHost)) continue
    for (const a of Object.values(copy.items) as any[]) {
      const name = (a.name || a.alias)?.toLowerCase()
      if (!name || a.deletedAt) continue
      out[name] = {
        name,
        hostId: normalizeHostId(a.hostId || hostId),
        hostUrl: a.hostUrl || urls.get(hostId),
        ampAddress: a.metadata?.amp?.address,
        ampRegistered: a.ampRegistered === true,
        lastSeen: new Date(copy.okAt || Date.now()).toISOString(),
        source: 'remote',
      }
    }
  }
  return out
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
  const local = Object.values(loadDirectory().entries).filter(e => e.source === 'local')
  const merged = meshEntries()
  for (const e of local) merged[e.name] = e // this host's own agents win
  return Object.values(merged)
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
  const entries = getAllDirectoryEntries()

  return {
    total: entries.length,
    local: entries.filter(e => e.source === 'local').length,
    remote: entries.filter(e => e.source === 'remote').length,
    ampRegistered: entries.filter(e => e.ampRegistered).length,
    version: directory.version,
    lastSync: directory.lastSync
  }
}

/**
 * Get local entries for sharing with peers
 */
export function getLocalEntriesForSync(): AgentDirectoryEntry[] {
  const directory = loadDirectory()
  return Object.values(directory.entries).filter(e => e.source === 'local')
}
