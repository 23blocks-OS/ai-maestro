/**
 * AMP Relay Queue
 *
 * Implements store-and-forward for agents not yet registered locally.
 * Messages are queued when the recipient cannot be found and can be
 * picked up later via the /v1/messages/pending endpoint.
 *
 * Storage: ~/.agent-messaging/relay/{agentName}/*.json
 * TTL: 7 days (configurable via AMP_RELAY_TTL_DAYS)
 *
 * Note: For locally registered agents, messages are written directly
 * to their per-agent AMP inbox (~/.agent-messaging/agents/<name>/messages/inbox/).
 * The relay queue is only for agents not yet found on any host.
 */

import fs from 'fs'
import path from 'path'
import os from 'os'
import { AMP_RELAY_TTL_DAYS } from './types/amp'
import type { AMPEnvelope, AMPPayload, AMPPendingMessage, AMPPendingMessagesResponse } from './types/amp'

const AMP_BASE_DIR = path.join(os.homedir(), '.agent-messaging')
const RELAY_DIR = path.join(AMP_BASE_DIR, 'relay')

// ============================================================================
// Directory Helpers
// ============================================================================

/**
 * Get the relay directory for an agent
 */
function getAgentRelayDir(agentId: string): string {
  return path.join(RELAY_DIR, agentId)
}

/**
 * Ensure relay directories exist
 */
function ensureRelayDir(agentId: string): void {
  const dir = getAgentRelayDir(agentId)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
  }
}

// ============================================================================
// Relay Queue Operations
// ============================================================================

/**
 * Queue a message for later delivery
 * Called when the recipient agent is offline or unreachable
 */
export function queueMessage(
  agentId: string,
  envelope: AMPEnvelope,
  payload: AMPPayload,
  senderPublicKey: string
): AMPPendingMessage {
  ensureRelayDir(agentId)

  const now = new Date()
  // Use envelope's expires_at if provided, otherwise fall back to configured TTL
  const expiresAt = envelope.expires_at
    ? new Date(envelope.expires_at)
    : new Date(now.getTime() + AMP_RELAY_TTL_DAYS * 24 * 60 * 60 * 1000)

  const pendingMessage: AMPPendingMessage = {
    id: envelope.id,
    envelope,
    payload,
    sender_public_key: senderPublicKey,
    queued_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
    delivery_attempts: 0
  }

  const filePath = path.join(getAgentRelayDir(agentId), `${envelope.id}.json`)
  fs.writeFileSync(filePath, JSON.stringify(pendingMessage, null, 2), { mode: 0o600 })

  console.log(`[AMP Relay] Queued message ${envelope.id} for agent ${agentId.substring(0, 8)}...`)

  return pendingMessage
}

/**
 * Get pending messages for an agent
 * Optionally limited by count
 */
export function getPendingMessages(
  agentId: string,
  limit: number = 100
): AMPPendingMessagesResponse {
  const dir = getAgentRelayDir(agentId)

  if (!fs.existsSync(dir)) {
    return { messages: [], count: 0, remaining: 0 }
  }

  const files = fs.readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .sort() // Sort by filename (which includes timestamp)

  const now = new Date()
  const messages: AMPPendingMessage[] = []

  for (const file of files) {
    if (messages.length >= limit) break

    try {
      const content = fs.readFileSync(path.join(dir, file), 'utf-8')
      const msg = JSON.parse(content) as AMPPendingMessage

      // Skip expired messages (will be cleaned up later)
      if (new Date(msg.expires_at) < now) continue

      messages.push(msg)
    } catch (error) {
      console.error(`[AMP Relay] Failed to read message file ${file}:`, error)
    }
  }

  // Count remaining messages
  const totalCount = files.filter(f => {
    try {
      const content = fs.readFileSync(path.join(dir, f), 'utf-8')
      const msg = JSON.parse(content) as AMPPendingMessage
      return new Date(msg.expires_at) >= now
    } catch {
      return false
    }
  }).length

  return {
    messages,
    count: messages.length,
    remaining: Math.max(0, totalCount - messages.length)
  }
}

/**
 * Acknowledge receipt of a message (delete from relay queue)
 */
export function acknowledgeMessage(agentId: string, messageId: string): boolean {
  const filePath = path.join(getAgentRelayDir(agentId), `${messageId}.json`)

  if (!fs.existsSync(filePath)) {
    return false
  }

  try {
    fs.unlinkSync(filePath)
    console.log(`[AMP Relay] Acknowledged message ${messageId} for agent ${agentId.substring(0, 8)}...`)
    return true
  } catch (error) {
    console.error(`[AMP Relay] Failed to acknowledge message ${messageId}:`, error)
    return false
  }
}

/**
 * Acknowledge multiple messages at once
 */
export function acknowledgeMessages(agentId: string, messageIds: string[]): number {
  let acknowledged = 0

  for (const messageId of messageIds) {
    if (acknowledgeMessage(agentId, messageId)) {
      acknowledged++
    }
  }

  return acknowledged
}

