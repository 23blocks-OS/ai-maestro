import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'
import { getHostById } from './hosts-config-server.mjs'
import { loadAgents, getAgentBySession } from './agent-registry'
import type { Agent } from '@/types/agent'

export interface Message {
  id: string
  from: string           // Agent ID (or session name for backward compat)
  fromAlias?: string     // Agent alias for display
  fromSession?: string   // Actual session name (for delivery)
  fromHost?: string      // Host ID where sender resides (e.g., 'local', 'mac-mini')
  to: string             // Agent ID (or session name for backward compat)
  toAlias?: string       // Agent alias for display
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
}

export interface MessageSummary {
  id: string
  from: string
  fromAlias?: string
  fromHost?: string
  to: string
  toAlias?: string
  toHost?: string
  timestamp: string
  subject: string
  priority: 'low' | 'normal' | 'high' | 'urgent'
  status: 'unread' | 'read' | 'archived'
  type: 'request' | 'response' | 'notification' | 'update'
  preview: string
}

interface ResolvedAgent {
  agentId: string
  alias: string
  displayName?: string
  sessionName?: string  // Current tmux session (may be null if offline)
  hostId?: string       // Host ID (e.g., 'local' or remote host ID)
  hostUrl?: string      // Full URL to reach this agent's host (e.g., 'http://localhost:23000')
}

const MESSAGE_DIR = path.join(os.homedir(), '.aimaestro', 'messages')

/**
 * Resolve an agent identifier (alias, ID, or session name) to full agent info
 * Priority: 1) exact ID match, 2) exact alias match, 3) session name match
 */
