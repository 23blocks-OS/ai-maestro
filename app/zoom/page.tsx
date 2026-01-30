'use client'

import { useState, useMemo, useEffect } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useAgents } from '@/hooks/useAgents'
import { TerminalProvider } from '@/contexts/TerminalContext'
import { ArrowLeft, Loader2, RefreshCw, AlertCircle, X, ExternalLink, Search, Mail } from 'lucide-react'
import { VersionChecker } from '@/components/VersionChecker'
import type { Agent } from '@/types/agent'
import type { Session } from '@/types/session'
import './zoom.css'

// Dynamic import for AgentCard to reduce initial bundle
const AgentCard = dynamic(
  () => import('@/components/zoom/AgentCard'),
  {
    ssr: false,
    loading: () => (
      <div className="aspect-square bg-gray-800/50 rounded-xl animate-pulse" />
    )
  }
)

// Dynamic import for expanded view (heavy component)
const AgentCardView = dynamic(
  () => import('@/components/zoom/AgentCardView'),
  {
    ssr: false,
    loading: () => (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-violet-500 animate-spin" />
      </div>
    )
  }
)

// Helper: Convert agent to session-like object for TerminalView compatibility
function agentToSession(agent: Agent): Session {
  // CRITICAL: session.id must be the tmux session name for WebSocket to connect
  // Use tmuxSessionName if available, otherwise fall back to agent.id (matching main dashboard)
  const sessionId = agent.session?.tmuxSessionName || agent.id

  return {
    id: sessionId,
    name: agent.label || agent.name || agent.alias || '',
    workingDirectory: agent.session?.workingDirectory || agent.preferences?.defaultWorkingDirectory || '',
    status: 'active' as const,
    createdAt: agent.createdAt,
    lastActivity: agent.lastActive || agent.createdAt,
    windows: 1,
    agentId: agent.id,
    hostId: agent.hostId,
  }
}

// Helper: Check if agent has a valid terminal session
function hasValidTerminalSession(agent: Agent): boolean {
  return !!agent.session?.tmuxSessionName
}

