/**
 * Reactions on an agent's chat messages, stored with the agent:
 * ~/.aimaestro/agents/{agentId}/chat-reactions.json, keyed by transcript entry id (uuid).
 * Sync read-modify-write on one process, so two taps cannot lose each other.
 */

import fs from 'fs'
import os from 'os'
import path from 'path'
import { isSafeAgentId } from '@/lib/safe-ids'
import type { Reaction, ReactionMap } from '@/lib/chat-reactions'

function file(agentId: string): string {
  if (!isSafeAgentId(agentId)) throw new Error('Invalid agent id')
  return path.join(os.homedir(), '.aimaestro', 'agents', agentId, 'chat-reactions.json')
}

function load(agentId: string): ReactionMap {
  try {
    return JSON.parse(fs.readFileSync(file(agentId), 'utf-8'))
  } catch {
    return {}
  }
}

function save(agentId: string, map: ReactionMap): void {
  const target = file(agentId)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  const tmp = `${target}.${process.pid}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(map), 'utf-8')
  fs.renameSync(tmp, target)
}

const has = (map: ReactionMap, id: string) => Object.prototype.hasOwnProperty.call(map, id)

export function getReactions(agentId: string, messageIds: string[]): ReactionMap {
  const all = load(agentId)
  return Object.fromEntries(messageIds.filter(id => has(all, id)).map(id => [id, all[id]]))
}

/** One reaction per reactor per emoji per message: adding it again changes nothing */
export function addReaction(agentId: string, messageId: string, reaction: Reaction): { added: boolean; reactions: Reaction[] } {
  const all = load(agentId)
  const list = has(all, messageId) ? all[messageId] : []
  if (list.some(r => r.emoji === reaction.emoji && r.by === reaction.by && r.byKind === reaction.byKind)) return { added: false, reactions: list }
  const reactions = [...list, reaction]
  save(agentId, { ...all, [messageId]: reactions })
  return { added: true, reactions }
}

export function removeReaction(agentId: string, messageId: string, who: Pick<Reaction, 'emoji' | 'by' | 'byKind'>): { removed: boolean; reactions: Reaction[] } {
  const all = load(agentId)
  const list = has(all, messageId) ? all[messageId] : []
  const reactions = list.filter(r => !(r.emoji === who.emoji && r.by === who.by && r.byKind === who.byKind))
  if (reactions.length === list.length) return { removed: false, reactions: list }
  const { [messageId]: _gone, ...rest } = all
  save(agentId, reactions.length ? { ...rest, [messageId]: reactions } : rest)
  return { removed: true, reactions }
}
