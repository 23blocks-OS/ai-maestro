'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useWebSocket } from '@/hooks/useWebSocket'
import { createResizeMessage } from '@/lib/websocket'
import type { Session } from '@/types/session'

interface TerminalViewNewProps {
  session: Session
  isVisible?: boolean
}

export default function TerminalViewNew({ session, isVisible = true }: TerminalViewNewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<any>(null)
  const fitAddonRef = useRef<any>(null)
  const initializedRef = useRef(false)
  const [isReady, setIsReady] = useState(false)

  const { isConnected, sendMessage } = useWebSocket({
    sessionId: session.id,
    hostId: session.hostId,
    autoConnect: isVisible,
    onMessage: (data) => {
      if (terminalRef.current) {
        terminalRef.current.write(data)
      }
    },
  })

  // Fit terminal function
  const fitTerminal = useCallback(() => {
    if (fitAddonRef.current && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) {
        fitAddonRef.current.fit()
        // Send resize to server
        if (terminalRef.current) {
          const { cols, rows } = terminalRef.current
          if (cols && rows) {
            sendMessage(createResizeMessage(cols, rows))
          }
        }
      }
    }
  }, [sendMessage])

  // Initialize terminal when container is ready and visible
  useEffect(() => {
    // Only initialize when visible - prevents initializing all hidden tabs
    if (!isVisible || !containerRef.current || initializedRef.current) return

    // Check if container has dimensions
    const rect = containerRef.current.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) {
      return
    }

    initializedRef.current = true

    let terminal: any
    let fitAddon: any
    let resizeObserver: ResizeObserver | null = null

    const init = async () => {
      const container = containerRef.current
      if (!container) return

      const { Terminal } = await import('@xterm/xterm')
      const { FitAddon } = await import('@xterm/addon-fit')
      const { WebLinksAddon } = await import('@xterm/addon-web-links')

      terminal = new Terminal({
        cursorBlink: true,
        fontSize: 14,
        fontFamily: 'Menlo, Monaco, "Courier New", monospace',
        theme: {
          background: '#1e1e1e',
          foreground: '#d4d4d4',
        },
        scrollback: 10000,
        convertEol: false,
      })

      fitAddon = new FitAddon()
      const webLinksAddon = new WebLinksAddon()

      terminal.loadAddon(fitAddon)
      terminal.loadAddon(webLinksAddon)

      terminal.open(container)

      // Handle input
      terminal.onData((data: string) => {
        sendMessage(data)
      })

      // Handle terminal resize
      terminal.onResize(({ cols, rows }: { cols: number; rows: number }) => {
        sendMessage(createResizeMessage(cols, rows))
      })

      terminalRef.current = terminal
      fitAddonRef.current = fitAddon

      // Initial fit with delay to ensure layout is complete
      setTimeout(() => {
        if (fitAddon && container) {
          fitAddon.fit()
        }
      }, 100)

      // ResizeObserver for container size changes
      resizeObserver = new ResizeObserver(() => {
        if (fitAddonRef.current) {
          fitAddonRef.current.fit()
        }
      })
      resizeObserver.observe(container)

      setIsReady(true)
    }

    init()

    return () => {
      if (resizeObserver) {
        resizeObserver.disconnect()
      }
      if (terminal) {
        terminal.dispose()
      }
      terminalRef.current = null
      fitAddonRef.current = null
      initializedRef.current = false
      setIsReady(false)
    }
  }, [isVisible, sendMessage])

  // Re-fit when visibility changes
  useEffect(() => {
    if (isVisible && isReady) {
      // Delay to allow CSS transition to complete
      const timeout = setTimeout(() => {
        fitTerminal()
      }, 150)
      return () => clearTimeout(timeout)
    }
  }, [isVisible, isReady, fitTerminal])

  return (
    <div
      className="flex-1 flex flex-col min-h-0 bg-terminal-bg"
      style={{ width: '100%', overflow: 'hidden' }}
    >
      {/* Header */}
      <div className="px-4 py-2 border-b border-gray-700 bg-gray-800 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
          <h3 className="text-sm font-medium text-gray-200">
            Terminal New - {session.name || session.id}
          </h3>
        </div>
        <button
          onClick={() => terminalRef.current?.clear()}
          className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 rounded"
        >
          Clear
        </button>
      </div>

      {/* Terminal Container */}
      <div
        className="flex-1 min-h-0 relative overflow-hidden"
        style={{
          flex: '1 1 0%',
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        <div
          ref={containerRef}
          style={{
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
    </div>
  )
}
