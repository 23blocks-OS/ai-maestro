'use client'

import { useState, useEffect } from 'react'
import TerminalView from './TerminalView'
import MobileMessageCenter from './MobileMessageCenter'
import MobileWorkTree from './MobileWorkTree'
import MobileHostsList from './MobileHostsList'
import MobileConversationDetail from './MobileConversationDetail'
import { Terminal, Mail, RefreshCw, Activity, Server, FileText } from 'lucide-react'
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
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'terminal' | 'messages' | 'work' | 'hosts' | 'notes'>('terminal')
  const [selectedConversation, setSelectedConversation] = useState<{
    file: string
    projectPath: string
  } | null>(null)
  const [notes, setNotes] = useState('')
  const [connectionStatus, setConnectionStatus] = useState<{ [agentId: string]: boolean }>({})

  // Auto-select first agent when agents load
  useEffect(() => {
    if (sessions.length > 0 && !activeAgentId) {
      setActiveAgentId(sessions[0].id)
    }
  }, [sessions, activeAgentId])

  const activeSession = sessions.find((s) => s.id === activeAgentId)

  // Agent-centric storage: Use agentId as primary key (falls back to session.id for backward compatibility)
  const storageId = activeSession?.agentId || activeAgentId

  // Load notes from localStorage when active agent changes
  useEffect(() => {
    if (storageId) {
      const notesKey = `agent-notes-${storageId}`
      const savedNotes = localStorage.getItem(notesKey)
      setNotes(savedNotes || '')
    }
  }, [storageId])

  // Save notes to localStorage when they change
  useEffect(() => {
    if (storageId && notes !== undefined) {
      const notesKey = `agent-notes-${storageId}`
      localStorage.setItem(notesKey, notes)
    }
  }, [notes, storageId])

  const handleAgentSelect = (agentId: string) => {
    setActiveAgentId(agentId)
    // Switch to terminal tab when selecting an agent from hosts tab
    setActiveTab('terminal')
  }

  const handleConversationSelect = (file: string, projectPath: string) => {
    setSelectedConversation({ file, projectPath })
  }

  const handleConversationClose = () => {
    setSelectedConversation(null)
  }

  // Parse agent name for display (show last part if hierarchical)
  const getDisplayName = (agentId: string) => {
    const parts = agentId.split('/')
    return parts[parts.length - 1]
  }

  // Format display as agent@host
  const getAgentHostDisplay = () => {
    if (!activeSession) return 'No Agent Selected'
    const agentName = getDisplayName(activeSession.id)
    const hostName = activeSession.hostId === 'local' ? 'local' : (hosts.find(h => h.id === activeSession.hostId)?.name || activeSession.hostId)
    return `${agentName}@${hostName}`
  }

  // Handle connection status updates from TerminalView
  const handleConnectionStatusChange = (agentId: string, isConnected: boolean) => {
    setConnectionStatus(prev => ({ ...prev, [agentId]: isConnected }))
  }

  // Get connection status for active agent
  const isActiveAgentConnected = activeAgentId ? connectionStatus[activeAgentId] ?? false : false

  return (
    <div
      className="flex flex-col bg-gray-900"
      style={{
        overflow: 'hidden',
        position: 'fixed',
        inset: 0,
        height: '100dvh', // Use dynamic viewport height on supported browsers
        maxHeight: '-webkit-fill-available' // Safari mobile fix
      }}
    >
      {/* Top Bar */}
      <header className="flex-shrink-0 border-b border-gray-800 bg-gray-950">
        <div className="flex items-center px-4 py-3">
          {/* Current Agent Display with Connection Status */}
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {/* Connection indicator - green/red dot */}
            <div
              className={`w-2 h-2 rounded-full flex-shrink-0 ${
                isActiveAgentConnected ? 'bg-green-500' : 'bg-red-500'
              }`}
            />
            <Terminal className="w-5 h-5 text-blue-400 flex-shrink-0" />
            <span className="text-sm font-medium text-white truncate">
              {getAgentHostDisplay()}
            </span>
          </div>

          {/* Refresh Button - Centered */}
          <button
            onClick={onRefresh}
            disabled={loading}
            className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors disabled:opacity-50 flex-shrink-0 flex items-center justify-center"
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

        {/* Terminal & Messages Tabs - Agent-Specific */}
        {(activeTab === 'terminal' || activeTab === 'messages') && sessions.map(session => {
          const isActive = session.id === activeAgentId

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
                <TerminalView
                  session={session}
                  hideFooter={true}
                  hideHeader={true}
                  onConnectionStatusChange={(isConnected) => handleConnectionStatusChange(session.id, isConnected)}
                />
              ) : (
                <MobileMessageCenter
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
              hostId={activeSession.hostId}
              onConversationSelect={handleConversationSelect}
            />
          </div>
        )}

        {/* Hosts Tab - Shows all agents grouped by host */}
        {activeTab === 'hosts' && (
          <div className="absolute inset-0">
            <MobileHostsList
              sessions={sessions}
              activeAgentId={activeAgentId}
              onAgentSelect={handleAgentSelect}
            />
          </div>
        )}

        {/* Notes Tab - Shows notes for active agent */}
        {activeTab === 'notes' && activeSession && (
          <div className="absolute inset-0 flex flex-col bg-gray-900">
            {/* Notes Header */}
            <div className="flex-shrink-0 px-4 py-3 border-b border-gray-800 bg-gray-950">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-400" />
                <h2 className="text-sm font-semibold text-white">Agent Notes</h2>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {getDisplayName(activeSession.id)}
              </p>
            </div>

            {/* Notes Content */}
            <div className="flex-1 overflow-hidden">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Take notes while working with your agent...&#10;&#10;• Your notes are saved automatically&#10;• Each agent has separate notes&#10;• Full markdown support"
                className="w-full h-full px-4 py-3 bg-gray-900 text-gray-200 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset font-mono"
                style={{
                  WebkitOverflowScrolling: 'touch'
                }}
              />
            </div>

            {/* Notes Footer Info */}
            <div className="flex-shrink-0 px-4 py-2 border-t border-gray-800 bg-gray-950">
              <p className="text-xs text-gray-400">
                {notes.length} character{notes.length === 1 ? '' : 's'} • Auto-saved to browser
              </p>
            </div>
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

          <button
            onClick={() => setActiveTab('notes')}
            className={`flex flex-col items-center justify-center py-2.5 px-3 flex-1 transition-colors ${
              activeTab === 'notes'
                ? 'text-blue-400 bg-gray-800/50'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            <FileText className="w-5 h-5 mb-0.5" />
            <span className="text-xs font-medium">Notes</span>
          </button>
        </div>
      </nav>

      {/* Conversation Detail Modal */}
      {selectedConversation && (
        <MobileConversationDetail
          conversationFile={selectedConversation.file}
          projectPath={selectedConversation.projectPath}
          onClose={handleConversationClose}
        />
      )}

      {/* Footer */}
      <footer className="flex-shrink-0 border-t border-gray-800 bg-gray-950 px-2 py-1.5">
        <div className="text-center">
          <p className="text-xs text-gray-400 leading-tight">
            <a
              href="https://x.com/aimaestro23"
              target="_blank"
              rel="noopener noreferrer"
              className="text-white hover:text-gray-300 transition-colors"
            >
              AI Maestro
            </a>
            {' '}v0.12.1 •{' '}
            <a
              href="https://x.com/jkpelaez"
              target="_blank"
              rel="noopener noreferrer"
              className="text-white hover:text-gray-300 transition-colors"
            >
              Juan Peláez
            </a>
            {' '}•{' '}
            <a
              href="https://23blocks.com"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-red-500 hover:text-red-400 transition-colors"
            >
              23blocks
            </a>
          </p>
        </div>
      </footer>
    </div>
  )
}
