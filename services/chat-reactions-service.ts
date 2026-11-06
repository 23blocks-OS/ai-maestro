/**
 * Chat Reactions Service (#799): a person or an agent reacts to a chat message.
 *
 * Who reacted:
 *  - `deviceId`: the person's paired app. Its key must be active on this host, the same bar as sending
 *    as that person (lib/person-signing). A device states who it is; the request itself is not signed.
 *  - `agentId`: an agent, for aimaestro-react.sh.
 *  - neither: the dashboard, recorded as `operator`, the way task comments are (agent-tasks-service).
 *
 * Runs on the agent's own host: callers send REST to that host, and the open chat sockets there,
 * forwarded ones included, get the `chat:reaction` event.
 */

import * as fs from 'fs'
import { getAgent } from '@/lib/agent-registry'
import { computeSessionName, type Agent } from '@/types/agent'
import { getPerson } from '@/lib/people-registry'
import { getDevice } from '@/lib/person-devices-registry'
import { isPaneAtBareShell, BARE_SHELL_MESSAGE } from '@/lib/pane-occupant'
import { resolveJsonlPath, parseJsonlLines } from '@/lib/chat-transcript.mjs'
import { pushToStreamSession, broadcastToStreamSession } from '@/lib/streaming-bridge.mjs'
import { broadcastChatEvent } from '@/services/shared-state'
import { addReaction, getReactions, removeReaction } from '@/lib/chat-reactions-store'
import {
  buildReactionLine, DELIVERED_REACTIONS, isMessageId, isReactionEmoji, REACTION_EMOJIS,
  type Reaction, type ReactionEmoji, type ReactionMap, type ReactorKind,
} from '@/lib/chat-reactions'
import { type ServiceResult, agentNotFound, forbidden, invalidField, missingField, notFound, ok } from '@/services/service-errors'

type Reactor = { by: string; byKind: ReactorKind; byName?: string }

/** A burst of taps must not flood the agent: one note per agent in this time */
const REACTION_DELIVERY_GAP_MS = 5000

const g = globalThis as {
  _reactionDeliveries?: Map<string, number>
  /** server.mjs's sendChatMessage, the path of chat:send */
  __deliverChatLine?: (sessionName: string, text: string) => Promise<{ ok: boolean; error?: string }>
}

function claimDelivery(agentId: string, now: number): boolean {
  const last = (g._reactionDeliveries ??= new Map())
  if (now - (last.get(agentId) ?? -Infinity) < REACTION_DELIVERY_GAP_MS) return false
  last.set(agentId, now)
  return true
}

function reactorFrom(body: Record<string, unknown>): Reactor | ServiceResult<never> {
  if (body.deviceId !== undefined) {
    const device = typeof body.deviceId === 'string' ? getDevice(body.deviceId) : null
    if (!device) return notFound('Device', String(body.deviceId))
    if (device.key?.status !== 'active') return forbidden('This device has no approved key on this host. Approve it on the dashboard.')
    const person = getPerson(device.personId)
    if (person?.active === false) return forbidden('This person is deactivated')
    return { by: device.personId, byKind: 'person', byName: person?.displayName || device.personName }
  }
  if (body.agentId !== undefined) {
    const agent = typeof body.agentId === 'string' ? getAgent(body.agentId) : null
    if (!agent) return agentNotFound(String(body.agentId))
    return { by: agent.id, byKind: 'agent', byName: agent.label || agent.name }
  }
  return { by: 'operator', byKind: 'operator' }
}

function isFailure(v: Reactor | ServiceResult<never>): v is ServiceResult<never> {
  return 'status' in v
}

function checkTarget(body: Record<string, unknown>): ServiceResult<never> | null {
  if (body.messageId === undefined) return missingField('messageId')
  if (!isMessageId(body.messageId)) return invalidField('messageId', 'messageId must be a transcript entry id')
  if (body.emoji === undefined) return missingField('emoji')
  if (!isReactionEmoji(body.emoji)) return invalidField('emoji', `emoji must be one of ${REACTION_EMOJIS.join(' ')}`)
  return null
}

function sessionNames(agent: Agent): string[] {
  const names = (agent.sessions || []).map(s => computeSessionName(agent.name, s.index))
  return [...new Set([...names, agent.name, agent.alias].filter((n): n is string => !!n))]
}

