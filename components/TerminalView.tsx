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
  const refreshTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // CRITICAL: Initialize notesCollapsed from localStorage SYNCHRONOUSLY during render
  // This ensures the terminal container has the correct height BEFORE xterm.js initializes
  const [notesCollapsed, setNotesCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false
    const mobile = window.innerWidth < 768
    const collapsedKey = `session-notes-collapsed-${session.id}`
    const savedCollapsed = localStorage.getItem(collapsedKey)
    if (savedCollapsed !== null) {
      return savedCollapsed === 'true'
    }
    return mobile // Default to collapsed on mobile, expanded on desktop
  })

  const [loggingEnabled, setLoggingEnabled] = useState(() => {
    if (typeof window === 'undefined') return true
    const loggingKey = `session-logging-${session.id}`
    const savedLogging = localStorage.getItem(loggingKey)
    return savedLogging !== null ? savedLogging === 'true' : true
  })

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

  const { terminal, initializeTerminal, fitTerminal } = useTerminal({
    sessionId: session.id,
    onRegister: (fitAddon) => {
      // Register terminal when it's fully initialized
      registerTerminal(session.id, fitAddon)
    },
    onUnregister: () => {
      // Unregister when terminal is disposed
      unregisterTerminal(session.id)
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
      console.log(`📨 [WS-MESSAGE] Received ${data.length} bytes for session ${session.id}`)

      // Check if this is a control message (JSON)
      try {
        const parsed = JSON.parse(data)

        // Handle history-complete message
        if (parsed.type === 'history-complete') {
          // After initial history loads, force a complete refresh of all xterm layers
          // This fixes: yellow selection, scrollbar not updating, and layer misalignment
          if (terminalInstanceRef.current) {
            const term = terminalInstanceRef.current

            console.log(`📊 [HISTORY-COMPLETE] Buffer info BEFORE - baseY: ${term.buffer.active.baseY}, viewportY: ${term.buffer.active.viewportY}, length: ${term.buffer.active.length}`)

            // CRITICAL: Large history chunks (458KB+) need significant time to process
            // xterm.js writes the data asynchronously, so we need to wait for it to finish
            // Use a short timeout to allow xterm.js to complete processing
            setTimeout(() => {
              console.log(`📊 [HISTORY-WAIT] After 100ms wait - baseY: ${term.buffer.active.baseY}, viewportY: ${term.buffer.active.viewportY}, length: ${term.buffer.active.length}`)

              // 1. Force complete re-render of all layers (selection, scrollbar, canvas)
              term.refresh(0, term.rows - 1)

              // 2. Scroll to bottom to show the prompt
              term.scrollToBottom()

              // 3. CRITICAL: Force terminal to regain focus to enable selection
              // This fixes yellow selection issue after key prop remount
              try {
                term.focus()
                console.log(`🎯 [HISTORY-COMPLETE] Terminal focused for session ${session.id}`)
              } catch (e) {
                console.warn(`⚠️ [HISTORY-COMPLETE] Could not focus terminal:`, e)
              }

              // 4. Additional refresh after focus to ensure selection layer is ready
              setTimeout(() => {
                term.refresh(0, term.rows - 1)
                console.log(`🎨 [HISTORY-COMPLETE-FINAL] Final refresh after focus for session ${session.id}`)
              }, 50)

              console.log(`📊 [HISTORY-COMPLETE] Buffer info AFTER scroll - baseY: ${term.buffer.active.baseY}, viewportY: ${term.buffer.active.viewportY}, length: ${term.buffer.active.length}`)
              console.log(`🎨 [HISTORY-COMPLETE] Refreshed and scrolled to bottom for session ${session.id}`)
            }, 100)
          }
          return
        }
      } catch {
        // Not JSON - it's terminal data, continue processing
        console.log(`📝 [WS-DATA] Not JSON, treating as terminal data (${data.length} bytes)`)
      }

      // Only report activity for substantial content (not cursor blinks or control sequences)
      // Filter out idle terminal noise to properly detect active vs idle state

      // Always write data to terminal first
      if (terminalInstanceRef.current) {
        console.log(`✍️ [TERMINAL-WRITE] Writing ${data.length} bytes to terminal for session ${session.id}`)
        console.log(`📊 [BEFORE-WRITE] Buffer length: ${terminalInstanceRef.current.buffer.active.length}`)
        terminalInstanceRef.current.write(data)
        console.log(`📊 [AFTER-WRITE] Buffer length: ${terminalInstanceRef.current.buffer.active.length}`)

        // CRITICAL: Refresh selection layer after content updates
        // Debounced to avoid performance issues during rapid updates
        if (refreshTimeoutRef.current) {
          clearTimeout(refreshTimeoutRef.current)
        }
        refreshTimeoutRef.current = setTimeout(() => {
          if (terminalInstanceRef.current) {
            // Refresh only the visible portion to maintain performance
            terminalInstanceRef.current.refresh(0, terminalInstanceRef.current.rows - 1)
            console.log(`🎨 [AUTO-REFRESH] Refreshed selection layer for session ${session.id}`)
          }
        }, 200) // Wait 200ms after last write
      } else {
        console.log(`📦 [BUFFERING] Terminal not ready, buffering ${data.length} bytes`)
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

  // Initialize terminal ONCE on mount - never re-initialize
  // Tab-based architecture: terminal stays mounted, just hidden via CSS
  useEffect(() => {
    // Wait for the DOM ref to be ready
    if (!terminalRef.current) {
      console.log(`⚠️ [INIT-SKIP] DOM ref not ready for session ${session.id}`)
      return
    }

    // Check if container is actually visible and has dimensions
    const rect = terminalRef.current.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) {
      console.log(`⚠️ [INIT-SKIP] Container not visible yet for session ${session.id} (${rect.width}x${rect.height}), waiting...`)
      return
    }

    console.log(`📐 [INIT] Container dimensions for session ${session.id}: ${Math.floor(rect.width)}x${Math.floor(rect.height)}`)

    let cleanup: (() => void) | undefined

    const init = async () => {
      console.log(`🚀 [INIT] Initializing terminal for session ${session.id}`)

      const containerElement = terminalRef.current
      if (!containerElement) {
        console.error(`❌ [INIT-ERROR] Container disappeared during init for session ${session.id}`)
        return
      }

      cleanup = await initializeTerminal(containerElement)

      console.log(`✅ [INIT-COMPLETE] Terminal ready for session ${session.id}`)
      setIsReady(true)
    }

    init().catch((error) => {
      console.error(`❌ [INIT-ERROR] Failed to initialize terminal for session ${session.id}:`, error)
    })

    // Cleanup only on unmount (when tab is removed from DOM)
    return () => {
      console.log(`🧹 [CLEANUP] Cleaning up terminal for session ${session.id}`)
      if (cleanup) {
        cleanup()
      }
      setIsReady(false)
      messageBufferRef.current = []
    }
    // Empty deps = initialize once on mount, cleanup only on unmount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Flush buffered messages when terminal becomes ready
  useEffect(() => {
    if (terminal && messageBufferRef.current.length > 0) {
      messageBufferRef.current.forEach((msg) => {
        terminal.write(msg)
      })
      messageBufferRef.current = []
    }
  }, [terminal])

  // Mobile-specific: trigger fit when notes collapse/expand (changes terminal height on mobile)
  useEffect(() => {
    if (isMobile && isReady && terminal) {
      console.log(`📝 [NOTES-TOGGLE] Notes ${notesCollapsed ? 'collapsed' : 'expanded'} on session ${session.id}, scheduling 150ms fit`)
      // Notes state changed on mobile, terminal height changed dramatically
      const timeout = setTimeout(() => {
        console.log(`⏰ [NOTES-TOGGLE-TIMEOUT] Firing fit for session ${session.id}`)
        fitTerminal()
      }, 150)
      return () => clearTimeout(timeout)
    }
  }, [notesCollapsed, isMobile, isReady, terminal, fitTerminal, session.id])

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

  // Mobile touch scroll handler - attach to document to capture all touches
  useEffect(() => {
    if (!isMobile || !terminal || !terminalRef.current) return

    let touchStartY = 0
    let isTouchingTerminal = false
    const terminalElement = terminalRef.current

    const handleTouchStart = (e: TouchEvent) => {
      // Check if touch is within terminal bounds
      const rect = terminalElement.getBoundingClientRect()
      const touch = e.touches[0]

      if (
        touch.clientX >= rect.left &&
        touch.clientX <= rect.right &&
        touch.clientY >= rect.top &&
        touch.clientY <= rect.bottom
      ) {
        isTouchingTerminal = true
        touchStartY = touch.clientY
        console.log('📱 [TOUCH] Started on terminal')
      }
    }

    const handleTouchMove = (e: TouchEvent) => {
      if (!isTouchingTerminal) return

      const touchY = e.touches[0].clientY
      const deltaY = touchStartY - touchY
      const linesToScroll = Math.round(deltaY / 30) // 30px per line (slower scroll)

      if (Math.abs(linesToScroll) > 0) {
        console.log(`📱 [TOUCH] Scrolling ${linesToScroll} lines`)
        terminal.scrollLines(linesToScroll)
        touchStartY = touchY
      }

      // CRITICAL: Always prevent default to stop page scroll
      e.preventDefault()
      e.stopPropagation()
    }

    const handleTouchEnd = () => {
      if (isTouchingTerminal) {
        console.log('📱 [TOUCH] Ended')
      }
      isTouchingTerminal = false
    }

    // Attach to document with capture phase to intercept before xterm.js
    document.addEventListener('touchstart', handleTouchStart, { passive: true, capture: true })
    document.addEventListener('touchmove', handleTouchMove, { passive: false, capture: true })
    document.addEventListener('touchend', handleTouchEnd, { passive: true, capture: true })
    document.addEventListener('touchcancel', handleTouchEnd, { passive: true, capture: true })

    return () => {
      document.removeEventListener('touchstart', handleTouchStart, true)
      document.removeEventListener('touchmove', handleTouchMove, true)
      document.removeEventListener('touchend', handleTouchEnd, true)
      document.removeEventListener('touchcancel', handleTouchEnd, true)
    }
  }, [isMobile, terminal])

  // Load notes from localStorage ONCE on mount
  // Tab-based architecture: notes stay in memory, no need to reload on session switch
  useEffect(() => {
    console.log(`📂 [LOAD-NOTES] Loading notes for session ${session.id}`)
    const storageKey = `session-notes-${session.id}`
    const savedNotes = localStorage.getItem(storageKey)
    if (savedNotes !== null) {
      setNotes(savedNotes)
    } else {
      setNotes('')
    }
    // Only load once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
    <div className="flex-1 flex flex-col bg-terminal-bg overflow-hidden">
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
              {/* Mobile: Notes toggle button */}
              <button
                onClick={() => setNotesCollapsed(!notesCollapsed)}
                className="md:hidden px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded transition-colors text-xs"
                title={notesCollapsed ? "Show notes" : "Hide notes"}
              >
                📝
              </button>
              <span className="text-gray-500 md:hidden">|</span>

              {/* Hide on mobile except Clear and Notes buttons */}
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
      <div
        className="flex-1 relative overflow-hidden"
        style={{
          // Prevent mobile rubber-band scrolling
          overscrollBehavior: 'contain',
          // Ensure terminal stays within flex boundaries
          minHeight: 0
        }}
      >
        <div
          ref={terminalRef}
          className="absolute inset-0"
          style={{
            // CRITICAL: Prevent touch events from bubbling to parent on mobile
            touchAction: isMobile ? 'pan-y pinch-zoom' : 'auto',
            // Ensure terminal doesn't overflow behind notes
            zIndex: 1
          }}
        />
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
        <div
          className="border-t border-gray-700 bg-gray-900 flex flex-col"
          style={{
            height: isMobile ? '40vh' : '200px',
            minHeight: isMobile ? '40vh' : '200px',
            maxHeight: isMobile ? '40vh' : '200px',
            flexShrink: 0
          }}
        >
          <div
            onClick={() => setNotesCollapsed(true)}
            className="px-4 py-2 border-b border-gray-700 bg-gray-800 flex items-center justify-between flex-shrink-0 cursor-pointer hover:bg-gray-750 transition-colors"
            title="Click to collapse notes"
          >
            <h4 className="text-sm font-medium text-gray-300">Session Notes</h4>
            <svg
              className="w-4 h-4 text-gray-400"
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
          </div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Take notes while working with your agent..."
            className="flex-1 px-4 py-3 bg-gray-900 text-gray-200 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset font-mono overflow-y-auto"
            style={{
              minHeight: 0,
              maxHeight: '100%',
              height: '100%',
              WebkitOverflowScrolling: 'touch' // Smooth scrolling on iOS
            }}
          />
        </div>
      )}

      {/* Collapsed Notes Bar */}
      {notesCollapsed && (
        <div
          onClick={() => setNotesCollapsed(false)}
          className="border-t border-gray-700 bg-gray-800 px-4 py-2 cursor-pointer hover:bg-gray-750 transition-colors flex items-center gap-2"
          title="Click to expand notes"
        >
          <svg
            className="w-4 h-4 text-gray-400"
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
          <span className="text-sm text-gray-400">Show Session Notes</span>
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
