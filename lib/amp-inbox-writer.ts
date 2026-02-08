/**
 * AMP Inbox Writer - Per-Agent Message Storage
 *
 * Writes messages in AMP envelope format to per-agent directories:
 *   ~/.agent-messaging/agents/<uuid>/messages/inbox/
 *   ~/.agent-messaging/agents/<uuid>/messages/sent/
 *
 * Agent directories are keyed by UUID for stability across renames.
 * A name→UUID index file provides lookup without symlinks:
 *   ~/.agent-messaging/agents/.index.json
 *
 * Each agent has its own AMP directory, which matches the AMP_DIR
 * environment variable set in their tmux session. This allows
 * amp-inbox.sh and other AMP scripts to work correctly per-agent.
 */

import { promises as fs } from 'fs'
import * as fsSync from 'fs'
import path from 'path'
import os from 'os'
import type { AMPEnvelope, AMPPayload } from '@/lib/types/amp'

const AMP_DIR = path.join(os.homedir(), '.agent-messaging')
const AMP_AGENTS_DIR = path.join(AMP_DIR, 'agents')
const AMP_INDEX_FILE = path.join(AMP_AGENTS_DIR, '.index.json')

// ============================================================================
// Name → UUID Index
// ============================================================================

/**
 * Read the name→UUID index from disk.
 */
function readIndex(): Record<string, string> {
  try {
    return JSON.parse(fsSync.readFileSync(AMP_INDEX_FILE, 'utf-8'))
  } catch {
    return {}
  }
}

/**
 * Write the name→UUID index to disk.
 */
function writeIndex(index: Record<string, string>): void {
  try {
    fsSync.mkdirSync(AMP_AGENTS_DIR, { recursive: true })
    fsSync.writeFileSync(AMP_INDEX_FILE, JSON.stringify(index, null, 2))
  } catch (error) {
    console.error('[AMP Index] Failed to write index:', error)
  }
}

/**
 * Update a single entry in the name→UUID index.
 */
export function updateIndex(agentName: string, agentId: string): void {
  const index = readIndex()
  index[agentName] = agentId
  writeIndex(index)
}

/**
 * Remove an entry from the name→UUID index.
 */
export function removeFromIndex(agentName: string): void {
  const index = readIndex()
  delete index[agentName]
  writeIndex(index)
}

/**
 * Rename an entry in the name→UUID index.
 */
export function renameInIndex(oldName: string, newName: string, agentId: string): void {
  const index = readIndex()
  delete index[oldName]
  index[newName] = agentId
  writeIndex(index)
}

/**
 * Look up a UUID from a name via the index.
 */
function lookupUUID(agentName: string): string | undefined {
  const index = readIndex()
  return index[agentName]
}

// ============================================================================
// Directory Resolution
// ============================================================================

/**
 * Get the AMP home directory for a specific agent by UUID.
 */
function getAgentAMPHomeById(agentId: string): string {
  return path.join(AMP_AGENTS_DIR, agentId)
}

/**
 * Resolve the canonical AMP home for an agent.
 * Priority: UUID param > index lookup by name > legacy name dir.
 */
function resolveAgentAMPHome(agentName: string, agentId?: string): string {
  // 1. UUID provided directly
  if (agentId) {
    return getAgentAMPHomeById(agentId)
  }
  // 2. Look up UUID from index
  const indexedId = lookupUUID(agentName)
  if (indexedId) {
    return getAgentAMPHomeById(indexedId)
  }
  // 3. Fallback: legacy name-based dir (pre-migration)
  return path.join(AMP_AGENTS_DIR, agentName)
}

/**
 * Sanitize an address for use as a directory name.
 * Matches the logic in amp-helper.sh: sanitize_address_for_path()
 */
function sanitizeAddressForPath(address: string): string {
  return address.replace(/[@.]/g, '_').replace(/[^a-zA-Z0-9_-]/g, '')
}

/**
 * Extract agent name from an AMP address.
 * e.g., "backend-architect@rnd23blocks.aimaestro.local" -> "backend-architect"
 */
function extractAgentName(address: string): string {
  const atIndex = address.indexOf('@')
  if (atIndex === -1) return address
  return address.substring(0, atIndex)
}

// ============================================================================
// Auto-Migration
// ============================================================================

/**
 * Auto-migrate a legacy name-keyed directory to UUID-keyed.
 * If a name dir exists and UUID dir doesn't, rename it.
 * No symlinks — just updates the index.
 */
async function autoMigrateToUUID(agentName: string, agentId: string): Promise<boolean> {
  const nameDir = path.join(AMP_AGENTS_DIR, agentName)
  const uuidDir = path.join(AMP_AGENTS_DIR, agentId)

  try {
    // Only migrate if: name dir exists as real dir, UUID dir doesn't exist
    if (!fsSync.existsSync(nameDir) || fsSync.existsSync(uuidDir)) {
      return false
    }
    // Don't migrate if nameDir is actually a UUID already
    if (nameDir === uuidDir) return false

    // Rename name dir → uuid dir
    await fs.rename(nameDir, uuidDir)

    // Update config.json with agent.id
    const configPath = path.join(uuidDir, 'config.json')
    try {
      const configData = JSON.parse(await fs.readFile(configPath, 'utf-8'))
      configData.agent = configData.agent || {}
      configData.agent.id = agentId
      await fs.writeFile(configPath, JSON.stringify(configData, null, 2))
    } catch {
      // Best-effort
    }

    // Update the index
    updateIndex(agentName, agentId)

    console.log(`[AMP Inbox Writer] Auto-migrated ${agentName} -> ${agentId}`)
    return true
  } catch (error) {
    console.error(`[AMP Inbox Writer] Auto-migration failed for ${agentName}:`, error)
    return false
  }
}

