/**
 * Communication Graph — Title-based message routing rules.
 *
 * Defines which governance titles can send messages to which other titles.
 * This is a directed graph: (sender, recipient) means sender can message recipient.
 * Missing connections are FORBIDDEN — the AMP routing layer returns 403.
 *
 * The user (human maestro) can message any agent and receive responses from any agent.
 * Subagents cannot send messages at all — they have no AMP identity.
 *
 * See docs_dev/2026-04-03-communication-graph.md for the full spec.
 */

import type { AgentRole } from '@/types/agent'

/**
 * Directed graph of allowed message routes.
 * Key: sender role (lowercase, matching AgentRole type). Value: set of roles the sender can message.
 *
 * IMPORTANT: The user (maestro) is NOT a node in this graph — the user can message any agent
 * and any agent can message back the user. Agents are discouraged from initiating messages to
 * the user (only respond when contacted). The user must be authenticated to send messages,
 * to prevent agents from sending messages on the user's behalf. This graph governs
 * agent-to-agent communication only.
 */
const COMMUNICATION_GRAPH: Record<AgentRole, ReadonlySet<AgentRole>> = {
  'manager':        new Set<AgentRole>(['manager', 'chief-of-staff', 'orchestrator', 'architect', 'integrator', 'member', 'autonomous']),
  'chief-of-staff': new Set<AgentRole>(['manager', 'chief-of-staff', 'orchestrator', 'architect', 'integrator', 'member', 'autonomous']),
  'orchestrator':   new Set<AgentRole>(['chief-of-staff', 'architect', 'integrator', 'member']),
  'architect':      new Set<AgentRole>(['chief-of-staff', 'orchestrator']),
  'integrator':     new Set<AgentRole>(['chief-of-staff', 'orchestrator']),
  'member':         new Set<AgentRole>(['chief-of-staff', 'orchestrator']),
  'autonomous':     new Set<AgentRole>(['manager', 'chief-of-staff', 'autonomous']),
}

/** All valid agent roles for the communication graph. */
export const ALL_ROLES: readonly AgentRole[] = Object.keys(COMMUNICATION_GRAPH) as AgentRole[]

/** Check if a role string is a valid AgentRole in the communication graph. */
export function isValidRole(role: string): role is AgentRole {
  return role in COMMUNICATION_GRAPH
}

/** Check if sender role can message recipient role. */
export function canSendMessage(senderRole: AgentRole, recipientRole: AgentRole): boolean {
  return COMMUNICATION_GRAPH[senderRole]?.has(recipientRole) ?? false
}

/** Get all roles that a sender can message. */
export function getAllowedRecipients(senderRole: AgentRole): AgentRole[] {
  const set = COMMUNICATION_GRAPH[senderRole]
  return set ? [...set] : []
}

/** Routing suggestions when a connection is forbidden. */
const ROUTING_SUGGESTIONS: Record<string, string> = {
  // Workers → MANAGER: go through COS
  'orchestrator->manager':   'Route through chief-of-staff',
  'architect->manager':      'Route through chief-of-staff',
  'integrator->manager':     'Route through chief-of-staff',
  'member->manager':         'Route through chief-of-staff',
  // Workers → peers: go through ORCHESTRATOR
  'architect->member':       'Route through orchestrator',
  'architect->integrator':   'Route through orchestrator',
  'architect->architect':    'Route through orchestrator',
  'integrator->architect':   'Route through orchestrator',
  'integrator->member':      'Route through orchestrator',
  'integrator->integrator':  'Route through orchestrator',
  'member->architect':       'Route through orchestrator',
  'member->integrator':      'Route through orchestrator',
  'member->member':          'Route through orchestrator',
  // Workers → AUTONOMOUS: go through COS
  'orchestrator->autonomous': 'Route through chief-of-staff',
  'architect->autonomous':    'Route through chief-of-staff',
  'integrator->autonomous':   'Route through chief-of-staff',
  'member->autonomous':       'Route through chief-of-staff',
  // AUTONOMOUS → team workers: contact COS or MANAGER
  'autonomous->orchestrator': 'Contact chief-of-staff or manager instead',
  'autonomous->architect':    'Contact chief-of-staff or manager instead',
  'autonomous->integrator':   'Contact chief-of-staff or manager instead',
  'autonomous->member':       'Contact chief-of-staff or manager instead',
  // ORCHESTRATOR → ORCHESTRATOR (cross-team): go through COS
  'orchestrator->orchestrator': 'Route through chief-of-staff for cross-team coordination',
}

export interface MessageRouteValidation {
  allowed: boolean
  reason?: string
  suggestion?: string
}

/**
 * Validate a message route between two agent roles.
 * Returns allowed=true or a reason + routing suggestion.
 *
 * Pass isUserMessage=true when the human user (maestro) is the sender —
 * the user can message any agent. Agents can also respond to the user
 * (but are discouraged from initiating contact unless responding to a user message).
 */
export function validateMessageRoute(
  senderRole: string | null | undefined,
  recipientRole: string | null | undefined,
  options: { isSubagent?: boolean; isUserMessage?: boolean } = {}
): MessageRouteValidation {
  // Subagents are always blocked
  if (options.isSubagent) {
    return {
      allowed: false,
      reason: 'Subagents cannot send messages. Only the main agent with an AMP identity can communicate.',
    }
  }

  // User (maestro) can message any agent
  if (options.isUserMessage) {
    return { allowed: true }
  }

  // Null/missing roles — fail closed
  if (!senderRole) {
    return { allowed: false, reason: 'Sender has no governance title — cannot determine communication permissions' }
  }
  if (!recipientRole) {
    // If recipient has no title, treat as MEMBER (default, most restrictive for senders)
    // This is safe: only MANAGER, COS, and ORCHESTRATOR can reach MEMBER
    return canSendMessage(senderRole as AgentRole, 'member')
      ? { allowed: true }
      : { allowed: false, reason: `${senderRole} cannot send messages to agents without a governance title`, suggestion: 'Route through chief-of-staff or orchestrator' }
  }

  if (!isValidRole(senderRole)) {
    return { allowed: false, reason: `Unknown sender role: ${senderRole}` }
  }
  if (!isValidRole(recipientRole)) {
    return { allowed: false, reason: `Unknown recipient role: ${recipientRole}` }
  }

  if (canSendMessage(senderRole, recipientRole)) {
    return { allowed: true }
  }

  const key = `${senderRole}->${recipientRole}`
  return {
    allowed: false,
    reason: `${senderRole.toUpperCase()} cannot send messages to ${recipientRole.toUpperCase()}`,
    suggestion: ROUTING_SUGGESTIONS[key] || 'Check the communication graph for allowed routes',
  }
}
