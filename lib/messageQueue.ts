import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'
import { getSelfHost, getSelfHostId, isSelf } from './hosts-config-server.mjs'
import { loadAgents, getAgentBySession, getAgentByName, getAgentByNameAnyHost, getAgentByAlias, getAgentByAliasAnyHost, getAgent } from './agent-registry'
import type { Agent } from '@/types/agent'

/**
 * Get this host's name for messages
 * Uses the hostname (e.g., 'macbook-pro', 'mac-mini') for cross-host compatibility
 */
function getSelfHostName(): string {
  try {
    const selfHost = getSelfHost()
    return selfHost.name || getSelfHostId() || 'unknown-host'
  } catch {
    return getSelfHostId() || 'unknown-host'
  }
}

export interface Message {
  id: string
  from: string           // Agent ID (or session name for backward compat)
  fromAlias?: string     // Agent name for addressing (e.g., "23blocks-api-auth")
  fromLabel?: string     // Agent display label (e.g., "API Authentication")
  fromSession?: string   // Actual session name (for delivery)
  fromHost?: string      // Host ID where sender resides (e.g., 'macbook-pro', 'mac-mini')
  fromVerified?: boolean // True if sender is a registered agent, false for external agents
  to: string             // Agent ID (or session name for backward compat)
  toAlias?: string       // Agent name for addressing
  toLabel?: string       // Agent display label
  toSession?: string     // Actual session name (for delivery)
  toHost?: string        // Host ID where recipient resides
  timestamp: string
  subject: string
  priority: 'low' | 'normal' | 'high' | 'urgent'
  status: 'unread' | 'read' | 'archived'
  content: {
    type: 'request' | 'response' | 'notification' | 'update'
    message: string
    context?: Record<string, any>
    attachments?: Array<{
      name: string
      path: string
      type: string
    }>
  }
  inReplyTo?: string
  forwardedFrom?: {
    originalMessageId: string
    originalFrom: string
    originalTo: string
    originalTimestamp: string
    forwardedBy: string
    forwardedAt: string
    forwardNote?: string
  }
  // AMP Protocol fields (for cryptographic verification)
  amp?: {
    signature?: string           // Ed25519 signature of envelope (base64)
    senderPublicKey?: string     // Sender's public key (hex)
    signatureVerified?: boolean  // True if signature was cryptographically verified
    ampAddress?: string          // Full AMP address (name@tenant.provider)
    envelopeId?: string          // Original AMP envelope ID
  }
}

export interface MessageSummary {
  id: string
  from: string
  fromAlias?: string
  fromLabel?: string      // Agent display label
  fromHost?: string
  fromVerified?: boolean  // True if sender is registered, false for external agents
  to: string
  toAlias?: string
  toLabel?: string        // Agent display label
  toHost?: string
  timestamp: string
  subject: string
  priority: 'low' | 'normal' | 'high' | 'urgent'
  status: 'unread' | 'read' | 'archived'
  type: 'request' | 'response' | 'notification' | 'update'
  preview: string
  viaSlack?: boolean  // True if message originated from Slack bridge
}

interface ResolvedAgent {
  agentId: string
  alias: string
  displayName?: string
  sessionName?: string  // Current tmux session (may be null if offline)
  hostId?: string       // Host ID (e.g., 'macbook-pro', 'mac-mini')
  hostUrl?: string      // Full URL to reach this agent's host (e.g., 'http://localhost:23000')
}

const AMP_AGENTS_DIR = path.join(os.homedir(), '.agent-messaging', 'agents')

// === AMP Per-Agent Directory Support (AMP Protocol) ===

function getAMPInboxDir(agentName: string): string {
  return path.join(AMP_AGENTS_DIR, agentName, 'messages', 'inbox')
}

function getAMPSentDir(agentName: string): string {
  return path.join(AMP_AGENTS_DIR, agentName, 'messages', 'sent')
}

function extractAgentNameFromAddress(address: string): string {
  const atIndex = address.indexOf('@')
  if (atIndex === -1) return address
  return address.substring(0, atIndex)
}

function extractHostFromAddress(address: string): string | undefined {
  const atIndex = address.indexOf('@')
  if (atIndex === -1) return undefined
  const hostPart = address.substring(atIndex + 1)
  return hostPart.split('.')[0]
}

/** Normalize AMP message IDs (underscores) to internal format (dashes) */
function normalizeMessageId(id: string): string {
  return id.replace(/_/g, '-')
}

