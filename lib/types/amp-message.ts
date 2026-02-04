/**
 * AMP (Agent Messaging Protocol) Message Types
 *
 * AI Maestro implements AMP locally. When the Crabmail plugin is installed,
 * it enables federation with external AMP providers.
 *
 * Address format: agent@tenant.provider
 * - Local: agent@tenant.aimaestro.local
 * - External: agent@tenant.crabmail.ai (or any other AMP provider)
 */

// =============================================================================
// Core AMP Types (Protocol Spec)
// =============================================================================

export type AMPVersion = "amp/0.1";

export type MessagePriority = "urgent" | "high" | "normal" | "low";

export type MessageType =
  | "request"
  | "response"
  | "notification"
  | "alert"
  | "task"
  | "status"
  | "update";

export type DeliveryStatus = "delivered" | "queued" | "failed";

export type DeliveryMethod = "local" | "websocket" | "webhook" | "relay";

/**
 * AMP Message Envelope
 * Contains routing and metadata information
 */
export interface AMPEnvelope {
  /** Protocol version */
  version: AMPVersion;

  /** Unique message ID */
  id: string;

  /** Sender address (agent@tenant.provider) */
  from: string;

  /** Recipient address (agent@tenant.provider) */
  to: string;

  /** Message subject */
  subject: string;

  /** Priority level */
  priority: MessagePriority;

  /** ISO 8601 timestamp */
  timestamp: string;

  /** Thread ID for conversation grouping */
  thread_id: string;

  /** ID of message being replied to */
  in_reply_to: string | null;

  /** ISO 8601 expiration time (null = no expiration) */
  expires_at: string | null;

  /** Ed25519 signature (null for local messages) */
  signature: string | null;
}

/**
 * AMP Message Payload
 * Contains the actual message content
 */
export interface AMPPayload {
  /** Message type classification */
  type: MessageType;

  /** Message body text */
  message: string;

  /** Optional structured context data */
  context?: Record<string, unknown>;
}

/**
 * AI Maestro Metadata Extension
 * Local state tracking (not part of AMP spec)
 */
export interface AMPMetadata {
  /** Read status */
  status: "unread" | "read" | "archived";

  /** When message was queued for delivery */
  queued_at: string;

  /** Number of delivery attempts */
  delivery_attempts: number;

  /** When message was migrated (if applicable) */
  migrated_at?: string;

  /** Legacy field mappings for backward compatibility */
  legacy?: {
    from_id: string;
    to_id: string;
    from_host: string;
    to_host: string;
  };
}

/**
 * Complete AMP Message
 */
export interface AMPMessage {
  envelope: AMPEnvelope;
  payload: AMPPayload;
  metadata: AMPMetadata;
}

// =============================================================================
// Address Parsing
// =============================================================================

export interface ParsedAddress {
  /** Agent name (e.g., "backend-api") */
  agent: string;

  /** Tenant/workspace (e.g., "23blocks") */
  tenant: string;

  /** Provider domain (e.g., "aimaestro.local", "crabmail.ai") */
  provider: string;

  /** Full address string */
  full: string;

  /** Is this a local address? */
  isLocal: boolean;
}

/**
 * Parse an AMP address into components
 *
 * Examples:
 *   "backend-api" → backend-api@default.aimaestro.local (local)
 *   "lola@23blocks.crabmail.ai" → lola@23blocks.crabmail.ai (external)
 */
