/**
 * AMP Identity System
 *
 * CORE PRINCIPLE: Each agent is an INDEPENDENT ENTITY that owns its identity.
 *
 * - Agents own their keypairs (like people own their SSH keys)
 * - Agents can be transferred between hosts/machines
 * - Keys travel WITH the agent
 * - An AI Maestro instance can host MULTIPLE agents
 *
 * Directory Structure:
 * ~/.aimaestro/
 * ├── config.json                    # AI Maestro instance config
 * ├── agents/
 * │   ├── registry.json              # List of agents on this instance
 * │   └── <agent-id>/                # Each agent's data directory
 * │       ├── identity.json          # Agent's identity
 * │       ├── keys/
 * │       │   ├── private.pem        # Agent's private key (NEVER shared)
 * │       │   └── public.pem         # Agent's public key
 * │       ├── registrations/         # External provider registrations
 * │       │   └── crabmail.json      # Crabmail registration
 * │       └── messages/
 * │           ├── inbox/
 * │           └── sent/
 * └── plugins/                       # Plugins (instance-level, not agent-level)
 *     └── crabmail/
 *         └── plugin.json
 */

// =============================================================================
// Agent Identity (Owned by the Agent)
// =============================================================================

/**
 * Agent Identity
 * This is THE agent's identity - it travels with the agent when transferred.
 */
export interface AgentIdentity {
  /** Unique agent ID (UUID) - never changes */
  id: string;

  /** Agent name (used in addresses) */
  name: string;

  /** Default tenant for this agent */
  tenant: string;

  /** Display name / alias */
  alias?: string;

  /** AMP address: name@tenant.aimaestro.local */
  address: string;

  /** SHA256 fingerprint of public key */
  fingerprint: string;

  /** Public key in hex format (32 bytes for Ed25519) */
  public_key_hex: string;

  /** Key algorithm */
  key_algorithm: "Ed25519";

  /** When agent identity was created */
  created_at: string;

  /** Agent metadata */
  metadata?: Record<string, unknown>;
}

/**
 * External Provider Registration
 * When an agent registers with Crabmail or another AMP provider
 */
export interface ExternalRegistration {
  /** Provider identifier (e.g., "crabmail") */
  provider: string;

  /** Provider API URL */
  api_url: string;

  /** Agent name on this provider (may differ from local name) */
  agent_name: string;

  /** Tenant on this provider */
  tenant: string;

  /** Full external address: agent@tenant.provider.tld */
  address: string;

  /** API key for authentication */
  api_key: string;

  /** Agent ID assigned by provider */
  provider_agent_id: string;

  /** Fingerprint (must match agent's fingerprint) */
  fingerprint: string;

  /** When registered */
  registered_at: string;
}

/**
 * Complete Agent Data (for export/transfer)
 */
export interface AgentExportPackage {
  /** Export format version */
  version: "1.0";

  /** Export timestamp */
  exported_at: string;

  /** Agent identity */
  identity: AgentIdentity;

  /** Private key (PEM format) - SENSITIVE! */
  private_key_pem: string;

  /** Public key (PEM format) */
  public_key_pem: string;

  /** External registrations */
  registrations: ExternalRegistration[];

  /** Optional: Include message history */
  include_messages?: boolean;
}

// =============================================================================
// AI Maestro Instance (Hosts Multiple Agents)
// =============================================================================

/**
 * AI Maestro Instance Configuration
 * This is about the HOST/INSTANCE, not individual agents
 */
export interface InstanceConfig {
  /** Instance ID */
  instance_id: string;

  /** Instance hostname */
  hostname: string;

  /** Default tenant for new agents on this instance */
  default_tenant: string;

  /** API port */
  port: number;

  /** Installed plugins */
  plugins: string[];
}

/**
 * Agent Registry Entry
 * Tracks which agents are hosted on this instance
 */
export interface AgentRegistryEntry {
  /** Agent ID */
  id: string;

  /** Agent name */
  name: string;

  /** Path to agent data directory */
  data_path: string;

  /** Associated tmux session (if any) */
  tmux_session?: string;

  /** Working directory */
  working_directory?: string;

  /** Is agent currently active? */
  active: boolean;

  /** When added to this instance */
  added_at: string;
}

// =============================================================================
// Agent Transfer
// =============================================================================

/**
 * AGENT TRANSFER FLOW
 *
 * Export from Host A:
 * $ aimaestro agent export lola --output lola-agent.tar.gz
 *
 * This creates a package containing:
 * - identity.json (agent's identity)
 * - keys/private.pem (agent's private key)
 * - keys/public.pem (agent's public key)
 * - registrations/*.json (Crabmail registration, etc.)
 * - Optionally: messages/inbox/* and messages/sent/*
 *
 * Import to Host B:
 * $ aimaestro agent import lola-agent.tar.gz
 *
 * This:
 * 1. Extracts to ~/.aimaestro/agents/<agent-id>/
 * 2. Registers agent in local registry
 * 3. Agent is now available on Host B with SAME identity
 *
 * The agent's address, fingerprint, and Crabmail registration
 * all remain valid because the KEYS moved with the agent.
 */

export interface TransferOptions {
  /** Include message history */
  includeMessages: boolean;

  /** Encrypt the export package */
  encrypt: boolean;

  /** Encryption password (if encrypt=true) */
  password?: string;
}

