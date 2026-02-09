/**
 * AMP v1 Route Endpoint
 *
 * POST /api/v1/route
 *
 * Routes a message to the recipient agent within the local mesh network.
 * This is the primary message-sending endpoint for AMP providers.
 *
 * Authentication:
 *   - Bearer token (API key) for direct agent requests
 *   - X-Forwarded-From header for mesh-forwarded requests from known hosts
 *
 * Delivery methods:
 *   1. Local delivery — file system inbox + tmux notification (agent on this host)
 *   2. Mesh forwarding — HTTP POST to peer host's /api/v1/route (agent on another host)
 *   3. Relay queue — store-and-forward when recipient is offline or unreachable
 *
 * External providers (e.g. crabmail.ai) are rejected with 422 — clients must
 * send directly to the external provider using its route_url from registration.
 *
 * Resolution flow:
 *   1. Mesh-forwarded request? → local-only lookup (loop guard: never re-forward)
 *   2. Explicit remote host in address? → trust it, forward directly
 *   3. Otherwise? → checkMeshAgentExists (local first, then all peers)
 *   4. Resolved remote? → forwardToHost() → queue on failure
 *   5. Resolved local? → inbox write + tmux notification
 *   6. Not found anywhere? → inbox write + relay queue
 */

import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/amp-auth'
import { loadKeyPair, verifySignature } from '@/lib/amp-keys'
import { queueMessage } from '@/lib/amp-relay'
import { deliver } from '@/lib/message-delivery'
import { getAgent, getAgentByName, checkMeshAgentExists } from '@/lib/agent-registry'
import { resolveAgentIdentifier } from '@/lib/messageQueue'
import { getSelfHostId, getHostById, isSelf, getOrganization } from '@/lib/hosts-config-server.mjs'
import { getAMPProviderDomain } from '@/lib/types/amp'
import type {
  AMPRouteRequest,
  AMPRouteResponse,
  AMPEnvelope,
  AMPError,
  AMPPayload
} from '@/lib/types/amp'

// ============================================================================
// Constants
// ============================================================================

/** Timeout for mesh peer queries during agent discovery */
const MESH_DISCOVERY_TIMEOUT_MS = 3000

/** Timeout for HTTP forwarding to remote mesh hosts */
const FORWARD_TIMEOUT_MS = 10000

/** Maximum message payload size in bytes (1 MB) */
const MAX_PAYLOAD_SIZE = 1024 * 1024

/** Rate limit: max requests per agent per window */
const RATE_LIMIT_MAX = 60
const RATE_LIMIT_WINDOW_MS = 60_000

// ============================================================================
// Rate Limiter (in-memory, per-agent)
// ============================================================================

const rateLimitMap = new Map<string, { count: number; resetAt: number }>()

interface RateLimitResult {
  allowed: boolean
  limit: number
  remaining: number
  resetAt: number
}

function checkRateLimit(agentId: string): RateLimitResult {
  const now = Date.now()
  const entry = rateLimitMap.get(agentId)

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(agentId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
    return { allowed: true, limit: RATE_LIMIT_MAX, remaining: RATE_LIMIT_MAX - 1, resetAt: now + RATE_LIMIT_WINDOW_MS }
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return { allowed: false, limit: RATE_LIMIT_MAX, remaining: 0, resetAt: entry.resetAt }
  }

  entry.count++
  // Periodic cleanup: remove expired entries every 100 checks
  if (entry.count % 100 === 0) {
    for (const [key, val] of rateLimitMap) {
      if (now > val.resetAt) rateLimitMap.delete(key)
    }
  }
  return { allowed: true, limit: RATE_LIMIT_MAX, remaining: RATE_LIMIT_MAX - entry.count, resetAt: entry.resetAt }
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Parse an AMP address into components.
 *
 * Address format: name@[scope.]tenant.provider
 * Examples:
 *   alice@rnd23blocks.aimaestro.local  → { name: "alice", tenant: "rnd23blocks", provider: "aimaestro.local" }
 *   bob@myrepo.github.rnd23blocks.aimaestro.local → { name: "bob", tenant: "rnd23blocks", provider: "aimaestro.local", scope: "myrepo.github" }
 *   carol@acme.crabmail.ai → { name: "carol", tenant: "acme", provider: "crabmail.ai" }
 *
 * Returns null if the address cannot be parsed (e.g. bare name with no @).
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

  // Provider is always the last two domain parts (e.g. "aimaestro.local", "crabmail.ai")
  const provider = parts.slice(-2).join('.')
  const tenantParts = parts.slice(0, -2)

  if (tenantParts.length === 0) return null

  // Last tenant part is the tenant ID, preceding parts are scope
  const tenant = tenantParts[tenantParts.length - 1]
  const scope = tenantParts.length > 1 ? tenantParts.slice(0, -1).join('.') : undefined

  return { name, tenant, provider, scope }
}

