/**
 * Browser-side calls for a card that lives on some host. A card is changed through the API of the
 * board it lives on, on the host that holds it (the mesh-wide Matrix reads many hosts at once).
 */

import type { TaskUpdates } from '@/hooks/useTasks'

export interface CardRef {
  id: string
  scope?: 'agent' | 'team' | 'project'
  teamId?: string
  projectId?: string
  ownerAgentId?: string
  agentId?: string
}

/** `base` is the host's address, '' for this host */
export function cardUrl(base: string, card: CardRef): string {
  if (card.scope === 'project' && card.projectId) return `${base}/api/projects/${card.projectId}/tasks/${card.id}`
  if (card.scope === 'team' && card.teamId) return `${base}/api/teams/${card.teamId}/tasks/${card.id}`
  return `${base}/api/agents/${card.ownerAgentId || card.agentId}/tasks/${card.id}`
}

/**
 * Cards on other hosts that list an agent as a co-owner, for that agent's board. `bases` are the
 * hosts' addresses ('' = this host); the agent's own host (`ownHostBase`) is skipped because its board
 * answer already includes its local shared cards. `names` are the other names the agent is known by,
 * for a host that does not know it. A host that does not answer adds nothing; each card is marked
 * `shared` and carries the address of the host that holds it, so it is changed through that host.
 */
export async function fetchSharedCards<T extends { id: string }>(
  agentId: string,
  names: string[],
  bases: string[],
  ownHostBase: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Array<T & { shared: true; hostBase: string }>> {
  const trim = (b: string) => b.replace(/\/$/, '')
  const as = names.filter(Boolean).join(',')
  const answers = await Promise.all(bases.filter(b => trim(b) !== trim(ownHostBase)).map(async base => {
    try {
      const r = await fetchImpl(`${base}/api/tasks/shared?agent=${encodeURIComponent(agentId)}${as ? `&as=${encodeURIComponent(as)}` : ''}`, { signal: AbortSignal.timeout(6000) })
      if (!r.ok) return []
      const d = await r.json()
      return ((d.cards || []) as T[]).map(c => ({ ...c, shared: true as const, hostBase: base }))
    } catch {
      return []
    }
  }))
  return answers.flat()
}

/** A card id listed once, the first copy winning (the board's own copy comes first) */
export function dedupeCards<T extends { id: string }>(cards: T[]): T[] {
  const seen = new Set<string>()
  return cards.filter(c => !seen.has(c.id) && !!seen.add(c.id))
}

async function failMessage(res: Response, fallback: string): Promise<string> {
  const detail = await res.json().catch(() => ({}))
  return detail?.message || detail?.error || fallback
}

export async function patchCard(base: string, card: CardRef, updates: TaskUpdates): Promise<void> {
  // A card on an agent's own board stays that agent's: the assignee is never sent for it
  const shared = card.scope === 'team' || card.scope === 'project'
  const body = shared ? updates : { ...updates, assigneeAgentId: undefined }
  const res = await fetch(cardUrl(base, card), {
    method: shared ? 'PUT' : 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(await failMessage(res, 'Failed to update the card'))
}

export async function deleteCard(base: string, card: CardRef): Promise<void> {
  const res = await fetch(cardUrl(base, card), { method: 'DELETE' })
  if (!res.ok) throw new Error(await failMessage(res, 'Failed to delete the card'))
}

export async function commentOnCard(base: string, card: CardRef, text: string, deliver: boolean): Promise<{ delivered?: boolean; reason?: string }> {
  const res = await fetch(`${cardUrl(base, card)}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ author: { kind: 'operator' }, text, deliver }),
  })
  if (!res.ok) throw new Error(await failMessage(res, 'Could not save the comment'))
  const data = await res.json()
  return { delivered: data.delivered, reason: data.reason }
}

export async function retryCardComment(base: string, card: CardRef, commentId: string): Promise<{ delivered?: boolean; reason?: string }> {
  const res = await fetch(`${cardUrl(base, card)}/comments/${commentId}`, { method: 'POST' })
  const data = await res.json().catch(() => ({}))
  return { delivered: data.delivered, reason: data.reason }
}
