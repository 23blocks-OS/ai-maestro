/**
 * AMP (Agent Messaging Protocol) Types
 *
 * Type definitions for implementing AMP protocol in AI Maestro.
 * Based on the AMP Protocol Specification v0.1.0
 *
 * AI Maestro acts as an AMP PROVIDER for local agents.
 * This enables three deployment scenarios:
 * - Solo Agent + External Provider (e.g., CrabMail)
 * - Air-Gapped Organization (AI Maestro only)
 * - Federated Organization (AI Maestro + External Providers)
 */

import type { AMPAgentIdentity, AMPExternalRegistration } from '@/types/agent'

// Re-export for convenience
export type { AMPAgentIdentity, AMPExternalRegistration }

// ============================================================================
// Storage Configuration
// ============================================================================

/**
 * Default relay TTL in days (7 days per protocol spec)
 */
export const AMP_RELAY_TTL_DAYS = 7

/**
 * API key prefix format: amp_<environment>_<type>_<random>
 */
export const AMP_API_KEY_PREFIX = 'amp_live_sk_'

// ============================================================================
// Protocol Version
// ============================================================================

export const AMP_PROTOCOL_VERSION = '0.1.0'

/**
 * Default provider name (used when organization is not set)
 * @deprecated Use getAMPProviderDomain() instead for dynamic organization support
 */
export const AMP_PROVIDER_NAME = 'aimaestro.local'

/**
 * Default organization name when none is configured
 */
export const AMP_DEFAULT_ORGANIZATION = 'default'

/**
 * Get the AMP provider domain based on organization
 * Format: {organization}.aimaestro.local
 *
 * @param organization - Organization name (optional, reads from config if not provided)
 * @returns Provider domain string
 *
 * Note: This function is synchronous and returns a default if organization
 * is not available. For server-side usage with dynamic organization,
 * import getOrganization from hosts-config.ts
 */
export function getAMPProviderDomain(organization?: string): string {
  const org = organization || AMP_DEFAULT_ORGANIZATION
  return `${org}.aimaestro.local`
}

/**
 * Build an AMP address from components
 *
 * @param agentName - Agent name (e.g., "backend-api")
 * @param organization - Organization name (e.g., "acme-corp")
 * @returns Full AMP address (e.g., "backend-api@acme-corp.aimaestro.local")
 */
export function buildAMPAddress(agentName: string, organization?: string): string {
  const domain = getAMPProviderDomain(organization)
  return `${agentName}@${domain}`
}

/**
 * Parse an AMP address into components
 *
 * @param address - Full AMP address (e.g., "agent@org.aimaestro.local")
 * @returns Parsed components or null if invalid
 */
export function parseAMPAddress(address: string): {
  name: string
  organization: string
  provider: string
  full: string
} | null {
  const match = address.match(/^([^@]+)@([^.]+)\.(.+)$/)
  if (!match) return null

  return {
    name: match[1],
    organization: match[2],
    provider: match[3],
    full: address,
  }
}

// ============================================================================
// Message Envelope (Protocol Layer)
// ============================================================================

/**
 * AMP Message Envelope
 * Contains routing, authentication, and metadata for message delivery
 */
export interface AMPEnvelope {
  /** Unique message ID: msg_{timestamp}_{random} */
  id: string

  /** Sender's AMP address: name@tenant.provider */
  from: string

  /** Recipient's AMP address: name@tenant.provider */
  to: string

  /** Message subject */
  subject: string

  /** Message priority */
  priority: 'low' | 'normal' | 'high' | 'urgent'

  /** ISO 8601 timestamp */
  timestamp: string

  /** Ed25519 signature of canonical envelope (base64) */
  signature: string

  /** Original message ID if this is a reply */
  in_reply_to?: string

  /** Thread ID for conversation tracking */
  thread_id?: string
}

/**
 * AMP Message Payload
 * The actual message content
 */
export interface AMPPayload {
  /** Content type */
  type: 'request' | 'response' | 'notification' | 'update' | 'system'

  /** Main message body */
  message: string

  /** Structured context/metadata */
  context?: Record<string, unknown>

  /** File attachments (paths or URLs) */
  attachments?: AMPAttachment[]
}

/**
 * AMP Attachment
 */
export interface AMPAttachment {
  name: string
  path?: string
  url?: string
  type: string
  size?: number
}

/**
 * Complete AMP Message (envelope + payload)
 */