function resolveAgent(identifier: string): ResolvedAgent | null {
  const agents = loadAgents()

  // 1. Try exact ID match
  let agent = agents.find(a => a.id === identifier)

  // 2. Try exact alias match (case-insensitive)
  if (!agent) {
    agent = agents.find(a => a.alias.toLowerCase() === identifier.toLowerCase())
  }

  // 3. Try tmux session name match
  if (!agent) {
    agent = agents.find(a => a.tools.session?.tmuxSessionName === identifier)
  }

  // 4. Try partial alias match in session name (e.g., "crm" matches "23blocks-api-crm")
  if (!agent) {
    agent = agents.find(a => {
      const sessionName = a.tools.session?.tmuxSessionName || ''
      const segments = sessionName.split(/[-_]/)
      return segments.includes(identifier.toLowerCase())
    })
  }

  if (!agent) return null

  // Get host info from session or tools
  const session = agent.tools?.session || (agent as any).session
  const hostId = session?.hostId || 'local'
  const hostUrl = session?.hostUrl || 'http://localhost:23000'

  return {
    agentId: agent.id,
    alias: agent.alias,
    displayName: agent.displayName,
    sessionName: session?.tmuxSessionName,
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
 * Parse a qualified name (identifier@host-id)
 */
function parseQualifiedName(qualifiedName: string): { identifier: string; hostId: string | null } {
  const parts = qualifiedName.split('@')
  if (parts.length === 2) {
    return { identifier: parts[0], hostId: parts[1] }
  }
  return { identifier: qualifiedName, hostId: null }
}

/**
 * Ensures the message directory structure exists
 */
export async function ensureMessageDirectories(): Promise<void> {
  const dirs = [
    MESSAGE_DIR,
    path.join(MESSAGE_DIR, 'inbox'),
    path.join(MESSAGE_DIR, 'sent'),
    path.join(MESSAGE_DIR, 'archived'),
  ]

  for (const dir of dirs) {
    await fs.mkdir(dir, { recursive: true })
  }
}

/**
 * Generate a unique message ID
 */
function generateMessageId(): string {
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2, 9)
  return `msg-${timestamp}-${random}`
}

/**
 * Get the inbox directory for an agent (by ID)
 */
function getInboxDir(agentId: string): string {
  return path.join(MESSAGE_DIR, 'inbox', agentId)
}

/**
 * Get the sent directory for an agent (by ID)
 */
function getSentDir(agentId: string): string {
  return path.join(MESSAGE_DIR, 'sent', agentId)
}

/**
 * Get the archived directory for an agent (by ID)
 */
function getArchivedDir(agentId: string): string {
  return path.join(MESSAGE_DIR, 'archived', agentId)
}

/**
 * Ensure agent-specific directories exist
 */
async function ensureAgentDirectories(agentId: string): Promise<void> {
  await fs.mkdir(getInboxDir(agentId), { recursive: true })
  await fs.mkdir(getSentDir(agentId), { recursive: true })
  await fs.mkdir(getArchivedDir(agentId), { recursive: true })
}

/**
 * Send a message from one agent to another
 * Accepts agent alias, ID, or session name as identifiers
 * Supports cross-host messaging via fromHost/toHost options
 */
export async function sendMessage(
  from: string,
  to: string,
  subject: string,
  content: Message['content'],
  options?: {
    priority?: Message['priority']
    inReplyTo?: string
    fromHost?: string      // Host ID where sender is (for cross-host messages)
    toHost?: string        // Host ID where recipient is
    fromAlias?: string     // Pre-resolved alias (from remote host)
    toAlias?: string       // Pre-resolved alias (from remote host)
  }
): Promise<Message> {
  await ensureMessageDirectories()

  // Parse qualified name (identifier@host-id)
  const { identifier: toIdentifier, hostId: targetHostId } = parseQualifiedName(to)

  // Resolve sender agent (may fail for remote senders - that's ok, use provided info)
  const fromAgent = resolveAgent(from)

  // Resolve recipient agent
  const toAgent = resolveAgent(toIdentifier)
  if (!toAgent) {
    throw new Error(`Unknown recipient: ${to}. Please ensure the agent is registered.`)
  }

  // For local sender, ensure directories exist
  if (fromAgent) {
    await ensureAgentDirectories(fromAgent.agentId)
  }
  await ensureAgentDirectories(toAgent.agentId)

  // Determine host info - use provided values or resolve from local agent
  const fromHostId = options?.fromHost || fromAgent?.hostId || 'local'
  const toHostId = options?.toHost || targetHostId || toAgent?.hostId || 'local'

  const message: Message = {
    id: generateMessageId(),
    from: fromAgent?.agentId || from,
    fromAlias: options?.fromAlias || fromAgent?.alias,
    fromSession: fromAgent?.sessionName,
    fromHost: fromHostId,
    to: toAgent.agentId,
    toAlias: options?.toAlias || toAgent.alias,
    toSession: toAgent.sessionName,
    toHost: toHostId,
    timestamp: new Date().toISOString(),
    subject,
    priority: options?.priority || 'normal',
    status: 'unread',
    content,
    inReplyTo: options?.inReplyTo,
  }

  // Determine if recipient is on a remote host
  // Note: hostId comes from qualified name (e.g., "crm@remote-host")
  let recipientIsRemote = false
  let remoteHostUrl: string | null = null

  if (targetHostId && targetHostId !== 'local') {
    const remoteHost = getHostById(targetHostId)
    if (remoteHost) {
      recipientIsRemote = true
      remoteHostUrl = remoteHost.url
    }
  }

  if (recipientIsRemote && remoteHostUrl) {
    // Send message to remote host via HTTP
    console.log(`[MessageQueue] Sending message to remote agent ${toAgent.alias} at ${remoteHostUrl}`)

    try {
      const remoteResponse = await fetch(`${remoteHostUrl}/api/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: message.from,
          fromAlias: message.fromAlias,
          fromHost: message.fromHost,
          to: message.to,
          toAlias: message.toAlias,
          toHost: message.toHost,
          subject,
          content,
          priority: options?.priority,
          inReplyTo: options?.inReplyTo,
        }),
      })

      if (!remoteResponse.ok) {
        throw new Error(`Remote host returned ${remoteResponse.status}`)
      }

      console.log(`[MessageQueue] Message delivered to remote host ${remoteHostUrl}`)
    } catch (error) {
      console.error(`[MessageQueue] Failed to send message to remote host:`, error)
      throw new Error(`Failed to deliver message to remote agent: ${error}`)
    }
  } else {
    // Local recipient - write to filesystem using agent ID
    const inboxPath = path.join(getInboxDir(toAgent.agentId), `${message.id}.json`)
    await fs.writeFile(inboxPath, JSON.stringify(message, null, 2))
  }

  // Always write to sender's sent folder (locally) using agent ID
  // For local senders, use resolved agent ID; for remote senders, use the from field
  const senderAgentId = fromAgent?.agentId || message.from
  await ensureAgentDirectories(senderAgentId)
  const sentPath = path.join(getSentDir(senderAgentId), `${message.id}.json`)
  await fs.writeFile(sentPath, JSON.stringify(message, null, 2))

  return message
}

/**
 * Forward a message to another agent
 */
export async function forwardMessage(
  originalMessageId: string,
  fromAgent: string,
  toAgent: string,
  forwardNote?: string,
  providedOriginalMessage?: Message
): Promise<Message> {
  // Parse qualified name
  const { identifier: toIdentifier, hostId: targetHostId } = parseQualifiedName(toAgent)

  // Resolve agents
  const fromResolved = resolveAgent(fromAgent)
  if (!fromResolved) {
    throw new Error(`Unknown sender: ${fromAgent}`)
  }

  const toResolved = resolveAgent(toIdentifier)
  if (!toResolved) {
    throw new Error(`Unknown recipient: ${toAgent}`)
  }

  // Get the original message
  let originalMessage: Message | null

  if (providedOriginalMessage) {
    originalMessage = providedOriginalMessage
  } else {
    originalMessage = await getMessage(fromResolved.agentId, originalMessageId)
    if (!originalMessage) {
      throw new Error(`Message ${originalMessageId} not found`)
    }
  }

  await ensureMessageDirectories()
  await ensureAgentDirectories(fromResolved.agentId)
  await ensureAgentDirectories(toResolved.agentId)

  // Build forwarded content
  let forwardedContent = ''
  if (forwardNote) {
    forwardedContent += `${forwardNote}\n\n`
  }
  forwardedContent += `--- Forwarded Message ---\n`
  forwardedContent += `From: ${originalMessage.fromAlias || originalMessage.from}\n`
  forwardedContent += `To: ${originalMessage.toAlias || originalMessage.to}\n`
  forwardedContent += `Sent: ${new Date(originalMessage.timestamp).toLocaleString()}\n`
  forwardedContent += `Subject: ${originalMessage.subject}\n\n`
  forwardedContent += `${originalMessage.content.message}\n`
  forwardedContent += `--- End of Forwarded Message ---`

  // Create forwarded message
  const forwardedMessage: Message = {
    id: generateMessageId(),
    from: fromResolved.agentId,
    fromAlias: fromResolved.alias,
    fromSession: fromResolved.sessionName,
    to: toResolved.agentId,
    toAlias: toResolved.alias,
    toSession: toResolved.sessionName,
    timestamp: new Date().toISOString(),
    subject: `Fwd: ${originalMessage.subject}`,
    priority: originalMessage.priority,
    status: 'unread',
    content: {
      type: 'notification',
      message: forwardedContent,
    },
    forwardedFrom: {
      originalMessageId: originalMessage.id,
      originalFrom: originalMessage.from,
      originalTo: originalMessage.to,
      originalTimestamp: originalMessage.timestamp,
      forwardedBy: fromResolved.agentId,
      forwardedAt: new Date().toISOString(),
      forwardNote,
    },
  }

  // Determine if recipient is on a remote host
  // Note: hostId comes from qualified name (e.g., "crm@remote-host")
  let recipientIsRemote = false
  let remoteHostUrl: string | null = null

  if (targetHostId && targetHostId !== 'local') {
    const remoteHost = getHostById(targetHostId)
    if (remoteHost) {
      recipientIsRemote = true
      remoteHostUrl = remoteHost.url
    }
  }

  if (recipientIsRemote && remoteHostUrl) {
    console.log(`[MessageQueue] Forwarding message to remote agent ${toResolved.alias} at ${remoteHostUrl}`)

    try {
      const remoteResponse = await fetch(`${remoteHostUrl}/api/messages/forward`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          originalMessage: originalMessage,
          fromAgent: fromResolved.agentId,
          toAgent: toResolved.agentId,
          forwardNote,
        }),
      })

      if (!remoteResponse.ok) {
        throw new Error(`Remote host returned ${remoteResponse.status}`)
      }

      console.log(`[MessageQueue] Forwarded message to remote host ${remoteHostUrl}`)
    } catch (error) {
      console.error(`[MessageQueue] Failed to forward message to remote host:`, error)
      throw new Error(`Failed to forward message to remote agent: ${error}`)
    }
  } else {
    // Local recipient - write to filesystem using agent ID
    const inboxPath = path.join(getInboxDir(toResolved.agentId), `${forwardedMessage.id}.json`)
    await fs.writeFile(inboxPath, JSON.stringify(forwardedMessage, null, 2))
  }

  // Write to sender's sent folder
  const sentPath = path.join(getSentDir(fromResolved.agentId), `fwd_${forwardedMessage.id}.json`)
  await fs.writeFile(sentPath, JSON.stringify(forwardedMessage, null, 2))

  return forwardedMessage
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
  }
): Promise<MessageSummary[]> {
  // Resolve agent
  const agent = resolveAgent(agentIdentifier)
  if (!agent) {
    // Fallback: try as direct folder name (backward compat)
    return listInboxMessagesByFolder(agentIdentifier, filter)
  }

  await ensureAgentDirectories(agent.agentId)

  // Collect messages from multiple possible locations
  const allMessages: MessageSummary[] = []
  const seenIds = new Set<string>()

  // Location 1: Agent ID folder (new format)
  const agentIdDir = getInboxDir(agent.agentId)
  await collectMessagesFromDir(agentIdDir, filter, allMessages, seenIds)

  // Location 2: Session name folder (legacy - may be symlink to old UUID)
  if (agent.sessionName && agent.sessionName !== agent.agentId) {
    const sessionDir = path.join(MESSAGE_DIR, 'inbox', agent.sessionName)
    await collectMessagesFromDir(sessionDir, filter, allMessages, seenIds)
  }

  // Location 3: Original identifier if different (fallback)
  if (agentIdentifier !== agent.agentId && agentIdentifier !== agent.sessionName) {
    const identifierDir = path.join(MESSAGE_DIR, 'inbox', agentIdentifier)
    await collectMessagesFromDir(identifierDir, filter, allMessages, seenIds)
  }

  // Sort by timestamp (newest first)
  allMessages.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

  return allMessages
}

/**
 * Helper to collect messages from a directory into the results array
 */
async function collectMessagesFromDir(
  dirPath: string,
  filter: {
    status?: Message['status']
    priority?: Message['priority']
    from?: string
  } | undefined,
  results: MessageSummary[],
  seenIds: Set<string>
): Promise<void> {
  let files: string[]
  try {
    files = await fs.readdir(dirPath)
  } catch (error) {
    return // Directory doesn't exist, skip
  }

  for (const file of files) {
    if (!file.endsWith('.json')) continue

    const filePath = path.join(dirPath, file)
    try {
      const content = await fs.readFile(filePath, 'utf-8')
      const message: Message = JSON.parse(content)

      // Skip if we've already seen this message ID
      if (seenIds.has(message.id)) continue

      // Apply filters
      if (filter?.status && message.status !== filter.status) continue
      if (filter?.priority && message.priority !== filter.priority) continue
      if (filter?.from) {
        const fromMatches = message.from === filter.from ||
                          message.fromAlias === filter.from ||
                          message.fromSession === filter.from
        if (!fromMatches) continue
      }

      seenIds.add(message.id)
      results.push({
        id: message.id,
        from: message.from,
        fromAlias: message.fromAlias,
        fromHost: message.fromHost,
        to: message.to,
        toAlias: message.toAlias,
        toHost: message.toHost,
        timestamp: message.timestamp,
        subject: message.subject,
        priority: message.priority,
        status: message.status,
        type: message.content.type,
        preview: message.content.message.substring(0, 100),
      })
    } catch (error) {
      console.error(`Error reading message file ${file}:`, error)
    }
  }
}

/**
 * Fallback: list messages by folder name (backward compatibility)
 */
async function listInboxMessagesByFolder(
  folderName: string,
  filter?: {
    status?: Message['status']
    priority?: Message['priority']
    from?: string
  }
): Promise<MessageSummary[]> {
  const inboxDir = path.join(MESSAGE_DIR, 'inbox', folderName)

  let files: string[]
  try {
    files = await fs.readdir(inboxDir)
  } catch (error) {
    return []
  }

  const messages: MessageSummary[] = []

  for (const file of files) {
    if (!file.endsWith('.json')) continue

    const filePath = path.join(inboxDir, file)
    try {
      const content = await fs.readFile(filePath, 'utf-8')
      const message: Message = JSON.parse(content)

      if (filter?.status && message.status !== filter.status) continue
      if (filter?.priority && message.priority !== filter.priority) continue
      if (filter?.from && message.from !== filter.from) continue

      messages.push({
        id: message.id,
        from: message.from,
        fromAlias: message.fromAlias,
        fromHost: message.fromHost,
        to: message.to,
        toAlias: message.toAlias,
        toHost: message.toHost,
        timestamp: message.timestamp,
        subject: message.subject,
        priority: message.priority,
        status: message.status,
        type: message.content.type,
        preview: message.content.message.substring(0, 100),
      })
    } catch (error) {
      console.error(`Error reading message file ${file}:`, error)
    }
  }

  messages.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
  return messages
}

/**
 * List messages in an agent's sent folder
 * Checks multiple locations for backward compatibility
 */
export async function listSentMessages(
  agentIdentifier: string,
  filter?: {
    priority?: Message['priority']
    to?: string
  }
): Promise<MessageSummary[]> {
  const agent = resolveAgent(agentIdentifier)
  if (!agent) {
    // Fallback to direct folder
    return listSentMessagesByFolder(agentIdentifier, filter)
  }

  await ensureAgentDirectories(agent.agentId)

  // Collect messages from multiple possible locations
  const allMessages: MessageSummary[] = []
  const seenIds = new Set<string>()

  // Location 1: Agent ID folder (new format)
  const agentIdDir = getSentDir(agent.agentId)
  await collectSentMessagesFromDir(agentIdDir, filter, allMessages, seenIds)

  // Location 2: Session name folder (legacy - may be symlink to old UUID)
  if (agent.sessionName && agent.sessionName !== agent.agentId) {
    const sessionDir = path.join(MESSAGE_DIR, 'sent', agent.sessionName)
    await collectSentMessagesFromDir(sessionDir, filter, allMessages, seenIds)
  }

  // Location 3: Original identifier if different (fallback)
  if (agentIdentifier !== agent.agentId && agentIdentifier !== agent.sessionName) {
    const identifierDir = path.join(MESSAGE_DIR, 'sent', agentIdentifier)
    await collectSentMessagesFromDir(identifierDir, filter, allMessages, seenIds)
  }

  allMessages.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
  return allMessages
}

/**
 * Helper to collect sent messages from a directory
 */
async function collectSentMessagesFromDir(
  dirPath: string,
  filter: {
    priority?: Message['priority']
    to?: string
  } | undefined,
  results: MessageSummary[],
  seenIds: Set<string>
): Promise<void> {
  let files: string[]
  try {
    files = await fs.readdir(dirPath)
  } catch (error) {
    return // Directory doesn't exist, skip
  }

  for (const file of files) {
    if (!file.endsWith('.json')) continue

    const filePath = path.join(dirPath, file)
    try {
      const content = await fs.readFile(filePath, 'utf-8')
      const message: Message = JSON.parse(content)

      // Skip if we've already seen this message ID
      if (seenIds.has(message.id)) continue

      if (filter?.priority && message.priority !== filter.priority) continue
      if (filter?.to) {
        const toMatches = message.to === filter.to ||
                         message.toAlias === filter.to ||
                         message.toSession === filter.to
        if (!toMatches) continue
      }

      seenIds.add(message.id)
      results.push({
        id: message.id,
        from: message.from,
        fromAlias: message.fromAlias,
        fromHost: message.fromHost,
        to: message.to,
        toAlias: message.toAlias,
        toHost: message.toHost,
        timestamp: message.timestamp,
        subject: message.subject,
        priority: message.priority,
        status: message.status,
        type: message.content.type,
        preview: message.content.message.substring(0, 100),
      })
    } catch (error) {
      console.error(`Error reading sent message file ${file}:`, error)
    }
  }
}

/**
 * Fallback: list sent messages by folder name
 */
async function listSentMessagesByFolder(
  folderName: string,
  filter?: {
    priority?: Message['priority']
    to?: string
  }
): Promise<MessageSummary[]> {
  const sentDir = path.join(MESSAGE_DIR, 'sent', folderName)

  let files: string[]
  try {
    files = await fs.readdir(sentDir)
  } catch (error) {
    return []
  }

  const messages: MessageSummary[] = []

  for (const file of files) {
    if (!file.endsWith('.json')) continue

    const filePath = path.join(sentDir, file)
    try {
      const content = await fs.readFile(filePath, 'utf-8')
      const message: Message = JSON.parse(content)

      if (filter?.priority && message.priority !== filter.priority) continue
      if (filter?.to && message.to !== filter.to) continue

      messages.push({
        id: message.id,
        from: message.from,
        fromAlias: message.fromAlias,
        fromHost: message.fromHost,
        to: message.to,
        toAlias: message.toAlias,
        toHost: message.toHost,
        timestamp: message.timestamp,
        subject: message.subject,
        priority: message.priority,
        status: message.status,
        type: message.content.type,
        preview: message.content.message.substring(0, 100),
      })
    } catch (error) {
      console.error(`Error reading sent message file ${file}:`, error)
    }
  }

  messages.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
  return messages
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
 * Checks multiple locations for backward compatibility
 */
export async function getMessage(
  agentIdentifier: string,
  messageId: string,
  box: 'inbox' | 'sent' = 'inbox'
): Promise<Message | null> {
  const agent = resolveAgent(agentIdentifier)
  const boxDir = box === 'sent' ? 'sent' : 'inbox'

  // Build list of directories to check
  const dirsToCheck: string[] = []

  // 1. Agent ID folder (if resolved)
  if (agent) {
    dirsToCheck.push(path.join(MESSAGE_DIR, boxDir, agent.agentId))
  }

  // 2. Session name folder (may be symlink to old UUID)
  if (agent?.sessionName && agent.sessionName !== agent.agentId) {
    dirsToCheck.push(path.join(MESSAGE_DIR, boxDir, agent.sessionName))
  }

  // 3. Original identifier as fallback
  if (!agent || (agentIdentifier !== agent.agentId && agentIdentifier !== agent.sessionName)) {
    dirsToCheck.push(path.join(MESSAGE_DIR, boxDir, agentIdentifier))
  }

  // Try each directory
  for (const dir of dirsToCheck) {
    const messagePath = path.join(dir, `${messageId}.json`)
    try {
      const content = await fs.readFile(messagePath, 'utf-8')
      return JSON.parse(content)
    } catch (error) {
      // Continue to next location
    }
  }

  return null
}

/**
 * Mark a message as read
 * Finds message in any legacy location and updates it in place
 */
export async function markMessageAsRead(agentIdentifier: string, messageId: string): Promise<boolean> {
  const message = await getMessage(agentIdentifier, messageId)
  if (!message) return false

  message.status = 'read'

  // Find where the message actually exists
  const messagePath = await findMessagePath(agentIdentifier, messageId, 'inbox')
  if (!messagePath) return false

  try {
    await fs.writeFile(messagePath, JSON.stringify(message, null, 2))
    return true
  } catch (error) {
    return false
  }
}

/**
 * Helper to find the actual path of a message file
 */
async function findMessagePath(
  agentIdentifier: string,
  messageId: string,
  box: 'inbox' | 'sent'
): Promise<string | null> {
  const agent = resolveAgent(agentIdentifier)
  const boxDir = box === 'sent' ? 'sent' : 'inbox'

  // Build list of directories to check
  const dirsToCheck: string[] = []

  if (agent) {
    dirsToCheck.push(path.join(MESSAGE_DIR, boxDir, agent.agentId))
  }

  if (agent?.sessionName && agent.sessionName !== agent.agentId) {
    dirsToCheck.push(path.join(MESSAGE_DIR, boxDir, agent.sessionName))
  }

  if (!agent || (agentIdentifier !== agent.agentId && agentIdentifier !== agent.sessionName)) {
    dirsToCheck.push(path.join(MESSAGE_DIR, boxDir, agentIdentifier))
  }

  // Try each directory
  for (const dir of dirsToCheck) {
    const messagePath = path.join(dir, `${messageId}.json`)
    try {
      await fs.access(messagePath)
      return messagePath
    } catch (error) {
      // Continue to next location
    }
  }

  return null
}

/**
 * Archive a message
 * Finds message in any legacy location, moves to archive
 */
export async function archiveMessage(agentIdentifier: string, messageId: string): Promise<boolean> {
  const message = await getMessage(agentIdentifier, messageId)
  if (!message) return false

  message.status = 'archived'

  // Find where the message actually exists
  const inboxPath = await findMessagePath(agentIdentifier, messageId, 'inbox')
  if (!inboxPath) return false

  const agent = resolveAgent(agentIdentifier)
  const agentId = agent?.agentId || agentIdentifier
  const archivedPath = path.join(getArchivedDir(agentId), `${messageId}.json`)

  try {
    await fs.mkdir(path.dirname(archivedPath), { recursive: true })
    await fs.writeFile(archivedPath, JSON.stringify(message, null, 2))
    await fs.unlink(inboxPath)
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
  await ensureMessageDirectories()
  const inboxDir = path.join(MESSAGE_DIR, 'inbox')

  try {
    const folders = await fs.readdir(inboxDir)
    return folders
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
