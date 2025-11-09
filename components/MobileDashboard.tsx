'use client'

import { useState, useEffect } from 'react'
import TerminalView from './TerminalView'
import MessageCenter from './MessageCenter'
import MobileWorkTree from './MobileWorkTree'
import MobileHostsList from './MobileHostsList'
import MobileConversationDetail from './MobileConversationDetail'
import { Terminal, Mail, ChevronDown, RefreshCw, Activity, Server, X } from 'lucide-react'
import type { Session } from '@/types/session'
import { useHosts } from '@/hooks/useHosts'

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
  const { hosts } = useHosts()
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'terminal' | 'messages' | 'work' | 'hosts'>('terminal')
  const [showSessionSwitcher, setShowSessionSwitcher] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedHostFilter, setSelectedHostFilter] = useState<string>('all')
  const [selectedConversation, setSelectedConversation] = useState<{
    file: string
    projectPath: string
  } | null>(null)

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
    setSearchQuery('') // Clear search when closing
  }

  const handleConversationSelect = (file: string, projectPath: string) => {
    setSelectedConversation({ file, projectPath })
  }

  const handleConversationClose = () => {
    setSelectedConversation(null)
  }

  // Filter sessions based on search query and host filter
  const filteredSessions = sessions.filter((session) => {
    const matchesSearch = session.id.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesHost = selectedHostFilter === 'all' || session.hostId === selectedHostFilter
    return matchesSearch && matchesHost
  })

  // Parse session name for display (show last part if hierarchical)
  const getDisplayName = (sessionId: string) => {
    const parts = sessionId.split('/')
    return parts[parts.length - 1]
  }

  return (
    <div
      className="flex flex-col bg-gray-900"
      style={{
        overflow: 'hidden',
        position: 'fixed',
        inset: 0,
        height: '100vh',
        height: '100dvh', // Use dynamic viewport height on supported browsers
        maxHeight: '-webkit-fill-available' // Safari mobile fix
      }}
    >
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
              {activeSession ? getDisplayName(activeSession.id) : 'Select Agent'}
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
      <main className="flex-1 overflow-hidden relative" style={{ minHeight: 0 }}>
        {/* Empty State */}
        {sessions.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full px-6 text-center">
            <Terminal className="w-16 h-16 text-gray-600 mb-4" />
            <p className="text-lg font-medium text-gray-300 mb-2">No Agents Found</p>
            <p className="text-sm text-gray-500">
              Create a new agent to get started
            </p>
          </div>
        )}

        {/* Terminal & Messages Tabs - Session-Specific */}
        {(activeTab === 'terminal' || activeTab === 'messages') && sessions.map(session => {
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
                <TerminalView session={session} hideFooter={true} />
              ) : (
                <MessageCenter
                  sessionName={session.id}
                  allSessions={sessions.map(s => s.id)}
                />
              )}
            </div>
          )
        })}

        {/* Work Tab - Shows work history for active session */}
        {activeTab === 'work' && activeSession && (
          <div className="absolute inset-0">
            <MobileWorkTree
              sessionName={activeSession.id}
              agentId={activeSession.agentId}
              onConversationSelect={handleConversationSelect}
            />
          </div>
        )}

        {/* Hosts Tab - Shows all sessions grouped by host */}
        {activeTab === 'hosts' && (
          <div className="absolute inset-0">
            <MobileHostsList
              sessions={sessions}
              activeSessionId={activeSessionId}
              onSessionSelect={handleSessionSelect}
            />
          </div>
        )}
      </main>

      {/* Bottom Navigation */}
      <nav className="flex-shrink-0 border-t border-gray-800 bg-gray-950">
        <div className="flex items-center justify-around">
          <button
            onClick={() => setActiveTab('terminal')}
            className={`flex flex-col items-center justify-center py-2.5 px-3 flex-1 transition-colors ${
              activeTab === 'terminal'
                ? 'text-blue-400 bg-gray-800/50'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            <Terminal className="w-5 h-5 mb-0.5" />
            <span className="text-xs font-medium">Terminal</span>
          </button>

          <button
            onClick={() => setActiveTab('messages')}
            className={`flex flex-col items-center justify-center py-2.5 px-3 flex-1 transition-colors ${
              activeTab === 'messages'
                ? 'text-blue-400 bg-gray-800/50'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            <Mail className="w-5 h-5 mb-0.5" />
            <span className="text-xs font-medium">Messages</span>
          </button>

          <button
            onClick={() => setActiveTab('work')}
            className={`flex flex-col items-center justify-center py-2.5 px-3 flex-1 transition-colors ${
              activeTab === 'work'
                ? 'text-blue-400 bg-gray-800/50'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            <Activity className="w-5 h-5 mb-0.5" />
            <span className="text-xs font-medium">Work</span>
          </button>

          <button
            onClick={() => setActiveTab('hosts')}
            className={`flex flex-col items-center justify-center py-2.5 px-3 flex-1 transition-colors ${
              activeTab === 'hosts'
                ? 'text-blue-400 bg-gray-800/50'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            <Server className="w-5 h-5 mb-0.5" />
            <span className="text-xs font-medium">Hosts</span>
          </button>
        </div>
      </nav>

      {/* Session Switcher Modal */}
      {showSessionSwitcher && (
        <div
          className="fixed inset-0 z-50"
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center'
          }}
          onClick={() => setShowSessionSwitcher(false)}
        >
          <div
            className="w-full bg-gray-900 rounded-t-2xl"
            style={{
              maxHeight: '80vh',
              display: 'flex',
              flexDirection: 'column',
              position: 'relative'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div
              className="px-4 py-4 border-b border-gray-800"
              style={{ flexShrink: 0 }}
            >
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold text-white">Agents</h2>
                <button
                  onClick={() => {
                    setShowSessionSwitcher(false)
                    setSearchQuery('')
                  }}
                  className="p-2 rounded-lg hover:bg-gray-800 transition-colors"
                >
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>

              {/* Host Filter */}
              <div className="mb-3">
                <select
                  value={selectedHostFilter}
                  onChange={(e) => setSelectedHostFilter(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-800 text-white rounded-lg border border-gray-700 focus:outline-none focus:border-blue-500 text-sm"
                >
                  <option value="all">All Hosts ({sessions.length})</option>
                  {hosts.map((host) => {
                    const count = sessions.filter((s) => s.hostId === host.id).length
                    return (
                      <option key={host.id} value={host.id}>
                        {host.name} ({count})
                      </option>
                    )
                  })}
                </select>
              </div>

              {/* Search Input */}
              <input
                id="mobile-search"
                name="search"
                type="text"
                placeholder="Search agents..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-3 py-2 bg-gray-800 text-white rounded-lg border border-gray-700 focus:outline-none focus:border-blue-500"
                autoFocus
              />
            </div>

            {/* Session List */}
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                overflowX: 'hidden',
                WebkitOverflowScrolling: 'touch',
                position: 'relative'
              }}
            >
              {filteredSessions.length === 0 ? (
                <div className="flex items-center justify-center py-8 text-gray-400">
                  <p>No agents found</p>
                </div>
              ) : (
                filteredSessions.map((session) => {
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
              })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Conversation Detail Modal */}
      {selectedConversation && (
        <MobileConversationDetail
          conversationFile={selectedConversation.file}
          projectPath={selectedConversation.projectPath}
          onClose={handleConversationClose}
        />
      )}

      {/* Footer */}
      <footer className="flex-shrink-0 border-t border-gray-800 bg-gray-950 px-4 py-2">
        <div className="text-center">
          <p className="text-xs text-gray-400">
            AI Maestro v0.5.0
          </p>
        </div>
      </footer>
    </div>
  )
}
