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
import { getAgent as getAgentFromRegistry } from './agent-registry'
import { getSelfHost } from './hosts-config'
import { computeSessionName } from '@/types/agent'

import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

// Get this host's API base URL from configuration
function getSelfApiBase(): string {
  const selfHost = getSelfHost()
  return selfHost?.url || 'http://localhost:23000'
}

interface AgentConfig {
  agentId: string
  workingDirectory?: string
}

interface SubconsciousConfig {
  memoryCheckInterval?: number  // How often to check for new conversations (default: 5 minutes)
  messageCheckInterval?: number // How often to check for messages (default: 2 minutes)
  consolidationEnabled?: boolean // Enable long-term memory consolidation (default: true)
  consolidationHour?: number    // Hour of day to run consolidation (default: 2 = 2 AM)
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
  // Cumulative stats (accumulated across this session)
  cumulativeMessagesIndexed: number
  cumulativeConversationsIndexed: number
  // Long-term memory consolidation
  consolidation: {
    enabled: boolean
    scheduledHour: number
    lastRun: number | null
    nextRun: number | null
    lastResult: {
      success: boolean
      memoriesCreated?: number
      memoriesReinforced?: number
      memoriesLinked?: number
      conversationsProcessed?: number
      durationMs?: number
      providerUsed?: string
      error?: string
    } | null
    totalRuns: number
  }
}

// Static counter for staggering initial runs across all agents
let subconsciousInstanceCount = 0

class AgentSubconscious {
  private agentId: string
  private agent: Agent
  private memoryTimer: NodeJS.Timeout | null = null
  private messageTimer: NodeJS.Timeout | null = null
  private consolidationTimer: NodeJS.Timeout | null = null
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
  // Cumulative stats (accumulated across this session)
  private cumulativeMessagesIndexed = 0
  private cumulativeConversationsIndexed = 0

  // Long-term memory consolidation
  private consolidationEnabled: boolean
  private consolidationHour: number
  private lastConsolidationRun: number | null = null
  private nextConsolidationRun: number | null = null
  private lastConsolidationResult: SubconsciousStatus['consolidation']['lastResult'] = null
  private totalConsolidationRuns = 0

  constructor(agentId: string, agent: Agent, config: SubconsciousConfig = {}) {
    this.agentId = agentId
    this.agent = agent
    // Default interval (will be adjusted based on activity)
    this.memoryCheckInterval = config.memoryCheckInterval || ACTIVITY_INTERVALS.disconnected
    this.messageCheckInterval = config.messageCheckInterval || 5 * 60 * 1000  // 5 minutes
    // Long-term memory consolidation config
    this.consolidationEnabled = config.consolidationEnabled !== false  // Default: enabled
    this.consolidationHour = config.consolidationHour ?? 2  // Default: 2 AM
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

    // Schedule long-term memory consolidation
    if (this.consolidationEnabled) {
      this.scheduleConsolidation()
    }

    console.log(`[Agent ${this.agentId.substring(0, 8)}] ✓ Subconscious running (first memory check in ${Math.round(this.staggerOffset / 1000)}s)`)

    // Write initial status file
    this.writeStatusFile()
  }

  /**
   * Schedule next consolidation run
   */
  private scheduleConsolidation() {
    // Calculate time until next scheduled consolidation
    const now = new Date()
    const nextRun = new Date(now)
    nextRun.setHours(this.consolidationHour, 0, 0, 0)

    // If we've already passed the scheduled hour today, schedule for tomorrow
    if (now >= nextRun) {
      nextRun.setDate(nextRun.getDate() + 1)
    }

    // Add stagger offset to prevent all agents from running at once
    const staggerMinutes = Math.abs(this.agentId.split('').reduce(
      (acc, char) => char.charCodeAt(0) + ((acc << 5) - acc), 0
    )) % 30  // Spread across 30 minutes
    nextRun.setMinutes(staggerMinutes)

    const timeUntilRun = nextRun.getTime() - now.getTime()
    this.nextConsolidationRun = nextRun.getTime()

    console.log(`[Agent ${this.agentId.substring(0, 8)}] 📚 Consolidation scheduled for ${nextRun.toLocaleTimeString()} (in ${Math.round(timeUntilRun / 60000)} min)`)

    // Clear existing timer
    if (this.consolidationTimer) {
      clearTimeout(this.consolidationTimer)
    }

    // Set timer for consolidation
    this.consolidationTimer = setTimeout(() => {
      this.runConsolidation().catch(err => {
        console.error(`[Agent ${this.agentId.substring(0, 8)}] Consolidation failed:`, err)
      }).finally(() => {
        // Schedule next run after this one completes
        if (this.isRunning && this.consolidationEnabled) {
          this.scheduleConsolidation()
        }
      })
    }, timeUntilRun)
  }

