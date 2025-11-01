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

  // Metadata
  program: string               // AI program (e.g., "Claude Code", "Aider", "Cursor")
  model?: string                // Model version (e.g., "Opus 4.1", "GPT-4")
  taskDescription: string       // What this agent is working on
  tags?: string[]               // Optional tags (e.g., ["backend", "api", "typescript"])
  capabilities?: string[]       // Technical capabilities (e.g., ["typescript", "postgres"])

  // Tools (what the agent uses to work)
  tools: AgentTools

  // State
  status: AgentStatus
  createdAt: string
  lastActive: string

  // Preferences
  preferences?: AgentPreferences
}

export interface AgentTools {
  // Session tool (tmux terminal)
  session?: SessionTool

  // Email tool (for async communication)
  email?: EmailTool

  // Cloud tool (for autonomous work)
  cloud?: CloudTool

  // Future tools can be added here
  // slack?: SlackTool
  // github?: GitHubTool
  // etc.
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

export type AgentStatus = 'active' | 'idle' | 'offline'

/**
 * Simplified agent for listings
 */
export interface AgentSummary {
  id: string
  alias: string
  displayName?: string
  status: AgentStatus
  lastActive: string
  currentSession?: string       // Current tmux session name if running
}

/**
 * Agent creation request
 */
export interface CreateAgentRequest {
  alias: string
  displayName?: string
  program: string
  model?: string
  taskDescription: string
  tags?: string[]
  workingDirectory?: string
  createSession?: boolean       // Auto-create tmux session
}

/**
 * Agent update request
 */
export interface UpdateAgentRequest {
  alias?: string
  displayName?: string
  model?: string
  taskDescription?: string
  tags?: string[]
  preferences?: Partial<AgentPreferences>
}