// =============================================================================
// Identity Resolution
// =============================================================================

/**
 * When sending a message, resolve which identity to use
 */
export interface SendContext {
  /** Agent doing the sending */
  agent: AgentIdentity;

  /** Destination address */
  to: string;

  /** Is destination local? */
  isLocal: boolean;

  /** If external, which registration to use */
  registration?: ExternalRegistration;

  /** From address to use */
  fromAddress: string;

  /** Should message be signed? */
  shouldSign: boolean;
}

/**
 * Resolve send context for a message
 *
 * @param agent - The sending agent
 * @param destinationAddress - Where the message is going
 * @returns Context for sending
 */
export function resolveSendContext(
  agent: AgentIdentity,
  registrations: ExternalRegistration[],
  destinationAddress: string
): SendContext {
  const isLocal = destinationAddress.endsWith(".aimaestro.local") ||
                  !destinationAddress.includes("@");

  if (isLocal) {
    return {
      agent,
      to: destinationAddress,
      isLocal: true,
      fromAddress: agent.address,
      shouldSign: true, // Sign even local messages for consistency
    };
  }

  // External - find matching registration
  // Extract provider from address (e.g., "crabmail.ai" from "lola@23blocks.crabmail.ai")
  const [, domain] = destinationAddress.split("@");
  const providerDomain = domain.split(".").slice(1).join("."); // "23blocks.crabmail.ai" → "crabmail.ai"

  const registration = registrations.find(r =>
    r.api_url.includes(providerDomain) ||
    r.address.endsWith(providerDomain)
  );

  if (!registration) {
    throw new Error(
      `Not registered with provider for ${destinationAddress}. ` +
      `Run: aimaestro register crabmail --agent ${agent.name}`
    );
  }

  return {
    agent,
    to: destinationAddress,
    isLocal: false,
    registration,
    fromAddress: registration.address, // Use external address as "from"
    shouldSign: true,
  };
}

// =============================================================================
// Key Management
// =============================================================================

export interface KeyPair {
  privatePem: string;
  publicPem: string;
  publicHex: string;
  fingerprint: string;
}

/**
 * Generate new Ed25519 keypair for an agent
 * (Implementation uses openssl or Node crypto)
 */
export async function generateKeyPair(): Promise<KeyPair> {
  // Implementation would use:
  // - Node.js: crypto.generateKeyPairSync('ed25519', ...)
  // - CLI: openssl genpkey -algorithm Ed25519
  throw new Error("Not implemented - see implementation file");
}

/**
 * Calculate fingerprint from public key
 */
export function calculateFingerprint(publicKeyHex: string): string {
  // SHA256 hash of the public key, formatted as "SHA256:base64..."
  throw new Error("Not implemented - see implementation file");
}

// =============================================================================
// Directory Structure Example
// =============================================================================

/**
 * Example directory structure for an AI Maestro instance with 2 agents:
 *
 * ~/.aimaestro/
 * ├── config.json                          # Instance config
 * │   {
 * │     "instance_id": "inst_abc123",
 * │     "hostname": "juans-macbook",
 * │     "default_tenant": "juans-workspace",
 * │     "port": 23000,
 * │     "plugins": ["crabmail"]
 * │   }
 * │
 * ├── agents/
 * │   ├── registry.json                    # Which agents are here
 * │   │   {
 * │   │     "agents": [
 * │   │       {"id": "agt_111", "name": "backend-api", "active": true},
 * │   │       {"id": "agt_222", "name": "frontend-dev", "active": true}
 * │   │     ]
 * │   │   }
 * │   │
 * │   ├── agt_111/                         # Agent: backend-api
 * │   │   ├── identity.json
 * │   │   │   {
 * │   │   │     "id": "agt_111",
 * │   │   │     "name": "backend-api",
 * │   │   │     "tenant": "juans-workspace",
 * │   │   │     "address": "backend-api@juans-workspace.aimaestro.local",
 * │   │   │     "fingerprint": "SHA256:xK4f2jQ...",
 * │   │   │     "public_key_hex": "a1b2c3...",
 * │   │   │     "key_algorithm": "Ed25519",
 * │   │   │     "created_at": "2026-01-01T10:00:00Z"
 * │   │   │   }
 * │   │   ├── keys/
 * │   │   │   ├── private.pem              # Agent's private key
 * │   │   │   └── public.pem               # Agent's public key
 * │   │   ├── registrations/
 * │   │   │   └── crabmail.json            # Crabmail registration
 * │   │   │       {
 * │   │   │         "provider": "crabmail",
 * │   │   │         "address": "backend-api@23blocks.crabmail.ai",
 * │   │   │         "api_key": "amp_live_sk_...",
 * │   │   │         "fingerprint": "SHA256:xK4f2jQ..."  // Same!
 * │   │   │       }
 * │   │   └── messages/
 * │   │       ├── inbox/
 * │   │       │   └── msg_123.json
 * │   │       └── sent/
 * │   │           └── msg_456.json
 * │   │
 * │   └── agt_222/                         # Agent: frontend-dev
 * │       ├── identity.json
 * │       ├── keys/
 * │       │   ├── private.pem
 * │       │   └── public.pem
 * │       └── messages/
 * │           ├── inbox/
 * │           └── sent/
 * │
 * └── plugins/
 *     └── crabmail/
 *         └── plugin.json                  # Plugin manifest (instance-level)
 */
