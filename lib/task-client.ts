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
