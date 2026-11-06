'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchReactions, sendReaction, REACTIONS_PAGE, type Reaction, type ReactionEmoji, type ReactionMap } from '@/lib/chat-reactions'

/**
 * The reactions of the messages a chat view holds. Loaded per new message id from the agent's host
 * (`baseUrl`); `apply` takes a `chat:reaction` event, `reload` starts over after the socket reconnects.
 */
export function useChatReactions(
  agentId: string,
  baseUrl: string,
  messages: { type?: string; uuid?: string }[],
  onError: (message: string) => void,
) {
  const [reactions, setReactions] = useState<ReactionMap>({})
  const [generation, setGeneration] = useState(0)
  const asked = useRef(new Set<string>())
  const reactionsRef = useRef(reactions)
  reactionsRef.current = reactions

  const reload = useCallback(() => {
    asked.current.clear()
    setGeneration(n => n + 1)
  }, [])

  useEffect(() => {
    asked.current.clear()
    setReactions({})
    setGeneration(n => n + 1)
  }, [agentId, baseUrl])

  useEffect(() => {
    const fresh = messages
      .filter(m => (m.type === 'user' || m.type === 'assistant') && m.uuid && !asked.current.has(m.uuid))
      .map(m => m.uuid as string)
    for (const id of fresh) asked.current.add(id)
    for (let i = 0; i < fresh.length; i += REACTIONS_PAGE) {
      // A host on an older version has no reactions to show
      fetchReactions(baseUrl, agentId, fresh.slice(i, i + REACTIONS_PAGE))
        .then(found => setReactions(prev => ({ ...prev, ...found })))
        .catch(() => {})
    }
  }, [messages, agentId, baseUrl, generation])

  const apply = useCallback((event: { messageId: string; reactions: Reaction[] }) => {
    setReactions(prev => ({ ...prev, [event.messageId]: event.reactions }))
  }, [])

  const toggle = useCallback(async (messageId: string, emoji: ReactionEmoji) => {
    const mine = reactionsRef.current[messageId]?.some(r => r.emoji === emoji && r.byKind === 'operator')
    try {
      const result = await sendReaction(baseUrl, agentId, mine ? 'DELETE' : 'POST', messageId, emoji)
      apply({ messageId, reactions: result.reactions })
      if (result.reason) onError(result.reason)
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Reaction failed')
    }
  }, [agentId, baseUrl, apply, onError])

  return { reactions, apply, reload, toggle }
}