/**
 * Get a specific pending message
 */
export function getPendingMessage(agentId: string, messageId: string): AMPPendingMessage | null {
  const filePath = path.join(getAgentRelayDir(agentId), `${messageId}.json`)

  if (!fs.existsSync(filePath)) {
    return null
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    const msg = JSON.parse(content) as AMPPendingMessage

    // Check if expired
    if (new Date(msg.expires_at) < new Date()) {
      // Delete expired message
      fs.unlinkSync(filePath)
      return null
    }

    return msg
  } catch (error) {
    console.error(`[AMP Relay] Failed to read message ${messageId}:`, error)
    return null
  }
}

/**
 * Update delivery attempt count for a message
 */
export function recordDeliveryAttempt(agentId: string, messageId: string): boolean {
  const filePath = path.join(getAgentRelayDir(agentId), `${messageId}.json`)

  if (!fs.existsSync(filePath)) {
    return false
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    const msg = JSON.parse(content) as AMPPendingMessage

    msg.delivery_attempts = (msg.delivery_attempts || 0) + 1
    msg.last_attempt_at = new Date().toISOString()

    fs.writeFileSync(filePath, JSON.stringify(msg, null, 2))
    return true
  } catch (error) {
    console.error(`[AMP Relay] Failed to update delivery attempt for ${messageId}:`, error)
    return false
  }
}

/**
 * Check if an agent has any pending messages
 */
export function hasPendingMessages(agentId: string): boolean {
  const dir = getAgentRelayDir(agentId)

  if (!fs.existsSync(dir)) {
    return false
  }

  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'))
  return files.length > 0
}

/**
 * Get count of pending messages for an agent
 */
export function getPendingCount(agentId: string): number {
  const dir = getAgentRelayDir(agentId)

  if (!fs.existsSync(dir)) {
    return 0
  }

  const now = new Date()
  let count = 0

  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'))

  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(dir, file), 'utf-8')
      const msg = JSON.parse(content) as AMPPendingMessage

      if (new Date(msg.expires_at) >= now) {
        count++
      }
    } catch {
      // Skip invalid files
    }
  }

  return count
}

// ============================================================================
// Cleanup Operations
// ============================================================================

/**
 * Clean up expired messages from an agent's relay queue
 */
export function cleanupExpiredMessages(agentId: string): number {
  const dir = getAgentRelayDir(agentId)

  if (!fs.existsSync(dir)) {
    return 0
  }

  const now = new Date()
  let cleaned = 0

  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'))

  for (const file of files) {
    const filePath = path.join(dir, file)
    try {
      const content = fs.readFileSync(filePath, 'utf-8')
      const msg = JSON.parse(content) as AMPPendingMessage

      if (new Date(msg.expires_at) < now) {
        fs.unlinkSync(filePath)
        cleaned++
      }
    } catch (error) {
      // Try to delete invalid files
      try {
        fs.unlinkSync(filePath)
        cleaned++
      } catch {
        // Ignore
      }
    }
  }

  if (cleaned > 0) {
    console.log(`[AMP Relay] Cleaned up ${cleaned} expired messages for agent ${agentId.substring(0, 8)}...`)
  }

  return cleaned
}

/**
 * Clean up all expired messages across all agents
 * Should be run periodically (e.g., hourly)
 */
export function cleanupAllExpiredMessages(): { agents: number; messages: number } {
  if (!fs.existsSync(RELAY_DIR)) {
    return { agents: 0, messages: 0 }
  }

  let totalAgents = 0
  let totalMessages = 0

  const agentDirs = fs.readdirSync(RELAY_DIR)

  for (const agentId of agentDirs) {
    const agentDir = path.join(RELAY_DIR, agentId)
    if (fs.statSync(agentDir).isDirectory()) {
      const cleaned = cleanupExpiredMessages(agentId)
      if (cleaned > 0) {
        totalAgents++
        totalMessages += cleaned
      }

      // Remove empty directories
      const remaining = fs.readdirSync(agentDir)
      if (remaining.length === 0) {
        fs.rmdirSync(agentDir)
      }
    }
  }

  if (totalMessages > 0) {
    console.log(`[AMP Relay] Total cleanup: ${totalMessages} messages from ${totalAgents} agents`)
  }

  return { agents: totalAgents, messages: totalMessages }
}

/**
 * Delete all messages for an agent (used when agent is deregistered)
 */
export function deleteAgentRelayQueue(agentId: string): boolean {
  const dir = getAgentRelayDir(agentId)

  if (!fs.existsSync(dir)) {
    return true
  }

  try {
    fs.rmSync(dir, { recursive: true })
    console.log(`[AMP Relay] Deleted relay queue for agent ${agentId.substring(0, 8)}...`)
    return true
  } catch (error) {
    console.error(`[AMP Relay] Failed to delete relay queue for ${agentId}:`, error)
    return false
  }
}
