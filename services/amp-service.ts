/**
 * AMP Service
 *
 * Pure business logic extracted from app/api/v1/** routes.
 * No HTTP concepts (Request, Response, NextResponse, headers) leak into this module.
 * API routes become thin wrappers that call these functions.
 *
 * Covers:
 *   GET    /api/v1/health                    -> getHealthStatus
 *   GET    /api/v1/info                      -> getProviderInfo
 *   POST   /api/v1/register                  -> registerAgent
 *   POST   /api/v1/route                     -> routeMessage
 *   GET    /api/v1/messages/pending           -> listPendingMessages
 *   DELETE /api/v1/messages/pending           -> acknowledgePendingMessage
 *   POST   /api/v1/messages/pending           -> batchAcknowledgeMessages
 *   POST   /api/v1/messages/:id/read          -> sendReadReceipt
 *   GET    /api/v1/agents                     -> listAMPAgents
 *   GET    /api/v1/agents/me                  -> getAgentSelf
 *   PATCH  /api/v1/agents/me                  -> updateAgentSelf
 *   DELETE /api/v1/agents/me                  -> deleteAgentSelf
 *   GET    /api/v1/agents/resolve/:address    -> resolveAgentAddress
 *   DELETE /api/v1/auth/revoke-key            -> revokeKey
 *   POST   /api/v1/auth/rotate-key            -> rotateKey
 *   POST   /api/v1/auth/rotate-keys           -> rotateKeypair
 *   POST   /api/v1/federation/deliver         -> deliverFederated
 */

import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import os from 'os'

import { loadAgents, createAgent, getAgent, getAgentByName, getAgentByNameAnyHost, updateAgent, deleteAgent, markAgentAsAMPRegistered, checkMeshAgentExists, getAMPRegisteredAgents } from '@/lib/agent-registry'
import { authenticateRequest, createApiKey, hashApiKey, extractApiKeyFromHeader, revokeApiKey, rotateApiKey, revokeAllKeysForAgent } from '@/lib/amp-auth'
import { saveKeyPair, loadKeyPair, calculateFingerprint, verifySignature, generateKeyPair } from '@/lib/amp-keys'
import { queueMessage, getPendingMessages, acknowledgeMessage, acknowledgeMessages, cleanupAllExpiredMessages } from '@/lib/amp-relay'
import { deliver } from '@/lib/message-delivery'
import { deliverViaWebSocket } from '@/lib/amp-websocket'
import { resolveAgentIdentifier } from '@/lib/messageQueue'
import { getSelfHostId, getSelfHost, getHostById, isSelf, getOrganization } from '@/lib/hosts-config-server.mjs'
import { AMP_PROTOCOL_VERSION, getAMPProviderDomain } from '@/lib/types/amp'
import type {
  AMPHealthResponse,
  AMPInfoResponse,
  AMPRegistrationRequest,
  AMPRegistrationResponse,
  AMPRouteRequest,
  AMPRouteResponse,
  AMPPendingMessagesResponse,
  AMPAgentResolveResponse,
  AMPKeyRotationResponse,
  AMPEnvelope,
  AMPPayload,
  AMPError,
  AMPNameTakenError,
} from '@/lib/types/amp'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ServiceResult<T> {
  data?: T
  error?: string
  status: number  // HTTP-like status code for the route to use
  headers?: Record<string, string>
}

// ---------------------------------------------------------------------------
// Module-level state (shared across requests, lives in the service)
// ---------------------------------------------------------------------------

/** Track server start time for uptime calculation */
const SERVER_START_TIME = Date.now()

// ── Route rate limiter (in-memory, per-agent) ──────────────────────────────

const MESH_DISCOVERY_TIMEOUT_MS = 3000
const FORWARD_TIMEOUT_MS = 10000
const MAX_PAYLOAD_SIZE = 1024 * 1024  // 1 MB
const ROUTE_RATE_LIMIT_MAX = 60
const ROUTE_RATE_LIMIT_WINDOW_MS = 60_000

const routeRateLimitMap = new Map<string, { count: number; resetAt: number }>()

interface RateLimitResult {
  allowed: boolean
  limit: number
  remaining: number
  resetAt: number
}

function checkRouteRateLimit(agentId: string): RateLimitResult {
  const now = Date.now()
  const entry = routeRateLimitMap.get(agentId)

  if (!entry || now > entry.resetAt) {
    routeRateLimitMap.set(agentId, { count: 1, resetAt: now + ROUTE_RATE_LIMIT_WINDOW_MS })
    return { allowed: true, limit: ROUTE_RATE_LIMIT_MAX, remaining: ROUTE_RATE_LIMIT_MAX - 1, resetAt: now + ROUTE_RATE_LIMIT_WINDOW_MS }
  }

  if (entry.count >= ROUTE_RATE_LIMIT_MAX) {
    return { allowed: false, limit: ROUTE_RATE_LIMIT_MAX, remaining: 0, resetAt: entry.resetAt }
  }

  entry.count++
  // Periodic cleanup: remove expired entries every 100 checks
  if (entry.count % 100 === 0) {
    for (const [key, val] of routeRateLimitMap) {
      if (now > val.resetAt) routeRateLimitMap.delete(key)
    }
  }
  return { allowed: true, limit: ROUTE_RATE_LIMIT_MAX, remaining: ROUTE_RATE_LIMIT_MAX - entry.count, resetAt: entry.resetAt }
}

// ── Federation rate limiter (in-memory, per-provider) ──────────────────────

const FEDERATION_RATE_LIMIT_MAX = 120
const FEDERATION_RATE_LIMIT_WINDOW_MS = 60_000

const federationRateLimitMap = new Map<string, { count: number; resetAt: number }>()

function checkFederationRateLimit(providerKey: string): { allowed: boolean; remaining: number } {
  const now = Date.now()
  const entry = federationRateLimitMap.get(providerKey)

  if (!entry || now > entry.resetAt) {
    federationRateLimitMap.set(providerKey, { count: 1, resetAt: now + FEDERATION_RATE_LIMIT_WINDOW_MS })
    return { allowed: true, remaining: FEDERATION_RATE_LIMIT_MAX - 1 }
  }

  if (entry.count >= FEDERATION_RATE_LIMIT_MAX) {
    return { allowed: false, remaining: 0 }
  }

  entry.count++
  if (entry.count % 100 === 0) {
    for (const [key, val] of federationRateLimitMap) {
      if (now > val.resetAt) federationRateLimitMap.delete(key)
    }
  }
  return { allowed: true, remaining: FEDERATION_RATE_LIMIT_MAX - entry.count }
}

