/**
 * Agent - The core abstraction for autonomous agents
 *
 * An Agent is a cognitive entity that:
 * - Maintains its own memory (database)
 * - Has a subconscious that maintains awareness (indexing, messages)
 * - Can search its own history autonomously
 * - Operates independently without central coordination
 *
 * Philosophy:
 * - Database is a property of agent memory, not the agent itself
 * - Subconscious runs in the background, maintaining memory without conscious effort
 * - Each agent is truly autonomous and self-sufficient
 */

import { AgentDatabase, AgentDatabaseConfig } from './cozo-db'

interface AgentConfig {
  agentId: string
  workingDirectory?: string
}

interface SubconsciousConfig {
  memoryCheckInterval?: number  // How often to check for new conversations (default: 5 minutes)
  messageCheckInterval?: number // How often to check for messages (default: 2 minutes)
}

/**
 * Agent Subconscious
 *
 * Runs in the background for each agent, maintaining:
 * 1. Memory (indexes new conversation content)
 * 2. Awareness (checks for messages from other agents)
 */
interface SubconsciousStatus {
  isRunning: boolean
  startedAt: number | null
  memoryCheckInterval: number
  messageCheckInterval: number
  lastMemoryRun: number | null
  lastMessageRun: number | null
  lastMemoryResult: {
    success: boolean
    messagesProcessed?: number
    conversationsDiscovered?: number
    error?: string
  } | null
  lastMessageResult: {
    success: boolean
    unreadCount?: number
    error?: string
  } | null
  totalMemoryRuns: number
  totalMessageRuns: number
}

class AgentSubconscious {
  private agentId: string
  private agent: Agent
  private memoryTimer: NodeJS.Timeout | null = null
  private messageTimer: NodeJS.Timeout | null = null
  private isRunning = false
  private memoryCheckInterval: number
  private messageCheckInterval: number

  // Status tracking
  private startedAt: number | null = null
  private lastMemoryRun: number | null = null
  private lastMessageRun: number | null = null
  private lastMemoryResult: SubconsciousStatus['lastMemoryResult'] = null
  private lastMessageResult: SubconsciousStatus['lastMessageResult'] = null
  private totalMemoryRuns = 0
  private totalMessageRuns = 0

  constructor(agentId: string, agent: Agent, config: SubconsciousConfig = {}) {
    this.agentId = agentId
    this.agent = agent
    // Increased intervals to reduce system load with many agents
    this.memoryCheckInterval = config.memoryCheckInterval || 15 * 60 * 1000  // 15 minutes (was 5)
    this.messageCheckInterval = config.messageCheckInterval || 5 * 60 * 1000  // 5 minutes (was 2)
  }

  /**
   * Start the subconscious processes
   */
  start() {
    if (this.isRunning) {
      console.log(`[Agent ${this.agentId.substring(0, 8)}] Subconscious already running`)
      return
    }

    console.log(`[Agent ${this.agentId.substring(0, 8)}] 🧠 Starting subconscious...`)
    console.log(`[Agent ${this.agentId.substring(0, 8)}]   - Memory maintenance: every ${this.memoryCheckInterval / 1000}s`)
    console.log(`[Agent ${this.agentId.substring(0, 8)}]   - Message checking: every ${this.messageCheckInterval / 1000}s`)

    // Start periodic memory maintenance
    this.memoryTimer = setInterval(() => {
      this.maintainMemory().catch(err => {
        console.error(`[Agent ${this.agentId.substring(0, 8)}] Memory maintenance failed:`, err)
      })
    }, this.memoryCheckInterval)

    // Start periodic message checking
    this.messageTimer = setInterval(() => {
      this.checkMessages().catch(err => {
        console.error(`[Agent ${this.agentId.substring(0, 8)}] Message check failed:`, err)
      })
    }, this.messageCheckInterval)

    // Run immediately on start
    this.maintainMemory().catch(err => {
      console.error(`[Agent ${this.agentId.substring(0, 8)}] Initial memory maintenance failed:`, err)
    })

    this.isRunning = true
    this.startedAt = Date.now()
    console.log(`[Agent ${this.agentId.substring(0, 8)}] ✓ Subconscious running`)
  }