export function parseAddress(
  address: string,
  defaultTenant: string = "default"
): ParsedAddress {
  const LOCAL_PROVIDER = "aimaestro.local";

  // Already a full address?
  if (address.includes("@")) {
    const [agent, domain] = address.split("@");

    // Check if domain has tenant.provider format
    if (domain.includes(".")) {
      // Check for aimaestro.local (two parts)
      if (domain.endsWith(".aimaestro.local")) {
        const tenant = domain.replace(".aimaestro.local", "");
        return {
          agent,
          tenant,
          provider: LOCAL_PROVIDER,
          full: `${agent}@${tenant}.${LOCAL_PROVIDER}`,
          isLocal: true,
        };
      }

      // External address - extract tenant and provider
      // Format: agent@tenant.provider.tld
      const parts = domain.split(".");
      if (parts.length >= 2) {
        const tenant = parts[0];
        const provider = parts.slice(1).join(".");
        return {
          agent,
          tenant,
          provider,
          full: address,
          isLocal: false,
        };
      }
    }

    // Simple domain (no dots) - treat as local host reference
    return {
      agent,
      tenant: domain,
      provider: LOCAL_PROVIDER,
      full: `${agent}@${domain}.${LOCAL_PROVIDER}`,
      isLocal: true,
    };
  }

  // Short form - expand to local address
  return {
    agent: address,
    tenant: defaultTenant,
    provider: LOCAL_PROVIDER,
    full: `${address}@${defaultTenant}.${LOCAL_PROVIDER}`,
    isLocal: true,
  };
}

/**
 * Check if an address is local
 */
export function isLocalAddress(address: string): boolean {
  return (
    address.endsWith(".aimaestro.local") || !address.includes("@")
  );
}

// =============================================================================
// Message Creation Helpers
// =============================================================================

export interface CreateMessageOptions {
  to: string;
  subject: string;
  message: string;
  type?: MessageType;
  priority?: MessagePriority;
  context?: Record<string, unknown>;
  inReplyTo?: string;
  expiresAt?: string;
}

/**
 * Create a new AMP message
 */
export function createAMPMessage(
  from: string,
  options: CreateMessageOptions
): AMPMessage {
  const id = generateMessageId();
  const timestamp = new Date().toISOString();

  return {
    envelope: {
      version: "amp/0.1",
      id,
      from,
      to: options.to,
      subject: options.subject,
      priority: options.priority || "normal",
      timestamp,
      thread_id: options.inReplyTo || id,
      in_reply_to: options.inReplyTo || null,
      expires_at: options.expiresAt || null,
      signature: null, // Set by signing function for external messages
    },
    payload: {
      type: options.type || "notification",
      message: options.message,
      context: options.context,
    },
    metadata: {
      status: "unread",
      queued_at: timestamp,
      delivery_attempts: 0,
    },
  };
}

/**
 * Generate a unique message ID
 */
export function generateMessageId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 9);
  return `msg_${timestamp}_${random}`;
}

// =============================================================================
// Delivery Results
// =============================================================================

export interface SendResult {
  success: boolean;
  id: string;
  status: DeliveryStatus;
  method: DeliveryMethod;
  delivered_at?: string;
  error?: string;
}

// =============================================================================
// Plugin Interface
// =============================================================================

/**
 * Messaging Plugin Interface
 *
 * Plugins extend AI Maestro to deliver messages to external AMP providers.
 * The primary use case is the Crabmail plugin for internet-scale federation.
 */
export interface MessagingPlugin {
  /** Plugin name (e.g., "crabmail") */
  name: string;

  /** Plugin version */
  version: string;

  /** Human-readable description */
  description: string;

  /** Provider domains this plugin handles (e.g., ["crabmail.ai"]) */
  providers: string[];

  // Lifecycle
  initialize(): Promise<void>;
  shutdown(): Promise<void>;

  // Identity
  isRegistered(): boolean;
  getIdentity(): PluginIdentity | null;

  // Messaging
  send(message: AMPMessage): Promise<SendResult>;
  receive(limit?: number): Promise<AMPMessage[]>;
  acknowledge(messageId: string): Promise<void>;

  // Optional: Real-time connection
  connect?(): Promise<void>;
  disconnect?(): Promise<void>;
  onMessage?(callback: (msg: AMPMessage) => void): void;
}

export interface PluginIdentity {
  agent: string;
  tenant: string;
  provider: string;
  address: string;
  registered_at: string;
}

export interface PluginManifest {
  name: string;
  version: string;
  description: string;
  providers: string[];
  api_url?: string;
  requires_registration: boolean;
  supports_websocket: boolean;
}
