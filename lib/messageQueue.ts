import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'

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
 * Send a message from one session to another
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
  await ensureSessionDirectories(to)

  const message: Message = {
    id: generateMessageId(),
    from,
    to,
    timestamp: new Date().toISOString(),
    subject,
    priority: options?.priority || 'normal',
    status: 'unread',
    content,
    inReplyTo: options?.inReplyTo,
  }

  // Write to recipient's inbox
  const inboxPath = path.join(getInboxDir(to), `${message.id}.json`)
  await fs.writeFile(inboxPath, JSON.stringify(message, null, 2))

  // Write to sender's sent folder
  const sentPath = path.join(getSentDir(from), `${message.id}.json`)
  await fs.writeFile(sentPath, JSON.stringify(message, null, 2))

  return message
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
 * Get a specific message by ID
 */
export async function getMessage(sessionName: string, messageId: string): Promise<Message | null> {
  const inboxPath = path.join(getInboxDir(sessionName), `${messageId}.json`)

  try {
    const content = await fs.readFile(inboxPath, 'utf-8')
    return JSON.parse(content)
  } catch (error) {
    return null
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
