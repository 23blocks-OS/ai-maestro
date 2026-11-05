'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import type { MessageSummary } from '@/lib/messageQueue'

interface MeetingMessage extends MessageSummary {
  isMine: boolean       // Sent by Maestro
  displayFrom: string   // Resolved display name
}

export interface MeetingAgentDelivery {
  agentId: string
  name: string
  hostId?: string
  status: 'delivered' | 'failed'
  notified: boolean
  verified: boolean
  deferred: boolean
  error?: string
}

/** What happened to the last message sent: one row per agent */
export interface MeetingDelivery {
  message: string
  sentAt: string
  results: MeetingAgentDelivery[]
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
  lastDelivery: MeetingDelivery | null
  retryFailed: () => Promise<void>
  dismissDelivery: () => void
  markAsRead: () => void
  loading: boolean
  /** The poll failed several times in a row: the chat is not updating (B029) */
  notUpdating: boolean
}

const POLL_TIMEOUT_MS = 10_000
const FAILURES_BEFORE_NOTICE = 3

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
  const [lastDelivery, setLastDelivery] = useState<MeetingDelivery | null>(null)
  // B029: a poll had no timeout and swallowed every error, and a hung one was stacked on every 7 s
  const pollingRef = useRef(0)
  // Bumped when the meeting (or who is in it) changes: a poll started for the previous one is dropped
  const generationRef = useRef(0)
  const failuresRef = useRef(0)
  const [notUpdating, setNotUpdating] = useState(false)

  // Stabilize participantIds — only change when the sorted list actually changes
  const participantKey = useMemo(() => [...participantIds].sort().join(','), [participantIds])
  const stableParticipantIds = useRef(participantIds)
  useEffect(() => {
    stableParticipantIds.current = participantIds
  }, [participantKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // `force`: the first load and the refresh after a send run even while a background poll is in flight
  const fetchMessages = useCallback(async (force = false) => {
    const pIds = stableParticipantIds.current
    if (!meetingId || !isActive || pIds.length === 0) return
    if (pollingRef.current > 0 && !force) return
    pollingRef.current++
    const generation = generationRef.current

    try {
      const params = new URLSearchParams({
        meetingId,
        participants: pIds.join(','),
      })
      if (lastFetchRef.current) {
        params.set('since', lastFetchRef.current)
      }

      const res = await fetch(`/api/messages/meeting?${params}`, { signal: AbortSignal.timeout(POLL_TIMEOUT_MS) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      const data = await res.json()
      if (generation !== generationRef.current) return // the meeting changed while this poll ran
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
      failuresRef.current = 0
      setNotUpdating(false)
    } catch (err) {
      if (generation !== generationRef.current) return
      failuresRef.current++
      console.warn(`[Meeting] Message poll failed (${failuresRef.current} in a row):`, err instanceof Error ? err.message : err)
      if (failuresRef.current >= FAILURES_BEFORE_NOTICE) setNotUpdating(true)
    } finally {
      pollingRef.current--
    }
  }, [meetingId, isActive, participantKey])

  // Initial fetch
  useEffect(() => {
    generationRef.current++
    failuresRef.current = 0
    setNotUpdating(false)
    if (!meetingId || !isActive) {
      setMessages([])
      lastFetchRef.current = null
      seenCountRef.current = 0
      return
    }
    setLoading(true)
    fetchMessages(true).finally(() => setLoading(false))
  }, [meetingId, isActive, fetchMessages])

  // Poll every 7s
  useEffect(() => {
    if (!meetingId || !isActive) return
    intervalRef.current = setInterval(() => { void fetchMessages() }, 7000)
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

  // One call to the server sends to everyone and answers per agent; a failure is shown, never swallowed
  const post = useCallback(async (message: string, recipients?: string[]): Promise<MeetingDelivery> => {
    const sentAt = new Date().toISOString()
    try {
      const res = await fetch(`/api/meetings/${encodeURIComponent(meetingId || '')}/broadcast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, participantIds: stableParticipantIds.current, teamName, recipients }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const reason = data?.message || `the server answered ${res.status}`
        const ids = recipients || stableParticipantIds.current
        return { message, sentAt, results: ids.map(agentId => ({ agentId, name: agentId.slice(0, 8), status: 'failed' as const, notified: false, verified: false, deferred: false, error: reason })) }
      }
      return { message, sentAt, results: data.results || [] }
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'the request failed'
      const ids = recipients || stableParticipantIds.current
      return { message, sentAt, results: ids.map(agentId => ({ agentId, name: agentId.slice(0, 8), status: 'failed' as const, notified: false, verified: false, deferred: false, error: reason })) }
    }
  }, [meetingId, teamName])

  const finish = useCallback((delivery: MeetingDelivery) => {
    // Merge with a previous try of the same text: a retry replaces the failed rows, keeps the delivered ones
    setLastDelivery(prev => {
      if (!prev || prev.message !== delivery.message) return delivery
      const retried = new Set(delivery.results.map(r => r.agentId))
      return { ...delivery, results: [...prev.results.filter(r => !retried.has(r.agentId)), ...delivery.results] }
    })
    // Every send failed: nothing arrived, so the optimistic bubble would lie
    if (delivery.results.length > 0 && delivery.results.every(r => r.status === 'failed')) {
      setMessages(prev => prev.filter(m => !(m.id.startsWith('optimistic-') && m.preview === delivery.message)))
    }
    // Refresh after a short delay to let file I/O settle
    setTimeout(() => fetchMessages(true), 300)
  }, [fetchMessages])

  const sendToAgent = useCallback(async (agentId: string, message: string) => {
    if (!meetingId) return
    addOptimistic(message, agentId)
    finish(await post(message, [agentId]))
  }, [meetingId, post, addOptimistic, finish])

  const broadcastToAll = useCallback(async (message: string) => {
    if (!meetingId) return
    // One optimistic message for the broadcast (not N copies)
    addOptimistic(message)
    finish(await post(message))
  }, [meetingId, post, addOptimistic, finish])

  const retryFailed = useCallback(async () => {
    if (!meetingId || !lastDelivery) return
    const failed = lastDelivery.results.filter(r => r.status === 'failed').map(r => r.agentId)
    if (failed.length === 0) return
    finish(await post(lastDelivery.message, failed))
  }, [meetingId, lastDelivery, post, finish])

  const dismissDelivery = useCallback(() => setLastDelivery(null), [])

  const markAsRead = useCallback(() => {
    seenCountRef.current = messages.length
  }, [messages.length])

  const unreadCount = Math.max(0, messages.length - seenCountRef.current)

  return {
    messages,
    unreadCount,
    sendToAgent,
    broadcastToAll,
    lastDelivery,
    retryFailed,
    dismissDelivery,
    markAsRead,
    loading,
    notUpdating,
  }
}
