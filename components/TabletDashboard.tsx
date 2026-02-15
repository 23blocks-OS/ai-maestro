'use client'

import { useState, useEffect, useMemo } from 'react'
import TerminalView from './TerminalView'
import MobileChatView from './MobileChatView'
import MobileMessageCenter from './MobileMessageCenter'
import MobileWorkTree from './MobileWorkTree'
import MobileConversationDetail from './MobileConversationDetail'
import { Terminal, Mail, RefreshCw, Activity, Phone, MessageSquare } from 'lucide-react'
import { agentToSession } from '@/lib/agent-utils'
import type { Agent } from '@/types/agent'
import { useHosts } from '@/hooks/useHosts'
import versionInfo from '@/version.json'

interface TabletDashboardProps {
  agents: Agent[]
  loading: boolean
  error: string | null
  onRefresh: () => void
}

export default function TabletDashboard({
  agents,
  loading,
  error,
  onRefresh
}: TabletDashboardProps) {
  const { hosts } = useHosts()
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'agent' | 'messages' | 'work'>('agent')
  const [viewMode, setViewMode] = useState<'terminal' | 'chat'>('chat')
  const [connectionStatus, setConnectionStatus] = useState<{ [agentId: string]: boolean }>({})
  const [selectedConversation, setSelectedConversation] = useState<{
    file: string
    projectPath: string
  } | null>(null)

  const onlineAgents = useMemo(
    () => agents.filter(a => a.session?.status === 'online'),
    [agents]
  )

  // Auto-select first agent
  useEffect(() => {
    if (onlineAgents.length > 0 && !activeAgentId) {
      setActiveAgentId(onlineAgents[0].id)
    }
  }, [onlineAgents, activeAgentId])

  const activeAgent = agents.find((a) => a.id === activeAgentId)

  const getAgentDisplayName = (agent: Agent) => {
    return agent.label || agent.name || agent.alias || agent.id
  }

  const getAgentHostDisplay = () => {
    if (!activeAgent) return 'No Agent Selected'
    const agentName = getAgentDisplayName(activeAgent)
    const hostName = hosts.find(h => h.id === activeAgent.hostId)?.name || activeAgent.hostId || 'unknown-host'
    return `${agentName}@${hostName}`
  }

  const handleConnectionStatusChange = (agentId: string, isConnected: boolean) => {
    setConnectionStatus(prev => ({ ...prev, [agentId]: isConnected }))
  }

  const handleConversationSelect = (file: string, projectPath: string) => {
    setSelectedConversation({ file, projectPath })
  }

  return (
    <div
      className="flex flex-col bg-gray-900"
      style={{
        overflow: 'hidden',
        position: 'fixed',
        inset: 0,
        height: '100dvh',
        maxHeight: '-webkit-fill-available'
      }}
    >
      {/* Header */}
      <header className="flex-shrink-0 border-b border-gray-800 bg-gray-950">
        <div className="flex items-center px-4 py-3">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div
              className={`w-2 h-2 rounded-full flex-shrink-0 ${
                (activeAgentId && connectionStatus[activeAgentId]) || activeAgent?.session?.status === 'online' ? 'bg-green-500' : 'bg-red-500'
              }`}
            />
            <Terminal className="w-5 h-5 text-blue-400 flex-shrink-0" />
            <span className="text-sm font-medium text-white truncate">
              {getAgentHostDisplay()}
            </span>
          </div>

          <button
            onClick={onRefresh}
            disabled={loading}
            className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors disabled:opacity-50 flex-shrink-0"
            aria-label="Refresh agents"
          >
            <RefreshCw className={`w-5 h-5 text-gray-400 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {error && (
          <div className="px-4 py-2 bg-red-900/20 border-t border-red-900/50">
            <p className="text-xs text-red-400">{error}</p>
          </div>
        )}
      </header>

      {/* Main: 2-column layout */}
      <div className="flex-1 flex overflow-hidden" style={{ minHeight: 0 }}>
        {/* Left: Agent sidebar */}
        <aside className="w-60 flex-shrink-0 border-r border-gray-800 bg-gray-950 overflow-y-auto">
          <div className="px-3 py-2 border-b border-gray-800">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Agents</p>
          </div>
          {onlineAgents.length === 0 && (
            <div className="px-4 py-8 text-center">
              <Terminal className="w-8 h-8 text-gray-700 mx-auto mb-2" />
              <p className="text-xs text-gray-500">No online agents</p>
            </div>
          )}
          {onlineAgents.map(agent => {
            const isActive = agent.id === activeAgentId
            const name = getAgentDisplayName(agent)
            const initials = name.split(/[\s-_]+/).map(w => w[0]).join('').toUpperCase().slice(0, 2)
            const isAvatarUrl = agent.avatar && (agent.avatar.startsWith('http') || agent.avatar.startsWith('/'))

            return (
              <div
                key={agent.id}
                onClick={() => { setActiveAgentId(agent.id); setActiveTab('agent') }}
                className={`flex items-center gap-3 px-3 py-3 cursor-pointer transition-colors border-l-2 ${
                  isActive
                    ? 'bg-blue-500/10 border-blue-500 text-white'
                    : 'border-transparent text-gray-400 hover:bg-gray-800/50 hover:text-gray-200'
                }`}
              >
                {/* Avatar */}
                <div className="w-9 h-9 rounded-full overflow-hidden bg-gray-700 flex items-center justify-center flex-shrink-0">
                  {isAvatarUrl ? (
                    <img src={agent.avatar!} alt="" className="w-full h-full object-cover" />
                  ) : agent.avatar ? (
                    <span className="text-sm">{agent.avatar}</span>
                  ) : (
                    <span className="text-xs font-medium">{initials}</span>
                  )}
                </div>

                {/* Name + status */}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{name}</p>
                  <p className="text-xs text-gray-500 truncate">
                    {agent.session?.status === 'online' ? 'Online' : 'Offline'}
                  </p>
                </div>

                {/* Status dot */}
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  agent.session?.status === 'online' ? 'bg-green-500' : 'bg-gray-600'
                }`} />
              </div>
            )
          })}
        </aside>

        {/* Right: Content area */}
        <main className="flex-1 overflow-hidden relative">
          {/* Agent tab */}
          {activeTab === 'agent' && onlineAgents.map(agent => {
            const isActive = agent.id === activeAgentId
            const session = agentToSession(agent)
            return (
              <div
                key={agent.id}
                className="absolute inset-0 flex flex-col"
                style={{
                  visibility: isActive ? 'visible' : 'hidden',
                  pointerEvents: isActive ? 'auto' : 'none',
                  zIndex: isActive ? 10 : 0
                }}
              >
                {/* View mode toggle */}
                <div className="absolute top-2 right-2 z-20 flex rounded-lg overflow-hidden border border-gray-700 bg-gray-900/80 backdrop-blur-sm">
                  <button
                    onClick={() => setViewMode('terminal')}
                    className={`flex items-center gap-1 px-2.5 py-1.5 text-xs transition-colors ${
                      viewMode === 'terminal'
                        ? 'bg-blue-600 text-white'
                        : 'text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    <Terminal className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setViewMode('chat')}
                    className={`flex items-center gap-1 px-2.5 py-1.5 text-xs transition-colors ${
                      viewMode === 'chat'
                        ? 'bg-blue-600 text-white'
                        : 'text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Terminal (always mounted, visibility toggled) */}
                <div
                  className="absolute inset-0"
                  style={{
                    visibility: viewMode === 'terminal' ? 'visible' : 'hidden',
                    pointerEvents: viewMode === 'terminal' ? 'auto' : 'none'
                  }}
                >
                  <TerminalView
                    session={session}
                    hideFooter={true}
                    hideHeader={true}
                    onConnectionStatusChange={(isConnected) => handleConnectionStatusChange(agent.id, isConnected)}
                  />
                </div>

                {/* Chat view (mounted/unmounted) */}
                {viewMode === 'chat' && (
                  <div className="absolute inset-0 pt-10">
                    <MobileChatView
                      agentId={agent.id}
                      agentName={getAgentDisplayName(agent)}
                    />
                  </div>
                )}
              </div>
            )
          })}

          {/* Agent tab: empty state */}
          {activeTab === 'agent' && onlineAgents.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-gray-500">
              <MessageSquare className="w-12 h-12 mb-3 text-gray-700" />
              <p className="text-sm">No online agents</p>
              <p className="text-xs mt-1 text-gray-600">Start an agent session to chat</p>
            </div>
          )}

          {/* Messages tab */}
          {activeTab === 'messages' && activeAgent && (() => {
            const session = agentToSession(activeAgent)
            return (
              <div className="absolute inset-0">
                <MobileMessageCenter
                  sessionName={session.id}
                  agentId={activeAgent.id}
                  allAgents={onlineAgents.map(a => ({
                    id: a.id,
                    name: a.name || a.alias || a.id,
                    alias: a.label || a.name || a.alias || a.id,
                    tmuxSessionName: a.session?.tmuxSessionName,
                    hostId: a.hostId
                  }))}
                  hostUrl={activeAgent.hostUrl}
                />
              </div>
            )
          })()}

          {/* Work tab */}
          {activeTab === 'work' && activeAgent && (
            <div className="absolute inset-0">
              <MobileWorkTree
                sessionName={activeAgent.session?.tmuxSessionName || activeAgent.id}
                agentId={activeAgent.id}
                hostId={activeAgent.hostId}
                onConversationSelect={handleConversationSelect}
              />
            </div>
          )}
        </main>
      </div>

      {/* Bottom Navigation */}
      <nav className="flex-shrink-0 border-t border-gray-800 bg-gray-950">
        <div className="flex items-center justify-around relative">
          <button
            onClick={() => setActiveTab('agent')}
            className={`flex flex-col items-center justify-center py-2.5 px-3 flex-1 transition-colors ${
              activeTab === 'agent'
                ? 'text-blue-400 bg-gray-800/50'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            <MessageSquare className="w-5 h-5 mb-0.5" />
            <span className="text-xs font-medium">Agent</span>
          </button>

          {/* Central Call Button */}
          <div className="flex flex-col items-center justify-center px-2 flex-1">
            <button
              onClick={() => {
                if (activeAgentId) {
                  window.location.href = `/companion?agent=${encodeURIComponent(activeAgentId)}&popup=1`
                }
              }}
              disabled={!activeAgentId || activeAgent?.session?.status !== 'online'}
              className="w-14 h-14 -mt-7 rounded-full bg-green-500 hover:bg-green-400 disabled:bg-gray-700 disabled:opacity-50 text-white flex items-center justify-center shadow-lg shadow-green-500/30 transition-all active:scale-95"
            >
              <Phone className="w-6 h-6" />
            </button>
          </div>

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
        </div>
      </nav>

      {/* Conversation Detail Modal */}
      {selectedConversation && (
        <MobileConversationDetail
          conversationFile={selectedConversation.file}
          projectPath={selectedConversation.projectPath}
          onClose={() => setSelectedConversation(null)}
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
            {' '}v{versionInfo.version} •{' '}
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
