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
import { getAgent, getAgentByName, getAgentByNameAnyHost } from '@/lib/agent-registry'
import { notifyAgent } from '@/lib/notification-service'
import { getSelfHostId, getHostById, isSelf } from '@/lib/hosts-config-server.mjs'
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
    // Is recipient on this provider (aimaestro.local or any .local)?
    const isLocalProvider = !recipientParsed ||
      recipientParsed.provider === AMP_PROVIDER_NAME ||
      recipientParsed.provider.endsWith('.local')

    if (isLocalProvider) {
      // Internal mesh delivery
      // Address format: agentname@hostid.aimaestro.local
      // The "tenant" field is actually the hostId in mesh routing
      const recipientName = recipientParsed?.name || body.to.split('@')[0]
      const targetHostId = recipientParsed?.tenant  // tenant = hostId in mesh
      const selfHostId = getSelfHostId()

      // Determine if target is on a different host in the mesh
      const isTargetRemote = targetHostId && !isSelf(targetHostId)

      if (isTargetRemote) {
        // ========================================
        // CROSS-HOST DELIVERY (mesh routing)
        // ========================================
        const remoteHost = getHostById(targetHostId)

        if (!remoteHost) {
          // Unknown host - queue for relay (host might come online later)
          console.log(`[AMP Route] Unknown host '${targetHostId}', queuing for relay`)
          queueMessage(
            `${recipientName}@${targetHostId}`,
            envelope,
            body.payload,
            senderKeyPair?.publicHex || ''
          )

          return NextResponse.json({
            id: messageId,
            status: 'queued',
            method: 'relay',
            queued_at: now,
            note: `Host '${targetHostId}' not found in mesh, queued for later delivery`
          } as AMPRouteResponse, { status: 200 })
        }

        // Forward to remote host via HTTP
        console.log(`[AMP Route] Forwarding message to ${recipientName}@${targetHostId} via ${remoteHost.url}`)

        try {
          const remoteResponse = await fetch(`${remoteHost.url}/api/v1/route`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              // Forward the original auth or use a mesh-to-mesh token
              'X-Forwarded-From': selfHostId,
              'X-AMP-Envelope-Id': envelope.id,
              // Include sender's signature for verification
              ...(envelope.signature ? { 'X-AMP-Signature': envelope.signature } : {}),
              ...(senderKeyPair?.publicHex ? { 'X-AMP-Sender-Key': senderKeyPair.publicHex } : {})
            },
            body: JSON.stringify({
              // Rewrite address to local format for the remote host
              to: recipientName,  // Just the name, no @host
              subject: body.subject,
              payload: body.payload,
              priority: body.priority,
              in_reply_to: body.in_reply_to,
              // Include original envelope for audit trail
              _forwarded: {
                original_from: envelope.from,
                original_to: envelope.to,
                forwarded_by: selfHostId,
                forwarded_at: now
              }
            })
          })

          if (!remoteResponse.ok) {
            const errorText = await remoteResponse.text()
            throw new Error(`Remote host returned ${remoteResponse.status}: ${errorText}`)
          }

          const remoteResult = await remoteResponse.json()

          return NextResponse.json({
            id: remoteResult.id || messageId,
            status: 'delivered',
            method: 'mesh',
            delivered_at: now,
            remote_host: targetHostId
          } as AMPRouteResponse, { status: 200 })

        } catch (error) {
          console.error(`[AMP Route] Mesh delivery to ${targetHostId} failed:`, error)

          // Queue for relay - remote host might be temporarily unavailable
          queueMessage(
            `${recipientName}@${targetHostId}`,
            envelope,
            body.payload,
            senderKeyPair?.publicHex || ''
          )

          return NextResponse.json({
            id: messageId,
            status: 'queued',
            method: 'relay',
            queued_at: now,
            error: `Mesh delivery to ${targetHostId} failed, queued for retry`
          } as AMPRouteResponse, { status: 200 })
        }

      } else {
        // ========================================
        // LOCAL DELIVERY (same host)
        // ========================================

        // Try to resolve recipient on this host first, then any host
        let recipientAgent = getAgentByName(recipientName, selfHostId)

        // If not found locally and no specific host was targeted, search all hosts
        if (!recipientAgent && !targetHostId) {
          recipientAgent = getAgentByNameAnyHost(recipientName)

          // If found on a different host, forward there
          if (recipientAgent && recipientAgent.hostId && !isSelf(recipientAgent.hostId)) {
            const remoteHost = getHostById(recipientAgent.hostId)
            if (remoteHost) {
              console.log(`[AMP Route] Agent ${recipientName} found on ${recipientAgent.hostId}, forwarding`)

              try {
                const remoteResponse = await fetch(`${remoteHost.url}/api/v1/route`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'X-Forwarded-From': selfHostId,
                    'X-AMP-Envelope-Id': envelope.id
                  },
                  body: JSON.stringify({
                    to: recipientName,
                    subject: body.subject,
                    payload: body.payload,
                    priority: body.priority,
                    in_reply_to: body.in_reply_to
                  })
                })

                if (remoteResponse.ok) {
                  const remoteResult = await remoteResponse.json()
                  return NextResponse.json({
                    id: remoteResult.id || messageId,
                    status: 'delivered',
                    method: 'mesh',
                    delivered_at: now,
                    remote_host: recipientAgent.hostId
                  } as AMPRouteResponse, { status: 200 })
                }
              } catch (error) {
                console.error(`[AMP Route] Auto-forward failed:`, error)
              }
            }
          }
        }

        if (!recipientAgent) {
          // Queue for relay - agent might register later
          queueMessage(
            recipientName,
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
              fromVerified: true
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
      }

    } else {
      // ========================================
      // EXTERNAL PROVIDER (federation)
      // ========================================
      // e.g., alice@acme.crabmail.ai
      return NextResponse.json({
        error: 'forbidden',
        message: `Federation to external provider "${recipientParsed?.provider}" is not yet supported. Use agentname@hostid.aimaestro.local for mesh routing.`
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
