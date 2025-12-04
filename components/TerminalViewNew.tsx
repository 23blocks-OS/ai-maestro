'use client'

import { useEffect, useRef, useState } from 'react'
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
  const initRef = useRef(false)
  const [status, setStatus] = useState<'pending' | 'ready' | 'error'>('pending')

  const { isConnected, sendMessage } = useWebSocket({
    sessionId: session.id,
    hostId: session.hostId,
    autoConnect: isVisible,
    onMessage: (data) => {
      terminalRef.current?.write(data)
    },
  })

  // Initialize terminal
  useEffect(() => {
    // Only init once, only when visible
    if (!isVisible || initRef.current) return

    const container = containerRef.current
    if (!container) return

    initRef.current = true

    const setup = async () => {
      try {
        const { Terminal } = await import('@xterm/xterm')
        const { FitAddon } = await import('@xterm/addon-fit')
        const { WebLinksAddon } = await import('@xterm/addon-web-links')
        const { ClipboardAddon } = await import('@xterm/addon-clipboard')

        const terminal = new Terminal({
          cursorBlink: true,
          fontSize: 16,
          fontFamily: '"SF Mono", Menlo, Monaco, monospace',
          scrollback: 5000,
          convertEol: false,
          allowProposedApi: true,
          theme: {
            background: '#0d1117',
            foreground: '#c9d1d9',
            cursor: '#58a6ff',
            selectionBackground: '#264f78',
          },
        })

        const fitAddon = new FitAddon()
        terminal.loadAddon(fitAddon)
        terminal.loadAddon(new WebLinksAddon())
        terminal.loadAddon(new ClipboardAddon())

        terminal.open(container)

        terminalRef.current = terminal
        fitAddonRef.current = fitAddon

        // Input handling
        terminal.onData((data) => sendMessage(data))
        terminal.onResize(({ cols, rows }) => sendMessage(createResizeMessage(cols, rows)))

        // Fit after a delay
        setTimeout(() => {
          fitAddon.fit()
          setStatus('ready')
        }, 100)

        // Resize observer
        const ro = new ResizeObserver(() => fitAddonRef.current?.fit())
        ro.observe(container)

        return () => {
          ro.disconnect()
          terminal.dispose()
        }
      } catch (err) {
        console.error('Terminal init failed:', err)
        setStatus('error')
      }
    }

    setup()
  }, [isVisible, sendMessage])

  // Refit on visibility change
  useEffect(() => {
    if (isVisible && status === 'ready') {
      setTimeout(() => fitAddonRef.current?.fit(), 50)
    }
  }, [isVisible, status])

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      width: '100%',
      height: '100%',
      backgroundColor: '#0d1117'
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 16px',
        backgroundColor: '#161b22',
        borderBottom: '1px solid #30363d',
        flexShrink: 0
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: isConnected ? '#3fb950' : '#f85149'
          }} />
          <span style={{ fontSize: '14px', color: '#c9d1d9' }}>
            {session.name || session.id}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => terminalRef.current?.clear()}
            style={{
              padding: '4px 8px',
              fontSize: '12px',
              color: '#8b949e',
              backgroundColor: 'transparent',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Clear
          </button>
          <button
            onClick={() => {
              const sel = terminalRef.current?.getSelection()
              if (sel) navigator.clipboard.writeText(sel)
            }}
            style={{
              padding: '4px 8px',
              fontSize: '12px',
              color: '#8b949e',
              backgroundColor: 'transparent',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Copy
          </button>
        </div>
      </div>

      {/* Terminal container */}
      <div
        ref={containerRef}
        style={{
          flex: 1,
          minHeight: 0,
          width: '100%',
          overflow: 'hidden'
        }}
      />

      {/* Status messages */}
      {status === 'pending' && !initRef.current && (
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#0d1117',
          color: '#8b949e'
        }}>
          Click this tab to load terminal
        </div>
      )}

      {status === 'error' && (
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#0d1117',
          color: '#f85149'
        }}>
          Failed to initialize terminal
        </div>
      )}
    </div>
  )
}
