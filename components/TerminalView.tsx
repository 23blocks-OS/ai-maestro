'use client'

import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useTerminal } from '@/hooks/useTerminal'
import { useWebSocket } from '@/hooks/useWebSocket'
import { createResizeMessage } from '@/lib/websocket'
import { useTerminalRegistry } from '@/contexts/TerminalContext'
import { useDeviceType } from '@/hooks/useDeviceType'
import MobileKeyToolbar from './MobileKeyToolbar'
import { Paperclip } from 'lucide-react'
import type { Session } from '@/types/session'

const BRACKETED_PASTE_START = '\u001b[200~'
const BRACKETED_PASTE_END = '\u001b[201~'

// PERFORMANCE: Hoist static JSX to avoid recreation on every render
const LoadingSpinner = (
  <div className="absolute inset-0 flex items-center justify-center bg-terminal-bg">
    <div className="text-center">
      {/* Wrap in div for hardware-accelerated animation */}
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-400 mx-auto mb-2" />
      <p className="text-sm text-gray-400">Initializing terminal...</p>
    </div>
  </div>
)

interface TerminalViewProps {
  session: Session
  isVisible?: boolean
  hideFooter?: boolean  // Hide notes/prompt footer (used in MobileDashboard)
  hideHeader?: boolean  // Hide terminal header (used in MobileDashboard)
  onConnectionStatusChange?: (isConnected: boolean) => void  // Callback for connection status changes
  onFileUploaded?: (path: string, filename: string) => void  // Callback when file is uploaded via prompt builder
}

