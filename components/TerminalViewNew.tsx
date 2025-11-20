'use client'

import { useEffect, useRef } from 'react'
import { useWebSocket } from '@/hooks/useWebSocket'
import type { Session } from '@/types/session'

interface TerminalViewNewProps {
  session: Session
  isVisible?: boolean
}

export default function TerminalViewNew({ session, isVisible = true }: TerminalViewNewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<any>(null)
  const fitAddonRef = useRef<any>(null)
  const shouldAutoFitRef = useRef(true)
  const hasInitialFitRef = useRef(false)

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

  // Initialize terminal
  useEffect(() => {
    if (!containerRef.current) return

    let terminal: any
    let fitAddon: any
    let resizeObserver: ResizeObserver | null = null

    const init = async () => {
      const { Terminal } = await import('@xterm/xterm')
      const { FitAddon } = await import('@xterm/addon-fit')
      const { WebLinksAddon } = await import('@xterm/addon-web-links')

      terminal = new Terminal({
        cursorBlink: true,
        fontSize: 14,
        fontFamily: 'Menlo, Monaco, "Courier New", monospace',
        theme: {
          background: '#000000',
          foreground: '#ffffff',
        },
        scrollback: 10000,
      })

      fitAddon = new FitAddon()
      const webLinksAddon = new WebLinksAddon()

      terminal.loadAddon(fitAddon)
      terminal.loadAddon(webLinksAddon)

      terminal.open(containerRef.current!)

      // Handle input
      terminal.onData((data: string) => {
        sendMessage(data)
      })

      terminalRef.current = terminal
      fitAddonRef.current = fitAddon

      // Don't do initial fit here - wait for tab to become visible
      // This prevents fitting with wrong dimensions before layout is complete

      // Handle resize with conditional fitting (prevents infinite loops)
      resizeObserver = new ResizeObserver((entries) => {
        const entry = entries[0]
        console.log('[TerminalNew] Container resized:', entry.contentRect.width, 'x', entry.contentRect.height, 'autoFit:', shouldAutoFitRef.current)

        if (shouldAutoFitRef.current && fitAddonRef.current) {
          shouldAutoFitRef.current = false  // Disable autofit before calling fit
          fitAddonRef.current.fit()
          setTimeout(() => {
            shouldAutoFitRef.current = true  // Re-enable after a brief delay
          }, 100)
        }
      })
      resizeObserver.observe(containerRef.current!)

      return () => {
        if (resizeObserver) {
          resizeObserver.disconnect()
        }
      }
    }

    const cleanup = init()

    return () => {
      cleanup.then(fn => fn?.())
      if (terminal) {
        terminal.dispose()
      }
      terminalRef.current = null
      fitAddonRef.current = null
    }
  }, [sendMessage])

  // Fit terminal when tab becomes visible for the first time or changes visibility
  useEffect(() => {
    if (isVisible && fitAddonRef.current && containerRef.current) {
      // Use requestAnimationFrame to ensure layout is complete
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (fitAddonRef.current && containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect()
            console.log('[TerminalNew] Visible fit - Container size:', rect.width, 'x', rect.height)
            shouldAutoFitRef.current = false
            fitAddonRef.current.fit()
            console.log('[TerminalNew] Terminal size after fit:', terminalRef.current?.cols, 'x', terminalRef.current?.rows)
            shouldAutoFitRef.current = true
            hasInitialFitRef.current = true
          }
        })
      })
    }
  }, [isVisible])

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-black">
      {/* Header */}
      <div className="px-4 py-2 border-b border-gray-700 bg-gray-800 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
          <h3 className="text-sm font-medium text-gray-200">
            Terminal New (Minimal xterm.js)
          </h3>
        </div>
        <button
          onClick={() => terminalRef.current?.clear()}
          className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 rounded"
        >
          Clear
        </button>
      </div>

      {/* Terminal */}
      <div
        ref={containerRef}
        className="flex-1"
        style={{
          minHeight: 0,
        }}
      />
    </div>
  )
}
