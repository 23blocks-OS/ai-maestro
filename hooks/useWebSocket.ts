'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import type { WebSocketMessage, WebSocketStatus } from '@/types/websocket'

// SF-011: Exponential backoff delays as documented in CLAUDE.md architecture section
const WS_RECONNECT_BACKOFF = [100, 500, 1000, 2000, 5000]
const WS_MAX_RECONNECT_ATTEMPTS = WS_RECONNECT_BACKOFF.length

interface UseWebSocketOptions {
  sessionId: string
  hostId?: string  // Host ID for remote sessions (peer mesh network)
  socketPath?: string  // Custom tmux socket path (e.g., OpenClaw agents)
  onMessage?: (data: string) => void
  onOpen?: () => void
  onClose?: () => void
  onError?: (error: Event) => void
  autoConnect?: boolean
}

export function useWebSocket({
  sessionId,
  hostId,
  socketPath,
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

  // CRITICAL: Store callbacks in refs so WebSocket handlers always call the latest version.
  // Without this, the WebSocket's onmessage closure captures a stale onMessage callback
  // (one where terminalInstanceRef.current is still null from initial render). The terminal
  // receives data but writes to null. Users see this as "copy/paste only works after switching
  // agents" because switching triggers a reconnect that picks up the fresh callback.
  const onMessageRef = useRef(onMessage)
  const onOpenRef = useRef(onOpen)
  const onCloseRef = useRef(onClose)
  const onErrorRef = useRef(onError)

  useEffect(() => { onMessageRef.current = onMessage }, [onMessage])
  useEffect(() => { onOpenRef.current = onOpen }, [onOpen])
  useEffect(() => { onCloseRef.current = onClose }, [onClose])
  useEffect(() => { onErrorRef.current = onError }, [onError])

  const getWebSocketUrl = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = window.location.host
    let url = `${protocol}//${host}/term?name=${encodeURIComponent(sessionId)}`

    // Add host parameter for remote sessions (peer mesh network)
    if (hostId) {
      url += `&host=${encodeURIComponent(hostId)}`
    }

    // Add socket parameter for custom tmux sockets (e.g., OpenClaw)
    if (socketPath) {
      url += `&socket=${encodeURIComponent(socketPath)}`
    }

    return url
  }, [sessionId, hostId, socketPath])

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
        onOpenRef.current?.()
      }

      // NT-010: WebSocket message type routing:
      // This layer (useWebSocket) handles protocol-level messages:
      //   - 'error'  → sets connectionError + errorHint state
      //   - 'status' → sets connectionMessage (e.g., remote retry progress)
      //   - non-JSON  → forwarded to onMessage callback (terminal data for TerminalView)
      // TerminalView's onMessage callback handles the raw terminal data (ANSI output).
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

        onMessageRef.current?.(event.data)
      }

      ws.onerror = (error) => {
        console.error('WebSocket error:', error)
        setConnectionError(new Error('WebSocket connection error'))
        setStatus('error')
        onErrorRef.current?.(error)
      }

      ws.onclose = (event) => {
        setIsConnected(false)
        setStatus('disconnected')
        onCloseRef.current?.()

        // Close code 4000 = permanent failure, don't retry (e.g., remote host unreachable after retries)
        if (event.code === 4000) {
          console.log('WebSocket closed with permanent failure code, not retrying')
          setConnectionError(new Error(event.reason || 'Connection failed permanently'))
          return
        }

        // Attempt reconnection for transient failures with exponential backoff
        if (reconnectAttemptsRef.current < WS_MAX_RECONNECT_ATTEMPTS) {
          // SF-011: Use exponential backoff delay from the documented backoff array
          const delay = WS_RECONNECT_BACKOFF[reconnectAttemptsRef.current] ?? WS_RECONNECT_BACKOFF[WS_RECONNECT_BACKOFF.length - 1]
          reconnectAttemptsRef.current++

          reconnectTimeoutRef.current = setTimeout(() => {
            connect()
          }, delay)
        } else {
          setConnectionError(
            new Error('Failed to connect after maximum reconnection attempts')
          )
        }
      }

      wsRef.current = ws
    } catch (error) {
      console.error('Failed to create WebSocket:', error)
      // SF-009: Safe error coercion — WebSocket constructor can throw non-Error types
      setConnectionError(error instanceof Error ? error : new Error(String(error)))
      setStatus('error')
    }
  }, [getWebSocketUrl])

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
    }

    // MF-008: Reset reconnect counter so next connect() starts fresh
    reconnectAttemptsRef.current = 0

    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }

    setIsConnected(false)
    setStatus('disconnected')
  }, [])

  // Auto-connect on mount or when connection parameters change
  // NT-019: Include hostId and socketPath in deps -- changing host/socket should
  // trigger disconnect (which resets reconnectAttemptsRef) then reconnect
  // SF-041: Include connect and disconnect in deps for React hooks exhaustive-deps correctness
  useEffect(() => {
    if (autoConnect) {
      connect()
    } else {
      disconnect()
    }

    return () => {
      disconnect()
    }
  }, [sessionId, hostId, socketPath, autoConnect, connect, disconnect])

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
