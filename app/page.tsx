'use client'

import { useState, useEffect } from 'react'
import AgentList from '@/components/AgentList'
import TerminalView from '@/components/TerminalView'
import TerminalViewNew from '@/components/TerminalViewNew'
import ChatView from '@/components/ChatView'
import MessageCenter from '@/components/MessageCenter'
import WorkTree from '@/components/WorkTree'
import AgentGraph from '@/components/AgentGraph'
import DocumentationPanel from '@/components/DocumentationPanel'
import Header from '@/components/Header'
import MobileDashboard from '@/components/MobileDashboard'
import AgentProfile from '@/components/AgentProfile'
import { AgentSubconsciousIndicator } from '@/components/AgentSubconsciousIndicator'
import MigrationBanner from '@/components/MigrationBanner'
import OnboardingFlow from '@/components/onboarding/OnboardingFlow'
import { VersionChecker } from '@/components/VersionChecker'
import { useAgents } from '@/hooks/useAgents'
import { TerminalProvider } from '@/contexts/TerminalContext'
import { Terminal, Mail, User, GitBranch, MessageSquare, Sparkles, Share2, FileText } from 'lucide-react'
import ImportAgentDialog from '@/components/ImportAgentDialog'
import type { UnifiedAgent } from '@/types/agent'
import type { Session } from '@/types/session'

// Helper: Convert agent to session-like object for TerminalView compatibility
function agentToSession(agent: UnifiedAgent): Session {
  return {
    id: agent.session.tmuxSessionName || agent.id,
    name: agent.displayName || agent.alias,
    workingDirectory: agent.session.workingDirectory || agent.preferences?.defaultWorkingDirectory || '',
    status: 'active' as const,
    createdAt: agent.createdAt,
    lastActivity: agent.lastActive || agent.createdAt,
    windows: 1,
    agentId: agent.id,
    hostId: agent.session.hostId,
  }
}

