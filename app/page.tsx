'use client'

import { useState, useEffect, useMemo } from 'react'
import dynamic from 'next/dynamic'
import AgentList from '@/components/AgentList'
import TerminalView from '@/components/TerminalView'
import TerminalViewNew from '@/components/TerminalViewNew'
import ChatView from '@/components/ChatView'
import MessageCenter from '@/components/MessageCenter'
import WorkTree from '@/components/WorkTree'
import Header from '@/components/Header'
import MobileDashboard from '@/components/MobileDashboard'
import { AgentSubconsciousIndicator } from '@/components/AgentSubconsciousIndicator'
import MigrationBanner from '@/components/MigrationBanner'
import { VersionChecker } from '@/components/VersionChecker'
import AgentSearch from '@/components/AgentSearch'
import TranscriptExport from '@/components/TranscriptExport'
import AgentPlayback from '@/components/AgentPlayback'
import { useAgents } from '@/hooks/useAgents'
import { TerminalProvider } from '@/contexts/TerminalContext'
import { Terminal, Mail, User, GitBranch, MessageSquare, Sparkles, Share2, FileText, Moon, Power, Loader2, Brain, Plus, Search, Download, Play } from 'lucide-react'
import type { Agent } from '@/types/agent'
import type { Session } from '@/types/session'

// Dynamic imports for heavy components that are conditionally rendered
// This reduces initial bundle size by ~100KB+

// Only shown for first-time users
const OnboardingFlow = dynamic(
  () => import('@/components/onboarding/OnboardingFlow'),
  { ssr: false }
)

// Only shown when help button is clicked
const HelpPanel = dynamic(
  () => import('@/components/HelpPanel'),
  { ssr: false }
)

// Only shown when import button is clicked
const ImportAgentDialog = dynamic(
  () => import('@/components/ImportAgentDialog'),
  { ssr: false }
)

// Only shown when profile is opened
const AgentProfile = dynamic(
  () => import('@/components/AgentProfile'),
  { ssr: false }
)

// Heavy component with canvas/graph - only shown on memory tab
const MemoryViewer = dynamic(
  () => import('@/components/MemoryViewer'),
  { ssr: false }
)

// Heavy component using cytoscape - only shown on graph tab
const AgentGraph = dynamic(
  () => import('@/components/AgentGraph'),
  { ssr: false }
)

// Only shown when waking an agent
const WakeAgentDialog = dynamic(
  () => import('@/components/WakeAgentDialog'),
  { ssr: false }
)

// Only shown on docs tab
const DocumentationPanel = dynamic(
  () => import('@/components/DocumentationPanel'),
  { ssr: false }
)

// Helper: Convert agent to session-like object for TerminalView compatibility
function agentToSession(agent: Agent): Session {
  return {
    id: agent.session?.tmuxSessionName || agent.id,
    name: agent.label || agent.name || agent.alias || '',
    workingDirectory: agent.session?.workingDirectory || agent.preferences?.defaultWorkingDirectory || '',
    status: 'active' as const,
    createdAt: agent.createdAt,
    lastActivity: agent.lastActive || agent.createdAt,
    windows: 1,
    agentId: agent.id,
    hostId: agent.hostId,  // Now directly on agent
  }
}

