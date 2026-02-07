/**
 * AMP Inbox Writer - Per-Agent Message Storage
 *
 * Writes messages in AMP envelope format to per-agent directories:
 *   ~/.agent-messaging/agents/<agentName>/messages/inbox/
 *   ~/.agent-messaging/agents/<agentName>/messages/sent/
 *
 * Each agent has its own AMP directory, which matches the AMP_DIR
 * environment variable set in their tmux session. This allows
 * amp-inbox.sh and other AMP scripts to work correctly per-agent.
 *
 * messageQueue.ts reads and writes exclusively from these AMP directories.
 */

import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'
import type { AMPEnvelope, AMPPayload } from '@/lib/types/amp'

const AMP_DIR = path.join(os.homedir(), '.agent-messaging')
const AMP_AGENTS_DIR = path.join(AMP_DIR, 'agents')

/**
 * Get the AMP home directory for a specific agent
 */
function getAgentAMPHome(agentName: string): string {
  return path.join(AMP_AGENTS_DIR, agentName)
}

/**
 * Sanitize an address for use as a directory name
 * Matches the logic in amp-helper.sh: sanitize_address_for_path()
 */
function sanitizeAddressForPath(address: string): string {
  return address.replace(/[@.]/g, '_').replace(/[^a-zA-Z0-9_-]/g, '')
}

/**
 * Extract agent name from an AMP address
 * e.g., "backend-architect@rnd23blocks.aimaestro.local" -> "backend-architect"
 */
function extractAgentName(address: string): string {
  const atIndex = address.indexOf('@')
  if (atIndex === -1) return address
  return address.substring(0, atIndex)
}

/**
 * Initialize the per-agent AMP directory structure.
 * Creates dirs and copies config/keys from the machine-level AMP dir if available.
 *
 * Directory structure:
 *   ~/.agent-messaging/agents/<agentName>/
 *     config.json
 *     keys/
 *     messages/inbox/
 *     messages/sent/
 *     registrations/
 */
export async function initAgentAMPHome(agentName: string): Promise<string> {
  const agentHome = getAgentAMPHome(agentName)
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
  } catch {
    // Agent config doesn't exist - create from machine config or defaults
    const machineConfig = path.join(AMP_DIR, 'config.json')
    try {
      const configData = JSON.parse(await fs.readFile(machineConfig, 'utf-8'))
      // Override agent name in config
      configData.agent = configData.agent || {}
      configData.agent.name = agentName
      await fs.writeFile(agentConfig, JSON.stringify(configData, null, 2))
    } catch {
      // No machine config - create minimal
      await fs.writeFile(agentConfig, JSON.stringify({
        version: 'amp/0.1',
        agent: { name: agentName },
        created_at: new Date().toISOString()
      }, null, 2))
    }
  }

  // Copy machine-level keys if agent doesn't have them yet
  try {
    await fs.access(path.join(agentKeys, 'private.pem'))
  } catch {
    // Try to copy from machine keys
    const machineKeys = path.join(AMP_DIR, 'keys')
    try {
      const privateKey = await fs.readFile(path.join(machineKeys, 'private.pem'))
      const publicKey = await fs.readFile(path.join(machineKeys, 'public.pem'))
      await fs.writeFile(path.join(agentKeys, 'private.pem'), privateKey)
      await fs.writeFile(path.join(agentKeys, 'public.pem'), publicKey)
    } catch {
      // No machine keys - agent will need to run amp-init
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
          // Copy registration file (update address to be agent-specific)
          const regData = JSON.parse(await fs.readFile(path.join(machineRegs, file), 'utf-8'))
          // Update the address to use the agent's name
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

  return agentHome
}

/**
 * Write a message to a specific agent's AMP inbox in envelope format.
 * This makes the message visible to amp-inbox.sh when the agent has
 * AMP_DIR set to their per-agent directory.
 *
 * Path: ~/.agent-messaging/agents/<recipientAgent>/messages/inbox/<sender_dir>/<id>.json
 */
export async function writeToAMPInbox(
  envelope: AMPEnvelope,
  payload: AMPPayload,
  recipientAgent?: string,
  senderPublicKey?: string
): Promise<string | null> {
  try {
    // Determine recipient agent name from parameter or envelope
    const agentName = recipientAgent || extractAgentName(envelope.to)
    if (!agentName) {
      console.error('[AMP Inbox Writer] Cannot determine recipient agent name')
      return null
    }

    const agentHome = getAgentAMPHome(agentName)
    const agentInboxDir = path.join(agentHome, 'messages', 'inbox')

    const senderDir = sanitizeAddressForPath(envelope.from)
    const inboxSenderDir = path.join(agentInboxDir, senderDir)

    await fs.mkdir(inboxSenderDir, { recursive: true })

    const ampMessage = {
      envelope: {
        version: 'amp/0.1',
        id: envelope.id,
        from: envelope.from,
        to: envelope.to,
        subject: envelope.subject,
        priority: envelope.priority || 'normal',
        timestamp: envelope.timestamp,
        thread_id: envelope.in_reply_to || envelope.id,
        in_reply_to: envelope.in_reply_to || null,
        expires_at: null,
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
 *
 * Path: ~/.agent-messaging/agents/<senderAgent>/messages/sent/<recipient_dir>/<id>.json
 */
export async function writeToAMPSent(
  envelope: AMPEnvelope,
  payload: AMPPayload,
  senderAgent?: string
): Promise<string | null> {
  try {
    const agentName = senderAgent || extractAgentName(envelope.from)
    if (!agentName) {
      console.error('[AMP Inbox Writer] Cannot determine sender agent name')
      return null
    }

    const agentHome = getAgentAMPHome(agentName)
    const agentSentDir = path.join(agentHome, 'messages', 'sent')

    const recipientDir = sanitizeAddressForPath(envelope.to)
    const sentRecipientDir = path.join(agentSentDir, recipientDir)

    await fs.mkdir(sentRecipientDir, { recursive: true })

    const ampMessage = {
      envelope: {
        version: 'amp/0.1',
        id: envelope.id,
        from: envelope.from,
        to: envelope.to,
        subject: envelope.subject,
        priority: envelope.priority || 'normal',
        timestamp: envelope.timestamp,
        thread_id: envelope.in_reply_to || envelope.id,
        in_reply_to: envelope.in_reply_to || null,
        expires_at: null,
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

/**
 * Check if the AMP directory exists (agent-messaging is initialized on this machine)
 */
export async function isAMPInitialized(): Promise<boolean> {
  try {
    await fs.access(path.join(AMP_DIR, 'config.json'))
    return true
  } catch {
    // Also check if agents dir exists (server may have created per-agent dirs)
    try {
      await fs.access(AMP_AGENTS_DIR)
      return true
    } catch {
      return false
    }
  }
}

/**
 * Get the AMP_DIR path that should be set in an agent's tmux session environment.
 * This is used by session creation/wake to set AMP_DIR for AMP CLI scripts.
 */
export function getAgentAMPDir(agentName: string): string {
  return getAgentAMPHome(agentName)
}
