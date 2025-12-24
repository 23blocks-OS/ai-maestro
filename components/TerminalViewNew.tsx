'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useTerminal } from '@/hooks/useTerminal'
import { useWebSocket } from '@/hooks/useWebSocket'
import { createResizeMessage } from '@/lib/websocket'
import type { Session } from '@/types/session'

interface TerminalViewNewProps {
  session: Session
  isVisible?: boolean
}

export default function TerminalViewNew({ session, isVisible = true }: TerminalViewNewProps) {
  const terminalRef = useRef<HTMLDivElement>(null)
  const [isReady, setIsReady] = useState(false)
  const messageBufferRef = useRef<string[]>([])

  // Use the same useTerminal hook as TerminalView for consistent behavior
  const { terminal, initializeTerminal, fitTerminal } = useTerminal({
    sessionId: session.id,
  })

  // Store terminal in ref for WebSocket callback access
  const terminalInstanceRef = useRef<typeof terminal>(null)

  useEffect(() => {
    terminalInstanceRef.current = terminal
  }, [terminal])

  const { isConnected, sendMessage } = useWebSocket({
    sessionId: session.id,
    hostId: session.hostId,
    autoConnect: isVisible,
    onMessage: (data) => {
      // Check if this is a control message (JSON)
      try {
        const parsed = JSON.parse(data)

        // Handle history-complete message
        if (parsed.type === 'history-complete') {
          if (terminalInstanceRef.current) {
            const term = terminalInstanceRef.current

            // Wait for xterm.js to finish processing history
            setTimeout(() => {
              // 1. Refit terminal to ensure correct dimensions
              fitTerminal()

              // 2. Send resize to PTY to sync tmux with correct dimensions
              const resizeMsg = createResizeMessage(term.cols, term.rows)
              sendMessage(resizeMsg)

              // 3. Scroll to bottom and focus
              setTimeout(() => {
                term.scrollToBottom()
                term.focus()
              }, 50)
            }, 100)
          }
          return
        }

        // Handle pong (heartbeat response)
        if (parsed.type === 'pong') {
          return
        }

        // Handle container connection message
        if (parsed.type === 'connected') {
          console.log(`[TerminalNew] Connected to agent: ${parsed.agentId}`)
          return
        }

        // Unknown JSON message type - might be terminal data that's valid JSON
        // Fall through to write it
      } catch {
        // Not JSON - it's terminal data
      }

      // Write data to terminal
      if (terminalInstanceRef.current) {
        terminalInstanceRef.current.write(data)
      } else {
        // Buffer messages until terminal is ready
        messageBufferRef.current.push(data)
      }
    },
  })

  // Initialize terminal ONCE on mount with retry logic
  useEffect(() => {
    let cleanup: (() => void) | undefined
    let retryCount = 0
    const maxRetries = 10
    const retryDelay = 100
    let retryTimer: NodeJS.Timeout | null = null
    let mounted = true

    const tryInit = async () => {
      if (!mounted) return

      // Wait for DOM ref
      if (!terminalRef.current) {
        if (retryCount < maxRetries) {
          retryCount++
          retryTimer = setTimeout(tryInit, retryDelay)
        }
        return
      }

      // Check container has valid dimensions
      const rect = terminalRef.current.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) {
        if (retryCount < maxRetries) {
          retryCount++
          retryTimer = setTimeout(tryInit, retryDelay)
        }
        return
      }

      try {
        cleanup = await initializeTerminal(terminalRef.current)
        if (mounted) {
          setIsReady(true)
        }
      } catch (error) {
        console.error(`[TerminalNew] Failed to initialize:`, error)
      }
    }

    tryInit()

    return () => {
      mounted = false
      if (retryTimer) clearTimeout(retryTimer)
      if (cleanup) cleanup()
      setIsReady(false)
      messageBufferRef.current = []
    }
  }, [initializeTerminal])

  // Flush buffered messages when terminal becomes ready
  useEffect(() => {
    if (terminal && messageBufferRef.current.length > 0) {
      messageBufferRef.current.forEach((msg) => {
        terminal.write(msg)
      })
      messageBufferRef.current = []
    }
  }, [terminal])

  // Handle terminal input
  useEffect(() => {
    if (!terminal || !isConnected) return

    const disposable = terminal.onData((data) => {
      sendMessage(data)
    })

    return () => disposable.dispose()
  }, [terminal, isConnected, sendMessage])

  // Handle terminal resize
  useEffect(() => {
    if (!terminal || !isConnected) return

    const disposable = terminal.onResize(({ cols, rows }) => {
      sendMessage(createResizeMessage(cols, rows))
    })

    return () => disposable.dispose()
  }, [terminal, isConnected, sendMessage])

  // Copy selection handler
  const copySelection = useCallback(() => {
    if (!terminal) return
    const selection = terminal.getSelection()
    if (selection) {
      navigator.clipboard.writeText(selection)
    }
  }, [terminal])

  return (
    <div className="flex flex-col w-full h-full bg-[#0d1117]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#161b22] border-b border-[#30363d] flex-shrink-0">
        <div className="flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full ${
              isConnected ? 'bg-green-500' : 'bg-red-500'
            }`}
          />
          <span className="text-sm text-[#c9d1d9]">
            {session.name || session.id}
          </span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={copySelection}
            className="px-2 py-1 text-xs text-[#8b949e] hover:text-white transition-colors"
          >
            Copy
          </button>
          <button
            onClick={() => terminal?.clear()}
            className="px-2 py-1 text-xs text-[#8b949e] hover:text-white transition-colors"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Terminal container */}
      <div
        ref={terminalRef}
        className="flex-1 min-h-0 w-full overflow-hidden"
        onMouseDown={() => terminalInstanceRef.current?.focus()}
      />

      {/* Loading state */}
      {!isReady && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0d1117]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-400 mx-auto mb-2" />
            <p className="text-sm text-gray-400">Initializing terminal...</p>
          </div>
        </div>
      )}
    </div>
  )
}
