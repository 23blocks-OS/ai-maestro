'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

export type SessionActivityStatus = 'active' | 'idle' | 'waiting'

export interface SessionActivityInfo {
  lastActivity: string
  status: SessionActivityStatus
  hookStatus?: string
  notificationType?: string
}

export type SessionActivityMap = Record<string, SessionActivityInfo>

/**
 * Hook to track session activity status via WebSocket for real-time updates.
 *
 * Status meanings:
 * - 'active': Terminal had recent output (Claude is working/processing)
 * - 'idle': No recent terminal activity and not waiting for input
 * - 'waiting': Claude is waiting for user input (detected via hooks)
 *
 * This is separate from online/offline/hibernated status which is about whether
 * the tmux session exists. Activity status only applies to online sessions.
 */
export function useSessionActivity() {
  const [activity, setActivity] = useState<SessionActivityMap>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [connected, setConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const connect = useCallback(() => {
    // Clean up existing connection
    if (wsRef.current) {
      wsRef.current.close()
    }

    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const ws = new WebSocket(`${protocol}//${window.location.host}/status`)
      wsRef.current = ws

      ws.onopen = () => {
        console.log('[useSessionActivity] WebSocket connected')
        setConnected(true)
        setError(null)
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)

          if (data.type === 'initial_status') {
            // Initial status from server
            setActivity(data.activity || {})
            setLoading(false)
          } else if (data.type === 'status_update') {
            // Real-time status update
            setActivity(prev => ({
              ...prev,
              [data.sessionName]: {
                lastActivity: data.timestamp,
                status: data.status,
                hookStatus: data.hookStatus,
                notificationType: data.notificationType
              }
            }))
          }
        } catch (err) {
          console.error('[useSessionActivity] Failed to parse message:', err)
        }
      }

      ws.onclose = () => {
        console.log('[useSessionActivity] WebSocket disconnected')
        setConnected(false)

        // Reconnect after 2 seconds
        reconnectTimeoutRef.current = setTimeout(() => {
          console.log('[useSessionActivity] Reconnecting...')
          connect()
        }, 2000)
      }

      ws.onerror = (err) => {
        console.error('[useSessionActivity] WebSocket error:', err)
        setError(new Error('WebSocket connection failed'))
      }
    } catch (err) {
      console.error('[useSessionActivity] Failed to create WebSocket:', err)
      setError(err instanceof Error ? err : new Error('Unknown error'))
      setLoading(false)
    }
  }, [])

  // Fallback: Poll API if WebSocket fails
  const fetchActivity = useCallback(async () => {
    try {
      const response = await fetch('/api/sessions/activity')
      if (response.ok) {
        const data = await response.json()
        setActivity(data.activity || {})
        setLoading(false)
      }
    } catch (err) {
      console.error('[useSessionActivity] Poll failed:', err)
    }
  }, [])

  // Connect on mount and poll as fallback
  useEffect(() => {
    // Initial fetch immediately
    fetchActivity()

    // Try WebSocket connection
    connect()

    // Poll every 2s as fallback (WebSocket updates will override if connected)
    const pollInterval = setInterval(fetchActivity, 2000)

    return () => {
      clearInterval(pollInterval)
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
      if (wsRef.current) {
        wsRef.current.close()
      }
    }
  }, [connect, fetchActivity])

  /**
   * Get activity status for a specific session
   * @param sessionName The tmux session name
   * @returns Activity info or null if not found
   */
  const getSessionActivity = useCallback(
    (sessionName: string): SessionActivityInfo | null => {
      return activity[sessionName] || null
    },
    [activity]
  )

  /**
   * Check if a session is currently waiting for user input
   * @param sessionName The tmux session name
   */
  const isSessionWaiting = useCallback(
    (sessionName: string): boolean => {
      const info = activity[sessionName]
      return info?.status === 'waiting'
    },
    [activity]
  )

  /**
   * Check if a session is currently active (processing)
   * @param sessionName The tmux session name
   */
  const isSessionActive = useCallback(
    (sessionName: string): boolean => {
      const info = activity[sessionName]
      return info?.status === 'active'
    },
    [activity]
  )

  return {
    activity,
    loading,
    error,
    connected,
    getSessionActivity,
    isSessionWaiting,
    isSessionActive,
    reconnect: connect,
  }
}