export default function DashboardPage() {
  // Agent-centric: Primary hook is useAgents
  const { agents, stats: agentStats, loading: agentsLoading, error: agentsError, refreshAgents, onlineAgents } = useAgents()

  // PRIMARY STATE: Agent ID (no longer session-driven)
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [activeTab, setActiveTab] = useState<'terminal' | 'terminal-new' | 'chat' | 'messages' | 'worktree' | 'graph' | 'docs'>('terminal')
  const [unreadCount, setUnreadCount] = useState(0)
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const [profileAgent, setProfileAgent] = useState<UnifiedAgent | null>(null)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [showImportDialog, setShowImportDialog] = useState(false)

  // Derive active agent from state
  const activeAgent = agents.find(a => a.id === activeAgentId) || null

  // Check for onboarding completion on mount
  useEffect(() => {
    const completed = localStorage.getItem('aimaestro-onboarding-completed')
    if (!completed) {
      setShowOnboarding(true)
    }
  }, [])

  // Read agent from URL parameter on mount (changed from ?session= to ?agent=)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const agentParam = params.get('agent')
    if (agentParam) {
      setActiveAgentId(decodeURIComponent(agentParam))
    }
    // Also support legacy ?session= param for backwards compatibility
    const sessionParam = params.get('session')
    if (sessionParam && !agentParam) {
      // Find agent by session name
      const agent = agents.find(a => a.session.tmuxSessionName === decodeURIComponent(sessionParam))
      if (agent) {
        setActiveAgentId(agent.id)
      }
    }
  }, [agents])

  // Detect mobile screen size
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
      if (window.innerWidth < 768) {
        setSidebarCollapsed(true)
      }
    }

    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Auto-select first online agent when agents load
  useEffect(() => {
    if (onlineAgents.length > 0 && !activeAgentId) {
      setActiveAgentId(onlineAgents[0].id)
    }
  }, [onlineAgents, activeAgentId])

  // Initialize agent memories for all agents on load
  useEffect(() => {
    if (agents.length === 0) return

    const initKey = 'aimaestro-agents-initialized'
    const lastInit = sessionStorage.getItem(initKey)
    const now = Date.now()

    if (lastInit && (now - parseInt(lastInit)) < 3600000) {
      console.log('[Dashboard] Agent memories already initialized in this session')
      return
    }

    const initializeAgentMemories = async () => {
      const agentIds = agents.map(a => a.id)
      console.log(`[Dashboard] Initializing memory for ${agentIds.length} agents...`)

      const initPromises = agentIds.map(async (agentId) => {
        try {
          const checkResponse = await fetch(`/api/agents/${agentId}/memory`)
          const checkData = await checkResponse.json()

          if (!checkData.success || (!checkData.sessions?.length && !checkData.projects?.length)) {
            console.log(`[Dashboard] Initializing memory for agent ${agentId}`)
            await fetch(`/api/agents/${agentId}/memory`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ populateFromSessions: true })
            })
          }
        } catch (error) {
          console.error(`[Dashboard] Failed to initialize agent ${agentId}:`, error)
        }
      })

      await Promise.all(initPromises)
      sessionStorage.setItem(initKey, now.toString())
      console.log('[Dashboard] Agent memory initialization complete')
    }

    initializeAgentMemories()
  }, [agents.length])

  // Fetch unread message count for active agent
  useEffect(() => {
    if (!activeAgentId) return

    const fetchUnreadCount = async () => {
      try {
        // Now fetching by agent ID, not session name
        const response = await fetch(`/api/messages?agentId=${encodeURIComponent(activeAgentId)}&action=unread-count`)
        if (response.ok) {
          const data = await response.json()
          setUnreadCount(data.count || 0)
        }
      } catch (error) {
        console.error('Failed to fetch unread count:', error)
      }
    }

    fetchUnreadCount()
    const interval = setInterval(fetchUnreadCount, 10000)
    return () => clearInterval(interval)
  }, [activeAgentId])

  // Agent-centric handlers
  const handleAgentSelect = (agent: UnifiedAgent) => {
    // Can select any agent (online or offline)
    setActiveAgentId(agent.id)
    setIsProfileOpen(false)
  }

  const handleShowAgentProfile = (agent: UnifiedAgent) => {
    setProfileAgent(agent)
    setIsProfileOpen(true)
  }

  const handleStartSession = async (agent: UnifiedAgent) => {
    try {
      const sessionName = agent.tools.session?.tmuxSessionName || `${(agent.tags || []).join('-')}-${agent.alias}`.replace(/^-/, '')
      const workingDirectory = agent.tools.session?.workingDirectory || agent.preferences?.defaultWorkingDirectory

      const response = await fetch('/api/sessions/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: sessionName,
          workingDirectory,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to create session')
      }

      setIsProfileOpen(false)
      setProfileAgent(null)
      refreshAgents()

      // Select the agent after session starts
      setTimeout(() => {
        setActiveAgentId(agent.id)
      }, 500)
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to start session')
    }
  }

  const toggleSidebar = () => {
    setSidebarCollapsed(!sidebarCollapsed)
  }

  const handleOnboardingComplete = () => {
    setShowOnboarding(false)
    refreshAgents()
  }

  const handleOnboardingSkip = () => {
    localStorage.setItem('aimaestro-onboarding-completed', 'true')
    setShowOnboarding(false)
  }

  // Show onboarding flow if not completed
  if (showOnboarding) {
    return <OnboardingFlow onComplete={handleOnboardingComplete} onSkip={handleOnboardingSkip} />
  }

  // Render mobile-specific dashboard for small screens
  // Agent-centric: MobileDashboard now accepts agents directly
  if (isMobile) {
    return (
      <TerminalProvider key="mobile-dashboard">
        <MobileDashboard
          agents={agents}
          loading={agentsLoading}
          error={agentsError?.message || null}
          onRefresh={refreshAgents}
        />
      </TerminalProvider>
    )
  }

  // Desktop dashboard - AGENT-CENTRIC
  return (
    <TerminalProvider key="desktop-dashboard">
      <div className="flex flex-col h-screen bg-gray-900" style={{ overflow: 'hidden', position: 'fixed', inset: 0 }}>
        {/* Header */}
        <Header
          onToggleSidebar={toggleSidebar}
          sidebarCollapsed={sidebarCollapsed}
          activeAgentId={activeAgentId}
          onImportAgent={() => setShowImportDialog(true)}
        />

        {/* Migration Banner */}
        <MigrationBanner />

        {/* Main Content Area */}
        <div className="flex flex-1 overflow-hidden relative">
          {/* Sidebar - Always AgentList now */}
          <aside className={`
            border-r border-sidebar-border bg-sidebar-bg transition-all duration-300 overflow-hidden relative
            ${sidebarCollapsed ? 'w-0' : 'w-80'}
          `}>
            <AgentList
              agents={agents}
              activeAgentId={activeAgentId}
              onAgentSelect={handleAgentSelect}
              onShowAgentProfile={handleShowAgentProfile}
              loading={agentsLoading}
              error={agentsError}
              onRefresh={refreshAgents}
              stats={agentStats}
            />
          </aside>

          {/* Main Content */}
          <main className="flex-1 flex flex-col relative">
            {/* Empty State - shown when no agents */}
            {agents.length === 0 && !agentsLoading && (
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
                  <p className="text-xl mb-2">No agents found</p>
                  <p className="text-sm">
                    Create a tmux session with Claude Code to get started
                  </p>
                </div>
              </div>
            )}

            {/* Offline agent selected - show profile prompt */}
            {activeAgent && activeAgent.session.status === 'offline' && (
              <div className="flex-1 flex items-center justify-center text-gray-400">
                <div className="text-center max-w-md">
                  <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gray-800 flex items-center justify-center">
                    <User className="w-10 h-10 text-gray-500" />
                  </div>
                  <p className="text-xl mb-2 text-gray-300">{activeAgent.displayName || activeAgent.alias}</p>
                  <p className="text-sm mb-4 text-gray-500">This agent is offline</p>
                  <button
                    onClick={() => handleStartSession(activeAgent)}
                    className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-all"
                  >
                    Start Session
                  </button>
                  <button
                    onClick={() => handleShowAgentProfile(activeAgent)}
                    className="ml-3 px-6 py-3 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-all"
                  >
                    View Profile
                  </button>
                </div>
              </div>
            )}

            {/* All Online Agents Mounted as Tabs - toggle visibility with CSS */}
            {onlineAgents.map(agent => {
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
                      onClick={() => setActiveTab('terminal-new')}
                      className={`flex items-center gap-2 px-6 py-3 text-sm font-medium transition-all duration-200 ${
                        activeTab === 'terminal-new'
                          ? 'text-blue-400 border-b-2 border-blue-400 bg-gray-800/50'
                          : 'text-gray-400 hover:text-gray-300 hover:bg-gray-800/30'
                      }`}
                    >
                      <Sparkles className="w-4 h-4" />
                      Terminal New
                    </button>
                    <button
                      onClick={() => setActiveTab('chat')}
                      className={`flex items-center gap-2 px-6 py-3 text-sm font-medium transition-all duration-200 ${
                        activeTab === 'chat'
                          ? 'text-blue-400 border-b-2 border-blue-400 bg-gray-800/50'
                          : 'text-gray-400 hover:text-gray-300 hover:bg-gray-800/30'
                      }`}
                    >
                      <MessageSquare className="w-4 h-4" />
                      Chat
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
                      {unreadCount > 0 && (
                        <span className="ml-1.5 bg-blue-500/90 text-white text-[10px] font-semibold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1.5">
                          {unreadCount > 99 ? '99+' : unreadCount}
                        </span>
                      )}
                    </button>
                    <button
                      onClick={() => setActiveTab('worktree')}
                      className={`flex items-center gap-2 px-6 py-3 text-sm font-medium transition-all duration-200 ${
                        activeTab === 'worktree'
                          ? 'text-blue-400 border-b-2 border-blue-400 bg-gray-800/50'
                          : 'text-gray-400 hover:text-gray-300 hover:bg-gray-800/30'
                      }`}
                    >
                      <GitBranch className="w-4 h-4" />
                      WorkTree
                    </button>
                    <button
                      onClick={() => setActiveTab('graph')}
                      className={`flex items-center gap-2 px-6 py-3 text-sm font-medium transition-all duration-200 ${
                        activeTab === 'graph'
                          ? 'text-blue-400 border-b-2 border-blue-400 bg-gray-800/50'
                          : 'text-gray-400 hover:text-gray-300 hover:bg-gray-800/30'
                      }`}
                    >
                      <Share2 className="w-4 h-4" />
                      Graph
                    </button>
                    <button
                      onClick={() => setActiveTab('docs')}
                      className={`flex items-center gap-2 px-6 py-3 text-sm font-medium transition-all duration-200 ${
                        activeTab === 'docs'
                          ? 'text-blue-400 border-b-2 border-blue-400 bg-gray-800/50'
                          : 'text-gray-400 hover:text-gray-300 hover:bg-gray-800/30'
                      }`}
                    >
                      <FileText className="w-4 h-4" />
                      Docs
                    </button>
                    <div className="flex-1" />
                    <div className="flex items-center">
                      <AgentSubconsciousIndicator agentId={agent.id} />
                      <button
                        onClick={() => handleShowAgentProfile(agent)}
                        className="flex items-center gap-2 px-6 py-3 text-sm font-medium transition-all duration-200 text-gray-400 hover:text-gray-300 hover:bg-gray-800/30"
                        title="View Agent Profile"
                      >
                        <User className="w-4 h-4" />
                        Agent Profile
                      </button>
                    </div>
                  </div>

                  {/* Tab Content */}
                  <div className="flex-1 flex overflow-hidden min-h-0">
                    {activeTab === 'terminal' ? (
                      <TerminalView session={session} isVisible={isActive} />
                    ) : activeTab === 'terminal-new' ? (
                      <TerminalViewNew session={session} isVisible={isActive && activeTab === 'terminal-new'} />
                    ) : activeTab === 'chat' ? (
                      <ChatView session={session} isVisible={isActive && activeTab === 'chat'} />
                    ) : activeTab === 'messages' ? (
                      <MessageCenter
                        sessionName={session.id}
                        agentId={agent.id}
                        allAgents={onlineAgents.map(a => ({
                          id: a.id,
                          alias: a.displayName || a.alias || a.id,
                          tmuxSessionName: a.session.tmuxSessionName
                        }))}
                        isVisible={isActive && activeTab === 'messages'}
                      />
                    ) : activeTab === 'worktree' ? (
                      <WorkTree
                        sessionName={session.id}
                        agentId={agent.id}
                        hostId={agent.session.hostId}
                        isVisible={isActive && activeTab === 'worktree'}
                      />
                    ) : activeTab === 'graph' ? (
                      <AgentGraph
                        sessionName={session.id}
                        agentId={agent.id}
                        isVisible={isActive && activeTab === 'graph'}
                        workingDirectory={session.workingDirectory}
                      />
                    ) : (
                      <DocumentationPanel
                        sessionName={session.id}
                        agentId={agent.id}
                        isVisible={isActive && activeTab === 'docs'}
                        workingDirectory={session.workingDirectory}
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

        {/* Agent Profile Panel */}
        {profileAgent && (
          <AgentProfile
            isOpen={isProfileOpen}
            onClose={() => {
              setIsProfileOpen(false)
              setProfileAgent(null)
            }}
            agentId={profileAgent.id}
            sessionStatus={profileAgent.session}
            onStartSession={() => handleStartSession(profileAgent)}
          />
        )}

        {/* Import Agent Dialog */}
        <ImportAgentDialog
          isOpen={showImportDialog}
          onClose={() => setShowImportDialog(false)}
          onImportComplete={() => {
            setShowImportDialog(false)
            refreshAgents()
          }}
        />
      </div>
    </TerminalProvider>
  )
}