export default function TerminalView({ session, isVisible = true, hideFooter = false, hideHeader = false, onConnectionStatusChange, onFileUploaded }: TerminalViewProps) {
  const terminalRef = useRef<HTMLDivElement>(null)
  const [isReady, setIsReady] = useState(false)
  const [historyLoaded, setHistoryLoaded] = useState(false) // Gate for input handler
  const messageBufferRef = useRef<string[]>([])
  const [notes, setNotes] = useState('')
  const [promptDraft, setPromptDraft] = useState('')
  const { isTouch } = useDeviceType()
  const isMobile = isTouch // backward compat for touch scroll handler
  const [copyFeedback, setCopyFeedback] = useState(false)
  const [pasteFeedback, setPasteFeedback] = useState(false)
  const promptTextareaRef = useRef<HTMLTextAreaElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [isUploading, setIsUploading] = useState(false)

  // Agent-centric storage: Use agentId as primary key (falls back to session.id for backward compatibility)
  const storageId = session.agentId || session.id

  // CRITICAL: Initialize notesCollapsed from localStorage SYNCHRONOUSLY during render
  // This ensures the terminal container has the correct height BEFORE xterm.js initializes
  const [notesCollapsed, setNotesCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false
    const mobile = window.innerWidth < 768
    const collapsedKey = `agent-notes-collapsed-${session.agentId || session.id}`
    // SF-018: Wrap localStorage access in try/catch — private browsing or full storage throws
    try {
      const savedCollapsed = localStorage.getItem(collapsedKey)
      if (savedCollapsed !== null) {
        return savedCollapsed === 'true'
      }
    } catch {
      // localStorage unavailable (private browsing, storage full, etc.)
    }
    return mobile // Default to collapsed on mobile, expanded on desktop
  })

  const FOOTER_TAB_STORAGE_KEY = 'terminal-footer-tab'

  // SF-026: Wrap localStorage reads in try/catch -- private browsing or full storage throws
  const [footerTab, setFooterTab] = useState<'notes' | 'prompt'>(() => {
    if (typeof window === 'undefined') return 'prompt'
    try {
      const stored = localStorage.getItem(FOOTER_TAB_STORAGE_KEY)
      return stored === 'notes' ? 'notes' : 'prompt'
    } catch {
      return 'prompt'
    }
  })

  // SF-026: Wrap localStorage reads in try/catch -- private browsing or full storage throws
  const [loggingEnabled, setLoggingEnabled] = useState(() => {
    if (typeof window === 'undefined') return true
    try {
      const loggingKey = `agent-logging-${session.agentId || session.id}`
      const savedLogging = localStorage.getItem(loggingKey)
      return savedLogging !== null ? savedLogging === 'true' : true
    } catch {
      return true
    }
  })

  const [globalLoggingEnabled, setGlobalLoggingEnabled] = useState(false)

  // Copy/paste handlers defined after useTerminal below

  // Fetch global logging configuration on mount
  useEffect(() => {
    fetch('/api/config')
      .then(res => res.json())
      .then(data => setGlobalLoggingEnabled(data.loggingEnabled))
      .catch(err => console.error('Failed to fetch config:', err))
  }, [])

  const { registerTerminal, unregisterTerminal, reportActivity } = useTerminalRegistry()

  const { terminal, initializeTerminal, fitTerminal, setSendData } = useTerminal({
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
    } catch {}
  }, [])

  // Copy terminal content to clipboard (touch devices)
  const handleTerminalCopy = useCallback(async () => {
    if (!terminal) return
    try {
      // First copy selection if any
      const selection = terminal.getSelection()
      if (selection) {
        await navigator.clipboard.writeText(selection)
        setCopyFeedback(true)
        setTimeout(() => setCopyFeedback(false), 1500)
        return
      }
      // Otherwise copy visible screen
      const buffer = terminal.buffer.active
      const lines: string[] = []
      const start = buffer.viewportY
      for (let i = start; i < start + terminal.rows; i++) {
        const line = buffer.getLine(i)
        if (line) lines.push(line.translateToString(true))
      }
      while (lines.length > 0 && !lines[lines.length - 1].trim()) lines.pop()
      await navigator.clipboard.writeText(lines.join('\n'))
      setCopyFeedback(true)
      setTimeout(() => setCopyFeedback(false), 1500)
    } catch {
      // execCommand fallback
      const buffer = terminal.buffer.active
      const lines: string[] = []
      for (let i = Math.max(0, buffer.length - terminal.rows); i < buffer.length; i++) {
        const line = buffer.getLine(i)
        if (line) lines.push(line.translateToString(true))
      }
      const ta = document.createElement('textarea')
      ta.value = lines.join('\n')
      ta.style.cssText = 'position:fixed;opacity:0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      setCopyFeedback(true)
      setTimeout(() => setCopyFeedback(false), 1500)
    }
  }, [terminal])

  // Paste from clipboard into terminal (touch devices)
  const handleTerminalPaste = useCallback(async () => {
    if (!terminal) return
    try {
      const text = await navigator.clipboard.readText()
      if (text) {
        terminal.paste(text)
        setPasteFeedback(true)
        setTimeout(() => setPasteFeedback(false), 1500)
      }
    } catch {
      // Clipboard API denied - show temporary paste input
      const input = document.createElement('textarea')
      input.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:9999;width:280px;height:80px;padding:12px;border-radius:12px;border:1px solid #4B5563;background:#1F2937;color:#E5E7EB;font-size:14px'
      input.placeholder = 'Paste here, then tap outside...'
      document.body.appendChild(input)
      input.focus()
      input.addEventListener('blur', () => {
        const val = input.value
        if (val && terminal) {
          terminal.paste(val)
          setPasteFeedback(true)
          setTimeout(() => setPasteFeedback(false), 1500)
        }
        document.body.removeChild(input)
      }, { once: true })
    }
  }, [terminal])

  const { isConnected, sendMessage, connectionError, errorHint, connectionMessage } = useWebSocket({
    sessionId: session.id,
    hostId: session.hostId,  // Pass host ID for remote session routing
    socketPath: session.socketPath,  // Custom tmux socket (e.g., OpenClaw agents)
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
    // NT-010: TerminalView message type routing (receives non-protocol messages from useWebSocket):
    //   - 'history-complete' → triggers terminal refit + scroll to bottom after history load
    //   - non-JSON (raw text) → written directly to xterm.js terminal as ANSI output
    // Protocol-level messages ('error', 'status') are handled upstream by useWebSocket.
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
              // 1. CRITICAL: Refit terminal to ensure correct dimensions
              fitTerminal()

              // 2. Send resize to PTY to sync tmux with correct dimensions
              // This also triggers a redraw which helps with color issues
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

      // Write data to terminal - keep this simple, no state updates during write
      // State updates during rapid writes can cause React reconciliation issues
      if (terminalInstanceRef.current) {
        terminalInstanceRef.current.write(data)
      } else {
        messageBufferRef.current.push(data)
      }
    },
  })

  // Keep the useTerminal sendData ref in sync with the current WebSocket sendMessage function
  // This allows the Cmd+V paste handler in useTerminal.ts (registered once during init) to always
  // use the latest WebSocket send function without re-registering the key handler
  useEffect(() => {
    if (isConnected) {
      setSendData(sendMessage)
    } else {
      setSendData(null)
    }
    return () => setSendData(null)
  }, [isConnected, sendMessage, setSendData])

  // Initialize terminal ONCE on mount - never re-initialize
  // Tab-based architecture: terminal stays mounted, just hidden via CSS
  useEffect(() => {
    let cleanup: (() => void) | undefined
    let retryCount = 0
    const maxRetries = 20
    const retryDelay = 150 // ms
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
    // NT-021: Empty deps array is intentional and safe because session.id is stable
    // for the lifetime of this component instance. In the tab-based architecture,
    // each TerminalView is keyed by session.id, so a new session.id always means
    // a new component instance (React unmounts/remounts). Therefore session.id
    // never changes within a single mount cycle, and omitting it from deps is correct.
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

  // WebGL is now loaded inline during initializeTerminal() - no toggle needed.
  // Only one terminal is mounted at a time, so no GPU context exhaustion concern.

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

  // Handle terminal input
  // Note: Removed historyLoaded gate - it was preventing typing until ESC was pressed
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

  // Paste from clipboard (with user gesture - required for mobile)
  const pasteFromClipboard = useCallback(async () => {
    if (!isConnected) return

    try {
      const text = await navigator.clipboard.readText()
      if (text) {
        // Send as bracketed paste to handle multi-line content properly
        const carriageAdjusted = text.replace(/\r\n?/g, '\n').replace(/\n/g, '\r')
        const bracketedPayload = `${BRACKETED_PASTE_START}${carriageAdjusted}${BRACKETED_PASTE_END}`
        sendMessage(bracketedPayload)
        console.log('[Terminal] Pasted from clipboard')
        // Focus terminal after paste
        if (terminalInstanceRef.current) {
          terminalInstanceRef.current.focus()
        }
      }
    } catch (err) {
      console.error('[Terminal] Failed to paste:', err)
      // On mobile, clipboard access might fail - show user-friendly message
      alert('Unable to access clipboard. Please use the Prompt Builder tab to paste text.')
    }
  }, [isConnected, sendMessage])

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

    // NT-013: Removed empty if block — just reset the touch tracking flag
    const handleTouchEnd = () => {
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
  // SF-047: storageId is stable for the lifetime of this component instance (keyed by session).
  // Tab-based architecture: each TerminalView is mounted once per agent and never reused,
  // so storageId never changes during the component lifecycle. Empty deps is intentional.
  useEffect(() => {
    // SF-003: Wrap localStorage access in try/catch — private browsing or full storage throws
    try {
      const key = `agent-notes-${storageId}`
      const savedNotes = localStorage.getItem(key)
      if (savedNotes !== null) {
        setNotes(savedNotes)
      } else {
        setNotes('')
      }
    } catch {
      // localStorage unavailable (private browsing, storage full, etc.)
      setNotes('')
    }
    // Only load once on mount — storageId is stable per component instance (see SF-047)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    // SF-003: Wrap localStorage access in try/catch — private browsing or full storage throws
    try {
      const key = `agent-prompt-${storageId}`
      const savedPrompt = localStorage.getItem(key)
      if (savedPrompt !== null) {
        setPromptDraft(savedPrompt)
      } else {
        setPromptDraft('')
      }
    } catch {
      // localStorage unavailable (private browsing, storage full, etc.)
      setPromptDraft('')
    }
    // Only load once on mount — storageId is stable per component instance (see SF-047)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Save notes to localStorage when they change
  useEffect(() => {
    // SF-003: Wrap localStorage access in try/catch — private browsing or full storage throws
    try {
      localStorage.setItem(`agent-notes-${storageId}`, notes)
    } catch {
      // localStorage unavailable — silently ignore write failure
    }
  }, [notes, storageId])

  useEffect(() => {
    // SF-003: Wrap localStorage access in try/catch — private browsing or full storage throws
    try {
      localStorage.setItem(`agent-prompt-${storageId}`, promptDraft)
    } catch {
      // localStorage unavailable — silently ignore write failure
    }
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
  // SF-027: Wrap localStorage.setItem in try/catch -- storage may be full or unavailable
  useEffect(() => {
    try { localStorage.setItem(`agent-notes-collapsed-${storageId}`, String(notesCollapsed)) } catch { /* storage unavailable */ }
  }, [notesCollapsed, storageId])

  // Save logging state to localStorage
  // SF-027: Wrap localStorage.setItem in try/catch -- storage may be full or unavailable
  useEffect(() => {
    try { localStorage.setItem(`agent-logging-${storageId}`, String(loggingEnabled)) } catch { /* storage unavailable */ }
  }, [loggingEnabled, storageId])

  // SF-027: Wrap localStorage.setItem in try/catch -- storage may be full or unavailable
  useEffect(() => {
    try { localStorage.setItem(FOOTER_TAB_STORAGE_KEY, footerTab) } catch { /* storage unavailable */ }
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

  // File upload handler for the prompt builder attach button
  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    // Reset input so the same file can be re-selected
    event.target.value = ''

    setIsUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/agents/creation-helper/file-picker', {
        method: 'POST',
        body: formData,
      })
      if (!res.ok) return
      const data = await res.json()
      if (data.path) {
        // Insert the server path into the prompt textarea
        setPromptDraft(prev => {
          const prefix = prev && !prev.endsWith('\n') && !prev.endsWith(' ') ? ' ' : ''
          return `${prev}${prefix}${data.path}`
        })
        // Notify parent (e.g., Haephestos page tracks uploaded files)
        onFileUploaded?.(data.path, data.filename || file.name)
      }
    } finally {
      setIsUploading(false)
    }
  }, [onFileUploaded])

  return (
    <div className="flex-1 flex flex-col bg-terminal-bg overflow-hidden">
      {/* Terminal Header */}
      {!hideHeader && (
      <div className="px-3 md:px-4 py-2 border-b border-gray-700 bg-gray-800">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 md:gap-3 min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              {/* Connection indicator - green/red dot with aria-label for accessibility */}
              {/* SF-014: Add aria-label and role="status" so color-blind users can identify connection state */}
              <div
                className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  isConnected ? 'bg-green-500' : 'bg-red-500'
                }`}
                role="status"
                aria-label={isConnected ? 'Connected' : 'Disconnected'}
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
                    aria-label={notesCollapsed ? "Show footer" : "Hide footer"}
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
                aria-label={loggingEnabled ? 'Logging enabled' : 'Logging disabled'}
              >
                {loggingEnabled ? '📝' : '🚫'} <span className="hidden md:inline">{loggingEnabled ? 'Logging' : 'No Log'}</span>
              </button>
              <span className="text-gray-500 hidden md:inline">|</span>
              <button
                onClick={copySelection}
                className="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded transition-colors text-xs"
                title="Copy selected text to clipboard"
                aria-label="Copy selected text to clipboard"
              >
                📋 <span className="hidden md:inline">Copy</span>
              </button>
              <button
                onClick={pasteFromClipboard}
                className="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded transition-colors text-xs"
                title="Paste from clipboard (mobile-friendly)"
                aria-label="Paste from clipboard"
              >
                📥 <span className="hidden md:inline">Paste</span>
              </button>
              <button
                onClick={() => terminal.clear()}
                className="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded transition-colors text-xs"
                title="Clear terminal scrollback buffer (removes duplicate lines from Claude Code status updates)"
                aria-label="Clear terminal scrollback buffer"
              >
                🧹 <span className="hidden md:inline">Clear</span>
              </button>
            </div>
          )}
        </div>
      </div>
      )}

      {/* Connection Status (retry messages for remote connections) */}
      {connectionMessage && !connectionError && (
        <div className="px-4 py-2 bg-yellow-900/20 border-b border-yellow-800">
          <p className="text-sm text-yellow-400">
            🔄 {connectionMessage}
          </p>
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
          style={{
            // Terminal takes full available space within container
            flex: '1 1 0%',
            minHeight: 0,
            width: '100%',
            position: 'relative',
          }}
        />
        {/* Touch clipboard toolbar - floating bottom-right */}
        {isTouch && terminal && isReady && (
          <div className="absolute bottom-3 right-3 z-20 flex gap-1.5">
            <button
              onClick={handleTerminalCopy}
              className={`px-3 py-2 rounded-lg text-xs font-medium backdrop-blur-md transition-all active:scale-95 ${
                copyFeedback
                  ? 'bg-green-600/80 text-white'
                  : 'bg-gray-800/80 text-gray-300 border border-gray-600/50'
              }`}
            >
              {copyFeedback ? '✓ Copied' : '📋 Copy'}
            </button>
            <button
              onClick={handleTerminalPaste}
              className={`px-3 py-2 rounded-lg text-xs font-medium backdrop-blur-md transition-all active:scale-95 ${
                pasteFeedback
                  ? 'bg-green-600/80 text-white'
                  : 'bg-gray-800/80 text-gray-300 border border-gray-600/50'
              }`}
            >
              {pasteFeedback ? '✓ Pasted' : '📥 Paste'}
            </button>
          </div>
        )}
        {/* Use hoisted static JSX for loading state */}
        {!isReady && LoadingSpinner}
      </div>

      {/* Essential Keys Toolbar for touch devices */}
      <MobileKeyToolbar
        visible={isTouch && isConnected && isReady}
        onSendKey={sendMessage}
      />

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
                <div className="flex items-center gap-2">
                  <p className="text-xs text-gray-400">
                    {promptDraft.length} character{promptDraft.length === 1 ? '' : 's'}
                  </p>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    className="rounded-md border border-gray-700 px-2 py-1.5 text-xs text-gray-300 hover:border-gray-600 hover:text-white disabled:opacity-50 flex items-center gap-1"
                    title="Upload file (.md, .txt, .toml)"
                  >
                    <Paperclip className="w-3.5 h-3.5" />
                    {!isTouch && <span>{isUploading ? 'Uploading…' : 'Upload'}</span>}
                  </button>
                </div>
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

      {/* Hidden file input for upload button */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".md,.txt,.toml,.json,.yaml,.yml"
        onChange={handleFileUpload}
        className="hidden"
      />
    </div>
  )
}
