'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import type { WebSocketMessage, WebSocketStatus } from '@/types/websocket'

const WS_RECONNECT_DELAY = 3000
const WS_MAX_RECONNECT_ATTEMPTS = 5

interface UseWebSocketOptions {
  sessionId: string
  onMessage?: (data: string) => void
  onOpen?: () => void
  onClose?: () => void
  onError?: (error: Event) => void
  autoConnect?: boolean
}

export function useWebSocket({
  sessionId,
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

  const wsRef = useRef<WebSocket | null>(null)
  const reconnectAttemptsRef = useRef(0)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>()

  const getWebSocketUrl = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = window.location.host
    return `${protocol}//${host}/term?name=${encodeURIComponent(sessionId)}`
  }, [sessionId])

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
        // Try to parse as JSON for error messages
        try {
          const parsed = JSON.parse(event.data)
          if (parsed.type === 'error') {
            setConnectionError(new Error(parsed.message))
            if (parsed.hint) {
              setErrorHint(parsed.hint)
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

      ws.onclose = () => {
        setIsConnected(false)
        setStatus('disconnected')
        onClose?.()

        // Attempt reconnection
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

  // Auto-connect on mount
  useEffect(() => {
    if (autoConnect) {
      connect()
    }

    return () => {
      disconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]) // Reconnect when session changes

  return {
    isConnected,
    connectionError,
    errorHint,
    status,
    sendMessage,
    connect,
    disconnect,
  }
}
