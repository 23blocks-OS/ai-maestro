'use client'

import { useState } from 'react'
import {
  Power,
  PowerOff,
  Loader2,
  Circle,
  Maximize2,
  Terminal,
  WifiOff,
  Mail,
  Inbox
} from 'lucide-react'
import type { Agent } from '@/types/agent'
import type { Session } from '@/types/session'

interface AgentCardProps {
  agent: Agent
  session: Session
  isFlipped: boolean
  isHibernated: boolean
  hasValidSession: boolean
  unreadCount?: number
  onFlip: () => void
  onClose: () => void
  onPopOut: () => void
  onShutdown?: () => void
  allAgents: Agent[]
}

export default function AgentCard({
  agent,
  isFlipped,
  isHibernated,
  hasValidSession,
  unreadCount = 0,
  onFlip,
  onShutdown,
}: AgentCardProps) {
  const [isWaking, setIsWaking] = useState(false)
  const [isShuttingDown, setIsShuttingDown] = useState(false)
  const [showEmailPopup, setShowEmailPopup] = useState(false)

  const displayName = agent.label || agent.name || agent.alias || 'Unnamed Agent'
  const initials = displayName
    .split(/[\s-_]+/)
    .map(word => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  // Check if avatar is a URL (image) or emoji/text
  const isAvatarUrl = agent.avatar && (agent.avatar.startsWith('http://') || agent.avatar.startsWith('https://') || agent.avatar.startsWith('/'))

  // Check if agent has email addresses
  const emailAddresses = agent.tools?.email?.addresses || []
  const hasEmail = emailAddresses.length > 0

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

  const handleShutdown = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (isShuttingDown) return

    setIsShuttingDown(true)
    try {
      const baseUrl = agent.hostUrl || ''
      // Use hibernate endpoint (shutdown doesn't exist)
      const response = await fetch(`${baseUrl}/api/agents/${agent.id}/hibernate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      if (!response.ok) {
        throw new Error('Failed to hibernate agent')
      }
      onShutdown?.()
    } catch (error) {
      console.error('Failed to hibernate agent:', error)
    } finally {
      setIsShuttingDown(false)
    }
  }

  const handleEmailClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (hasEmail) {
      setShowEmailPopup(!showEmailPopup)
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

        {/* Top Bar - Status & Icons */}
        <div className="absolute top-0 left-0 right-0 p-3 flex justify-between items-start z-10">
          <div className="flex items-center gap-2">
            {/* Power button - icon only */}
            {isHibernated ? (
              <button
                onClick={handleWake}
                disabled={isWaking}
                className="text-green-400 hover:text-green-300 disabled:text-green-600 transition-colors"
                title="Wake Agent"
              >
                {isWaking ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Power className="w-4 h-4" />
                )}
              </button>
            ) : (
              <button
                onClick={handleShutdown}
                disabled={isShuttingDown}
                className="text-red-400 hover:text-red-300 disabled:text-red-600 transition-colors"
                title="Hibernate Agent"
              >
                {isShuttingDown ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <PowerOff className="w-4 h-4" />
                )}
              </button>
            )}

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

          {/* Right side icons */}
          <div className="flex items-center gap-2">
            {/* Inbox - always show, with count if unread */}
            <div
              className={`relative ${unreadCount > 0 ? 'text-orange-400' : 'text-white/50'}`}
              title={unreadCount > 0 ? `${unreadCount} unread message${unreadCount > 1 ? 's' : ''}` : 'Inbox'}
            >
              <Inbox className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 text-[10px] font-bold text-white bg-orange-500 px-1 py-0.5 rounded-full min-w-[14px] text-center leading-none">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </div>

            {/* Expand icon hint - visible on hover */}
            <div className="p-2 rounded-lg bg-black/30 backdrop-blur-sm text-white/50 group-hover:text-white group-hover:bg-violet-600/50 transition-all">
              <Maximize2 className="w-4 h-4" />
            </div>
          </div>
        </div>

        {/* Bottom Bar - Agent Info */}
        <div className="absolute bottom-0 left-0 right-0 p-4 z-10">
          <div className="flex items-center gap-2">
            {/* Email icon before name */}
            {hasEmail && (
              <div className="relative flex items-center">
                <button
                  onClick={handleEmailClick}
                  className="p-0 flex items-center text-blue-400 hover:text-blue-300 transition-colors"
                  title="Show email addresses"
                >
                  <Mail className="w-5 h-5" />
                </button>

                {/* Email popup */}
                {showEmailPopup && (
                  <div
                    className="absolute bottom-8 left-0 bg-gray-900 border border-gray-700 rounded-lg p-3 shadow-xl min-w-[200px] z-20"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <p className="text-xs text-gray-400 mb-2">Email Addresses:</p>
                    {emailAddresses.map((email, i) => (
                      <p key={i} className="text-sm text-white font-mono truncate">
                        {email.address}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}

            <h3 className="text-lg font-semibold text-white truncate drop-shadow-lg leading-none">
              {displayName}
              {/* Show host inline for remote agents */}
              {agent.hostId && agent.hostId !== 'local' && (
                <span className="font-normal">@{agent.hostName || agent.hostId}</span>
              )}
            </h3>
          </div>

          {/* Show agent.name if we have both label and name (matching main dashboard) */}
          {agent.label && agent.name && (
            <p className="text-xs text-white/50 truncate font-mono">
              {agent.name}
            </p>
          )}

          {agent.tags && agent.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {agent.tags.map((tag, i) => (
                <span
                  key={i}
                  className="px-2 py-0.5 text-xs bg-white/20 text-white/90 rounded-full backdrop-blur-sm"
                >
                  {tag}
                </span>
              ))}
            </div>
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
