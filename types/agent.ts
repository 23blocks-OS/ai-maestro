/**
 * Agent Entity - First-class citizen in AI Maestro
 *
 * An Agent represents a persistent AI worker with identity, tools, and capabilities.
 * Sessions, messages, and other resources belong to agents.
 *
 * AGENT-FIRST ARCHITECTURE:
 * - Agent is the primary entity; sessions derive from agents
 * - Session names follow pattern: {agent.name} or {agent.name}_{index}
 * - An agent can have multiple sessions (multi-brain support)
 */

// ============================================================================
// Session Name Helpers
// ============================================================================

/**
 * Parse tmux session name to extract agent name and session index
 * Examples:
 *   "website" → { agentName: "website", index: 0 }
 *   "website_0" → { agentName: "website", index: 0 }
 *   "website_1" → { agentName: "website", index: 1 }
 *   "23blocks-apps-backend" → { agentName: "23blocks-apps-backend", index: 0 }
 *   "23blocks-apps-backend_2" → { agentName: "23blocks-apps-backend", index: 2 }
 */
export function parseSessionName(tmuxName: string): { agentName: string; index: number } {
  const match = tmuxName.match(/^(.+)_(\d+)$/)
  if (match) {
    return { agentName: match[1], index: parseInt(match[2], 10) }
  }
  return { agentName: tmuxName, index: 0 }
}

/**
 * Compute tmux session name from agent name and session index
 * Examples:
 *   ("website", 0) → "website"
 *   ("website", 1) → "website_1"
 *   ("23blocks-apps-backend", 0) → "23blocks-apps-backend"
 *   ("23blocks-apps-backend", 2) → "23blocks-apps-backend_2"
 */
export function computeSessionName(agentName: string, index: number): string {
  return index === 0 ? agentName : `${agentName}_${index}`
}

/**
 * Derive display info from agent name for UI hierarchy
 * Splits on hyphens to create tags + shortName
 * Examples:
 *   "website" → { tags: [], shortName: "website" }
 *   "23blocks-apps-website" → { tags: ["23blocks", "apps"], shortName: "website" }
 */
export function parseNameForDisplay(name: string): { tags: string[]; shortName: string } {
  const segments = name.split(/-/).filter(s => s.length > 0)
  if (segments.length === 1) {
    return { tags: [], shortName: segments[0] }
  }
  return {
    tags: segments.slice(0, -1),
    shortName: segments[segments.length - 1]
  }
}

// ============================================================================
// Agent Session (Multi-Brain Support)
// ============================================================================

/**
 * A single session belonging to an agent
 * Agents can have multiple sessions acting as specialized "brains"
 */
export interface AgentSession {
  index: number                     // 0, 1, 2... (0 = primary/coordinator)
  status: 'online' | 'offline'      // Runtime: is tmux session alive?
  workingDirectory?: string         // Override agent's default working directory
  role?: string                     // Future: "coordinator", "backend", "frontend"
  createdAt?: string                // When session was created
  lastActive?: string               // Last activity timestamp
}

// ============================================================================
// Agent Interface
// ============================================================================

export interface Agent {
  // Identity
  id: string                    // Unique identifier (UUID)
  name: string                  // Agent identity (e.g., "23blocks-apps-website")
  label?: string                // Optional display override (rarely used)
  avatar?: string               // Avatar URL or emoji (e.g., "🤖", "https://...")

  // Working Directory (agent-level default)
  workingDirectory?: string     // Default working directory for sessions

  // Sessions (zero or more, Phase 1: max 1)
  sessions: AgentSession[]      // Active/historical sessions for this agent

  // DEPRECATED: alias - use 'name' instead (kept temporarily for migration)
  alias?: string

  // Host (where the agent lives)
  hostId: string                // Host identifier (e.g., "local", "mac-mini")
  hostName?: string             // Human-readable host name
  hostUrl?: string              // Host URL for API/WebSocket (e.g., "http://100.80.12.6:23000")

  // Metadata
  program: string               // AI program (e.g., "Claude Code", "Aider", "Cursor")
  model?: string                // Model version (e.g., "Opus 4.1", "GPT-4")
  taskDescription: string       // What this agent is working on
  tags?: string[]               // Optional tags (e.g., ["backend", "api", "typescript"])
  capabilities?: string[]       // Technical capabilities (e.g., ["typescript", "postgres"])

  // Ownership & Team
  owner?: string                // Owner name or email
  team?: string                 // Team name (e.g., "Backend Team", "23blocks")

  // Documentation
  documentation?: AgentDocumentation

  // Performance & Cost Tracking
  metrics?: AgentMetrics

