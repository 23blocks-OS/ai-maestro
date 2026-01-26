import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'
import { getHostById, getSelfHost, getSelfHostId, isSelf } from './hosts-config-server.mjs'
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
  fromAlias?: string     // Agent alias for display
  fromSession?: string   // Actual session name (for delivery)
  fromHost?: string      // Host ID where sender resides (e.g., 'macbook-pro', 'mac-mini')
  fromVerified?: boolean // True if sender is a registered agent, false for external agents
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
  fromVerified?: boolean  // True if sender is registered, false for external agents
  to: string
  toAlias?: string
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

const MESSAGE_DIR = path.join(os.homedir(), '.aimaestro', 'messages')

/**
 * GAP8 FIX: Track legacy location access for deprecation monitoring
 * This helps identify when legacy fallbacks are still being used
 */
const legacyAccessLog = new Map<string, number>()

function logLegacyAccess(location: string, operation: string): void {
  const key = `${operation}:${location}`
  const count = legacyAccessLog.get(key) || 0
  legacyAccessLog.set(key, count + 1)

  // Log every 10th access to avoid log spam
  if ((count + 1) % 10 === 1) {
    console.log(`[MessageQueue] GAP8 DEPRECATION: Legacy location access - ${operation} from "${location}" (access #${count + 1})`)
  }
}

/**
 * GAP8 FIX: Get legacy access statistics for monitoring
 */