  /**
   * Stop the subconscious
   */
  stop() {
    if (this.memoryTimer) {
      clearInterval(this.memoryTimer)
      this.memoryTimer = null
    }
    if (this.messageTimer) {
      clearInterval(this.messageTimer)
      this.messageTimer = null
    }
    this.isRunning = false
    console.log(`[Agent ${this.agentId.substring(0, 8)}] Subconscious stopped`)
  }

  /**
   * Maintain memory by indexing new conversation content
   */
  private async maintainMemory() {
    this.totalMemoryRuns++
    this.lastMemoryRun = Date.now()

    try {
      // Call the index-delta API - it handles checking if indexing is needed
      const response = await fetch(`http://localhost:23000/api/agents/${this.agentId}/index-delta`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })

      if (!response.ok) {
        this.lastMemoryResult = { success: false, error: `HTTP ${response.status}` }
        console.error(`[Agent ${this.agentId.substring(0, 8)}] Index failed: ${response.status}`)
        return
      }

      const result = await response.json()
      this.lastMemoryResult = {
        success: true,
        messagesProcessed: result.total_messages_processed || 0,
        conversationsDiscovered: result.new_conversations_discovered || 0
      }

      if (result.success && result.total_messages_processed > 0) {
        console.log(`[Agent ${this.agentId.substring(0, 8)}] ✓ Indexed ${result.total_messages_processed} new message(s)`)
      }
    } catch (error) {
      this.lastMemoryResult = { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
      console.error(`[Agent ${this.agentId.substring(0, 8)}] Memory maintenance error:`, error)
    }
  }

  /**
   * Check for incoming messages from other agents
   */
  private async checkMessages() {
    this.totalMessageRuns++
    this.lastMessageRun = Date.now()

    try {
      // Get unread messages for this agent
      const messagesResponse = await fetch(
        `http://localhost:23000/api/messages?session=${this.agentId}&box=inbox&status=unread`
      )

      if (messagesResponse.ok) {
        const messagesData = await messagesResponse.json()
        const unreadCount = messagesData.messages?.length || 0

        this.lastMessageResult = { success: true, unreadCount }

        if (unreadCount > 0) {
          console.log(`[Agent ${this.agentId.substring(0, 8)}] 📨 ${unreadCount} unread message(s)`)

          // Try to trigger message check in the agent's terminal if idle
          await this.triggerMessageCheck(unreadCount)
        }
      } else {
        this.lastMessageResult = { success: false, error: `HTTP ${messagesResponse.status}` }
      }
    } catch (error) {
      this.lastMessageResult = { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
      console.error(`[Agent ${this.agentId.substring(0, 8)}] Message check error:`, error)
    }
  }

  /**
   * Find the tmux session name associated with this agent
   */
  private async findSessionName(): Promise<string | null> {
    try {
      const sessionsResponse = await fetch('http://localhost:23000/api/sessions')
      if (!sessionsResponse.ok) return null

      const data = await sessionsResponse.json()
      const sessions = data.sessions || []

      // Find session where agentId matches
      const session = sessions.find((s: { agentId?: string }) => s.agentId === this.agentId)
      return session?.id || null
    } catch {
      return null
    }
  }

  /**
   * Trigger message check command in the terminal
   */
  private async triggerMessageCheck(unreadCount: number) {
    try {
      // Find the session name for this agent
      const sessionName = await this.findSessionName()
      if (!sessionName) {
        console.log(`[Agent ${this.agentId.substring(0, 8)}] No active session found for message notification`)
        return
      }

      // Check if session is idle and send command
      const commandResponse = await fetch(
        `http://localhost:23000/api/sessions/${encodeURIComponent(sessionName)}/command`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            command: `check-aimaestro-messages.sh`,
            requireIdle: true,
            addNewline: true
          })
        }
      )

