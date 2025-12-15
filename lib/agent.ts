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
import { hostHints } from './host-hints'

interface AgentConfig {
  agentId: string
  workingDirectory?: string
}

interface SubconsciousConfig {
  memoryCheckInterval?: number  // How often to check for new conversations (default: 5 minutes)
  messageCheckInterval?: number // How often to check for messages (default: 2 minutes)
}

// Activity-based interval configuration
const ACTIVITY_INTERVALS = {
  active: 5 * 60 * 1000,        // 5 min when actively used
  idle: 30 * 60 * 1000,         // 30 min when idle
  disconnected: 60 * 60 * 1000  // 60 min when no session connected
}

// Type for host hints (optional optimization from AI Maestro host)
export type HostHintType = 'run_now' | 'skip' | 'idle_transition'

export interface HostHint {
  type: HostHintType
  agentId: string
  timestamp: number
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
  activityState: 'active' | 'idle' | 'disconnected'
  staggerOffset: number
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

// Static counter for staggering initial runs across all agents
let subconsciousInstanceCount = 0

class AgentSubconscious {
  private agentId: string
  private agent: Agent
  private memoryTimer: NodeJS.Timeout | null = null
  private messageTimer: NodeJS.Timeout | null = null
  private initialDelayTimer: NodeJS.Timeout | null = null
  private isRunning = false
  private memoryCheckInterval: number
  private messageCheckInterval: number
  private instanceNumber: number
  private staggerOffset: number

  // Activity state for adaptive intervals
  private activityState: 'active' | 'idle' | 'disconnected' = 'disconnected'

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
    // Default interval (will be adjusted based on activity)
    this.memoryCheckInterval = config.memoryCheckInterval || ACTIVITY_INTERVALS.disconnected
    this.messageCheckInterval = config.messageCheckInterval || 5 * 60 * 1000  // 5 minutes
    // Assign instance number for staggering initial runs
    this.instanceNumber = subconsciousInstanceCount++
    // Calculate stagger offset based on agentId hash (consistent across restarts)
    this.staggerOffset = this.calculateStaggerOffset()
  }

