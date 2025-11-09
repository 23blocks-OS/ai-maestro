'use client'

import { useRef, useCallback, useEffect } from 'react'
import type { Terminal } from '@xterm/xterm'
import type { FitAddon } from '@xterm/addon-fit'

export interface UseTerminalOptions {
  fontSize?: number
  fontFamily?: string
  theme?: Record<string, string>
  sessionId?: string
  onRegister?: (fitAddon: FitAddon) => void
  onUnregister?: () => void
}

/**
 * Calculate exact terminal dimensions BEFORE xterm.js initializes
 * This eliminates race conditions where xterm calculates character cells
 * during CSS layout oscillations (795→694→686→771→795)
 */
function calculateTerminalDimensions(
  containerWidth: number,
  containerHeight: number,
  fontSize: number,
  fontFamily: string
): { cols: number; rows: number; cellWidth: number; cellHeight: number } {
  // Create a temporary off-screen element to measure character dimensions
  const measureElement = document.createElement('div')
  measureElement.style.position = 'absolute'
  measureElement.style.visibility = 'hidden'
  measureElement.style.whiteSpace = 'pre'
  measureElement.style.fontFamily = fontFamily
  measureElement.style.fontSize = `${fontSize}px`
  measureElement.style.lineHeight = '1.2'
  measureElement.style.fontWeight = '400'
  measureElement.textContent = 'X'.repeat(100) // Measure 100 characters for accuracy

  document.body.appendChild(measureElement)

  const rect = measureElement.getBoundingClientRect()
  const cellWidth = rect.width / 100 // Average character width
  const cellHeight = rect.height // Line height

  document.body.removeChild(measureElement)

  // Calculate how many columns/rows fit in the container
  // Account for xterm.js internal padding (2px on each side = 4px total)
  const XTERM_PADDING = 4
  const usableWidth = containerWidth - XTERM_PADDING
  const usableHeight = containerHeight - XTERM_PADDING

  const cols = Math.max(2, Math.floor(usableWidth / cellWidth))
  const rows = Math.max(1, Math.floor(usableHeight / cellHeight))


  return { cols, rows, cellWidth, cellHeight }
}