// ============================================================================
// Init
// ============================================================================

/**
 * Initialize the per-agent AMP directory structure.
 * Creates dirs and copies config/keys from the machine-level AMP dir if available.
 *
 * When agentId is provided, uses UUID-keyed directory.
 * Auto-migrates legacy name-keyed directories to UUID on first access.
 *
 * Directory structure:
 *   ~/.agent-messaging/agents/<uuid>/
 *     config.json      (includes agent.id field)
 *     keys/
 *     messages/inbox/
 *     messages/sent/
 *     registrations/
 *   ~/.agent-messaging/agents/.index.json   (name→UUID lookup)
 */
export async function initAgentAMPHome(agentName: string, agentId?: string): Promise<string> {
  // If agentId provided, try auto-migration first
  if (agentId) {
    await autoMigrateToUUID(agentName, agentId)
  }

  // Resolve the canonical home (UUID dir if agentId provided, else name dir)
  const agentHome = agentId ? getAgentAMPHomeById(agentId) : path.join(AMP_AGENTS_DIR, agentName)
  const agentInbox = path.join(agentHome, 'messages', 'inbox')
  const agentSent = path.join(agentHome, 'messages', 'sent')
  const agentKeys = path.join(agentHome, 'keys')
  const agentRegs = path.join(agentHome, 'registrations')

  // Create directory structure
  await fs.mkdir(agentInbox, { recursive: true })
  await fs.mkdir(agentSent, { recursive: true })
  await fs.mkdir(agentKeys, { recursive: true })
  await fs.mkdir(agentRegs, { recursive: true })

  // Copy machine-level config if agent doesn't have one yet
  const agentConfig = path.join(agentHome, 'config.json')
  try {
    await fs.access(agentConfig)
    // Config exists — ensure agent.id is set if we have it
    if (agentId) {
      try {
        const existingConfig = JSON.parse(await fs.readFile(agentConfig, 'utf-8'))
        if (!existingConfig.agent?.id) {
          existingConfig.agent = existingConfig.agent || {}
          existingConfig.agent.id = agentId
          await fs.writeFile(agentConfig, JSON.stringify(existingConfig, null, 2))
        }
      } catch {
        // Best-effort
      }
    }
  } catch {
    // Agent config doesn't exist — create from machine config or defaults
    const machineConfig = path.join(AMP_DIR, 'config.json')
    try {
      const configData = JSON.parse(await fs.readFile(machineConfig, 'utf-8'))
      configData.agent = configData.agent || {}
      configData.agent.name = agentName
      if (agentId) configData.agent.id = agentId
      await fs.writeFile(agentConfig, JSON.stringify(configData, null, 2))
    } catch {
      const minimalConfig: Record<string, unknown> = {
        version: 'amp/0.1',
        agent: { name: agentName, ...(agentId ? { id: agentId } : {}) },
        created_at: new Date().toISOString()
      }
      await fs.writeFile(agentConfig, JSON.stringify(minimalConfig, null, 2))
    }
  }

  // Copy machine-level keys if agent doesn't have them yet
  try {
    await fs.access(path.join(agentKeys, 'private.pem'))
  } catch {
    const machineKeys = path.join(AMP_DIR, 'keys')
    try {
      const privateKey = await fs.readFile(path.join(machineKeys, 'private.pem'))
      const publicKey = await fs.readFile(path.join(machineKeys, 'public.pem'))
      await fs.writeFile(path.join(agentKeys, 'private.pem'), privateKey)
      await fs.writeFile(path.join(agentKeys, 'public.pem'), publicKey)
    } catch {
      // No machine keys — agent will need to run amp-init
    }
  }

  // Copy machine-level registrations if agent doesn't have them
  try {
    const machineRegs = path.join(AMP_DIR, 'registrations')
    const regFiles = await fs.readdir(machineRegs)
    for (const file of regFiles) {
      if (file.endsWith('.json')) {
        const destFile = path.join(agentRegs, file)
        try {
          await fs.access(destFile)
        } catch {
          const regData = JSON.parse(await fs.readFile(path.join(machineRegs, file), 'utf-8'))
          if (regData.address) {
            const parts = regData.address.split('@')
            if (parts.length === 2) {
              regData.address = `${agentName}@${parts[1]}`
            }
          }
          await fs.writeFile(destFile, JSON.stringify(regData, null, 2))
        }
      }
    }
  } catch {
    // No machine registrations
  }

  // Update the name→UUID index
  if (agentId) {
    updateIndex(agentName, agentId)
  }

  return agentHome
}

