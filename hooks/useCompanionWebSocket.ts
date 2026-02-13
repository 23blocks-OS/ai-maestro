'use client'

import { useEffect, useRef } from 'react'

interface UseCompanionWebSocketOptions {
  agentId: string | null
  onSpeech: (text: string) => void
}

/**
 * Hook for receiving speech events from the server's cerebellum voice subsystem.
 * Connects to /companion-ws?agent={agentId} and calls onSpeech when
 * the server sends a speech event.
 */
export function useCompanionWebSocket({ agentId, onSpeech }: UseCompanionWebSocketOptions) {
  const onSpeechRef = useRef(onSpeech)
  onSpeechRef.current = onSpeech

  useEffect(() => {
    if (!agentId) return

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//${window.location.host}/companion-ws?agent=${encodeURIComponent(agentId)}`

    let ws: WebSocket | null = null
    let mounted = true
    let retryCount = 0
    const maxRetries = 5
    const retryDelays = [1000, 2000, 3000, 5000, 10000]

    function connect() {
      if (!mounted) return

      ws = new WebSocket(wsUrl)

      ws.onopen = () => {
        retryCount = 0
        console.log('[CompanionWS] Connected for agent', agentId?.substring(0, 8))
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          if (data.type === 'speech' && data.text) {
            onSpeechRef.current(data.text)
          }
        } catch {
          // Ignore non-JSON messages
        }
      }

      ws.onclose = () => {
        if (mounted && retryCount < maxRetries) {
          const delay = retryDelays[retryCount] || retryDelays[retryDelays.length - 1]
          retryCount++
          setTimeout(connect, delay)
        }
      }

      ws.onerror = () => {
        // onclose will handle reconnection
      }
    }

    connect()

    return () => {
      mounted = false
      if (ws) {
        ws.close()
        ws = null
      }
    }
  }, [agentId])
}
