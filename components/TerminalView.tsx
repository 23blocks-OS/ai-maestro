'use client'

import { useEffect, useRef, useState } from 'react'
import { useTerminal } from '@/hooks/useTerminal'
import { useWebSocket } from '@/hooks/useWebSocket'
import { createResizeMessage } from '@/lib/websocket'
import { useTerminalRegistry } from '@/contexts/TerminalContext'
import type { Session } from '@/types/session'

interface TerminalViewProps {
  session: Session
}

export default function TerminalView({ session }: TerminalViewProps) {
  const terminalRef = useRef<HTMLDivElement>(null)
  const [isReady, setIsReady] = useState(false)
  const messageBufferRef = useRef<string[]>([])
  const [notes, setNotes] = useState('')
  const [isMobile, setIsMobile] = useState(false)
  // Default to collapsed on mobile, expanded on desktop
  const [notesCollapsed, setNotesCollapsed] = useState(false)
  const [loggingEnabled, setLoggingEnabled] = useState(true)
  const [globalLoggingEnabled, setGlobalLoggingEnabled] = useState(false)

  // Detect mobile on mount
  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768
      setIsMobile(mobile)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Fetch global logging configuration on mount
  useEffect(() => {
    fetch('/api/config')
      .then(res => res.json())
      .then(data => setGlobalLoggingEnabled(data.loggingEnabled))
      .catch(err => console.error('Failed to fetch config:', err))
  }, [])

  const { registerTerminal, unregisterTerminal, reportActivity } = useTerminalRegistry()

  // Register session immediately when component mounts (for activity tracking)
  // This ensures status shows correctly even before terminal is fully initialized
  useEffect(() => {
    // Register with a dummy fitAddon initially - will be updated when terminal initializes
    const dummyFitAddon = { fit: () => {} } as any
    registerTerminal(session.id, dummyFitAddon)

    return () => {
      unregisterTerminal(session.id)
    }
  }, [session.id, registerTerminal, unregisterTerminal])

  const { terminal, initializeTerminal, fitTerminal } = useTerminal({
    sessionId: session.id,
    onRegister: (fitAddon) => {
      // Update registration with real fitAddon when terminal is ready
      registerTerminal(session.id, fitAddon)
    },
    onUnregister: () => {
      // Don't unregister here - let the component unmount handle it
    },
  })

  // Store terminal in a ref so the WebSocket callback can access the current value
  const terminalInstanceRef = useRef<typeof terminal>(null)

  useEffect(() => {
    terminalInstanceRef.current = terminal
  }, [terminal])

  const { isConnected, sendMessage, connectionError, errorHint } = useWebSocket({
    sessionId: session.id,
    onOpen: () => {
      // Report activity when WebSocket connects
      reportActivity(session.id)
    },
    onMessage: (data) => {
      // Check if this is a control message (JSON)
      try {
        const parsed = JSON.parse(data)

        // Handle history-complete message
        if (parsed.type === 'history-complete') {
          // After initial history loads, trigger fit to recalculate scrollback viewport
          // This fixes the issue where scrollback is unreachable until window resize
          setTimeout(() => {
            fitTerminal()
          }, 50)
          return
        }
      } catch {
        // Not JSON - it's terminal data, continue processing
      }

      // Only report activity for substantial content (not cursor blinks or control sequences)
      // Filter out idle terminal noise to properly detect active vs idle state

      // Always write data to terminal first
      if (terminalInstanceRef.current) {
        terminalInstanceRef.current.write(data)
      } else {
        messageBufferRef.current.push(data)
      }

      // Skip reporting activity for tiny packets (likely just control codes)
      if (data.length < 3) return

      // Skip pure escape sequences without printable content
      // Escape sequences start with ESC (\x1b) and contain only control characters
      const isPureEscape = data.startsWith('\x1b') && !/[\x20-\x7E]/.test(data)
      if (isPureEscape) return

      // This looks like real content - report activity
      reportActivity(session.id)
    },
  })

  // Initialize terminal when component mounts or session changes
  useEffect(() => {
    if (!terminalRef.current) return

    let cleanup: (() => void) | undefined

    const init = async () => {
      // Clear message buffer for new session
      messageBufferRef.current = []
      cleanup = await initializeTerminal(terminalRef.current!)
      setIsReady(true)
    }

    init()

    return () => {
      if (cleanup) {
        cleanup()
      }
      setIsReady(false)
      messageBufferRef.current = []
    }
    // Only re-initialize when session changes, not when initializeTerminal changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id])

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
    if (!terminal || !isConnected) {
      return
    }

    const disposable = terminal.onData((data) => {
      sendMessage(data)
    })

    return () => {
      disposable.dispose()
    }
  }, [terminal, isConnected, sendMessage])

  // Handle terminal resize
  useEffect(() => {
    if (!terminal || !isConnected) return

    const disposable = terminal.onResize(({ cols, rows }) => {
      const message = createResizeMessage(cols, rows)
      sendMessage(message)
    })

    return () => {
      disposable.dispose()
    }
  }, [terminal, isConnected, sendMessage])

  // Load notes from localStorage when session changes
  useEffect(() => {
    const storageKey = `session-notes-${session.id}`
    const savedNotes = localStorage.getItem(storageKey)
    if (savedNotes !== null) {
      setNotes(savedNotes)
    } else {
      setNotes('')
    }

    // Load collapsed state - default to collapsed on mobile if no saved state
    const collapsedKey = `session-notes-collapsed-${session.id}`
    const savedCollapsed = localStorage.getItem(collapsedKey)
    if (savedCollapsed !== null) {
      setNotesCollapsed(savedCollapsed === 'true')
    } else {
      // Default behavior: collapsed on mobile, expanded on desktop
      setNotesCollapsed(isMobile)
    }

    // Load logging state - default to enabled
    const loggingKey = `session-logging-${session.id}`
    const savedLogging = localStorage.getItem(loggingKey)
    if (savedLogging !== null) {
      setLoggingEnabled(savedLogging === 'true')
    } else {
      setLoggingEnabled(true)
    }
  }, [session.id, isMobile])

  // Save notes to localStorage when they change
  useEffect(() => {
    const storageKey = `session-notes-${session.id}`
    localStorage.setItem(storageKey, notes)
  }, [notes, session.id])

  // Save collapsed state to localStorage
  useEffect(() => {
    const collapsedKey = `session-notes-collapsed-${session.id}`
    localStorage.setItem(collapsedKey, String(notesCollapsed))
  }, [notesCollapsed, session.id])

  // Save logging state to localStorage
  useEffect(() => {
    const loggingKey = `session-logging-${session.id}`
    localStorage.setItem(loggingKey, String(loggingEnabled))
  }, [loggingEnabled, session.id])

  // Send logging state to server when it changes
  useEffect(() => {
    if (!isConnected) return

    // Send logging state through WebSocket
    const message = JSON.stringify({
      type: 'set-logging',
      enabled: loggingEnabled
    })
    sendMessage(message)
  }, [loggingEnabled, isConnected, sendMessage])

  // Toggle logging handler
  const toggleLogging = () => {
    setLoggingEnabled(!loggingEnabled)
  }

  return (
    <div className="flex-1 flex flex-col bg-terminal-bg">
      {/* Terminal Header */}
      <div className="px-3 md:px-4 py-2 border-b border-gray-700 bg-gray-800">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 md:gap-3 min-w-0">
            <h3 className="font-medium text-gray-100 text-sm md:text-base truncate">
              {session.name || session.id}
            </h3>
            <ConnectionIndicator isConnected={isConnected} />
          </div>
          {terminal && (
            <div className="flex items-center gap-2 md:gap-3 text-xs text-gray-400 flex-shrink-0">
              {/* Hide on mobile except Clear button */}
              <span className="hidden md:inline">
                {terminal.cols}x{terminal.rows}
              </span>
              <span className="text-gray-500 hidden md:inline">|</span>
              <span className="hidden md:inline" title={`Buffer: ${terminal.buffer.active.length} lines (max: 50000)`}>
                📜 {terminal.buffer.active.length} lines
              </span>
              <span className="text-gray-500 hidden md:inline">|</span>
              <span className="hidden md:inline" title="Shift+PageUp/PageDown: Scroll by page&#10;Shift+Arrow Up/Down: Scroll 5 lines&#10;Shift+Home/End: Jump to top/bottom&#10;Or use mouse wheel/trackpad">
                ⌨️ Shift+PgUp/PgDn • Shift+↑/↓
              </span>
              <span className="text-gray-500 hidden md:inline">|</span>
              <button
                onClick={globalLoggingEnabled ? toggleLogging : undefined}
                disabled={!globalLoggingEnabled}
                className={`px-2 py-1 rounded transition-colors text-xs ${
                  !globalLoggingEnabled
                    ? 'bg-gray-800 text-gray-500 cursor-not-allowed opacity-50'
                    : loggingEnabled
                    ? 'bg-green-700 hover:bg-green-600 text-white'
                    : 'bg-gray-700 hover:bg-gray-600 text-gray-200'
                }`}
                title={
                  !globalLoggingEnabled
                    ? 'Session logging disabled globally (set ENABLE_LOGGING=true in .env.local to enable)'
                    : loggingEnabled
                    ? 'Logging enabled - Click to disable'
                    : 'Logging disabled - Click to enable'
                }
              >
                {loggingEnabled ? '📝' : '🚫'} <span className="hidden md:inline">{loggingEnabled ? 'Logging' : 'No Log'}</span>
              </button>
              <span className="text-gray-500 hidden md:inline">|</span>
              <button
                onClick={() => terminal.clear()}
                className="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded transition-colors text-xs"
                title="Clear terminal scrollback buffer (removes duplicate lines from Claude Code status updates)"
              >
                🧹 <span className="hidden md:inline">Clear</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Connection Error */}
      {connectionError && (
        <div className="px-4 py-3 bg-red-900/20 border-b border-red-800">
          <p className="text-sm text-red-400 mb-2">
            ⚠️ {connectionError.message}
          </p>
          {errorHint && (
            <div className="mt-2 p-2 bg-gray-800/50 rounded border border-gray-700">
              <p className="text-xs text-gray-300 font-mono">
                💡 {errorHint}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Terminal Container */}
      <div className="flex-1 relative overflow-hidden">
        <div ref={terminalRef} className="absolute inset-0 custom-scrollbar" />
        {!isReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-terminal-bg">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-400 mx-auto mb-2"></div>
              <p className="text-sm text-gray-400">Initializing terminal...</p>
            </div>
          </div>
        )}
      </div>

      {/* Notes Section */}
      {!notesCollapsed && (
        <div className="border-t border-gray-700 bg-gray-900 flex flex-col" style={{ height: '200px' }}>
          <div className="px-4 py-2 border-b border-gray-700 bg-gray-800 flex items-center justify-between">
            <h4 className="text-sm font-medium text-gray-300">Session Notes</h4>
            <button
              onClick={() => setNotesCollapsed(true)}
              className="text-xs text-gray-400 hover:text-gray-200 transition-colors"
              title="Collapse notes"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>
          </div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Take notes while working with your agent..."
            className="flex-1 px-4 py-3 bg-gray-900 text-gray-200 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset font-mono"
            style={{ minHeight: 0 }}
          />
        </div>
      )}

      {/* Collapsed Notes Bar */}
      {notesCollapsed && (
        <div className="border-t border-gray-700 bg-gray-800 px-4 py-2">
          <button
            onClick={() => setNotesCollapsed(false)}
            className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-200 transition-colors"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 15l7-7 7 7"
              />
            </svg>
            <span>Show Session Notes</span>
          </button>
        </div>
      )}
    </div>
  )
}

function ConnectionIndicator({ isConnected }: { isConnected: boolean }) {
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <div
        className={`w-2 h-2 rounded-full ${
          isConnected ? 'bg-green-500' : 'bg-red-500'
        }`}
      />
      <span className="text-gray-400">
        {isConnected ? 'Connected' : 'Disconnected'}
      </span>
    </div>
  )
}
