'use client'

import { useState } from 'react'
import {
  Power,
  Loader2,
  Circle,
  Maximize2,
  Terminal,
  WifiOff
} from 'lucide-react'
import type { Agent } from '@/types/agent'
import type { Session } from '@/types/session'

interface AgentCardProps {
  agent: Agent
  session: Session
  isFlipped: boolean
  isHibernated: boolean
  hasValidSession: boolean
  onFlip: () => void
  onClose: () => void
  onPopOut: () => void
  allAgents: Agent[]
}

export default function AgentCard({
  agent,
  isFlipped,
  isHibernated,
  hasValidSession,
  onFlip,
}: AgentCardProps) {
  const [isWaking, setIsWaking] = useState(false)

  const displayName = agent.label || agent.name || agent.alias || 'Unnamed Agent'
  const initials = displayName
    .split(/[\s-_]+/)
    .map(word => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  // Check if avatar is a URL (image) or emoji/text
  const isAvatarUrl = agent.avatar && (agent.avatar.startsWith('http://') || agent.avatar.startsWith('https://'))

  const handleWake = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (isWaking) return

    setIsWaking(true)
    try {
      const baseUrl = agent.hostUrl || ''
      const response = await fetch(`${baseUrl}/api/agents/${agent.id}/wake`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ program: 'claude' }),
      })

      if (!response.ok) {
        throw new Error('Failed to wake agent')
      }
    } catch (error) {
      console.error('Failed to wake agent:', error)
    } finally {
      setIsWaking(false)
    }
  }

  return (
    <div
      className={`zoom-card-container cursor-pointer group ${isFlipped ? 'is-flipped' : ''}`}
      onClick={onFlip}
    >
      {/* Front Face */}
      <div className="zoom-card-face zoom-card-front h-full transition-all duration-300 group-hover:scale-[1.02] relative overflow-hidden">
        {/* Full-size Avatar Background (like Zoom video) */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className={`w-full h-full flex items-center justify-center ${
            isHibernated
              ? 'bg-gradient-to-br from-yellow-900/40 to-amber-950/60'
              : 'bg-gradient-to-br from-violet-900/40 to-purple-950/60'
          }`}>
            {isAvatarUrl ? (
              <img
                src={agent.avatar}
                alt={displayName}
                className="w-full h-full object-cover"
              />
            ) : agent.avatar ? (
              <span className="text-[8rem] leading-none opacity-90">{agent.avatar}</span>
            ) : (
              <span className={`text-[6rem] font-bold opacity-30 ${
                isHibernated ? 'text-yellow-400' : 'text-violet-300'
              }`}>
                {initials}
              </span>
            )}
          </div>
        </div>

        {/* Overlay gradient for text readability */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/40" />

        {/* Top Bar - Status & Expand Hint */}
        <div className="absolute top-0 left-0 right-0 p-3 flex justify-between items-start z-10">
          <div className="flex items-center gap-2">
            {/* Online/Hibernating Status */}
            <div className={`flex items-center gap-2 px-2 py-1 rounded-full text-xs backdrop-blur-sm ${
              isHibernated
                ? 'bg-yellow-500/30 text-yellow-300'
                : 'bg-green-500/30 text-green-300'
            }`}>
              <Circle className={`w-2 h-2 fill-current ${!isHibernated ? 'status-online' : ''}`} />
              {isHibernated ? 'Hibernating' : 'Online'}
            </div>

            {/* Terminal Session Status */}
            <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs backdrop-blur-sm ${
              hasValidSession
                ? 'bg-violet-500/30 text-violet-300'
                : 'bg-gray-500/30 text-gray-400'
            }`}>
              {hasValidSession ? (
                <>
                  <Terminal className="w-3 h-3" />
                  <span>Terminal</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-3 h-3" />
                  <span>No Session</span>
                </>
              )}
            </div>
          </div>

          {/* Expand icon hint - visible on hover */}
          <div className="p-2 rounded-lg bg-black/30 backdrop-blur-sm text-white/50 group-hover:text-white group-hover:bg-violet-600/50 transition-all">
            <Maximize2 className="w-4 h-4" />
          </div>
        </div>

        {/* Bottom Bar - Agent Info */}
        <div className="absolute bottom-0 left-0 right-0 p-4 z-10">
          <h3 className="text-lg font-semibold text-white truncate drop-shadow-lg">
            {displayName}
          </h3>
          {agent.tags && agent.tags.length > 0 && (
            <p className="text-sm text-white/70 truncate mt-0.5">
              {agent.tags.join(' / ')}
            </p>
          )}

          {/* Wake Button for Hibernated */}
          {isHibernated && (
            <button
              onClick={handleWake}
              disabled={isWaking}
              className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 disabled:bg-green-800 disabled:cursor-not-allowed text-white rounded-lg transition-colors text-sm font-medium"
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
          )}

          {/* Click Hint */}
          {!isHibernated && (
            <p className="text-xs text-white/50 mt-2 group-hover:text-violet-300 transition-colors">
              Click to expand
            </p>
          )}
        </div>
      </div>

      {/* Back Face - "Getting Ready" */}
      <div className="zoom-card-face zoom-card-back h-full flex flex-col items-center justify-center bg-gradient-to-br from-violet-900 to-purple-950 rounded-xl">
        <div className="w-20 h-20 mb-4 rounded-full bg-violet-600/30 flex items-center justify-center">
          <Loader2 className="w-10 h-10 text-violet-400 animate-spin" />
        </div>
        <p className="text-lg font-medium text-white">Getting Ready...</p>
        <p className="text-sm text-violet-300 mt-1">{displayName}</p>
      </div>
    </div>
  )
}
