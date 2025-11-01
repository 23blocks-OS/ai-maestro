import { resolveAlias, getAgent, getAgentBySession } from './agent-registry'
import * as sessionMessaging from './messageQueue'

/**
 * Agent-based messaging layer
 *
 * Messages are stored by agent ID in the new architecture.
 * For backward compatibility, symlinks are created from session names to agent IDs.
 * This allows the system to work with both old session-based paths and new agent-based paths.
 *
 * Migration process:
 * 1. Messages are moved from ~/.aimaestro/messages/<box>/<session-name>/ to /<agent-id>/
 * 2. Symlinks are created from old session paths to new agent paths
 * 3. New messages are always stored by agent ID
 */

/**
 * Send a message from one agent to another
 * Accepts agent IDs or aliases
 */
export async function sendAgentMessage(
  from: string,  // Agent ID or alias
  to: string,    // Agent ID or alias
  subject: string,
  content: sessionMessaging.Message['content'],
  options?: {
    priority?: sessionMessaging.Message['priority']
    inReplyTo?: string
  }
): Promise<sessionMessaging.Message> {
  // Resolve from and to to actual agents
  const fromAgentId = resolveAlias(from) || from
  const toAgentId = resolveAlias(to) || to

  const fromAgent = getAgent(fromAgentId)
  const toAgent = getAgent(toAgentId)

  if (!fromAgent) {
    throw new Error(`Sender agent not found: ${from}`)
  }

  if (!toAgent) {
    throw new Error(`Recipient agent not found: ${to}`)
  }

  // Use agent IDs for message storage (not session names)
  // This stores messages in ~/.aimaestro/messages/<box>/<agent-id>/
  return sessionMessaging.sendMessage(fromAgentId, toAgentId, subject, content, options)
}

/**
 * Forward a message from one agent to another
 */
export async function forwardAgentMessage(
  originalMessageId: string,
  fromAgent: string,  // Agent ID or alias
  toAgent: string,    // Agent ID or alias
  forwardNote?: string
): Promise<sessionMessaging.Message> {
  const fromAgentId = resolveAlias(fromAgent) || fromAgent
  const toAgentId = resolveAlias(toAgent) || toAgent

  const from = getAgent(fromAgentId)
  const to = getAgent(toAgentId)

  if (!from) {
    throw new Error(`Sender agent not found: ${fromAgent}`)
  }

  if (!to) {
    throw new Error(`Recipient agent not found: ${toAgent}`)
  }

  // Use agent IDs for message storage
  return sessionMessaging.forwardMessage(originalMessageId, fromAgentId, toAgentId, forwardNote)
}

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

  return agentObj.tools.session?.tmuxSessionName || null
}

// Re-export types for convenience
export type {
  Message,
  MessageSummary
} from './messageQueue'
