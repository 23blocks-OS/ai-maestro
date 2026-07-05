'use client'

import { useRef, useCallback, useEffect } from 'react'
import type { Terminal } from '@xterm/xterm'
import type { FitAddon } from '@xterm/addon-fit'
import type { WebglAddon } from '@xterm/addon-webgl'

export interface UseTerminalOptions {
  fontSize?: number
  fontFamily?: string
  theme?: Record<string, string>
  sessionId?: string
  disableWebGL?: boolean  // Skip WebGL on touch devices (context loss causes blank terminals)
  onRegister?: (fitAddon: FitAddon) => void
  onUnregister?: () => void
}

import { debounce } from '@/lib/utils'

export function useTerminal(options: UseTerminalOptions = {}) {
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const webglAddonRef = useRef<WebglAddon | null>(null)
  const optionsRef = useRef(options)
  // Ref for sending data to PTY via WebSocket - set by TerminalView which has WebSocket access
  const sendDataRef = useRef<((data: string) => void) | null>(null)

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
      // Disable screen reader mode - accessibility tree handled via CSS pointer-events
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

    // Load Unicode 11 addon for proper wide character / emoji width calculation.
    // Without this, TUI layouts (Claude Code /plan mode, box-drawing) are corrupted
    // because xterm.js miscalculates character widths for CJK and emoji.
    try {
      const { Unicode11Addon } = await import('@xterm/addon-unicode11')
      const unicode11Addon = new Unicode11Addon()
      terminal.loadAddon(unicode11Addon)
      terminal.unicode.activeVersion = '11'
    } catch (e) {
      console.warn(`[Terminal] Unicode11Addon not available for session ${optionsRef.current.sessionId}:`, e)
    }

    // Open terminal in container
    terminal.open(container)

    // NOTE: No MutationObserver or JS-based accessibility tree hiding.
    // The accessibility tree is handled purely via CSS (pointer-events: none + opacity: 0).
    // A MutationObserver that modifies DOM on every terminal write creates a feedback loop
    // that disrupts xterm.js's internal rendering and breaks canvas-based text selection.

    // Calculate proper size using FitAddon
    fitAddon.fit()

    // Load WebGL renderer inline during initialization (not via separate effect).
    // Loading WebGL via a separate useEffect caused a race condition on agent switch:
    // the cached import resolved instantly, switching renderers before selection stabilized.
    // By loading here, the terminal is fully set up (with WebGL) before being marked "ready".
    //
    // MOBILE FIX: Skip WebGL on touch devices — context loss on mobile backgrounding
    // causes blank terminals that never recover. Canvas renderer is adequate for mobile.
    if (optionsRef.current.disableWebGL) {
      console.log(`[Terminal] Using canvas renderer for session ${optionsRef.current.sessionId} (WebGL disabled)`)
    } else {
      try {
        const { WebglAddon } = await import('@xterm/addon-webgl')
        const webglAddon = new WebglAddon()

        webglAddon.onContextLoss(() => {
          console.warn(`[Terminal] WebGL context lost for session ${optionsRef.current.sessionId}, falling back to canvas`)
          try { webglAddon.dispose() } catch { /* ignore */ }
          webglAddonRef.current = null
          // After WebGL disposal, xterm.js _renderer.value becomes undefined.
          // RenderService.dimensions uses an unsafe non-null assertion (!), so any
          // call to scrollToBottom/scrollLines/fit will crash with:
          //   "Cannot read properties of undefined (reading 'dimensions')"
          // The only recovery is to re-open the terminal element, which forces
          // xterm.js to create a new canvas renderer.
          const term = terminalRef.current
          const parent = term?.element?.parentElement
          if (term && parent) {
            term.open(parent)
            if (fitAddonRef.current) {
              try { fitAddonRef.current.fit() } catch { /* ignore */ }
            }
          }
        })

        terminal.loadAddon(webglAddon)
        webglAddonRef.current = webglAddon
        console.log(`[Terminal] Initialized with WebGL renderer for session ${optionsRef.current.sessionId}`)
      } catch (e) {
        console.log(`[Terminal] Initialized with canvas renderer for session ${optionsRef.current.sessionId}`)
      }
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

    // Register with global terminal registry
    if (optionsRef.current.onRegister) {
      optionsRef.current.onRegister(fitAddon)
    }

    // Debounced ResizeObserver — batch resize events to prevent layout thrashing.
    // 300ms debounce lets CSS transitions and layout shifts fully settle before
    // refitting, which prevents the rapid fit→resize→tmux-redraw cascade that
    // causes terminal content to visually jump/rewrite.
    const debouncedFit = debounce(() => {
      if (fitAddonRef.current && terminalRef.current) {
        try {
          fitAddonRef.current.fit()
        } catch (e) {
          console.warn('[Terminal] Fit failed during resize:', e)
        }
      }
    }, 300)

    const resizeObserver = new ResizeObserver(() => {
      debouncedFit()
    })

    resizeObserver.observe(container)

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

      // Cmd+V (macOS) or Ctrl+Shift+V (Linux) - Paste from clipboard
      if ((event.metaKey && event.key === 'v') || (event.ctrlKey && event.shiftKey && event.key === 'V')) {
        if (event.type === 'keydown') {
          // preventDefault stops the browser from ALSO firing a 'paste' event on the
          // hidden textarea, which xterm would process via onData — causing double paste.
          event.preventDefault()
          navigator.clipboard.readText().then((text) => {
            if (text) {
              // terminal.paste() normalizes line endings and applies bracketed
              // paste ONLY if the running app enabled it (DECSET 2004). Manual
              // \x1b[200~ wrapping printed literal "200~" into programs that
              // never enabled bracketed paste (bare REPLs, cat, password prompts).
              terminal.paste(text)
            }
          }).catch((err) => {
            console.warn('Clipboard read denied:', err)
          })
          return false // Tell xterm to not process this key
        }
      }

      return true
    })

    // Auto-copy selection to clipboard — OPT-IN via the header toggle.
    // Was always-on: any 3-char selection silently overwrote the clipboard,
    // destroying whatever the user was about to paste.
    terminal.onSelectionChange(() => {
      if (typeof window === 'undefined') return
      if (window.localStorage.getItem('terminal-copy-on-select') !== 'true') return
      const sel = terminal.getSelection()
      if (sel && sel.length >= 3) {
        navigator.clipboard.writeText(sel).catch(() => {
          // Clipboard API may be blocked in non-secure contexts; silently ignore
        })
      }
    })

    // Wheel handler: intercept mouse wheel at the DOM level (capture phase).
    // Seamless two-tier scrollback:
    // - Scrolling UP uses xterm's local scrollback first; when it's exhausted
    //   (or the app is on the alternate screen, which has none), the deltas are
    //   forwarded as 'tmux-scroll' messages and the server drives tmux
    //   copy-mode — the real server-side history. NOTE: the client buffer type
    //   can't be trusted as the only signal — after a reconnect the capture
    //   replay never includes the alt-screen-enter sequence, so the client
    //   sits in the normal buffer even when the tmux pane is alternate.
    // - Scrolling DOWN unwinds tmux copy-mode first (server auto-exits it at
    //   the bottom via `copy-mode -e`), then scrolls the local viewport.
    // tmux mouse stays off, so native browser selection keeps working.
    let pendingTmuxScroll = 0
    let tmuxCopyDepth = 0 // approx. lines we've scrolled into tmux copy-mode
    let tmuxScrollTimer: ReturnType<typeof setTimeout> | null = null
    const flushTmuxScroll = () => {
      tmuxScrollTimer = null
      if (pendingTmuxScroll !== 0 && sendDataRef.current) {
        sendDataRef.current(JSON.stringify({ type: 'tmux-scroll', lines: pendingTmuxScroll }))
      }
      pendingTmuxScroll = 0
    }
    const queueTmuxScroll = (lines: number) => {
      // Accumulate deltas for 80ms so fast scrolling doesn't flood the
      // server with one tmux command per wheel tick
      pendingTmuxScroll += lines
      if (!tmuxScrollTimer) tmuxScrollTimer = setTimeout(flushTmuxScroll, 80)
    }
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const lines = Math.round(e.deltaY / 25) || (e.deltaY > 0 ? 1 : -1)
      const buf = terminal.buffer.active
      const canForward = !!sendDataRef.current
      if (lines < 0) {
        // Scrolling up: local first, tmux when local can't go further
        const localExhausted = buf.viewportY <= 0
        if (canForward && (buf.type === 'alternate' || localExhausted)) {
          queueTmuxScroll(lines)
          tmuxCopyDepth = Math.min(tmuxCopyDepth - lines, 100000)
        } else {
          terminal.scrollLines(lines)
        }
      } else {
        // Scrolling down: unwind tmux copy-mode first, then local viewport.
        // Depth is approximate (copy-mode may have hit the top of history);
        // over-forwarded scroll-downs fail harmlessly server-side.
        if (canForward && tmuxCopyDepth > 0) {
          queueTmuxScroll(lines)
          tmuxCopyDepth = Math.max(0, tmuxCopyDepth - lines)
        } else {
          terminal.scrollLines(lines)
        }
      }
    }
    container.addEventListener('wheel', handleWheel, { passive: false, capture: true })

    // Cleanup function
    return () => {
      container.removeEventListener('wheel', handleWheel, { capture: true } as EventListenerOptions)
      if (tmuxScrollTimer) {
        clearTimeout(tmuxScrollTimer)
        tmuxScrollTimer = null
      }
      resizeObserver.disconnect()
      // Dispose WebGL addon before terminal to free GPU context cleanly
      if (webglAddonRef.current) {
        try { webglAddonRef.current.dispose() } catch { /* ignore */ }
        webglAddonRef.current = null
      }
      if (optionsRef.current.onUnregister) {
        optionsRef.current.onUnregister()
      }
      terminal.dispose()
      terminalRef.current = null
      fitAddonRef.current = null
      // Clear send function reference to prevent stale callbacks
      sendDataRef.current = null
    }
  }, [])

  const disposeTerminal = useCallback(() => {
    if (terminalRef.current) {
      terminalRef.current.dispose()
      terminalRef.current = null
      fitAddonRef.current = null
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
    terminal: terminalRef.current,
    initializeTerminal,
    disposeTerminal,
    fitTerminal,
    clearTerminal,
    writeToTerminal,
    setSendData,
  }
}
