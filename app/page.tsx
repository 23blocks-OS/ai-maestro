'use client'

import { useState, useEffect } from 'react'
import SessionList from '@/components/SessionList'
import TerminalView from '@/components/TerminalView'
import Header from '@/components/Header'
import { useSessions } from '@/hooks/useSessions'
import { TerminalProvider } from '@/contexts/TerminalContext'

export default function DashboardPage() {
  const { sessions, loading, error, refreshSessions } = useSessions()
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  useEffect(() => {
    // Auto-select first session when sessions load
    if (sessions.length > 0 && !activeSessionId) {
      setActiveSessionId(sessions[0].id)
    }
  }, [sessions, activeSessionId])

  const handleSessionSelect = (sessionId: string) => {
    setActiveSessionId(sessionId)
  }

  const toggleSidebar = () => {
    setSidebarCollapsed(!sidebarCollapsed)
  }

  const activeSession = sessions.find((s) => s.id === activeSessionId)

  return (
    <TerminalProvider>
      <div className="flex flex-col h-screen overflow-hidden bg-gray-900">
      {/* Header */}
      <Header onToggleSidebar={toggleSidebar} sidebarCollapsed={sidebarCollapsed} />

      {/* Main Content Area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className={`border-r border-sidebar-border bg-sidebar-bg transition-all duration-300 ${
          sidebarCollapsed ? 'w-0' : 'w-80'
        } overflow-hidden`}>
          <SessionList
            sessions={sessions}
            activeSessionId={activeSessionId}
            onSessionSelect={handleSessionSelect}
            loading={loading}
            error={error}
            onRefresh={refreshSessions}
            onToggleSidebar={toggleSidebar}
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
      <footer className="border-t border-gray-800 bg-gray-950 px-4 py-2">
        <div className="flex justify-between items-center h-5">
          <p className="text-sm text-white leading-none">
            Version 0.1.7 • Made with <span className="text-red-500 text-lg inline-block scale-x-125">♥</span> in Boulder Colorado
          </p>
          <p className="text-sm text-white leading-none">
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
    </TerminalProvider>
  )
}
