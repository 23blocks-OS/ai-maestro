'use client'

import { useState, useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import '@xterm/xterm/css/xterm.css'
import type { Session } from '@/types/session'

export default function ImmersivePage() {
  const terminalRef = useRef<HTMLDivElement>(null)
  const [sessions, setSessions] = useState<Session[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [showSessionDialog, setShowSessionDialog] = useState(false)
  const terminalInstanceRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const wsRef = useRef<WebSocket | null>(null)

  // Read session from URL parameter
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const sessionParam = params.get('session')
    if (sessionParam) {
      setActiveSessionId(decodeURIComponent(sessionParam))
    }
  }, [])

  // Fetch sessions
  useEffect(() => {
    const fetchSessions = async () => {
      try {
        const res = await fetch('/api/sessions')
        const data = await res.json()
        setSessions(data.sessions || [])

        // Auto-select first session if available
        if (data.sessions && data.sessions.length > 0 && !activeSessionId) {
          setActiveSessionId(data.sessions[0].id)
        }
      } catch (error) {
        console.error('Failed to fetch sessions:', error)
      }
    }

    fetchSessions()
    const interval = setInterval(fetchSessions, 10000)
    return () => clearInterval(interval)
  }, [activeSessionId])

  // Initialize terminal
  useEffect(() => {
    if (!terminalRef.current || !activeSessionId) return

    // Create terminal instance
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: '#1a1b26',
        foreground: '#a9b1d6',
        cursor: '#c0caf5',
        selection: '#33467C'
      },
      scrollback: 10000,
      convertEol: false
    })

    // Add fit addon
    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)

    // Try to add WebGL addon for performance
    try {
      const webglAddon = new WebglAddon()
      term.loadAddon(webglAddon)
    } catch (e) {
      console.warn('WebGL addon failed to load, using canvas renderer')
    }

    // Open terminal
    term.open(terminalRef.current)
    fitAddon.fit()

    terminalInstanceRef.current = term
    fitAddonRef.current = fitAddon

    // Handle window resize
    const handleResize = () => {
      fitAddon.fit()
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'resize',
          cols: term.cols,
          rows: term.rows
        }))
      }
    }

    window.addEventListener('resize', handleResize)

    // Connect WebSocket
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${protocol}//${window.location.host}/term?name=${activeSessionId}`)
    wsRef.current = ws

    ws.onopen = () => {
      console.log('WebSocket connected')
      // Send initial resize
      ws.send(JSON.stringify({
        type: 'resize',
        cols: term.cols,
        rows: term.rows
      }))
    }

    ws.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data)
        if (parsed.type === 'history-complete') {
          setTimeout(() => {
            term.scrollToBottom()
            fitAddon.fit()
            term.focus()
            setTimeout(() => {
              term.refresh(0, term.rows - 1)
            }, 50)
          }, 100)
          return
        }
      } catch {
        // Not JSON, it's raw terminal data
        term.write(event.data)
      }
    }

    ws.onerror = (error) => {
      console.error('WebSocket error:', error)
    }

    ws.onclose = () => {
      console.log('WebSocket closed')
    }

    // Handle terminal input
    const disposable = term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data)
      }
    })

    // Cleanup
    return () => {
      disposable.dispose()
      ws.close()
      term.dispose()
      window.removeEventListener('resize', handleResize)
    }
  }, [activeSessionId])

  // Show session dialog if no active session
  useEffect(() => {
    if (sessions.length > 0 && !activeSessionId) {
      setShowSessionDialog(true)
    }
  }, [sessions, activeSessionId])

  return (
    <div className="fixed inset-0 bg-gray-900 flex flex-col">
      {/* Minimal Header */}
      <header className="bg-gray-950 border-b border-gray-800 px-4 py-2 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-4">
          <a
            href="/"
            className="text-sm text-gray-400 hover:text-white transition-colors"
          >
            ← Back to Dashboard
          </a>
          <span className="text-sm text-gray-500">|</span>
          <span className="text-sm text-white">
            {activeSessionId ? `Session: ${activeSessionId}` : 'No Session'}
          </span>
        </div>
        <button
          onClick={() => setShowSessionDialog(true)}
          className="text-sm px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
        >
          Switch Session
        </button>
      </header>

      {/* Terminal Container */}
      <div className="flex-1 relative overflow-hidden">
        <div
          ref={terminalRef}
          className="absolute inset-0"
        />
      </div>

      {/* Session Selection Dialog */}
      {showSessionDialog && (
        <div
          className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center"
          onClick={() => setShowSessionDialog(false)}
        >
          <div
            className="bg-gray-900 rounded-lg p-6 max-w-md w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold text-white mb-4">Select Session</h2>

            {sessions.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-400 mb-4">No sessions found</p>
                <p className="text-sm text-gray-500">
                  Create a tmux session with Claude Code to get started
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {sessions.map((session) => (
                  <button
                    key={session.id}
                    onClick={() => {
                      setActiveSessionId(session.id)
                      setShowSessionDialog(false)
                    }}
                    className={`w-full text-left px-4 py-3 rounded-lg transition-colors ${
                      session.id === activeSessionId
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                    }`}
                  >
                    {session.id}
                  </button>
                ))}
              </div>
            )}

            <button
              onClick={() => setShowSessionDialog(false)}
              className="mt-4 w-full px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
