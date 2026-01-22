'use client'

import React from 'react'
import {
  MoreVertical,
  Terminal,
  Trash2,
  Edit3,
  MessageSquare,
  Moon,
  Sun,
  ExternalLink,
  Copy,
  Wifi,
} from 'lucide-react'
import { Agent, AgentSession } from '@/types/agent'
import { SessionActivityStatus } from '@/hooks/useSessionActivity'

interface AgentBadgeProps {
  agent: Agent
  isSelected: boolean
  isLocal: boolean
  activityStatus?: SessionActivityStatus
  onSelect: (agent: Agent) => void
  onRename?: (agent: Agent) => void
  onDelete?: (agent: Agent) => void
  onHibernate?: (agent: Agent) => void
  onWake?: (agent: Agent) => void
  onOpenTerminal?: (agent: Agent) => void
  onSendMessage?: (agent: Agent) => void
  onCopyId?: (agent: Agent) => void
  showActions?: boolean
}

// Generate a consistent unique avatar URL from agent ID using RandomUser.me
// RandomUser.me has 100 men + 100 women = 200 unique portraits
function getAvatarUrl(agentId: string): string {
  // Hash the agent ID to get a consistent number
  let hash = 0
  for (let i = 0; i < agentId.length; i++) {
    const char = agentId.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32-bit integer
  }

  // Use absolute value and mod to get index 0-99
  const index = Math.abs(hash) % 100

  // Alternate between men and women based on another bit of the hash
  const gender = (Math.abs(hash >> 8) % 2 === 0) ? 'men' : 'women'

  return `https://randomuser.me/api/portraits/${gender}/${index}.jpg`
}

// Generate a consistent color from a string (for avatar ring/fallback)
function stringToRingColor(str: string): string {
  const colors = [
    'ring-blue-500',
    'ring-emerald-500',
    'ring-violet-500',
    'ring-amber-500',
    'ring-rose-500',
    'ring-cyan-500',
    'ring-indigo-500',
    'ring-teal-500',
    'ring-orange-500',
    'ring-pink-500',
  ]

  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }

  return colors[Math.abs(hash) % colors.length]
}

// Check if string is an emoji
function isEmoji(str: string): boolean {
  return /\p{Emoji}/u.test(str)
}

// Get status info from agent state
function getStatusInfo(
  session: AgentSession | undefined,
  isHibernated: boolean,
  activityStatus?: SessionActivityStatus
): { color: string; bgColor: string; label: string; pulse?: boolean } {
  const isOnline = session?.status === 'online'

  if (isOnline) {
    if (activityStatus === 'waiting') {
      return { color: 'bg-amber-400', bgColor: 'bg-amber-400/20', label: 'Waiting', pulse: true }
    }
    if (activityStatus === 'active') {
      return { color: 'bg-green-400', bgColor: 'bg-green-400/20', label: 'Active', pulse: true }
    }
    return { color: 'bg-green-400', bgColor: 'bg-green-400/20', label: 'Idle' }
  }

  if (isHibernated) {
    return { color: 'bg-yellow-400', bgColor: 'bg-yellow-400/20', label: 'Hibernated' }
  }

  return { color: 'bg-slate-500', bgColor: 'bg-slate-500/20', label: 'Offline' }
}

