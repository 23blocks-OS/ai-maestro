'use client'

import { useState, useEffect } from 'react'
import TerminalView from './TerminalView'
import MessageCenter from './MessageCenter'
import { Terminal, Mail, ChevronDown, RefreshCw, Menu } from 'lucide-react'
import type { Session } from '@/types/session'

interface MobileDashboardProps {
  sessions: Session[]
  loading: boolean
  error: string | null
  onRefresh: () => void
}

export default function MobileDashboard({
  sessions,
  loading,
  error,
  onRefresh
}: MobileDashboardProps) {
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'terminal' | 'messages'>('terminal')
  const [showSessionSwitcher, setShowSessionSwitcher] = useState(false)

  // Auto-select first session when sessions load
  useEffect(() => {
    if (sessions.length > 0 && !activeSessionId) {
      setActiveSessionId(sessions[0].id)
    }
  }, [sessions, activeSessionId])

  const activeSession = sessions.find((s) => s.id === activeSessionId)

  const handleSessionSelect = (sessionId: string) => {
    setActiveSessionId(sessionId)
    setShowSessionSwitcher(false)
  }

  // Parse session name for display (show last part if hierarchical)
  const getDisplayName = (sessionId: string) => {
    const parts = sessionId.split('/')
    return parts[parts.length - 1]
  }

  return (
    <div className="flex flex-col h-screen bg-gray-900" style={{ overflow: 'hidden', position: 'fixed', inset: 0 }}>
      {/* Top Bar */}
      <header className="flex-shrink-0 border-b border-gray-800 bg-gray-950">
        <div className="flex items-center justify-between px-4 py-3">
          {/* Session Selector */}
          <button
            onClick={() => setShowSessionSwitcher(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors min-w-0 flex-1 mr-2"
          >
            <Terminal className="w-5 h-5 text-blue-400 flex-shrink-0" />
            <span className="text-sm font-medium text-white truncate">
              {activeSession ? getDisplayName(activeSession.id) : 'Select Session'}
            </span>
            <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0 ml-auto" />
          </button>

          {/* Refresh Button */}
          <button
            onClick={onRefresh}
            disabled={loading}
            className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors disabled:opacity-50 flex-shrink-0"
            aria-label="Refresh sessions"
          >
            <RefreshCw className={`w-5 h-5 text-gray-400 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="px-4 py-2 bg-red-900/20 border-t border-red-900/50">
            <p className="text-xs text-red-400">{error}</p>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden relative">
        {/* Empty State */}
        {sessions.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full px-6 text-center">
            <Terminal className="w-16 h-16 text-gray-600 mb-4" />
            <p className="text-lg font-medium text-gray-300 mb-2">No Sessions Found</p>
            <p className="text-sm text-gray-500">
              Create a tmux session with Claude Code to get started
            </p>
          </div>
        )}

        {/* All Sessions Mounted as Tabs */}
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
              {activeTab === 'terminal' ? (
                <TerminalView session={session} />
              ) : (
                <MessageCenter
                  sessionName={session.id}
                  allSessions={sessions.map(s => s.id)}
                />
              )}
            </div>
          )
        })}
      </main>

      {/* Bottom Navigation */}
      <nav className="flex-shrink-0 border-t border-gray-800 bg-gray-950">
        <div className="flex items-center justify-around">
          <button
            onClick={() => setActiveTab('terminal')}
            className={`flex flex-col items-center justify-center py-3 px-6 flex-1 transition-colors ${
              activeTab === 'terminal'
                ? 'text-blue-400 bg-gray-800/50'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            <Terminal className="w-6 h-6 mb-1" />
            <span className="text-xs font-medium">Terminal</span>
          </button>

          <button
            onClick={() => setActiveTab('messages')}
            className={`flex flex-col items-center justify-center py-3 px-6 flex-1 transition-colors ${
              activeTab === 'messages'
                ? 'text-blue-400 bg-gray-800/50'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            <Mail className="w-6 h-6 mb-1" />
            <span className="text-xs font-medium">Messages</span>
          </button>

          <button
            onClick={() => setShowSessionSwitcher(true)}
            className="flex flex-col items-center justify-center py-3 px-6 flex-1 text-gray-400 hover:text-gray-300 transition-colors"
          >
            <Menu className="w-6 h-6 mb-1" />
            <span className="text-xs font-medium">Sessions</span>
          </button>
        </div>
      </nav>

      {/* Session Switcher Modal */}
      {showSessionSwitcher && (
        <div
          className="fixed inset-0 bg-black/70 z-50 flex items-end"
          onClick={() => setShowSessionSwitcher(false)}
          style={{
            touchAction: 'none'
          }}
        >
          <div
            className="w-full bg-gray-900 rounded-t-2xl flex flex-col"
            style={{
              maxHeight: '80vh',
              height: '80vh',
              overflow: 'hidden'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-4 py-4 border-b border-gray-800 flex-shrink-0">
              <h2 className="text-lg font-semibold text-white">Sessions</h2>
              <button
                onClick={() => setShowSessionSwitcher(false)}
                className="p-2 rounded-lg hover:bg-gray-800 transition-colors"
              >
                <span className="text-gray-400 text-2xl leading-none">&times;</span>
              </button>
            </div>

            {/* Session List */}
            <div
              className="flex-1 overflow-y-auto min-h-0"
              style={{
                WebkitOverflowScrolling: 'touch',
                overscrollBehavior: 'contain',
                touchAction: 'pan-y'
              }}
            >
              {sessions.map((session) => {
                const isActive = session.id === activeSessionId
                const parts = session.id.split('/')
                const displayName = parts[parts.length - 1]
                const breadcrumb = parts.length > 1 ? parts.slice(0, -1).join(' / ') : null

                return (
                  <button
                    key={session.id}
                    onClick={() => handleSessionSelect(session.id)}
                    className={`w-full px-4 py-4 flex items-center gap-3 transition-colors ${
                      isActive
                        ? 'bg-blue-900/30 border-l-4 border-blue-400'
                        : 'hover:bg-gray-800 border-l-4 border-transparent'
                    }`}
                  >
                    <Terminal className={`w-5 h-5 flex-shrink-0 ${isActive ? 'text-blue-400' : 'text-gray-400'}`} />
                    <div className="flex-1 min-w-0 text-left">
                      <p className={`text-sm font-medium truncate ${isActive ? 'text-blue-400' : 'text-white'}`}>
                        {displayName}
                      </p>
                      {breadcrumb && (
                        <p className="text-xs text-gray-500 truncate">{breadcrumb}</p>
                      )}
                    </div>
                    {isActive && (
                      <div className="w-2 h-2 rounded-full bg-blue-400 flex-shrink-0" />
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="flex-shrink-0 border-t border-gray-800 bg-gray-950 px-4 py-2">
        <div className="text-center">
          <p className="text-xs text-gray-400">
            AI Maestro v0.3.1
          </p>
        </div>
      </footer>
    </div>
  )
}
