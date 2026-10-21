/**
 * The attention queue: one list of what needs the operator, across every agent and host, longest
 * waiting first. It only RANKS and MERGES signals that already exist; it decides nothing itself:
 *
 *  - an agent in the "Needs you" state. The status comes from the server feed through the single
 *    browser store (`presenceOf` in hooks/useSessionActivity.ts); the page passes it in as
 *    `presence`, this module never works a status out from anything else;
 *  - a card waiting on the operator (status waiting, waitingOn juan);
 *  - a card in review.
 *
 * Multi-host: an agent id is unique across hosts, and the same card can be reported by more than one
 * host, so cards are deduplicated by id (the most recently updated copy wins) and agents by id.
 * A host that did not answer is the caller's to name; this module only groups what it is given.
 */

import { agentRoleLine } from '@/lib/agent-role-line'
import type { AgentPresence } from '@/lib/agent-presence'

export type AttentionKind = 'needs-you' | 'waiting-on-you' | 'in-review'

export interface AttentionAgentInput {
  id: string
  name?: string
  label?: string
  alias?: string
  tags?: string[]
  hostId?: string
  hostName?: string
  /** From presenceOf(agent), the one source of agent status */
  presence: AgentPresence
  /** When the feed last heard from the agent: used as "waiting since" for a needs-you agent */
  lastActivity?: string | null
}

export interface AttentionCardInput {
  id: string
  subject: string
  status: string
  agentId: string
  agentName?: string
  hostId?: string
  hostName?: string
  waitingOn?: string
  waitingNote?: string
  updatedAt?: string
}

export interface AttentionItem {
  /** Stable key for lists */
  key: string
  kind: AttentionKind
  agentId: string
  agentName: string
  roleLine: string
  hostId?: string
  hostName?: string
  /** What is needed, in words */
  title: string
  detail?: string
  /** ISO time the wait began, when known */
  since: string | null
  /** Milliseconds waited at `now`; null when the start is not known */
  waitedMs: number | null
}

const display = (a: { label?: string; name?: string; alias?: string; id: string }) => a.label || a.name || a.alias || a.id.slice(0, 8)

const ms = (iso?: string | null): number | null => {
  if (!iso) return null
  const t = Date.parse(iso)
  return Number.isNaN(t) ? null : t
}

export function buildAttention(
  input: { agents: AttentionAgentInput[]; cards: AttentionCardInput[] },
  now: number = Date.now(),
): AttentionItem[] {
  const items: AttentionItem[] = []
  const byId = new Map<string, AttentionAgentInput>()
  for (const a of input.agents) if (!byId.has(a.id)) byId.set(a.id, a)

  for (const a of byId.values()) {
    if (a.presence !== 'needs-you') continue
    const since = ms(a.lastActivity)
    items.push({
      key: `agent:${a.id}`, kind: 'needs-you', agentId: a.id, agentName: display(a), roleLine: agentRoleLine(a.tags),
      hostId: a.hostId, hostName: a.hostName,
      title: 'Is waiting for you', since: since === null ? null : new Date(since).toISOString(), waitedMs: since === null ? null : Math.max(0, now - since),
    })
  }

  // The same card can come from two hosts: keep the most recently updated copy
  const cards = new Map<string, AttentionCardInput>()
  for (const c of input.cards) {
    const prev = cards.get(c.id)
    if (!prev || (ms(c.updatedAt) ?? 0) > (ms(prev.updatedAt) ?? 0)) cards.set(c.id, c)
  }

  for (const c of cards.values()) {
    const waitingOnYou = c.status === 'waiting' && c.waitingOn === 'juan'
    if (!waitingOnYou && c.status !== 'review') continue
    const owner = byId.get(c.agentId)
    const since = ms(c.updatedAt)
    items.push({
      key: `card:${c.id}`,
      kind: waitingOnYou ? 'waiting-on-you' : 'in-review',
      agentId: c.agentId,
      agentName: owner ? display(owner) : (c.agentName || c.agentId.slice(0, 8)),
      roleLine: owner ? agentRoleLine(owner.tags) : '',
      hostId: owner?.hostId ?? c.hostId, hostName: owner?.hostName ?? c.hostName,
      title: c.subject,
      detail: waitingOnYou ? c.waitingNote : undefined,
      since: since === null ? null : new Date(since).toISOString(),
      waitedMs: since === null ? null : Math.max(0, now - since),
    })
  }

  // Longest wait first; an item whose start is not known goes after the ones that are, in a stable order
  return items
    .map((it, i) => ({ it, i }))
    .sort((a, b) => {
      const x = a.it.waitedMs, y = b.it.waitedMs
      if (x === null && y === null) return a.i - b.i
      if (x === null) return 1
      if (y === null) return -1
      return y - x || a.i - b.i
    })
    .map(r => r.it)
}

/** The hosts that did not answer, from the agent list and the card fetch, named once each */
export function unreachableHosts(...lists: Array<string[] | undefined>): string[] {
  return [...new Set(lists.flatMap(l => l || []).filter(Boolean))]
}

export const KIND_LABEL: Record<AttentionKind, string> = {
  'needs-you': 'Needs you',
  'waiting-on-you': 'Waiting on you',
  'in-review': 'In review',
}
