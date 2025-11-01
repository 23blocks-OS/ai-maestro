import { resolveAlias, getAgent, getAgentBySession } from './agent-registry'
import * as sessionMessaging from './messageQueue'

/**
 * Agent-based messaging layer
 *
 * This wraps the existing session-based messaging system with agent resolution.
 * Messages are still stored by session name for backward compatibility, but
 * the API accepts agent IDs or aliases.
 *
 * When a session is recreated with the same name, messages are automatically
 * recovered because they're stored by session name.
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

  // Get session names for agents
  const fromSession = fromAgent.tools.session?.tmuxSessionName
  const toSession = toAgent.tools.session?.tmuxSessionName

  if (!fromSession) {
    throw new Error(`Sender agent ${fromAgent.alias} has no active session`)
  }

  if (!toSession) {
    throw new Error(`Recipient agent ${toAgent.alias} has no active session`)
  }

  // Use existing session-based messaging
  return sessionMessaging.sendMessage(fromSession, toSession, subject, content, options)
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

  const fromSession = from.tools.session?.tmuxSessionName
  const toSession = to.tools.session?.tmuxSessionName

  if (!fromSession) {
    throw new Error(`Sender agent ${from.alias} has no active session`)
  }

  if (!toSession) {
    throw new Error(`Recipient agent ${to.alias} has no active session`)
  }

  return sessionMessaging.forwardMessage(originalMessageId, fromSession, toSession, forwardNote)
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

  const sessionName = agentObj.tools.session?.tmuxSessionName

  if (!sessionName) {
    throw new Error(`Agent ${agentObj.alias} has no active session`)
  }

  // If filter.from is provided, try to resolve it to a session name
  let resolvedFilter = filter
  if (filter?.from) {
    const fromAgentId = resolveAlias(filter.from) || filter.from
    const fromAgent = getAgent(fromAgentId)

    if (fromAgent && fromAgent.tools.session) {
      resolvedFilter = {
        ...filter,
        from: fromAgent.tools.session.tmuxSessionName
      }
    }
  }

  return sessionMessaging.listInboxMessages(sessionName, resolvedFilter)
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

  const sessionName = agentObj.tools.session?.tmuxSessionName

  if (!sessionName) {
    throw new Error(`Agent ${agentObj.alias} has no active session`)
  }

  // If filter.to is provided, try to resolve it to a session name
  let resolvedFilter = filter
  if (filter?.to) {
    const toAgentId = resolveAlias(filter.to) || filter.to
    const toAgent = getAgent(toAgentId)

    if (toAgent && toAgent.tools.session) {
      resolvedFilter = {
        ...filter,
        to: toAgent.tools.session.tmuxSessionName
      }
    }
  }

  return sessionMessaging.listSentMessages(sessionName, resolvedFilter)
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

  const sessionName = agentObj.tools.session?.tmuxSessionName

  if (!sessionName) {
    throw new Error(`Agent ${agentObj.alias} has no active session`)
  }

  return sessionMessaging.getMessage(sessionName, messageId, box)
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

  const sessionName = agentObj.tools.session?.tmuxSessionName

  if (!sessionName) {
    throw new Error(`Agent ${agentObj.alias} has no active session`)
  }

  return sessionMessaging.markMessageAsRead(sessionName, messageId)
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

  const sessionName = agentObj.tools.session?.tmuxSessionName

  if (!sessionName) {
    throw new Error(`Agent ${agentObj.alias} has no active session`)
  }

  return sessionMessaging.archiveMessage(sessionName, messageId)
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

  const sessionName = agentObj.tools.session?.tmuxSessionName

  if (!sessionName) {
    throw new Error(`Agent ${agentObj.alias} has no active session`)
  }

  return sessionMessaging.deleteMessage(sessionName, messageId)
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

  const sessionName = agentObj.tools.session?.tmuxSessionName

  if (!sessionName) {
    return 0
  }

  return sessionMessaging.getUnreadCount(sessionName)
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

  const sessionName = agentObj.tools.session?.tmuxSessionName

  if (!sessionName) {
    return 0
  }

  return sessionMessaging.getSentCount(sessionName)
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

  const sessionName = agentObj.tools.session?.tmuxSessionName

  if (!sessionName) {
    return {
      unread: 0,
      total: 0,
      byPriority: { low: 0, normal: 0, high: 0, urgent: 0 }
    }
  }

  return sessionMessaging.getMessageStats(sessionName)
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