// ── Pending messages lazy cleanup ──────────────────────────────────────────

let _lastCleanupAt = 0
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000

function lazyCleanup() {
  const now = Date.now()
  if (now - _lastCleanupAt > CLEANUP_INTERVAL_MS) {
    _lastCleanupAt = now
    try { cleanupAllExpiredMessages() } catch { /* non-fatal */ }
  }
}

// ── Federation replay protection (file-based) ─────────────────────────────

const FEDERATION_DIR = path.join(os.homedir(), '.aimaestro', 'federation', 'delivered')
let lastFederationCleanup = 0
const FEDERATION_CLEANUP_INTERVAL = 3600_000  // 1 hour
const FEDERATION_MAX_AGE = 86400_000  // 24 hours

function ensureFederationDir() {
  if (!fs.existsSync(FEDERATION_DIR)) {
    fs.mkdirSync(FEDERATION_DIR, { recursive: true })
  }
}

function cleanupOldFederationEntries() {
  const now = Date.now()
  if (now - lastFederationCleanup < FEDERATION_CLEANUP_INTERVAL) return
  lastFederationCleanup = now

  try {
    const files = fs.readdirSync(FEDERATION_DIR)
    for (const file of files) {
      const filePath = path.join(FEDERATION_DIR, file)
      try {
        const stat = fs.statSync(filePath)
        if (now - stat.mtimeMs > FEDERATION_MAX_AGE) {
          fs.unlinkSync(filePath)
        }
      } catch {
        // Ignore individual file errors
      }
    }
  } catch {
    // Directory may not exist yet
  }
}

