/**
 * AMP v1 Route Endpoint
 *
 * POST /api/v1/route
 *
 * Routes a message to the recipient agent.
 * This is the primary message-sending endpoint for AMP.
 *
 * The sender must be authenticated via API key (Bearer token).
 * Messages are delivered via:
 * 1. Local delivery (file system + tmux notification) - for local agents
 * 2. Relay queue - if recipient is offline
 * 3. HTTP forwarding - if recipient is on a remote host (federation)
 */

import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/amp-auth'
import { loadKeyPair, signMessage } from '@/lib/amp-keys'
import { queueMessage } from '@/lib/amp-relay'
import { sendMessage, resolveAgentIdentifier } from '@/lib/messageQueue'
import { getAgent, getAgentByName } from '@/lib/agent-registry'
import { notifyAgent } from '@/lib/notification-service'
import { getSelfHostId } from '@/lib/hosts-config-server.mjs'
import { AMP_PROVIDER_NAME } from '@/lib/types/amp'
import type {
  AMPRouteRequest,
  AMPRouteResponse,
  AMPEnvelope,
  AMPError
} from '@/lib/types/amp'

/**
 * Parse an AMP address into components
 * Format: name@[scope.]tenant.provider
 * Returns: { name, tenant, provider, scope? }
 */
function parseAMPAddress(address: string): {
  name: string
  tenant: string
  provider: string
  scope?: string
} | null {
  const atIndex = address.indexOf('@')
  if (atIndex === -1) return null

  const name = address.substring(0, atIndex)
  const domain = address.substring(atIndex + 1)
  const parts = domain.split('.')

  if (parts.length < 2) return null

  // Last part is provider (e.g., "aimaestro.local")
  // Could be "aimaestro.local" or just "crabmail.ai"
  // For now, assume provider is last 2 parts if ends in .local, else last part
  let provider: string
  let tenantParts: string[]

  if (domain.endsWith('.local')) {
    provider = parts.slice(-2).join('.')
    tenantParts = parts.slice(0, -2)
  } else {
    // External provider like crabmail.ai
    provider = parts.slice(-2).join('.')
    tenantParts = parts.slice(0, -2)
  }

  if (tenantParts.length === 0) {
    return null
  }

  // First tenant part is the tenant, rest is scope
  const tenant = tenantParts[tenantParts.length - 1]
  const scope = tenantParts.length > 1 ? tenantParts.slice(0, -1).join('.') : undefined

  return { name, tenant, provider, scope }
}

/**
 * Generate a message ID
 */
function generateMessageId(): string {
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2, 9)
  return `msg_${timestamp}_${random}`
}

