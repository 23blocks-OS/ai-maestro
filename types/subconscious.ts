/**
 * Subconscious Status Types
 *
 * The subconscious system runs background processes for each agent:
 * - Memory maintenance: Indexes conversation history into CozoDB
 * - Message checking: Checks for unread inter-agent messages
 */

/**
 * Result from a memory maintenance run
 */
export interface MemoryRunResult {
  success: boolean
  messagesProcessed?: number
  conversationsDiscovered?: number
  error?: string
}

/**
 * Result from a message check run
 */
export interface MessageCheckResult {
  success: boolean
  unreadCount?: number
  error?: string
}

/**
 * Status details for a running subconscious process
 */
export interface SubconsciousProcessStatus {
  startedAt: number | null
  memoryCheckInterval: number
  messageCheckInterval: number
  lastMemoryRun: number | null
  lastMessageRun: number | null
  lastMemoryResult: MemoryRunResult | null
  lastMessageResult: MessageCheckResult | null
  totalMemoryRuns: number
  totalMessageRuns: number
}

/**
 * Per-agent subconscious status
 * Returned by GET /api/agents/[id]/subconscious
 */
export interface AgentSubconsciousStatus {
  success: boolean
  exists: boolean
  initialized: boolean
  isRunning: boolean
  isWarmingUp: boolean
  status: SubconsciousProcessStatus | null
}

/**
 * Summary of an agent's subconscious for global aggregation
 */
export interface AgentSubconsciousSummary {
  agentId: string
  isRunning: boolean
  initialized: boolean
  isWarmingUp: boolean
  status: Omit<SubconsciousProcessStatus, 'startedAt' | 'memoryCheckInterval' | 'messageCheckInterval'> | null
}

/**
 * Global aggregated subconscious status
 * Returned by GET /api/subconscious
 */
export interface GlobalSubconsciousStatus {
  success: boolean
  discoveredAgents: number
  activeAgents: number
  runningSubconscious: number
  isWarmingUp: boolean
  totalMemoryRuns: number
  totalMessageRuns: number
  lastMemoryRun: number | null
  lastMessageRun: number | null
  lastMemoryResult: MemoryRunResult | null
  lastMessageResult: MessageCheckResult | null
  agents: Array<{
    agentId: string
    status: {
      isRunning: boolean
      lastMemoryRun: number | null
      lastMessageRun: number | null
      lastMemoryResult: MemoryRunResult | null
      lastMessageResult: MessageCheckResult | null
      totalMemoryRuns: number
      totalMessageRuns: number
    } | null
  }>
}