export default function AgentBadge({
  agent,
  isSelected,
  isLocal,
  activityStatus,
  onSelect,
  onRename,
  onDelete,
  onHibernate,
  onWake,
  onOpenTerminal,
  onSendMessage,
  onCopyId,
  showActions = true,
}: AgentBadgeProps) {
  const [showMenu, setShowMenu] = React.useState(false)
  const menuRef = React.useRef<HTMLDivElement>(null)

  // Get the primary session
  const session = agent.sessions?.[0]
  const isOnline = session?.status === 'online'
  const isHibernated = !isOnline && agent.sessions && agent.sessions.length > 0

  const statusInfo = getStatusInfo(session, isHibernated, activityStatus)
  const ringColor = stringToRingColor(agent.name)
  const avatarUrl = getAvatarUrl(agent.id)
  const hasEmojiAvatar = agent.avatar ? isEmoji(agent.avatar) : false
  const [imageError, setImageError] = React.useState(false)

  // Close menu when clicking outside
  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false)
      }
    }

    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showMenu])

  const handleMenuAction = (action: () => void) => {
    action()
    setShowMenu(false)
  }

  return (
    <div
      onClick={() => onSelect(agent)}
      className={`
        relative group cursor-pointer
        rounded-xl border-2 transition-all duration-200
        hover:shadow-lg hover:scale-[1.02]
        ${isSelected
          ? 'border-blue-500 bg-blue-500/10 shadow-md shadow-blue-500/20'
          : 'border-slate-700/50 bg-slate-800/50 hover:border-slate-600'
        }
      `}
    >
      {/* Status indicator - top right corner */}
      <div className="absolute top-2 right-2 flex items-center gap-1.5">
        {/* Connection indicator */}
        {isLocal ? (
          <Wifi className="w-3 h-3 text-slate-500" />
        ) : (
          <ExternalLink className="w-3 h-3 text-slate-500" />
        )}

        {/* Status dot - larger with glow effect */}
        <div className="relative flex items-center justify-center" title={statusInfo.label}>
          {statusInfo.pulse && (
            <span className={`absolute w-4 h-4 rounded-full ${statusInfo.color} animate-ping opacity-50`} />
          )}
          <span
            className={`relative w-3.5 h-3.5 rounded-full ${statusInfo.color} ring-2 ring-slate-800`}
            style={{
              boxShadow: statusInfo.pulse
                ? `0 0 8px 2px ${statusInfo.color === 'bg-green-400' ? '#4ade80' : statusInfo.color === 'bg-amber-400' ? '#fbbf24' : '#64748b'}`
                : 'none'
            }}
          />
        </div>
      </div>

      {/* Actions menu - top left */}
      {showActions && (
        <div className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity" ref={menuRef}>
          <button
            onClick={(e) => {
              e.stopPropagation()
              setShowMenu(!showMenu)
            }}
            className="p-1 rounded-md bg-slate-700/50 hover:bg-slate-600 transition-colors"
          >
            <MoreVertical className="w-3.5 h-3.5 text-slate-400" />
          </button>

          {/* Dropdown menu */}
          {showMenu && (
            <div className="absolute left-0 top-full mt-1 w-40 py-1 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-50">
              {isOnline && onOpenTerminal && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleMenuAction(() => onOpenTerminal(agent))
                  }}
                  className="w-full px-3 py-1.5 text-left text-sm text-slate-300 hover:bg-slate-700 flex items-center gap-2"
                >
                  <Terminal className="w-3.5 h-3.5" />
                  Open Terminal
                </button>
              )}

              {onSendMessage && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleMenuAction(() => onSendMessage(agent))
                  }}
                  className="w-full px-3 py-1.5 text-left text-sm text-slate-300 hover:bg-slate-700 flex items-center gap-2"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  Send Message
                </button>
              )}

              {onRename && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleMenuAction(() => onRename(agent))
                  }}
                  className="w-full px-3 py-1.5 text-left text-sm text-slate-300 hover:bg-slate-700 flex items-center gap-2"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  Rename
                </button>
              )}

              {isHibernated && onWake && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleMenuAction(() => onWake(agent))
                  }}
                  className="w-full px-3 py-1.5 text-left text-sm text-slate-300 hover:bg-slate-700 flex items-center gap-2"
                >
                  <Sun className="w-3.5 h-3.5" />
                  Wake Agent
                </button>
              )}

              {isOnline && onHibernate && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleMenuAction(() => onHibernate(agent))
                  }}
                  className="w-full px-3 py-1.5 text-left text-sm text-slate-300 hover:bg-slate-700 flex items-center gap-2"
                >
                  <Moon className="w-3.5 h-3.5" />
                  Hibernate
                </button>
              )}

              {onCopyId && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleMenuAction(() => onCopyId(agent))
                  }}
                  className="w-full px-3 py-1.5 text-left text-sm text-slate-300 hover:bg-slate-700 flex items-center gap-2"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Copy ID
                </button>
              )}

              {onDelete && (
                <>
                  <div className="my-1 border-t border-slate-700" />
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleMenuAction(() => onDelete(agent))
                    }}
                    className="w-full px-3 py-1.5 text-left text-sm text-red-400 hover:bg-red-500/10 flex items-center gap-2"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Badge content */}
      <div className="p-3 pt-8 flex flex-col items-center text-center">
        {/* Avatar - Photo or Emoji */}
        <div
          className={`
            relative w-20 h-20 rounded-full overflow-hidden
            ring-4 ${ringColor} shadow-lg
            ${isHibernated ? 'opacity-50 grayscale' : ''}
          `}
        >
          {hasEmojiAvatar ? (
            <div className="w-full h-full bg-slate-700 flex items-center justify-center">
              <span className="text-4xl">{agent.avatar}</span>
            </div>
          ) : imageError ? (
            <div className="w-full h-full bg-gradient-to-br from-slate-600 to-slate-800 flex items-center justify-center">
              <span className="text-2xl font-bold text-white/70">
                {(agent.label || agent.name || '??').slice(0, 2).toUpperCase()}
              </span>
            </div>
          ) : (
            <img
              src={avatarUrl}
              alt={agent.label || agent.name}
              className="w-full h-full object-cover"
              onError={() => setImageError(true)}
            />
          )}
        </div>

        {/* Alias - Prominent display */}
        {(agent.label || agent.alias) && (
          <h3 className={`
            mt-3 font-bold text-base leading-tight
            ${isHibernated ? 'text-slate-500' : 'text-slate-100'}
          `}>
            {agent.label || agent.alias}
          </h3>
        )}

        {/* Full name and host - Secondary info */}
        <div className={`${(agent.label || agent.alias) ? 'mt-1' : 'mt-3'} w-full`}>
          <p className={`
            text-[11px] leading-tight
            ${isHibernated ? 'text-slate-600' : 'text-slate-400'}
          `}>
            {agent.name}
          </p>

          {agent.hostId && (
            <p className="text-[10px] text-slate-500 mt-0.5">
              @{agent.hostId}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
