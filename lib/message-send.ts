/**
 * Message Send - Web UI message composition + routing
 *
 * Replaces the write half of sendMessage() / forwardMessage() from messageQueue.ts.
 * Web UI endpoints (/api/messages POST, /api/agents/[id]/messages POST, etc.) call
 * sendFromUI() and forwardFromUI().
 *
 * Flow:
 *   1. Resolve sender/recipient agents
 *   2. Build AMP envelope + payload
 *   3. Apply content security
 *   4. Local → deliver(), Remote → HTTP forward, External+offline → relay queue
 *   5. Write sender's sent folder
 *   6. Return Message object for response compatibility
 */

import { deliver } from '@/lib/message-delivery'
import { writeToAMPSent } from '@/lib/amp-inbox-writer'
import { applyContentSecurity } from '@/lib/content-security'
import { queueMessage as queueToAMPRelay } from '@/lib/amp-relay'
import { resolveAgentIdentifier, getMessage } from '@/lib/messageQueue'
import { getAgent } from '@/lib/agent-registry'
import { getHostById, getSelfHost, getSelfHostId, isSelf } from '@/lib/hosts-config-server.mjs'
import type { AMPEnvelope, AMPPayload } from '@/lib/types/amp'
import type { Message } from '@/lib/messageQueue'

// Re-export Message type for consumers
export type { Message } from '@/lib/messageQueue'

interface ResolvedAgent {
  agentId: string
  alias: string
  displayName?: string
  sessionName?: string
  hostId?: string
  hostUrl?: string
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
 * Generate a unique message ID
 */
function generateMessageId(): string {
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2, 9)
  return `msg-${timestamp}-${random}`
}

/**
 * Get this host's name for messages
 */
function getHostName(): string {
  try {
    const selfHost = getSelfHost()
    return selfHost.name || getSelfHostId() || 'unknown-host'
  } catch {
    return getSelfHostId() || 'unknown-host'
  }
}

/**
 * Build AMP envelope + payload from web UI message params
 */
function buildAMPEnvelope(message: Message): { envelope: AMPEnvelope; payload: AMPPayload } {
  const selfHostId = getSelfHostId() || getHostName()
  const msgIdNormalized = message.id.replace(/-/g, '_')
  const envelope: AMPEnvelope = {
    version: 'amp/0.1',
    id: msgIdNormalized,
    from: `${message.fromAlias || message.from}@${selfHostId}.aimaestro.local`,
    to: `${message.toAlias || message.to}@${(message.toHost || selfHostId)}.aimaestro.local`,
    subject: message.subject,
    priority: message.priority,
    timestamp: message.timestamp,
    signature: message.amp?.signature || '',
    thread_id: message.inReplyTo || msgIdNormalized,
  }
  if (message.inReplyTo) {
    envelope.in_reply_to = message.inReplyTo
  }
  const payload: AMPPayload = {
    type: message.content.type,
    message: message.content.message,
    context: message.content.context,
  }
  return { envelope, payload }
}

// ============================================================================
// sendFromUI
// ============================================================================

export interface SendFromUIOptions {
  from: string
  to: string
  subject: string
  content: Message['content']
  priority?: Message['priority']
  inReplyTo?: string
  fromHost?: string
  toHost?: string
  fromAlias?: string
  toAlias?: string
  fromLabel?: string
  toLabel?: string
  fromVerified?: boolean
  amp?: {
    signature?: string
    senderPublicKey?: string
    ampAddress?: string
    envelopeId?: string
  }
}

