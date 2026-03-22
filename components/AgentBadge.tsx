'use client'

import React from 'react'
import {
  MoreVertical,
  Terminal,
  Trash2,
  Edit3,
  MessageSquare,
  Moon,
  Power,
  Copy,
  Mail,
  Box,
} from 'lucide-react'
import { Agent } from '@/types/agent'
import { SessionActivityStatus } from '@/hooks/useSessionActivity'

interface AgentBadgeProps {
  agent: Agent
  isSelected: boolean
  activityStatus?: SessionActivityStatus
  unreadCount?: number
  onSelect: (agent: Agent) => void
  onRename?: (agent: Agent) => void
  onDelete?: (agent: Agent) => void
  onHibernate?: (agent: Agent) => void
  onWake?: (agent: Agent) => void
  onOpenTerminal?: (agent: Agent) => void
  onSendMessage?: (agent: Agent) => void
  onCopyId?: (agent: Agent) => void
  showActions?: boolean
  /** 'normal' = full-image card, 'compact' = circle avatar card (default) */
  variant?: 'normal' | 'compact'
}

// Generate a consistent unique avatar URL from agent ID using RandomUser.me
// RandomUser.me has 100 men + 100 women = 200 unique portraits
function getAvatarUrl(agentId: string): string {
  // Guard against empty IDs — fallback to a deterministic default rather than
  // mapping every empty-id agent to the same hash-0 avatar.
  if (!agentId) return '/avatars/men_00.jpg'

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

  return `/avatars/${gender}_${index.toString().padStart(2, '0')}.jpg`
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

// Check if string is an emoji (not a URL or other text)
// Note: \p{Emoji} and \p{Extended_Pictographic} both match digit characters (0-9),
// so we need an explicit guard to prevent single digits from being treated as emojis.
function isEmoji(str: string): boolean {
  // Emojis are short (1-8 chars with modifiers) and don't start with http or /
  if (!str || str.length > 8 || str.startsWith('http') || str.startsWith('/')) return false
  // Explicitly exclude lone digit characters — \p{Extended_Pictographic} covers keycap
  // sequences like "1️⃣" which are multi-char, so a single digit is never a real emoji.
  if (str.length === 1 && /\d/.test(str)) return false
  // Match actual emoji presentations, not just emoji components like digits
  return /\p{Emoji_Presentation}|\p{Extended_Pictographic}/u.test(str)
}

// Get status info from agent state.
// pulseColor carries the hex value needed for the CSS boxShadow glow, keeping the
// Tailwind class name and the shadow color in sync without fragile string matching.
function getStatusInfo(
  isOnline: boolean,
  isHibernated: boolean,
  activityStatus?: SessionActivityStatus
): { color: string; bgColor: string; label: string; pulse?: boolean; pulseColor: string } {

  if (isOnline) {
    if (activityStatus === 'waiting') {
      return { color: 'bg-amber-400', bgColor: 'bg-amber-400/20', label: 'Waiting', pulse: true, pulseColor: '#fbbf24' }
    }
    if (activityStatus === 'active') {
      return { color: 'bg-green-400', bgColor: 'bg-green-400/20', label: 'Active', pulse: true, pulseColor: '#4ade80' }
    }
    return { color: 'bg-green-400', bgColor: 'bg-green-400/20', label: 'Idle', pulse: false, pulseColor: '#4ade80' }
  }

  if (isHibernated) {
    return { color: 'bg-yellow-400', bgColor: 'bg-yellow-400/20', label: 'Hibernated', pulse: false, pulseColor: '#facc15' }
  }

  return { color: 'bg-slate-500', bgColor: 'bg-slate-500/20', label: 'Offline', pulse: false, pulseColor: '#64748b' }
}

export default function AgentBadge({
  agent,
  isSelected,
  activityStatus,
  unreadCount,
  onSelect,
  onRename,
  onDelete,
  onHibernate,
  onWake,
  onOpenTerminal,
  onSendMessage,
  onCopyId,
  showActions = true,
  variant = 'compact',
}: AgentBadgeProps) {
  const [showMenu, setShowMenu] = React.useState(false)
  const menuRef = React.useRef<HTMLDivElement>(null)

  // Check both agent.session (live runtime) and agent.sessions[0] (stored config)
  // because the API may populate one or the other depending on the endpoint
  const isOnline = agent.session?.status === 'online' || agent.sessions?.[0]?.status === 'online'
  const isHibernated = !isOnline && agent.sessions && agent.sessions.length > 0

  const statusInfo = getStatusInfo(isOnline, isHibernated, activityStatus)
  const ringColor = stringToRingColor(agent.name)

  // Avatar priority: stored URL > stored emoji > computed from ID
  const hasEmojiAvatar = agent.avatar ? isEmoji(agent.avatar) : false
  const hasStoredAvatarUrl = agent.avatar && !hasEmojiAvatar && (agent.avatar.startsWith('http') || agent.avatar.startsWith('/'))
  const avatarUrl = hasStoredAvatarUrl ? agent.avatar : getAvatarUrl(agent.id)
  const [imageError, setImageError] = React.useState(false)

  // Reset imageError whenever avatarUrl changes so a new image is always attempted.
  // Without this, a previous load failure keeps imageError true across re-renders
  // (e.g. when agent.avatar is updated dynamically), causing the fallback to show
  // indefinitely without ever trying the updated URL.
  React.useEffect(() => {
    setImageError(false)
  }, [avatarUrl])

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
      {/* Status indicator — top-right in normal, bottom-right in compact */}
      <div className={`absolute ${variant === 'normal' ? 'top-2' : 'bottom-2'} right-2 flex items-center gap-1.5 z-20`}>
        {/* Unread messages counter */}
        {unreadCount && unreadCount > 0 && (
          <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-slate-600/50" title={`${unreadCount} unread message${unreadCount > 1 ? 's' : ''}`}>
            <Mail className="w-3 h-3 text-slate-200" />
            <span className="text-[10px] font-bold text-slate-200">{unreadCount}</span>
          </div>
        )}

        {/* Status indicator - dot for online/offline, Power icon for hibernated */}
        {isHibernated ? (
          // cursor-pointer signals that this element is interactive (wake action).
          // e.stopPropagation() prevents the parent onClick (onSelect) from firing.
          <div
            className="flex items-center cursor-pointer"
            title="Hibernated - Click to wake"
            onClick={(e) => {
              e.stopPropagation()
              if (onWake) onWake(agent)
            }}
          >
            <Power className="w-4 h-4 text-slate-500" />
          </div>
        ) : (
          <div className="relative flex items-center justify-center" title={statusInfo.label}>
            {statusInfo.pulse && (
              <span className={`absolute w-5 h-5 rounded-full ${statusInfo.color} animate-ping opacity-40`} />
            )}
            {/* Glass-like LED dot */}
            <span
              className="relative w-4 h-4 rounded-full"
              style={{
                background: `radial-gradient(circle at 35% 35%, ${statusInfo.pulseColor}cc, ${statusInfo.pulseColor}${statusInfo.pulse ? '99' : '55'})`,
                boxShadow: statusInfo.pulse
                  ? `0 0 10px 3px ${statusInfo.pulseColor}88, inset 0 -1px 2px ${statusInfo.pulseColor}40, inset 0 1px 2px rgba(255,255,255,0.3)`
                  : `0 0 4px 1px ${statusInfo.pulseColor}44, inset 0 -1px 2px ${statusInfo.pulseColor}20, inset 0 1px 2px rgba(255,255,255,0.15)`,
                border: `1px solid ${statusInfo.pulseColor}40`,
              }}
            />
          </div>
        )}
      </div>

      {/* Actions menu — top-left in normal, bottom-left in compact, always visible */}
      {showActions && (
        <div className={`absolute ${variant === 'normal' ? 'top-2' : 'bottom-2'} left-2 z-20`} ref={menuRef}>
          <button
            onClick={(e) => {
              e.stopPropagation()
              setShowMenu(!showMenu)
            }}
            className={`p-1 rounded-md transition-colors ${
              variant === 'normal'
                ? 'bg-black/20 hover:bg-black/40 shadow-[0_0_8px_rgba(255,255,255,0.25)]'
                : 'bg-slate-700/50 hover:bg-slate-600'
            }`}
          >
            <MoreVertical className={`w-3.5 h-3.5 ${variant === 'normal' ? 'text-white/80' : 'text-slate-400'}`} />
          </button>

          {/* Dropdown menu — opens upward in compact (button at bottom), downward in normal */}
          {showMenu && (
            <div className={`absolute left-0 w-40 py-1 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-50 ${
              variant === 'normal' ? 'top-full mt-1' : 'bottom-full mb-1'
            }`}>
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
                  className="w-full px-3 py-1.5 text-left text-sm text-slate-300 hover:bg-green-500/10 hover:text-green-400 flex items-center gap-2"
                >
                  <Power className="w-3.5 h-3.5" />
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

      {/* Badge content — two variants */}
      {variant === 'normal' ? (
        /* Normal variant: full background image with overlaid text */
        <div className={`relative z-0 w-full aspect-square overflow-hidden rounded-[10px] ${isHibernated ? 'grayscale opacity-70' : ''}`}>
          {/* Background image */}
          {hasEmojiAvatar ? (
            <div className="absolute inset-0 bg-slate-700 flex items-center justify-center">
              <span className="text-6xl">{agent.avatar}</span>
            </div>
          ) : imageError ? (
            <div className="absolute inset-0 bg-gradient-to-br from-slate-600 to-slate-800 flex items-center justify-center">
              <span className="text-4xl font-bold text-white/40">
                {(agent.label || agent.name || '??').slice(0, 2).toUpperCase()}
              </span>
            </div>
          ) : (
            <img
              src={avatarUrl}
              alt={agent.label || agent.name}
              className="absolute inset-0 w-full h-full object-cover"
              onError={() => setImageError(true)}
            />
          )}

          {/* Gradient overlay for text readability */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

          {/* Text overlay — bottom of card */}
          <div className="absolute bottom-0 left-0 right-0 p-2.5 text-center">
            {/* Prioritize agent.label (persona name); fall back to agent.name (agent ID) */}
            {(agent.label || agent.name) && (
              <h3
                className="font-bold text-sm leading-tight text-white"
                style={{
                  textShadow: '0 0 8px rgba(0,0,0,0.9), 0 0 16px rgba(0,0,0,0.6), 0 1px 3px rgba(0,0,0,0.8)',
                }}
              >
                {agent.label || agent.name}
              </h3>
            )}
            {/* agent.name is shown as secondary ID handle only when agent.label (persona name)
                is present — otherwise agent.name already appears in the h3 as the primary
                display name and showing it again here would be a redundant duplicate. */}
            {agent.label && (
              <p
                className="text-[10px] leading-tight text-slate-300 mt-0.5"
                style={{
                  textShadow: '0 0 6px rgba(0,0,0,0.9), 0 1px 2px rgba(0,0,0,0.8)',
                }}
              >
                {agent.name}
              </p>
            )}
            {agent.hostId && (
              <p
                className="text-[9px] text-slate-400 mt-0.5"
                style={{
                  textShadow: '0 0 6px rgba(0,0,0,0.9), 0 1px 2px rgba(0,0,0,0.8)',
                }}
              >
                @{agent.hostId}
              </p>
            )}
          </div>
        </div>
      ) : (
        /* Compact variant: circle avatar with text below */
        <div className="p-3 pt-10 flex flex-col items-center text-center">
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

          {/* Persona name — Prominent display, centered */}
          {/* Prioritize agent.label (persona name); fall back to agent.name (agent ID) */}
          {(agent.label || agent.name) && (
            <h3 className={`
              mt-3 font-bold text-base leading-tight text-center
              ${isHibernated ? 'text-slate-500' : 'text-slate-100'}
            `}>
              {agent.label || agent.name}
            </h3>
          )}

          {/* Full name and host - Secondary info, centered */}
          {/* When agent.label (persona name) is present, agent.name (the ID handle) is shown
              in the secondary row alongside the Docker container icon — this avoids duplicating
              the primary display name already in the h3.
              When agent.label is absent, agent.name already fills the h3 as the primary name,
              so the secondary row shows ONLY the Box icon (no agent.name) to avoid duplication. */}
          <div className={`${(agent.label || agent.name) ? 'mt-1' : 'mt-3'} w-full`}>
            {agent.label ? (
              <p className={`
                text-[11px] leading-tight flex items-center justify-center gap-1
                ${isHibernated ? 'text-slate-600' : 'text-slate-400'}
              `}>
                {agent.name}
                {agent.deployment?.cloud?.provider === 'local-container' && (
                  <span className="flex-shrink-0" aria-label="Docker container">
                    <Box className="w-3 h-3 text-blue-400" />
                  </span>
                )}
              </p>
            ) : (
              agent.deployment?.cloud?.provider === 'local-container' && (
                <p className={`
                  text-[11px] leading-tight flex items-center justify-center gap-1
                  ${isHibernated ? 'text-slate-600' : 'text-slate-400'}
                `}>
                  <span className="flex-shrink-0" aria-label="Docker container">
                    <Box className="w-3 h-3 text-blue-400" />
                  </span>
                </p>
              )
            )}

            {agent.hostId && (
              <p className="text-[10px] text-slate-500 mt-0.5">
                @{agent.hostId}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