export interface AMPMessage {
  envelope: AMPEnvelope
  payload: AMPPayload
}

// ============================================================================
// Registration Types
// ============================================================================

/**
 * Registration request body
 * POST /v1/register
 */
export interface AMPRegistrationRequest {
  /** Tenant/organization identifier */
  tenant: string

  /** Desired agent name (1-63 chars, alphanumeric + hyphens) */
  name: string

  /** PEM-encoded public key */
  public_key: string

  /** Key algorithm (Ed25519 recommended) */
  key_algorithm: 'Ed25519' | 'RSA' | 'ECDSA'

  /** Optional human-friendly display name */
  alias?: string

  /** Optional scope for namespacing */
  scope?: {
    platform?: string
    repo?: string
  }

  /** Message delivery configuration */
  delivery?: {
    webhook_url?: string
    webhook_secret?: string
    prefer_websocket?: boolean
  }

  /** Arbitrary metadata */
  metadata?: Record<string, unknown>

  /** Invite code for restricted tenants */
  invite_code?: string
}

/**
 * Registration response
 */
export interface AMPRegistrationResponse {
  /** Full AMP address: name@scope.tenant.provider */
  address: string

  /** Short address (if unique): name@tenant.provider */
  short_address: string

  /** Local name within tenant */
  local_name: string

  /** Internal agent ID */
  agent_id: string

  /** Tenant ID */
  tenant_id: string

  /** API key (shown ONLY ONCE) */
  api_key: string

  /** Provider info */
  provider: {
    name: string
    endpoint: string
  }

  /** Public key fingerprint */
  fingerprint: string

  /** Registration timestamp */
  registered_at: string
}

// ============================================================================
// Relay Queue Types
// ============================================================================

/**
 * Message in the relay queue (waiting for pickup)
 */
export interface AMPPendingMessage {
  /** Message ID */
  id: string

  /** Full AMP message */
  envelope: AMPEnvelope
  payload: AMPPayload

  /** Sender's public key for verification */
  sender_public_key: string

  /** When queued */
  queued_at: string

  /** When message expires (TTL) */
  expires_at: string

  /** Delivery attempts */
  delivery_attempts?: number

  /** Last delivery attempt timestamp */
  last_attempt_at?: string
}

/**
 * Pending messages response
 * GET /v1/messages/pending
 */
export interface AMPPendingMessagesResponse {
  messages: AMPPendingMessage[]
  count: number
  remaining: number
}

// ============================================================================
// Route Types
// ============================================================================

/**
 * Route request body
 * POST /v1/route
 */
export interface AMPRouteRequest {
  /** Recipient address */
  to: string

  /** Message subject */
  subject: string

  /** Message priority */
  priority?: 'low' | 'normal' | 'high' | 'urgent'

  /** Reply reference */
  in_reply_to?: string

  /** Message payload */
  payload: AMPPayload

  /**
   * Client-provided Ed25519 signature (base64)
   * The server will VERIFY this signature, not create one.
   * Signature covers: id|from|to|subject|timestamp (pipe-delimited)
   */
  signature?: string

  /** Delivery options */
  options?: {
    /** Request delivery receipt */
    receipt?: boolean
  }
}

/**
 * Route response
 */
export interface AMPRouteResponse {
  /** Message ID */
  id: string

  /** Delivery status */
  status: 'delivered' | 'queued' | 'failed'

  /** Delivery method used */
  method?: 'websocket' | 'webhook' | 'relay' | 'local' | 'mesh'

  /** Remote host ID (if delivered via mesh) */
  remote_host?: string

  /** Delivery timestamp (if delivered) */
  delivered_at?: string

  /** Queue timestamp (if queued) */
  queued_at?: string

  /** Error message (if failed or partial) */
  error?: string

  /** Informational note */
  note?: string
}

// ============================================================================
// Health & Info Types
// ============================================================================

/**
 * Health check response
 * GET /v1/health
 */
export interface AMPHealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy'
  version: string
  provider: string
  federation: boolean
  agents_online: number
  uptime_seconds: number
}

/**
 * Provider info response
 * GET /v1/info
 */