// ============================================================================
// Inbox / Sent Writers
// ============================================================================

/**
 * Write a message to a specific agent's AMP inbox in envelope format.
 * Prefers UUID-based directory when recipientAgentId is provided.
 */
export async function writeToAMPInbox(
  envelope: AMPEnvelope,
  payload: AMPPayload,
  recipientAgent?: string,
  senderPublicKey?: string,
  recipientAgentId?: string
): Promise<string | null> {
  try {
    const agentName = recipientAgent || extractAgentName(envelope.to)
    if (!agentName) {
      console.error('[AMP Inbox Writer] Cannot determine recipient agent name')
      return null
    }

    const agentHome = resolveAgentAMPHome(agentName, recipientAgentId)
    const agentInboxDir = path.join(agentHome, 'messages', 'inbox')
    const senderDir = sanitizeAddressForPath(envelope.from)
    const inboxSenderDir = path.join(agentInboxDir, senderDir)

    await fs.mkdir(inboxSenderDir, { recursive: true })

    const ampMessage = {
      envelope: {
        version: envelope.version || 'amp/0.1',
        id: envelope.id,
        from: envelope.from,
        to: envelope.to,
        subject: envelope.subject,
        priority: envelope.priority || 'normal',
        timestamp: envelope.timestamp,
        thread_id: envelope.thread_id || envelope.in_reply_to || envelope.id,
        in_reply_to: envelope.in_reply_to || null,
        expires_at: envelope.expires_at || null,
        signature: envelope.signature || null
      },
      payload: {
        type: payload.type,
        message: payload.message,
        context: payload.context || null
      },
      metadata: {
        status: 'unread',
        queued_at: envelope.timestamp,
        delivery_attempts: 1
      },
      local: {
        received_at: new Date().toISOString(),
        delivery_method: 'local',
        status: 'unread'
      },
      ...(senderPublicKey ? { sender_public_key: senderPublicKey } : {})
    }

    const filePath = path.join(inboxSenderDir, `${envelope.id}.json`)
    await fs.writeFile(filePath, JSON.stringify(ampMessage, null, 2))

    console.log(`[AMP Inbox Writer] Wrote ${envelope.id} to ${agentName}'s inbox`)
    return filePath
  } catch (error) {
    console.error(`[AMP Inbox Writer] Failed to write to AMP inbox:`, error)
    return null
  }
}

/**
 * Write a message to a specific agent's AMP sent folder.
 */
export async function writeToAMPSent(
  envelope: AMPEnvelope,
  payload: AMPPayload,
  senderAgent?: string,
  senderAgentId?: string
): Promise<string | null> {
  try {
    const agentName = senderAgent || extractAgentName(envelope.from)
    if (!agentName) {
      console.error('[AMP Inbox Writer] Cannot determine sender agent name')
      return null
    }

    const agentHome = resolveAgentAMPHome(agentName, senderAgentId)
    const agentSentDir = path.join(agentHome, 'messages', 'sent')
    const recipientDir = sanitizeAddressForPath(envelope.to)
    const sentRecipientDir = path.join(agentSentDir, recipientDir)

    await fs.mkdir(sentRecipientDir, { recursive: true })

    const ampMessage = {
      envelope: {
        version: envelope.version || 'amp/0.1',
        id: envelope.id,
        from: envelope.from,
        to: envelope.to,
        subject: envelope.subject,
        priority: envelope.priority || 'normal',
        timestamp: envelope.timestamp,
        thread_id: envelope.thread_id || envelope.in_reply_to || envelope.id,
        in_reply_to: envelope.in_reply_to || null,
        expires_at: envelope.expires_at || null,
        signature: envelope.signature || null
      },
      payload: {
        type: payload.type,
        message: payload.message,
        context: payload.context || null
      },
      local: {
        sent_at: new Date().toISOString()
      }
    }

    const filePath = path.join(sentRecipientDir, `${envelope.id}.json`)
    await fs.writeFile(filePath, JSON.stringify(ampMessage, null, 2))

    return filePath
  } catch (error) {
    console.error(`[AMP Inbox Writer] Failed to write to AMP sent:`, error)
    return null
  }
}

// ============================================================================
// Utility
// ============================================================================

/**
 * Check if AMP is initialized on this machine.
 */
export async function isAMPInitialized(): Promise<boolean> {
  try {
    await fs.access(path.join(AMP_DIR, 'config.json'))
    return true
  } catch {
    try {
      await fs.access(AMP_AGENTS_DIR)
      return true
    } catch {
      return false
    }
  }
}

/**
 * Get the AMP_DIR path for an agent's tmux session environment.
 * When agentId is provided, returns the UUID-based path (stable across renames).
 */
export function getAgentAMPDir(agentName: string, agentId?: string): string {
  if (agentId) {
    return getAgentAMPHomeById(agentId)
  }
  // Try index lookup
  const indexedId = lookupUUID(agentName)
  if (indexedId) {
    return getAgentAMPHomeById(indexedId)
  }
  return path.join(AMP_AGENTS_DIR, agentName)
}
