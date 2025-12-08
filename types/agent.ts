/**
 * Agent Entity - First-class citizen in AI Maestro
 *
 * An Agent represents a persistent AI worker with identity, tools, and capabilities.
 * Sessions, messages, and other resources belong to agents.
 */

export interface Agent {
  // Identity
  id: string                    // Unique identifier (UUID or slug)
  alias: string                 // Short memorable name (e.g., "ProngHub")
  displayName?: string          // Optional full name (e.g., "ProngHub Notification Agent")
  avatar?: string               // Avatar URL or emoji (e.g., "🤖", "https://...")

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

export interface EmailTool {
  address: string               // Email address (e.g., "pronghub@aimaestro.local")
  provider: 'local' | 'smtp'    // Email provider
  enabled: boolean
  // Additional config can be added later
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
  alias: string
  displayName?: string
  avatar?: string               // Avatar URL or emoji
  status: AgentStatus
  lastActive: string
  currentSession?: string       // Current tmux session name if running
  deployment?: AgentDeployment  // Deployment configuration (needed for icon display)
}

/**
 * Agent creation request
 */
export interface CreateAgentRequest {
  alias: string
  displayName?: string
  avatar?: string
  program: string
  model?: string
  taskDescription: string
  tags?: string[]
  workingDirectory?: string
  createSession?: boolean       // Auto-create tmux session
  deploymentType?: DeploymentType // Where to deploy (local or cloud)
  owner?: string
  team?: string
  documentation?: AgentDocumentation
  metadata?: Record<string, any>
}

/**
 * Agent update request
 */
export interface UpdateAgentRequest {
  alias?: string
  displayName?: string
  avatar?: string
  model?: string
  taskDescription?: string
  tags?: string[]
  owner?: string
  team?: string
  documentation?: Partial<AgentDocumentation>
  metadata?: Record<string, any>
  preferences?: Partial<AgentPreferences>
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
 * Live session status for unified agent view
 */
export interface AgentSessionStatus {
  status: 'online' | 'offline'
  tmuxSessionName?: string        // Actual tmux session name if online
  workingDirectory?: string       // Current working directory
  hostId?: string                 // Host identifier (for remote sessions)
  hostName?: string               // Human-readable host name
  lastActivity?: string           // Last activity timestamp (ISO)
  windows?: number                // Number of tmux windows
}

/**
 * Unified Agent - Agent with live session status merged
 * Used by the agent-centric sidebar
 */
export interface UnifiedAgent extends Agent {
  session: AgentSessionStatus
  isOrphan: boolean               // True if session exists but agent was auto-registered
}
