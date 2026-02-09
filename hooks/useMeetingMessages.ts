'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import type { MessageSummary } from '@/lib/messageQueue'

interface MeetingMessage extends MessageSummary {
  isMine: boolean       // Sent by Maestro
  displayFrom: string   // Resolved display name
}

interface UseMeetingMessagesOptions {
  meetingId: string | null
  participantIds: string[]
  teamName: string
  isActive: boolean
}

interface UseMeetingMessagesResult {
  messages: MeetingMessage[]
  unreadCount: number
  sendToAgent: (agentId: string, message: string) => Promise<void>
  broadcastToAll: (message: string) => Promise<void>
  markAsRead: () => void
  loading: boolean
}

export function useMeetingMessages({
  meetingId,
  participantIds,
  teamName,
  isActive,
}: UseMeetingMessagesOptions): UseMeetingMessagesResult {
  const [messages, setMessages] = useState<MeetingMessage[]>([])
  const [loading, setLoading] = useState(false)
  const lastFetchRef = useRef<string | null>(null)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const seenCountRef = useRef(0)

  // Stabilize participantIds — only change when the sorted list actually changes
  const participantKey = useMemo(() => [...participantIds].sort().join(','), [participantIds])
  const stableParticipantIds = useRef(participantIds)
  useEffect(() => {
    stableParticipantIds.current = participantIds
  }, [participantKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchMessages = useCallback(async () => {
    const pIds = stableParticipantIds.current
    if (!meetingId || !isActive || pIds.length === 0) return

    try {
      const params = new URLSearchParams({
        meetingId,
        participants: pIds.join(','),
      })
      if (lastFetchRef.current) {
        params.set('since', lastFetchRef.current)
      }

      const res = await fetch(`/api/messages/meeting?${params}`)
      if (!res.ok) return

      const data = await res.json()
      const newMessages: MeetingMessage[] = (data.messages || []).map((msg: MessageSummary) => ({
        ...msg,
        isMine: msg.from === 'maestro' || msg.fromAlias === 'Maestro',
        displayFrom: msg.fromLabel || msg.fromAlias || msg.from,
      }))

      if (lastFetchRef.current && newMessages.length > 0) {
        // Incremental: append new messages, replace optimistic ones
        setMessages(prev => {
          const existingIds = new Set(prev.filter(m => !m.id.startsWith('optimistic-')).map(m => m.id))
          const toAdd = newMessages.filter(m => !existingIds.has(m.id))
          if (toAdd.length === 0) return prev
          // Remove optimistic messages that now have real counterparts
          const withoutOptimistic = prev.filter(m => !m.id.startsWith('optimistic-'))
          return [...withoutOptimistic, ...toAdd]
        })
      } else if (!lastFetchRef.current) {
        // Initial fetch: replace all (including any optimistic)
        setMessages(newMessages)
        seenCountRef.current = newMessages.length
      }

      if (newMessages.length > 0) {
        const latest = newMessages[newMessages.length - 1]
        lastFetchRef.current = latest.timestamp
      }
    } catch {
      // Silently fail on poll errors
    }
  }, [meetingId, isActive, participantKey])

  // Initial fetch
  useEffect(() => {
    if (!meetingId || !isActive) {
      setMessages([])
      lastFetchRef.current = null
      seenCountRef.current = 0
      return
    }
    setLoading(true)
    fetchMessages().finally(() => setLoading(false))
  }, [meetingId, isActive, fetchMessages])

  // Poll every 7s
  useEffect(() => {
    if (!meetingId || !isActive) return
    intervalRef.current = setInterval(fetchMessages, 7000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [meetingId, isActive, fetchMessages])

  // Show a message optimistically before server confirms
  const addOptimistic = useCallback((text: string, toAgent?: string) => {
    const optimistic: MeetingMessage = {
      id: `optimistic-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      from: 'maestro',
      fromAlias: 'Maestro',
      to: toAgent || 'all',
      toAlias: toAgent ? undefined : 'All',
      timestamp: new Date().toISOString(),
      subject: `[MEETING:${meetingId}]`,
      preview: text,
      status: 'unread',
      priority: 'normal',
      type: 'notification',
      isMine: true,
      displayFrom: 'Maestro',
    }
    setMessages(prev => [...prev, optimistic])
  }, [meetingId])

  const sendToAgent = useCallback(async (agentId: string, message: string) => {
    if (!meetingId) return
    const pIds = stableParticipantIds.current
    addOptimistic(message, agentId)
    try {
      await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'maestro',
          fromAlias: 'Maestro',
          to: agentId,
          subject: `[MEETING:${meetingId}] ${teamName}`,
          content: {
            type: 'notification',
            message,
            context: {
              meeting: {
                meetingId,
                teamName,
                participantIds: pIds,
                isBroadcast: false,
              },
            },
          },
        }),
      })
    } catch (err) {
      console.error('Failed to send message:', err)
    }
    // Refresh after a short delay to let file I/O settle
    setTimeout(() => fetchMessages(), 300)
  }, [meetingId, teamName, participantKey, fetchMessages, addOptimistic])

  const broadcastToAll = useCallback(async (message: string) => {
    if (!meetingId) return
    const pIds = stableParticipantIds.current
    // Show one optimistic message for the broadcast (not N copies)
    addOptimistic(message)
    // Send individual messages to each participant
    await Promise.all(
      pIds.map(agentId =>
        fetch('/api/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: 'maestro',
            fromAlias: 'Maestro',
            to: agentId,
            subject: `[MEETING:${meetingId}] ${teamName}`,
            content: {
              type: 'notification',
              message,
              context: {
                meeting: {
                  meetingId,
                  teamName,
                  participantIds: pIds,
                  isBroadcast: true,
                },
              },
            },
          }),
        }).catch(err => console.error(`Failed to send to ${agentId}:`, err))
      )
    )
    // Refresh after a short delay to let file I/O settle
    setTimeout(() => fetchMessages(), 300)
  }, [meetingId, teamName, participantKey, fetchMessages, addOptimistic])

  const markAsRead = useCallback(() => {
    seenCountRef.current = messages.length
  }, [messages.length])

  const unreadCount = Math.max(0, messages.length - seenCountRef.current)

  return {
    messages,
    unreadCount,
    sendToAgent,
    broadcastToAll,
    markAsRead,
    loading,
  }
}
