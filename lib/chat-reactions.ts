/**
 * Reactions on chat messages (#799): the fixed set, the line an agent receives, and the browser's calls.
 * No Node imports here: the chat views use this file. Storage is lib/chat-reactions-store.ts.
 */

/** Fixed, so agents can rely on the meaning */
export const REACTIONS = {
  '👍': 'yes, go ahead',
  '👎': 'no, not this',
  '❓': 'explain this',
  '✅': 'done, seen',
  '👀': 'looking at it',
  '❤️': 'great',
} as const
export type ReactionEmoji = keyof typeof REACTIONS
export const REACTION_EMOJIS = Object.keys(REACTIONS) as ReactionEmoji[]

/** These reach the agent as a note; the others only show on the message */
export const DELIVERED_REACTIONS: readonly string[] = ['👍', '👎', '❓']

export function isReactionEmoji(v: unknown): v is ReactionEmoji {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(REACTIONS, v)
}

/** Transcript ids: a Claude uuid, or a derived id such as `codex:call:x` or `pi:abc#result` */
export function isMessageId(v: unknown): v is string {
  return typeof v === 'string' && /^[A-Za-z0-9:_#.-]{1,128}$/.test(v)
}

export type ReactorKind = 'person' | 'agent' | 'operator'

export interface Reaction {
  emoji: ReactionEmoji
  /** Person id, agent id, or `operator` (the dashboard) */
  by: string
  byKind: ReactorKind
  /** A snapshot of the name, so a host without the person's record can still show it */
  byName?: string
  at: string
}

export type ReactionMap = Record<string, Reaction[]>

const QUOTE_MAX = 80
const NAME_MAX = 40

/** One line of at most `max` characters: nothing in it can end the line or the quote around it. */
function oneLine(text: string, max: number): string {
  const flat = text.replace(/\p{C}/gu, ' ').replace(/\s+/g, ' ').trim().replace(/"/g, "'")
  const chars = Array.from(flat)
  return chars.length > max ? `${chars.slice(0, max).join('').trimEnd()}...` : flat
}

/** The note an agent gets. lib/transcript-records.mjs recognises this exact shape as a system note. */
export function buildReactionLine(name: string, emoji: ReactionEmoji, quoted: string): string {
  const who = oneLine(name, NAME_MAX) || 'Someone'
  return `[REACTION] ${who} reacted ${emoji} (${REACTIONS[emoji]}) to your message: "${oneLine(quoted, QUOTE_MAX)}"`
}

// ── Browser calls ───────────────────────────────────────────────────────────
// baseUrl is getAgentBaseUrl(agent): REST goes to the host the agent lives on, '' for this one.

/** At most this many ids in one GET, to stay inside a URL's length */
export const REACTIONS_PAGE = 100

export async function fetchReactions(baseUrl: string, agentId: string, ids: string[]): Promise<ReactionMap> {
  const res = await fetch(`${baseUrl}/api/agents/${encodeURIComponent(agentId)}/chat/reactions?ids=${ids.map(encodeURIComponent).join(',')}`)
  if (!res.ok) throw new Error(`Could not load reactions (HTTP ${res.status})`)
  return (await res.json()).reactions || {}
}

export interface ReactionResult {
  reactions: Reaction[]
  delivered?: boolean
  /** Why a reaction meant for the agent did not reach it */
  reason?: string
}

export async function sendReaction(baseUrl: string, agentId: string, method: 'POST' | 'DELETE', messageId: string, emoji: ReactionEmoji): Promise<ReactionResult> {
  const res = await fetch(`${baseUrl}/api/agents/${encodeURIComponent(agentId)}/chat/reactions`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messageId, emoji }),
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error(data?.message || data?.error || `Reaction failed (HTTP ${res.status})`)
  return data
}
