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
  onRegister?: (fitAddon: FitAddon) => void
  onUnregister?: () => void
}

// Debounce utility for resize events
function debounce<T extends (...args: unknown[]) => void>(fn: T, ms: number): T {
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  return ((...args: unknown[]) => {
    if (timeoutId) clearTimeout(timeoutId)
    timeoutId = setTimeout(() => fn(...args), ms)
  }) as T
}

export function useTerminal(options: UseTerminalOptions = {}) {
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const webglAddonRef = useRef<WebglAddon | null>(null)
  const optionsRef = useRef(options)

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
    const { ClipboardAddon } = await import('@xterm/addon-clipboard')

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
      // Disable Windows mode - we're on Unix/macOS
      windowsMode: false,
      // Disable accessibility support to prevent yellow native selection
      // The accessibility tree creates a selectable text layer that shows yellow highlight
      screenReaderMode: false,
      // Additional accessibility settings
      disableStdin: false,
      // Try to prevent the accessibility tree from being created
      customGlyphs: true,
      // CRITICAL: This might help with carriage return handling
      macOptionIsMeta: true,
      // Enable right-click for context menu (paste, copy)
      rightClickSelectsWord: true,
    })

    // Initialize addons
    const fitAddon = new FitAddon()
    const webLinksAddon = new WebLinksAddon()

    terminal.loadAddon(fitAddon)
    terminal.loadAddon(webLinksAddon)

    // Load clipboard addon for copy/paste support
    try {
      const clipboardAddon = new ClipboardAddon()
      terminal.loadAddon(clipboardAddon)
    } catch (e) {
      console.error(`❌ Failed to load clipboard addon for session ${optionsRef.current.sessionId}:`, e)
    }

    // Open terminal in container
    terminal.open(container)

    // NOTE: WebGL is NOT loaded on initialization - terminals start with canvas renderer
    // WebGL is loaded dynamically only for the ACTIVE terminal via enableWebGL()
    // This prevents exhausting GPU contexts when many terminals are open
    console.log(`[Terminal] Initialized with canvas renderer for session ${optionsRef.current.sessionId}`)

    // Hide accessibility tree to prevent yellow browser selection
    const hideAccessibilityTree = () => {
      const elements = container.querySelectorAll('.xterm-accessibility-tree, .xterm-accessibility')
      elements.forEach(el => {
        const htmlEl = el as HTMLElement
        htmlEl.style.display = 'none'
        htmlEl.style.pointerEvents = 'none'
      })
    }

    // Apply immediately after terminal opens
    hideAccessibilityTree()

    // Watch for xterm recreating/updating accessibility elements
    const observer = new MutationObserver(() => {
      hideAccessibilityTree()
    })

    observer.observe(container, {
      childList: true,
      subtree: true
    })

    // Calculate proper size using FitAddon
    fitAddon.fit()

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

    // Add keyboard shortcuts for scrolling
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
      return true
    })

    // Cleanup function
    return () => {
      observer.disconnect()
      resizeObserver.disconnect()
      if (optionsRef.current.onUnregister) {
        optionsRef.current.onUnregister()
      }
      terminal.dispose()
      terminalRef.current = null
      fitAddonRef.current = null
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

  // Enable WebGL renderer for better performance (call when terminal becomes active/visible)
  const enableWebGL = useCallback(async () => {
    if (!terminalRef.current) return
    if (webglAddonRef.current) {
      // WebGL already enabled
      return
    }

    try {
      const { WebglAddon } = await import('@xterm/addon-webgl')
      const webglAddon = new WebglAddon()

      // Handle context loss - fall back to canvas renderer
      webglAddon.onContextLoss(() => {
        console.warn(`[Terminal] WebGL context lost for session ${optionsRef.current.sessionId}, falling back to canvas renderer`)
        try {
          webglAddon.dispose()
        } catch {
          // Ignore dispose errors
        }
        webglAddonRef.current = null
        // Force a re-render to ensure canvas is working
        if (terminalRef.current) {
          terminalRef.current.refresh(0, terminalRef.current.rows - 1)
        }
      })

      terminalRef.current.loadAddon(webglAddon)
      webglAddonRef.current = webglAddon
      console.log(`✅ [Terminal] WebGL renderer enabled for session ${optionsRef.current.sessionId}`)
    } catch (e) {
      console.warn(`[Terminal] WebGL addon not available, keeping canvas renderer:`, e)
    }
  }, [])

  // Disable WebGL renderer (call when terminal becomes inactive/hidden to free GPU context)
  const disableWebGL = useCallback(() => {
    if (!webglAddonRef.current) {
      // WebGL not enabled
      return
    }

    try {
      webglAddonRef.current.dispose()
      console.log(`[Terminal] WebGL renderer disabled for session ${optionsRef.current.sessionId}, using canvas`)
    } catch (e) {
      console.warn(`[Terminal] Error disposing WebGL addon:`, e)
    }
    webglAddonRef.current = null

    // Force refresh to ensure canvas renderer takes over
    if (terminalRef.current) {
      terminalRef.current.refresh(0, terminalRef.current.rows - 1)
    }
  }, [])

  return {
    terminal: terminalRef.current,
    initializeTerminal,
    disposeTerminal,
    fitTerminal,
    clearTerminal,
    writeToTerminal,
    enableWebGL,
    disableWebGL,
  }
}
