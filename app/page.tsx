'use client'

import { useState, useEffect } from 'react'
import SessionList from '@/components/SessionList'
import TerminalView from '@/components/TerminalView'
import TerminalViewNew from '@/components/TerminalViewNew'
import ChatView from '@/components/ChatView'
import MessageCenter from '@/components/MessageCenter'
import WorkTree from '@/components/WorkTree'
import AgentGraph from '@/components/AgentGraph'
import Header from '@/components/Header'
import MobileDashboard from '@/components/MobileDashboard'
import AgentProfile from '@/components/AgentProfile'
import MigrationBanner from '@/components/MigrationBanner'
import OnboardingFlow from '@/components/onboarding/OnboardingFlow'
import { useSessions } from '@/hooks/useSessions'
import { TerminalProvider } from '@/contexts/TerminalContext'
import { Terminal, Mail, User, GitBranch, MessageSquare, Sparkles, Share2 } from 'lucide-react'

export default function DashboardPage() {
  const { sessions, loading, error, refreshSessions } = useSessions()
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [activeTab, setActiveTab] = useState<'terminal' | 'terminal-new' | 'chat' | 'messages' | 'worktree' | 'graph'>('terminal')
  const [unreadCount, setUnreadCount] = useState(0)
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(false)

  // Check for onboarding completion on mount
  useEffect(() => {
    const completed = localStorage.getItem('aimaestro-onboarding-completed')
    if (!completed) {
      setShowOnboarding(true)
    }
  }, [])

  // Read session from URL parameter on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const sessionParam = params.get('session')
    if (sessionParam) {
      setActiveSessionId(decodeURIComponent(sessionParam))
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

  // Initialize agent memories for all sessions on load (once per browser session)
  useEffect(() => {
    if (sessions.length === 0) return

    // Check if we've already initialized in this browser session
    const initKey = 'aimaestro-agents-initialized'
    const lastInit = sessionStorage.getItem(initKey)
    const now = Date.now()

    // Only initialize once per browser session, or if it's been more than 1 hour
    if (lastInit && (now - parseInt(lastInit)) < 3600000) {
      console.log('[Dashboard] Agent memories already initialized in this session')
      return
    }

    const initializeAgentMemories = async () => {
      // Get unique agent IDs
      const agentIds = new Set(
        sessions
          .map(s => s.agentId)
          .filter((id): id is string => id !== null && id !== undefined)
      )

      console.log(`[Dashboard] Initializing memory for ${agentIds.size} agents...`)

      // Initialize each agent's memory in parallel
      const initPromises = Array.from(agentIds).map(async (agentId) => {
        try {
          // Check if memory exists
          const checkResponse = await fetch(`/api/agents/${agentId}/memory`)
          const checkData = await checkResponse.json()

          // If no memory, initialize it
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

      // Mark as initialized for this browser session
      sessionStorage.setItem(initKey, now.toString())
      console.log('[Dashboard] Agent memory initialization complete')
    }

    initializeAgentMemories()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions.length]) // Only depend on length, not full sessions array

  // Fetch unread message count for active session
  useEffect(() => {
    if (!activeSessionId) return

    const fetchUnreadCount = async () => {
      try {
        const response = await fetch(`/api/messages?session=${encodeURIComponent(activeSessionId)}&action=unread-count`)
        if (response.ok) {
          const data = await response.json()
          setUnreadCount(data.count || 0)
        }
      } catch (error) {
        console.error('Failed to fetch unread count:', error)
      }
    }

    fetchUnreadCount()

    // Refresh every 10 seconds
    const interval = setInterval(fetchUnreadCount, 10000)
    return () => clearInterval(interval)
  }, [activeSessionId])

  const handleSessionSelect = (sessionId: string) => {
    setActiveSessionId(sessionId)
  }

  const toggleSidebar = () => {
    setSidebarCollapsed(!sidebarCollapsed)
  }

  const handleOnboardingComplete = () => {
    setShowOnboarding(false)
    // Refresh sessions to show any newly created session
    refreshSessions()
  }

  const handleOnboardingSkip = () => {
    localStorage.setItem('aimaestro-onboarding-completed', 'true')
    setShowOnboarding(false)
  }

  const activeSession = sessions.find((s) => s.id === activeSessionId)

  // Show onboarding flow if not completed
  if (showOnboarding) {
    return <OnboardingFlow onComplete={handleOnboardingComplete} onSkip={handleOnboardingSkip} />
  }

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

        {/* Migration Banner */}
        <MigrationBanner />

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
                    <div className="flex-1" />
                    {session.agentId && (
                      <button
                        onClick={() => setIsProfileOpen(true)}
                        className="flex items-center gap-2 px-6 py-3 text-sm font-medium transition-all duration-200 text-gray-400 hover:text-gray-300 hover:bg-gray-800/30"
                        title="View Agent Profile"
                      >
                        <User className="w-4 h-4" />
                        Agent Profile
                      </button>
                    )}
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
                        allSessions={sessions.map(s => s.id)}
                        isVisible={isActive && activeTab === 'messages'}
                      />
                    ) : activeTab === 'worktree' ? (
                      <WorkTree
                        sessionName={session.id}
                        agentId={session.agentId}
                        isVisible={isActive && activeTab === 'worktree'}
                      />
                    ) : (
                      <AgentGraph
                        sessionName={session.id}
                        agentId={session.agentId}
                        isVisible={isActive && activeTab === 'graph'}
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
            Version 0.11.1 • Made with <span className="text-red-500 text-lg inline-block scale-x-125">♥</span> in Boulder Colorado
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
      {activeSession?.agentId && (
        <AgentProfile
          isOpen={isProfileOpen}
          onClose={() => setIsProfileOpen(false)}
          agentId={activeSession.agentId}
        />
      )}
    </div>
    </TerminalProvider>
  )
}