/** Generate a unique message ID: msg_{timestamp}_{random} */
function generateMessageId(): string {
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2, 9)
  return `msg_${timestamp}_${random}`
}

/**
 * Forward a message to a remote mesh host via HTTP.
 *
 * Consistently includes `from`, `signature`, and `_forwarded` audit trail
 * so the receiving host can:
 *   - Identify the real sender (not the forwarding host)
 *   - Preserve the original signature chain
 *   - Display correct sender name in notifications
 *
 * Uses AbortController with a timeout to avoid hanging on unreachable hosts.
 */
async function forwardToHost(
  remoteHost: { url: string; id: string },
  recipientName: string,
  envelope: AMPEnvelope,
  body: AMPRouteRequest,
  selfHostId: string
): Promise<{ ok: boolean; result?: Record<string, unknown>; error?: string }> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), FORWARD_TIMEOUT_MS)

  try {
    const response = await fetch(`${remoteHost.url}/api/v1/route`, {
      method: 'POST',
      signal: controller.signal,
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
    if (error instanceof DOMException && error.name === 'AbortError') {
      return { ok: false, error: `Forward to ${remoteHost.id} timed out after ${FORWARD_TIMEOUT_MS}ms` }
    }
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  } finally {
    clearTimeout(timeoutId)
  }
}

/** Options for deliverLocally() */
interface LocalDeliveryOptions {
  envelope: AMPEnvelope
  payload: AMPPayload
  localAgent: { id: string; name?: string; alias?: string; hostId?: string; sessions?: Array<{ status: string }> }
  recipientAgentName: string
  senderAgent: { id: string; hostId?: string } | null
  senderName: string
  forwardedFrom: string | null
  senderPublicKeyHex: string | undefined
  body: AMPRouteRequest
}

/**
 * Deliver a message to a local agent.
 *
 * Uses the unified deliver() function which:
 *   1. Writes to the per-agent AMP inbox (primary delivery)
 *   2. Sends a tmux notification
 */
async function deliverLocally(opts: LocalDeliveryOptions): Promise<void> {
  const { envelope, payload, localAgent, recipientAgentName, senderAgent, senderName, forwardedFrom, senderPublicKeyHex, body } = opts

  await deliver({
    envelope,
    payload,
    recipientAgentName,
    senderPublicKeyHex,
    senderName,
    senderHost: senderAgent?.hostId || forwardedFrom || 'unknown',
    recipientAgentId: localAgent.id,
    subject: body.subject,
    priority: body.priority,
    messageType: payload.type,
  })
}

// ============================================================================
// Route Handler
// ============================================================================

export async function POST(request: NextRequest): Promise<NextResponse<AMPRouteResponse | AMPError>> {
  try {
    // ── Authentication ─────────────────────────────────────────────────
    const authHeader = request.headers.get('Authorization')
    const forwardedFrom = request.headers.get('X-Forwarded-From')
    let auth = authenticateRequest(authHeader)

    if (!auth.authenticated && forwardedFrom) {
      const forwardingHost = getHostById(forwardedFrom)
      if (forwardingHost) {
        auth = {
          authenticated: true,
          agentId: `mesh-${forwardedFrom}`,
          tenantId: getOrganization() || 'default',
          address: `mesh@${forwardedFrom}`
        }
        console.log(`[AMP Route] Accepting mesh-forwarded request from ${forwardedFrom} (signature NOT verified — trusted host)`)
      }
    }

    if (!auth.authenticated) {
      return NextResponse.json({
        error: auth.error || 'unauthorized',
        message: auth.message || 'Authentication required'
      } as AMPError, { status: 401 })
    }

    // ── Rate Limiting (S2) ────────────────────────────────────────────
    const rateLimitKey = auth.agentId || forwardedFrom || 'unknown'
    const rateLimit = checkRateLimit(rateLimitKey)
    const rateLimitHeaders = {
      'X-RateLimit-Limit': String(rateLimit.limit),
      'X-RateLimit-Remaining': String(rateLimit.remaining),
      'X-RateLimit-Reset': String(Math.ceil(rateLimit.resetAt / 1000)),
    }

    if (!rateLimit.allowed) {
      return NextResponse.json({
        error: 'rate_limited',
        message: `Rate limit exceeded: ${RATE_LIMIT_MAX} requests per minute`
      } as AMPError, { status: 429, headers: rateLimitHeaders })
    }

    // ── Payload Size Limit (S10) ──────────────────────────────────────
    const contentLength = request.headers.get('Content-Length')
    if (contentLength && parseInt(contentLength, 10) > MAX_PAYLOAD_SIZE) {
      return NextResponse.json({
        error: 'payload_too_large',
        message: `Payload exceeds maximum size of ${MAX_PAYLOAD_SIZE} bytes`
      } as AMPError, { status: 413 })
    }

    // ── Body Validation ────────────────────────────────────────────────
    const body = await request.json() as AMPRouteRequest

    if (!body.to || typeof body.to !== 'string') {
      return NextResponse.json({
        error: 'missing_field', message: 'to address is required', field: 'to'
      } as AMPError, { status: 400 })
    }
    if (!body.subject || typeof body.subject !== 'string') {
      return NextResponse.json({
        error: 'missing_field', message: 'subject is required', field: 'subject'
      } as AMPError, { status: 400 })
    }
    if (!body.payload || typeof body.payload !== 'object') {
      return NextResponse.json({
        error: 'missing_field', message: 'payload is required', field: 'payload'
      } as AMPError, { status: 400 })
    }
    if (!body.payload.type || !body.payload.message) {
      return NextResponse.json({
        error: 'invalid_field', message: 'payload must have type and message fields', field: 'payload'
      } as AMPError, { status: 400 })
    }

    // ── Sender Resolution ──────────────────────────────────────────────
    const isMeshForwarded = !!forwardedFrom && auth.agentId?.startsWith('mesh-')
    const senderAgent = isMeshForwarded ? null : getAgent(auth.agentId!)

    if (!senderAgent && !isMeshForwarded) {
      return NextResponse.json({
        error: 'internal_error', message: 'Sender agent not found in registry'
      } as AMPError, { status: 500 })
    }

    // For mesh-forwarded messages, extract real sender name from body.from
    // e.g. "test-alice@host.aimaestro.local" → "test-alice"
    const senderName = senderAgent?.name || senderAgent?.alias
      || (isMeshForwarded && body.from ? body.from.split('@')[0] : 'unknown')

    // ── Sender Address Validation for Mesh (D16) ──────────────────────
    if (isMeshForwarded && body.from) {
      const senderParsed = parseAMPAddress(body.from)
      if (senderParsed) {
        const forwardingHost = getHostById(forwardedFrom!)
        const expectedHostName = forwardingHost?.name || forwardedFrom
        // Warn if the sender's domain tenant doesn't match the forwarding host
        if (senderParsed.tenant !== forwardedFrom && senderParsed.tenant !== expectedHostName) {
          console.warn(`[AMP Route] Sender address tenant "${senderParsed.tenant}" does not match forwarding host "${forwardedFrom}" — possible address spoofing`)
        }
      }
    }

    // ── Envelope Construction ──────────────────────────────────────────
    const recipientParsed = parseAMPAddress(body.to)
    const messageId = generateMessageId()
    const now = new Date().toISOString()

    // Derive sender address from the agent registry (authoritative),
    // NOT from auth.address (which comes from the API key record and can be stale/wrong).
    let senderAddress: string
    if (isMeshForwarded && body.from) {
      senderAddress = body.from
    } else if (senderAgent) {
      const agentAmpAddress = senderAgent.metadata?.amp?.address as string | undefined
      const agentName = senderAgent.name || senderAgent.alias || auth.address!.split('@')[0]
      senderAddress = agentAmpAddress || `${agentName}@${getAMPProviderDomain(getOrganization() || undefined)}`
    } else {
      senderAddress = auth.address!
    }

    const envelope: AMPEnvelope = {
      version: 'amp/0.1',
      id: messageId,
      from: senderAddress,
      to: body.to,
      subject: body.subject,
      priority: body.priority || 'normal',
      timestamp: now,
      expires_at: body.expires_at,
      signature: '',
      in_reply_to: body.in_reply_to,
      thread_id: body.in_reply_to || messageId,
    }

    // ── Signature Handling ─────────────────────────────────────────────
    // Client-side signing is the correct AMP pattern:
    //   - Agents own their private keys (server doesn't have them)
    //   - Client signs before sending via /v1/route
    //   - Server verifies if it has the sender's public key (optional for mesh)
    //   - Signature is forwarded to recipient unchanged

    // Skip key lookup for mesh-forwarded requests — the synthetic "mesh-<host>"
    // agentId has no keypair on disk, so loading would be wasted file I/O.
    const senderKeyPair = isMeshForwarded ? null : loadKeyPair(auth.agentId!)

    if (body.signature) {
      // Verify client-provided signature if we have the public key
      if (senderKeyPair?.publicHex) {
        // Canonical format: from|to|subject|priority|in_reply_to|payload_hash
        // Excludes server-generated id/timestamp for transport independence
        const payloadHash = crypto
          .createHash('sha256')
          .update(JSON.stringify(body.payload))
          .digest('base64')

        const signatureData = [
          envelope.from, envelope.to, envelope.subject,
          body.priority || 'normal', body.in_reply_to || '', payloadHash
        ].join('|')

        const isValid = verifySignature(signatureData, body.signature, senderKeyPair.publicHex)
        if (!isValid) {
          console.warn(`[AMP Route] Invalid signature from ${envelope.from}`)
          // Accept but log — strict mode would reject here
        } else {
          console.log(`[AMP Route] Verified signature from ${envelope.from}`)
        }
      }
      envelope.signature = body.signature
    } else {
      console.log(`[AMP Route] No signature provided by ${envelope.from}`)
    }

    // ── Provider Scope Check ───────────────────────────────────────────
    const organization = getOrganization() || undefined
    const providerDomain = getAMPProviderDomain(organization)

    const isLocalProvider = !recipientParsed ||
      recipientParsed.provider === providerDomain ||
      recipientParsed.provider === 'aimaestro.local' ||
      recipientParsed.provider.endsWith('.local')

    if (!isLocalProvider) {
      return NextResponse.json({
        error: 'external_provider',
        message: `Recipient is on external provider "${recipientParsed?.provider}". Send directly to that provider using its route_url from your registration.`
      } as AMPError, { status: 422 })
    }

    // ── Recipient Resolution ───────────────────────────────────────────
    const recipientName = recipientParsed?.name || body.to.split('@')[0]
    const selfHostId = getSelfHostId()

    // The "tenant" in an AMP address serves double duty:
    //   - For mesh addresses: it's the host ID (e.g. "juans-macbook-pro" in alice@juans-macbook-pro.aimaestro.local)
    //   - For org addresses: it's the organization name (e.g. "rnd23blocks" in alice@rnd23blocks.aimaestro.local)
    // It's "explicitly remote" only when it's neither this host nor the org name.
    const targetTenant = recipientParsed?.tenant

    const isExplicitRemote = targetTenant
      && !isSelf(targetTenant)
      && targetTenant !== organization

    let resolvedHostId: string | undefined
    let resolvedAgentId: string | undefined

    if (isMeshForwarded) {
      // LOOP GUARD: already forwarded from another host.
      // Only check locally — never re-forward to avoid infinite loops.
      const localAgent = getAgentByName(recipientName, selfHostId)
      if (localAgent) {
        resolvedHostId = selfHostId
        resolvedAgentId = localAgent.id
      } else {
        // Fallback: rich resolution (partial match, alias, etc.)
        const resolved = resolveAgentIdentifier(recipientName)
        if (resolved?.agentId) {
          resolvedAgentId = resolved.agentId
          resolvedHostId = selfHostId
        }
      }
    } else if (isExplicitRemote) {
      // Address explicitly names a remote host — trust it, skip discovery
      resolvedHostId = targetTenant
    } else {
      // Discover: checks local registry first, then queries all mesh peers
      const meshResult = await checkMeshAgentExists(recipientName, MESH_DISCOVERY_TIMEOUT_MS)
      if (meshResult.exists && meshResult.host) {
        resolvedHostId = meshResult.host
        resolvedAgentId = meshResult.agent?.id
      }

      // Fallback: use rich resolution (partial match, alias, session name)
      // This handles short names like "rag" → "23blocks-api-rag"
      // resolveAgentIdentifier only searches the LOCAL registry, so the
      // resolved agent is always on this host — force selfHostId to avoid
      // hostname-format mismatches that would route it as remote.
      if (!resolvedAgentId) {
        const resolved = resolveAgentIdentifier(recipientName)
        if (resolved?.agentId) {
          resolvedAgentId = resolved.agentId
          resolvedHostId = selfHostId
        }
      }
    }

    // ── Remote Delivery ────────────────────────────────────────────────
    if (resolvedHostId && !isSelf(resolvedHostId)) {
      const remoteHost = getHostById(resolvedHostId)

      if (!remoteHost) {
        if (!resolvedAgentId) {
          console.error(`[AMP Route] Host '${resolvedHostId}' not in config and no UUID for ${recipientName} — cannot queue`)
          return NextResponse.json({
            error: 'not_found',
            message: `Recipient '${recipientName}' not found and target host '${resolvedHostId}' is not configured`
          } as AMPError, { status: 404 })
        }
        console.log(`[AMP Route] Host '${resolvedHostId}' not in config, queuing for relay`)
        queueMessage(resolvedAgentId, envelope, body.payload, senderKeyPair?.publicHex || '')
        return NextResponse.json({
          id: messageId, status: 'queued', method: 'relay', queued_at: now
        } as AMPRouteResponse, { status: 200, headers: rateLimitHeaders })
      }

      console.log(`[AMP Route] Forwarding to ${recipientName}@${resolvedHostId} via ${remoteHost.url}`)
      const fwd = await forwardToHost(remoteHost, recipientName, envelope, body, selfHostId)

      if (fwd.ok) {
        return NextResponse.json({
          id: (fwd.result?.id as string) || messageId,
          status: 'delivered', method: 'mesh', delivered_at: now, remote_host: resolvedHostId
        } as AMPRouteResponse, { status: 200, headers: rateLimitHeaders })
      }

      console.error(`[AMP Route] Mesh delivery to ${resolvedHostId} failed: ${fwd.error}`)
      if (!resolvedAgentId) {
        return NextResponse.json({
          error: 'internal_error',
          message: `Mesh delivery to ${resolvedHostId} failed and no UUID to queue: ${fwd.error}`
        } as AMPError, { status: 502 })
      }
      queueMessage(resolvedAgentId, envelope, body.payload, senderKeyPair?.publicHex || '')
      return NextResponse.json({
        id: messageId, status: 'queued', method: 'relay', queued_at: now,
        error: `Mesh delivery to ${resolvedHostId} failed, queued for retry`
      } as AMPRouteResponse, { status: 200, headers: rateLimitHeaders })
    }

    // ── Local Delivery ─────────────────────────────────────────────────
    const localAgent = resolvedAgentId ? getAgent(resolvedAgentId) : null

    if (!localAgent) {
      if (!resolvedAgentId) {
        // Agent not found anywhere and no UUID — return not_found instead of creating name-based relay dir
        return NextResponse.json({
          error: 'not_found',
          message: `Recipient '${recipientName}' not found on any host`
        } as AMPError, { status: 404 })
      }
      // Agent UUID known but not currently registered locally — queue for relay
      queueMessage(resolvedAgentId, envelope, body.payload, senderKeyPair?.publicHex || '')
      return NextResponse.json({
        id: messageId, status: 'queued', method: 'relay', queued_at: now
      } as AMPRouteResponse, { status: 200 })
    }

    const recipientAgentName = localAgent.name || localAgent.alias || recipientName

    try {
      await deliverLocally({
        envelope, payload: body.payload, localAgent, recipientAgentName,
        senderAgent, senderName, forwardedFrom, senderPublicKeyHex: senderKeyPair?.publicHex, body
      })

      return NextResponse.json({
        id: messageId, status: 'delivered', method: 'local', delivered_at: now
      } as AMPRouteResponse, { status: 200, headers: rateLimitHeaders })

    } catch (error) {
      console.error('[AMP Route] Local delivery failed:', error)
      queueMessage(localAgent.id, envelope, body.payload, senderKeyPair?.publicHex || '')
      return NextResponse.json({
        id: messageId, status: 'queued', method: 'relay', queued_at: now,
        error: 'Direct delivery failed, queued for relay'
      } as AMPRouteResponse, { status: 200, headers: rateLimitHeaders })
    }

  } catch (error) {
    console.error('[AMP Route] Error:', error)
    return NextResponse.json({
      error: 'internal_error',
      message: error instanceof Error ? error.message : 'Internal server error'
    } as AMPError, { status: 500 })
  }
}
