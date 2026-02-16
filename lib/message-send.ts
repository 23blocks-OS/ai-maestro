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

import crypto from 'crypto'
import { deliver } from '@/lib/message-delivery'
import { writeToAMPSent } from '@/lib/amp-inbox-writer'
import { applyContentSecurity } from '@/lib/content-security'
import { checkMessageAllowed } from '@/lib/message-filter'
import { queueMessage as queueToAMPRelay } from '@/lib/amp-relay'
import { resolveAgentIdentifier, getMessage } from '@/lib/messageQueue'
import { getAgent } from '@/lib/agent-registry'
import { verifySignature } from '@/lib/amp-keys'
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
  // NEVER use raw identifier as agentId - it could be a name
  const toResolved: ResolvedAgent = toAgent || {
    agentId: '',  // Empty string - forces UUID-based functions to resolve or fail
    alias: options.toAlias || toIdentifier,
    hostId: targetHostId || undefined,
    hostUrl: undefined
  }

  // ── Governance: Message Filter ──────────────────────────────────────
  if (fromAgent?.agentId && toResolved.agentId) {
    const filterResult = checkMessageAllowed({
      senderAgentId: fromAgent.agentId,
      recipientAgentId: toResolved.agentId,
    })
    if (!filterResult.allowed) {
      throw new Error(filterResult.reason || 'Message blocked by team governance policy')
    }
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
  // Uses the same canonical format as /api/v1/route:
  //   from|to|subject|priority|in_reply_to|payloadHash
  let signatureVerified = false
  if (options.amp?.signature && options.amp?.senderPublicKey) {
    try {
      const payloadHash = crypto
        .createHash('sha256')
        .update(JSON.stringify(content))
        .digest('base64')
      const signatureData = [
        options.amp.ampAddress || (fromAgent?.alias || from),
        options.toAlias || toResolved.alias || to,
        subject,
        options.priority || 'normal',
        options.inReplyTo || '',
        payloadHash
      ].join('|')
      signatureVerified = verifySignature(signatureData, options.amp.signature, options.amp.senderPublicKey)
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
    // Send to remote host via AMP protocol (mesh forwarding)
    const selfHostId = getSelfHostId() || getHostName()
    console.log(`[MessageSend] Forwarding to remote agent ${toResolved.alias}@${targetHostId} via ${remoteHostUrl}/api/v1/route`)
    const { envelope: remoteEnvelope } = buildAMPEnvelope(message)
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10_000)
      const remoteResponse = await fetch(`${remoteHostUrl}/api/v1/route`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'X-Forwarded-From': selfHostId,
          'X-AMP-Envelope-Id': remoteEnvelope.id,
        },
        body: JSON.stringify({
          from: remoteEnvelope.from,
          to: toResolved.alias || toIdentifier,
          subject,
          payload: { type: content.type, message: content.message, context: content.context },
          priority: options.priority || 'normal',
          in_reply_to: options.inReplyTo,
        }),
      })
      clearTimeout(timeoutId)
      if (!remoteResponse.ok) {
        const errorText = await remoteResponse.text().catch(() => 'unknown')
        throw new Error(`Remote host returned ${remoteResponse.status}: ${errorText}`)
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new Error(`Remote delivery to ${targetHostId} timed out`)
      }
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
      // Pass senderPublicKeyHex when sender is verified so deliver() preserves trust level
      const senderPubKey = isFromVerified ? (options.amp?.senderPublicKey || 'verified') : undefined
      const result = await deliver({
        envelope,
        payload,
        recipientAgentName: recipientName,
        senderPublicKeyHex: senderPubKey,
        senderName: message.fromAlias || message.from,
        senderHost: fromHostId,
        recipientAgentId: toResolved.agentId,
        subject: message.subject,
        priority: message.priority,
        messageType: content.type,
      })
      if (!result.delivered) {
        throw new Error(`Message delivery failed for ${recipientName}: ${result.error || 'unknown error'}`)
      }
      notified = result.notified
    }
  }

  // ── Write sender's sent folder (only for local agents with UUID) ─────
  const senderName = fromAgent?.alias || message.fromAlias || message.from
  const senderUUID = fromAgent?.agentId
  if (senderUUID) {
    const { envelope: sentEnvelope, payload: sentPayload } = buildAMPEnvelope(message)
    await writeToAMPSent(sentEnvelope, sentPayload, senderName, senderUUID)
  }

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
    agentId: '',
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
    // Forward to remote host via AMP protocol (mesh forwarding)
    const selfHostId = getSelfHostId() || getHostName()
    console.log(`[MessageSend] Forwarding to remote agent ${toResolved.alias}@${targetHostId} via ${remoteHostUrl}/api/v1/route`)
    const { envelope: fwdEnvelope } = buildAMPEnvelope(forwardedMessage)
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10_000)
      const remoteResponse = await fetch(`${remoteHostUrl}/api/v1/route`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'X-Forwarded-From': selfHostId,
          'X-AMP-Envelope-Id': fwdEnvelope.id,
        },
        body: JSON.stringify({
          from: fwdEnvelope.from,
          to: toResolved.alias || toIdentifier,
          subject: forwardedMessage.subject,
          payload: { type: 'notification', message: forwardedMessage.content.message },
          priority: forwardedMessage.priority || 'normal',
        }),
      })
      clearTimeout(timeoutId)
      if (!remoteResponse.ok) {
        const errorText = await remoteResponse.text().catch(() => 'unknown')
        throw new Error(`Remote host returned ${remoteResponse.status}: ${errorText}`)
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new Error(`Forward to ${targetHostId} timed out`)
      }
      throw new Error(`Failed to forward message to remote agent: ${error}`)
    }
  } else {
    // Check if recipient is an AMP-external agent without active session
    const recipientFullAgent = getAgent(toResolved.agentId)
    const isAMPExternalAgent = recipientFullAgent?.metadata?.amp?.registeredVia === 'amp-v1-api'
    const hasNoActiveSession = !toResolved.sessionName ||
      !recipientFullAgent?.sessions?.some((s: any) => s.status === 'online')

    if (isAMPExternalAgent && hasNoActiveSession) {
      // Queue to AMP relay for external agent to poll
      console.log(`[MessageSend] Forward recipient ${toResolved.alias} is AMP external agent - queuing to relay`)
      const { envelope, payload } = buildAMPEnvelope(forwardedMessage)
      queueToAMPRelay(toResolved.agentId, envelope, payload, '')
    } else {
      // Local delivery via deliver()
      const recipientName = toResolved.alias || toResolved.agentId
      const { envelope, payload } = buildAMPEnvelope(forwardedMessage)
      const result = await deliver({
        envelope,
        payload,
        recipientAgentName: recipientName,
        senderPublicKeyHex: 'verified',  // Forwards are always from a local verified agent
        senderName: fromResolved.alias || fromResolved.agentId,
        senderHost: fromHostId,
        recipientAgentId: toResolved.agentId,
        subject: forwardedMessage.subject,
        priority: forwardedMessage.priority,
        messageType: 'notification',
      })
      if (!result.delivered) {
        throw new Error(`Forward delivery failed for ${recipientName}: ${result.error || 'unknown error'}`)
      }
      notified = result.notified
    }
  }

  // ── Write sender's sent folder (only for local agents with UUID) ─────
  if (fromResolved.agentId) {
    const senderName = fromResolved.alias || fromResolved.agentId
    const { envelope: sentEnvelope, payload: sentPayload } = buildAMPEnvelope(forwardedMessage)
    await writeToAMPSent(sentEnvelope, sentPayload, senderName, fromResolved.agentId)
  }

  return { message: forwardedMessage, notified }
}
