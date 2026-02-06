'use client'

import { useState, useEffect, useMemo, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useAgents } from '@/hooks/useAgents'
import { TerminalProvider } from '@/contexts/TerminalContext'
import { ArrowLeft, Loader2, AlertCircle, X } from 'lucide-react'
import { agentToSession } from '@/lib/agent-utils'
import type { Agent } from '@/types/agent'

// Dynamic import for AgentCardView
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

function ZoomAgentContent() {
  const searchParams = useSearchParams()
  const agentId = searchParams.get('id')
  const { agents, loading, error, onlineAgents } = useAgents()
  const [isWaking, setIsWaking] = useState(false)

  // Find the agent
  const agent = useMemo(() => {
    if (!agentId) return null
    return agents.find(a => a.id === agentId)
  }, [agents, agentId])

  const session = agent ? agentToSession(agent) : null
  const isHibernated = agent
    ? agent.session?.status !== 'online' && (agent.sessions && agent.sessions.length > 0)
    : false

  const displayName = agent
    ? agent.label || agent.name || agent.alias || 'Agent'
    : 'Agent'

  const isAvatarUrl = agent?.avatar &&
    (agent.avatar.startsWith('http://') || agent.avatar.startsWith('https://') || agent.avatar.startsWith('/'))

  const initials = displayName
    .split(/[\s-_]+/)
    .map(word => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  const handleWake = async () => {
    if (!agent || isWaking) return

    setIsWaking(true)
    try {
      const baseUrl = agent.hostUrl || ''
      await fetch(`${baseUrl}/api/agents/${agent.id}/wake`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ program: 'claude' }),
      })
    } catch (error) {
      console.error('Failed to wake agent:', error)
    } finally {
      setIsWaking(false)
    }
  }

  // Update window title
  useEffect(() => {
    if (agent) {
      document.title = `${displayName} - AI Maestro`
    }
  }, [agent, displayName])

  return (
    <TerminalProvider>
      <div className="fixed inset-0 bg-gray-900 flex flex-col">
        {/* Header */}
        <header className="border-b border-gray-800 bg-gray-950 px-4 py-3 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href="/zoom"
                className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="text-sm">Back to Zoom</span>
              </Link>

              {agent && (
                <>
                  <div className="h-4 w-px bg-gray-700" />

                  {/* Avatar */}
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold overflow-hidden ${
                    isHibernated
                      ? 'bg-yellow-900/30 text-yellow-400'
                      : 'bg-violet-600/30 text-violet-300'
                  }`}>
                    {isAvatarUrl ? (
                      <img
                        src={agent.avatar}
                        alt={displayName}
                        className="w-full h-full object-cover"
                      />
                    ) : agent.avatar ? (
                      <span className="text-xl">{agent.avatar}</span>
                    ) : (
                      <span>{initials}</span>
                    )}
                  </div>

                  {/* Agent Info */}
                  <div>
                    <h1 className="text-lg font-semibold text-white">{displayName}</h1>
                    {agent.tags && agent.tags.length > 0 && (
                      <p className="text-xs text-gray-400">{agent.tags.join(' / ')}</p>
                    )}
                  </div>

                  {/* Status Badge */}
                  <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs ${
                    isHibernated
                      ? 'bg-yellow-500/20 text-yellow-400'
                      : 'bg-green-500/20 text-green-400'
                  }`}>
                    <span className={`w-2 h-2 rounded-full ${isHibernated ? 'bg-yellow-400' : 'bg-green-400'}`} />
                    {isHibernated ? 'Hibernating' : 'Online'}
                  </div>
                </>
              )}
            </div>

            {/* Close button */}
            <button
              onClick={() => window.close()}
              className="p-2 rounded-lg hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
              title="Close window"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 min-h-0 relative overflow-hidden">
          {/* Loading State */}
          {loading && !agent && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="w-8 h-8 text-violet-500 animate-spin" />
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                <p className="text-gray-400">{error.message}</p>
              </div>
            </div>
          )}

          {/* No Agent Found */}
          {!loading && !error && !agent && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <AlertCircle className="w-12 h-12 text-gray-500 mx-auto mb-4" />
                <p className="text-gray-400 mb-2">Agent not found</p>
                <p className="text-sm text-gray-500">
                  The agent may have been removed or is no longer available.
                </p>
                <Link
                  href="/zoom"
                  className="mt-4 inline-block px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg transition-colors"
                >
                  Back to Zoom View
                </Link>
              </div>
            </div>
          )}

          {/* Agent Card View */}
          {agent && session && (
            <AgentCardView
              agent={agent}
              session={session}
              isHibernated={isHibernated}
              allAgents={onlineAgents}
              onWake={handleWake}
              isWaking={isWaking}
            />
          )}
        </main>
      </div>
    </TerminalProvider>
  )
}

// Wrapper with Suspense for useSearchParams
export default function ZoomAgentPage() {
  return (
    <Suspense fallback={
      <div className="fixed inset-0 bg-gray-900 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-violet-500 animate-spin" />
      </div>
    }>
      <ZoomAgentContent />
    </Suspense>
  )
}