function trackMessageId(id: string): boolean {
  ensureFederationDir()
  cleanupOldFederationEntries()

  const safeFilename = Buffer.from(id).toString('base64url')
  const filePath = path.join(FEDERATION_DIR, safeFilename)

  if (fs.existsSync(filePath)) {
    return false // Replay detected
  }

  try {
    fs.writeFileSync(filePath, id, 'utf-8')
  } catch {
    // If write fails, allow message through (fail open for delivery)
  }

  return true
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Extract raw public key bytes from PEM format.
 * Returns hex string of the 32-byte Ed25519 public key.
 */
function extractPublicKeyHex(pemKey: string): string | null {
  try {
    const { createPublicKey } = require('crypto')
    const pubKeyObj = createPublicKey(pemKey)

    if (pubKeyObj.asymmetricKeyType !== 'ed25519') {
      return null
    }

    const rawPubKey = pubKeyObj.export({ type: 'spki', format: 'der' })
    const publicKeyBytes = rawPubKey.subarray(12)
    return publicKeyBytes.toString('hex')
  } catch {
    return null
  }
}

/**
 * Validate agent name format.
 * Must be 1-63 chars, alphanumeric + hyphens, cannot start/end with hyphen.
 */
function isValidAgentName(name: string): boolean {
  const nameRegex = /^[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$|^[a-z0-9]$/
  return nameRegex.test(name.toLowerCase())
}

/**
 * Generate alternative name suggestions when a name is taken.
 */
function generateNameSuggestions(baseName: string): string[] {
  const adjectives = ['cosmic', 'stellar', 'quantum', 'cyber', 'nexus', 'prime', 'alpha', 'beta']
  const nouns = ['wolf', 'hawk', 'phoenix', 'dragon', 'titan', 'spark', 'nova', 'pulse']

  const suggestions: string[] = []

  suggestions.push(`${baseName}-2`)
  suggestions.push(`${baseName}-3`)

  const randAdj = adjectives[Math.floor(Math.random() * adjectives.length)]
  const randNoun = nouns[Math.floor(Math.random() * nouns.length)]
  suggestions.push(`${baseName}-${randAdj}-${randNoun}`)

  return suggestions.slice(0, 3)
}

/**
 * Decode a User Key (uk_...) to extract owner and tenant info.
 * Format: uk_{base64({owner_id}:{tenant_id}:{random})}
 */
function decodeUserKey(token: string): { ownerId: string; tenantId: string } | null {
  if (!token.startsWith('uk_')) return null

  try {
    const decoded = Buffer.from(token.substring(3), 'base64').toString('utf-8')
    const parts = decoded.split(':')
    if (parts.length >= 2) {
      return { ownerId: parts[0], tenantId: parts[1] }
    }
  } catch {
    // Invalid format
  }
  return null
}

/**
 * Parse an AMP address into components.
 *
 * Address format: name@[scope.]tenant.provider
 * Examples:
 *   alice@rnd23blocks.aimaestro.local  -> { name: "alice", tenant: "rnd23blocks", provider: "aimaestro.local" }
 *   bob@myrepo.github.rnd23blocks.aimaestro.local -> { name: "bob", tenant: "rnd23blocks", provider: "aimaestro.local", scope: "myrepo.github" }
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

  const provider = parts.slice(-2).join('.')
  const tenantParts = parts.slice(0, -2)

  if (tenantParts.length === 0) return null

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
 * Deliver a message to a local agent via unified deliver() function.
 */
async function deliverLocally(opts: LocalDeliveryOptions): Promise<void> {
  const { envelope, payload, recipientAgentName, senderAgent, senderName, forwardedFrom, senderPublicKeyHex, body } = opts

  await deliver({
    envelope,
    payload,
    recipientAgentName,
    senderPublicKeyHex,
    senderName,
    senderHost: senderAgent?.hostId || forwardedFrom || 'unknown',
    recipientAgentId: opts.localAgent.id,
    subject: body.subject,
    priority: body.priority,
    messageType: payload.type,
  })
}

// ===========================================================================
// PUBLIC API -- called by API routes
// ===========================================================================

// ---------------------------------------------------------------------------
// GET /api/v1/health
// ---------------------------------------------------------------------------

export function getHealthStatus(): ServiceResult<AMPHealthResponse> {
  const organization = getOrganization() || undefined
  const providerDomain = getAMPProviderDomain(organization)

  try {
    const agents = loadAgents()
    const onlineAgents = agents.filter((a: any) =>
      a.sessions?.some((s: any) => s.status === 'online')
    ).length

    const uptimeSeconds = Math.floor((Date.now() - SERVER_START_TIME) / 1000)

    return {
      data: {
        status: 'healthy',
        version: AMP_PROTOCOL_VERSION,
        provider: providerDomain,
        federation: false,
        agents_online: onlineAgents,
        uptime_seconds: uptimeSeconds
      },
      status: 200,
      headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' }
    }
  } catch (error) {
    console.error('[AMP Health] Error:', error)

    return {
      data: {
        status: 'unhealthy',
        version: AMP_PROTOCOL_VERSION,
        provider: providerDomain,
        federation: false,
        agents_online: 0,
        uptime_seconds: Math.floor((Date.now() - SERVER_START_TIME) / 1000)
      },
      status: 503
    }
  }
}

// ---------------------------------------------------------------------------
// GET /api/v1/info
// ---------------------------------------------------------------------------

export function getProviderInfo(): ServiceResult<AMPInfoResponse> {
  const organization = getOrganization() || undefined
  const providerDomain = getAMPProviderDomain(organization)

  return {
    data: {
      provider: providerDomain,
      version: `amp/${AMP_PROTOCOL_VERSION}`,
      public_key: undefined,
      fingerprint: undefined,
      capabilities: [
        'registration',
        'local-delivery',
        'relay-queue',
        'mesh-routing',
      ],
      registration_modes: ['open'],
      rate_limits: {
        messages_per_minute: 60,
        api_requests_per_minute: 100
      }
    },
    status: 200,
    headers: { 'Cache-Control': 'public, max-age=300' }
  }
}

// ---------------------------------------------------------------------------
// POST /api/v1/register
// ---------------------------------------------------------------------------

export async function registerAgent(
  body: AMPRegistrationRequest,
  authHeader: string | null
): Promise<ServiceResult<AMPRegistrationResponse | AMPError | AMPNameTakenError>> {
  try {
    // Check for User Key authentication (D5)
    let userKeyInfo: { ownerId: string; tenantId: string } | null = null
    if (authHeader?.startsWith('Bearer uk_')) {
      userKeyInfo = decodeUserKey(authHeader.substring(7))
      if (!userKeyInfo) {
        return {
          data: { error: 'unauthorized', message: 'Invalid User Key format' } as AMPError,
          status: 401
        }
      }
      if (!body.tenant) {
        body.tenant = userKeyInfo.tenantId
      }
    }

    // Validate required fields
    if (!body.tenant || typeof body.tenant !== 'string') {
      return {
        data: { error: 'missing_field', message: 'tenant is required (or provide a User Key via Authorization header)', field: 'tenant' } as AMPError,
        status: 400
      }
    }

    if (!body.name || typeof body.name !== 'string') {
      return {
        data: { error: 'missing_field', message: 'name is required', field: 'name' } as AMPError,
        status: 400
      }
    }

    if (!body.public_key || typeof body.public_key !== 'string') {
      return {
        data: { error: 'missing_field', message: 'public_key is required', field: 'public_key' } as AMPError,
        status: 400
      }
    }

    if (!body.key_algorithm || body.key_algorithm !== 'Ed25519') {
      return {
        data: { error: 'invalid_field', message: 'key_algorithm must be "Ed25519"', field: 'key_algorithm' } as AMPError,
        status: 400
      }
    }

    // Normalize name to lowercase
    const normalizedName = body.name.toLowerCase()

    // Validate name format
    if (!isValidAgentName(normalizedName)) {
      return {
        data: { error: 'invalid_field', message: 'name must be 1-63 characters, alphanumeric and hyphens only, cannot start or end with hyphen', field: 'name' } as AMPError,
        status: 400
      }
    }

    // Validate public key format
    const publicKeyHex = extractPublicKeyHex(body.public_key)
    if (!publicKeyHex) {
      return {
        data: { error: 'invalid_field', message: 'Invalid public key format. Must be PEM-encoded Ed25519 public key.', field: 'public_key' } as AMPError,
        status: 400
      }
    }

    // Calculate fingerprint
    const fingerprint = calculateFingerprint(publicKeyHex)

    // Get host info
    const selfHost = getSelfHost()
    const selfHostIdValue = selfHost?.id || getSelfHostId()

    // Get organization from hosts config
    const configOrg = getOrganization()

    // PHASE 2: Require organization to be set before AMP registration
    if (!configOrg) {
      return {
        data: {
          error: 'organization_not_set',
          message: 'Organization must be configured before registering agents. Please complete the AI Maestro setup first.',
          field: 'organization',
          setup_url: '/setup'
        } as AMPError & { setup_url: string },
        status: 400
      }
    }

    // Use the configured organization (ignore client-provided tenant if it differs)
    const tenant = configOrg
    if (body.tenant && body.tenant !== configOrg) {
      return {
        data: {
          error: 'invalid_field',
          message: `This AI Maestro instance is configured for organization '${configOrg}'. Cannot register under '${body.tenant}'.`,
          field: 'tenant',
          details: { expected_tenant: configOrg }
        } as AMPError,
        status: 400
      }
    }

    // Check if name already exists in this tenant (on this host)
    const existingAgent = getAgentByName(normalizedName, selfHostIdValue)
    let agent: ReturnType<typeof createAgent>

    if (existingAgent) {
      const hasAMP = existingAgent.metadata?.amp?.registeredVia
      if (hasAMP) {
        const existingFingerprint = existingAgent.metadata?.amp?.fingerprint
        if (existingFingerprint && existingFingerprint === fingerprint) {
          agent = existingAgent
          console.log(`[AMP Register] Re-registering agent '${normalizedName}' (same key fingerprint, re-issuing API key)`)
        } else {
          return {
            data: {
              error: 'name_taken',
              message: `Agent name '${normalizedName}' is already registered`,
              suggestions: generateNameSuggestions(normalizedName)
            } as AMPNameTakenError,
            status: 409
          }
        }
      } else {
        agent = existingAgent
        console.log(`[AMP Register] Adopting existing agent '${normalizedName}' (${agent.id.substring(0, 8)}...)`)
      }
    } else {
      try {
        agent = createAgent({
          name: normalizedName,
          label: body.alias,
          program: 'Claude Code',
          model: 'Claude',
          taskDescription: body.metadata?.description as string || `AMP-registered agent: ${normalizedName}`,
          workingDirectory: body.metadata?.working_directory as string || undefined,
          createSession: false,
          metadata: {
            amp: {
              tenant,
              scope: body.scope,
              delivery: body.delivery,
              fingerprint,
              registeredVia: 'amp-v1-api',
              registeredAt: new Date().toISOString()
            },
            ...body.metadata
          }
        })
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to create agent'
        return {
          data: { error: 'internal_error', message: errorMessage } as AMPError,
          status: 500
        }
      }
    }

    // Store the public key
    try {
      saveKeyPair(agent.id, {
        privatePem: '',
        publicPem: body.public_key,
        publicHex: publicKeyHex,
        fingerprint
      })
    } catch (err) {
      console.error('[AMP Register] Failed to save public key:', err)
    }

    // Get provider domain based on organization
    const providerDomain = getAMPProviderDomain(tenant)

    // Generate API key
    const apiKey = createApiKey(agent.id, tenant, `${normalizedName}@${providerDomain}`)

    // Mark agent as AMP-registered
    const registeredAt = new Date().toISOString()
    const fullAddress = body.scope?.repo && body.scope?.platform
      ? `${normalizedName}@${body.scope.repo}.${body.scope.platform}.${providerDomain}`
      : `${normalizedName}@${providerDomain}`

    markAgentAsAMPRegistered(agent.id, {
      address: fullAddress,
      tenant,
      fingerprint,
      registeredAt,
      apiKeyHash: hashApiKey(apiKey)
    })

    // Build response
    const hostEndpoint = selfHost?.url || `http://localhost:23000`

    const response: AMPRegistrationResponse = {
      address: fullAddress,
      short_address: `${normalizedName}@${providerDomain}`,
      local_name: normalizedName,
      agent_id: agent.id,
      tenant_id: tenant,
      tenant,
      api_key: apiKey,
      provider: {
        name: providerDomain,
        endpoint: `${hostEndpoint}/api/v1`,
        route_url: `${hostEndpoint}/api/v1/route`
      },
      fingerprint,
      registered_at: registeredAt
    }

    console.log(`[AMP Register] Registered agent: ${fullAddress} (${agent.id.substring(0, 8)}...)`)

    return { data: response, status: 201 }

  } catch (error) {
    console.error('[AMP Register] Error:', error)
    return {
      data: { error: 'internal_error', message: error instanceof Error ? error.message : 'Internal server error' } as AMPError,
      status: 500
    }
  }
}

// ---------------------------------------------------------------------------
// POST /api/v1/route
// ---------------------------------------------------------------------------

export async function routeMessage(
  body: AMPRouteRequest,
  authHeader: string | null,
  forwardedFrom: string | null,
  envelopeIdHeader: string | null,
  signatureHeader: string | null,
  contentLength: string | null
): Promise<ServiceResult<AMPRouteResponse | AMPError>> {
  try {
    // ── Authentication ─────────────────────────────────────────────────
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
        console.log(`[AMP Route] Accepting mesh-forwarded request from ${forwardedFrom} (signature NOT verified -- trusted host)`)
      }
    }

    if (!auth.authenticated) {
      return {
        data: { error: auth.error || 'unauthorized', message: auth.message || 'Authentication required' } as AMPError,
        status: 401
      }
    }

    // ── Rate Limiting (S2) ────────────────────────────────────────────
    const rateLimitKey = auth.agentId || forwardedFrom || 'unknown'
    const rateLimit = checkRouteRateLimit(rateLimitKey)
    const rateLimitHeaders = {
      'X-RateLimit-Limit': String(rateLimit.limit),
      'X-RateLimit-Remaining': String(rateLimit.remaining),
      'X-RateLimit-Reset': String(Math.ceil(rateLimit.resetAt / 1000)),
    }

    if (!rateLimit.allowed) {
      return {
        data: { error: 'rate_limited', message: `Rate limit exceeded: ${ROUTE_RATE_LIMIT_MAX} requests per minute` } as AMPError,
        status: 429,
        headers: rateLimitHeaders
      }
    }

    // ── Payload Size Limit (S10) ──────────────────────────────────────
    if (contentLength && parseInt(contentLength, 10) > MAX_PAYLOAD_SIZE) {
      return {
        data: { error: 'payload_too_large', message: `Payload exceeds maximum size of ${MAX_PAYLOAD_SIZE} bytes` } as AMPError,
        status: 413
      }
    }

    // ── Body Validation ────────────────────────────────────────────────
    if (!body.to || typeof body.to !== 'string') {
      return {
        data: { error: 'missing_field', message: 'to address is required', field: 'to' } as AMPError,
        status: 400
      }
    }
    if (!body.subject || typeof body.subject !== 'string') {
      return {
        data: { error: 'missing_field', message: 'subject is required', field: 'subject' } as AMPError,
        status: 400
      }
    }
    if (!body.payload || typeof body.payload !== 'object') {
      return {
        data: { error: 'missing_field', message: 'payload is required', field: 'payload' } as AMPError,
        status: 400
      }
    }
    if (!body.payload.type || !body.payload.message) {
      return {
        data: { error: 'invalid_field', message: 'payload must have type and message fields', field: 'payload' } as AMPError,
        status: 400
      }
    }

    // ── Sender Resolution ──────────────────────────────────────────────
    const isMeshForwarded = !!forwardedFrom && auth.agentId?.startsWith('mesh-')
    const senderAgent = isMeshForwarded ? null : getAgent(auth.agentId!)

    if (!senderAgent && !isMeshForwarded) {
      return {
        data: { error: 'internal_error', message: 'Sender agent not found in registry' } as AMPError,
        status: 500
      }
    }

    const senderName = senderAgent?.name || senderAgent?.alias
      || (isMeshForwarded && body.from ? body.from.split('@')[0] : 'unknown')

    // ── Sender Address Validation for Mesh (D16) ──────────────────────
    if (isMeshForwarded && body.from) {
      const senderParsed = parseAMPAddress(body.from)
      if (senderParsed) {
        const fwdHost = getHostById(forwardedFrom!)
        const expectedHostName = fwdHost?.name || forwardedFrom
        if (senderParsed.tenant !== forwardedFrom && senderParsed.tenant !== expectedHostName) {
          console.warn(`[AMP Route] Sender address tenant "${senderParsed.tenant}" does not match forwarding host "${forwardedFrom}" -- possible address spoofing`)
        }
      }
    }

    // ── Envelope Construction ──────────────────────────────────────────
    const recipientParsed = parseAMPAddress(body.to)
    const messageId = generateMessageId()
    const now = new Date().toISOString()

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
    const senderKeyPair = isMeshForwarded ? null : loadKeyPair(auth.agentId!)

    if (body.signature) {
      if (senderKeyPair?.publicHex) {
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
      return {
        data: {
          error: 'external_provider',
          message: `Recipient is on external provider "${recipientParsed?.provider}". Send directly to that provider using its route_url from your registration.`
        } as AMPError,
        status: 422
      }
    }

    // ── Recipient Resolution ───────────────────────────────────────────
    const recipientName = recipientParsed?.name || body.to.split('@')[0]
    const selfHostIdValue = getSelfHostId()

    const targetTenant = recipientParsed?.tenant

    const isExplicitRemote = targetTenant
      && !isSelf(targetTenant)
      && targetTenant !== organization

    let resolvedHostId: string | undefined
    let resolvedAgentId: string | undefined

    if (isMeshForwarded) {
      const localAgent = getAgentByName(recipientName, selfHostIdValue)
      if (localAgent) {
        resolvedHostId = selfHostIdValue
        resolvedAgentId = localAgent.id
      } else {
        const resolved = resolveAgentIdentifier(recipientName)
        if (resolved?.agentId) {
          resolvedAgentId = resolved.agentId
          resolvedHostId = selfHostIdValue
        }
      }
    } else if (isExplicitRemote) {
      resolvedHostId = targetTenant
    } else {
      const meshResult = await checkMeshAgentExists(recipientName, MESH_DISCOVERY_TIMEOUT_MS)
      if (meshResult.exists && meshResult.host) {
        resolvedHostId = meshResult.host
        resolvedAgentId = meshResult.agent?.id
      }

      if (!resolvedAgentId) {
        const resolved = resolveAgentIdentifier(recipientName)
        if (resolved?.agentId) {
          resolvedAgentId = resolved.agentId
          resolvedHostId = selfHostIdValue
        }
      }
    }

    // ── Remote Delivery ────────────────────────────────────────────────
    if (resolvedHostId && !isSelf(resolvedHostId)) {
      const remoteHost = getHostById(resolvedHostId)

      if (!remoteHost) {
        if (!resolvedAgentId) {
          console.error(`[AMP Route] Host '${resolvedHostId}' not in config and no UUID for ${recipientName} -- cannot queue`)
          return {
            data: { error: 'not_found', message: `Recipient '${recipientName}' not found and target host '${resolvedHostId}' is not configured` } as AMPError,
            status: 404
          }
        }
        console.log(`[AMP Route] Host '${resolvedHostId}' not in config, queuing for relay`)
        queueMessage(resolvedAgentId, envelope, body.payload, senderKeyPair?.publicHex || '')
        return {
          data: { id: messageId, status: 'queued', method: 'relay', queued_at: now } as AMPRouteResponse,
          status: 200,
          headers: rateLimitHeaders
        }
      }

      console.log(`[AMP Route] Forwarding to ${recipientName}@${resolvedHostId} via ${remoteHost.url}`)
      const fwd = await forwardToHost(remoteHost, recipientName, envelope, body, selfHostIdValue)

      if (fwd.ok) {
        return {
          data: {
            id: (fwd.result?.id as string) || messageId,
            status: 'delivered', method: 'mesh', delivered_at: now, remote_host: resolvedHostId
          } as AMPRouteResponse,
          status: 200,
          headers: rateLimitHeaders
        }
      }

      console.error(`[AMP Route] Mesh delivery to ${resolvedHostId} failed: ${fwd.error}`)
      if (!resolvedAgentId) {
        return {
          data: { error: 'internal_error', message: `Mesh delivery to ${resolvedHostId} failed and no UUID to queue: ${fwd.error}` } as AMPError,
          status: 502
        }
      }
      queueMessage(resolvedAgentId, envelope, body.payload, senderKeyPair?.publicHex || '')
      return {
        data: {
          id: messageId, status: 'queued', method: 'relay', queued_at: now,
          error: `Mesh delivery to ${resolvedHostId} failed, queued for retry`
        } as AMPRouteResponse,
        status: 200,
        headers: rateLimitHeaders
      }
    }

    // ── Local Delivery ─────────────────────────────────────────────────
    const localAgent = resolvedAgentId ? getAgent(resolvedAgentId) : null

    if (!localAgent) {
      if (!resolvedAgentId) {
        return {
          data: { error: 'not_found', message: `Recipient '${recipientName}' not found on any host` } as AMPError,
          status: 404
        }
      }
      queueMessage(resolvedAgentId, envelope, body.payload, senderKeyPair?.publicHex || '')
      return {
        data: { id: messageId, status: 'queued', method: 'relay', queued_at: now } as AMPRouteResponse,
        status: 200
      }
    }

    const recipientAgentName = localAgent.name || localAgent.alias || recipientName

    try {
      await deliverLocally({
        envelope, payload: body.payload, localAgent, recipientAgentName,
        senderAgent, senderName, forwardedFrom, senderPublicKeyHex: senderKeyPair?.publicHex, body
      })

      return {
        data: { id: messageId, status: 'delivered', method: 'local', delivered_at: now } as AMPRouteResponse,
        status: 200,
        headers: rateLimitHeaders
      }

    } catch (error) {
      console.error('[AMP Route] Local delivery failed:', error)
      queueMessage(localAgent.id, envelope, body.payload, senderKeyPair?.publicHex || '')
      return {
        data: {
          id: messageId, status: 'queued', method: 'relay', queued_at: now,
          error: 'Direct delivery failed, queued for relay'
        } as AMPRouteResponse,
        status: 200,
        headers: rateLimitHeaders
      }
    }

  } catch (error) {
    console.error('[AMP Route] Error:', error)
    return {
      data: { error: 'internal_error', message: error instanceof Error ? error.message : 'Internal server error' } as AMPError,
      status: 500
    }
  }
}

// ---------------------------------------------------------------------------
// GET /api/v1/messages/pending
// ---------------------------------------------------------------------------

export function listPendingMessages(
  authHeader: string | null,
  limit?: number
): ServiceResult<AMPPendingMessagesResponse | AMPError> {
  // Lazy cleanup of expired relay messages
  lazyCleanup()

  const auth = authenticateRequest(authHeader)

  if (!auth.authenticated) {
    return {
      data: { error: auth.error || 'unauthorized', message: auth.message || 'Authentication required' } as AMPError,
      status: 401
    }
  }

  const effectiveLimit = limit ? Math.min(limit, 100) : 10
  const result = getPendingMessages(auth.agentId!, effectiveLimit)

  return {
    data: result,
    status: 200,
    headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' }
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/v1/messages/pending?id=<messageId>
// ---------------------------------------------------------------------------

export function acknowledgePendingMessage(
  authHeader: string | null,
  messageId: string | null
): ServiceResult<{ acknowledged: boolean } | AMPError> {
  const auth = authenticateRequest(authHeader)

  if (!auth.authenticated) {
    return {
      data: { error: auth.error || 'unauthorized', message: auth.message || 'Authentication required' } as AMPError,
      status: 401
    }
  }

  if (!messageId) {
    return {
      data: { error: 'missing_field', message: 'Message ID required (use ?id=<messageId>)', field: 'id' } as AMPError,
      status: 400
    }
  }

  const acknowledged = acknowledgeMessage(auth.agentId!, messageId)

  if (!acknowledged) {
    return {
      data: { error: 'not_found', message: `Message ${messageId} not found in pending queue` } as AMPError,
      status: 404
    }
  }

  return { data: { acknowledged: true }, status: 200 }
}

// ---------------------------------------------------------------------------
// POST /api/v1/messages/pending (batch ack)
// ---------------------------------------------------------------------------

export function batchAcknowledgeMessages(
  authHeader: string | null,
  ids: string[] | undefined
): ServiceResult<{ acknowledged: number } | AMPError> {
  const auth = authenticateRequest(authHeader)

  if (!auth.authenticated) {
    return {
      data: { error: auth.error || 'unauthorized', message: auth.message || 'Authentication required' } as AMPError,
      status: 401
    }
  }

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return {
      data: { error: 'missing_field', message: 'ids array required', field: 'ids' } as AMPError,
      status: 400
    }
  }

  if (ids.length > 100) {
    return {
      data: { error: 'invalid_request', message: 'Maximum 100 messages per batch' } as AMPError,
      status: 400
    }
  }

  const acknowledged = acknowledgeMessages(auth.agentId!, ids)

  return { data: { acknowledged }, status: 200 }
}

// ---------------------------------------------------------------------------
// POST /api/v1/messages/:id/read
// ---------------------------------------------------------------------------

export async function sendReadReceipt(
  authHeader: string | null,
  messageId: string,
  originalSender?: string
): Promise<ServiceResult<any>> {
  const auth = authenticateRequest(authHeader)

  if (!auth.authenticated) {
    return {
      data: { error: auth.error || 'unauthorized', message: auth.message || 'Authentication required' } as AMPError,
      status: 401
    }
  }

  // Build read receipt envelope
  const receiptEnvelope: AMPEnvelope = {
    version: 'amp/0.1',
    id: `receipt_read_${messageId}_${Date.now()}`,
    from: auth.address!,
    to: originalSender || '',
    subject: `Read: ${messageId}`,
    priority: 'low',
    timestamp: new Date().toISOString(),
    signature: '',
    thread_id: messageId,
    in_reply_to: messageId,
  }

  const receiptPayload: AMPPayload = {
    type: 'ack',
    message: `Message ${messageId} has been read`,
    context: {
      receipt_type: 'read',
      original_message_id: messageId,
      read_at: new Date().toISOString(),
      reader: auth.address,
    },
  }

  // Attempt WebSocket delivery to original sender
  let delivered = false
  if (originalSender) {
    delivered = deliverViaWebSocket(originalSender, receiptEnvelope, receiptPayload)
  }

  return {
    data: {
      receipt_sent: true,
      message_id: messageId,
      delivered_via: delivered ? 'websocket' : 'none',
      read_at: new Date().toISOString(),
    },
    status: 200
  }
}

// ---------------------------------------------------------------------------
// GET /api/v1/agents
// ---------------------------------------------------------------------------

export function listAMPAgents(
  authHeader: string | null,
  search?: string | null
): ServiceResult<any> {
  const auth = authenticateRequest(authHeader)

  if (!auth.authenticated) {
    return {
      data: { error: auth.error || 'unauthorized', message: auth.message || 'Authentication required' } as AMPError,
      status: 401
    }
  }

  let agents = getAMPRegisteredAgents()

  // Filter to same tenant
  if (auth.tenantId) {
    agents = agents.filter((a: any) =>
      (a.metadata?.amp?.tenant as string) === auth.tenantId
    )
  }

  // Apply search filter
  if (search) {
    const searchLower = search.toLowerCase()
    agents = agents.filter((a: any) =>
      (a.name?.toLowerCase().includes(searchLower)) ||
      (a.alias?.toLowerCase().includes(searchLower)) ||
      (a.label?.toLowerCase().includes(searchLower)) ||
      ((a.metadata?.amp?.address as string)?.toLowerCase().includes(searchLower))
    )
  }

  const agentList = agents.map((a: any) => ({
    address: (a.metadata?.amp?.address as string) || `${a.name}@unknown`,
    alias: a.alias || a.label,
    online: a.sessions?.some((s: any) => s.status === 'online') || false,
  }))

  return {
    data: { agents: agentList, total: agentList.length },
    status: 200
  }
}

// ---------------------------------------------------------------------------
// GET /api/v1/agents/me
// ---------------------------------------------------------------------------

export function getAgentSelf(authHeader: string | null): ServiceResult<any> {
  const auth = authenticateRequest(authHeader)

  if (!auth.authenticated) {
    return {
      data: { error: auth.error || 'unauthorized', message: auth.message || 'Authentication required' } as AMPError,
      status: 401
    }
  }

  const agent = getAgent(auth.agentId!)
  if (!agent) {
    return {
      data: { error: 'not_found', message: 'Agent not found' } as AMPError,
      status: 404
    }
  }

  const keyPair = loadKeyPair(auth.agentId!)

  return {
    data: {
      address: auth.address,
      alias: agent.alias || agent.label,
      delivery: agent.metadata?.amp?.delivery || {},
      fingerprint: keyPair?.fingerprint || agent.metadata?.amp?.fingerprint || null,
      registered_at: agent.metadata?.amp?.registeredAt || agent.createdAt,
      last_seen_at: agent.lastActive || null,
    },
    status: 200
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/v1/agents/me
// ---------------------------------------------------------------------------

export async function updateAgentSelf(
  authHeader: string | null,
  body: { alias?: string; delivery?: Record<string, unknown>; metadata?: Record<string, unknown> }
): Promise<ServiceResult<any>> {
  const auth = authenticateRequest(authHeader)

  if (!auth.authenticated) {
    return {
      data: { error: auth.error || 'unauthorized', message: auth.message || 'Authentication required' } as AMPError,
      status: 401
    }
  }

  const agent = getAgent(auth.agentId!)
  if (!agent) {
    return {
      data: { error: 'not_found', message: 'Agent not found' } as AMPError,
      status: 404
    }
  }

  // Update allowed fields
  const updates: Record<string, unknown> = {}
  if (body.alias !== undefined) {
    updates.label = body.alias
  }

  // Merge delivery and metadata into agent's amp metadata
  if (body.delivery !== undefined || body.metadata !== undefined) {
    const existingAmpMeta = (agent.metadata?.amp || {}) as Record<string, unknown>
    if (body.delivery !== undefined) {
      existingAmpMeta.delivery = { ...(existingAmpMeta.delivery as Record<string, unknown> || {}), ...body.delivery }
    }
    updates.metadata = {
      ...agent.metadata,
      amp: existingAmpMeta,
      ...(body.metadata || {})
    }
  }

  if (Object.keys(updates).length > 0) {
    updateAgent(auth.agentId!, updates as any)
  }

  return {
    data: { updated: true, address: auth.address },
    status: 200
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/v1/agents/me
// ---------------------------------------------------------------------------

export async function deleteAgentSelf(authHeader: string | null): Promise<ServiceResult<any>> {
  const auth = authenticateRequest(authHeader)

  if (!auth.authenticated) {
    return {
      data: { error: auth.error || 'unauthorized', message: auth.message || 'Authentication required' } as AMPError,
      status: 401
    }
  }

  // Revoke all API keys for this agent
  revokeAllKeysForAgent(auth.agentId!)

  // Hard delete with backup
  const deleted = deleteAgent(auth.agentId!, true)
  if (!deleted) {
    return {
      data: { error: 'not_found', message: 'Agent not found' } as AMPError,
      status: 404
    }
  }

  return {
    data: {
      deregistered: true,
      address: auth.address,
      deregistered_at: new Date().toISOString(),
    },
    status: 200
  }
}

// ---------------------------------------------------------------------------
// GET /api/v1/agents/resolve/:address
// ---------------------------------------------------------------------------

export function resolveAgentAddress(
  authHeader: string | null,
  address: string
): ServiceResult<AMPAgentResolveResponse | AMPError> {
  const auth = authenticateRequest(authHeader)

  if (!auth.authenticated) {
    return {
      data: { error: auth.error || 'unauthorized', message: auth.message || 'Authentication required' } as AMPError,
      status: 401
    }
  }

  const decodedAddress = decodeURIComponent(address)

  // Extract agent name from address (name@domain)
  const atIndex = decodedAddress.indexOf('@')
  const agentName = atIndex >= 0 ? decodedAddress.substring(0, atIndex) : decodedAddress

  // Find agent by name
  const agent = getAgentByNameAnyHost(agentName)

  if (!agent) {
    // Also try searching all agents by AMP address metadata
    const allAgents = loadAgents()
    const byAddress = allAgents.find((a: any) =>
      a.metadata?.amp?.address === decodedAddress
    )
    if (!byAddress) {
      return {
        data: { error: 'not_found', message: `Agent not found: ${decodedAddress}` } as AMPError,
        status: 404
      }
    }

    const keyPair = loadKeyPair(byAddress.id)
    return {
      data: {
        address: decodedAddress,
        alias: byAddress.alias || byAddress.label,
        public_key: keyPair?.publicPem || '',
        key_algorithm: 'Ed25519',
        fingerprint: keyPair?.fingerprint || (byAddress.metadata?.amp?.fingerprint as string) || '',
        online: byAddress.sessions?.some((s: any) => s.status === 'online') || false,
      } as AMPAgentResolveResponse,
      status: 200
    }
  }

  const keyPair = loadKeyPair(agent.id)
  const ampAddress = (agent.metadata?.amp?.address as string) || decodedAddress

  return {
    data: {
      address: ampAddress,
      alias: agent.alias || agent.label,
      public_key: keyPair?.publicPem || '',
      key_algorithm: 'Ed25519',
      fingerprint: keyPair?.fingerprint || (agent.metadata?.amp?.fingerprint as string) || '',
      online: agent.sessions?.some((s: any) => s.status === 'online') || false,
    } as AMPAgentResolveResponse,
    status: 200
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/v1/auth/revoke-key
// ---------------------------------------------------------------------------

export function revokeKey(authHeader: string | null): ServiceResult<any> {
  const apiKey = extractApiKeyFromHeader(authHeader)

  if (!apiKey) {
    return {
      data: { error: 'unauthorized', message: 'Missing or invalid Authorization header' } as AMPError,
      status: 401
    }
  }

  const revoked = revokeApiKey(apiKey)

  if (!revoked) {
    return {
      data: { error: 'not_found', message: 'API key not found' } as AMPError,
      status: 404
    }
  }

  return {
    data: { revoked: true, revoked_at: new Date().toISOString() },
    status: 200
  }
}

// ---------------------------------------------------------------------------
// POST /api/v1/auth/rotate-key
// ---------------------------------------------------------------------------

export function rotateKey(authHeader: string | null): ServiceResult<AMPKeyRotationResponse | AMPError> {
  const apiKey = extractApiKeyFromHeader(authHeader)

  if (!apiKey) {
    return {
      data: { error: 'unauthorized', message: 'Missing or invalid Authorization header' } as AMPError,
      status: 401
    }
  }

  const result = rotateApiKey(apiKey)

  if (!result) {
    return {
      data: { error: 'unauthorized', message: 'Invalid or expired API key' } as AMPError,
      status: 401
    }
  }

  return {
    data: result as AMPKeyRotationResponse,
    status: 200
  }
}

// ---------------------------------------------------------------------------
// POST /api/v1/auth/rotate-keys
// ---------------------------------------------------------------------------

export async function rotateKeypair(authHeader: string | null): Promise<ServiceResult<any>> {
  const auth = authenticateRequest(authHeader)

  if (!auth.authenticated) {
    return {
      data: { error: auth.error || 'unauthorized', message: auth.message || 'Authentication required' } as AMPError,
      status: 401
    }
  }

  const agent = getAgent(auth.agentId!)
  if (!agent) {
    return {
      data: { error: 'not_found', message: 'Agent not found' } as AMPError,
      status: 404
    }
  }

  // Generate new keypair and save to disk
  const newKeyPair = await generateKeyPair()
  saveKeyPair(auth.agentId!, newKeyPair)

  // Update agent metadata with new fingerprint
  const existingAmpMeta = (agent.metadata?.amp || {}) as Record<string, unknown>
  existingAmpMeta.fingerprint = newKeyPair.fingerprint
  updateAgent(auth.agentId!, {
    metadata: {
      ...agent.metadata,
      amp: existingAmpMeta,
    }
  } as any)

  return {
    data: {
      rotated: true,
      address: auth.address,
      fingerprint: newKeyPair.fingerprint,
      public_key: newKeyPair.publicPem,
      key_algorithm: 'Ed25519',
    },
    status: 200
  }
}

// ---------------------------------------------------------------------------
// POST /api/v1/federation/deliver
// ---------------------------------------------------------------------------

export async function deliverFederated(
  providerName: string | null,
  body: { envelope: AMPEnvelope; payload: AMPPayload; sender_public_key?: string }
): Promise<ServiceResult<any>> {
  try {
    // ── Provider Identity ───────────────────────────────────────────────
    if (!providerName) {
      return {
        data: { error: 'missing_header', message: 'X-AMP-Provider header is required' } as AMPError,
        status: 400
      }
    }

    // ── Rate Limiting (per-provider) ─────────────────────────────────────
    const rateLimit = checkFederationRateLimit(providerName)
    if (!rateLimit.allowed) {
      return {
        data: { error: 'rate_limited', message: 'Federation rate limit exceeded' } as AMPError,
        status: 429,
        headers: { 'Retry-After': '60' }
      }
    }

    // ── Body Validation ────────────────────────────────────────────────
    const { envelope, payload, sender_public_key } = body

    if (!envelope || !payload) {
      return {
        data: { error: 'invalid_request', message: 'envelope and payload are required' } as AMPError,
        status: 400
      }
    }

    // ── Replay Protection ───────────────────────────────────────────────
    if (!trackMessageId(envelope.id)) {
      return {
        data: { error: 'duplicate_message', message: `Message ${envelope.id} has already been delivered` } as AMPError,
        status: 409
      }
    }

    // ── Message Signature Verification ──────────────────────────────────
    let signatureVerified = false
    if (envelope.signature && sender_public_key) {
      try {
        const payloadHash = crypto
          .createHash('sha256')
          .update(JSON.stringify(payload))
          .digest('base64')

        const signatureData = [
          envelope.from, envelope.to, envelope.subject,
          envelope.priority || 'normal', envelope.in_reply_to || '', payloadHash
        ].join('|')

        signatureVerified = verifySignature(signatureData, envelope.signature, sender_public_key)
      } catch {
        console.warn(`[Federation] Signature verification failed for ${envelope.id}`)
      }
    }

    // ── Recipient Resolution ────────────────────────────────────────────
    const recipientName = envelope.to.split('@')[0]
    const resolved = resolveAgentIdentifier(recipientName)
    const localAgent = resolved?.agentId ? getAgent(resolved.agentId) : null

    if (!localAgent) {
      if (resolved?.agentId) {
        queueMessage(resolved.agentId, envelope, payload, sender_public_key || '')
        return {
          data: {
            id: envelope.id,
            status: 'queued',
            method: 'relay',
            queued_at: new Date().toISOString(),
          },
          status: 200
        }
      }
      return {
        data: { error: 'not_found', message: `Recipient '${recipientName}' not found on any host` } as AMPError,
        status: 404
      }
    }

    // ── Local Delivery ──────────────────────────────────────────────────
    await deliver({
      envelope,
      payload,
      recipientAgentName: localAgent.name || recipientName,
      senderPublicKeyHex: signatureVerified ? sender_public_key : undefined,
      senderName: envelope.from.split('@')[0],
      senderHost: providerName,
      recipientAgentId: localAgent.id,
      subject: envelope.subject,
      priority: envelope.priority,
      messageType: payload.type,
    })

    return {
      data: {
        id: envelope.id,
        status: 'delivered',
        method: 'local',
        delivered_at: new Date().toISOString(),
      },
      status: 200
    }

  } catch (error) {
    console.error('[Federation] Error:', error)
    return {
      data: { error: 'internal_error', message: error instanceof Error ? error.message : 'Internal server error' } as AMPError,
      status: 500
    }
  }
}
