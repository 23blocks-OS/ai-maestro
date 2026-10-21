/**
 * "Show this agent's cards": a card is the agent's when it is the primary assignee (the card's agent on
 * its host) or one of the extra owners. The card is still one card: filtering never copies it per owner.
 */

import { isCoOwner } from '@/lib/task-due'

/** The Matrix's filter key for an agent: "<hostId>:<agentId>" */
export const agentFilterKey = (hostId: string, agentId: string) => `${hostId}:${agentId}`

export function cardMatchesAgent(
  card: { hostId?: string; agentId: string; owners?: string[] | null },
  key: string,
  /** Other names an agent is known by (name, alias, label), by agent id: owners may be listed by name */
  namesById: Map<string, string[]> = new Map(),
): boolean {
  if (!key) return true
  if (agentFilterKey(card.hostId || '', card.agentId) === key) return true
  const agentId = key.slice(key.indexOf(':') + 1)
  return isCoOwner(card.owners || undefined, agentId, ...(namesById.get(agentId) || []))
}
