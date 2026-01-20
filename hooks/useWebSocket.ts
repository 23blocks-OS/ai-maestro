'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import type { WebSocketMessage, WebSocketStatus } from '@/types/websocket'

const WS_RECONNECT_DELAY = 3000
const WS_MAX_RECONNECT_ATTEMPTS = 5

interface UseWebSocketOptions {
  sessionId: string
  hostId?: string  // Host ID for remote sessions (Manager/Worker pattern)
  onMessage?: (data: string) => void
  onOpen?: () => void
  onClose?: () => void
  onError?: (error: Event) => void
  autoConnect?: boolean
}

export function useWebSocket({
  sessionId,
  hostId,
  onMessage,
  onOpen,
  onClose,
  onError,
  autoConnect = true,
}: UseWebSocketOptions) {
  const [isConnected, setIsConnected] = useState(false)
  const [connectionError, setConnectionError] = useState<Error | null>(null)
  const [errorHint, setErrorHint] = useState<string | null>(null)
  const [status, setStatus] = useState<WebSocketStatus>('disconnected')
  const [connectionMessage, setConnectionMessage] = useState<string | null>(null)

  const wsRef = useRef<WebSocket | null>(null)
  const reconnectAttemptsRef = useRef(0)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>()

  const getWebSocketUrl = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = window.location.host
    let url = `${protocol}//${host}/term?name=${encodeURIComponent(sessionId)}`

    // Add host parameter for remote sessions (Manager/Worker pattern)
    if (hostId) {
      url += `&host=${encodeURIComponent(hostId)}`
    }

    return url
  }, [sessionId, hostId])

  const sendMessage = useCallback((data: string | WebSocketMessage) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.warn('WebSocket is not connected')
      return false
    }

    try {
      const message = typeof data === 'string' ? data : JSON.stringify(data)
      wsRef.current.send(message)
      return true
    } catch (error) {
      console.error('Failed to send message:', error)
      return false
    }
  }, [])

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return
    }

    setStatus('connecting')
    setConnectionError(null)

    try {
      const ws = new WebSocket(getWebSocketUrl())

      ws.onopen = () => {
        setIsConnected(true)
        setStatus('connected')
        setConnectionError(null)
        reconnectAttemptsRef.current = 0
        onOpen?.()
      }

      ws.onmessage = (event) => {
        // Try to parse as JSON for error/status messages
        try {
          const parsed = JSON.parse(event.data)
          if (parsed.type === 'error') {
            setConnectionError(new Error(parsed.message))
            if (parsed.hint) {
              setErrorHint(parsed.hint)
            }
            return
          }
          if (parsed.type === 'status') {
            // Status message from server (e.g., retry status for remote connections)
            setConnectionMessage(parsed.message)
            if (parsed.statusType === 'success') {
              setConnectionMessage(null) // Clear on success
            }
            return
          }
        } catch {
          // Not JSON, treat as terminal data
        }

        onMessage?.(event.data)
      }

      ws.onerror = (error) => {
        console.error('WebSocket error:', error)
        setConnectionError(new Error('WebSocket connection error'))
        setStatus('error')
        onError?.(error)
      }

      ws.onclose = (event) => {
        setIsConnected(false)
        setStatus('disconnected')
        onClose?.()

        // Close code 4000 = permanent failure, don't retry (e.g., remote host unreachable after retries)
        if (event.code === 4000) {
          console.log('WebSocket closed with permanent failure code, not retrying')
          setConnectionError(new Error(event.reason || 'Connection failed permanently'))
          return
        }

        // Attempt reconnection for transient failures
        if (reconnectAttemptsRef.current < WS_MAX_RECONNECT_ATTEMPTS) {
          reconnectAttemptsRef.current++

          reconnectTimeoutRef.current = setTimeout(() => {
            connect()
          }, WS_RECONNECT_DELAY)
        } else {
          setConnectionError(
            new Error('Failed to connect after maximum reconnection attempts')
          )
        }
      }

      wsRef.current = ws
    } catch (error) {
      console.error('Failed to create WebSocket:', error)
      setConnectionError(error as Error)
      setStatus('error')
    }
  }, [getWebSocketUrl, onMessage, onOpen, onClose, onError])

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
    }

    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }

    setIsConnected(false)
    setStatus('disconnected')
  }, [])

  // Auto-connect on mount or when autoConnect changes
  useEffect(() => {
    if (autoConnect) {
      connect()
    } else {
      disconnect()
    }

    return () => {
      disconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, autoConnect]) // Reconnect when session changes or visibility changes

  return {
    isConnected,
    connectionError,
    errorHint,
    connectionMessage,
    status,
    sendMessage,
    connect,
    disconnect,
  }
}
