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
import { loadKeyPair, verifySignature } from '@/lib/amp-keys'
import { queueMessage } from '@/lib/amp-relay'
import { sendMessage } from '@/lib/messageQueue'
import { writeToAMPInbox } from '@/lib/amp-inbox-writer'
import { getAgent, checkMeshAgentExists } from '@/lib/agent-registry'
import { notifyAgent } from '@/lib/notification-service'
import { getSelfHostId, getHostById, isSelf, getOrganization } from '@/lib/hosts-config-server.mjs'
import { getAMPProviderDomain } from '@/lib/types/amp'
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

/**
 * Forward a message to a remote mesh host.
 * Consistently includes from, signature, and all fields so the remote
 * host can deliver with correct sender identity and notification.
 */
async function forwardToHost(
  remoteHost: { url: string; id: string },
  recipientName: string,
  envelope: AMPEnvelope,
  body: AMPRouteRequest,
  selfHostId: string
): Promise<{ ok: boolean; result?: Record<string, unknown>; error?: string }> {
  try {
    const response = await fetch(`${remoteHost.url}/api/v1/route`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-From': selfHostId,
        'X-AMP-Envelope-Id': envelope.id,
        ...(envelope.signature ? { 'X-AMP-Signature': envelope.signature } : {}),
      },
      body: JSON.stringify({
        from: envelope.from,
        to: recipientName,
        subject: body.subject,
        payload: body.payload,
        priority: body.priority,
        in_reply_to: body.in_reply_to,
        signature: envelope.signature,
        _forwarded: {
          original_from: envelope.from,
          original_to: envelope.to,
          forwarded_by: selfHostId,
          forwarded_at: envelope.timestamp
        }
      })
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'unknown')
      return { ok: false, error: `Remote host returned ${response.status}: ${errorText}` }
    }

    const result = await response.json()
    return { ok: true, result }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export async function POST(request: NextRequest): Promise<NextResponse<AMPRouteResponse | AMPError>> {
  try {
    // Authenticate request
    // Support two auth methods:
    // 1. Bearer token (API key) - for direct agent requests
    // 2. X-Forwarded-From header - for mesh-forwarded requests from known hosts
    const authHeader = request.headers.get('Authorization')
    const forwardedFrom = request.headers.get('X-Forwarded-From')
    let auth = authenticateRequest(authHeader)

    if (!auth.authenticated && forwardedFrom) {
      // Check if the forwarding host is a known mesh host
      const forwardingHost = getHostById(forwardedFrom)
      if (forwardingHost) {
        // Trust forwarded requests from known mesh hosts
        auth = {
          authenticated: true,
          agentId: `mesh-${forwardedFrom}`,
          tenantId: getOrganization() || 'default',
          address: `mesh@${forwardedFrom}`
        }
        console.log(`[AMP Route] Accepting mesh-forwarded request from ${forwardedFrom}`)
      }
    }

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
    // For mesh-forwarded requests, sender may not be in local registry
    const isMeshForwarded = !!forwardedFrom && auth.agentId?.startsWith('mesh-')
    const senderAgent = isMeshForwarded ? null : getAgent(auth.agentId!)
    if (!senderAgent && !isMeshForwarded) {
      return NextResponse.json({
        error: 'internal_error',
        message: 'Sender agent not found in registry'
      } as AMPError, { status: 500 })
    }

    // For mesh-forwarded messages, extract real sender name from body.from address
    // e.g. "test-alice@host.aimaestro.local" → "test-alice"
    const senderName = senderAgent?.name || senderAgent?.alias
      || (isMeshForwarded && body.from ? body.from.split('@')[0] : 'unknown')

    // Parse recipient address
    const recipientParsed = parseAMPAddress(body.to)

    // Generate message ID and envelope
    const messageId = generateMessageId()
    const now = new Date().toISOString()

    // For mesh-forwarded requests, use the original sender address if provided
    const senderAddress = (isMeshForwarded && body.from) ? body.from : auth.address!

    const envelope: AMPEnvelope = {
      id: messageId,
      from: senderAddress,
      to: body.to,
      subject: body.subject,
      priority: body.priority || 'normal',
      timestamp: now,
      signature: '', // Will be set if we sign
      in_reply_to: body.in_reply_to
    }

    // ==========================================================================
    // Signature Handling
    // ==========================================================================
    // Client-side signing is the correct pattern:
    // - External agents own their private keys (server doesn't have them)
    // - Client signs before sending via /v1/route
    // - Server verifies the signature (optional for local mesh)
    // - Signature is forwarded to recipient unchanged

    const senderKeyPair = loadKeyPair(auth.agentId!)

    // Accept client-provided signature
    if (body.signature) {
      // Client provided a signature - verify it if we have the sender's public key
      if (senderKeyPair && senderKeyPair.publicHex) {
        // Reconstruct the canonical string the client signed
        // Format: from|to|subject|priority|in_reply_to|payload_hash (AMP Protocol v1.1)
        // Note: We exclude ID and timestamp because they differ between client and server.
        // This ensures signature validity regardless of transport metadata.
        // Priority prevents escalation attacks, in_reply_to prevents thread hijacking.
        const crypto = require('crypto')
        const payloadHash = crypto
          .createHash('sha256')
          .update(JSON.stringify(body.payload))
          .digest('base64')

        const signatureData = [
          envelope.from,
          envelope.to,
          envelope.subject,
          body.priority || 'normal',
          body.in_reply_to || '',
          payloadHash
        ].join('|')

        const isValid = verifySignature(signatureData, body.signature, senderKeyPair.publicHex)

        if (!isValid) {
          console.warn(`[AMP Route] Invalid signature from ${envelope.from}`)
          // For now, accept but log - in strict mode this would be rejected
          // return NextResponse.json({
          //   error: 'invalid_signature',
          //   message: 'Message signature verification failed'
          // } as AMPError, { status: 400 })
        } else {
          console.log(`[AMP Route] Verified signature from ${envelope.from}`)
        }
      }

      // Use the client-provided signature
      envelope.signature = body.signature
    } else {
      // No client signature provided
      // For local agents we might still have their private key (legacy support)
      // but external agents MUST sign their own messages
      console.log(`[AMP Route] No signature provided by ${envelope.from}`)

      // Leave signature empty - recipient can choose whether to accept unsigned messages
      envelope.signature = ''
    }

    // Determine delivery method
    // Is recipient on this provider (aimaestro.local or any .local)?
    // Get organization from hosts config for dynamic provider domain
    const organization = getOrganization() || undefined
    const providerDomain = getAMPProviderDomain(organization)

    const isLocalProvider = !recipientParsed ||
      recipientParsed.provider === providerDomain ||
      recipientParsed.provider === 'aimaestro.local' ||  // Legacy support
      recipientParsed.provider.endsWith('.local')

    if (!isLocalProvider) {
      // External provider — client must send directly to that provider's route_url
      return NextResponse.json({
        error: 'external_provider',
        message: `Recipient is on external provider "${recipientParsed?.provider}". Send directly to that provider using its route_url from your registration.`
      } as AMPError, { status: 422 })
    }

    // ======================================================================
    // SINGLE RESOLUTION: determine where the agent lives
    // ======================================================================
    const recipientName = recipientParsed?.name || body.to.split('@')[0]
    const targetHostId = recipientParsed?.tenant  // tenant = hostId in mesh
    const selfHostId = getSelfHostId()

    const isExplicitRemote = targetHostId
      && !isSelf(targetHostId)
      && targetHostId !== organization

    // resolvedHostId: where the agent lives (self, remote peer, or undefined)
    let resolvedHostId: string | undefined
    let resolvedAgentId: string | undefined

    if (isMeshForwarded) {
      // LOOP GUARD: this request was already forwarded from another host.
      // Only attempt local delivery — never re-forward to avoid infinite loops.
      const meshResult = await checkMeshAgentExists(recipientName, 3000)
      if (meshResult.exists && meshResult.host && isSelf(meshResult.host)) {
        resolvedHostId = meshResult.host
        resolvedAgentId = meshResult.agent?.id
      }
      // If not found locally, resolvedHostId stays undefined → falls to queue/relay
    } else if (isExplicitRemote) {
      // Address explicitly names a remote host — trust it, skip discovery
      resolvedHostId = targetHostId
    } else {
      // Discover: checks local registry first, then queries all mesh peers
      const meshResult = await checkMeshAgentExists(recipientName, 3000)
      if (meshResult.exists && meshResult.host) {
        resolvedHostId = meshResult.host
        resolvedAgentId = meshResult.agent?.id
      }
    }

    // ======================================================================
    // REMOTE DELIVERY (single path for all cross-host forwarding)
    // ======================================================================
    if (resolvedHostId && !isSelf(resolvedHostId)) {
      const remoteHost = getHostById(resolvedHostId)
      const queueAddr = `${recipientName}@${resolvedHostId}`

      if (!remoteHost) {
        console.log(`[AMP Route] Host '${resolvedHostId}' not in config, queuing for relay`)
        queueMessage(queueAddr, envelope, body.payload, senderKeyPair?.publicHex || '')
        return NextResponse.json({
          id: messageId, status: 'queued', method: 'relay', queued_at: now,
          note: `Host '${resolvedHostId}' not found in mesh, queued for later delivery`
        } as AMPRouteResponse, { status: 200 })
      }

      console.log(`[AMP Route] Forwarding to ${recipientName}@${resolvedHostId} via ${remoteHost.url}`)
      const fwd = await forwardToHost(remoteHost, recipientName, envelope, body, selfHostId)

      if (fwd.ok) {
        return NextResponse.json({
          id: (fwd.result?.id as string) || messageId,
          status: 'delivered', method: 'mesh', delivered_at: now, remote_host: resolvedHostId
        } as AMPRouteResponse, { status: 200 })
      }

      console.error(`[AMP Route] Mesh delivery to ${resolvedHostId} failed: ${fwd.error}`)
      queueMessage(queueAddr, envelope, body.payload, senderKeyPair?.publicHex || '')
      return NextResponse.json({
        id: messageId, status: 'queued', method: 'relay', queued_at: now,
        error: `Mesh delivery to ${resolvedHostId} failed, queued for retry`
      } as AMPRouteResponse, { status: 200 })
    }

    // ======================================================================
    // LOCAL DELIVERY (agent is on this host, or not found anywhere)
    // ======================================================================
    const localAgent = resolvedAgentId ? getAgent(resolvedAgentId) : null

    if (!localAgent) {
      // Agent not found on any host — write to inbox dir (may exist) + queue relay
      await writeToAMPInbox(envelope, body.payload, recipientName, senderKeyPair?.publicHex)
      queueMessage(recipientName, envelope, body.payload, senderKeyPair?.publicHex || '')
      return NextResponse.json({
        id: messageId, status: 'queued', method: 'relay', queued_at: now
      } as AMPRouteResponse, { status: 200 })
    }

    // Agent found locally — deliver to per-agent AMP inbox
    const recipientAgentName = localAgent.name || localAgent.alias || recipientName

    try {
      await writeToAMPInbox(envelope, body.payload, recipientAgentName, senderKeyPair?.publicHex)

      const isOnline = localAgent.sessions?.some((s: { status: string }) => s.status === 'online')

      if (isOnline) {
        // Write to internal messageQueue if sender is a local agent (supports web UI)
        if (senderAgent) {
          try {
            const contentType = body.payload.type === 'system' ? 'notification' : body.payload.type
            await sendMessage(
              senderAgent.id,
              localAgent.id,
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
          } catch (sendError) {
            console.warn('[AMP Route] sendMessage failed (non-fatal, AMP inbox has message):', sendError)
          }
        }

        // Notify recipient via tmux
        await notifyAgent({
          agentId: localAgent.id,
          agentName: recipientAgentName,
          fromName: senderName,
          fromHost: senderAgent?.hostId || forwardedFrom || 'unknown',
          subject: body.subject,
          messageId: messageId,
          priority: body.priority,
          messageType: body.payload.type
        })
      }

      return NextResponse.json({
        id: messageId, status: 'delivered', method: 'local', delivered_at: now
      } as AMPRouteResponse, { status: 200 })

    } catch (error) {
      console.error('[AMP Route] Local delivery failed:', error)
      queueMessage(recipientAgentName, envelope, body.payload, senderKeyPair?.publicHex || '')
      return NextResponse.json({
        id: messageId, status: 'queued', method: 'relay', queued_at: now,
        error: 'Direct delivery failed, queued for relay'
      } as AMPRouteResponse, { status: 200 })
    }

  } catch (error) {
    console.error('[AMP Route] Error:', error)

    return NextResponse.json({
      error: 'internal_error',
      message: error instanceof Error ? error.message : 'Internal server error'
    } as AMPError, { status: 500 })
  }
}
