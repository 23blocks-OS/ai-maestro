'use client'

import { useRef, useState, useCallback, useEffect } from 'react'
import type { Terminal } from '@xterm/xterm'
import type { FitAddon } from '@xterm/addon-fit'
import type { WebglAddon } from '@xterm/addon-webgl'

export interface UseTerminalOptions {
  fontSize?: number
  fontFamily?: string
  theme?: Record<string, string>
  sessionId?: string
  onRegister?: (fitAddon: FitAddon) => void
  onUnregister?: () => void
  onSelectionChange?: (hasSelection: boolean, selection: string) => void
}

// Debounce utility for resize events
function debounce<T extends (...args: Parameters<T>) => void>(fn: T, ms: number): T {
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  return ((...args: Parameters<T>) => {
    if (timeoutId) clearTimeout(timeoutId)
    timeoutId = setTimeout(() => fn(...args), ms)
  }) as T
}

export function useTerminal(options: UseTerminalOptions = {}) {
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const webglAddonRef = useRef<WebglAddon | null>(null)
  const optionsRef = useRef(options)
  // Ref for sending data to PTY via WebSocket - set by TerminalView which has WebSocket access
  const sendDataRef = useRef<((data: string) => void) | null>(null)
  // SF-010: State mirror of terminalRef so consumers get re-rendered when terminal is created/disposed
  const [terminalInstance, setTerminalInstance] = useState<Terminal | null>(null)

  // Keep options ref up to date
  useEffect(() => {
    optionsRef.current = options
  }, [options])

  const initializeTerminal = useCallback(async (container: HTMLElement) => {
    // Clean up existing terminal
    if (terminalRef.current) {
      terminalRef.current.dispose()
      terminalRef.current = null
      fitAddonRef.current = null
      setTerminalInstance(null)
    }

    // Clear the container completely
    while (container.firstChild) {
      container.removeChild(container.firstChild)
    }

    // Dynamic imports for browser-only code
    const { Terminal } = await import('@xterm/xterm')
    const { FitAddon } = await import('@xterm/addon-fit')
    const { WebLinksAddon } = await import('@xterm/addon-web-links')

    const fontSize = optionsRef.current.fontSize || 16
    const fontFamily = optionsRef.current.fontFamily || '"SF Mono", "Monaco", "Cascadia Code", "Roboto Mono", "Courier New", monospace'

    // Create terminal instance - let FitAddon handle sizing
    const terminal = new Terminal({
      cursorBlink: true,
      fontSize,
      fontFamily,
      fontWeight: '400',
      fontWeightBold: '700',
      lineHeight: 1.2,
      theme: optionsRef.current.theme || {
        background: '#1e1e1e',
        foreground: '#d4d4d4',
        cursor: '#aeafad',
        selectionBackground: '#3a3d41',    // Visible selection background
        selectionForeground: '#ffffff',     // White text when selected
        selectionInactiveBackground: '#3a3d41', // Selection when terminal not focused
        black: '#000000',
        red: '#cd3131',
        green: '#0dbc79',
        yellow: '#dcdcaa',  // Softer yellow (VS Code default)
        blue: '#2472c8',
        magenta: '#bc3fbc',
        cyan: '#11a8cd',
        white: '#e5e5e5',
        brightBlack: '#666666',
        brightRed: '#f14c4c',
        brightGreen: '#23d18b',
        brightYellow: '#dcdcaa',  // Match normal yellow for consistency
        brightBlue: '#3b8eea',
        brightMagenta: '#d670d6',
        brightCyan: '#29b8db',
        brightWhite: '#ffffff',
      },
      scrollback: 10000,  // Reasonable buffer for conversation context
      // CRITICAL: Must be false for PTY connections
      // PTY and tmux handle line endings correctly - setting this to true causes
      // Claude Code status updates (using \r) to create new lines instead of overwriting
      convertEol: false,
      allowTransparency: false,
      scrollSensitivity: 1,
      fastScrollSensitivity: 5,
      // Ensure scrollback works in all modes
      altClickMovesCursor: false,
      // Support alternate screen buffer (used by Claude Code, vim, etc.)
      windowOptions: {
        setWinLines: true,
      },
      // NT-008: Screen reader mode disabled intentionally. When enabled, xterm.js duplicates all
      // terminal content into a live-region DOM element, which causes severe performance degradation
      // with high-output sessions (Claude Code output). Accessibility for terminal content is
      // handled via the Copy button and aria-labels on controls instead.
      screenReaderMode: false,
      disableStdin: false,
      customGlyphs: true,
      macOptionIsMeta: true,
      rightClickSelectsWord: true,
    })

    // Initialize addons
    const fitAddon = new FitAddon()
    const webLinksAddon = new WebLinksAddon()

    terminal.loadAddon(fitAddon)
    terminal.loadAddon(webLinksAddon)

    // Load clipboard addon for OSC 52 support (terminal programs accessing clipboard)
    try {
      const { ClipboardAddon } = await import('@xterm/addon-clipboard')
      const clipboardAddon = new ClipboardAddon()
      terminal.loadAddon(clipboardAddon)
    } catch (e) {
      console.warn(`[Terminal] ClipboardAddon not available for session ${optionsRef.current.sessionId}:`, e)
    }

    // Open terminal in container
    terminal.open(container)

    // NOTE: No MutationObserver or JS-based accessibility tree hiding.
    // The accessibility tree is handled purely via CSS (pointer-events: none + opacity: 0).
    // A MutationObserver that modifies DOM on every terminal write creates a feedback loop
    // that disrupts xterm.js's internal rendering and breaks canvas-based text selection.

    // Calculate proper size using FitAddon
    fitAddon.fit()

    // Load WebGL renderer for desktop only. On touch/mobile devices (iPad, phones),
    // WebGL reports wrong cell dimensions due to devicePixelRatio mismatch, causing
    // garbled text, wrong cols/rows, and 1/4 area rendering. Canvas renderer handles
    // DPI correctly on all platforms.
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0
    if (!isTouchDevice) {
      try {
        const { WebglAddon } = await import('@xterm/addon-webgl')
        const webglAddon = new WebglAddon()

        webglAddon.onContextLoss(() => {
          console.warn(`[Terminal] WebGL context lost for session ${optionsRef.current.sessionId}, falling back to canvas`)
          try { webglAddon.dispose() } catch { /* ignore */ }
          webglAddonRef.current = null
          if (terminalRef.current) {
            terminalRef.current.refresh(0, terminalRef.current.rows - 1)
          }
        })

        terminal.loadAddon(webglAddon)
        webglAddonRef.current = webglAddon
        fitAddon.fit()
        console.log(`[Terminal] Initialized with WebGL renderer for session ${optionsRef.current.sessionId}`)
      } catch (e) {
        console.log(`[Terminal] Initialized with canvas renderer for session ${optionsRef.current.sessionId}`)
      }
    } else {
      console.log(`[Terminal] Touch device detected — using canvas renderer for session ${optionsRef.current.sessionId}`)
    }

    // Fix xterm.js helper textarea missing id/name (causes browser console warnings)
    const helperTextarea = container.querySelector('.xterm-helper-textarea')
    if (helperTextarea && optionsRef.current.sessionId) {
      helperTextarea.setAttribute('id', `xterm-helper-${optionsRef.current.sessionId}`)
      helperTextarea.setAttribute('name', `xterm-helper-${optionsRef.current.sessionId}`)
    }

    // Store references
    terminalRef.current = terminal
    fitAddonRef.current = fitAddon
    // SF-010: Update state so consumers re-render when terminal becomes available
    setTerminalInstance(terminal)

    // Register with global terminal registry
    if (optionsRef.current.onRegister) {
      optionsRef.current.onRegister(fitAddon)
    }

    // Debounced ResizeObserver - batch resize events to prevent layout thrashing
    // 150ms debounce allows CSS transitions to complete before refitting
    const debouncedFit = debounce(() => {
      if (fitAddonRef.current && terminalRef.current) {
        try {
          fitAddonRef.current.fit()
        } catch (e) {
          console.warn('[Terminal] Fit failed during resize:', e)
        }
      }
    }, 150)

    const resizeObserver = new ResizeObserver(() => {
      debouncedFit()
    })

    resizeObserver.observe(container)

    // Delayed safety refits: on iPad/touch devices, the flex layout may not be fully
    // settled when initializeTerminal runs. These catch any late layout changes that
    // the ResizeObserver might miss (e.g., CSS transitions, font loading, or the
    // browser deferring layout calculations on high-DPI displays).
    const safetyRefit1 = setTimeout(() => {
      if (fitAddonRef.current) {
        try { fitAddonRef.current.fit() } catch { /* ignore */ }
      }
    }, 500)
    const safetyRefit2 = setTimeout(() => {
      if (fitAddonRef.current) {
        try { fitAddonRef.current.fit() } catch { /* ignore */ }
      }
    }, 2000)

    // Add keyboard shortcuts for scrolling, copy, and paste
    terminal.attachCustomKeyEventHandler((event) => {
      // Calculate scroll amount based on terminal height (scroll by page)
      const scrollAmount = Math.max(1, terminal.rows - 2)

      // Shift + Page Up - Scroll up by page
      if (event.shiftKey && event.key === 'PageUp') {
        terminal.scrollLines(-scrollAmount)
        return false
      }
      // Shift + Page Down - Scroll down by page
      if (event.shiftKey && event.key === 'PageDown') {
        terminal.scrollLines(scrollAmount)
        return false
      }
      // Shift + Arrow Up - Scroll up 5 lines
      if (event.shiftKey && event.key === 'ArrowUp') {
        terminal.scrollLines(-5)
        return false
      }
      // Shift + Arrow Down - Scroll down 5 lines
      if (event.shiftKey && event.key === 'ArrowDown') {
        terminal.scrollLines(5)
        return false
      }
      // Shift + Home - Scroll to top
      if (event.shiftKey && event.key === 'Home') {
        terminal.scrollToTop()
        return false
      }
      // Shift + End - Scroll to bottom
      if (event.shiftKey && event.key === 'End') {
        terminal.scrollToBottom()
        return false
      }

      // Cmd+C (macOS) or Ctrl+Shift+C (Linux) - Copy selection to clipboard
      // When there IS a selection, copy it; when there is NO selection, let Ctrl+C pass through as interrupt
      if ((event.metaKey && event.key === 'c') || (event.ctrlKey && event.shiftKey && event.key === 'C')) {
        if (event.type === 'keydown') {
          const selection = terminal.getSelection()
          if (selection) {
            navigator.clipboard.writeText(selection).catch((err) => {
              // Clipboard failed but user had a selection, so copy was the intent - no SIGINT needed
              console.warn('[Terminal] Failed to copy selection:', err)
            })
            return false // Prevent sending Ctrl+C interrupt to PTY (copy was intent since selection existed)
          }
          // No selection: fall through to let Ctrl+C pass as SIGINT (return true at end of handler)
        }
      }

      // Cmd+V (macOS) or Ctrl+Shift+V (Linux) - Paste from clipboard into PTY via WebSocket
      if ((event.metaKey && event.key === 'v') || (event.ctrlKey && event.shiftKey && event.key === 'V')) {
        if (event.type === 'keydown') {
          // preventDefault stops the browser from ALSO firing a 'paste' event on the
          // hidden textarea, which xterm would process via onData — causing double paste.
          event.preventDefault()
          navigator.clipboard.readText().then((text) => {
            if (text && sendDataRef.current) {
              // Use bracketed paste mode so multi-line content is handled correctly by the shell
              const PASTE_START = '\x1b[200~'
              const PASTE_END = '\x1b[201~'
              // Normalize line endings: convert \r\n and \n to \r (what PTY expects)
              const normalized = text.replace(/\r\n?/g, '\n').replace(/\n/g, '\r')
              sendDataRef.current(PASTE_START + normalized + PASTE_END)
            }
          }).catch((err) => {
            console.warn('Clipboard read denied:', err)
          })
          return false // Tell xterm to not process this key
        }
      }

      return true
    })

    // Auto-copy selection to clipboard (Linux-style "select to copy" behavior).
    // Minimum length threshold prevents accidental clipboard overwrites from stray clicks.
    // Users can opt out by setting localStorage key 'terminal-auto-copy' to 'false'.
    const MIN_AUTO_COPY_LENGTH = 10
    terminal.onSelectionChange(() => {
      const autoCopyEnabled = localStorage.getItem('terminal-auto-copy') !== 'false'
      const sel = terminal.getSelection()
      if (autoCopyEnabled && sel && sel.length >= MIN_AUTO_COPY_LENGTH) {
        navigator.clipboard.writeText(sel).catch(() => {
          // Clipboard API may be blocked in non-secure contexts; silently ignore
        })
      }
      // onSelectionChange callback available for consumers (not used for desktop floating buttons
      // since document-level mouseup is more reliable with xterm's canvas renderer)
      if (optionsRef.current.onSelectionChange) {
        optionsRef.current.onSelectionChange(!!(sel && sel.length > 0), sel || '')
      }
    })

    // Cleanup function
    return () => {
      clearTimeout(safetyRefit1)
      clearTimeout(safetyRefit2)
      resizeObserver.disconnect()
      if (optionsRef.current.onUnregister) {
        optionsRef.current.onUnregister()
      }
      terminal.dispose()
      terminalRef.current = null
      fitAddonRef.current = null
      // Clear send function reference to prevent stale callbacks
      sendDataRef.current = null
      // SF-010: Clear state so consumers re-render on disposal
      setTerminalInstance(null)
      // Dispose WebGL addon after terminal to free GPU context cleanly.
      // Terminal must be disposed first so its internal references to the addon
      // are already cleaned up before we call dispose on the addon itself.
      if (webglAddonRef.current) {
        try { webglAddonRef.current.dispose() } catch { /* ignore */ }
        webglAddonRef.current = null
      }
    }
  }, [])

  const disposeTerminal = useCallback(() => {
    if (terminalRef.current) {
      if (optionsRef.current.onUnregister) {
        optionsRef.current.onUnregister()
      }
      terminalRef.current.dispose()
      terminalRef.current = null
      fitAddonRef.current = null
      // Clear send function reference to prevent stale callbacks
      sendDataRef.current = null
      // SF-010: Clear state so consumers re-render on disposal
      setTerminalInstance(null)
      // Dispose WebGL addon after terminal to free GPU context cleanly.
      // Terminal must be disposed first so its internal references to the addon
      // are already cleaned up before we call dispose on the addon itself.
      if (webglAddonRef.current) {
        try { webglAddonRef.current.dispose() } catch { /* ignore */ }
        webglAddonRef.current = null
      }
    }
  }, [])

  const fitTerminal = useCallback(() => {
    if (fitAddonRef.current) {
      fitAddonRef.current.fit()
    }
  }, [])

  const clearTerminal = useCallback(() => {
    if (terminalRef.current) {
      terminalRef.current.clear()
    }
  }, [])

  const writeToTerminal = useCallback((data: string) => {
    if (terminalRef.current) {
      terminalRef.current.write(data)
    }
  }, [])

  // Allow TerminalView to set the WebSocket send function for paste support
  const setSendData = useCallback((fn: ((data: string) => void) | null) => {
    sendDataRef.current = fn
  }, [])

  return {
    // SF-010: Return state-backed terminal instance so consumers re-render when it changes.
    // The ref is still used internally for synchronous access in callbacks.
    // SF-017: terminalRef.current does not trigger re-renders. Callers must use the
    // state-backed `terminal` value (or isReady in TerminalView) as their re-render trigger.
    terminal: terminalInstance,
    initializeTerminal,
    disposeTerminal,
    fitTerminal,
    clearTerminal,
    writeToTerminal,
    setSendData,
  }
}