export default function ZoomPage() {
  const { agents, loading, error, refreshAgents, onlineAgents } = useAgents()
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)
  const [flippingCardId, setFlippingCardId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({})

  // Fetch unread message counts for all agents
  useEffect(() => {
    const fetchUnreadCounts = async () => {
      const counts: Record<string, number> = {}

      for (const agent of agents) {
        try {
          const baseUrl = agent.hostUrl || ''
          const response = await fetch(`${baseUrl}/api/messages?agent=${encodeURIComponent(agent.id)}&action=unread-count`)
          if (response.ok) {
            const data = await response.json()
            if (data.count > 0) {
              counts[agent.id] = data.count
            }
          }
        } catch {
          // Ignore errors for individual agents
        }
      }

      setUnreadCounts(counts)
    }

    if (agents.length > 0) {
      fetchUnreadCounts()
      const interval = setInterval(fetchUnreadCounts, 10000)
      return () => clearInterval(interval)
    }
  }, [agents])

  // Compute selectable agents: online + hibernated (offline with session config)
  const selectableAgents = useMemo(
    () => agents.filter(a => a.session?.status === 'online' || (a.sessions && a.sessions.length > 0)),
    [agents]
  )

  // Filter agents by search query
  const filteredAgents = useMemo(() => {
    if (!searchQuery.trim()) return selectableAgents

    const query = searchQuery.toLowerCase()
    return selectableAgents.filter(agent => {
      const name = (agent.name || '').toLowerCase()
      const label = (agent.label || '').toLowerCase()
      const alias = (agent.alias || '').toLowerCase()
      const tags = (agent.tags || []).join(' ').toLowerCase()
      const hostId = (agent.hostId || '').toLowerCase()

      return name.includes(query) ||
             label.includes(query) ||
             alias.includes(query) ||
             tags.includes(query) ||
             hostId.includes(query)
    })
  }, [selectableAgents, searchQuery])

  // Get selected agent details
  const selectedAgent = selectedAgentId ? agents.find(a => a.id === selectedAgentId) : null
  const selectedSession = selectedAgent ? agentToSession(selectedAgent) : null
  const isSelectedHibernated = selectedAgent
    ? selectedAgent.session?.status !== 'online' && (selectedAgent.sessions && selectedAgent.sessions.length > 0)
    : false

  const handleCardClick = (agentId: string) => {
    // Start flip animation
    setFlippingCardId(agentId)

    // After flip animation completes, open the modal
    setTimeout(() => {
      setSelectedAgentId(agentId)
      setFlippingCardId(null)
    }, 600) // Match the CSS flip animation duration
  }

  const handleCloseModal = () => {
    setSelectedAgentId(null)
  }

  const handlePopOut = (agent: Agent) => {
    // Open the same tabbed view in a new window
    const url = `/zoom/agent?id=${encodeURIComponent(agent.id)}`
    window.open(url, `agent-${agent.id}`, 'width=1200,height=800,menubar=no,toolbar=no')
    // Close the modal
    setSelectedAgentId(null)
  }

  const handleWake = async (agent: Agent) => {
    try {
      const baseUrl = agent.hostUrl || ''
      await fetch(`${baseUrl}/api/agents/${agent.id}/wake`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ program: 'claude' }),
      })
      refreshAgents()
    } catch (error) {
      console.error('Failed to wake agent:', error)
    }
  }

  const displayName = selectedAgent
    ? selectedAgent.label || selectedAgent.name || selectedAgent.alias || 'Agent'
    : ''

  const isAvatarUrl = selectedAgent?.avatar &&
    (selectedAgent.avatar.startsWith('http://') || selectedAgent.avatar.startsWith('https://'))

  const initials = displayName
    .split(/[\s-_]+/)
    .map(word => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  return (
    <TerminalProvider>
      <div className="min-h-screen bg-gray-900 flex flex-col">
        {/* Header */}
        <header className="border-b border-gray-800 bg-gray-950 px-4 py-3 flex-shrink-0 z-10">
          <div className="flex items-center justify-between max-w-7xl mx-auto">
            <div className="flex items-center gap-4">
              <Link
                href="/"
                className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="text-sm">Back to Dashboard</span>
              </Link>
              <div className="h-4 w-px bg-gray-700" />
              <h1 className="text-lg font-semibold text-white">Zoom View</h1>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-400">
                {selectableAgents.length} agent{selectableAgents.length !== 1 ? 's' : ''}
              </span>
              <button
                onClick={refreshAgents}
                className="p-2 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition-colors"
                title="Refresh agents"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 p-6 overflow-auto">
          <div className="max-w-7xl mx-auto">
            {/* Loading State */}
            {loading && agents.length === 0 && (
              <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 text-violet-500 animate-spin" />
              </div>
            )}

            {/* Error State */}
            {error && (
              <div className="flex items-center justify-center h-64">
                <div className="text-center">
                  <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                  <p className="text-gray-400 mb-4">{error.message}</p>
                  <button
                    onClick={refreshAgents}
                    className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg transition-colors"
                  >
                    Try Again
                  </button>
                </div>
              </div>
            )}

            {/* Empty State */}
            {!loading && !error && selectableAgents.length === 0 && (
              <div className="flex items-center justify-center h-64">
                <div className="text-center">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gray-800 flex items-center justify-center">
                    <AlertCircle className="w-8 h-8 text-gray-500" />
                  </div>
                  <p className="text-gray-400 mb-2">No active agents</p>
                  <p className="text-sm text-gray-500">
                    Start an agent from the dashboard to see it here
                  </p>
                </div>
              </div>
            )}

            {/* Search Bar */}
            {selectableAgents.length > 0 && (
              <div className="mb-6">
                <div className="relative max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                  <input
                    type="text"
                    placeholder="Search agents by name, tags, or host..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-colors"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                {searchQuery && (
                  <p className="text-sm text-gray-500 mt-2">
                    Showing {filteredAgents.length} of {selectableAgents.length} agents
                  </p>
                )}
              </div>
            )}

            {/* No Search Results */}
            {searchQuery && filteredAgents.length === 0 && selectableAgents.length > 0 && (
              <div className="flex items-center justify-center h-48">
                <div className="text-center">
                  <Search className="w-12 h-12 text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-400 mb-2">No agents found</p>
                  <p className="text-sm text-gray-500">
                    Try a different search term
                  </p>
                </div>
              </div>
            )}

            {/* Agent Grid */}
            {filteredAgents.length > 0 && (
              <div className="zoom-grid">
                {filteredAgents.map(agent => {
                  const session = agentToSession(agent)
                  const isHibernated = agent.session?.status !== 'online' && (agent.sessions && agent.sessions.length > 0)

                  return (
                    <AgentCard
                      key={agent.id}
                      agent={agent}
                      session={session}
                      isFlipped={flippingCardId === agent.id}
                      isHibernated={isHibernated}
                      hasValidSession={hasValidTerminalSession(agent)}
                      unreadCount={unreadCounts[agent.id]}
                      onFlip={() => handleCardClick(agent.id)}
                      onClose={() => {}}
                      onPopOut={() => handlePopOut(agent)}
                      onShutdown={refreshAgents}
                      allAgents={onlineAgents}
                    />
                  )
                })}
              </div>
            )}
          </div>
        </main>

        {/* Footer */}
        <footer className="border-t border-gray-800 bg-gray-950 px-4 py-2 flex-shrink-0">
          <div className="flex flex-col md:flex-row justify-between items-center gap-1 md:gap-0 md:h-5">
            <p className="text-xs md:text-sm text-white leading-none">
              <VersionChecker /> • Made with <span className="text-red-500 text-lg inline-block scale-x-125">♥</span> in Boulder Colorado
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

        {/* Expanded Agent Modal */}
        {selectedAgent && selectedSession && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8"
            onClick={handleCloseModal}
          >
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />

            {/* Modal Content */}
            <div
              className="relative w-full max-w-6xl bg-gray-900 rounded-2xl border border-gray-700 shadow-2xl flex flex-col overflow-hidden zoom-modal-enter"
              style={{ height: 'calc(100vh - 4rem)', maxHeight: '90vh' }}
              onClick={e => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 flex-shrink-0">
                <div className="flex items-center gap-4">
                  {/* Avatar with status dot - sized for 3 rows */}
                  <div className="relative flex-shrink-0">
                    <div className={`w-16 h-16 rounded-xl flex items-center justify-center text-xl font-bold overflow-hidden ${
                      isSelectedHibernated
                        ? 'bg-yellow-900/30 text-yellow-400'
                        : 'bg-violet-600/30 text-violet-300'
                    }`}>
                      {isAvatarUrl ? (
                        <img
                          src={selectedAgent.avatar}
                          alt={displayName}
                          className="w-full h-full object-cover"
                        />
                      ) : selectedAgent.avatar ? (
                        <span className="text-3xl">{selectedAgent.avatar}</span>
                      ) : (
                        <span>{initials}</span>
                      )}
                    </div>
                    {/* Status dot */}
                    <span className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-gray-900 ${
                      isSelectedHibernated ? 'bg-yellow-400' : 'bg-green-400'
                    }`} />
                  </div>

                  {/* Agent Info - 3 rows */}
                  <div className="flex flex-col justify-center min-w-0 flex-1">
                    {/* Row 1: Display name + host */}
                    <h2 className="text-xl font-semibold text-white leading-none">
                      {displayName}
                      {selectedAgent.hostId && selectedAgent.hostId !== 'local' && (
                        <span className="font-normal text-white">@{selectedAgent.hostName || selectedAgent.hostId}</span>
                      )}
                    </h2>
                    {/* Row 2: Agent name and tags */}
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      {selectedAgent.label && selectedAgent.name && (
                        <span className="text-xs text-gray-400 font-mono">{selectedAgent.name}</span>
                      )}
                      {selectedAgent.tags && selectedAgent.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {selectedAgent.tags.map((tag, i) => (
                            <span
                              key={i}
                              className="px-2 py-0.5 text-xs bg-gray-700 text-gray-300 rounded-full whitespace-nowrap"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                      {/* Show placeholder if no name or tags */}
                      {!(selectedAgent.label && selectedAgent.name) && !(selectedAgent.tags && selectedAgent.tags.length > 0) && (
                        <span className="text-xs text-gray-600">—</span>
                      )}
                    </div>
                    {/* Row 3: Email addresses - always show */}
                    <div className="flex items-start gap-1.5 mt-1.5">
                      {selectedAgent.tools?.email?.addresses && selectedAgent.tools.email.addresses.length > 0 ? (
                        <>
                          <Mail className="w-3.5 h-3.5 text-blue-400 flex-shrink-0 mt-0.5" />
                          <span className="text-xs text-gray-400 font-mono">
                            {selectedAgent.tools.email.addresses.map(e => e.address).join(', ')}
                          </span>
                        </>
                      ) : (
                        <>
                          <Mail className="w-3.5 h-3.5 text-red-400/50 flex-shrink-0" />
                          <span className="text-xs text-gray-600">No email configured</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Actions - never shrink */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => handlePopOut(selectedAgent)}
                    className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg transition-colors text-sm"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Pop Out
                  </button>
                  <button
                    onClick={handleCloseModal}
                    className="p-2 rounded-lg hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
                    title="Close"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Modal Body - Full Agent View */}
              <div className="flex-1 min-h-0 overflow-hidden relative">
                <AgentCardView
                  agent={selectedAgent}
                  session={selectedSession}
                  isHibernated={isSelectedHibernated}
                  allAgents={onlineAgents}
                  onWake={async () => handleWake(selectedAgent)}
                  isWaking={false}
                  unreadCount={unreadCounts[selectedAgent.id] || 0}
                  onClose={handleCloseModal}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </TerminalProvider>
  )
}
