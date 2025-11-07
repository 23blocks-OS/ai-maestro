import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'
import { getHostById } from './hosts-config-server.mjs'

export interface Message {
  id: string
  from: string
  to: string
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
  to: string
  timestamp: string
  subject: string
  priority: 'low' | 'normal' | 'high' | 'urgent'
  status: 'unread' | 'read' | 'archived'
  type: 'request' | 'response' | 'notification' | 'update'
  preview: string
}

const MESSAGE_DIR = path.join(os.homedir(), '.aimaestro', 'messages')

/**
 * Parse a qualified session name (session-name@host-id)
 * Returns { sessionName, hostId } or { sessionName, hostId: null } if no host specified
 */
function parseQualifiedName(qualifiedName: string): { sessionName: string; hostId: string | null } {
  const parts = qualifiedName.split('@')
  if (parts.length === 2) {
    return { sessionName: parts[0], hostId: parts[1] }
  }
  return { sessionName: qualifiedName, hostId: null }
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
 * Get the inbox directory for a session
 */
function getInboxDir(sessionName: string): string {
  return path.join(MESSAGE_DIR, 'inbox', sessionName)
}

/**
 * Get the sent directory for a session
 */
function getSentDir(sessionName: string): string {
  return path.join(MESSAGE_DIR, 'sent', sessionName)
}

/**
 * Get the archived directory for a session
 */
function getArchivedDir(sessionName: string): string {
  return path.join(MESSAGE_DIR, 'archived', sessionName)
}

/**
 * Ensure session-specific directories exist
 */
async function ensureSessionDirectories(sessionName: string): Promise<void> {
  await fs.mkdir(getInboxDir(sessionName), { recursive: true })
  await fs.mkdir(getSentDir(sessionName), { recursive: true })
  await fs.mkdir(getArchivedDir(sessionName), { recursive: true })
}

/**
 * Send a message from one session to another (supports cross-host messaging)
 */
export async function sendMessage(
  from: string,
  to: string,
  subject: string,
  content: Message['content'],
  options?: {
    priority?: Message['priority']
    inReplyTo?: string
  }
): Promise<Message> {
  await ensureMessageDirectories()
  await ensureSessionDirectories(from)

  // Parse qualified name (session-name@host-id)
  const { sessionName: recipientSessionName, hostId: targetHostId } = parseQualifiedName(to)

  const message: Message = {
    id: generateMessageId(),
    from,
    to: recipientSessionName, // Use unqualified name in message
    timestamp: new Date().toISOString(),
    subject,
    priority: options?.priority || 'normal',
    status: 'unread',
    content,
    inReplyTo: options?.inReplyTo,
  }

  // Determine if recipient is on a remote host
  let recipientIsRemote = false
  let remoteHostUrl: string | null = null

  try {
    // Fetch sessions to find recipient
    const response = await fetch('http://localhost:23000/api/sessions')
    const data = await response.json()

    // Find recipient session
    // If hostId specified (qualified name), match both session name and hostId
    // Otherwise, match session name only (backward compatible)
    const recipientSession = data.sessions?.find((s: any) => {
      const nameMatches = s.name === recipientSessionName || s.id === recipientSessionName
      if (targetHostId) {
        // Qualified name - must match both name and host
        return nameMatches && s.hostId === targetHostId
      }
      // Unqualified name - match name only (first match)
      return nameMatches
    })

    if (recipientSession && recipientSession.hostId && recipientSession.hostId !== 'local') {
      // Recipient is on a remote host
      const remoteHost = getHostById(recipientSession.hostId)
      if (remoteHost) {
        recipientIsRemote = true
        remoteHostUrl = remoteHost.url
      }
    }
  } catch (error) {
    console.warn('[MessageQueue] Failed to determine recipient host, assuming local:', error)
  }

  if (recipientIsRemote && remoteHostUrl) {
    // Send message to remote host via HTTP
    console.log(`[MessageQueue] Sending message to remote session ${to} at ${remoteHostUrl}`)

    try {
      const remoteResponse = await fetch(`${remoteHostUrl}/api/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from,
          to,
          subject,
          content,
          priority: options?.priority,
          inReplyTo: options?.inReplyTo,
        }),
      })

      if (!remoteResponse.ok) {
        throw new Error(`Remote host returned ${remoteResponse.status}`)
      }

      console.log(`[MessageQueue] ✓ Message delivered to remote host ${remoteHostUrl}`)
    } catch (error) {
      console.error(`[MessageQueue] Failed to send message to remote host:`, error)
      throw new Error(`Failed to deliver message to remote session: ${error}`)
    }
  } else {
    // Local recipient - write to filesystem
    await ensureSessionDirectories(recipientSessionName)
    const inboxPath = path.join(getInboxDir(recipientSessionName), `${message.id}.json`)
    await fs.writeFile(inboxPath, JSON.stringify(message, null, 2))
  }

  // Always write to sender's sent folder (locally)
  const sentPath = path.join(getSentDir(from), `${message.id}.json`)
  await fs.writeFile(sentPath, JSON.stringify(message, null, 2))

  return message
}

/**
 * Forward a message to another session (supports cross-host forwarding)
 */
export async function forwardMessage(
  originalMessageId: string,
  fromSession: string,
  toSession: string,
  forwardNote?: string,
  providedOriginalMessage?: Message
): Promise<Message> {
  // Parse qualified name (session-name@host-id)
  const { sessionName: recipientSessionName, hostId: targetHostId } = parseQualifiedName(toSession)

  // Get the original message
  // If providedOriginalMessage is given (remote forward), use it
  // Otherwise fetch from local filesystem (local forward)
  let originalMessage: Message | null

  if (providedOriginalMessage) {
    originalMessage = providedOriginalMessage
  } else {
    originalMessage = await getMessage(fromSession, originalMessageId)
    if (!originalMessage) {
      throw new Error(`Message ${originalMessageId} not found`)
    }
  }

  await ensureMessageDirectories()
  await ensureSessionDirectories(fromSession)
  await ensureSessionDirectories(recipientSessionName)

  // Build forwarded content
  let forwardedContent = ''
  if (forwardNote) {
    forwardedContent += `${forwardNote}\n\n`
  }
  forwardedContent += `--- Forwarded Message ---\n`
  forwardedContent += `From: ${originalMessage.from}\n`
  forwardedContent += `To: ${originalMessage.to}\n`
  forwardedContent += `Sent: ${new Date(originalMessage.timestamp).toLocaleString()}\n`
  forwardedContent += `Subject: ${originalMessage.subject}\n\n`
  forwardedContent += `${originalMessage.content.message}\n`
  forwardedContent += `--- End of Forwarded Message ---`

  // Create forwarded message
  const forwardedMessage: Message = {
    id: generateMessageId(),
    from: fromSession,
    to: recipientSessionName, // Use unqualified name in message
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
      forwardedBy: fromSession,
      forwardedAt: new Date().toISOString(),
      forwardNote,
    },
  }

  // Determine if recipient is on a remote host
  let recipientIsRemote = false
  let remoteHostUrl: string | null = null

  try {
    const response = await fetch('http://localhost:23000/api/sessions')
    const data = await response.json()

    // Find recipient session
    // If hostId specified (qualified name), match both session name and hostId
    // Otherwise, match session name only (backward compatible)
    const recipientSession = data.sessions?.find((s: any) => {
      const nameMatches = s.name === recipientSessionName || s.id === recipientSessionName
      if (targetHostId) {
        // Qualified name - must match both name and host
        return nameMatches && s.hostId === targetHostId
      }
      // Unqualified name - match name only (first match)
      return nameMatches
    })

    if (recipientSession && recipientSession.hostId && recipientSession.hostId !== 'local') {
      const remoteHost = getHostById(recipientSession.hostId)
      if (remoteHost) {
        recipientIsRemote = true
        remoteHostUrl = remoteHost.url
      }
    }
  } catch (error) {
    console.warn('[MessageQueue] Failed to determine recipient host for forward, assuming local:', error)
  }

  if (recipientIsRemote && remoteHostUrl) {
    // Forward message to remote host via HTTP
    // Must send full message content since remote host doesn't have access to local filesystem
    console.log(`[MessageQueue] Forwarding message to remote session ${toSession} at ${remoteHostUrl}`)

    try {
      const remoteResponse = await fetch(`${remoteHostUrl}/api/messages/forward`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // Send full original message instead of just ID
          originalMessage: originalMessage,
          fromSession,
          toSession,
          forwardNote,
        }),
      })

      if (!remoteResponse.ok) {
        throw new Error(`Remote host returned ${remoteResponse.status}`)
      }

      console.log(`[MessageQueue] ✓ Forwarded message to remote host ${remoteHostUrl}`)
    } catch (error) {
      console.error(`[MessageQueue] Failed to forward message to remote host:`, error)
      throw new Error(`Failed to forward message to remote session: ${error}`)
    }
  } else {
    // Local recipient - write to filesystem
    const inboxPath = path.join(getInboxDir(recipientSessionName), `${forwardedMessage.id}.json`)
    await fs.writeFile(inboxPath, JSON.stringify(forwardedMessage, null, 2))
  }

  // Write to sender's sent folder (mark as forwarded) - always local
  const sentPath = path.join(getSentDir(fromSession), `fwd_${forwardedMessage.id}.json`)
  await fs.writeFile(sentPath, JSON.stringify(forwardedMessage, null, 2))

  return forwardedMessage
}

/**
 * List messages in a session's inbox
 */
export async function listInboxMessages(
  sessionName: string,
  filter?: {
    status?: Message['status']
    priority?: Message['priority']
    from?: string
  }
): Promise<MessageSummary[]> {
  await ensureSessionDirectories(sessionName)
  const inboxDir = getInboxDir(sessionName)

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

      // Apply filters
      if (filter?.status && message.status !== filter.status) continue
      if (filter?.priority && message.priority !== filter.priority) continue
      if (filter?.from && message.from !== filter.from) continue

      messages.push({
        id: message.id,
        from: message.from,
        to: message.to,
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

  // Sort by timestamp (newest first)
  messages.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

  return messages
}

/**
 * List messages in a session's sent folder (outbox)
 */
export async function listSentMessages(
  sessionName: string,
  filter?: {
    priority?: Message['priority']
    to?: string
  }
): Promise<MessageSummary[]> {
  await ensureSessionDirectories(sessionName)
  const sentDir = getSentDir(sessionName)

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

      // Apply filters
      if (filter?.priority && message.priority !== filter.priority) continue
      if (filter?.to && message.to !== filter.to) continue

      messages.push({
        id: message.id,
        from: message.from,
        to: message.to,
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

  // Sort by timestamp (newest first)
  messages.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

  return messages
}

/**
 * Get sent message count for a session
 */
export async function getSentCount(sessionName: string): Promise<number> {
  const messages = await listSentMessages(sessionName)
  return messages.length
}

/**
 * Get a specific message by ID from inbox or sent folder
 */
export async function getMessage(
  sessionName: string,
  messageId: string,
  box: 'inbox' | 'sent' = 'inbox'
): Promise<Message | null> {
  const dir = box === 'sent' ? getSentDir(sessionName) : getInboxDir(sessionName)
  const messagePath = path.join(dir, `${messageId}.json`)

  try {
    const content = await fs.readFile(messagePath, 'utf-8')
    return JSON.parse(content)
  } catch (error) {
    // If not found in specified box, try the other box as fallback
    const fallbackDir = box === 'sent' ? getInboxDir(sessionName) : getSentDir(sessionName)
    const fallbackPath = path.join(fallbackDir, `${messageId}.json`)

    try {
      const content = await fs.readFile(fallbackPath, 'utf-8')
      return JSON.parse(content)
    } catch (fallbackError) {
      return null
    }
  }
}

/**
 * Mark a message as read
 */
export async function markMessageAsRead(sessionName: string, messageId: string): Promise<boolean> {
  const message = await getMessage(sessionName, messageId)
  if (!message) return false

  message.status = 'read'

  const inboxPath = path.join(getInboxDir(sessionName), `${messageId}.json`)
  await fs.writeFile(inboxPath, JSON.stringify(message, null, 2))

  return true
}

/**
 * Archive a message (move from inbox to archived)
 */
export async function archiveMessage(sessionName: string, messageId: string): Promise<boolean> {
  const message = await getMessage(sessionName, messageId)
  if (!message) return false

  message.status = 'archived'

  const inboxPath = path.join(getInboxDir(sessionName), `${messageId}.json`)
  const archivedPath = path.join(getArchivedDir(sessionName), `${messageId}.json`)

  await fs.writeFile(archivedPath, JSON.stringify(message, null, 2))
  await fs.unlink(inboxPath)

  return true
}

/**
 * Delete a message permanently
 */
export async function deleteMessage(sessionName: string, messageId: string): Promise<boolean> {
  const inboxPath = path.join(getInboxDir(sessionName), `${messageId}.json`)

  try {
    await fs.unlink(inboxPath)
    return true
  } catch (error) {
    return false
  }
}

/**
 * Get unread message count for a session
 */
export async function getUnreadCount(sessionName: string): Promise<number> {
  const messages = await listInboxMessages(sessionName, { status: 'unread' })
  return messages.length
}

/**
 * List all sessions with messages
 */
export async function listSessionsWithMessages(): Promise<string[]> {
  await ensureMessageDirectories()
  const inboxDir = path.join(MESSAGE_DIR, 'inbox')

  try {
    const sessions = await fs.readdir(inboxDir)
    return sessions
  } catch (error) {
    return []
  }
}

/**
 * Get message statistics for a session
 */
export async function getMessageStats(sessionName: string): Promise<{
  unread: number
  total: number
  byPriority: Record<string, number>
}> {
  const messages = await listInboxMessages(sessionName)

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
