'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import {
  Terminal,
  Mail,
  User,
  Brain,
  Moon,
  Power,
  Loader2,
  AlertTriangle
} from 'lucide-react'
import type { Agent } from '@/types/agent'
import type { Session } from '@/types/session'

// Dynamic imports for heavy components
const TerminalView = dynamic(
  () => import('@/components/TerminalView'),
  {
    ssr: false,
    loading: () => (
      <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
        <Loader2 className="w-6 h-6 text-violet-500 animate-spin" />
      </div>
    )
  }
)

const MessageCenter = dynamic(
  () => import('@/components/MessageCenter'),
  {
    ssr: false,
    loading: () => (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-violet-500 animate-spin" />
      </div>
    )
  }
)

const MemoryViewer = dynamic(
  () => import('@/components/MemoryViewer'),
  {
    ssr: false,
    loading: () => (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-violet-500 animate-spin" />
      </div>
    )
  }
)

type TabType = 'terminal' | 'messages' | 'profile' | 'memory'

interface AgentCardViewProps {
  agent: Agent
  session: Session
  isHibernated: boolean
  hasValidSession: boolean
  allAgents: Agent[]
  onWake: (e: React.MouseEvent) => Promise<void>
  isWaking: boolean
}

export default function AgentCardView({
  agent,
  session,
  isHibernated,
  hasValidSession,
  allAgents,
  onWake,
  isWaking
}: AgentCardViewProps) {
  const [activeTab, setActiveTab] = useState<TabType>('terminal')

  const tabs: { id: TabType; label: string; icon: React.ReactNode }[] = [
    { id: 'terminal', label: 'Terminal', icon: <Terminal className="w-4 h-4" /> },
    { id: 'messages', label: 'Messages', icon: <Mail className="w-4 h-4" /> },
    { id: 'profile', label: 'Profile', icon: <User className="w-4 h-4" /> },
    { id: 'memory', label: 'Memory', icon: <Brain className="w-4 h-4" /> },
  ]

  const displayName = agent.label || agent.name || agent.alias || 'Unnamed Agent'

  // Hibernated state view
  if (isHibernated) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-yellow-900/30 flex items-center justify-center">
            <Moon className="w-8 h-8 text-yellow-500" />
          </div>
          <p className="text-lg mb-2 text-gray-300">{displayName}</p>
          <p className="text-sm mb-4 text-gray-500">This agent is hibernating</p>
          <button
            onClick={onWake}
            disabled={isWaking}
            className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 mx-auto"
          >
            {isWaking ? (
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
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Tab Navigation */}
      <div className="flex border-b border-gray-700 flex-shrink-0 bg-gray-800/50">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-all ${
              activeTab === tab.id
                ? 'text-violet-400 border-b-2 border-violet-400 bg-gray-900/50'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content - Use relative positioning with absolute children */}
      <div className="flex-1 relative overflow-hidden">
        {/* Terminal Tab - Always mounted, visibility toggled */}
        <div
          className="absolute inset-0"
          style={{
            visibility: activeTab === 'terminal' ? 'visible' : 'hidden',
            pointerEvents: activeTab === 'terminal' ? 'auto' : 'none',
            zIndex: activeTab === 'terminal' ? 10 : 0
          }}
        >
          {hasValidSession ? (
            <TerminalView
              session={session}
              isVisible={activeTab === 'terminal'}
              hideFooter={true}
            />
          ) : (
            <div className="h-full flex flex-col items-center justify-center bg-gray-900 text-center p-6">
              <div className="w-16 h-16 rounded-full bg-yellow-900/30 flex items-center justify-center mb-4">
                <AlertTriangle className="w-8 h-8 text-yellow-500" />
              </div>
              <p className="text-lg font-medium text-gray-300 mb-2">No Active Terminal Session</p>
              <p className="text-sm text-gray-500 max-w-md">
                This agent does not have an active tmux session.
                The terminal will connect automatically when the agent starts running.
              </p>
            </div>
          )}
        </div>

        {/* Messages Tab */}
        <div
          className="absolute inset-0 overflow-auto"
          style={{
            visibility: activeTab === 'messages' ? 'visible' : 'hidden',
            pointerEvents: activeTab === 'messages' ? 'auto' : 'none',
            zIndex: activeTab === 'messages' ? 10 : 0
          }}
        >
          <MessageCenter
            sessionName={session.id}
            agentId={agent.id}
            allAgents={allAgents.map(a => ({
              id: a.id,
              name: a.name || a.alias || a.id,
              alias: a.label || a.name || a.alias || a.id,
              tmuxSessionName: a.session?.tmuxSessionName,
              hostId: a.hostId
            }))}
            isVisible={activeTab === 'messages'}
            hostUrl={agent.hostUrl}
          />
        </div>

        {/* Profile Tab */}
        <div
          className="absolute inset-0 overflow-auto p-6"
          style={{
            visibility: activeTab === 'profile' ? 'visible' : 'hidden',
            pointerEvents: activeTab === 'profile' ? 'auto' : 'none',
            zIndex: activeTab === 'profile' ? 10 : 0
          }}
        >
          <div className="space-y-6 max-w-2xl">
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wide font-medium">Name</label>
              <p className="text-white text-lg mt-1">{displayName}</p>
            </div>
            {agent.alias && (
              <div>
                <label className="text-xs text-gray-500 uppercase tracking-wide font-medium">Alias</label>
                <p className="text-white mt-1">{agent.alias}</p>
              </div>
            )}
            {agent.tags && agent.tags.length > 0 && (
              <div>
                <label className="text-xs text-gray-500 uppercase tracking-wide font-medium">Tags</label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {agent.tags.map((tag, i) => (
                    <span
                      key={i}
                      className="px-3 py-1 text-sm bg-gray-700 text-gray-300 rounded-full"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {session.workingDirectory && (
              <div>
                <label className="text-xs text-gray-500 uppercase tracking-wide font-medium">Working Directory</label>
                <p className="text-white text-sm font-mono mt-1 p-3 bg-gray-800 rounded-lg break-all">
                  {session.workingDirectory}
                </p>
              </div>
            )}
            {agent.documentation?.description && (
              <div>
                <label className="text-xs text-gray-500 uppercase tracking-wide font-medium">Description</label>
                <p className="text-gray-300 mt-1">{agent.documentation.description}</p>
              </div>
            )}
            {agent.hostId && (
              <div>
                <label className="text-xs text-gray-500 uppercase tracking-wide font-medium">Host</label>
                <p className="text-gray-400 mt-1">{agent.hostId}</p>
              </div>
            )}
            {agent.program && (
              <div>
                <label className="text-xs text-gray-500 uppercase tracking-wide font-medium">Program</label>
                <p className="text-gray-400 mt-1">{agent.program}</p>
              </div>
            )}
          </div>
        </div>

        {/* Memory Tab */}
        <div
          className="absolute inset-0 overflow-hidden"
          style={{
            visibility: activeTab === 'memory' ? 'visible' : 'hidden',
            pointerEvents: activeTab === 'memory' ? 'auto' : 'none',
            zIndex: activeTab === 'memory' ? 10 : 0
          }}
        >
          <MemoryViewer
            agentId={agent.id}
            hostUrl={agent.hostUrl}
            isVisible={activeTab === 'memory'}
          />
        </div>
      </div>
    </div>
  )
}