      if (commandResponse.ok) {
        const result = await commandResponse.json()
        if (result.success) {
          console.log(`[Agent ${this.agentId.substring(0, 8)}] ✓ Triggered message check in terminal (${unreadCount} unread)`)
        }
      } else {
        const result = await commandResponse.json()
        if (result.idle === false) {
          console.log(`[Agent ${this.agentId.substring(0, 8)}] Session busy, skipping message notification`)
        }
      }
    } catch (error) {
      // Silently fail - this is a convenience feature
      console.log(`[Agent ${this.agentId.substring(0, 8)}] Could not trigger message check:`, error instanceof Error ? error.message : 'Unknown error')
    }
  }

  /**
   * Get subconscious status
   */
  getStatus(): SubconsciousStatus {
    return {
      isRunning: this.isRunning,
      startedAt: this.startedAt,
      memoryCheckInterval: this.memoryCheckInterval,
      messageCheckInterval: this.messageCheckInterval,
      lastMemoryRun: this.lastMemoryRun,
      lastMessageRun: this.lastMessageRun,
      lastMemoryResult: this.lastMemoryResult,
      lastMessageResult: this.lastMessageResult,
      totalMemoryRuns: this.totalMemoryRuns,
      totalMessageRuns: this.totalMessageRuns
    }
  }
}

// Export the status type
export type { SubconsciousStatus }

/**
 * Agent - The core abstraction for autonomous agents
 */
export class Agent {
  private agentId: string
  private config: AgentConfig
  private database: AgentDatabase | null = null
  private subconscious: AgentSubconscious | null = null
  private initialized = false

  constructor(config: AgentConfig) {
    this.agentId = config.agentId
    this.config = config
  }

  /**
   * Initialize the agent (database + subconscious)
   */
  async initialize(subconsciousConfig?: SubconsciousConfig): Promise<void> {
    if (this.initialized) {
      console.log(`[Agent ${this.agentId.substring(0, 8)}] Already initialized`)
      return
    }

    console.log(`[Agent ${this.agentId.substring(0, 8)}] Initializing...`)

    // Initialize database (agent's memory)
    this.database = new AgentDatabase({
      agentId: this.agentId,
      workingDirectory: this.config.workingDirectory
    })
    await this.database.initialize()

    // Start subconscious (background awareness)
    this.subconscious = new AgentSubconscious(this.agentId, this, subconsciousConfig)
    this.subconscious.start()

    this.initialized = true
    console.log(`[Agent ${this.agentId.substring(0, 8)}] ✓ Initialized`)
  }

  /**
   * Shutdown the agent (stop subconscious, close database)
   */
  async shutdown(): Promise<void> {
    console.log(`[Agent ${this.agentId.substring(0, 8)}] Shutting down...`)

    // Stop subconscious
    if (this.subconscious) {
      this.subconscious.stop()
      this.subconscious = null
    }

    // Close database
    if (this.database) {
      await this.database.close()
      this.database = null
    }

    this.initialized = false
    console.log(`[Agent ${this.agentId.substring(0, 8)}] ✓ Shutdown complete`)
  }

  /**
   * Get the agent's database
   */
  async getDatabase(): Promise<AgentDatabase> {
    if (!this.database) {
      throw new Error(`Agent ${this.agentId} not initialized`)
    }
    return this.database
  }

  /**
   * Get the agent's subconscious
   */
  getSubconscious(): AgentSubconscious | null {
    return this.subconscious
  }

  /**
   * Get agent ID
   */
  getAgentId(): string {
    return this.agentId
  }

  /**
   * Get agent status
   */
  getStatus() {
    return {
      agentId: this.agentId,
      initialized: this.initialized,
      database: this.database ? 'connected' : 'disconnected',
      subconscious: this.subconscious?.getStatus() || null
    }
  }

  /**
   * Get agent config
   */
  getConfig(): AgentConfig {
    return this.config
  }
}