  /**
   * Run memory consolidation
   * Extracts long-term memories from recent conversations
   */
  private async runConsolidation() {
    this.totalConsolidationRuns++
    this.lastConsolidationRun = Date.now()
    const startTime = Date.now()

    console.log(`[Agent ${this.agentId.substring(0, 8)}] 📚 Running memory consolidation...`)

    try {
      // Call the consolidation API endpoint
      const response = await fetch(`${getSelfApiBase()}/api/agents/${this.agentId}/memory/consolidate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })

      if (!response.ok) {
        this.lastConsolidationResult = { success: false, error: `HTTP ${response.status}` }
        console.error(`[Agent ${this.agentId.substring(0, 8)}] Consolidation failed: ${response.status}`)
        return
      }

      const result = await response.json()

      this.lastConsolidationResult = {
        success: result.status !== 'failed',
        memoriesCreated: result.memories_created || 0,
        memoriesReinforced: result.memories_reinforced || 0,
        memoriesLinked: result.memories_linked || 0,
        conversationsProcessed: result.conversations_processed || 0,
        durationMs: Date.now() - startTime,
        providerUsed: result.provider_used || 'unknown',
        error: result.errors?.length > 0 ? result.errors.join('; ') : undefined
      }

      console.log(`[Agent ${this.agentId.substring(0, 8)}] ✓ Consolidation complete: ${result.memories_created} created, ${result.memories_reinforced} reinforced (${result.provider_used})`)
    } catch (error) {
      this.lastConsolidationResult = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        durationMs: Date.now() - startTime
      }
      console.error(`[Agent ${this.agentId.substring(0, 8)}] Consolidation error:`, error)
    }

    // Update status file after consolidation
    this.writeStatusFile()
  }

  /**
   * Manually trigger consolidation (for testing or on-demand)
   */
  async triggerConsolidation(): Promise<SubconsciousStatus['consolidation']['lastResult']> {
    await this.runConsolidation()
    return this.lastConsolidationResult
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
    if (this.consolidationTimer) {
      clearTimeout(this.consolidationTimer)
      this.consolidationTimer = null
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

    // Write final status file (marks as not running)
    this.writeStatusFile()
  }

  /**
   * Maintain memory by indexing new conversation content
   */
  private async maintainMemory() {
    this.totalMemoryRuns++
    this.lastMemoryRun = Date.now()

    try {
      // Call the index-delta API - it handles checking if indexing is needed
      const response = await fetch(`${getSelfApiBase()}/api/agents/${this.agentId}/index-delta`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })

      if (!response.ok) {
        this.lastMemoryResult = { success: false, error: `HTTP ${response.status}` }
        console.error(`[Agent ${this.agentId.substring(0, 8)}] Index failed: ${response.status}`)
        return
      }

      const result = await response.json()
      const messagesProcessed = result.total_messages_processed || 0
      const conversationsDiscovered = result.new_conversations_discovered || 0

      // Accumulate cumulative totals
      this.cumulativeMessagesIndexed += messagesProcessed
      this.cumulativeConversationsIndexed += conversationsDiscovered

      this.lastMemoryResult = {
        success: true,
        messagesProcessed,
        conversationsDiscovered
      }

      if (result.success && messagesProcessed > 0) {
        console.log(`[Agent ${this.agentId.substring(0, 8)}] ✓ Indexed ${messagesProcessed} new message(s) (cumulative: ${this.cumulativeMessagesIndexed})`)
      }
    } catch (error) {
      this.lastMemoryResult = { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
      console.error(`[Agent ${this.agentId.substring(0, 8)}] Memory maintenance error:`, error)
    }

    // Update status file after memory run
    this.writeStatusFile()
  }

  /**
   * Check for incoming messages from other agents
   * Agent-first: Always query by agent ID, not session name
   */
  private async checkMessages() {
    this.totalMessageRuns++
    this.lastMessageRun = Date.now()

    try {
      // Query messages directly by agent ID (agent-first architecture)
      const messagesResponse = await fetch(
        `${getSelfApiBase()}/api/messages?agent=${encodeURIComponent(this.agentId)}&box=inbox&status=unread`
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

    // Update status file after message check
    this.writeStatusFile()
  }

  /**
   * Find the tmux session name associated with this agent
   * Agent-first: Use the registry agent.name + sessions array to compute session name
   */
  private async findSessionName(): Promise<string | null> {
    try {
      // Agent-first: Get agent from registry
      const registryAgent = getAgentFromRegistry(this.agentId)
      if (!registryAgent) {
        return null
      }

      // Get the agent name (primary identity)
      const agentName = registryAgent.name || (registryAgent as any).alias
      if (!agentName) {
        return null
      }

      // Get list of active tmux sessions
      const sessionsResponse = await fetch(`${getSelfApiBase()}/api/sessions`)
      if (!sessionsResponse.ok) return null

      const data = await sessionsResponse.json()
      const activeSessions = data.sessions || []

      // Check registry sessions to find an active one
      const registrySessions = registryAgent.sessions || []

      for (const regSession of registrySessions) {
        // Compute what the tmux session name should be
        const expectedSessionName = computeSessionName(agentName, regSession.index)

        // Check if this session is active in tmux
        const isActive = activeSessions.some((s: { id?: string; name?: string }) =>
          s.id === expectedSessionName || s.name === expectedSessionName
        )

        if (isActive) {
          return expectedSessionName
        }
      }

      // If no registry sessions, try the base agent name directly
      // This handles agents that may have been created without explicit sessions
      const directMatch = activeSessions.find((s: { id?: string; name?: string }) =>
        s.id === agentName || s.name === agentName
      )

      if (directMatch) {
        return directMatch.id || directMatch.name
      }

      return null
    } catch {
      return null
    }
  }

  /**
   * Trigger message notification in Claude Code's prompt
   * Sends a natural language prompt that Claude will understand and act on
   */
  private async triggerMessageCheck(messages: Array<{
    from?: string
    fromAlias?: string
    fromHost?: string
    subject?: string
    priority?: string
  }>) {
    try {
      // Find the session name for this agent
      const sessionName = await this.findSessionName()
      if (!sessionName) {
        console.log(`[Agent ${this.agentId.substring(0, 8)}] No active session found for message notification`)
        return
      }

      // Helper to format sender info (prefer alias, include host)
      const formatSender = (msg: { from?: string; fromAlias?: string; fromHost?: string }) => {
        const name = msg.fromAlias || msg.from?.substring(0, 8) || 'unknown'
        const host = msg.fromHost ? ` (${msg.fromHost})` : ''
        return `${name}${host}`
      }

      // Craft a natural language prompt for Claude Code
      const unreadCount = messages.length
      let prompt: string

      if (unreadCount === 1) {
        const msg = messages[0]
        const fromInfo = ` from ${formatSender(msg)}`
        const subjectInfo = msg.subject ? ` about "${msg.subject}"` : ''
        const urgentFlag = msg.priority === 'urgent' ? ' [URGENT]' : ''
        prompt = `${urgentFlag}You have a new message${fromInfo}${subjectInfo}. Please check your inbox.`
      } else {
        // Multiple messages - summarize with sender names and hosts
        const urgentCount = messages.filter(m => m.priority === 'urgent').length
        const senderInfos = messages.map(m => formatSender(m))
        const uniqueSenders = [...new Set(senderInfos)].slice(0, 3)
        const sendersInfo = uniqueSenders.length > 0
          ? ` from ${uniqueSenders.join(', ')}${uniqueSenders.length < messages.length ? ' and others' : ''}`
          : ''
        const urgentFlag = urgentCount > 0 ? ` [${urgentCount} URGENT]` : ''
        prompt = `${urgentFlag}You have ${unreadCount} new messages${sendersInfo}. Please check your inbox.`
      }

      // Send the natural language prompt to Claude Code
      const commandResponse = await fetch(
        `${getSelfApiBase()}/api/sessions/${encodeURIComponent(sessionName)}/command`,
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
      totalMessageRuns: this.totalMessageRuns,
      cumulativeMessagesIndexed: this.cumulativeMessagesIndexed,
      cumulativeConversationsIndexed: this.cumulativeConversationsIndexed,
      consolidation: {
        enabled: this.consolidationEnabled,
        scheduledHour: this.consolidationHour,
        lastRun: this.lastConsolidationRun,
        nextRun: this.nextConsolidationRun,
        lastResult: this.lastConsolidationResult,
        totalRuns: this.totalConsolidationRuns
      }
    }
  }

  /**
   * Write subconscious status to a file for dashboard to read
   * This decouples the dashboard from loading agents into memory
   */
  private writeStatusFile(): void {
    try {
      const statusDir = path.join(os.homedir(), '.aimaestro', 'agents', this.agentId)
      const statusPath = path.join(statusDir, 'status.json')

      // Ensure directory exists
      if (!fs.existsSync(statusDir)) {
        fs.mkdirSync(statusDir, { recursive: true })
      }

      const status = {
        agentId: this.agentId,
        lastUpdated: Date.now(),
        isRunning: this.isRunning,
        activityState: this.activityState,
        startedAt: this.startedAt,
        memoryCheckInterval: this.memoryCheckInterval,
        messageCheckInterval: this.messageCheckInterval,
        lastMemoryRun: this.lastMemoryRun,
        lastMessageRun: this.lastMessageRun,
        lastMemoryResult: this.lastMemoryResult,
        lastMessageResult: this.lastMessageResult,
        totalMemoryRuns: this.totalMemoryRuns,
        totalMessageRuns: this.totalMessageRuns,
        cumulativeMessagesIndexed: this.cumulativeMessagesIndexed,
        cumulativeConversationsIndexed: this.cumulativeConversationsIndexed,
        consolidation: {
          enabled: this.consolidationEnabled,
          scheduledHour: this.consolidationHour,
          lastRun: this.lastConsolidationRun,
          nextRun: this.nextConsolidationRun,
          lastResult: this.lastConsolidationResult,
          totalRuns: this.totalConsolidationRuns
        }
      }

      fs.writeFileSync(statusPath, JSON.stringify(status, null, 2))
    } catch (error) {
      // Silently fail - status file is convenience, not critical
      console.error(`[Agent ${this.agentId.substring(0, 8)}] Failed to write status file:`, error)
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
 * Agent Registry - Manages agent lifecycle with LRU eviction
 *
 * This singleton keeps track of active agents with a maximum limit.
 * When the limit is reached, least recently used agents are evicted
 * (properly shutdown including CozoDB) to prevent memory bloat.
 *
 * Default: max 10 agents in memory at once
 */
class AgentRegistry {
  private agents = new Map<string, Agent>()
  private accessOrder: string[] = []  // Most recently accessed at the end
  private maxAgents: number

  constructor(maxAgents = 10) {
    this.maxAgents = maxAgents
    console.log(`[AgentRegistry] Initialized with max ${maxAgents} agents (LRU eviction enabled)`)
  }

  /**
   * Update access order (move to end = most recently used)
   */
  private touch(agentId: string): void {
    const index = this.accessOrder.indexOf(agentId)
    if (index !== -1) {
      this.accessOrder.splice(index, 1)
    }
    this.accessOrder.push(agentId)
  }

  /**
   * Evict least recently used agent if at capacity
   */
  private async evictIfNeeded(): Promise<void> {
    while (this.agents.size >= this.maxAgents && this.accessOrder.length > 0) {
      const lruAgentId = this.accessOrder.shift()!
      const agent = this.agents.get(lruAgentId)
      if (agent) {
        console.log(`[AgentRegistry] Evicting LRU agent ${lruAgentId.substring(0, 8)} (${this.agents.size}/${this.maxAgents})`)
        try {
          await agent.shutdown()
        } catch (err) {
          console.error(`[AgentRegistry] Error shutting down evicted agent:`, err)
        }
        this.agents.delete(lruAgentId)
      }
    }
  }

  /**
   * Get or create an agent
   */
  async getAgent(agentId: string, config?: AgentConfig): Promise<Agent> {
    let agent = this.agents.get(agentId)

    if (agent) {
      // Update access order (touch = mark as recently used)
      this.touch(agentId)
      return agent
    }

    // Evict LRU agent if at capacity before creating new one
    await this.evictIfNeeded()

    // Create new agent
    console.log(`[AgentRegistry] Loading agent ${agentId.substring(0, 8)} (${this.agents.size + 1}/${this.maxAgents})`)
    agent = new Agent({
      agentId,
      workingDirectory: config?.workingDirectory
    })
    await agent.initialize()
    this.agents.set(agentId, agent)
    this.touch(agentId)

    return agent
  }

  /**
   * Get an existing agent (without creating)
   * Also updates access order
   */
  getExistingAgent(agentId: string): Agent | undefined {
    const agent = this.agents.get(agentId)
    if (agent) {
      this.touch(agentId)
    }
    return agent
  }

  /**
   * Shutdown an agent
   */
  async shutdownAgent(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId)
    if (agent) {
      await agent.shutdown()
      this.agents.delete(agentId)
      const index = this.accessOrder.indexOf(agentId)
      if (index !== -1) {
        this.accessOrder.splice(index, 1)
      }
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
    this.accessOrder = []
    console.log('[AgentRegistry] ✓ All agents shutdown')
  }

  /**
   * Get all active agents (currently in memory)
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
      maxAgents: this.maxAgents,
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