/** Convert an AMP envelope-format message to internal Message format */
function convertAMPToMessage(ampMsg: any): Message | null {
  const envelope = ampMsg.envelope
  const payload = ampMsg.payload
  if (!envelope || !payload) return null

  const fromName = extractAgentNameFromAddress(envelope.from)
  const toName = extractAgentNameFromAddress(envelope.to)
  const fromHost = extractHostFromAddress(envelope.from)
  const toHost = extractHostFromAddress(envelope.to)
  const id = normalizeMessageId(envelope.id)
  const status = ampMsg.metadata?.status || ampMsg.local?.status || 'unread'

  return {
    id,
    from: fromName,
    fromAlias: fromName,
    fromHost,
    to: toName,
    toAlias: toName,
    toHost,
    timestamp: envelope.timestamp,
    subject: envelope.subject,
    priority: envelope.priority || 'normal',
    status: status as Message['status'],
    content: {
      type: payload.type || 'notification',
      message: payload.message || '',
      context: payload.context || undefined,
    },
    inReplyTo: envelope.in_reply_to || undefined,
  }
}

/**
 * Collect messages from an AMP per-agent directory (inbox or sent).
 * AMP directories have sender/recipient subdirectories containing JSON files.
 */
async function collectMessagesFromAMPDir(
  ampDir: string,
  filter: {
    status?: Message['status']
    priority?: Message['priority']
    from?: string
    to?: string
  } | undefined,
  results: MessageSummary[],
  seenIds: Set<string>,
): Promise<void> {
  let entries: string[]
  try {
    entries = await fs.readdir(ampDir)
  } catch {
    return // Directory doesn't exist
  }

  for (const entry of entries) {
    const entryPath = path.join(ampDir, entry)
    let stat
    try {
      stat = await fs.stat(entryPath)
    } catch {
      continue
    }

    const filesToRead: string[] = []

    if (stat.isDirectory()) {
      try {
        const files = await fs.readdir(entryPath)
        for (const file of files) {
          if (file.endsWith('.json')) {
            filesToRead.push(path.join(entryPath, file))
          }
        }
      } catch { continue }
    } else if (entry.endsWith('.json')) {
      filesToRead.push(entryPath)
    }

    for (const filePath of filesToRead) {
      try {
        const content = await fs.readFile(filePath, 'utf-8')
        const ampMsg = JSON.parse(content)

        let summary: MessageSummary | null = null

        if (ampMsg.envelope && ampMsg.payload) {
          // AMP envelope format
          const msg = convertAMPToMessage(ampMsg)
          if (!msg) continue
          summary = {
            id: msg.id,
            from: msg.from,
            fromAlias: msg.fromAlias,
            fromHost: msg.fromHost,
            to: msg.to,
            toAlias: msg.toAlias,
            toHost: msg.toHost,
            timestamp: msg.timestamp,
            subject: msg.subject,
            priority: msg.priority,
            status: msg.status,
            type: msg.content.type,
            preview: msg.content.message.substring(0, 100),
          }
        } else if (ampMsg.id && ampMsg.subject) {
          // Old flat format (backward compat)
          summary = {
            id: ampMsg.id,
            from: ampMsg.from,
            fromAlias: ampMsg.fromAlias,
            fromLabel: ampMsg.fromLabel,
            fromHost: ampMsg.fromHost,
            fromVerified: ampMsg.fromVerified,
            to: ampMsg.to,
            toAlias: ampMsg.toAlias,
            toLabel: ampMsg.toLabel,
            toHost: ampMsg.toHost,
            timestamp: ampMsg.timestamp,
            subject: ampMsg.subject,
            priority: ampMsg.priority || 'normal',
            status: ampMsg.status || 'unread',
            type: ampMsg.content?.type || 'notification',
            preview: (ampMsg.content?.message || '').substring(0, 100),
          }
        }

        if (!summary) continue

        // Deduplicate across ID formats (dashes vs underscores)
        const normalizedId = normalizeMessageId(summary.id)
        const altId = summary.id.replace(/-/g, '_')
        if (seenIds.has(normalizedId) || seenIds.has(altId)) continue

        // Apply filters
        if (filter?.status && summary.status !== filter.status) continue
        if (filter?.priority && summary.priority !== filter.priority) continue
        if (filter?.from) {
          if (summary.from !== filter.from && summary.fromAlias !== filter.from) continue
        }
        if (filter?.to) {
          if (summary.to !== filter.to && summary.toAlias !== filter.to) continue
        }

        seenIds.add(normalizedId)
        seenIds.add(altId)
        summary.id = normalizedId
        results.push(summary)
      } catch {
        // Skip malformed files
      }
    }
  }
}

