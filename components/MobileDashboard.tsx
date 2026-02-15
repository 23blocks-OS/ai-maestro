'use client'

import { useState, useEffect, useMemo } from 'react'
import TerminalView from './TerminalView'
import MobileChatView from './MobileChatView'
import MobileMessageCenter from './MobileMessageCenter'
import MobileWorkTree from './MobileWorkTree'
import MobileHostsList from './MobileHostsList'
import MobileConversationDetail from './MobileConversationDetail'
import { Terminal, Mail, RefreshCw, Activity, Server, MessageSquare, Phone } from 'lucide-react'
import { agentToSession } from '@/lib/agent-utils'
import type { Agent } from '@/types/agent'
import { useHosts } from '@/hooks/useHosts'
import versionInfo from '@/version.json'

interface MobileDashboardProps {
  agents: Agent[]
  loading: boolean
  error: string | null
  onRefresh: () => void
}

export default function MobileDashboard({
  agents,
  loading,
  error,
  onRefresh
}: MobileDashboardProps) {
  const { hosts } = useHosts()
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'terminal' | 'messages' | 'work' | 'hosts'>('terminal')
  const [viewMode, setViewMode] = useState<'terminal' | 'chat'>('terminal')
  const [selectedConversation, setSelectedConversation] = useState<{
    file: string
    projectPath: string
  } | null>(null)
  const [connectionStatus, setConnectionStatus] = useState<{ [agentId: string]: boolean }>({})

  // Filter to only online agents for terminal tabs
  const onlineAgents = useMemo(
    () => agents.filter(a => a.session?.status === 'online'),
    [agents]
  )

  // Auto-select first agent when agents load
  useEffect(() => {
    if (onlineAgents.length > 0 && !activeAgentId) {
      setActiveAgentId(onlineAgents[0].id)
    }
  }, [onlineAgents, activeAgentId])

  const activeAgent = agents.find((a) => a.id === activeAgentId)

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

  // Get display name for an agent
  const getAgentDisplayName = (agent: Agent) => {
    return agent.label || agent.name || agent.alias || agent.id
  }

  // Format display as agent@host
  const getAgentHostDisplay = () => {
    if (!activeAgent) return 'No Agent Selected'
    const agentName = getAgentDisplayName(activeAgent)
    // Find host display name, fallback to hostId, then 'unknown-host'
    const hostName = hosts.find(h => h.id === activeAgent.hostId)?.name || activeAgent.hostId || 'unknown-host'
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
            aria-label="Refresh agents"
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
        {/* Empty State - only show on terminal/messages tabs */}
        {onlineAgents.length === 0 && (activeTab === 'terminal' || activeTab === 'messages') && (
          <div className="flex flex-col items-center justify-center h-full px-6 text-center bg-gray-900">
            <Terminal className="w-16 h-16 text-gray-600 mb-4" />
            <p className="text-lg font-medium text-gray-300 mb-2">No Online Agents</p>
            <p className="text-sm text-gray-500">
              Start an agent&apos;s tmux session to connect
            </p>
          </div>
        )}

        {/* Terminal & Messages Tabs - Agent-Specific */}
        {(activeTab === 'terminal' || activeTab === 'messages') && onlineAgents.map(agent => {
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
              {activeTab === 'terminal' ? (
                <>
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
                </>
              ) : (
                <MobileMessageCenter
                  sessionName={session.id}
                  agentId={agent.id}
                  allAgents={onlineAgents.map(a => ({
                    id: a.id,
                    name: a.name || a.alias || a.id,  // Technical name for lookups
                    alias: a.label || a.name || a.alias || a.id,  // Display name for UI
                    tmuxSessionName: a.session?.tmuxSessionName,
                    hostId: a.hostId
                  }))}
                  hostUrl={agent.hostUrl}
                />
              )}
            </div>
          )
        })}

        {/* Work Tab - Shows work history for active agent */}
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

        {/* Hosts Tab - Shows all agents grouped by host */}
        {activeTab === 'hosts' && (
          <div className="absolute inset-0">
            <MobileHostsList
              agents={agents}
              activeAgentId={activeAgentId}
              onAgentSelect={handleAgentSelect}
            />
          </div>
        )}

      </main>

      {/* Bottom Navigation */}
      <nav className="flex-shrink-0 border-t border-gray-800 bg-gray-950">
        <div className="flex items-center justify-around relative">
          <button
            onClick={() => setActiveTab('terminal')}
            className={`flex flex-col items-center justify-center py-2.5 px-3 flex-1 transition-colors ${
              activeTab === 'terminal'
                ? 'text-blue-400 bg-gray-800/50'
                : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            <Terminal className="w-5 h-5 mb-0.5" />
            <span className="text-xs font-medium">Agent</span>
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

          {/* Central Call Button */}
          <div className="flex flex-col items-center justify-center px-2 flex-1">
            <button
              onClick={() => {
                if (activeAgentId) {
                  window.location.href = `/companion?agent=${encodeURIComponent(activeAgentId)}&popup=1`
                }
              }}
              disabled={!activeAgentId || !isActiveAgentConnected}
              className="w-14 h-14 -mt-7 rounded-full bg-green-500 hover:bg-green-400 disabled:bg-gray-700 disabled:opacity-50 text-white flex items-center justify-center shadow-lg shadow-green-500/30 transition-all active:scale-95"
            >
              <Phone className="w-6 h-6" />
            </button>
          </div>

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