  // Custom flexible metadata
  metadata?: Record<string, any>  // User-defined key-value pairs

  // Deployment configuration
  deployment: AgentDeployment

  // Tools (what the agent uses to work)
  tools: AgentTools

  // State
  status: AgentStatus
  createdAt: string
  lastActive: string

  // Preferences
  preferences?: AgentPreferences

  // Skills (composable capabilities)
  skills?: AgentSkillsConfig

  // Hooks (event-triggered scripts)
  hooks?: Record<string, string>  // event -> script path

  // Runtime state (set by API, not persisted)
  session?: AgentSessionStatus   // Live tmux session status
  isOrphan?: boolean             // True if session exists but agent was auto-registered
  _cached?: boolean              // True if loaded from cache (remote host unreachable)
}

/**
 * Skills configuration for an agent
 * Agents can have skills from marketplaces, AI Maestro, and custom skills
 */
export interface AgentSkillsConfig {
  // Skills from Claude Code marketplaces
  marketplace: AgentMarketplaceSkill[]

  // AI Maestro built-in skills
  aiMaestro: {
    enabled: boolean              // Include AI Maestro skills?
    skills: string[]              // Which skills (default: all)
  }

  // Custom skills specific to this agent
  custom: AgentCustomSkill[]
}

/**
 * A marketplace skill installed on an agent
 */
export interface AgentMarketplaceSkill {
  id: string                      // Full skill ID (marketplace:plugin:skill)
  marketplace: string             // Source marketplace
  plugin: string                  // Source plugin
  name: string                    // Skill name
  version?: string                // Installed version
  installedAt: string             // When installed (ISO timestamp)
}

/**
 * A custom skill created for a specific agent
 */
export interface AgentCustomSkill {
  name: string                    // Skill name
  path: string                    // Relative path within agent folder
  description?: string            // Optional description
  createdAt: string               // When created
  updatedAt?: string              // When last modified
}

export type DeploymentType = 'local' | 'cloud'

export interface AgentDeployment {
  type: DeploymentType              // Where the agent is running

  // Local deployment details
  local?: {
    hostname: string                // Machine hostname
    platform: string                // OS platform (darwin, linux, win32)
  }

  // Cloud deployment details (container-based agents)
  cloud?: {
    provider: 'aws' | 'gcp' | 'digitalocean' | 'azure' | 'local-container'
    region?: string
    instanceType?: string
    instanceId?: string
    publicIp?: string
    apiEndpoint?: string
    websocketUrl: string              // WebSocket URL to container (e.g., ws://localhost:46000/term or wss://agent.aws.com/term)
    healthCheckUrl?: string           // Health check endpoint (e.g., http://localhost:46000/health)
    containerName?: string            // Docker container name
    status?: 'provisioning' | 'running' | 'stopped' | 'error'
  }
}

export interface AgentTools {
  // Session tool (tmux terminal)
  session?: SessionTool

  // Email tool (for async communication)
  email?: EmailTool

  // Cloud tool (for autonomous work)
  cloud?: CloudTool

  // Git repositories the agent works with
  repositories?: Repository[]

  // Future tools can be added here
  // slack?: SlackTool
  // github?: GitHubTool
  // etc.
}

/**
 * Git repository that an agent works with
 * Used for portable agent transfer - repos can be cloned on new hosts
 */
export interface Repository {
  name: string                    // Friendly name (e.g., "crm-api")
  remoteUrl: string               // Git remote URL (e.g., "git@github.com:23blocks/crm-api.git")
  localPath: string               // Local path where cloned (e.g., "/Users/juan/projects/crm-api")
  defaultBranch?: string          // Default branch (e.g., "main", "master")
  currentBranch?: string          // Current checked out branch
  lastCommit?: string             // Last commit hash
  lastSynced?: string             // When repo was last fetched/pulled (ISO timestamp)
  isPrimary?: boolean             // Is this the primary/main repo for the agent
}

export interface SessionTool {
  tmuxSessionName: string       // Full tmux session name (e.g., "23blocks-apps-pronghub")
  workingDirectory: string      // Preferred working directory
  status: 'running' | 'stopped'
  createdAt: string
  lastActive?: string
}

/**
 * Email address identity for an agent
 * AI Maestro stores identity only - routing/transport is handled by external gateways
 */
export interface EmailAddress {
  address: string                       // Full email: "titania@23blocks.23smartagents.com"
  primary?: boolean                     // Primary address for this agent
  displayName?: string                  // Friendly name: "Titania"
  metadata?: Record<string, string>     // Arbitrary metadata for consumers (e.g., gateway config)
}