export function getLegacyAccessStats(): Record<string, number> {
  const stats: Record<string, number> = {}
  legacyAccessLog.forEach((count, key) => {
    stats[key] = count
  })
  return stats
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
 * GAP8 FIX: Migrate messages from legacy locations to agent-ID folders
 * This function consolidates messages that may exist in session-name based folders
 * to the canonical agent-ID folder format.
 *
 * @param dryRun - If true, only report what would be migrated without making changes
 * @returns Migration report with counts and details
 */
export async function migrateMessagesToAgentIdFolders(dryRun: boolean = false): Promise<{
  scanned: number
  migrated: number
  errors: string[]
  details: Array<{ from: string; to: string; messageId: string }>
}> {
  const report = {
    scanned: 0,
    migrated: 0,
    errors: [] as string[],
    details: [] as Array<{ from: string; to: string; messageId: string }>
  }

  await ensureMessageDirectories()
  const agents = loadAgents()

  for (const agent of agents) {
    const agentId = agent.id
    const agentName = agent.name || agent.alias || ''

    if (!agentId || !agentName) continue

    // Check if session-name based folder exists with messages that should be in agent-ID folder
    for (const boxType of ['inbox', 'sent', 'archived'] as const) {
      const legacyDir = path.join(MESSAGE_DIR, boxType, agentName)
      const canonicalDir = path.join(MESSAGE_DIR, boxType, agentId)

      if (legacyDir === canonicalDir) continue // Same folder, skip

      try {
        const files = await fs.readdir(legacyDir)

        for (const file of files) {
          if (!file.endsWith('.json')) continue
          report.scanned++

          const legacyPath = path.join(legacyDir, file)
          const canonicalPath = path.join(canonicalDir, file)

          // Check if file already exists in canonical location
          try {
            await fs.access(canonicalPath)
            // Already migrated, skip (but don't delete legacy to be safe)
            continue
          } catch {
            // Canonical doesn't exist, should migrate
          }

          if (dryRun) {
            report.details.push({
              from: legacyPath,
              to: canonicalPath,
              messageId: file.replace('.json', '')
            })
            report.migrated++
          } else {
            try {
              // Ensure canonical directory exists
              await fs.mkdir(canonicalDir, { recursive: true })

              // Copy message to canonical location (copy, don't move, for safety)
              const content = await fs.readFile(legacyPath, 'utf-8')
              await fs.writeFile(canonicalPath, content)

              report.details.push({
                from: legacyPath,
                to: canonicalPath,
                messageId: file.replace('.json', '')
              })
              report.migrated++

              console.log(`[MessageQueue] GAP8 MIGRATION: Copied ${file} from ${agentName}/${boxType} to ${agentId}/${boxType}`)
            } catch (error) {
              report.errors.push(`Failed to migrate ${legacyPath}: ${error}`)
            }
          }
        }
      } catch {
        // Legacy directory doesn't exist, nothing to migrate
      }
    }
  }

  if (report.migrated > 0) {
    console.log(`[MessageQueue] GAP8 MIGRATION: ${dryRun ? 'Would migrate' : 'Migrated'} ${report.migrated} messages`)
  }

  return report
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

  // Determine if target is on this host BEFORE resolution
  const selfHost = getSelfHost()
  const selfHostId = selfHost?.id || getSelfHostId()
  const isTargetLocal = !targetHostId || isSelf(targetHostId)

  // Resolve recipient agent
  // GAP4 FIX: For remote targets, allow sending without local resolution
  // EXTERNAL AGENTS: Also allow unregistered local recipients (creates inbox on demand)
  const toAgent = resolveAgent(toIdentifier)

  // For unresolved recipients (local or remote), create minimal resolved info
  // This allows external agents to receive messages without full registration
  const toResolved: ResolvedAgent = toAgent || {
    agentId: toIdentifier,
    alias: options?.toAlias || toIdentifier,
    hostId: targetHostId || undefined,
    hostUrl: undefined
  }

  // Ensure directories exist for sender (registered or external)
  const senderIdForDirs = fromAgent?.agentId || from
  await ensureAgentDirectories(senderIdForDirs)

  // Create local directories for local recipients (registered or external)
  if (isTargetLocal && toResolved.agentId) {
    await ensureAgentDirectories(toResolved.agentId)
  }

  // Determine host info - use provided values or resolve from agent
  // Always use the actual hostname for cross-host compatibility
  const fromHostId = options?.fromHost || fromAgent?.hostId || getSelfHostName()
  const toHostId = options?.toHost || targetHostId || toResolved?.hostId || getSelfHostName()

  const message: Message = {
    id: generateMessageId(),
    from: fromAgent?.agentId || from,
    fromAlias: options?.fromAlias || fromAgent?.alias,
    fromSession: fromAgent?.sessionName,
    fromHost: fromHostId,
    fromVerified: !!fromAgent,  // true if sender is registered, false for external agents
    to: toResolved.agentId,
    toAlias: options?.toAlias || toResolved.alias,
    toSession: toResolved.sessionName,
    toHost: toHostId,
    timestamp: new Date().toISOString(),
    subject,
    priority: options?.priority || 'normal',
    status: 'unread',
    content,
    inReplyTo: options?.inReplyTo,
  }

  // Determine if recipient is on a remote host (reuse isTargetLocal computed above)
  let recipientIsRemote = false
  let remoteHostUrl: string | null = null

  if (targetHostId && !isTargetLocal) {
    // Target is explicitly on a remote host - look it up
    const remoteHost = getHostById(targetHostId)
    if (!remoteHost) {
      // CRITICAL: Don't silently fall back to local delivery
      throw new Error(`Target host '${targetHostId}' not found. Ensure the host is registered in ~/.aimaestro/hosts.json`)
    }
    recipientIsRemote = true
    remoteHostUrl = remoteHost.url
  }

  if (recipientIsRemote && remoteHostUrl) {
    // Send message to remote host via HTTP
    console.log(`[MessageQueue] Sending message to remote agent ${toResolved.alias}@${targetHostId} at ${remoteHostUrl}`)

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
    const inboxPath = path.join(getInboxDir(toResolved.agentId), `${message.id}.json`)
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

  // Determine if target is on this host BEFORE resolution (GAP4 FIX)
  const selfHost = getSelfHost()
  const isTargetLocal = !targetHostId || isSelf(targetHostId)

  // Resolve sender agent
  const fromResolved = resolveAgent(fromAgent)
  if (!fromResolved) {
    throw new Error(`Unknown sender: ${fromAgent}`)
  }

  // Resolve recipient agent
  // GAP4 FIX: For remote targets, allow forwarding without local resolution
  const toResolvedLocal = resolveAgent(toIdentifier)
  if (!toResolvedLocal && isTargetLocal) {
    throw new Error(`Unknown recipient: ${toAgent}`)
  }

  // For remote targets without local resolution, create minimal resolved info
  const toResolved: ResolvedAgent = toResolvedLocal || {
    agentId: toIdentifier,
    alias: toIdentifier,
    hostId: targetHostId || undefined,
    hostUrl: undefined
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
  // Only create local directories for local recipients
  if (isTargetLocal && toResolved.agentId) {
    await ensureAgentDirectories(toResolved.agentId)
  }

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

  // Determine host info for forwarded message
  const fromHostId = fromResolved.hostId || getSelfHostName()
  const toHostId = targetHostId || toResolved.hostId || getSelfHostName()

  // Create forwarded message
  const forwardedMessage: Message = {
    id: generateMessageId(),
    from: fromResolved.agentId,
    fromAlias: fromResolved.alias,
    fromSession: fromResolved.sessionName,
    fromHost: fromHostId,
    to: toResolved.agentId,
    toAlias: toResolved.alias,
    toSession: toResolved.sessionName,
    toHost: toHostId,
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

  // Determine if recipient is on a remote host (reuse isTargetLocal computed above)
  let recipientIsRemote = false
  let remoteHostUrl: string | null = null

  if (targetHostId && !isTargetLocal) {
    // Target is explicitly on a remote host - look it up
    const remoteHost = getHostById(targetHostId)
    if (!remoteHost) {
      // CRITICAL: Don't silently fall back to local delivery
      throw new Error(`Target host '${targetHostId}' not found. Ensure the host is registered in ~/.aimaestro/hosts.json`)
    }
    recipientIsRemote = true
    remoteHostUrl = remoteHost.url
  }

  if (recipientIsRemote && remoteHostUrl) {
    console.log(`[MessageQueue] Forwarding message to remote agent ${toResolved.alias}@${targetHostId} at ${remoteHostUrl}`)

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
    // Fallback: try as direct folder name (LEGACY)
    logLegacyAccess(agentIdentifier, 'listInboxFallback')
    return listInboxMessagesByFolder(agentIdentifier, filter)
  }

  await ensureAgentDirectories(agent.agentId)

  // Collect messages from multiple possible locations
  // GAP8 FIX: Legacy locations are now tracked for deprecation monitoring
  const allMessages: MessageSummary[] = []
  const seenIds = new Set<string>()

  // Location 1: Agent ID folder (new/canonical format)
  const agentIdDir = getInboxDir(agent.agentId)
  await collectMessagesFromDir(agentIdDir, filter, allMessages, seenIds, false)

  // Location 2: Session name folder (LEGACY - will be deprecated)
  if (agent.sessionName && agent.sessionName !== agent.agentId) {
    const sessionDir = path.join(MESSAGE_DIR, 'inbox', agent.sessionName)
    await collectMessagesFromDir(sessionDir, filter, allMessages, seenIds, true)
  }

  // Location 3: Original identifier if different (LEGACY fallback)
  if (agentIdentifier !== agent.agentId && agentIdentifier !== agent.sessionName) {
    const identifierDir = path.join(MESSAGE_DIR, 'inbox', agentIdentifier)
    await collectMessagesFromDir(identifierDir, filter, allMessages, seenIds, true)
  }

  // Sort by timestamp (newest first)
  allMessages.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

  return allMessages
}

/**
 * Helper to collect messages from a directory into the results array
 * GAP8 FIX: Now tracks when legacy locations are accessed for deprecation monitoring
 */
async function collectMessagesFromDir(
  dirPath: string,
  filter: {
    status?: Message['status']
    priority?: Message['priority']
    from?: string
  } | undefined,
  results: MessageSummary[],
  seenIds: Set<string>,
  isLegacyLocation: boolean = false
): Promise<void> {
  let files: string[]
  try {
    files = await fs.readdir(dirPath)
  } catch (error) {
    return // Directory doesn't exist, skip
  }

  // GAP8 FIX: Log legacy location access if messages are found
  if (isLegacyLocation && files.some(f => f.endsWith('.json'))) {
    logLegacyAccess(dirPath, 'collectInbox')
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
        fromVerified: message.fromVerified,
        to: message.to,
        toAlias: message.toAlias,
        toHost: message.toHost,
        timestamp: message.timestamp,
        subject: message.subject,
        priority: message.priority,
        status: message.status,
        type: message.content.type,
        preview: message.content.message.substring(0, 100),
        // Check if message came from Slack bridge (has slack context)
        viaSlack: !!(message.content as any).slack,
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
        fromVerified: message.fromVerified,
        to: message.to,
        toAlias: message.toAlias,
        toHost: message.toHost,
        timestamp: message.timestamp,
        subject: message.subject,
        priority: message.priority,
        status: message.status,
        type: message.content.type,
        preview: message.content.message.substring(0, 100),
        // Check if message came from Slack bridge (has slack context)
        viaSlack: !!(message.content as any).slack,
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
 * GAP8 FIX: Checks multiple locations with legacy access tracking
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
    // Fallback to direct folder (LEGACY)
    logLegacyAccess(agentIdentifier, 'listSentFallback')
    return listSentMessagesByFolder(agentIdentifier, filter)
  }

  await ensureAgentDirectories(agent.agentId)

  // Collect messages from multiple possible locations
  // GAP8 FIX: Legacy locations are now tracked for deprecation monitoring
  const allMessages: MessageSummary[] = []
  const seenIds = new Set<string>()

  // Location 1: Agent ID folder (new/canonical format)
  const agentIdDir = getSentDir(agent.agentId)
  await collectSentMessagesFromDir(agentIdDir, filter, allMessages, seenIds, false)

  // Location 2: Session name folder (LEGACY - will be deprecated)
  if (agent.sessionName && agent.sessionName !== agent.agentId) {
    const sessionDir = path.join(MESSAGE_DIR, 'sent', agent.sessionName)
    await collectSentMessagesFromDir(sessionDir, filter, allMessages, seenIds, true)
  }

  // Location 3: Original identifier if different (LEGACY fallback)
  if (agentIdentifier !== agent.agentId && agentIdentifier !== agent.sessionName) {
    const identifierDir = path.join(MESSAGE_DIR, 'sent', agentIdentifier)
    await collectSentMessagesFromDir(identifierDir, filter, allMessages, seenIds, true)
  }

  allMessages.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
  return allMessages
}

/**
 * Helper to collect sent messages from a directory
 * GAP8 FIX: Now tracks when legacy locations are accessed
 */
async function collectSentMessagesFromDir(
  dirPath: string,
  filter: {
    priority?: Message['priority']
    to?: string
  } | undefined,
  results: MessageSummary[],
  seenIds: Set<string>,
  isLegacyLocation: boolean = false
): Promise<void> {
  let files: string[]
  try {
    files = await fs.readdir(dirPath)
  } catch (error) {
    return // Directory doesn't exist, skip
  }

  // GAP8 FIX: Log legacy location access if messages are found
  if (isLegacyLocation && files.some(f => f.endsWith('.json'))) {
    logLegacyAccess(dirPath, 'collectSent')
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
        // Check if message has Slack context (reply to Slack thread)
        viaSlack: !!(message.content as any).slack,
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
        // Check if message has Slack context (reply to Slack thread)
        viaSlack: !!(message.content as any).slack,
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
 * GAP8 FIX: Checks multiple locations with legacy access tracking
 */
export async function getMessage(
  agentIdentifier: string,
  messageId: string,
  box: 'inbox' | 'sent' = 'inbox'
): Promise<Message | null> {
  const agent = resolveAgent(agentIdentifier)
  const boxDir = box === 'sent' ? 'sent' : 'inbox'

  // Build list of directories to check with legacy flag
  // GAP8 FIX: Track which locations are legacy for deprecation monitoring
  const dirsToCheck: Array<{ path: string; isLegacy: boolean }> = []

  // 1. Agent ID folder - canonical location (if resolved)
  if (agent) {
    dirsToCheck.push({ path: path.join(MESSAGE_DIR, boxDir, agent.agentId), isLegacy: false })
  }

  // 2. Session name folder (LEGACY - may be symlink to old UUID)
  if (agent?.sessionName && agent.sessionName !== agent.agentId) {
    dirsToCheck.push({ path: path.join(MESSAGE_DIR, boxDir, agent.sessionName), isLegacy: true })
  }

  // 3. Original identifier as fallback (LEGACY)
  if (!agent || (agentIdentifier !== agent.agentId && agentIdentifier !== agent.sessionName)) {
    dirsToCheck.push({ path: path.join(MESSAGE_DIR, boxDir, agentIdentifier), isLegacy: true })
  }

  // Try each directory
  for (const { path: dir, isLegacy } of dirsToCheck) {
    const messagePath = path.join(dir, `${messageId}.json`)
    try {
      const content = await fs.readFile(messagePath, 'utf-8')

      // GAP8 FIX: Log if message was found in legacy location
      if (isLegacy) {
        logLegacyAccess(dir, 'getMessage')
      }

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
 * GAP8 FIX: Tracks legacy location access for deprecation monitoring
 */
async function findMessagePath(
  agentIdentifier: string,
  messageId: string,
  box: 'inbox' | 'sent'
): Promise<string | null> {
  const agent = resolveAgent(agentIdentifier)
  const boxDir = box === 'sent' ? 'sent' : 'inbox'

  // Build list of directories to check with legacy flag
  // GAP8 FIX: Track which locations are legacy
  const dirsToCheck: Array<{ path: string; isLegacy: boolean }> = []

  if (agent) {
    dirsToCheck.push({ path: path.join(MESSAGE_DIR, boxDir, agent.agentId), isLegacy: false })
  }

  if (agent?.sessionName && agent.sessionName !== agent.agentId) {
    dirsToCheck.push({ path: path.join(MESSAGE_DIR, boxDir, agent.sessionName), isLegacy: true })
  }

  if (!agent || (agentIdentifier !== agent.agentId && agentIdentifier !== agent.sessionName)) {
    dirsToCheck.push({ path: path.join(MESSAGE_DIR, boxDir, agentIdentifier), isLegacy: true })
  }

  // Try each directory
  for (const { path: dir, isLegacy } of dirsToCheck) {
    const messagePath = path.join(dir, `${messageId}.json`)
    try {
      await fs.access(messagePath)

      // GAP8 FIX: Log if message was found in legacy location
      if (isLegacy) {
        logLegacyAccess(dir, 'findMessagePath')
      }

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
