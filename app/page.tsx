'use client'

import { useState, useEffect } from 'react'
import SessionList from '@/components/SessionList'
import TerminalView from '@/components/TerminalView'
import MessageCenter from '@/components/MessageCenter'
import Header from '@/components/Header'
import MobileDashboard from '@/components/MobileDashboard'
import { useSessions } from '@/hooks/useSessions'
import { TerminalProvider } from '@/contexts/TerminalContext'
import { Terminal, Mail } from 'lucide-react'

export default function DashboardPage() {
  const { sessions, loading, error, refreshSessions } = useSessions()
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [activeTab, setActiveTab] = useState<'terminal' | 'messages'>('terminal')

  // Read session from URL parameter on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const sessionParam = params.get('session')
    if (sessionParam) {
      setActiveSessionId(decodeURIComponent(sessionParam))
      console.log('Dashboard: Setting session from URL:', decodeURIComponent(sessionParam))
    }
  }, [])

  // Detect mobile screen size
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
      // Auto-collapse sidebar on mobile
      if (window.innerWidth < 768) {
        setSidebarCollapsed(true)
      }
    }

    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  useEffect(() => {
    // Auto-select first session when sessions load (only if no session is set)
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

  // Render mobile-specific dashboard for small screens
  // CRITICAL: Use key prop to force complete unmount/remount when switching layouts
  // This prevents duplicate WebSocket connections and terminal instances
  if (isMobile) {
    return (
      <TerminalProvider key="mobile-dashboard">
        <MobileDashboard
          sessions={sessions}
          loading={loading}
          error={error?.message || null}
          onRefresh={refreshSessions}
        />
      </TerminalProvider>
    )
  }

  // Desktop dashboard
  return (
    <TerminalProvider key="desktop-dashboard">
      <div className="flex flex-col h-screen bg-gray-900" style={{ overflow: 'hidden', position: 'fixed', inset: 0 }}>
        {/* Header */}
        <Header onToggleSidebar={toggleSidebar} sidebarCollapsed={sidebarCollapsed} activeSessionId={activeSessionId} />

        {/* Main Content Area */}
        <div className="flex flex-1 overflow-hidden relative">
          {/* Sidebar */}
          <aside className={`
            border-r border-sidebar-border bg-sidebar-bg transition-all duration-300 overflow-hidden relative
            ${sidebarCollapsed ? 'w-0' : 'w-80'}
          `}>
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
          <main className="flex-1 flex flex-col relative">
            {/* Empty State - shown when no sessions */}
            {sessions.length === 0 && (
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
                  <p className="text-xl mb-2">No sessions found</p>
                  <p className="text-sm">
                    Create a tmux session with Claude Code to get started
                  </p>
                </div>
              </div>
            )}

            {/* All Sessions Mounted as Tabs - toggle visibility with CSS */}
            {sessions.map(session => {
              const isActive = session.id === activeSessionId

              return (
                <div
                  key={session.id}
                  className="absolute inset-0 flex flex-col"
                  style={{
                    visibility: isActive ? 'visible' : 'hidden',
                    pointerEvents: isActive ? 'auto' : 'none',
                    zIndex: isActive ? 10 : 0
                  }}
                >
                  {/* Tab Navigation */}
                  <div className="flex border-b border-gray-800 bg-gray-900 flex-shrink-0">
                    <button
                      onClick={() => setActiveTab('terminal')}
                      className={`flex items-center gap-2 px-6 py-3 text-sm font-medium transition-all duration-200 ${
                        activeTab === 'terminal'
                          ? 'text-blue-400 border-b-2 border-blue-400 bg-gray-800/50'
                          : 'text-gray-400 hover:text-gray-300 hover:bg-gray-800/30'
                      }`}
                    >
                      <Terminal className="w-4 h-4" />
                      Terminal
                    </button>
                    <button
                      onClick={() => setActiveTab('messages')}
                      className={`flex items-center gap-2 px-6 py-3 text-sm font-medium transition-all duration-200 ${
                        activeTab === 'messages'
                          ? 'text-blue-400 border-b-2 border-blue-400 bg-gray-800/50'
                          : 'text-gray-400 hover:text-gray-300 hover:bg-gray-800/30'
                      }`}
                    >
                      <Mail className="w-4 h-4" />
                      Messages
                    </button>
                  </div>

                  {/* Tab Content */}
                  <div className="flex-1 flex overflow-hidden">
                    {activeTab === 'terminal' ? (
                      <TerminalView session={session} />
                    ) : (
                      <MessageCenter
                        sessionName={session.id}
                        allSessions={sessions.map(s => s.id)}
                      />
                    )}
                  </div>
                </div>
              )
            })}
          </main>
      </div>

      {/* Footer */}
      <footer className="border-t border-gray-800 bg-gray-950 px-4 py-2 flex-shrink-0">
        <div className="flex flex-col md:flex-row justify-between items-center gap-1 md:gap-0 md:h-5">
          <p className="text-xs md:text-sm text-white leading-none">
            Version 0.5.0 • Made with <span className="text-red-500 text-lg inline-block scale-x-125">♥</span> in Boulder Colorado
          </p>
          <p className="text-xs md:text-sm text-white leading-none">
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