export interface AMPInfoResponse {
  provider: string
  version: string
  public_key?: string
  fingerprint?: string
  capabilities: string[]
  registration_modes: ('open' | 'invite' | 'verified' | 'admin')[]
  rate_limits: {
    messages_per_minute: number
    api_requests_per_minute: number
  }
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * AMP error codes
 */
export type AMPErrorCode =
  | 'invalid_request'
  | 'missing_field'
  | 'invalid_field'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'name_taken'
  | 'rate_limited'
  | 'internal_error'
  | 'invalid_signature'
  | 'agent_not_found'
  | 'tenant_access_denied'
  | 'organization_not_set'  // Phase 2: Organization required for AMP registration

/**
 * AMP error response
 */
export interface AMPError {
  error: AMPErrorCode
  message: string
  field?: string
  details?: Record<string, unknown>
}

/**
 * Name taken error with suggestions
 */
export interface AMPNameTakenError extends AMPError {
  error: 'name_taken'
  suggestions: string[]
}

// ============================================================================
// API Key Types
// ============================================================================

/**
 * Stored API key record (hashed for security)
 */
export interface AMPApiKeyRecord {
  /** API key hash (SHA-256) */
  key_hash: string

  /** Agent ID this key belongs to */
  agent_id: string

  /** Tenant ID */
  tenant_id: string

  /** Agent address */
  address: string

  /** Creation timestamp */
  created_at: string

  /** Expiration timestamp (null = never) */
  expires_at: string | null

  /** Last used timestamp */
  last_used_at?: string

  /** Key status */
  status: 'active' | 'revoked' | 'expired'
}

/**
 * Key rotation response
 */
export interface AMPKeyRotationResponse {
  api_key: string
  expires_at: string | null
  previous_key_valid_until: string
}

// ============================================================================
// Agent Management Types
// ============================================================================

/**
 * Agent info returned by /v1/agents/me
 */
export interface AMPAgentInfo {
  address: string
  alias?: string
  delivery?: {
    webhook_url?: string
    prefer_websocket?: boolean
  }
  fingerprint: string
  registered_at: string
  last_seen_at?: string
}

/**
 * Agent update request
 * PATCH /v1/agents/me
 */
export interface AMPAgentUpdateRequest {
  alias?: string
  delivery?: {
    webhook_url?: string
    webhook_secret?: string
    prefer_websocket?: boolean
  }
  metadata?: Record<string, unknown>
}

/**
 * Agent list item (search/list results)
 */
export interface AMPAgentListItem {
  address: string
  alias?: string
  online: boolean
}

/**
 * Resolve agent response
 * GET /v1/agents/resolve/:address
 */
export interface AMPAgentResolveResponse {
  address: string
  alias?: string
  public_key: string
  key_algorithm: 'Ed25519' | 'RSA' | 'ECDSA'
  fingerprint: string
  online: boolean
}

// ============================================================================
// Federation Types
// ============================================================================

/**
 * Federation delivery request
 * POST /v1/federation/deliver
 */
export interface AMPFederationDeliveryRequest {
  envelope: AMPEnvelope
  payload: AMPPayload
  sender_public_key: string
}

/**
 * Federation delivery response
 */
export interface AMPFederationDeliveryResponse {
  accepted: boolean
  id: string
  delivered: boolean
}

/**
 * Federation headers
 */
export interface AMPFederationHeaders {
  'X-AMP-Provider': string
  'X-AMP-Signature': string
  'X-AMP-Timestamp': string
}

// ============================================================================
// WebSocket Types
// ============================================================================

/**
 * WebSocket message types (client → server)
 */
export type AMPWSClientMessageType = 'auth' | 'ping' | 'route' | 'ack'

/**
 * WebSocket message types (server → client)
 */
export type AMPWSServerMessageType =
  | 'pong'
  | 'connected'
  | 'message.new'
  | 'message.delivered'
  | 'message.read'
  | 'error'

/**
 * WebSocket auth message (client → server)
 */
export interface AMPWSAuthMessage {
  type: 'auth'
  token: string
}

/**
 * WebSocket connected response (server → client)
 */
export interface AMPWSConnectedMessage {
  type: 'connected'
  data: {
    address: string
    pending_count: number
  }
}

/**
 * WebSocket new message notification
 */
export interface AMPWSNewMessage {
  type: 'message.new'
  data: {
    id: string
    envelope: AMPEnvelope
    payload: AMPPayload
  }
}

/**
 * WebSocket delivery confirmation
 */
export interface AMPWSDeliveredMessage {
  type: 'message.delivered'
  data: {
    id: string
    to: string
    delivered_at: string
    method: 'websocket' | 'webhook' | 'relay'
  }
}
