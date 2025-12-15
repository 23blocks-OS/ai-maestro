'use client'

import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useTerminal } from '@/hooks/useTerminal'
import { useWebSocket } from '@/hooks/useWebSocket'
import { createResizeMessage } from '@/lib/websocket'
import { useTerminalRegistry } from '@/contexts/TerminalContext'
import type { Session } from '@/types/session'

const BRACKETED_PASTE_START = '\u001b[200~'
const BRACKETED_PASTE_END = '\u001b[201~'

interface TerminalViewProps {
  session: Session
  isVisible?: boolean
  hideFooter?: boolean  // Hide notes/prompt footer (used in MobileDashboard)
  hideHeader?: boolean  // Hide terminal header (used in MobileDashboard)
  onConnectionStatusChange?: (isConnected: boolean) => void  // Callback for connection status changes
}

export default function TerminalView({ session, isVisible = true, hideFooter = false, hideHeader = false, onConnectionStatusChange }: TerminalViewProps) {
  const terminalRef = useRef<HTMLDivElement>(null)
  const [isReady, setIsReady] = useState(false)
  const [historyLoaded, setHistoryLoaded] = useState(false) // Gate for input handler
  const messageBufferRef = useRef<string[]>([])
  const [notes, setNotes] = useState('')
  const [promptDraft, setPromptDraft] = useState('')
  const [isMobile, setIsMobile] = useState(false)
  const promptTextareaRef = useRef<HTMLTextAreaElement | null>(null)

  // Agent-centric storage: Use agentId as primary key (falls back to session.id for backward compatibility)
  const storageId = session.agentId || session.id

  // CRITICAL: Initialize notesCollapsed from localStorage SYNCHRONOUSLY during render
  // This ensures the terminal container has the correct height BEFORE xterm.js initializes
  const [notesCollapsed, setNotesCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false
    const mobile = window.innerWidth < 768
    const collapsedKey = `agent-notes-collapsed-${session.agentId || session.id}`
    const savedCollapsed = localStorage.getItem(collapsedKey)
    if (savedCollapsed !== null) {
      return savedCollapsed === 'true'
    }
    return mobile // Default to collapsed on mobile, expanded on desktop
  })

  const FOOTER_TAB_STORAGE_KEY = 'terminal-footer-tab'

  const [footerTab, setFooterTab] = useState<'notes' | 'prompt'>(() => {
    if (typeof window === 'undefined') return 'prompt'
    const stored = localStorage.getItem(FOOTER_TAB_STORAGE_KEY)
    return stored === 'notes' ? 'notes' : 'prompt'
  })

  const [loggingEnabled, setLoggingEnabled] = useState(() => {
    if (typeof window === 'undefined') return true
    const loggingKey = `agent-logging-${session.agentId || session.id}`
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

  const focusTerminal = useCallback(() => {
    const term = terminalInstanceRef.current
    if (!term) return
    try {
      term.focus()
      // Note: Do NOT clear selection here - it destroys user's selected text
      // The selection layer is activated by focusing the terminal
    } catch {}
  }, [])

  const { isConnected, sendMessage, connectionError, errorHint } = useWebSocket({
    sessionId: session.id,
    hostId: session.hostId,  // Pass host ID for remote session routing
    autoConnect: isVisible,  // Only auto-connect when visible
    onOpen: () => {
      // Reset historyLoaded - server will send new history on each connect
      setHistoryLoaded(false)
      // Report activity when WebSocket connects
      reportActivity(session.id)
      // Notify parent of connection status change
      onConnectionStatusChange?.(true)
    },
    onClose: () => {
      // Notify parent of connection status change
      onConnectionStatusChange?.(false)
    },
    onMessage: (data) => {
      // Check if this is a control message (JSON)
      try {
        const parsed = JSON.parse(data)

        // Handle history-complete message
        if (parsed.type === 'history-complete') {
          setHistoryLoaded(true)
          if (terminalInstanceRef.current) {
            const term = terminalInstanceRef.current

            // Wait for xterm.js to finish processing history
            setTimeout(() => {
              // 1. Scroll to bottom
              term.scrollToBottom()

              // 2. Focus terminal to activate selection layer (but not if user is typing in an input)
              const activeElement = document.activeElement
              const isInputFocused = activeElement?.tagName === 'INPUT' ||
                                     activeElement?.tagName === 'TEXTAREA' ||
                                     activeElement?.tagName === 'SELECT' ||
                                     activeElement?.getAttribute('contenteditable') === 'true'

              if (!isInputFocused) {
                term.focus()
              }

              // Note: Do NOT clear selection here - it's not needed and destroys any
              // selection the user might have made. Focusing the terminal is enough
              // to activate xterm's selection service.
            }, 100)
          }
          return
        }

        // Handle container connection message
        if (parsed.type === 'connected') {
          console.log(`[CONTAINER] Connected to agent: ${parsed.agentId}`)
          return
        }

        // If we got here, it's a JSON message but not a known control type
        // This might be terminal data that happens to be valid JSON (rare)
        // Fall through to write it to terminal
      } catch {
        // Not JSON - it's terminal data, continue processing
      }

      // Only report activity for substantial content (not cursor blinks or control sequences)
      // Filter out idle terminal noise to properly detect active vs idle state

      // Write data to terminal
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

  // Initialize terminal ONCE on mount - never re-initialize
  // Tab-based architecture: terminal stays mounted, just hidden via CSS
  useEffect(() => {
    let cleanup: (() => void) | undefined
    let retryCount = 0
    const maxRetries = 10
    const retryDelay = 100 // ms
    let retryTimer: NodeJS.Timeout | null = null
    let mounted = true

    const tryInit = async () => {
      if (!mounted) return

      // Wait for the DOM ref to be ready
      if (!terminalRef.current) {
        if (retryCount < maxRetries) {
          retryCount++
          retryTimer = setTimeout(tryInit, retryDelay)
        }
        return
      }

      // Check if container is actually visible and has dimensions
      const rect = terminalRef.current.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) {
        if (retryCount < maxRetries) {
          retryCount++
          retryTimer = setTimeout(tryInit, retryDelay)
        } else {
          console.warn(`[Terminal] Failed to get valid dimensions after ${maxRetries} retries for session ${session.id}`)
        }
        return
      }

      const containerElement = terminalRef.current
      if (!containerElement) {
        console.error(`❌ [INIT-ERROR] Container disappeared during init for session ${session.id}`)
        return
      }

      try {
        cleanup = await initializeTerminal(containerElement)
        if (mounted) {
          setIsReady(true)
        }
      } catch (error) {
        console.error(`❌ [INIT-ERROR] Failed to initialize terminal for session ${session.id}:`, error)
      }
    }

    tryInit()

    // Cleanup only on unmount (when tab is removed from DOM)
    return () => {
      mounted = false
      if (retryTimer) {
        clearTimeout(retryTimer)
      }
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

  // Trigger fit when notes collapse/expand or footer tab changes (changes terminal height)
  useEffect(() => {
    if (isReady && terminal) {
      // Notes state or footer tab changed, terminal height changed
      const timeout = setTimeout(() => {
        fitTerminal()
      }, 150)
      return () => clearTimeout(timeout)
    }
  }, [notesCollapsed, footerTab, isReady, terminal, fitTerminal, session.id])

  // Handle terminal input - GATED by historyLoaded to prevent input during history streaming
  // This fixes the "can't type until cancel" issue where keystrokes get lost or buffered
  useEffect(() => {
    if (!terminal || !isConnected || !historyLoaded) {
      return
    }

    const disposable = terminal.onData((data) => {
      sendMessage(data)
    })

    return () => {
      disposable.dispose()
    }
  }, [terminal, isConnected, historyLoaded, sendMessage])

  // Copy selection to clipboard
  const copySelection = useCallback(() => {
    if (!terminal) return
    const selection = terminal.getSelection()
    if (selection) {
      navigator.clipboard.writeText(selection)
        .then(() => {
          // Optionally show feedback
          console.log('[Terminal] Copied selection to clipboard')
        })
        .catch(err => console.error('[Terminal] Failed to copy:', err))
    }
  }, [terminal])

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
      }
    }

    const handleTouchMove = (e: TouchEvent) => {
      if (!isTouchingTerminal) return

      const touchY = e.touches[0].clientY
      const deltaY = touchStartY - touchY
      const linesToScroll = Math.round(deltaY / 30) // 30px per line (slower scroll)

      if (Math.abs(linesToScroll) > 0) {
        terminal.scrollLines(linesToScroll)
        touchStartY = touchY
      }

      // CRITICAL: Always prevent default to stop page scroll
      e.preventDefault()
      e.stopPropagation()
    }

    const handleTouchEnd = () => {
      if (isTouchingTerminal) {
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
    const key = `agent-notes-${storageId}`
    const savedNotes = localStorage.getItem(key)
    if (savedNotes !== null) {
      setNotes(savedNotes)
    } else {
      setNotes('')
    }
    // Only load once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const key = `agent-prompt-${storageId}`
    const savedPrompt = localStorage.getItem(key)
    if (savedPrompt !== null) {
      setPromptDraft(savedPrompt)
    } else {
      setPromptDraft('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Save notes to localStorage when they change
  useEffect(() => {
    localStorage.setItem(`agent-notes-${storageId}`, notes)
  }, [notes, storageId])

  useEffect(() => {
    localStorage.setItem(`agent-prompt-${storageId}`, promptDraft)
  }, [promptDraft, storageId])

  useEffect(() => {
    if (notesCollapsed) return
    if (footerTab !== 'prompt') return
    const textarea = promptTextareaRef.current
    if (!textarea) return
    const timer = requestAnimationFrame(() => {
      try {
        textarea.focus()
        const end = textarea.value.length
        textarea.setSelectionRange(end, end)
      } catch {}
    })
    return () => cancelAnimationFrame(timer)
  }, [footerTab, notesCollapsed])

  // Save collapsed state to localStorage
  useEffect(() => {
    localStorage.setItem(`agent-notes-collapsed-${storageId}`, String(notesCollapsed))
  }, [notesCollapsed, storageId])

  // Save logging state to localStorage
  useEffect(() => {
    localStorage.setItem(`agent-logging-${storageId}`, String(loggingEnabled))
  }, [loggingEnabled, storageId])

  useEffect(() => {
    localStorage.setItem(FOOTER_TAB_STORAGE_KEY, footerTab)
  }, [footerTab])

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

  const handlePromptSubmit = useCallback(
    (mode: 'insert' | 'send') => {
      if (!promptDraft || promptDraft.trim().length === 0) {
        return
      }

      const normalized = promptDraft.replace(/\r\n?/g, '\n')
      const withoutEscape = normalized.replace(/\u001b/g, '')
      const carriageAdjusted = withoutEscape.replace(/\n/g, '\r')
      const bracketedPayload = `${BRACKETED_PASTE_START}${carriageAdjusted}${BRACKETED_PASTE_END}`

      const staged = sendMessage(bracketedPayload)
      if (!staged) {
        console.warn('[PromptBuilder] Failed to send staged text via WebSocket')
        return
      }

      if (mode === 'send') {
        const executed = sendMessage('\r')
        if (!executed) {
          console.warn('[PromptBuilder] Failed to send Enter via WebSocket')
          return
        }
        setPromptDraft('')
        focusTerminal()
      }
    },
    [focusTerminal, promptDraft, sendMessage]
  )

  const handlePromptKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault()
        handlePromptSubmit('insert')
        return
      }

      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault()
        handlePromptSubmit('send')
      }
    },
    [handlePromptSubmit]
  )

  return (
    <div className="flex-1 flex flex-col bg-terminal-bg overflow-hidden">
      {/* Terminal Header */}
      {!hideHeader && (
      <div className="px-3 md:px-4 py-2 border-b border-gray-700 bg-gray-800">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 md:gap-3 min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              {/* Connection indicator - just the green/red dot */}
              <div
                className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  isConnected ? 'bg-green-500' : 'bg-red-500'
                }`}
              />
              {/* Host name and session name */}
              <h3 className="font-medium text-gray-400 text-xs md:text-sm truncate">
                {session.hostId !== 'local' ? session.hostId : 'local'}
              </h3>
              <span className="text-gray-600">/</span>
              <h3 className="font-medium text-gray-100 text-sm md:text-base truncate">
                {session.name || session.id}
              </h3>
            </div>
          </div>
          {terminal && (
            <div className="flex items-center gap-2 md:gap-3 text-xs text-gray-400 flex-shrink-0">
              {/* Mobile: Notes toggle button */}
              {!hideFooter && (
                <>
                  <button
                    onClick={() => setNotesCollapsed(!notesCollapsed)}
                    className="md:hidden px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded transition-colors text-xs"
                    title={notesCollapsed ? "Show footer" : "Hide footer"}
                  >
                    📝
                  </button>
                  <span className="text-gray-500 md:hidden">|</span>
                </>
              )}

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
                onClick={copySelection}
                className="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded transition-colors text-xs"
                title="Copy selected text to clipboard"
              >
                📋 <span className="hidden md:inline">Copy</span>
              </button>
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
      )}

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
        className="flex-1 min-h-0 relative overflow-hidden"
        style={{
          // CRITICAL: flex-1 takes remaining space after footer
          // min-h-0 allows flex item to shrink below content size
          // overflow-hidden prevents terminal from escaping container bounds
          flex: '1 1 0%',
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        <div
          ref={terminalRef}
          onMouseDown={(e) => {
            // Focus terminal on mousedown to ensure xterm handles selection properly
            // Do NOT clear selection here - let user complete their drag selection
            if (terminalInstanceRef.current) {
              const term = terminalInstanceRef.current
              // Only focus if not already focused to avoid disrupting selection
              if (document.activeElement !== term.textarea) {
                term.focus()
              }
            }
          }}
          onDoubleClick={() => {
            // On double-click, focus and let xterm handle word selection
            if (terminalInstanceRef.current) {
              terminalInstanceRef.current.focus()
            }
          }}
          style={{
            // Terminal takes full available space within container
            flex: '1 1 0%',
            minHeight: 0,
            width: '100%',
            position: 'relative'
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

      {/* Notes / Prompt Builder Footer */}
      {!hideFooter && !notesCollapsed && (
        <div
          className="border-t border-gray-700 bg-gray-900 flex flex-col"
          style={{
            height: isMobile ? '40vh' : '220px',
            minHeight: isMobile ? '40vh' : '220px',
            maxHeight: isMobile ? '40vh' : '220px',
            flexShrink: 0
          }}
        >
          <div className="px-4 py-2 border-b border-gray-700 bg-gray-800 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setFooterTab('notes')}
                className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                  footerTab === 'notes'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                Notes
              </button>
              <button
                onClick={() => setFooterTab('prompt')}
                className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                  footerTab === 'prompt'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                Prompt Builder
              </button>
            </div>
            <button
              onClick={() => setNotesCollapsed(true)}
              className="text-gray-400 hover:text-gray-200 transition-colors"
              title="Collapse footer"
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
          {footerTab === 'notes' ? (
            <textarea
              id={`agent-notes-${storageId}`}
              name={`agentNotes-${storageId}`}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Take notes while working with your agent..."
              className="flex-1 px-4 py-3 bg-gray-900 text-gray-200 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset font-mono overflow-y-auto"
              style={{
                minHeight: 0,
                maxHeight: '100%',
                height: '100%',
                WebkitOverflowScrolling: 'touch'
              }}
            />
          ) : (
            <div className="flex-1 flex flex-col">
              <textarea
                ref={promptTextareaRef}
                value={promptDraft}
                onChange={(e) => setPromptDraft(e.target.value)}
                onKeyDown={handlePromptKeyDown}
                placeholder="Compose your prompt here. Enter = send • Ctrl/Cmd+Enter = insert only • Shift+Enter = new line"
                className="flex-1 px-4 py-3 bg-gray-900 text-gray-200 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset font-mono overflow-y-auto"
                style={{
                  minHeight: 0,
                  maxHeight: '100%',
                  height: '100%',
                  WebkitOverflowScrolling: 'touch'
                }}
              />
              <div className="px-4 py-2 border-t border-gray-800 bg-gray-800 flex items-center justify-between">
                <p className="text-xs text-gray-400">
                  {promptDraft.length} character{promptDraft.length === 1 ? '' : 's'}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPromptDraft('')}
                    className="rounded-md border border-gray-700 px-3 py-1.5 text-xs text-gray-300 hover:border-gray-600"
                  >
                    Clear
                  </button>
                  <button
                    onClick={() => handlePromptSubmit('insert')}
                    className="rounded-md border border-blue-500 px-3 py-1.5 text-xs font-medium text-blue-300 hover:bg-blue-500/10 disabled:opacity-50"
                    disabled={promptDraft.trim().length === 0}
                  >
                    Insert Only
                  </button>
                  <button
                    onClick={() => handlePromptSubmit('send')}
                    className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50"
                    disabled={promptDraft.trim().length === 0}
                  >
                    Send
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {!hideFooter && notesCollapsed && (
        <div
          onClick={() => setNotesCollapsed(false)}
          className="border-t border-gray-700 bg-gray-800 px-4 py-2 cursor-pointer hover:bg-gray-750 transition-colors flex items-center gap-2"
          title="Click to expand footer"
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
          <span className="text-sm text-gray-400">
            {footerTab === 'prompt' ? 'Show Prompt Builder' : 'Show Agent Notes'}
          </span>
        </div>
      )}
    </div>
  )
}
