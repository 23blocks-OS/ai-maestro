import { resolveAlias, getAgent } from './agent-registry'
import * as sessionMessaging from './messageQueue'

/**
 * Agent-based messaging layer
 *
 * Messages are stored in AMP per-agent directories:
 *   ~/.agent-messaging/agents/<agentName>/messages/inbox/
 *   ~/.agent-messaging/agents/<agentName>/messages/sent/
 *
 * This layer resolves agent aliases/IDs and delegates to messageQueue.ts.
 */

/**
 * List inbox messages for an agent
 */
export async function listAgentInboxMessages(
  agent: string,  // Agent ID or alias
  filter?: {
    status?: sessionMessaging.Message['status']
    priority?: sessionMessaging.Message['priority']
    from?: string  // Can be session name or agent alias
  }
): Promise<sessionMessaging.MessageSummary[]> {
  const agentId = resolveAlias(agent) || agent
  const agentObj = getAgent(agentId)

  if (!agentObj) {
    throw new Error(`Agent not found: ${agent}`)
  }

  // If filter.from is provided, resolve it to agent ID
  let resolvedFilter = filter
  if (filter?.from) {
    const fromAgentId = resolveAlias(filter.from) || filter.from
    resolvedFilter = {
      ...filter,
      from: fromAgentId
    }
  }

  // Use agent ID for message storage lookup
  return sessionMessaging.listInboxMessages(agentId, resolvedFilter)
}

/**
 * List sent messages for an agent
 */
export async function listAgentSentMessages(
  agent: string,  // Agent ID or alias
  filter?: {
    priority?: sessionMessaging.Message['priority']
    to?: string  // Can be session name or agent alias
  }
): Promise<sessionMessaging.MessageSummary[]> {
  const agentId = resolveAlias(agent) || agent
  const agentObj = getAgent(agentId)

  if (!agentObj) {
    throw new Error(`Agent not found: ${agent}`)
  }

  // If filter.to is provided, resolve it to agent ID
  let resolvedFilter = filter
  if (filter?.to) {
    const toAgentId = resolveAlias(filter.to) || filter.to
    resolvedFilter = {
      ...filter,
      to: toAgentId
    }
  }

  return sessionMessaging.listSentMessages(agentId, resolvedFilter)
}

/**
 * Get a specific message for an agent
 */
export async function getAgentMessage(
  agent: string,  // Agent ID or alias
  messageId: string,
  box: 'inbox' | 'sent' = 'inbox'
): Promise<sessionMessaging.Message | null> {
  const agentId = resolveAlias(agent) || agent
  const agentObj = getAgent(agentId)

  if (!agentObj) {
    throw new Error(`Agent not found: ${agent}`)
  }

  return sessionMessaging.getMessage(agentId, messageId, box)
}

/**
 * Mark a message as read for an agent
 */
export async function markAgentMessageAsRead(
  agent: string,  // Agent ID or alias
  messageId: string
): Promise<boolean> {
  const agentId = resolveAlias(agent) || agent
  const agentObj = getAgent(agentId)

  if (!agentObj) {
    throw new Error(`Agent not found: ${agent}`)
  }

  return sessionMessaging.markMessageAsRead(agentId, messageId)
}

/**
 * Archive a message for an agent
 */
export async function archiveAgentMessage(
  agent: string,  // Agent ID or alias
  messageId: string
): Promise<boolean> {
  const agentId = resolveAlias(agent) || agent
  const agentObj = getAgent(agentId)

  if (!agentObj) {
    throw new Error(`Agent not found: ${agent}`)
  }

  return sessionMessaging.archiveMessage(agentId, messageId)
}

/**
 * Delete a message for an agent
 */
export async function deleteAgentMessage(
  agent: string,  // Agent ID or alias
  messageId: string
): Promise<boolean> {
  const agentId = resolveAlias(agent) || agent
  const agentObj = getAgent(agentId)

  if (!agentObj) {
    throw new Error(`Agent not found: ${agent}`)
  }

  return sessionMessaging.deleteMessage(agentId, messageId)
}

/**
 * Get unread message count for an agent
 */
export async function getAgentUnreadCount(agent: string): Promise<number> {
  const agentId = resolveAlias(agent) || agent
  const agentObj = getAgent(agentId)

  if (!agentObj) {
    return 0  // Don't throw for count queries
  }

  return sessionMessaging.getUnreadCount(agentId)
}

/**
 * Get sent message count for an agent
 */
export async function getAgentSentCount(agent: string): Promise<number> {
  const agentId = resolveAlias(agent) || agent
  const agentObj = getAgent(agentId)

  if (!agentObj) {
    return 0
  }

  return sessionMessaging.getSentCount(agentId)
}

/**
 * Get message statistics for an agent
 */
export async function getAgentMessageStats(agent: string): Promise<{
  unread: number
  total: number
  byPriority: Record<string, number>
}> {
  const agentId = resolveAlias(agent) || agent
  const agentObj = getAgent(agentId)

  if (!agentObj) {
    return {
      unread: 0,
      total: 0,
      byPriority: { low: 0, normal: 0, high: 0, urgent: 0 }
    }
  }

  return sessionMessaging.getMessageStats(agentId)
}

/**
 * Get session name for an agent (for backward compatibility)
 * Returns the tmux session name if the agent has an active session
 */
export function getSessionNameForAgent(agent: string): string | null {
  const agentId = resolveAlias(agent) || agent
  const agentObj = getAgent(agentId)

  if (!agentObj) {
    return null
  }

  // Use agent name as session name (new schema)
  return agentObj.name || agentObj.alias || null
}

// Re-export types for convenience
export type {
  Message,
  MessageSummary
} from './messageQueue'