/**
 * Email tool configuration for an agent
 * Supports multiple email addresses per agent with global uniqueness enforcement
 */
export interface EmailTool {
  enabled: boolean
  addresses: EmailAddress[]

  // DEPRECATED: Legacy single-address fields (kept for migration)
  // Remove after all agents migrated to addresses[]
  address?: string              // @deprecated Use addresses[] instead
  provider?: 'local' | 'smtp'   // @deprecated Gateway concern, not identity
}

export interface CloudTool {
  provider: 'modal' | 'aws' | 'gcp' | 'local'
  instanceId?: string
  enabled: boolean
  // Additional config can be added later
}

export interface AgentPreferences {
  defaultWorkingDirectory?: string
  autoStart?: boolean           // Auto-start session on AI Maestro startup
  notificationLevel?: 'all' | 'urgent' | 'none'
}

export interface AgentDocumentation {
  description?: string          // Detailed description of the agent's purpose
  runbook?: string              // URL to runbook or operational docs
  wiki?: string                 // URL to wiki or knowledge base
  notes?: string                // Free-form notes about the agent
  links?: Array<{               // Additional related links
    title: string
    url: string
    description?: string
  }>
}

export interface AgentMetrics {
  // Performance metrics
  totalSessions?: number        // Total sessions created
  totalMessages?: number        // Total messages sent
  totalTasksCompleted?: number  // Tasks completed (user-tracked)
  uptimeHours?: number          // Total uptime in hours
  averageResponseTime?: number  // Average response time in ms

  // Cost tracking
  totalApiCalls?: number        // Total API calls made
  totalTokensUsed?: number      // Total tokens consumed
  estimatedCost?: number        // Estimated cost in USD
  lastCostUpdate?: string       // When cost was last updated (ISO timestamp)

  // Custom performance metrics
  customMetrics?: Record<string, number | string>
}

export type AgentStatus = 'active' | 'idle' | 'offline'

/**
 * Simplified agent for listings
 */
export interface AgentSummary {
  id: string
  name: string                  // Agent identity (was alias)
  label?: string                // Optional display override (was displayName)
  avatar?: string               // Avatar URL or emoji
  hostId: string                // Host where agent lives
  hostUrl?: string              // Host URL for API calls
  status: AgentStatus
  lastActive: string
  sessions: AgentSession[]      // Session(s) with their status
  deployment?: AgentDeployment  // Deployment configuration (needed for icon display)
  // DEPRECATED: for backward compatibility during migration
  alias?: string
  displayName?: string
  currentSession?: string       // First online session name (deprecated, use sessions[0])
}

/**
 * Agent creation request
 */
export interface CreateAgentRequest {
  name: string                  // Agent identity (was alias)
  label?: string                // Optional display override (was displayName)
  avatar?: string
  program: string
  model?: string
  taskDescription: string
  tags?: string[]
  workingDirectory?: string
  createSession?: boolean       // Auto-create tmux session
  sessionIndex?: number         // Session index to create (default 0)
  deploymentType?: DeploymentType // Where to deploy (local or cloud)
  hostId?: string               // Target host for agent creation (defaults to 'local')
  owner?: string
  team?: string
  documentation?: AgentDocumentation
  metadata?: Record<string, any>
  // DEPRECATED: for backward compatibility
  alias?: string
  displayName?: string
}

/**
 * Agent update request
 */
export interface UpdateAgentRequest {
  name?: string                 // Update agent identity (was alias)
  label?: string                // Update display override (was displayName)
  avatar?: string
  model?: string
  taskDescription?: string
  tags?: string[]
  owner?: string
  team?: string
  workingDirectory?: string     // Update default working directory
  documentation?: Partial<AgentDocumentation>
  metadata?: Record<string, any>
  preferences?: Partial<AgentPreferences>
  // DEPRECATED: for backward compatibility
  alias?: string
  displayName?: string
}

/**
 * Agent metrics update request
 */
export interface UpdateAgentMetricsRequest {
  totalSessions?: number
  totalMessages?: number
  totalTasksCompleted?: number
  uptimeHours?: number
  averageResponseTime?: number
  totalApiCalls?: number
  totalTokensUsed?: number
  estimatedCost?: number
  customMetrics?: Record<string, number | string>
}

/**
 * Live session status (runtime tmux state)
 * Note: hostId/hostName/hostUrl are now on Agent directly
 */
