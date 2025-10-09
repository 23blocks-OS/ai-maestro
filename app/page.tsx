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
    <div className="flex h-screen overflow-hidden bg-gray-900">
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
  )
}