export async function sendFromUI(options: SendFromUIOptions): Promise<{ message: Message; notified: boolean }> {
  const { from, to, subject, content } = options

  // Parse qualified name (identifier@host-id)
  const { identifier: toIdentifier, hostId: targetHostId } = parseQualifiedName(to)

  // Resolve sender agent (may fail for remote senders - that's ok)
  const fromAgent = resolveAgentIdentifier(from)

  // Determine if target is on this host BEFORE resolution
  const isTargetLocal = !targetHostId || isSelf(targetHostId)

  // Resolve recipient agent
  const toAgent = resolveAgentIdentifier(toIdentifier)

  // For unresolved recipients, create minimal resolved info
  const toResolved: ResolvedAgent = toAgent || {
    agentId: toIdentifier,
    alias: options.toAlias || toIdentifier,
    hostId: targetHostId || undefined,
    hostUrl: undefined
  }

  // Determine host info
  const fromHostId = options.fromHost || fromAgent?.hostId || getHostName()
  const toHostId = options.toHost || targetHostId || toResolved?.hostId || getHostName()

  // Determine verified status
  let isFromVerified: boolean
  if (options.fromVerified !== undefined) {
    isFromVerified = options.fromVerified
  } else if (fromAgent) {
    isFromVerified = true
  } else if (options.fromHost && !isSelf(options.fromHost)) {
    const remoteFromHost = getHostById(options.fromHost)
    isFromVerified = !!remoteFromHost
  } else {
    isFromVerified = false
  }

  // AMP signature verification (if provided)
  let signatureVerified = false
  if (options.amp?.signature && options.amp?.senderPublicKey) {
    try {
      const { verifySignature } = require('@/lib/amp-keys')
      const canonicalData = JSON.stringify({
        from: options.amp.ampAddress || (fromAgent?.alias || from),
        to: options.toAlias || toResolved.alias || to,
        subject,
        timestamp: new Date().toISOString().split('T')[0],
      })
      signatureVerified = verifySignature(canonicalData, options.amp.signature, options.amp.senderPublicKey)
      if (signatureVerified) {
        isFromVerified = true
      }
    } catch (error) {
      console.error('[MessageSend] AMP signature verification failed:', error)
    }
  }

  // Build internal Message object
  const message: Message = {
    id: generateMessageId(),
    from: fromAgent?.agentId || from,
    fromAlias: options.fromAlias || fromAgent?.alias,
    fromLabel: options.fromLabel || fromAgent?.displayName,
    fromSession: fromAgent?.sessionName,
    fromHost: fromHostId,
    fromVerified: isFromVerified,
    to: toResolved.agentId,
    toAlias: options.toAlias || toResolved.alias,
    toLabel: options.toLabel || toResolved.displayName,
    toSession: toResolved.sessionName,
    toHost: toHostId,
    timestamp: new Date().toISOString(),
    subject,
    priority: options.priority || 'normal',
    status: 'unread',
    content,
    inReplyTo: options.inReplyTo,
    amp: options.amp ? {
      signature: options.amp.signature,
      senderPublicKey: options.amp.senderPublicKey,
      signatureVerified,
      ampAddress: options.amp.ampAddress,
      envelopeId: options.amp.envelopeId,
    } : undefined,
  }

  // Content security
  const { flags: securityFlags } = applyContentSecurity(
    message.content,
    isFromVerified,
    message.fromAlias || from,
    fromHostId
  )
  if (securityFlags.length > 0) {
    console.log(`[SECURITY] Message from ${message.fromAlias || from}: ${securityFlags.length} injection pattern(s) flagged`)
  }

  // ── Routing ──────────────────────────────────────────────────────────
  let notified = false

  // Check for remote recipient
  let recipientIsRemote = false
  let remoteHostUrl: string | null = null

  if (targetHostId && !isTargetLocal) {
    const remoteHost = getHostById(targetHostId)
    if (!remoteHost) {
      throw new Error(`Target host '${targetHostId}' not found. Ensure the host is registered in ~/.aimaestro/hosts.json`)
    }
    recipientIsRemote = true
    remoteHostUrl = remoteHost.url
  }

  if (recipientIsRemote && remoteHostUrl) {
    // Send to remote host via HTTP
    console.log(`[MessageSend] Sending to remote agent ${toResolved.alias}@${targetHostId} at ${remoteHostUrl}`)
    try {
      const remoteResponse = await fetch(`${remoteHostUrl}/api/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: message.from,
          fromAlias: message.fromAlias,
          fromLabel: message.fromLabel,
          fromHost: message.fromHost,
          fromVerified: message.fromVerified,
          to: message.to,
          toAlias: message.toAlias,
          toLabel: message.toLabel,
          toHost: message.toHost,
          subject,
          content,
          priority: options.priority,
          inReplyTo: options.inReplyTo,
        }),
      })
      if (!remoteResponse.ok) {
        throw new Error(`Remote host returned ${remoteResponse.status}`)
      }
    } catch (error) {
      throw new Error(`Failed to deliver message to remote agent: ${error}`)
    }
  } else {
    // Local recipient
    const recipientFullAgent = getAgent(toResolved.agentId)
    const isAMPExternalAgent = recipientFullAgent?.metadata?.amp?.registeredVia === 'amp-v1-api'
    const hasNoActiveSession = !toResolved.sessionName ||
      !recipientFullAgent?.sessions?.some((s: any) => s.status === 'online')

    if (isAMPExternalAgent && hasNoActiveSession) {
      // Queue to AMP relay for external agent to poll
      console.log(`[MessageSend] Recipient ${toResolved.alias} is AMP external agent - queuing to relay`)
      const { envelope, payload } = buildAMPEnvelope(message)
      const senderPublicKey = message.amp?.senderPublicKey || ''
      queueToAMPRelay(toResolved.agentId, envelope, payload, senderPublicKey)
    } else {
      // Local delivery via deliver()
      const { envelope, payload } = buildAMPEnvelope(message)
      const recipientName = toResolved.alias || toResolved.agentId
      const result = await deliver({
        envelope,
        payload,
        recipientAgentName: recipientName,
        senderName: message.fromAlias || message.from,
        senderHost: fromHostId,
        recipientAgentId: toResolved.agentId,
        subject: message.subject,
        priority: message.priority,
        messageType: content.type,
      })
      notified = result.notified
    }
  }

  // ── Write sender's sent folder ───────────────────────────────────────
  const senderName = fromAgent?.alias || message.fromAlias || message.from
  const { envelope: sentEnvelope, payload: sentPayload } = buildAMPEnvelope(message)
  await writeToAMPSent(sentEnvelope, sentPayload, senderName)

  return { message, notified }
}

// ============================================================================
// forwardFromUI
// ============================================================================

export interface ForwardFromUIOptions {
  originalMessageId: string
  fromAgent: string
  toAgent: string
  forwardNote?: string
  providedOriginalMessage?: Message
}

export async function forwardFromUI(options: ForwardFromUIOptions): Promise<{ message: Message; notified: boolean }> {
  const { originalMessageId, fromAgent, toAgent, forwardNote, providedOriginalMessage } = options

  const { identifier: toIdentifier, hostId: targetHostId } = parseQualifiedName(toAgent)
  const isTargetLocal = !targetHostId || isSelf(targetHostId)

  // Resolve sender
  const fromResolved = resolveAgentIdentifier(fromAgent)
  if (!fromResolved) {
    throw new Error(`Unknown sender: ${fromAgent}`)
  }

  // Resolve recipient
  const toResolvedLocal = resolveAgentIdentifier(toIdentifier)
  if (!toResolvedLocal && isTargetLocal) {
    throw new Error(`Unknown recipient: ${toAgent}`)
  }

  const toResolved: ResolvedAgent = toResolvedLocal || {
    agentId: toIdentifier,
    alias: toIdentifier,
    hostId: targetHostId || undefined,
    hostUrl: undefined
  }

  // Get original message
  let originalMessage: Message | null
  if (providedOriginalMessage) {
    originalMessage = providedOriginalMessage
  } else {
    originalMessage = await getMessage(fromResolved.agentId, originalMessageId)
    if (!originalMessage) {
      throw new Error(`Message ${originalMessageId} not found`)
    }
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

  const fromHostId = fromResolved.hostId || getHostName()
  const toHostId = targetHostId || toResolved.hostId || getHostName()

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

  // ── Routing ──────────────────────────────────────────────────────────
  let notified = false

  let recipientIsRemote = false
  let remoteHostUrl: string | null = null

  if (targetHostId && !isTargetLocal) {
    const remoteHost = getHostById(targetHostId)
    if (!remoteHost) {
      throw new Error(`Target host '${targetHostId}' not found. Ensure the host is registered in ~/.aimaestro/hosts.json`)
    }
    recipientIsRemote = true
    remoteHostUrl = remoteHost.url
  }

  if (recipientIsRemote && remoteHostUrl) {
    console.log(`[MessageSend] Forwarding to remote agent ${toResolved.alias}@${targetHostId} at ${remoteHostUrl}`)
    try {
      const remoteResponse = await fetch(`${remoteHostUrl}/api/messages/forward`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          originalMessage: originalMessage,
          fromSession: fromResolved.agentId,
          toSession: toResolved.agentId,
          forwardNote,
        }),
      })
      if (!remoteResponse.ok) {
        throw new Error(`Remote host returned ${remoteResponse.status}`)
      }
    } catch (error) {
      throw new Error(`Failed to forward message to remote agent: ${error}`)
    }
  } else {
    // Local delivery via deliver()
    const recipientName = toResolved.alias || toResolved.agentId
    const { envelope, payload } = buildAMPEnvelope(forwardedMessage)
    const result = await deliver({
      envelope,
      payload,
      recipientAgentName: recipientName,
      senderName: fromResolved.alias || fromResolved.agentId,
      senderHost: fromHostId,
      recipientAgentId: toResolved.agentId,
      subject: forwardedMessage.subject,
      priority: forwardedMessage.priority,
      messageType: 'notification',
    })
    notified = result.notified
  }

  // ── Write sender's sent folder ───────────────────────────────────────
  const senderName = fromResolved.alias || fromResolved.agentId
  const { envelope: sentEnvelope, payload: sentPayload } = buildAMPEnvelope(forwardedMessage)
  await writeToAMPSent(sentEnvelope, sentPayload, senderName)

  return { message: forwardedMessage, notified }
}