/**
 * Find a message file in an AMP per-agent directory by message ID.
 * Searches through sender/recipient subdirectories.
 * Returns the file path and whether it's in AMP envelope format.
 */
async function findMessageInAMPDir(
  ampDir: string,
  messageId: string,
): Promise<{ path: string; isAMP: boolean } | null> {
  const normalizedId = normalizeMessageId(messageId)
  const ampId = messageId.replace(/-/g, '_')
  const possibleFilenames = [`${normalizedId}.json`, `${ampId}.json`]

  let entries: string[]
  try {
    entries = await fs.readdir(ampDir)
  } catch {
    return null
  }

  for (const entry of entries) {
    const entryPath = path.join(ampDir, entry)
    let stat
    try {
      stat = await fs.stat(entryPath)
    } catch {
      continue
    }

    if (stat.isDirectory()) {
      for (const filename of possibleFilenames) {
        const filePath = path.join(entryPath, filename)
        try {
          await fs.access(filePath)
          const content = await fs.readFile(filePath, 'utf-8')
          const msg = JSON.parse(content)
          return { path: filePath, isAMP: !!(msg.envelope && msg.payload) }
        } catch {
          continue
        }
      }
    } else if (possibleFilenames.includes(entry)) {
      try {
        const content = await fs.readFile(entryPath, 'utf-8')
        const msg = JSON.parse(content)
        return { path: entryPath, isAMP: !!(msg.envelope && msg.payload) }
      } catch {
        continue
      }
    }
  }

  return null
}

/**
 * Resolve an agent identifier (alias, ID, session name, or name@host) to full agent info
 * Supports formats:
 *   - "name@host" → resolve name on specific host
 *   - "uuid" → exact ID match (globally unique)
 *   - "name" → resolve on self host, then any host
 *   - "session_name" → parse and resolve
 *
 * Priority: 1) name@host, 2) exact ID match, 3) name on self host, 4) session name, 5) partial match
 */
function resolveAgent(identifier: string): ResolvedAgent | null {
  const agents = loadAgents()
  const { parseSessionName, computeSessionName } = require('@/types/agent')
  let agent: Agent | null = null

  // 0. Check for name@host format first (explicit host targeting)
  if (identifier.includes('@')) {
    const [name, hostId] = identifier.split('@')
    // Try name first, then alias (alias searches both name and alias fields)
    agent = getAgentByName(name, hostId) || getAgentByAlias(name, hostId) || null
  }

  // 1. Try exact UUID match (globally unique)
  if (!agent) {
    agent = getAgent(identifier)
  }

  // 2. Try exact name match on SELF HOST first (case-insensitive)
  if (!agent) {
    agent = getAgentByName(identifier) || null  // Defaults to self host
  }

  // 2.5. Try alias match on SELF HOST (searches both name and alias fields)
  if (!agent) {
    agent = getAgentByAlias(identifier) || null
  }

  // 3. Try exact name match on ANY HOST (for backward compat)
  if (!agent) {
    agent = getAgentByNameAnyHost(identifier)
  }

  // 3.5. Try alias match on ANY HOST
  if (!agent) {
    agent = getAgentByAliasAnyHost(identifier)
  }

  // 4. Try session name match (parse identifier as potential session name)
  if (!agent) {
    const { agentName } = parseSessionName(identifier)
    // Try on self host first
    agent = getAgentByName(agentName) || null
    // Then any host
    if (!agent) {
      agent = getAgentByNameAnyHost(agentName)
    }
  }

  // 5. Try partial match in name's LAST segment (e.g., "crm" matches "23blocks-api-crm")
  if (!agent) {
    agent = agents.find(a => {
      const agentName = a.name || a.alias || ''
      const segments = agentName.split(/[-_]/)
      return segments.length > 0 && segments[segments.length - 1].toLowerCase() === identifier.toLowerCase()
    }) || null
  }

  if (!agent) return null

  // Get agent name and first online session name
  const agentName = agent.name || agent.alias || ''
  const onlineSession = agent.sessions?.find(s => s.status === 'online')
  const sessionName = onlineSession
    ? computeSessionName(agentName, onlineSession.index)
    : agentName

  // Use this host's name if agent has no hostId or legacy 'local'
  const hostId = !agent.hostId || isSelf(agent.hostId)
    ? getSelfHostName()
    : agent.hostId
  // NEVER use localhost - get URL from selfHost or use hostname
  const selfHost = getSelfHost()
  const hostUrl = agent.hostUrl || selfHost?.url || `http://${os.hostname().toLowerCase()}:23000`

  return {
    agentId: agent.id,
    alias: agentName,
    displayName: agent.label,
    sessionName,
    hostId,
    hostUrl
  }
}

