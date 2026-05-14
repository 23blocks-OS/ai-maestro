'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import type { WebSocketMessage, WebSocketStatus } from '@/types/websocket'

const WS_RECONNECT_DELAY = 3000
const WS_MAX_RECONNECT_ATTEMPTS = 5
const WS_HEARTBEAT_INTERVAL = 30000  // Send ping every 30s
const WS_HEARTBEAT_TIMEOUT = 10000   // Expect pong within 10s

interface UseWebSocketOptions {
  sessionId: string
  hostId?: string  // Host ID for remote sessions (peer mesh network)
  socketPath?: string  // Custom tmux socket path (e.g., OpenClaw agents)
  initialCols?: number  // Initial terminal columns for PTY spawn (avoids 80-col default)
  initialRows?: number  // Initial terminal rows for PTY spawn (avoids 24-row default)
  onMessage?: (data: string) => void
  onChatMessage?: (type: string, data: any) => void  // Callback for chat:* protocol messages
  onOpen?: () => void
  onClose?: () => void
  onError?: (error: Event) => void
  autoConnect?: boolean
}

export function useWebSocket({
  sessionId,
  hostId,
  socketPath,
  initialCols,
  initialRows,
  onMessage,
  onChatMessage,
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
  const heartbeatIntervalRef = useRef<NodeJS.Timeout>()
  const pongTimeoutRef = useRef<NodeJS.Timeout>()
  const lastDataRef = useRef<number>(Date.now())

  // CRITICAL: Store callbacks in refs so WebSocket handlers always call the latest version.
  // Without this, the WebSocket's onmessage closure captures a stale onMessage callback
  // (one where terminalInstanceRef.current is still null from initial render). The terminal
  // receives data but writes to null. Users see this as "copy/paste only works after switching
  // agents" because switching triggers a reconnect that picks up the fresh callback.
  const onMessageRef = useRef(onMessage)
  const onChatMessageRef = useRef(onChatMessage)
  const onOpenRef = useRef(onOpen)
  const onCloseRef = useRef(onClose)
  const onErrorRef = useRef(onError)

  useEffect(() => { onMessageRef.current = onMessage }, [onMessage])
  useEffect(() => { onChatMessageRef.current = onChatMessage }, [onChatMessage])
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

    // Pass initial terminal dimensions so PTY spawns at correct size
    // Without this, PTY defaults to 80x24 and history/output renders at wrong width
    if (initialCols && initialCols > 0) {
      url += `&cols=${initialCols}`
    }
    if (initialRows && initialRows > 0) {
      url += `&rows=${initialRows}`
    }

    return url
  }, [sessionId, hostId, socketPath, initialCols, initialRows])

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

  const stopHeartbeat = useCallback(() => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current)
      heartbeatIntervalRef.current = undefined
    }
    if (pongTimeoutRef.current) {
      clearTimeout(pongTimeoutRef.current)
      pongTimeoutRef.current = undefined
    }
  }, [])

  const startHeartbeat = useCallback((ws: WebSocket) => {
    stopHeartbeat()
    lastDataRef.current = Date.now()

    heartbeatIntervalRef.current = setInterval(() => {
      if (ws.readyState !== WebSocket.OPEN) {
        stopHeartbeat()
        return
      }

      // Send a ping
      try {
        ws.send(JSON.stringify({ type: 'ping' }))
      } catch {
        // Send failed — connection is dead
        stopHeartbeat()
        ws.close()
        return
      }

      // Set a per-ping timeout: if no data arrives within WS_HEARTBEAT_TIMEOUT, connection is dead
      pongTimeoutRef.current = setTimeout(() => {
        if (Date.now() - lastDataRef.current > WS_HEARTBEAT_TIMEOUT) {
          console.warn('[WS] Heartbeat timeout — no pong received, forcing reconnect')
          stopHeartbeat()
          ws.close()
        }
      }, WS_HEARTBEAT_TIMEOUT)
    }, WS_HEARTBEAT_INTERVAL)
  }, [stopHeartbeat])

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return
    }

    // Close any existing socket that isn't already closed (e.g. stuck in CONNECTING)
    // to prevent orphaned connections that leak server-side
    if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED) {
      wsRef.current.close()
      wsRef.current = null
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
        startHeartbeat(ws)
        onOpenRef.current?.()
      }

      ws.onmessage = (event) => {
        // Track last data receipt for heartbeat detection
        lastDataRef.current = Date.now()

        // Try to parse as JSON for error/status messages
        try {
          const parsed = JSON.parse(event.data)
          if (parsed.type === 'pong') {
            // Heartbeat response — already tracked via lastDataRef above
            return
          }
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

          // Route chat:* messages to the chat callback
          if (parsed.type?.startsWith('chat:')) {
            onChatMessageRef.current?.(parsed.type, parsed)
            return
          }

          // Any other JSON with a 'type' field is a protocol message we don't
          // recognize — drop it silently instead of leaking raw JSON into the
          // terminal (this prevents {"type":"ping"} / pong / etc. from appearing
          // as visible text if a new message type is added or a proxy relays it)
          if (parsed.type) {
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
        stopHeartbeat()

        // Guard against stale closures: if this socket was replaced by a newer
        // one (orphaned), don't update state or schedule reconnects
        if (wsRef.current !== ws) return

        setIsConnected(false)
        setStatus('disconnected')
        onCloseRef.current?.()

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
  }, [getWebSocketUrl, startHeartbeat, stopHeartbeat])

  const disconnect = useCallback(() => {
    stopHeartbeat()

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
    }

    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }

    setIsConnected(false)
    setStatus('disconnected')
  }, [stopHeartbeat])

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

  // MOBILE FIX: Reconnect when page becomes visible again (returning from background/tab switch)
  // Without this, once the phone sleeps or switches apps, the terminal is permanently dead
  // because all 5 reconnect attempts fire in ~15s while the app is backgrounded.
  useEffect(() => {
    if (!autoConnect) return

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Page is now visible — reconnect if WebSocket is not open
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
          reconnectAttemptsRef.current = 0 // Reset attempts so we get fresh retries
          connect()
        }
      } else {
        // Page is hidden — clear any pending reconnect timeouts (don't waste battery)
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current)
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [autoConnect, connect])

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