export interface AgentSessionStatus {
  status: 'online' | 'offline'
  tmuxSessionName?: string        // Actual tmux session name if online
  workingDirectory?: string       // Current working directory
  lastActivity?: string           // Last activity timestamp (ISO)
  windows?: number                // Number of tmux windows
  // GAP6 FIX: Include host context for distributed agents
  hostId?: string                 // Host ID where session runs (e.g., 'local', 'mac-mini')
  hostName?: string               // Human-readable host name
}

/**
 * @deprecated Use Agent instead. UnifiedAgent is now just an alias.
 * Agent now includes session, isOrphan, and _cached directly.
 */
export type UnifiedAgent = Agent

/**
 * Statistics about agents from a host
 */
export interface AgentStats {
  total: number
  online: number
  offline: number
  orphans: number
  newlyRegistered: number
}

/**
 * Host information returned with agent data
 */
export interface AgentHostInfo {
  id: string
  name: string
  url?: string
  /** True if this is the host serving the dashboard */
  isSelf?: boolean
}

/**
 * Response from GET /api/agents
 * Each AI Maestro instance returns its own agents with this structure.
 * Frontend aggregates across multiple hosts.
 */
export interface AgentsApiResponse {
  agents: UnifiedAgent[]
  stats: AgentStats
  hostInfo: AgentHostInfo
}

// ============================================================================
// Email Identity Types
// ============================================================================

/**
 * Entry in the email index - maps email address to agent identity
 * Used by external gateways to build routing tables
 */
export interface EmailIndexEntry {
  agentId: string
  agentName: string
  hostId: string
  hostUrl?: string  // URL to reach the host (for federated lookups)
  displayName?: string
  primary: boolean
  metadata?: Record<string, string>
}

/**
 * Response from federated email-index query
 * Includes metadata about which hosts were queried
 */
export interface FederatedEmailIndexResponse {
  emails: EmailIndexResponse
  meta: {
    federated: true
    hostsQueried: number
    hostsSucceeded: number
    hostsFailed: string[]  // IDs of hosts that failed
    queryTime: number      // ms
  }
}

/**
 * Response from GET /api/agents/email-index
 * Maps email addresses to agent identity
 */
export type EmailIndexResponse = Record<string, EmailIndexEntry>

/**
 * Request to add an email address to an agent
 * POST /api/agents/:id/email/addresses
 */
export interface AddEmailAddressRequest {
  address: string
  displayName?: string
  primary?: boolean
  metadata?: Record<string, string>
}

/**
 * Error response when email address is already claimed
 */
export interface EmailConflictError {
  error: 'conflict'
  message: string
  claimedBy: {
    agentName: string
    hostId: string
  }
}

// ============================================================================
// Webhook Subscription Types
// ============================================================================

/**
 * Webhook event types for agent identity changes
 */
export type WebhookEventType =
  | 'agent.email.changed'
  | 'agent.created'
  | 'agent.deleted'
  | 'agent.updated'

/**
 * Webhook subscription
 */
export interface WebhookSubscription {
  id: string
  url: string
  events: WebhookEventType[]
  secret: string                    // For HMAC signature verification (hidden in API responses)
  description?: string              // Optional user description
  status?: 'active' | 'inactive'    // Webhook status based on delivery health
  createdAt: string
  lastDeliveryAt?: string
  lastDeliveryStatus?: 'success' | 'failed'
  failureCount?: number
}

/**
 * Request to create a webhook subscription
 * POST /api/webhooks
 */
export interface CreateWebhookRequest {
  url: string
  events: WebhookEventType[]
  description?: string              // Optional description
  secret?: string                   // Optional - API generates if not provided
}

/**
 * Webhook payload for email changes
 */
export interface WebhookEmailChangedPayload {
  event: 'agent.email.changed'
  timestamp: string
  agent: {
    id: string
    name: string
    hostId: string
  }
  changes: {
    added: string[]
    removed: string[]
    current: string[]
  }
}

/**
 * Webhook payload for agent lifecycle events
 */
export interface WebhookAgentPayload {
  event: 'agent.created' | 'agent.deleted' | 'agent.updated'
  timestamp: string
  agent: {
    id: string
    name: string
    hostId: string
  }
}

// ============================================================================
// Email Domains
// ============================================================================

/**
 * An email domain that agents can use for email addresses.
 * Domains are global (shared by all agents on this host).
 */
export interface EmailDomain {
  id: string                    // UUID
  domain: string                // e.g., "23smartagents.com"
  description?: string          // Optional friendly description
  createdAt: string             // ISO timestamp
  isDefault?: boolean           // Mark one as default for quick selection
}

/**
 * Request to create a new email domain
 * POST /api/domains
 */
export interface CreateDomainRequest {
  domain: string
  description?: string
  isDefault?: boolean
}
