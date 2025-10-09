'use client'

import { useEffect, useRef, useState } from 'react'
import { useTerminal } from '@/hooks/useTerminal'
import { useWebSocket } from '@/hooks/useWebSocket'
import { createResizeMessage } from '@/lib/websocket'
import type { Session } from '@/types/session'

interface TerminalViewProps {
  session: Session
}

export default function TerminalView({ session }: TerminalViewProps) {
  const terminalRef = useRef<HTMLDivElement>(null)
  const [isReady, setIsReady] = useState(false)
  const messageBufferRef = useRef<string[]>([])
  const [notes, setNotes] = useState('')
  const [notesCollapsed, setNotesCollapsed] = useState(false)

  const { terminal, initializeTerminal } = useTerminal()

  // Store terminal in a ref so the WebSocket callback can access the current value
  const terminalInstanceRef = useRef<typeof terminal>(null)

  useEffect(() => {
    terminalInstanceRef.current = terminal
  }, [terminal])

  const { isConnected, sendMessage, connectionError, errorHint } = useWebSocket({
    sessionId: session.id,
    onMessage: (data) => {
      // Use ref to get current terminal value, not captured closure value
      if (terminalInstanceRef.current) {
        terminalInstanceRef.current.write(data)
      } else {
        messageBufferRef.current.push(data)
      }
    },
  })

  // Initialize terminal when component mounts or session changes
  useEffect(() => {
    if (!terminalRef.current) return

    let cleanup: (() => void) | undefined

    const init = async () => {
      // Clear message buffer for new session
      messageBufferRef.current = []
      cleanup = await initializeTerminal(terminalRef.current!)
      setIsReady(true)
    }

    init()

    return () => {
      if (cleanup) {
        cleanup()
      }
      setIsReady(false)
      messageBufferRef.current = []
    }
    // Only re-initialize when session changes, not when initializeTerminal changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id])

  // Flush buffered messages when terminal becomes ready
  useEffect(() => {
    if (terminal && messageBufferRef.current.length > 0) {
      messageBufferRef.current.forEach((msg) => {
        terminal.write(msg)
      })
      messageBufferRef.current = []
    }
  }, [terminal])

  // Handle terminal input
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

  // Load notes from localStorage when session changes
  useEffect(() => {
    const storageKey = `session-notes-${session.id}`
    const savedNotes = localStorage.getItem(storageKey)
    if (savedNotes !== null) {
      setNotes(savedNotes)
    } else {
      setNotes('')
    }

    // Load collapsed state
    const collapsedKey = `session-notes-collapsed-${session.id}`
    const savedCollapsed = localStorage.getItem(collapsedKey)
    setNotesCollapsed(savedCollapsed === 'true')
  }, [session.id])

  // Save notes to localStorage when they change
  useEffect(() => {
    const storageKey = `session-notes-${session.id}`
    localStorage.setItem(storageKey, notes)
  }, [notes, session.id])

  // Save collapsed state to localStorage
  useEffect(() => {
    const collapsedKey = `session-notes-collapsed-${session.id}`
    localStorage.setItem(collapsedKey, String(notesCollapsed))
  }, [notesCollapsed, session.id])

  return (
    <div className="flex-1 flex flex-col bg-terminal-bg">
      {/* Terminal Header */}
      <div className="px-4 py-2 border-b border-gray-700 bg-gray-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h3 className="font-medium text-gray-100">
              {session.name || session.id}
            </h3>
            <ConnectionIndicator isConnected={isConnected} />
          </div>
          {terminal && (
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <span>
                {terminal.cols}x{terminal.rows}
              </span>
            </div>
          )}
        </div>
      </div>

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
      <div className="flex-1 relative overflow-hidden">
        <div ref={terminalRef} className="absolute inset-0 custom-scrollbar" />
        {!isReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-terminal-bg">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-400 mx-auto mb-2"></div>
              <p className="text-sm text-gray-400">Initializing terminal...</p>
            </div>
          </div>
        )}
      </div>

      {/* Notes Section */}
      {!notesCollapsed && (
        <div className="border-t border-gray-700 bg-gray-900 flex flex-col" style={{ height: '200px' }}>
          <div className="px-4 py-2 border-b border-gray-700 bg-gray-800 flex items-center justify-between">
            <h4 className="text-sm font-medium text-gray-300">Session Notes</h4>
            <button
              onClick={() => setNotesCollapsed(true)}
              className="text-xs text-gray-400 hover:text-gray-200 transition-colors"
              title="Collapse notes"
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
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Take notes while working with your agent..."
            className="flex-1 px-4 py-3 bg-gray-900 text-gray-200 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset font-mono"
            style={{ minHeight: 0 }}
          />
        </div>
      )}

      {/* Collapsed Notes Bar */}
      {notesCollapsed && (
        <div className="border-t border-gray-700 bg-gray-800 px-4 py-2">
          <button
            onClick={() => setNotesCollapsed(false)}
            className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-200 transition-colors"
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
                d="M5 15l7-7 7 7"
              />
            </svg>
            <span>Show Session Notes</span>
          </button>
        </div>
      )}
    </div>
  )
}

function ConnectionIndicator({ isConnected }: { isConnected: boolean }) {
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <div
        className={`w-2 h-2 rounded-full ${
          isConnected ? 'bg-green-500' : 'bg-red-500'
        }`}
      />
      <span className="text-gray-400">
        {isConnected ? 'Connected' : 'Disconnected'}
      </span>
    </div>
  )
}