  /**
   * Calculate stagger offset based on agentId hash
   * This ensures consistent spreading of agents across time
   */
  private calculateStaggerOffset(): number {
    // Hash the agentId to get a consistent number
    const hash = this.agentId.split('').reduce(
      (acc, char) => char.charCodeAt(0) + ((acc << 5) - acc), 0
    )
    // Spread across 5 minutes (300 seconds) to avoid clustering
    const maxOffset = 5 * 60 * 1000 // 5 minutes
    return Math.abs(hash) % maxOffset
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
    console.log(`[Agent ${this.agentId.substring(0, 8)}]   - Stagger offset: ${Math.round(this.staggerOffset / 1000)}s`)
    console.log(`[Agent ${this.agentId.substring(0, 8)}]   - Memory interval: ${this.memoryCheckInterval / 60000} min (${this.activityState})`)
    console.log(`[Agent ${this.agentId.substring(0, 8)}]   - Message interval: ${this.messageCheckInterval / 60000} min`)

    // Run first message check immediately (lightweight, no stagger needed)
    this.checkMessages().catch(err => {
      console.error(`[Agent ${this.agentId.substring(0, 8)}] Initial message check failed:`, err)
    })

    // Start periodic message checking
    this.messageTimer = setInterval(() => {
      this.checkMessages().catch(err => {
        console.error(`[Agent ${this.agentId.substring(0, 8)}] Message check failed:`, err)
      })
    }, this.messageCheckInterval)

    // Start memory maintenance with stagger offset
    // First run is delayed by staggerOffset, then runs on interval
    this.initialDelayTimer = setTimeout(() => {
      // Run first memory maintenance
      this.maintainMemory().catch(err => {
        console.error(`[Agent ${this.agentId.substring(0, 8)}] Initial memory maintenance failed:`, err)
      })

      // Start the regular interval timer
      this.memoryTimer = setInterval(() => {
        this.maintainMemory().catch(err => {
          console.error(`[Agent ${this.agentId.substring(0, 8)}] Memory maintenance failed:`, err)
        })
      }, this.memoryCheckInterval)
    }, this.staggerOffset)

    this.isRunning = true
    this.startedAt = Date.now()

    // Subscribe to host hints (optional optimization)
    // If host hints aren't available, agent continues running with its own timers
    try {
      hostHints.subscribe(this.agentId, (hint) => this.handleHostHint(hint))
      console.log(`[Agent ${this.agentId.substring(0, 8)}] ✓ Subscribed to host hints`)
    } catch (e) {
      // Host hints not available - agent runs independently (this is fine)
      console.log(`[Agent ${this.agentId.substring(0, 8)}] Host hints not available - running autonomously`)
    }

    console.log(`[Agent ${this.agentId.substring(0, 8)}] ✓ Subconscious running (first memory check in ${Math.round(this.staggerOffset / 1000)}s)`)
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
    if (this.initialDelayTimer) {
      clearTimeout(this.initialDelayTimer)
      this.initialDelayTimer = null
    }

    // Unsubscribe from host hints
    try {
      hostHints.unsubscribe(this.agentId)
    } catch {
      // Host hints not available - that's fine
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
      // First, find the session name - messages are organized by session name, not agentId
      const sessionName = await this.findSessionName()
      if (!sessionName) {
        // No active session, skip message check
        this.lastMessageResult = { success: true, unreadCount: 0 }
        return
      }

      // Get unread messages for this session
      const messagesResponse = await fetch(
        `http://localhost:23000/api/messages?agent=${encodeURIComponent(sessionName)}&box=inbox&status=unread`
      )

      if (messagesResponse.ok) {
        const messagesData = await messagesResponse.json()
        const unreadCount = messagesData.messages?.length || 0

        this.lastMessageResult = { success: true, unreadCount }

        if (unreadCount > 0) {
          console.log(`[Agent ${this.agentId.substring(0, 8)}] 📨 ${unreadCount} unread message(s)`)

          // Try to trigger message check in the agent's terminal if idle
          // Pass message summaries so we can craft a helpful prompt
          await this.triggerMessageCheck(messagesData.messages || [])
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

      // First, try to find session where agentId matches
      let session = sessions.find((s: { agentId?: string }) => s.agentId === this.agentId)

      // If not found, try matching by session name/id (for agents whose ID is the session name)
      if (!session) {
        session = sessions.find((s: { id?: string; name?: string }) =>
          s.id === this.agentId || s.name === this.agentId
        )
      }

      return session?.id || null
    } catch {
      return null
    }
  }

  /**
   * Trigger message notification in Claude Code's prompt
   * Sends a natural language prompt that Claude will understand and act on
   */
  private async triggerMessageCheck(messages: Array<{ from?: string; subject?: string; priority?: string }>) {
    try {
      // Find the session name for this agent
      const sessionName = await this.findSessionName()
      if (!sessionName) {
        console.log(`[Agent ${this.agentId.substring(0, 8)}] No active session found for message notification`)
        return
      }

      // Craft a natural language prompt for Claude Code
      const unreadCount = messages.length
      let prompt: string

      if (unreadCount === 1) {
        const msg = messages[0]
        const fromInfo = msg.from ? ` from ${msg.from}` : ''
        const subjectInfo = msg.subject ? ` about "${msg.subject}"` : ''
        const urgentFlag = msg.priority === 'urgent' ? ' [URGENT]' : ''
        prompt = `${urgentFlag}You have a new message${fromInfo}${subjectInfo}. Please check your inbox.`
      } else {
        // Multiple messages - summarize
        const urgentCount = messages.filter(m => m.priority === 'urgent').length
        const senders = [...new Set(messages.map(m => m.from).filter(Boolean))].slice(0, 3)
        const sendersInfo = senders.length > 0 ? ` from ${senders.join(', ')}${senders.length < messages.length ? ' and others' : ''}` : ''
        const urgentFlag = urgentCount > 0 ? ` [${urgentCount} URGENT]` : ''
        prompt = `${urgentFlag}You have ${unreadCount} new messages${sendersInfo}. Please check your inbox.`
      }

      // Send the natural language prompt to Claude Code
      const commandResponse = await fetch(
        `http://localhost:23000/api/sessions/${encodeURIComponent(sessionName)}/command`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            command: prompt.trim(),
            requireIdle: true,
            addNewline: true  // Press Enter to submit the prompt to Claude
          })
        }
      )

      if (commandResponse.ok) {
        const result = await commandResponse.json()
        if (result.success) {
          console.log(`[Agent ${this.agentId.substring(0, 8)}] ✓ Sent message notification to Claude (${unreadCount} unread)`)
        }
      } else {
        const result = await commandResponse.json()
        if (result.idle === false) {
          console.log(`[Agent ${this.agentId.substring(0, 8)}] Session busy, skipping message notification`)
        }
      }
    } catch (error) {
      // Silently fail - this is a convenience feature
      console.log(`[Agent ${this.agentId.substring(0, 8)}] Could not send message notification:`, error instanceof Error ? error.message : 'Unknown error')
    }
  }

  /**
   * Set activity state and adjust intervals accordingly
   * Called by the host when session activity changes
   */
  setActivityState(state: 'active' | 'idle' | 'disconnected') {
    const prevState = this.activityState
    this.activityState = state

    // Trigger immediate index on idle transition (good time to catch up)
    if (prevState === 'active' && state === 'idle') {
      console.log(`[Agent ${this.agentId.substring(0, 8)}] Session went idle - triggering memory maintenance`)
      this.maintainMemory().catch(err => {
        console.error(`[Agent ${this.agentId.substring(0, 8)}] Idle transition maintenance failed:`, err)
      })
    }

    // Update interval based on new activity state
    const newInterval = ACTIVITY_INTERVALS[state]
    if (newInterval !== this.memoryCheckInterval) {
      console.log(`[Agent ${this.agentId.substring(0, 8)}] Activity: ${prevState} -> ${state}, interval: ${newInterval / 60000} min`)
      this.memoryCheckInterval = newInterval
      this.rescheduleMemoryTimer()
    }
  }

  /**
   * Get current activity state
   */
  getActivityState(): 'active' | 'idle' | 'disconnected' {
    return this.activityState
  }

  /**
   * Reschedule memory timer with new interval
   */
  private rescheduleMemoryTimer() {
    if (!this.isRunning) return

    // Clear existing timer
    if (this.memoryTimer) {
      clearInterval(this.memoryTimer)
      this.memoryTimer = null
    }

    // Start new timer with updated interval
    this.memoryTimer = setInterval(() => {
      this.maintainMemory().catch(err => {
        console.error(`[Agent ${this.agentId.substring(0, 8)}] Memory maintenance failed:`, err)
      })
    }, this.memoryCheckInterval)
  }

  /**
   * Handle host hints (optional optimization)
   * Agent works fine without these - they're just optimization hints
   */
  handleHostHint(hint: HostHint) {
    if (hint.agentId !== this.agentId) return

    switch (hint.type) {
      case 'idle_transition':
        // Session just went idle - good time to index
        console.log(`[Agent ${this.agentId.substring(0, 8)}] Host hint: idle_transition`)
        this.setActivityState('idle')
        break

      case 'run_now':
        // Host says it's a good time to run
        console.log(`[Agent ${this.agentId.substring(0, 8)}] Host hint: run_now`)
        this.maintainMemory().catch(err => {
          console.error(`[Agent ${this.agentId.substring(0, 8)}] Hint-triggered maintenance failed:`, err)
        })
        break

      case 'skip':
        // Host is busy - we'll just wait for next interval
        // (no action needed, just don't run)
        console.log(`[Agent ${this.agentId.substring(0, 8)}] Host hint: skip (will wait for next interval)`)
        break
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
      activityState: this.activityState,
      staggerOffset: this.staggerOffset,
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