/**
 * Get agent ID from session name (for CLI scripts that detect session via tmux)
 */
export function getAgentIdFromSession(sessionName: string): string | null {
  const agent = getAgentBySession(sessionName)
  return agent?.id || null
}


/**
 * List messages in an agent's inbox
 * Accepts agent alias, ID, or session name
 *
 * Checks multiple locations for backward compatibility:
 * 1. Agent ID folder (new format)
 * 2. Session name folder (legacy, may be symlink to old UUID)
 */
export async function listInboxMessages(
  agentIdentifier: string,
  filter?: {
    status?: Message['status']
    priority?: Message['priority']
    from?: string
    limit?: number  // Maximum number of messages to return (default: unlimited)
  }
): Promise<MessageSummary[]> {
  // Resolve agent
  const agent = resolveAgent(agentIdentifier)
  if (!agent) {
    // Try as direct agent name in AMP directory
    const allMessages: MessageSummary[] = []
    const seenIds = new Set<string>()
    const ampInboxDir = getAMPInboxDir(agentIdentifier)
    await collectMessagesFromAMPDir(ampInboxDir, filter, allMessages, seenIds)
    allMessages.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    if (filter?.limit && filter.limit > 0) return allMessages.slice(0, filter.limit)
    return allMessages
  }

  // Collect messages from AMP per-agent directory only
  const allMessages: MessageSummary[] = []
  const seenIds = new Set<string>()

  // AMP per-agent directory is the sole source of truth
  const agentName = agent.alias || agent.sessionName || agentIdentifier
  const ampInboxDir = getAMPInboxDir(agentName)
  await collectMessagesFromAMPDir(ampInboxDir, filter, allMessages, seenIds)

  // Sort by timestamp (newest first)
  allMessages.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

  // Apply limit if specified
  if (filter?.limit && filter.limit > 0) {
    return allMessages.slice(0, filter.limit)
  }

  return allMessages
}


/**
 * List messages in an agent's sent folder
 * GAP8 FIX: Checks multiple locations with legacy access tracking
 */
export async function listSentMessages(
  agentIdentifier: string,
  filter?: {
    priority?: Message['priority']
    to?: string
    limit?: number  // Maximum number of messages to return (default: unlimited)
  }
): Promise<MessageSummary[]> {
  const agent = resolveAgent(agentIdentifier)
  if (!agent) {
    return []
  }

  // Collect sent messages from AMP per-agent directory only
  const allMessages: MessageSummary[] = []
  const seenIds = new Set<string>()

  const agentName = agent.alias || agent.sessionName || agentIdentifier
  const ampSentDir = getAMPSentDir(agentName)
  await collectMessagesFromAMPDir(ampSentDir, filter, allMessages, seenIds)

  allMessages.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

  // Apply limit if specified
  if (filter?.limit && filter.limit > 0) {
    return allMessages.slice(0, filter.limit)
  }

  return allMessages
}


/**
 * Get sent message count for an agent
 */
export async function getSentCount(agentIdentifier: string): Promise<number> {
  const messages = await listSentMessages(agentIdentifier)
  return messages.length
}

/**
 * Get a specific message by ID
 * GAP8 FIX: Checks multiple locations with legacy access tracking
 */
export async function getMessage(
  agentIdentifier: string,
  messageId: string,
  box: 'inbox' | 'sent' = 'inbox'
): Promise<Message | null> {
  const agent = resolveAgent(agentIdentifier)
  const agentName = agent?.alias || agent?.sessionName || agentIdentifier

  // Read from AMP per-agent directory only
  const ampDir = box === 'sent' ? getAMPSentDir(agentName) : getAMPInboxDir(agentName)
  const found = await findMessageInAMPDir(ampDir, messageId)
  if (found) {
    try {
      const content = await fs.readFile(found.path, 'utf-8')
      const ampMsg = JSON.parse(content)
      if (found.isAMP) {
        return convertAMPToMessage(ampMsg)
      }
      return ampMsg as Message
    } catch {
      // File read error
    }
  }

  return null
}

/**
 * Mark a message as read
 * Finds message in any legacy location and updates it in place
 */
