'use client'

import { useState, useEffect } from 'react'
import SessionList from '@/components/SessionList'
import TerminalView from '@/components/TerminalView'
import { useSessions } from '@/hooks/useSessions'

export default function DashboardPage() {
  const { sessions, loading, error, refreshSessions } = useSessions()
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)

  useEffect(() => {
    // Auto-select first session when sessions load
    if (sessions.length > 0 && !activeSessionId) {
      setActiveSessionId(sessions[0].id)
    }
  }, [sessions, activeSessionId])

  const handleSessionSelect = (sessionId: string) => {
    setActiveSessionId(sessionId)
  }

  const activeSession = sessions.find((s) => s.id === activeSessionId)

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-gray-900">
      {/* Main Content Area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-80 border-r border-sidebar-border bg-sidebar-bg">
          <SessionList
            sessions={sessions}
            activeSessionId={activeSessionId}
            onSessionSelect={handleSessionSelect}
            loading={loading}
            error={error}
            onRefresh={refreshSessions}
          />
        </aside>

        {/* Main Content */}
        <main className="flex-1 flex flex-col">
          {activeSession ? (
            <TerminalView session={activeSession} />
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-400">
              <div className="text-center">
                <svg
                  className="w-16 h-16 mx-auto mb-4 text-gray-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                <p className="text-xl mb-2">No session selected</p>
                <p className="text-sm">
                  {sessions.length === 0
                    ? 'Create a tmux session with Claude Code to get started'
                    : 'Select a session from the sidebar to view its terminal'}
                </p>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Footer */}
      <footer className="border-t border-gray-800 bg-gray-950 px-6 py-3">
        <div className="flex justify-between items-center">
          <p className="text-sm text-white">
            Version 0.1.3 • Made with <span className="text-red-500 text-lg inline-block scale-x-125">♥</span> in Boulder Colorado
          </p>
          <p className="text-sm text-white">
            Concept by{' '}
            <a
              href="https://x.com/jkpelaez"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-gray-300 transition-colors"
            >
              Juan Peláez
            </a>{' '}
            @{' '}
            <a
              href="https://23blocks.com"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-red-500 hover:text-red-400 transition-colors"
            >
              23blocks
            </a>
            . Coded by Claude
          </p>
        </div>
      </footer>
    </div>
  )
}