/**
 * Agent Registry - Manages agent lifecycle
 *
 * This singleton keeps track of all active agents and ensures
 * proper initialization/shutdown
 */
class AgentRegistry {
  private agents = new Map<string, Agent>()

  /**
   * Get or create an agent
   */
  async getAgent(agentId: string, config?: AgentConfig): Promise<Agent> {
    let agent = this.agents.get(agentId)

    if (!agent) {
      // Create new agent
      agent = new Agent({
        agentId,
        workingDirectory: config?.workingDirectory
      })
      await agent.initialize()
      this.agents.set(agentId, agent)
    }

    return agent
  }

  /**
   * Get an existing agent (without creating)
   */
  getExistingAgent(agentId: string): Agent | undefined {
    return this.agents.get(agentId)
  }

  /**
   * Shutdown an agent
   */
  async shutdownAgent(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId)
    if (agent) {
      await agent.shutdown()
      this.agents.delete(agentId)
    }
  }

  /**
   * Shutdown all agents
   */
  async shutdownAll(): Promise<void> {
    console.log('[AgentRegistry] Shutting down all agents...')
    const shutdownPromises = Array.from(this.agents.values()).map(agent => agent.shutdown())
    await Promise.all(shutdownPromises)
    this.agents.clear()
    console.log('[AgentRegistry] ✓ All agents shutdown')
  }

  /**
   * Get all active agents
   */
  getAllAgents(): Agent[] {
    return Array.from(this.agents.values())
  }

  /**
   * Get registry status
   */
  getStatus() {
    return {
      activeAgents: this.agents.size,
      agents: Array.from(this.agents.values()).map(agent => agent.getStatus())
    }
  }

  /**
   * Get global subconscious status (summary across all agents)
   */
  getGlobalSubconsciousStatus() {
    const agents = Array.from(this.agents.values())
    const subconsciousStatuses = agents
      .map(agent => ({
        agentId: agent.getAgentId(),
        status: agent.getSubconscious()?.getStatus() || null
      }))
      .filter(s => s.status !== null)

    const runningCount = subconsciousStatuses.filter(s => s.status?.isRunning).length
    const totalMemoryRuns = subconsciousStatuses.reduce((sum, s) => sum + (s.status?.totalMemoryRuns || 0), 0)
    const totalMessageRuns = subconsciousStatuses.reduce((sum, s) => sum + (s.status?.totalMessageRuns || 0), 0)

    // Find the most recent runs across all agents
    let lastMemoryRun: number | null = null
    let lastMessageRun: number | null = null
    let lastMemoryResult: SubconsciousStatus['lastMemoryResult'] = null
    let lastMessageResult: SubconsciousStatus['lastMessageResult'] = null

    for (const s of subconsciousStatuses) {
      if (s.status?.lastMemoryRun && (!lastMemoryRun || s.status.lastMemoryRun > lastMemoryRun)) {
        lastMemoryRun = s.status.lastMemoryRun
        lastMemoryResult = s.status.lastMemoryResult
      }
      if (s.status?.lastMessageRun && (!lastMessageRun || s.status.lastMessageRun > lastMessageRun)) {
        lastMessageRun = s.status.lastMessageRun
        lastMessageResult = s.status.lastMessageResult
      }
    }

    return {
      activeAgents: this.agents.size,
      runningSubconscious: runningCount,
      totalMemoryRuns,
      totalMessageRuns,
      lastMemoryRun,
      lastMessageRun,
      lastMemoryResult,
      lastMessageResult,
      agents: subconsciousStatuses
    }
  }
}

// Singleton instance using globalThis to ensure it's shared across Next.js API routes
// This is necessary because Next.js may create separate module contexts
declare global {
  // eslint-disable-next-line no-var
  var _agentRegistry: AgentRegistry | undefined
}

if (!globalThis._agentRegistry) {
  globalThis._agentRegistry = new AgentRegistry()
}

export const agentRegistry = globalThis._agentRegistry