export async function markMessageAsRead(agentIdentifier: string, messageId: string): Promise<boolean> {
  // Find where the message actually exists
  const messagePath = await findMessagePath(agentIdentifier, messageId, 'inbox')
  if (!messagePath) return false

  try {
    const content = await fs.readFile(messagePath, 'utf-8')
    const raw = JSON.parse(content)

    // Handle AMP envelope format vs old flat format
    if (raw.envelope && raw.payload) {
      // AMP format - update status in metadata and local sections
      if (raw.metadata) raw.metadata.status = 'read'
      if (raw.local) raw.local.status = 'read'
    } else {
      // Old flat format
      raw.status = 'read'
    }

    await fs.writeFile(messagePath, JSON.stringify(raw, null, 2))
    return true
  } catch (error) {
    return false
  }
}

/**
 * Helper to find the actual path of a message file in AMP per-agent directory
 */
async function findMessagePath(
  agentIdentifier: string,
  messageId: string,
  box: 'inbox' | 'sent'
): Promise<string | null> {
  const agent = resolveAgent(agentIdentifier)
  const agentName = agent?.alias || agent?.sessionName || agentIdentifier
  const ampDir = box === 'sent' ? getAMPSentDir(agentName) : getAMPInboxDir(agentName)
  const found = await findMessageInAMPDir(ampDir, messageId)
  return found ? found.path : null
}

/**
 * Archive a message
 * Finds message in any legacy location, moves to archive
 */
export async function archiveMessage(agentIdentifier: string, messageId: string): Promise<boolean> {
  // Find where the message actually exists
  const inboxPath = await findMessagePath(agentIdentifier, messageId, 'inbox')
  if (!inboxPath) return false

  try {
    const content = await fs.readFile(inboxPath, 'utf-8')
    const raw = JSON.parse(content)

    if (raw.envelope && raw.payload) {
      // AMP format - update status in place (no separate archive dir in AMP)
      if (raw.metadata) raw.metadata.status = 'archived'
      if (raw.local) raw.local.status = 'archived'
      await fs.writeFile(inboxPath, JSON.stringify(raw, null, 2))
    } else {
      // Old flat format - update status in place
      raw.status = 'archived'
      await fs.writeFile(inboxPath, JSON.stringify(raw, null, 2))
    }
    return true
  } catch (error) {
    return false
  }
}

/**
 * Delete a message permanently
 * Finds message in any legacy location and deletes it
 */
export async function deleteMessage(agentIdentifier: string, messageId: string): Promise<boolean> {
  // Find where the message actually exists
  const messagePath = await findMessagePath(agentIdentifier, messageId, 'inbox')
  if (!messagePath) return false

  try {
    await fs.unlink(messagePath)
    return true
  } catch (error) {
    return false
  }
}

/**
 * Get unread message count for an agent
 */
export async function getUnreadCount(agentIdentifier: string): Promise<number> {
  const messages = await listInboxMessages(agentIdentifier, { status: 'unread' })
  return messages.length
}

/**
 * List all agents with messages
 */
export async function listAgentsWithMessages(): Promise<string[]> {
  // Read from AMP per-agent directories only
  try {
    const agents = await fs.readdir(AMP_AGENTS_DIR)
    const agentsWithMessages: string[] = []

    for (const agent of agents) {
      const inboxDir = path.join(AMP_AGENTS_DIR, agent, 'messages', 'inbox')
      try {
        const entries = await fs.readdir(inboxDir)
        if (entries.length > 0) {
          agentsWithMessages.push(agent)
        }
      } catch {
        // No inbox dir for this agent
      }
    }

    return agentsWithMessages
  } catch (error) {
    return []
  }
}

// Alias for backward compatibility
export const listSessionsWithMessages = listAgentsWithMessages

/**
 * Get message statistics for an agent
 */
export async function getMessageStats(agentIdentifier: string): Promise<{
  unread: number
  total: number
  byPriority: Record<string, number>
}> {
  const messages = await listInboxMessages(agentIdentifier)

  const stats = {
    unread: messages.filter(m => m.status === 'unread').length,
    total: messages.length,
    byPriority: {
      low: 0,
      normal: 0,
      high: 0,
      urgent: 0,
    },
  }

  messages.forEach(m => {
    stats.byPriority[m.priority]++
  })

  return stats
}

/**
 * Resolve an agent identifier and return info (for CLI scripts)
 */
export function resolveAgentIdentifier(identifier: string): ResolvedAgent | null {
  return resolveAgent(identifier)
}