export function useTerminal(options: UseTerminalOptions = {}) {
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
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

    // Get container dimensions - THIS IS THE STABLE SIZE WE TRUST
    const containerRect = container.getBoundingClientRect()
    const containerWidth = Math.floor(containerRect.width)
    const containerHeight = Math.floor(containerRect.height)


    // CRITICAL: Pre-calculate terminal dimensions BEFORE creating terminal
    const fontSize = optionsRef.current.fontSize || 16
    const fontFamily = optionsRef.current.fontFamily || '"SF Mono", "Monaco", "Cascadia Code", "Roboto Mono", "Courier New", monospace'

    const { cols, rows, cellWidth, cellHeight } = calculateTerminalDimensions(
      containerWidth,
      containerHeight,
      fontSize,
      fontFamily
    )

    // Dynamic imports for browser-only code
    const { Terminal } = await import('@xterm/xterm')
    const { FitAddon } = await import('@xterm/addon-fit')
    const { WebLinksAddon } = await import('@xterm/addon-web-links')
    const { ClipboardAddon } = await import('@xterm/addon-clipboard')

    // Create terminal instance with PRE-CALCULATED dimensions
    const terminal = new Terminal({
      // CRITICAL: Set exact dimensions upfront - no guessing
      cols,
      rows,
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
      scrollback: 10000,  // Reduced for better mobile performance
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
      // CRITICAL: This might help with carriage return handling
      macOptionIsMeta: true,
      // Enable right-click for context menu (paste, copy)
      rightClickSelectsWord: true,
      // CRITICAL FIX: Smooth rendering settings to reduce xterm/tmux conflicts
      smoothScrollDuration: 0, // Disable smooth scrolling - let tmux control scroll
      drawBoldTextInBrightColors: true, // Standard terminal behavior
      // Disable cursor blink to reduce redraws
      cursorBlink: false,
      // Set cursor style to block for better visibility
      cursorStyle: 'block',
    })

    // Initialize addons
    const fitAddon = new FitAddon()
    const webLinksAddon = new WebLinksAddon()

    terminal.loadAddon(fitAddon)
    terminal.loadAddon(webLinksAddon)

    // NOTE: WebGL renderer disabled due to context loss issues
    // Canvas renderer is more stable and works well for our use case

    // Load clipboard addon for copy/paste support
    // CRITICAL FIX: Enhanced clipboard support for remote hosts
    try {
      const clipboardAddon = new ClipboardAddon()
      terminal.loadAddon(clipboardAddon)

      // Request clipboard permissions proactively (helps with remote hosts)
      // This ensures copy/paste works even when accessing from different origins
      if (navigator.clipboard && navigator.permissions) {
        navigator.permissions.query({ name: 'clipboard-write' as PermissionName }).then((result) => {
          if (result.state === 'granted' || result.state === 'prompt') {
            console.log(`✅ Clipboard access granted for session ${optionsRef.current.sessionId}`)
          }
        }).catch(() => {
          // Permissions API not available or denied - clipboard might still work
          console.log(`⚠️ Clipboard permissions check failed for session ${optionsRef.current.sessionId}, but copy/paste may still work`)
        })
      }

      // Add explicit copy handler for better reliability
      terminal.onSelectionChange(() => {
        const selection = terminal.getSelection()
        if (selection && selection.length > 0) {
          // Auto-copy on selection (common terminal behavior)
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(selection).catch(() => {
              // Fallback: clipboard write failed, but user can still manually copy
            })
          }
        }
      })
    } catch (e) {
      console.error(`❌ Failed to load clipboard addon for session ${optionsRef.current.sessionId}:`, e)
    }

    // Open terminal in container
    terminal.open(container)

    // Fix xterm.js helper textarea missing id/name (causes browser console warnings)
    // xterm.js creates a hidden textarea for input handling but doesn't add id/name
    const helperTextarea = container.querySelector('.xterm-helper-textarea')
    if (helperTextarea && optionsRef.current.sessionId) {
      helperTextarea.setAttribute('id', `xterm-helper-${optionsRef.current.sessionId}`)
      helperTextarea.setAttribute('name', `xterm-helper-${optionsRef.current.sessionId}`)
    }

    // CRITICAL: Verify that xterm.js respected our pre-calculated dimensions
    if (terminal.cols !== cols || terminal.rows !== rows) {
      console.warn(`⚠️ [INIT] Terminal dimensions mismatch! Expected ${cols}x${rows}, got ${terminal.cols}x${terminal.rows}`)
      // Force dimensions to match our calculation
      terminal.resize(cols, rows)
    }

    // NOTE: We don't scroll to bottom here because history hasn't loaded yet
    // Scrolling happens in TerminalView after 'history-complete' message

    // Store references
    terminalRef.current = terminal
    fitAddonRef.current = fitAddon

    // Register with global terminal registry
    if (optionsRef.current.onRegister) {
      optionsRef.current.onRegister(fitAddon)
    }

    // Handle window resize - for actual window resizes
    let resizeTimeout: NodeJS.Timeout
    let prevWidth = containerWidth
    let prevHeight = containerHeight

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0]
      const newWidth = Math.floor(entry.contentRect.width)
      const newHeight = Math.floor(entry.contentRect.height)

      // Ignore micro-oscillations (< 5px)
      const widthDiff = Math.abs(newWidth - prevWidth)
      const heightDiff = Math.abs(newHeight - prevHeight)

      if (widthDiff < 5 && heightDiff < 5) {
        // Skip insignificant changes
        return
      }


      prevWidth = newWidth
      prevHeight = newHeight

      clearTimeout(resizeTimeout)
      resizeTimeout = setTimeout(() => {
        if (fitAddonRef.current && terminalRef.current) {
          try {

            // Store current scroll position
            const scrollPos = terminal.buffer.active.viewportY

            // Recalculate dimensions using the same method as initialization
            const { cols: newCols, rows: newRows } = calculateTerminalDimensions(
              newWidth,
              newHeight,
              terminal.options.fontSize as number,
              terminal.options.fontFamily as string
            )

            // Resize terminal to exact calculated dimensions
            terminal.resize(newCols, newRows)

            // Restore scroll position if we were at the bottom
            if (scrollPos === terminal.buffer.active.baseY) {
              terminal.scrollToBottom()
            }

          } catch (e) {
            console.error('Failed to resize terminal:', e)
          }
        }
      }, 50) // Debounce to avoid thrashing during resize
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
    if (fitAddonRef.current && terminalRef.current) {
      const sessionId = optionsRef.current.sessionId
      const oldCols = terminalRef.current.cols
      const oldRows = terminalRef.current.rows


      // Get current container dimensions
      const container = terminalRef.current.element?.parentElement
      if (!container) {
        console.warn(`⚠️ [FIT] No container found, skipping fit`)
        return
      }

      const rect = container.getBoundingClientRect()
      const containerWidth = Math.floor(rect.width)
      const containerHeight = Math.floor(rect.height)

      // Recalculate dimensions
      const { cols: newCols, rows: newRows } = calculateTerminalDimensions(
        containerWidth,
        containerHeight,
        terminalRef.current.options.fontSize as number,
        terminalRef.current.options.fontFamily as string
      )

      // Only resize if dimensions actually changed
      if (newCols !== oldCols || newRows !== oldRows) {
        terminalRef.current.resize(newCols, newRows)
      } else {
      }
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

  return {
    terminal: terminalRef.current,
    initializeTerminal,
    disposeTerminal,
    fitTerminal,
    clearTerminal,
    writeToTerminal,
  }
}