export async function POST(request: NextRequest): Promise<NextResponse<AMPRouteResponse | AMPError>> {
  try {
    // Authenticate request
    const authHeader = request.headers.get('Authorization')
    const auth = authenticateRequest(authHeader)

    if (!auth.authenticated) {
      return NextResponse.json({
        error: auth.error || 'unauthorized',
        message: auth.message || 'Authentication required'
      } as AMPError, { status: 401 })
    }

    // Parse body
    const body = await request.json() as AMPRouteRequest

    // Validate required fields
    if (!body.to || typeof body.to !== 'string') {
      return NextResponse.json({
        error: 'missing_field',
        message: 'to address is required',
        field: 'to'
      } as AMPError, { status: 400 })
    }

    if (!body.subject || typeof body.subject !== 'string') {
      return NextResponse.json({
        error: 'missing_field',
        message: 'subject is required',
        field: 'subject'
      } as AMPError, { status: 400 })
    }

    if (!body.payload || typeof body.payload !== 'object') {
      return NextResponse.json({
        error: 'missing_field',
        message: 'payload is required',
        field: 'payload'
      } as AMPError, { status: 400 })
    }

    if (!body.payload.type || !body.payload.message) {
      return NextResponse.json({
        error: 'invalid_field',
        message: 'payload must have type and message fields',
        field: 'payload'
      } as AMPError, { status: 400 })
    }

    // Get sender agent info
    const senderAgent = getAgent(auth.agentId!)
    if (!senderAgent) {
      return NextResponse.json({
        error: 'internal_error',
        message: 'Sender agent not found in registry'
      } as AMPError, { status: 500 })
    }

    const senderName = senderAgent.name || senderAgent.alias || 'unknown'

    // Parse recipient address
    const recipientParsed = parseAMPAddress(body.to)

    // Generate message ID and envelope
    const messageId = generateMessageId()
    const now = new Date().toISOString()

    const envelope: AMPEnvelope = {
      id: messageId,
      from: auth.address!,
      to: body.to,
      subject: body.subject,
      priority: body.priority || 'normal',
      timestamp: now,
      signature: '', // Will be set if we sign
      in_reply_to: body.in_reply_to
    }

    // Try to sign the message with sender's private key
    const senderKeyPair = loadKeyPair(auth.agentId!)
    if (senderKeyPair && senderKeyPair.privatePem) {
      const signatureData = JSON.stringify({
        from: envelope.from,
        to: envelope.to,
        subject: envelope.subject,
        timestamp: envelope.timestamp,
        payload_hash: require('crypto')
          .createHash('sha256')
          .update(JSON.stringify(body.payload))
          .digest('hex')
      })
      const signature = signMessage(auth.agentId!, signatureData)
      if (signature) {
        envelope.signature = signature
      }
    }

    // Determine delivery method
    // Is recipient on this provider (local)?
    const isLocalProvider = !recipientParsed ||
      recipientParsed.provider === AMP_PROVIDER_NAME ||
      recipientParsed.provider.endsWith('.local')

    if (isLocalProvider) {
      // Local delivery - try to find the recipient agent
      const recipientName = recipientParsed?.name || body.to.split('@')[0]
      const selfHostId = getSelfHostId()

      // Try to resolve recipient
      const recipientResolved = resolveAgentIdentifier(recipientName)
      const recipientAgent = recipientResolved
        ? getAgent(recipientResolved.agentId)
        : getAgentByName(recipientName, selfHostId)

      if (!recipientAgent) {
        // Queue for relay - agent might register later
        queueMessage(
          recipientName, // Use name as ID for unregistered agents
          envelope,
          body.payload,
          senderKeyPair?.publicHex || ''
        )

        return NextResponse.json({
          id: messageId,
          status: 'queued',
          method: 'relay',
          queued_at: now
        } as AMPRouteResponse, { status: 200 })
      }

      // Check if agent is online (has active session)
      const isOnline = recipientAgent.sessions?.some(s => s.status === 'online')

      if (!isOnline) {
        // Queue for relay
        queueMessage(
          recipientAgent.id,
          envelope,
          body.payload,
          senderKeyPair?.publicHex || ''
        )

        return NextResponse.json({
          id: messageId,
          status: 'queued',
          method: 'relay',
          queued_at: now
        } as AMPRouteResponse, { status: 200 })
      }

      // Deliver locally via existing message system
      try {
        // Map AMP payload type to Message content type
        // 'system' type maps to 'notification' for local delivery
        const contentType = body.payload.type === 'system' ? 'notification' : body.payload.type

        const message = await sendMessage(
          senderAgent.id,
          recipientAgent.id,
          body.subject,
          {
            type: contentType as 'request' | 'response' | 'notification' | 'update',
            message: body.payload.message,
            context: {
              ...body.payload.context,
              amp: {
                envelope_id: envelope.id,
                signature: envelope.signature,
                sender_address: envelope.from,
                recipient_address: envelope.to
              }
            },
            attachments: body.payload.attachments?.map(a => ({
              name: a.name,
              path: a.path || a.url || '',
              type: a.type
            }))
          },
          {
            priority: body.priority,
            inReplyTo: body.in_reply_to,
            fromVerified: true // Sender is authenticated via API key
          }
        )

        // Notify recipient
        await notifyAgent({
          agentId: recipientAgent.id,
          agentName: recipientAgent.name || recipientAgent.alias || 'unknown',
          fromName: senderName,
          fromHost: senderAgent.hostId,
          subject: body.subject,
          messageId: message.id,
          priority: body.priority,
          messageType: body.payload.type
        })

        return NextResponse.json({
          id: message.id,
          status: 'delivered',
          method: 'local',
          delivered_at: now
        } as AMPRouteResponse, { status: 200 })

      } catch (error) {
        console.error('[AMP Route] Local delivery failed:', error)

        // Fall back to relay queue
        queueMessage(
          recipientAgent.id,
          envelope,
          body.payload,
          senderKeyPair?.publicHex || ''
        )

        return NextResponse.json({
          id: messageId,
          status: 'queued',
          method: 'relay',
          queued_at: now,
          error: 'Direct delivery failed, queued for relay'
        } as AMPRouteResponse, { status: 200 })
      }

    } else {
      // External provider - would need federation (not yet implemented)
      return NextResponse.json({
        error: 'forbidden',
        message: `Federation to external provider "${recipientParsed?.provider}" is not yet supported`
      } as AMPError, { status: 403 })
    }

  } catch (error) {
    console.error('[AMP Route] Error:', error)

    return NextResponse.json({
      error: 'internal_error',
      message: error instanceof Error ? error.message : 'Internal server error'
    } as AMPError, { status: 500 })
  }
}
