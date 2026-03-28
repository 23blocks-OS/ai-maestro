'use client'

import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { useTerminal } from '@/hooks/useTerminal'
import { useWebSocket } from '@/hooks/useWebSocket'
import { createResizeMessage } from '@/lib/websocket'
import { useTerminalRegistry } from '@/contexts/TerminalContext'
import { useDeviceType } from '@/hooks/useDeviceType'
import MobileKeyToolbar, { ctrlKey, altKey, shiftChar, type ModifiersHandle } from './MobileKeyToolbar'
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
  hideUploadButton?: boolean  // Hide upload button in prompt builder (when uploads handled externally)
  autoClearOnConnect?: boolean  // Clear terminal scrollback after initial history load (hides startup banner)
  onConnectionStatusChange?: (isConnected: boolean) => void  // Callback for connection status changes
  onFileUploaded?: (path: string, filename: string) => void  // Callback when file is uploaded via prompt builder
}

export default function TerminalView({ session, isVisible = true, hideFooter = false, hideHeader = false, hideUploadButton = false, autoClearOnConnect = false, onConnectionStatusChange, onFileUploaded }: TerminalViewProps) {
  const terminalRef = useRef<HTMLDivElement>(null)
  const [isReady, setIsReady] = useState(false)
  const [historyLoaded, setHistoryLoaded] = useState(false) // Gate for input handler
  const messageBufferRef = useRef<string[]>([])
  const [notes, setNotes] = useState('')
  const [promptDraft, setPromptDraft] = useState('')
  const { deviceType, isTouch } = useDeviceType()
  const isMobile = deviceType === 'phone' // only phones get compact layout

  const [copyFeedback, setCopyFeedback] = useState(false)
  const [pasteFeedback, setPasteFeedback] = useState(false)
  // Fixed column width: 0 = auto (FitAddon default), >0 = user-chosen fixed column count
  const [fixedCols, setFixedCols] = useState<number>(() => {
    if (typeof window === 'undefined') return 0
    try {
      return parseInt(localStorage.getItem(`terminal-fixed-cols-${session.agentId || session.id}`) || '0', 10) || 0
    } catch { return 0 }
  })
  const [showColsPopup, setShowColsPopup] = useState(false)
  const colsBtnRef = useRef<HTMLButtonElement>(null)
  const [colsPopupPos, setColsPopupPos] = useState<{ top: number; left: number } | null>(null)
  const baseFontSizeRef = useRef(16) // Default font size before column adjustment
  const fixedColsRef = useRef(fixedCols)

  // Banner removal: two-phase approach.
  // Phase 1 (buffering): discard ALL data for 3s after connect (catches scrollback dump).
  // Phase 2 (structural filter): after buffer phase, use a state machine to detect
  //   the banner box structure (╭/┌ ... ╰/└) and suppress only content inside it.
  //   A rolling buffer detects patterns split across WebSocket chunks.
  const bannerBufferingRef = useRef(autoClearOnConnect)
  const bannerFilterActiveRef = useRef(autoClearOnConnect)
  // State machine: 'idle' = pass through, 'suppressing' = inside banner box
  const bannerFilterStateRef = useRef<'idle' | 'suppressing'>('idle')
  // Track how many chars suppressed to failsafe-exit if end detection fails
  const bannerSuppressedCharsRef = useRef(0)
  // Rolling buffer for cross-chunk detection (raw data, keeps ANSI codes)
  const bannerRollingBufRef = useRef('')
  // The Claude Code banner uses a unique orange color: RGB(255,153,51)
  // ANSI escape: \x1b[38;2;255;153;51m — used ONLY for banner box borders.
  // Tool outputs, tables, and conversation boxes use different colors.
  const BANNER_ORANGE = '38;2;255;153;51'
  // Banner START: orange-colored border + "Claude Code" text in same data chunk/buffer
  const checkBannerStart = (raw: string, clean: string): boolean => {
    return raw.includes(BANNER_ORANGE) && clean.includes('Claude Code')
  }
  // Banner END: orange-colored border with bottom corner char + dashes
  const checkBannerEnd = (raw: string, clean: string): boolean => {
    if (!raw.includes(BANNER_ORANGE)) return false
    return (clean.includes('╰') || clean.includes('└')) &&
           /[─]{5,}/.test(clean)
  }
  // Failsafe: max chars to suppress before forcing exit
  const MAX_SUPPRESS_CHARS = 15000

  // Non-blocking hint shown when clipboard API is denied (iOS Safari) and user must paste natively
  const [pasteHint, setPasteHint] = useState(false)
  // Touch clipboard buttons vertical position: tracks last selection Y to float near it
  const [clipboardBtnTop, setClipboardBtnTop] = useState<number | null>(null)
  // Desktop selection tracking (reserved for future use)
  const hasDesktopSelection = false
  // Touch scroll indicator for xterm-viewport (positioned as sibling, not child)
  const [xtermScrollInfo, setXtermScrollInfo] = useState<{
    thumbTop: number; thumbHeight: number; trackHeight: number; visible: boolean
  }>({ thumbTop: 0, thumbHeight: 0, trackHeight: 0, visible: false })
  const promptTextareaRef = useRef<HTMLTextAreaElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const modifiersRef = useRef<ModifiersHandle | null>(null)
  const promptHistoryRef = useRef<string[]>([])
  const promptHistoryIndexRef = useRef(-1)
  const promptDraftSavedRef = useRef('')
  // Enter key default behavior: 'send' = send+execute, 'newline' = insert newline
  // Enter in prompt builder always sends+executes (Shift+Enter for newline)
  const enterMode = 'send' as const

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

  useEffect(() => {
    fixedColsRef.current = fixedCols
  }, [fixedCols])

  // Banner clearing state: terminal stays hidden (opacity 0) until the buffering
  // phase ends and tmux redraws the current screen without the banner.
  const [bannerCleared, setBannerCleared] = useState(!autoClearOnConnect)
  const bannerClearedRef = useRef(!autoClearOnConnect)
  const greetSentRef = useRef(false)
  const startupFitDoneRef = useRef(false)

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
      // execCommand fallback — prefer selection, then visible viewport
      let text = terminal.getSelection()
      if (!text) {
        const buffer = terminal.buffer.active
        const lines: string[] = []
        const vStart = buffer.viewportY
        for (let i = vStart; i < vStart + terminal.rows; i++) {
          const line = buffer.getLine(i)
          if (line) lines.push(line.translateToString(true))
        }
        while (lines.length > 0 && !lines[lines.length - 1].trim()) lines.pop()
        text = lines.join('\n')
      }
      const ta = document.createElement('textarea')
      ta.value = text
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
      // Clipboard API denied (iOS Safari, non-HTTPS, etc.)
      // Focus the terminal — xterm.js has an internal textarea that iOS Safari
      // CAN show the native paste menu on. The user does a standard paste gesture
      // (long-press → Paste, or Cmd+V with hardware keyboard) and xterm.js handles it.
      terminal.focus()
      setPasteHint(true)
      setTimeout(() => setPasteHint(false), 3000)
    }
  }, [terminal])

  const { isConnected, sendMessage, connectionError, errorHint, connectionMessage, connect, disconnect } = useWebSocket({
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
      // Reset startup fit so it runs again on reconnect
      startupFitDoneRef.current = false
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

              // 1b. If fixed column width is set, re-apply after fit
              if (fixedColsRef.current > 0 && term) {
                const baseFontSize = baseFontSizeRef.current
                const naturalCols = term.cols
                if (naturalCols > 0) {
                  const newFontSize = Math.max(6, Math.min(40, Math.round(baseFontSize * naturalCols / fixedColsRef.current)))
                  term.options.fontSize = newFontSize
                  fitTerminal()
                }
              }

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

      // Phase 1: During buffering, discard all incoming data (scrollback dump with banner)
      if (bannerBufferingRef.current) return

      // Phase 2: Structural banner filter — detect the Claude Code startup banner
      // by its unique orange border color (RGB 255,153,51) + "Claude Code" text.
      if (bannerFilterActiveRef.current) {
        const clean = data.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '')
        // Rolling buffer keeps raw data (with ANSI) for cross-chunk color detection
        bannerRollingBufRef.current = (bannerRollingBufRef.current + data).slice(-1000)
        const rawBuf = bannerRollingBufRef.current
        const cleanBuf = rawBuf.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '')

        if (bannerFilterStateRef.current === 'suppressing') {
          bannerSuppressedCharsRef.current += data.length
          // Check for banner's orange-colored bottom border
          if (checkBannerEnd(data, clean) || checkBannerEnd(rawBuf, cleanBuf)) {
            bannerFilterStateRef.current = 'idle'
            bannerRollingBufRef.current = ''
            bannerSuppressedCharsRef.current = 0
          }
          // Failsafe: stop suppressing if we've suppressed too much data
          if (bannerSuppressedCharsRef.current > MAX_SUPPRESS_CHARS) {
            console.warn('[Banner] Failsafe: exceeded max suppression, resuming output')
            bannerFilterStateRef.current = 'idle'
            bannerRollingBufRef.current = ''
            bannerSuppressedCharsRef.current = 0
          }
          return // Suppress this chunk (it's inside the banner box)
        }

        // Check if banner starts in this chunk or across chunks (orange + "Claude Code")
        if (checkBannerStart(data, clean) || checkBannerStart(rawBuf, cleanBuf)) {
          bannerFilterStateRef.current = 'suppressing'
          bannerSuppressedCharsRef.current = data.length
          // Check if banner also ends in this same chunk
          if (checkBannerEnd(data, clean)) {
            bannerFilterStateRef.current = 'idle'
            bannerRollingBufRef.current = ''
            bannerSuppressedCharsRef.current = 0
          }
          return // Suppress this chunk
        }
      }

      if (terminalInstanceRef.current) {
        terminalInstanceRef.current.write(data)
      } else {
        messageBufferRef.current.push(data)
      }
    },
  })

  // Refresh terminal: refit to correct dimensions and sync with tmux via resize.
  // Identical to pressing "Auto" — no clearing, just refit + PTY sync.
  const refreshTerminal = useCallback(() => {
    if (!terminal) return
    terminal.options.fontSize = baseFontSizeRef.current
    fitTerminal()
    const msg = createResizeMessage(terminal.cols, terminal.rows)
    sendMessage(msg)
  }, [terminal, fitTerminal, sendMessage])

  // Close column width popup on Escape or outside click
  useEffect(() => {
    if (!showColsPopup) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowColsPopup(false)
    }
    const handleClick = () => setShowColsPopup(false)
    document.addEventListener('keydown', handleKey)
    // Delayed listener so the opening click doesn't immediately close it
    const timer = setTimeout(() => document.addEventListener('click', handleClick), 0)
    return () => {
      document.removeEventListener('keydown', handleKey)
      document.removeEventListener('click', handleClick)
      clearTimeout(timer)
    }
  }, [showColsPopup])

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

  // Auto-greet: after the banner is cleared, inject "hi!" via bracketed paste + Enter
  // Defined here (before refreshTerminal) because refreshTerminal resets it.
  useEffect(() => {
    if (!autoClearOnConnect || !bannerCleared || !isConnected || greetSentRef.current) return
    greetSentRef.current = true
    // Inject "hi!" as bracketed paste (same as prompt builder)
    setTimeout(() => {
      sendMessage(`${BRACKETED_PASTE_START}hi!${BRACKETED_PASTE_END}`)
      // Send Enter after 500ms
      setTimeout(() => sendMessage('\r'), 500)
    }, 300)
  }, [autoClearOnConnect, bannerCleared, isConnected, sendMessage])

  // End the banner buffering phase: after 3 seconds of connection, stop discarding
  // data, clear the terminal, and send a resize to force tmux to redraw the current
  // screen only. The scrollback (which contains the banner) is not included in the
  // redraw, so the banner never appears.
  useEffect(() => {
    if (!autoClearOnConnect || !terminal || !isConnected) return
    const timer = setTimeout(() => {
      bannerBufferingRef.current = false
      // Discard any buffered messages (they contain the banner)
      messageBufferRef.current = []
      // Clear terminal in case anything slipped through
      terminal.clear()
      terminal.write('\x1b[0m')
      // Phase 2 keyword filter is already active (set at init).
      // It will catch banner content in the tmux redraw below.
      // Send resize to force tmux to redraw current screen
      const msg = createResizeMessage(terminal.cols, terminal.rows)
      sendMessage(msg)
      // Reveal terminal after a short delay for the redraw to arrive
      setTimeout(() => {
        setBannerCleared(true)
        bannerClearedRef.current = true
      }, 500)
      // Disable keyword filter after 15s (banner is long gone by then)
      setTimeout(() => { bannerFilterActiveRef.current = false }, 15000)
    }, 3000)
    return () => clearTimeout(timer)
  }, [autoClearOnConnect, terminal, isConnected, sendMessage])

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
    // NT-021: initializeTerminal is memoized via useCallback([]) in useTerminal and is
    // therefore a stable reference for the lifetime of the hook instance. Including it
    // in the dependency array is correct and removes the need to suppress the lint rule.
    // In the tab-based architecture each TerminalView is keyed by session.id, so a new
    // session.id always means a new component instance (React unmounts/remounts), and
    // initializeTerminal never changes within a single mount cycle.
    // session.id is intentionally omitted: the component is keyed by session.id, so any
    // change produces a full remount — re-running this effect is never needed mid-lifecycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initializeTerminal])

  // Flush buffered messages when terminal becomes ready (skip during banner buffering)
  useEffect(() => {
    if (terminal && messageBufferRef.current.length > 0 && !bannerBufferingRef.current) {
      messageBufferRef.current.forEach((msg) => terminal.write(msg))
      messageBufferRef.current = []
    }
  }, [terminal])

  // WebGL is now loaded inline during initializeTerminal() - no toggle needed.
  // Only one terminal is mounted at a time, so no GPU context exhaustion concern.

  // Apply fixed column width by adjusting font size so fitAddon computes the desired column count.
  // Called after any layout change (notes toggle, footer tab, container resize via useTerminal's ResizeObserver).
  const applyFixedCols = useCallback((cols: number) => {
    if (!terminal || !terminalRef.current) return
    const baseFontSize = baseFontSizeRef.current
    if (cols <= 0) {
      // Force xterm to re-compute dimensions by nudging font size +1 then back.
      // fitAddon.fit() is a no-op if dimensions haven't changed, so this ensures
      // a full refit + PTY sync even when called repeatedly at the same size.
      terminal.options.fontSize = baseFontSize + 1
      fitTerminal()
      terminal.options.fontSize = baseFontSize
      fitTerminal()
      // Sync PTY with new dimensions
      const resizeMsg = createResizeMessage(terminal.cols, terminal.rows)
      sendMessage(resizeMsg)
      return
    }
    // Step 1: Temporarily set base font size and fit to get natural cols at that size
    terminal.options.fontSize = baseFontSize
    fitTerminal()
    const naturalCols = terminal.cols
    if (naturalCols <= 0) return
    // Step 2: Compute the font size that yields the desired column count
    // fontSize ∝ 1/cols, so: newFontSize = baseFontSize × (naturalCols / desiredCols)
    const newFontSize = Math.max(6, Math.min(40, Math.round(baseFontSize * naturalCols / cols)))
    terminal.options.fontSize = newFontSize
    fitTerminal()
    // Sync PTY with new dimensions so tmux reflows
    const resizeMsg = createResizeMessage(terminal.cols, terminal.rows)
    sendMessage(resizeMsg)
  }, [terminal, fitTerminal, sendMessage])

  // Update fixed column width, persist to localStorage, and apply immediately
  const updateFixedCols = useCallback((cols: number) => {
    const clamped = cols <= 0 ? 0 : Math.max(40, Math.min(400, cols))
    setFixedCols(clamped)
    try {
      const key = `terminal-fixed-cols-${session.agentId || session.id}`
      if (clamped > 0) {
        localStorage.setItem(key, String(clamped))
      } else {
        localStorage.removeItem(key)
      }
    } catch { /* ignore storage errors */ }
    applyFixedCols(clamped)
  }, [session.agentId, session.id, applyFixedCols])

  // Auto-fit on startup: once terminal is ready and connected, run the same
  // sequence as the "Auto" button — fit terminal + sync PTY dimensions.
  // This ensures correct cols/rows from the start on all devices (especially iPad
  // where layout may not be settled during initial terminal initialization).
  useEffect(() => {
    if (!isReady || !terminal || !isConnected || startupFitDoneRef.current) return
    // Give the layout a moment to fully settle, then fit + sync
    const timer = setTimeout(() => {
      startupFitDoneRef.current = true
      applyFixedCols(fixedCols)
    }, 500)
    return () => clearTimeout(timer)
  }, [isReady, terminal, isConnected, fixedCols, applyFixedCols])

  // Trigger fit when notes collapse/expand or footer tab changes (changes terminal height)
  useEffect(() => {
    if (isReady && terminal) {
      // Notes state or footer tab changed, terminal height changed
      const timeout = setTimeout(() => {
        if (fixedCols > 0) {
          applyFixedCols(fixedCols)
        } else {
          fitTerminal()
        }
      }, 150)
      return () => clearTimeout(timeout)
    }
  }, [notesCollapsed, footerTab, isReady, terminal, fitTerminal, fixedCols, applyFixedCols, session.id])

  // Re-apply fixed cols after container resize (useTerminal's ResizeObserver calls fitAddon.fit()
  // with the default font size, so we need to re-adjust). This runs on a 300ms debounce after
  // the useTerminal's 150ms debounced fit, giving it time to complete first.
  useEffect(() => {
    if (!isReady || !terminal || fixedCols <= 0 || !terminalRef.current) return
    const container = terminalRef.current
    let debounceTimer: ReturnType<typeof setTimeout> | null = null
    const observer = new ResizeObserver(() => {
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => applyFixedCols(fixedCols), 300)
    })
    observer.observe(container)
    return () => {
      observer.disconnect()
      if (debounceTimer) clearTimeout(debounceTimer)
    }
  }, [isReady, terminal, fixedCols, applyFixedCols])

  // Handle terminal input
  // Note: Removed historyLoaded gate - it was preventing typing until ESC was pressed
  useEffect(() => {
    if (!terminal || !isConnected) {
      return
    }

    const disposable = terminal.onData((data) => {
      // Apply toolbar modifier state to keyboard input (supports multi-modifier combos)
      const mods = modifiersRef.current
      if (mods && data.length === 1) {
        const code = data.charCodeAt(0)
        if (code >= 32 && code <= 126) {
          const metaOn = mods.meta !== 'off'
          const ctrlOn = mods.ctrl !== 'off'
          const altOn = mods.alt !== 'off'
          const shiftOn = mods.shift !== 'off'

          if (metaOn) {
            // Cmd: clipboard operations (copy/paste/select-all)
            const char = data.toLowerCase()
            if (char === 'c') {
              const sel = terminal.getSelection()
              if (sel) navigator.clipboard.writeText(sel).catch(() => {
                // Clipboard API denied — use execCommand('copy') fallback
                const ta = document.createElement('textarea')
                ta.value = sel
                ta.style.cssText = 'position:fixed;opacity:0'
                document.body.appendChild(ta)
                ta.select()
                document.execCommand('copy')
                document.body.removeChild(ta)
              })
            } else if (char === 'v') {
              navigator.clipboard.readText().then(text => {
                if (text) {
                  // Use bracketed paste for multi-line content (same as pasteFromClipboard)
                  const adjusted = text.replace(/\r\n?/g, '\n').replace(/\n/g, '\r')
                  sendMessage(`${BRACKETED_PASTE_START}${adjusted}${BRACKETED_PASTE_END}`)
                }
              }).catch(() => {
                // Clipboard API denied (iOS Safari) — focus terminal for native paste
                terminal.focus()
                setPasteHint(true)
                setTimeout(() => setPasteHint(false), 3000)
              })
            } else if (char === 'a') {
              terminal.selectAll()
            }
            // All other Cmd+key: no terminal equivalent, just clear modifier
            mods.clearOneShot()
            return
          }

          // Build the transformed character: Shift first, then Ctrl/Alt
          const ch = shiftOn ? shiftChar(data) : data

          if (ctrlOn && altOn) {
            sendMessage('\x1b' + ctrlKey(ch))
            mods.clearOneShot()
            return
          }
          if (ctrlOn) {
            sendMessage(ctrlKey(ch))
            mods.clearOneShot()
            return
          }
          if (altOn) {
            sendMessage(altKey(ch))
            mods.clearOneShot()
            return
          }
          if (shiftOn) {
            sendMessage(ch)
            mods.clearOneShot()
            return
          }
          mods.clearOneShot()
        } else {
          // Non-printable char (Enter, Backspace, etc.) — clear one-shot modifiers
          mods.clearOneShot()
        }
      }
      sendMessage(data)
    })

    return () => {
      disposable.dispose()
    }
  }, [terminal, isConnected, sendMessage])

  // Listen for haephestos-inject events (used by agent creation page to inject file paths)
  useEffect(() => {
    if (!isConnected) return

    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (!detail?.message) return
      const text = String(detail.message)
      const carriageAdjusted = text.replace(/\r\n?/g, '\n').replace(/\n/g, '\r')
      const bracketedPayload = `${BRACKETED_PASTE_START}${carriageAdjusted}${BRACKETED_PASTE_END}`
      sendMessage(bracketedPayload)
      // Also send Enter to submit the message
      sendMessage('\r')
    }

    window.addEventListener('haephestos-inject', handler)
    return () => window.removeEventListener('haephestos-inject', handler)
  }, [isConnected, sendMessage])

  // Copy selection to clipboard
  const copySelection = useCallback(() => {
    if (!terminal) return
    const selection = terminal.getSelection()
    if (selection) {
      navigator.clipboard.writeText(selection)
        .then(() => {
          setCopyFeedback(true)
          setTimeout(() => setCopyFeedback(false), 1500)
        })
        .catch(() => {
          // Clipboard API denied — use execCommand('copy') fallback
          const ta = document.createElement('textarea')
          ta.value = selection
          ta.style.cssText = 'position:fixed;opacity:0'
          document.body.appendChild(ta)
          ta.select()
          document.execCommand('copy')
          document.body.removeChild(ta)
          setCopyFeedback(true)
          setTimeout(() => setCopyFeedback(false), 1500)
        })
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
        setPasteFeedback(true)
        setTimeout(() => setPasteFeedback(false), 1500)
        // Focus terminal after paste
        if (terminalInstanceRef.current) {
          terminalInstanceRef.current.focus()
        }
      }
    } catch {
      // Clipboard API denied (iOS Safari, non-HTTPS, etc.)
      // Focus the terminal so xterm.js can receive native paste events
      const term = terminalInstanceRef.current
      if (term) term.focus()
      setPasteHint(true)
      setTimeout(() => setPasteHint(false), 3000)
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

  // Safety: force refit + PTY resize sync after both terminal and WebSocket are ready.
  // On iPad, the flex layout may not be settled when history-complete fires, causing
  // tmux to receive wrong dimensions (half cols/rows → terminal renders in 1/4 area).
  // Skip during banner buffering — the buffer-then-clear effect handles its own resize.
  useEffect(() => {
    if (!terminal || !isConnected) return
    // During banner buffering, all data is discarded anyway. The buffer-then-clear
    // effect sends a resize after the buffering phase ends. Don't interfere.
    if (bannerBufferingRef.current) return
    const sync = () => {
      fitTerminal()
      const msg = createResizeMessage(terminal.cols, terminal.rows)
      sendMessage(msg)
    }
    const t1 = setTimeout(sync, 1000)
    const t2 = setTimeout(sync, 3000)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [terminal, isConnected, fitTerminal, sendMessage])

  // Mobile touch handler: scroll (short drag) + text selection (long press then drag)
  useEffect(() => {
    if (!isTouch || !terminal || !terminalRef.current) return

    let touchStartX = 0
    let touchStartY = 0
    let isTouchingTerminal = false
    let isSelecting = false
    let hasMoved = false
    let longPressTimer: ReturnType<typeof setTimeout> | null = null
    // Anchor cell for selection start
    let anchorCol = 0
    let anchorRow = 0
    const terminalElement = terminalRef.current

    // Convert touch coordinates to terminal cell position
    const touchToCell = (clientX: number, clientY: number) => {
      const xtermScreen = terminalElement.querySelector('.xterm-screen')
      if (!xtermScreen) return null
      const rect = xtermScreen.getBoundingClientRect()
      const x = clientX - rect.left
      const y = clientY - rect.top
      // Cell dimensions from terminal viewport
      const cellWidth = rect.width / terminal.cols
      const cellHeight = rect.height / terminal.rows
      const col = Math.max(0, Math.min(terminal.cols - 1, Math.floor(x / cellWidth)))
      const row = Math.max(0, Math.min(terminal.rows - 1, Math.floor(y / cellHeight)))
      return { col, row }
    }

    // Select from anchor to current cell (line-aware, supports multiline)
    const selectRange = (toCol: number, toRow: number) => {
      const buf = terminal.buffer.active
      let startRow = anchorRow
      let startCol = anchorCol
      let endRow = toRow
      let endCol = toCol
      // Normalize so start is before end
      if (startRow > endRow || (startRow === endRow && startCol > endCol)) {
        ;[startRow, startCol, endRow, endCol] = [endRow, endCol, startRow, startCol]
      }
      // Build selection: select from startCol on startRow across all rows to endCol on endRow
      const absStartRow = startRow + buf.viewportY
      const totalLength = (endRow - startRow) * terminal.cols + (endCol - startCol) + 1
      terminal.select(startCol, absStartRow, totalLength)
    }

    const handleTouchStart = (e: TouchEvent) => {
      const rect = terminalElement.getBoundingClientRect()
      const touch = e.touches[0]
      if (
        touch.clientX >= rect.left &&
        touch.clientX <= rect.right &&
        touch.clientY >= rect.top &&
        touch.clientY <= rect.bottom
      ) {
        isTouchingTerminal = true
        touchStartX = touch.clientX
        touchStartY = touch.clientY
        hasMoved = false
        isSelecting = false

        // Start long-press timer (400ms). If finger stays still, enter selection mode.
        longPressTimer = setTimeout(() => {
          const cell = touchToCell(touchStartX, touchStartY)
          if (cell) {
            isSelecting = true
            anchorCol = cell.col
            anchorRow = cell.row
            // Initial tap: select the word at the touch point (like double-click)
            const buf = terminal.buffer.active
            const line = buf.getLine(cell.row + buf.viewportY)
            if (line) {
              const lineText = line.translateToString()
              // Find word boundaries around the tapped column
              let wStart = cell.col
              let wEnd = cell.col
              while (wStart > 0 && /\S/.test(lineText[wStart - 1] || '')) wStart--
              while (wEnd < lineText.length - 1 && /\S/.test(lineText[wEnd + 1] || '')) wEnd++
              if (wEnd >= wStart && /\S/.test(lineText[cell.col] || '')) {
                anchorCol = wStart
                terminal.select(wStart, cell.row + buf.viewportY, wEnd - wStart + 1)
              } else {
                // Tapped on whitespace: point selection
                terminal.select(cell.col, cell.row + buf.viewportY, 1)
              }
            }
            // Position clipboard buttons near the initial selection (same row for both)
            lastSelectionRow = anchorRow
            updateClipboardBtnPos(anchorRow, anchorRow)
          }
        }, 400)
      }
    }

    const handleTouchMove = (e: TouchEvent) => {
      if (!isTouchingTerminal) return
      const touch = e.touches[0]
      const dx = touch.clientX - touchStartX
      const dy = touch.clientY - touchStartY

      // Cancel long-press if finger moved significantly before timer fired
      if (!isSelecting && !hasMoved && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) {
        hasMoved = true
        if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null }
      }

      if (isSelecting) {
        // Selection mode: extend selection to current touch position
        const cell = touchToCell(touch.clientX, touch.clientY)
        if (cell) selectRangeAndTrack(cell.col, cell.row)
        e.preventDefault()
        e.stopPropagation()
      } else if (hasMoved) {
        // Scroll mode
        const deltaY = touchStartY - touch.clientY
        const linesToScroll = Math.round(deltaY / 30)
        if (Math.abs(linesToScroll) > 0) {
          terminal.scrollLines(linesToScroll)
          touchStartY = touch.clientY
        }
        e.preventDefault()
        e.stopPropagation()
      }
    }

    // Track the last selection row for handleTouchEnd
    let lastSelectionRow = 0

    // Position clipboard buttons so they never cover the line being selected.
    // If finger is at/below the anchor → buttons go above the topmost selected line.
    // If finger is above the anchor → buttons go below the bottommost selected line.
    // Falls back to the opposite side when there isn't enough room.
    const updateClipboardBtnPos = (anchorR: number, currentR: number) => {
      const xtermScreen = terminalElement.querySelector('.xterm-screen')
      if (!xtermScreen) return
      const rect = xtermScreen.getBoundingClientRect()
      const cellHeight = rect.height / terminal.rows
      const btnHeight = 44 // approximate height of the clipboard button row

      const topRow = Math.min(anchorR, currentR)
      const bottomRow = Math.max(anchorR, currentR)

      // Just above the topmost selected line (with 4px gap)
      const abovePos = topRow * cellHeight - btnHeight - 4
      // Just below the bottommost selected line (with 4px gap)
      const belowPos = (bottomRow + 1) * cellHeight + 4

      let pos: number
      if (currentR >= anchorR) {
        // Finger at bottom of selection → prefer buttons above
        pos = abovePos >= 0 ? abovePos : belowPos
      } else {
        // Finger at top of selection → prefer buttons below
        pos = belowPos + btnHeight <= rect.height ? belowPos : abovePos
      }

      // Clamp within terminal bounds
      pos = Math.max(0, Math.min(pos, rect.height - btnHeight))
      setClipboardBtnTop(pos)
    }

    const selectRangeAndTrack = (toCol: number, toRow: number) => {
      selectRange(toCol, toRow)
      lastSelectionRow = toRow
      updateClipboardBtnPos(anchorRow, toRow)
    }

    const handleTouchEnd = () => {
      if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null }
      // Short tap without movement or selection: focus terminal to open native keyboard
      if (isTouchingTerminal && !hasMoved && !isSelecting) {
        terminal.focus()
      }
      // If selection was made, finalize button position
      if (isSelecting) {
        updateClipboardBtnPos(anchorRow, lastSelectionRow)
      }
      isTouchingTerminal = false
      isSelecting = false
      hasMoved = false
    }

    document.addEventListener('touchstart', handleTouchStart, { passive: true, capture: true })
    document.addEventListener('touchmove', handleTouchMove, { passive: false, capture: true })
    document.addEventListener('touchend', handleTouchEnd, { passive: true, capture: true })
    document.addEventListener('touchcancel', handleTouchEnd, { passive: true, capture: true })

    return () => {
      if (longPressTimer) clearTimeout(longPressTimer)
      document.removeEventListener('touchstart', handleTouchStart, true)
      document.removeEventListener('touchmove', handleTouchMove, true)
      document.removeEventListener('touchend', handleTouchEnd, true)
      document.removeEventListener('touchcancel', handleTouchEnd, true)
    }
  }, [isTouch, terminal])

  // Desktop floating copy/paste buttons: reserved for future implementation.
  // xterm.js with WebGL renderer captures all mouse events internally, making
  // document-level mouseup detection unreliable. Touch devices work via the
  // touch selection tracking in the useEffect below.

  // Touch scroll indicator for xterm — uses xterm's buffer API (not DOM scroll)
  // for reliable scroll position on iOS Safari where viewport scroll events
  // and scrollHeight may not work correctly with hidden native scrollbars.
  useEffect(() => {
    if (!isTouch || !terminal || !terminalRef.current) return

    const container = terminalRef.current
    let cachedTrackH = 0
    let rafPending = false

    const update = () => {
      const buf = terminal.buffer.active
      const totalLines = buf.length
      const viewportRows = terminal.rows
      const scrollable = totalLines - viewportRows
      if (scrollable <= 0) {
        setXtermScrollInfo(prev => prev.visible ? { ...prev, visible: false } : prev)
        return
      }
      if (cachedTrackH <= 0) cachedTrackH = container.getBoundingClientRect().height
      if (cachedTrackH <= 0) return
      const ratio = viewportRows / totalLines
      const thumbH = Math.max(ratio * cachedTrackH, 30)
      const maxTop = cachedTrackH - thumbH
      const scrollPos = Math.min(1, buf.viewportY / scrollable)
      const top = scrollPos * maxTop
      setXtermScrollInfo({ thumbTop: top, thumbHeight: thumbH, trackHeight: cachedTrackH, visible: true })
    }

    // Throttled update via rAF to prevent excessive setState during rapid output
    const throttledUpdate = () => {
      if (rafPending) return
      rafPending = true
      requestAnimationFrame(() => {
        rafPending = false
        update()
      })
    }

    // Listen to DOM scroll events (user scrolling) and xterm write events (new output)
    const viewport = container.querySelector('.xterm-viewport') as HTMLElement | null
    if (viewport) viewport.addEventListener('scroll', throttledUpdate, { passive: true })
    const ro = new ResizeObserver(() => {
      cachedTrackH = container.getBoundingClientRect().height
      update()
    })
    ro.observe(container)
    const interval = setInterval(update, 500)
    const disposable = terminal.onWriteParsed(throttledUpdate)
    update()

    return () => {
      if (viewport) viewport.removeEventListener('scroll', throttledUpdate)
      ro.disconnect()
      clearInterval(interval)
      disposable.dispose()
    }
  }, [isTouch, terminal])

  // Load notes from localStorage when storageId is known (runs once on mount since storageId is stable)
  // SF-047: storageId is derived from session.agentId || session.id and is stable for the lifetime
  // of this component instance. Including it as a dependency is correct — it ensures notes are
  // reloaded if agentId becomes available after the initial render (e.g. registry hydration).
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
    // SF-047: storageId is stable for the lifetime of this component instance (keyed by session).
    // Including it in the dependency array is correct: if storageId ever changes (e.g. agentId
    // becomes available after initial render), the notes will be reloaded for the correct key.
  }, [storageId])

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
    // SF-047: storageId is stable for the lifetime of this component instance (keyed by session).
    // Including it in the dependency array is correct: if storageId ever changes (e.g. agentId
    // becomes available after initial render), the prompt draft will be reloaded for the correct key.
  }, [storageId])

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
      if (!isConnected) {
        console.warn('[PromptBuilder] Not connected, cannot send prompt.')
        return
      }
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

      // Save to prompt history (avoid duplicates at end)
      const trimmed = promptDraft.trim()
      if (trimmed && promptHistoryRef.current[promptHistoryRef.current.length - 1] !== trimmed) {
        promptHistoryRef.current.push(trimmed)
      }
      promptHistoryIndexRef.current = -1
      promptDraftSavedRef.current = ''
      setPromptDraft('')

      if (mode === 'send') {
        // Delay Enter by 500ms so tmux processes the bracketed paste first
        setTimeout(() => sendMessage('\r'), 500)
      }
      focusTerminal()
    },
    [focusTerminal, isConnected, promptDraft, sendMessage]
  )

  const handlePromptKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
      // Merge native keyboard modifiers with toolbar modifiers (OR logic, no duplicates).
      // Block only native meta/ctrl to preserve browser clipboard shortcuts (Cmd+C etc.).
      // Native alt/shift are allowed through and aggregated with toolbar state.
      const mods = modifiersRef.current
      const anyToolbarActive = mods && (mods.meta !== 'off' || mods.ctrl !== 'off' || mods.alt !== 'off' || mods.shift !== 'off')
      if (mods && event.key.length === 1 && !event.metaKey && !event.ctrlKey && anyToolbarActive) {
        const metaOn = mods.meta !== 'off'
        const ctrlOn = mods.ctrl !== 'off'
        const altOn = event.altKey || mods.alt !== 'off'
        const shiftOn = event.shiftKey || mods.shift !== 'off'

        if (metaOn) {
          // Cmd: clipboard operations in prompt builder (copy/paste/select-all/cut)
          const char = event.key.toLowerCase()
          const textarea = event.currentTarget
          event.preventDefault()
          if (char === 'a') {
            textarea.select()
          } else if (char === 'c') {
            const selected = textarea.value.substring(textarea.selectionStart, textarea.selectionEnd)
            if (selected) navigator.clipboard.writeText(selected).catch(() => {
              // Clipboard API denied — use temp textarea with just the selected text
              const ta = document.createElement('textarea')
              ta.value = selected
              ta.style.cssText = 'position:fixed;opacity:0'
              document.body.appendChild(ta)
              ta.select()
              document.execCommand('copy')
              document.body.removeChild(ta)
            })
          } else if (char === 'v') {
            const start = textarea.selectionStart
            const end = textarea.selectionEnd
            navigator.clipboard.readText().then(text => {
              if (!text) return
              setPromptDraft(prev => prev.substring(0, start) + text + prev.substring(end))
              requestAnimationFrame(() => {
                textarea.selectionStart = textarea.selectionEnd = start + text.length
              })
            }).catch(() => {
              // Clipboard API denied — show hint to use native paste
              setPasteHint(true)
              setTimeout(() => setPasteHint(false), 3000)
            })
          } else if (char === 'x') {
            const start = textarea.selectionStart
            const end = textarea.selectionEnd
            const selected = textarea.value.substring(start, end)
            if (selected) {
              navigator.clipboard.writeText(selected).catch(() => {
                // Clipboard API denied — use execCommand('copy') fallback before cutting
                document.execCommand('copy')
              })
              setPromptDraft(prev => prev.substring(0, start) + prev.substring(end))
              requestAnimationFrame(() => {
                textarea.selectionStart = textarea.selectionEnd = start
              })
            }
          }
          // All other Cmd+key: no action, just clear modifier
          mods.clearOneShot()
          return
        }

        // Build the transformed character: Shift first, then Ctrl/Alt
        const ch = shiftOn ? shiftChar(event.key) : event.key

        if (ctrlOn && altOn) {
          event.preventDefault()
          sendMessage('\x1b' + ctrlKey(ch))
          mods.clearOneShot()
          return
        }
        if (ctrlOn) {
          event.preventDefault()
          sendMessage(ctrlKey(ch))
          mods.clearOneShot()
          return
        }
        if (altOn) {
          event.preventDefault()
          sendMessage(altKey(ch))
          mods.clearOneShot()
          return
        }
        if (shiftOn) {
          // Insert shifted character into textarea at cursor position
          event.preventDefault()
          const textarea = event.currentTarget
          const start = textarea.selectionStart
          const end = textarea.selectionEnd
          setPromptDraft(prev => prev.substring(0, start) + ch + prev.substring(end))
          requestAnimationFrame(() => {
            textarea.selectionStart = textarea.selectionEnd = start + ch.length
          })
          mods.clearOneShot()
          return
        }
        mods.clearOneShot()
      }

      // Cmd/Ctrl+Enter always does the opposite of Enter's default
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault()
        handlePromptSubmit(enterMode === 'send' ? 'insert' : 'send')
        return
      }

      // Shift+Enter always inserts a newline
      if (event.key === 'Enter' && event.shiftKey) {
        // Let the browser's default textarea behavior insert a newline
        return
      }

      // Enter follows the user's enterMode setting
      if (event.key === 'Enter') {
        if (enterMode === 'send') {
          event.preventDefault()
          handlePromptSubmit('send')
        }
        // enterMode === 'newline': let browser insert newline (default textarea behavior)
        return
      }

      // Tab / Shift+Tab: indent/deindent selected lines
      if (event.key === 'Tab') {
        event.preventDefault()
        const textarea = event.currentTarget
        const start = textarea.selectionStart
        const end = textarea.selectionEnd
        const value = textarea.value

        if (start === end && !event.shiftKey) {
          // No selection: insert 2 spaces at cursor
          setPromptDraft(value.substring(0, start) + '  ' + value.substring(end))
          requestAnimationFrame(() => {
            textarea.selectionStart = textarea.selectionEnd = start + 2
          })
        } else {
          // Selection spans lines: indent/deindent each line
          const lineStart = value.lastIndexOf('\n', start - 1) + 1
          const lineEnd = end > start && value[end - 1] === '\n' ? end - 1 : (value.indexOf('\n', end) === -1 ? value.length : value.indexOf('\n', end))
          const selectedBlock = value.substring(lineStart, lineEnd)
          const lines = selectedBlock.split('\n')

          let modified: string[]
          let cursorDelta: number
          if (event.shiftKey) {
            // Deindent: remove up to 2 leading spaces from each line
            modified = lines.map(line => line.startsWith('  ') ? line.substring(2) : line.startsWith(' ') ? line.substring(1) : line)
            cursorDelta = lines[0].startsWith('  ') ? -2 : lines[0].startsWith(' ') ? -1 : 0
          } else {
            // Indent: add 2 spaces to each line
            modified = lines.map(line => '  ' + line)
            cursorDelta = 2
          }

          const newBlock = modified.join('\n')
          setPromptDraft(value.substring(0, lineStart) + newBlock + value.substring(lineEnd))
          requestAnimationFrame(() => {
            textarea.selectionStart = Math.max(lineStart, start + cursorDelta)
            textarea.selectionEnd = lineStart + newBlock.length
          })
        }
        return
      }

      // History navigation with ArrowUp/ArrowDown at boundaries
      const textarea = event.currentTarget
      const history = promptHistoryRef.current
      if (event.key === 'ArrowUp' && history.length > 0) {
        // Navigate up when cursor is at line 1
        const beforeCursor = textarea.value.substring(0, textarea.selectionStart)
        const isFirstLine = !beforeCursor.includes('\n')
        if (isFirstLine) {
          event.preventDefault()
          if (promptHistoryIndexRef.current === -1) {
            promptDraftSavedRef.current = promptDraft
            promptHistoryIndexRef.current = history.length - 1
          } else if (promptHistoryIndexRef.current > 0) {
            promptHistoryIndexRef.current--
          }
          setPromptDraft(history[promptHistoryIndexRef.current])
        }
      } else if (event.key === 'ArrowDown' && promptHistoryIndexRef.current !== -1) {
        // Navigate down when cursor is at last line
        const afterCursor = textarea.value.substring(textarea.selectionEnd)
        const isLastLine = !afterCursor.includes('\n')
        if (isLastLine) {
          event.preventDefault()
          if (promptHistoryIndexRef.current < history.length - 1) {
            promptHistoryIndexRef.current++
            setPromptDraft(history[promptHistoryIndexRef.current])
          } else {
            promptHistoryIndexRef.current = -1
            setPromptDraft(promptDraftSavedRef.current)
          }
        }
      }
    },
    [handlePromptSubmit, promptDraft, sendMessage]
  )


  // Toolbar key handler: redirects Tab to prompt builder when it's focused
  const handleToolbarKey = useCallback((data: string) => {
    const textarea = promptTextareaRef.current
    // If prompt builder textarea is focused and key is Tab, indent/deindent there
    if (data === '\x09' && textarea && document.activeElement === textarea) {
      const mods = modifiersRef.current
      const shiftKey = mods?.shift !== 'off'
      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      // Read live DOM value (not stale React state) to avoid race with fast typing
      const value = textarea.value

      if (start === end && !shiftKey) {
        // No selection: insert 2 spaces at cursor
        const newValue = value.substring(0, start) + '  ' + value.substring(end)
        setPromptDraft(newValue)
        requestAnimationFrame(() => {
          textarea.selectionStart = textarea.selectionEnd = start + 2
        })
      } else {
        // Selection spans lines: indent/deindent each line
        const lineStart = value.lastIndexOf('\n', start - 1) + 1
        const lineEnd = end > start && value[end - 1] === '\n' ? end - 1 : (value.indexOf('\n', end) === -1 ? value.length : value.indexOf('\n', end))
        const selectedBlock = value.substring(lineStart, lineEnd)
        const lines = selectedBlock.split('\n')
        let modified: string[]
        let cursorDelta: number
        if (shiftKey) {
          modified = lines.map(line => line.startsWith('  ') ? line.substring(2) : line.startsWith(' ') ? line.substring(1) : line)
          cursorDelta = lines[0].startsWith('  ') ? -2 : lines[0].startsWith(' ') ? -1 : 0
        } else {
          modified = lines.map(line => '  ' + line)
          cursorDelta = 2
        }
        const newBlock = modified.join('\n')
        setPromptDraft(value.substring(0, lineStart) + newBlock + value.substring(lineEnd))
        requestAnimationFrame(() => {
          textarea.selectionStart = Math.max(lineStart, start + cursorDelta)
          textarea.selectionEnd = lineStart + newBlock.length
        })
      }
      if (mods) mods.clearOneShot()
      return
    }
    sendMessage(data)
  }, [sendMessage])

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
              <h3 className="font-medium text-gray-400 text-xs md:text-sm truncate" style={{ maxWidth: '8ch' }}>
                {session.hostId !== 'local' ? session.hostId : 'local'}
              </h3>
              <span className="text-gray-600">/</span>
              <h3 className="font-medium text-gray-100 text-sm md:text-base truncate" style={{ maxWidth: '10ch' }}>
                {session.name || session.id}
              </h3>
            </div>
          </div>
          {terminal && (
            <div className="flex items-center gap-3 md:gap-3 text-xs text-gray-400 flex-shrink min-w-0 overflow-x-auto">
              {/* Mobile: Notes toggle button */}
              {!hideFooter && (
                <>
                  <button
                    onClick={() => setNotesCollapsed(!notesCollapsed)}
                    className="md:hidden px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded transition-colors text-xs"
                    title={notesCollapsed ? "Show footer" : "Hide footer"}
                    aria-label={notesCollapsed ? "Show footer" : "Hide footer"}
                  >
                    📝
                  </button>
                  <span className="text-gray-500 md:hidden">|</span>
                </>
              )}

              {/* Terminal dimensions — clickable to open column width popup */}
              <div className="hidden md:inline relative">
                <button
                  ref={colsBtnRef}
                  onClick={() => {
                    if (!showColsPopup && colsBtnRef.current) {
                      const rect = colsBtnRef.current.getBoundingClientRect()
                      setColsPopupPos({ top: rect.bottom + 8, left: rect.left + rect.width / 2 - 144 })
                    }
                    setShowColsPopup(!showColsPopup)
                  }}
                  className={`px-2 py-0.5 rounded text-xs transition-colors ${
                    fixedCols > 0
                      ? 'bg-amber-700/40 text-amber-300 hover:bg-amber-700/60 border border-amber-600/30'
                      : 'hover:bg-gray-700 text-gray-400 hover:text-gray-200'
                  }`}
                  title={fixedCols > 0 ? `Fixed: ${fixedCols} cols (click to adjust)` : 'Click to set fixed column width'}
                >
                  {terminal.cols}x{terminal.rows}
                </button>
                {showColsPopup && colsPopupPos && typeof document !== 'undefined' && createPortal(
                  <div
                    className="fixed z-[9999] bg-gray-800 border border-gray-600 rounded-xl shadow-2xl p-4 w-72"
                    style={{ top: colsPopupPos.top, left: Math.max(8, colsPopupPos.left) }}
                    onClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-semibold text-gray-300">Column Width</span>
                      <button
                        onClick={() => setShowColsPopup(false)}
                        className="text-gray-500 hover:text-gray-300 text-sm"
                      >✕</button>
                    </div>
                    <div className="mb-3">
                      <input
                        type="range"
                        min={40}
                        max={300}
                        step={1}
                        value={fixedCols || terminal.cols}
                        onChange={(e) => updateFixedCols(parseInt(e.target.value, 10))}
                        className="w-full h-8 appearance-none bg-gray-700 rounded-lg cursor-pointer accent-amber-500
                          [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-7 [&::-webkit-slider-thumb]:h-7
                          [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-amber-500 [&::-webkit-slider-thumb]:shadow-lg
                          [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-amber-300"
                        title="Drag to set column width"
                      />
                    </div>
                    <div className="flex items-center gap-2 mb-3">
                      <label className="text-[11px] text-gray-400 flex-shrink-0">Columns:</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        defaultValue={fixedCols || terminal.cols}
                        key={showColsPopup ? 'open' : 'closed'}
                        onPointerDown={(e) => e.stopPropagation()}
                        onFocus={(e) => { e.stopPropagation(); e.target.select() }}
                        onBlur={(e) => {
                          const v = parseInt(e.target.value, 10)
                          if (!isNaN(v) && v >= 40 && v <= 400) updateFixedCols(v)
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const v = parseInt((e.target as HTMLInputElement).value, 10)
                            if (!isNaN(v) && v >= 40 && v <= 400) updateFixedCols(v)
                          }
                        }}
                        className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 text-sm text-gray-200 text-center w-20"
                      />
                      <button
                        onClick={() => updateFixedCols(0)}
                        className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${
                          fixedCols === 0
                            ? 'bg-emerald-700/60 text-emerald-200 border border-emerald-600/40'
                            : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                        }`}
                        title="Reset to automatic column width"
                      >
                        Auto
                      </button>
                    </div>
                    <p className="text-[10px] text-gray-500">
                      {fixedCols > 0 ? `Fixed at ${fixedCols} columns. Font adjusts to fit.` : 'Auto: columns adapt to window size.'}
                    </p>
                  </div>,
                  document.body
                )}
              </div>
              <span className="text-gray-500 hidden 2xl:inline">|</span>
              <span className="hidden 2xl:inline" title={`Buffer: ${terminal.buffer.active.length} lines (max: 50000)`}>
                📜 {terminal.buffer.active.length} lines
              </span>
              <span className="text-gray-500 hidden 2xl:inline">|</span>
              <span className="hidden 2xl:inline" title="Shift+PageUp/PageDown: Scroll by page&#10;Shift+Arrow Up/Down: Scroll 5 lines&#10;Shift+Home/End: Jump to top/bottom&#10;Or use mouse wheel/trackpad">
                ⌨️ Shift+PgUp/PgDn • Shift+↑/↓
              </span>
              <span className="text-gray-500 hidden 2xl:inline">|</span>
              <button
                onClick={globalLoggingEnabled ? toggleLogging : undefined}
                disabled={!globalLoggingEnabled}
                className={`hidden 2xl:inline-flex px-3 py-1.5 rounded transition-colors text-xs ${
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
                {loggingEnabled ? '📝' : '🚫'} <span className="hidden 2xl:inline">{loggingEnabled ? 'Logging' : 'No Log'}</span>
              </button>
              <span className="text-gray-500 hidden md:inline">|</span>
              <button
                onClick={copySelection}
                className={`px-3 py-1.5 rounded transition-colors text-xs ${
                  copyFeedback
                    ? 'bg-green-700 text-white'
                    : 'bg-gray-700 hover:bg-gray-600 text-gray-200'
                }`}
                title="Copy selected text to clipboard"
                aria-label="Copy selected text to clipboard"
              >
                {copyFeedback ? '✓' : '📋'} <span className="hidden md:inline">{copyFeedback ? 'Copied' : 'Copy'}</span>
              </button>
              <span className="text-gray-600 text-[10px]">·</span>
              <button
                onClick={pasteFromClipboard}
                className={`px-3 py-1.5 rounded transition-colors text-xs ${
                  pasteFeedback
                    ? 'bg-green-700 text-white'
                    : 'bg-gray-700 hover:bg-gray-600 text-gray-200'
                }`}
                title="Paste from clipboard (mobile-friendly)"
                aria-label="Paste from clipboard"
              >
                {pasteFeedback ? '✓' : '📥'} <span className="hidden md:inline">{pasteFeedback ? 'Pasted' : 'Paste'}</span>
              </button>
              <span className="text-gray-600 text-[10px]">·</span>
              <button
                onClick={refreshTerminal}
                className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded transition-colors text-xs"
                title="Reconnect terminal WebSocket (refresh connection)"
                aria-label="Refresh terminal connection"
              >
                🔄 <span className="hidden md:inline">Refresh</span>
              </button>
              <span className="text-gray-600 text-[10px]">·</span>
              <button
                onClick={() => { terminal.clear(); terminal.write('\x1b[0m') }}
                className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded transition-colors text-xs"
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
          flexDirection: 'column',
          // Hide terminal while banner is being cleared (keeps layout for correct sizing)
          opacity: bannerCleared ? 1 : 0,
          transition: 'opacity 0.3s ease-in',
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
        {/* Touch scroll indicator for xterm — always visible on touch when scrollable */}
        {isTouch && xtermScrollInfo.visible && (
          <div
            className="absolute z-20 pointer-events-none"
            style={{
              right: 2,
              top: 0,
              bottom: 0,
              width: 14,
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: xtermScrollInfo.thumbTop,
                right: 0,
                width: 10,
                height: Math.max(xtermScrollInfo.thumbHeight, 30),
                borderRadius: 5,
                background: 'rgba(200,200,220,0.55)',
                boxShadow: '0 0 3px rgba(0,0,0,0.5)',
              }}
            />
          </div>
        )}
        {/* Floating clipboard toolbar - shows on touch devices always, or on desktop when text is selected */}
        {(isTouch || hasDesktopSelection) && terminal && isReady && (
          <div
            className="absolute right-3 z-20 flex gap-1.5 transition-[top] duration-150"
            style={{ top: clipboardBtnTop != null ? `${clipboardBtnTop}px` : '8px' }}
          >
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
        {/* Non-blocking paste hint — shown when clipboard API is denied (iOS Safari) */}
        {pasteHint && (
          <div
            className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 px-4 py-2 bg-gray-800/90 backdrop-blur-md text-gray-200 text-xs rounded-lg border border-gray-600/50 shadow-lg pointer-events-none"
            style={{ animation: 'fadeIn 0.2s ease-out' }}
          >
            Tap &amp; hold to paste, or use ⌘V
          </div>
        )}
        {/* Use hoisted static JSX for loading state */}
        {!isReady && LoadingSpinner}
      </div>

      {/* Essential Keys Toolbar for touch devices */}
      <MobileKeyToolbar
        visible={isTouch && isConnected && isReady}
        onSendKey={handleToolbarKey}
        modifiersRef={modifiersRef}
        forceDoubleRow={true}
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
                className={`px-3 py-1.5 text-xs rounded-md transition-colors flex items-center gap-1.5 ${
                  footerTab === 'notes'
                    ? 'text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
                style={footerTab === 'notes' ? { backgroundColor: '#009ddc' } : undefined}
              >
                <span>&#x270E;</span>
                Notes
              </button>
              <span
                className={`px-3 py-1.5 text-xs cursor-pointer select-none ${
                  footerTab === 'prompt' ? 'text-white font-medium' : 'text-gray-400'
                }`}
                onClick={() => setFooterTab('prompt')}
              >
                Prompt Builder
              </span>
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
              className="flex-1 px-4 py-3 bg-gray-900 text-gray-200 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#009ddc] focus:ring-inset font-mono overflow-y-auto custom-scrollbar"
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
                placeholder="Compose your prompt here. Enter = send+execute • Ctrl/Cmd+Enter = insert only • Shift+Enter = new line"
                className="flex-1 px-4 py-3 bg-gray-900 text-gray-200 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#009ddc] focus:ring-inset font-mono overflow-y-auto custom-scrollbar"
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
                  {!hideUploadButton && (
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploading}
                      className="rounded-md border border-gray-700 px-2 py-1.5 text-xs text-gray-300 hover:border-gray-600 hover:text-white disabled:opacity-50 flex items-center gap-1"
                      title="Upload file (.md, .txt, .toml)"
                    >
                      <Paperclip className="w-3.5 h-3.5" />
                      {!isTouch && <span>{isUploading ? 'Uploading…' : 'Upload'}</span>}
                    </button>
                  )}
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
                    className="rounded-md border px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                    style={{ borderColor: '#009ddc', color: '#7dd3fc' }}
                    disabled={promptDraft.trim().length === 0}
                  >
                    Insert Only
                  </button>
                  <button
                    onClick={() => handlePromptSubmit('send')}
                    className="rounded-md px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                    style={{ backgroundColor: promptDraft.trim().length === 0 ? '#006a94' : '#009ddc' }}
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