export default function DashboardPage() {
  // Agent-centric: Primary hook is useAgents
  const { agents, stats: agentStats, loading: agentsLoading, error: agentsError, refreshAgents, onlineAgents } = useAgents()

  // PRIMARY STATE: Agent ID (no longer session-driven)
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    if (typeof window === 'undefined') return 320
    const saved = localStorage.getItem('sidebar-width')
    return saved ? parseInt(saved, 10) : 320
  })
  const [isResizing, setIsResizing] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [activeTab, setActiveTab] = useState<'terminal' | 'terminal-new' | 'chat' | 'messages' | 'worktree' | 'graph' | 'memory' | 'docs' | 'search' | 'export' | 'playback'>('terminal')
  const [unreadCount, setUnreadCount] = useState(0)
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const [profileAgent, setProfileAgent] = useState<Agent | null>(null)
  const [profileScrollToDangerZone, setProfileScrollToDangerZone] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [showImportDialog, setShowImportDialog] = useState(false)
  const [isHelpOpen, setIsHelpOpen] = useState(false)
  const [subconsciousRefreshTrigger, setSubconsciousRefreshTrigger] = useState(0)
  const [showSearchPanel, setShowSearchPanel] = useState(false)
  const [showExportDialog, setShowExportDialog] = useState(false)

  // Derive active agent from state
  const activeAgent = agents.find(a => a.id === activeAgentId) || null

  // Compute selectable agents: online + hibernated (offline with session config)
  const selectableAgents = useMemo(
    () => agents.filter(a => a.session?.status === 'online' || (a.sessions && a.sessions.length > 0)),
    [agents]
  )

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
      const agent = agents.find(a => a.session?.tmuxSessionName === decodeURIComponent(sessionParam))
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

  // Keyboard shortcuts for Phase 5 features
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle shortcuts when not in input fields
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return
      }

      // Ctrl/Cmd + E - Export
      if ((e.metaKey || e.ctrlKey) && e.key === 'e') {
        e.preventDefault()
        if (activeAgentId) {
          setShowExportDialog(true)
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [activeAgentId])

  // Sidebar resize handler
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return
      const minWidth = 320
      const maxWidth = Math.floor(window.innerWidth / 2)
      const newWidth = Math.min(Math.max(e.clientX, minWidth), maxWidth)
      setSidebarWidth(newWidth)
    }

    const handleMouseUp = () => {
      if (isResizing) {
        setIsResizing(false)
        localStorage.setItem('sidebar-width', sidebarWidth.toString())
      }
    }

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [isResizing, sidebarWidth])

  // Auto-select first online agent when agents load
  // Optimized: use derived primitives instead of full array dependency
  const firstOnlineAgentId = onlineAgents[0]?.id
  const hasOnlineAgents = onlineAgents.length > 0

  useEffect(() => {
    if (hasOnlineAgents && !activeAgentId && firstOnlineAgentId) {
      setActiveAgentId(firstOnlineAgentId)
    }
  }, [hasOnlineAgents, activeAgentId, firstOnlineAgentId])

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

    // Timeout for memory initialization - 15s for local, 20s for remote
    const INIT_TIMEOUT_LOCAL = 15000
    const INIT_TIMEOUT_REMOTE = 20000

    const initializeAgentMemories = async () => {
      console.log(`[Dashboard] Initializing memory for ${agents.length} agents...`)

      const initPromises = agents.map(async (agent) => {
        const baseUrl = agent.hostUrl || ''
        const timeout = baseUrl ? INIT_TIMEOUT_REMOTE : INIT_TIMEOUT_LOCAL
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), timeout)

        try {
          // Use agent's hostUrl to route to correct host for remote agents
          const checkResponse = await fetch(`${baseUrl}/api/agents/${agent.id}/memory`, {
            signal: controller.signal
          })
          clearTimeout(timeoutId)
          const checkData = await checkResponse.json()

          if (!checkData.success || (!checkData.sessions?.length && !checkData.projects?.length)) {
            console.log(`[Dashboard] Initializing memory for agent ${agent.id}`)
            const initController = new AbortController()
            const initTimeoutId = setTimeout(() => initController.abort(), timeout)
            await fetch(`${baseUrl}/api/agents/${agent.id}/memory`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ populateFromSessions: true }),
              signal: initController.signal
            })
            clearTimeout(initTimeoutId)
          }
          return { agent: agent.id, success: true }
        } catch (error) {
          clearTimeout(timeoutId)
          const errorMsg = error instanceof Error && error.name === 'AbortError'
            ? `Timed out after ${timeout / 1000}s`
            : error
          console.error(`[Dashboard] Failed to initialize agent ${agent.id}:`, errorMsg)
          return { agent: agent.id, success: false, error: errorMsg }
        }
      })

      // Use Promise.allSettled so one slow/failed agent doesn't block others
      const results = await Promise.allSettled(initPromises)
      const successful = results.filter(r => r.status === 'fulfilled' && r.value?.success).length
      console.log(`[Dashboard] Agent memory initialization complete: ${successful}/${agents.length} succeeded`)
      sessionStorage.setItem(initKey, now.toString())
    }

    initializeAgentMemories()
  }, [agents])

  // Fetch unread message count for active agent
  useEffect(() => {
    if (!activeAgentId || !activeAgent) return

    const fetchUnreadCount = async () => {
      try {
        // Use agent's hostUrl to route to the correct host for remote agents
        const baseUrl = activeAgent.hostUrl || ''
        const response = await fetch(`${baseUrl}/api/messages?agent=${encodeURIComponent(activeAgentId)}&action=unread-count`)
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
  }, [activeAgentId, activeAgent])

  // Agent-centric handlers
  const handleAgentSelect = (agent: Agent) => {
    // Can select any agent (online or offline)
    setActiveAgentId(agent.id)
    setIsProfileOpen(false)
  }

  const handleShowAgentProfile = (agent: Agent) => {
    // Also set active agent so main view reflects the selection
    setActiveAgentId(agent.id)
    setProfileAgent(agent)
    setProfileScrollToDangerZone(false)
    setIsProfileOpen(true)
  }

  const handleShowAgentProfileDangerZone = (agent: Agent) => {
    // Also set active agent so main view reflects the selection
    setActiveAgentId(agent.id)
    setProfileAgent(agent)
    setProfileScrollToDangerZone(true)
    setIsProfileOpen(true)
  }

  const handleDeleteAgent = async (agentId: string) => {
    try {
      // Use profileAgent's hostUrl to route to correct host for remote agents
      const baseUrl = profileAgent?.hostUrl || ''
      const response = await fetch(`${baseUrl}/api/agents/${agentId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to delete agent')
      }

      // Close profile panel
      setIsProfileOpen(false)
      setProfileAgent(null)
      setProfileScrollToDangerZone(false)

      // Clear active agent if it was the deleted one
      if (activeAgentId === agentId) {
        setActiveAgentId(null)
      }

      // Refresh agents list
      refreshAgents()

      // Trigger subconscious status refresh
      setSubconsciousRefreshTrigger(prev => prev + 1)
    } catch (error) {
      console.error('Failed to delete agent:', error)
      throw error // Re-throw so the dialog can handle it
    }
  }

  const handleStartSession = async (agent: Agent) => {
    try {
      // Use agent name as session name (new schema)
      const sessionName = agent.name || agent.alias || `${(agent.tags || []).join('-')}-unnamed`.replace(/^-/, '')
      const workingDirectory = agent.workingDirectory || agent.sessions?.[0]?.workingDirectory || agent.preferences?.defaultWorkingDirectory

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

  const [wakingAgentId, setWakingAgentId] = useState<string | null>(null)
  const [wakeDialogAgent, setWakeDialogAgent] = useState<Agent | null>(null)

  // Opens the wake dialog to select CLI
  const handleWakeAgent = (agent: Agent) => {
    if (wakingAgentId === agent.id) return
    setWakeDialogAgent(agent)
  }

  // Performs the actual wake with selected program
  const handleWakeConfirm = async (program: string) => {
    if (!wakeDialogAgent) return

    const agent = wakeDialogAgent

    // Close dialog immediately so UI isn't blocked
    setWakeDialogAgent(null)
    setWakingAgentId(agent.id)

    try {
      const baseUrl = agent.hostUrl || ''
      const response = await fetch(`${baseUrl}/api/agents/${agent.id}/wake`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ program }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to wake agent')
      }

      refreshAgents()
    } catch (error) {
      console.error('Failed to wake agent:', error)
      // Use setTimeout to ensure state updates happen first
      setTimeout(() => {
        alert(error instanceof Error ? error.message : 'Failed to wake agent')
      }, 0)
    } finally {
      setWakingAgentId(null)
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
          onOpenHelp={() => setIsHelpOpen(true)}
        />

        {/* Migration Banner */}
        <MigrationBanner />

        {/* Main Content Area */}
        <div className="flex flex-1 overflow-hidden relative">
          {/* Sidebar - Always AgentList now */}
          <aside
            className={`
              border-r border-sidebar-border bg-sidebar-bg overflow-hidden relative flex-shrink-0
              ${sidebarCollapsed ? 'w-0' : ''}
              ${isResizing ? '' : 'transition-all duration-300'}
            `}
            style={{ width: sidebarCollapsed ? 0 : sidebarWidth }}
          >
            <AgentList
              agents={agents}
              activeAgentId={activeAgentId}
              onAgentSelect={handleAgentSelect}
              onShowAgentProfile={handleShowAgentProfile}
              onShowAgentProfileDangerZone={handleShowAgentProfileDangerZone}
              onImportAgent={() => setShowImportDialog(true)}
              loading={agentsLoading}
              error={agentsError}
              onRefresh={refreshAgents}
              stats={agentStats}
              subconsciousRefreshTrigger={subconsciousRefreshTrigger}
              sidebarWidth={sidebarWidth}
            />
          </aside>

          {/* Resize Handle */}
          {!sidebarCollapsed && (
            <div
              className={`
                w-1 cursor-col-resize hover:bg-blue-500/50 active:bg-blue-500 transition-colors flex-shrink-0
                ${isResizing ? 'bg-blue-500' : 'bg-transparent hover:bg-blue-500/30'}
              `}
              onMouseDown={() => setIsResizing(true)}
              title="Drag to resize sidebar"
            />
          )}

          {/* Main Content */}
          <main className="flex-1 flex flex-col relative">
            {/* Empty State - shown when no agents */}
            {agents.length === 0 && !agentsLoading && (
              <div className="flex-1 flex items-center justify-center text-gray-400">
                <div className="text-center max-w-md">
                  <div className="relative mb-6">
                    <div className="w-20 h-20 mx-auto rounded-2xl bg-gradient-to-br from-green-500/20 to-emerald-600/20 flex items-center justify-center border border-green-500/30">
                      <User className="w-10 h-10 text-green-400" />
                    </div>
                    <div className="absolute -top-1 -right-1 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center animate-pulse">
                      <Plus className="w-4 h-4 text-white" />
                    </div>
                  </div>
                  <p className="text-xl mb-2 text-gray-200">Create your first agent</p>
                  <p className="text-sm text-gray-500 mb-1">
                    Click the <span className="text-green-400 font-medium">+</span> button in the sidebar to get started
                  </p>
                  <p className="text-xs text-gray-600">
                    Agents are AI assistants that help you code, debug, and build
                  </p>
                </div>
              </div>
            )}

            {/* Truly offline agent (no session config) - show profile prompt */}
            {activeAgent && activeAgent.session?.status === 'offline' && !(activeAgent.sessions && activeAgent.sessions.length > 0) && (
              <div className="flex-1 flex items-center justify-center text-gray-400">
                <div className="text-center max-w-md">
                  <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gray-800 flex items-center justify-center">
                    <User className="w-10 h-10 text-gray-500" />
                  </div>
                  <p className="text-xl mb-2 text-gray-300">{activeAgent.label || activeAgent.name || activeAgent.alias}</p>
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

            {/* All Selectable Agents (Online + Hibernated) Mounted as Tabs - toggle visibility with CSS */}
            {selectableAgents.map(agent => {
              const isActive = agent.id === activeAgentId
              const isHibernated = agent.session?.status !== 'online' && (agent.sessions && agent.sessions.length > 0)
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
                  {/* Tab Navigation - Responsive with flex-wrap */}
                  <div className="flex flex-wrap border-b border-gray-800 bg-gray-900 flex-shrink-0">
                    <button
                      onClick={() => setActiveTab('terminal')}
                      className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-all duration-200 ${
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
                      className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-all duration-200 ${
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
                      className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-all duration-200 ${
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
                      className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-all duration-200 ${
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
                      className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-all duration-200 ${
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
                      className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-all duration-200 ${
                        activeTab === 'graph'
                          ? 'text-blue-400 border-b-2 border-blue-400 bg-gray-800/50'
                          : 'text-gray-400 hover:text-gray-300 hover:bg-gray-800/30'
                      }`}
                    >
                      <Share2 className="w-4 h-4" />
                      Graph
                    </button>
                    <button
                      onClick={() => setActiveTab('memory')}
                      className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-all duration-200 ${
                        activeTab === 'memory'
                          ? 'text-blue-400 border-b-2 border-blue-400 bg-gray-800/50'
                          : 'text-gray-400 hover:text-gray-300 hover:bg-gray-800/30'
                      }`}
                    >
                      <Brain className="w-4 h-4" />
                      Memory
                    </button>
                    <button
                      onClick={() => setActiveTab('docs')}
                      className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-all duration-200 ${
                        activeTab === 'docs'
                          ? 'text-blue-400 border-b-2 border-blue-400 bg-gray-800/50'
                          : 'text-gray-400 hover:text-gray-300 hover:bg-gray-800/30'
                      }`}
                    >
                      <FileText className="w-4 h-4" />
                      Docs
                    </button>
                    <button
                      onClick={() => setActiveTab('search')}
                      className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-all duration-200 ${
                        activeTab === 'search'
                          ? 'text-blue-400 border-b-2 border-blue-400 bg-gray-800/50'
                          : 'text-gray-400 hover:text-gray-300 hover:bg-gray-800/30'
                      }`}
                      title="Search (Ctrl+K)"
                    >
                      <Search className="w-4 h-4" />
                      Search
                    </button>
                    <button
                      onClick={() => setActiveTab('playback')}
                      className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-all duration-200 ${
                        activeTab === 'playback'
                          ? 'text-blue-400 border-b-2 border-blue-400 bg-gray-800/50'
                          : 'text-gray-400 hover:text-gray-300 hover:bg-gray-800/30'
                      }`}
                      title="Playback"
                    >
                      <Play className="w-4 h-4" />
                      Playback
                    </button>
                    <button
                      onClick={() => setActiveTab('export')}
                      className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-all duration-200 ${
                        activeTab === 'export'
                          ? 'text-blue-400 border-b-2 border-blue-400 bg-gray-800/50'
                          : 'text-gray-400 hover:text-gray-300 hover:bg-gray-800/30'
                      }`}
                      title="Export (Ctrl+E)"
                    >
                      <Download className="w-4 h-4" />
                      Export
                    </button>
                    <div className="flex-1" />
                    <div className="flex items-center">
                      <AgentSubconsciousIndicator agentId={agent.id} hostUrl={agent.hostUrl} />
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
                      isHibernated ? (
                        <div className="flex-1 flex items-center justify-center text-gray-400">
                          <div className="text-center max-w-md">
                            <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-yellow-900/30 flex items-center justify-center">
                              <Moon className="w-10 h-10 text-yellow-500" />
                            </div>
                            <p className="text-xl mb-2 text-gray-300">{agent.label || agent.name || agent.alias}</p>
                            <p className="text-sm mb-4 text-gray-500">This agent is hibernating</p>
                            <button
                              onClick={() => handleWakeAgent(agent)}
                              disabled={wakingAgentId === agent.id}
                              className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 mx-auto"
                            >
                              {wakingAgentId === agent.id ? (
                                <>
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                  Waking...
                                </>
                              ) : (
                                <>
                                  <Power className="w-4 h-4" />
                                  Wake Agent
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <TerminalView session={session} isVisible={isActive && activeTab === 'terminal'} />
                      )
                    ) : activeTab === 'terminal-new' ? (
                      isHibernated ? (
                        <div className="flex-1 flex items-center justify-center text-gray-400">
                          <div className="text-center max-w-md">
                            <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-yellow-900/30 flex items-center justify-center">
                              <Moon className="w-10 h-10 text-yellow-500" />
                            </div>
                            <p className="text-xl mb-2 text-gray-300">{agent.label || agent.name || agent.alias}</p>
                            <p className="text-sm mb-4 text-gray-500">This agent is hibernating</p>
                            <button
                              onClick={() => handleWakeAgent(agent)}
                              disabled={wakingAgentId === agent.id}
                              className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 mx-auto"
                            >
                              {wakingAgentId === agent.id ? (
                                <>
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                  Waking...
                                </>
                              ) : (
                                <>
                                  <Power className="w-4 h-4" />
                                  Wake Agent
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <TerminalViewNew session={session} isVisible={isActive && activeTab === 'terminal-new'} />
                      )
                    ) : activeTab === 'chat' ? (
                      isHibernated ? (
                        <div className="flex-1 flex items-center justify-center text-gray-400">
                          <div className="text-center max-w-md">
                            <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-yellow-900/30 flex items-center justify-center">
                              <Moon className="w-10 h-10 text-yellow-500" />
                            </div>
                            <p className="text-xl mb-2 text-gray-300">{agent.label || agent.name || agent.alias}</p>
                            <p className="text-sm mb-4 text-gray-500">Wake this agent to use the chat interface</p>
                            <button
                              onClick={() => handleWakeAgent(agent)}
                              disabled={wakingAgentId === agent.id}
                              className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 mx-auto"
                            >
                              {wakingAgentId === agent.id ? (
                                <>
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                  Waking...
                                </>
                              ) : (
                                <>
                                  <Power className="w-4 h-4" />
                                  Wake Agent
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <ChatView agent={agent} isVisible={isActive && activeTab === 'chat'} />
                      )
                    ) : activeTab === 'messages' ? (
                      <MessageCenter
                        sessionName={session.id}
                        agentId={agent.id}
                        allAgents={onlineAgents.map(a => ({
                          id: a.id,
                          name: a.name || a.alias || a.id,  // Technical name for lookups
                          alias: a.label || a.name || a.alias || a.id,  // Display name for UI
                          tmuxSessionName: a.session?.tmuxSessionName,
                          hostId: a.hostId
                        }))}
                        isVisible={isActive && activeTab === 'messages'}
                        hostUrl={agent.hostUrl}
                      />
                    ) : activeTab === 'worktree' ? (
                      <WorkTree
                        sessionName={session.id}
                        agentId={agent.id}
                        agentAlias={agent.alias}
                        hostId={agent.hostId}
                        isVisible={isActive && activeTab === 'worktree'}
                      />
                    ) : activeTab === 'graph' ? (
                      <AgentGraph
                        sessionName={session.id}
                        agentId={agent.id}
                        isVisible={isActive && activeTab === 'graph'}
                        workingDirectory={session.workingDirectory}
                        hostUrl={agent.hostUrl}
                      />
                    ) : activeTab === 'memory' ? (
                      <MemoryViewer
                        agentId={agent.id}
                        hostUrl={agent.hostUrl}
                        isVisible={isActive && activeTab === 'memory'}
                      />
                    ) : activeTab === 'docs' ? (
                      <DocumentationPanel
                        sessionName={session.id}
                        agentId={agent.id}
                        isVisible={isActive && activeTab === 'docs'}
                        workingDirectory={session.workingDirectory}
                        hostUrl={agent.hostUrl}
                      />
                    ) : activeTab === 'search' ? (
                      <div className="flex-1 overflow-auto p-4">
                        <AgentSearch
                          agentId={agent.id}
                          agentName={agent.label || agent.name || agent.alias}
                          className="max-w-4xl mx-auto"
                        />
                      </div>
                    ) : activeTab === 'playback' ? (
                      <div className="flex-1 overflow-auto p-4">
                        <AgentPlayback
                          agentId={agent.id}
                          sessionId={session.id}
                          agentName={agent.label || agent.name || agent.alias}
                          className="max-w-4xl mx-auto"
                        />
                      </div>
                    ) : activeTab === 'export' ? (
                      <div className="flex-1 overflow-auto p-4">
                        <TranscriptExport
                          agentId={agent.id}
                          agentName={agent.label || agent.name || agent.alias}
                          className="max-w-4xl mx-auto"
                        />
                      </div>
                    ) : null}
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
              setProfileScrollToDangerZone(false)
            }}
            agentId={profileAgent.id}
            sessionStatus={profileAgent.session}
            onStartSession={() => handleStartSession(profileAgent)}
            onDeleteAgent={handleDeleteAgent}
            scrollToDangerZone={profileScrollToDangerZone}
            hostUrl={profileAgent.hostUrl}
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

        {/* Wake Agent Dialog */}
        <WakeAgentDialog
          isOpen={wakeDialogAgent !== null}
          onClose={() => setWakeDialogAgent(null)}
          onConfirm={handleWakeConfirm}
          agentName={wakeDialogAgent?.name || wakeDialogAgent?.id || ''}
          agentAlias={wakeDialogAgent?.alias}
        />

        {/* Help Panel */}
        <HelpPanel
          isOpen={isHelpOpen}
          onClose={() => setIsHelpOpen(false)}
        />
      </div>
    </TerminalProvider>
  )
}