/** Every open view of this agent, on both chat sockets */
function publish(agent: Agent, messageId: string, reactions: Reaction[]): void {
  const event = { agentId: agent.id, messageId, reactions }
  for (const name of sessionNames(agent)) broadcastChatEvent(name, 'chat:reaction', event)
  for (const key of [agent.id, agent.name]) broadcastToStreamSession(key, { type: 'chat:reaction', ...event })
}

/** The text of the agent's own message with this id; null when it is not one */
function agentMessageText(agent: Agent, messageId: string): string | null {
  const conversation = resolveJsonlPath(agent)
  if (!conversation) return null
  const lines = fs.readFileSync(conversation.path, 'utf-8').split('\n')
  const entry = (parseJsonlLines(lines, Number.MAX_SAFE_INTEGER) as any[]).find(m => m.uuid === messageId)
  if (entry?.type !== 'assistant') return null
  const content = entry.message?.content
  if (typeof content === 'string') return content
  return (Array.isArray(content) ? content : []).filter(b => b?.type === 'text' && b.text).map(b => b.text).join(' ')
}

async function deliver(agent: Agent, reactor: Reactor, emoji: ReactionEmoji, messageId: string): Promise<{ delivered: boolean; reason?: string }> {
  let quoted: string | null
  try {
    quoted = agentMessageText(agent, messageId)
  } catch {
    return { delivered: false, reason: 'Could not read the conversation, so the agent was not told' }
  }
  // A person's own message, or one from another conversation: nothing the note could point the agent at
  if (!quoted) return { delivered: false }
  if (!claimDelivery(agent.id, Date.now())) {
    return { delivered: false, reason: 'Saved, but the agent was not told: wait a few seconds between reactions' }
  }
  const line = buildReactionLine(reactor.byName || 'The operator', emoji, quoted)
  if (pushToStreamSession(agent.id, line) || pushToStreamSession(agent.name, line)) return { delivered: true }

  const primary = agent.sessions?.find(s => s.index === 0) || agent.sessions?.[0]
  const sessionName = computeSessionName(agent.name, primary?.index ?? 0)
  // chat:send has no such guard, and a shell would run this line, quote included
  if (await isPaneAtBareShell(sessionName)) return { delivered: false, reason: BARE_SHELL_MESSAGE }
  if (!g.__deliverChatLine) return { delivered: false, reason: 'This server cannot reach the agent\'s terminal' }
  // It refuses while a permission prompt is on the pane: a reaction never answers one
  const result = await g.__deliverChatLine(sessionName, line)
  return result.ok ? { delivered: true } : { delivered: false, reason: result.error }
}

export function listChatReactions(agentId: string, ids: string | null): ServiceResult<{ reactions: ReactionMap }> {
  if (!getAgent(agentId)) return agentNotFound(agentId)
  if (!ids) return missingField('ids')
  return ok({ reactions: getReactions(agentId, ids.split(',').filter(isMessageId)) })
}

export async function addChatReaction(agentId: string, body: Record<string, unknown>): Promise<ServiceResult<{ reactions: Reaction[]; added: boolean; delivered: boolean; reason?: string }>> {
  const agent = getAgent(agentId)
  if (!agent) return agentNotFound(agentId)
  const bad = checkTarget(body)
  if (bad) return bad
  const reactor = reactorFrom(body)
  if (isFailure(reactor)) return reactor
  const messageId = body.messageId as string
  const emoji = body.emoji as ReactionEmoji

  const { added, reactions } = addReaction(agentId, messageId, { emoji, ...reactor, at: new Date().toISOString() })
  if (!added) return ok({ reactions, added, delivered: false })
  publish(agent, messageId, reactions)
  // An agent's reaction is for the people reading the chat, never a note back to an agent
  const sendsNote = reactor.byKind !== 'agent' && DELIVERED_REACTIONS.includes(emoji)
  return ok({ reactions, added, ...(sendsNote ? await deliver(agent, reactor, emoji, messageId) : { delivered: false }) })
}

/** Nothing reaches the agent on removal */
export function removeChatReaction(agentId: string, body: Record<string, unknown>): ServiceResult<{ reactions: Reaction[]; removed: boolean }> {
  const agent = getAgent(agentId)
  if (!agent) return agentNotFound(agentId)
  const bad = checkTarget(body)
  if (bad) return bad
  const reactor = reactorFrom(body)
  if (isFailure(reactor)) return reactor
  const messageId = body.messageId as string
  const { removed, reactions } = removeReaction(agentId, messageId, { emoji: body.emoji as ReactionEmoji, by: reactor.by, byKind: reactor.byKind })
  if (removed) publish(agent, messageId, reactions)
  return ok({ reactions, removed })
}
