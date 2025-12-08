'use client'

import { useMemo, useState, useEffect, useRef } from 'react'
import type { UnifiedAgent } from '@/types/agent'
import { formatDistanceToNow } from '@/lib/utils'
import {
  ChevronRight,
  Folder,
  FolderOpen,
  Layers,
  Terminal,
  Plus,
  RefreshCw,
  Edit2,
  Trash2,
  Package,
  Code2,
  Mail,
  RotateCcw,
  Cloud,
  Server,
  Settings,
  Network,
  Play,
  Circle,
  Wifi,
  WifiOff,
  User,
} from 'lucide-react'
import Link from 'next/link'
import CreateAgentAnimation from './CreateAgentAnimation'
import { useHosts } from '@/hooks/useHosts'
import { SubconsciousStatus } from './SubconsciousStatus'

interface AgentListProps {
  agents: UnifiedAgent[]
  activeAgentId: string | null
  onAgentSelect: (agent: UnifiedAgent) => void
  onShowAgentProfile: (agent: UnifiedAgent) => void
  loading?: boolean
  error?: Error | null
  onRefresh?: () => void
  stats?: {
    total: number
    online: number
    offline: number
    orphans: number
  } | null
}

/**
 * DYNAMIC COLOR SYSTEM - Same as SessionList for consistency
 */
const COLOR_PALETTE = [
  {
    primary: 'rgb(59, 130, 246)',      // Blue
    bg: 'rgba(59, 130, 246, 0.05)',
    border: 'rgb(59, 130, 246)',
    icon: 'rgb(96, 165, 250)',
    hover: 'rgba(59, 130, 246, 0.1)',
    active: 'rgba(59, 130, 246, 0.15)',
    activeText: 'rgb(147, 197, 253)',
  },
  {
    primary: 'rgb(168, 85, 247)',      // Purple
    bg: 'rgba(168, 85, 247, 0.05)',
    border: 'rgb(168, 85, 247)',
    icon: 'rgb(192, 132, 252)',
    hover: 'rgba(168, 85, 247, 0.1)',
    active: 'rgba(168, 85, 247, 0.15)',
    activeText: 'rgb(216, 180, 254)',
  },
  {
    primary: 'rgb(34, 197, 94)',       // Green
    bg: 'rgba(34, 197, 94, 0.05)',
    border: 'rgb(34, 197, 94)',
    icon: 'rgb(74, 222, 128)',
    hover: 'rgba(34, 197, 94, 0.1)',
    active: 'rgba(34, 197, 94, 0.15)',
    activeText: 'rgb(134, 239, 172)',
  },
  {
    primary: 'rgb(234, 179, 8)',       // Yellow/Gold
    bg: 'rgba(234, 179, 8, 0.05)',
    border: 'rgb(234, 179, 8)',
    icon: 'rgb(250, 204, 21)',
    hover: 'rgba(234, 179, 8, 0.1)',
    active: 'rgba(234, 179, 8, 0.15)',
    activeText: 'rgb(253, 224, 71)',
  },
  {
    primary: 'rgb(236, 72, 153)',      // Pink
    bg: 'rgba(236, 72, 153, 0.05)',
    border: 'rgb(236, 72, 153)',
    icon: 'rgb(244, 114, 182)',
    hover: 'rgba(236, 72, 153, 0.1)',
    active: 'rgba(236, 72, 153, 0.15)',
    activeText: 'rgb(251, 207, 232)',
  },
  {
    primary: 'rgb(20, 184, 166)',      // Teal
    bg: 'rgba(20, 184, 166, 0.05)',
    border: 'rgb(20, 184, 166)',
    icon: 'rgb(45, 212, 191)',
    hover: 'rgba(20, 184, 166, 0.1)',
    active: 'rgba(20, 184, 166, 0.15)',
    activeText: 'rgb(94, 234, 212)',
  },
  {
    primary: 'rgb(249, 115, 22)',      // Orange
    bg: 'rgba(249, 115, 22, 0.05)',
    border: 'rgb(249, 115, 22)',
    icon: 'rgb(251, 146, 60)',
    hover: 'rgba(249, 115, 22, 0.1)',
    active: 'rgba(249, 115, 22, 0.15)',
    activeText: 'rgb(253, 186, 116)',
  },
  {
    primary: 'rgb(239, 68, 68)',       // Red
    bg: 'rgba(239, 68, 68, 0.05)',
    border: 'rgb(239, 68, 68)',
    icon: 'rgb(248, 113, 113)',
    hover: 'rgba(239, 68, 68, 0.1)',
    active: 'rgba(239, 68, 68, 0.15)',
    activeText: 'rgb(252, 165, 165)',
  },
]

const DEFAULT_ICON = Layers

export default function AgentList({
  agents,
  activeAgentId,
  onAgentSelect,
  onShowAgentProfile,
  loading,
  error,
  onRefresh,
  stats,
}: AgentListProps) {
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({})

  // Host management
  const { hosts } = useHosts()
  const [selectedHostFilter, setSelectedHostFilter] = useState<string>('all')
  const [hostsExpanded, setHostsExpanded] = useState(true)

  // State for accordion panels - load from localStorage
  const [expandedLevel1, setExpandedLevel1] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set()
    const saved = localStorage.getItem('agent-sidebar-expanded-level1')
    if (saved) {
      try {
        return new Set(JSON.parse(saved))
      } catch (e) {
        return new Set()
      }
    }
    return new Set()
  })
  const [expandedLevel2, setExpandedLevel2] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set()
    const saved = localStorage.getItem('agent-sidebar-expanded-level2')
    if (saved) {
      try {
        return new Set(JSON.parse(saved))
      } catch (e) {
        return new Set()
      }
    }
    return new Set()
  })

  // Group agents by tags (level1 = first tag, level2 = second tag)
  const groupedAgents = useMemo(() => {
    const groups: Record<string, Record<string, UnifiedAgent[]>> = {}

    // Filter agents by selected host
    const filteredAgents =
      selectedHostFilter === 'all'
        ? agents
        : agents.filter((a) => a.session.hostId === selectedHostFilter)

    filteredAgents.forEach((agent) => {
      const tags = agent.tags || []
      const level1 = tags[0] || 'ungrouped'
      const level2 = tags[1] || 'default'

      if (!groups[level1]) groups[level1] = {}
      if (!groups[level1][level2]) groups[level1][level2] = []

      groups[level1][level2].push(agent)
    })

    return groups
  }, [agents, selectedHostFilter])

  // Initialize NEW panels as open on first mount
  const initializedRef = useRef(false)
  useEffect(() => {
    if (initializedRef.current) return
    initializedRef.current = true

    setExpandedLevel1((prev) => {
      const newExpanded = new Set(prev)
      Object.keys(groupedAgents).forEach((level1) => {
        if (!prev.has(level1)) {
          newExpanded.add(level1)
        }
      })
      return newExpanded
    })

    setExpandedLevel2((prev) => {
      const newExpanded = new Set(prev)
      Object.entries(groupedAgents).forEach(([level1, level2Groups]) => {
        Object.keys(level2Groups).forEach((level2) => {
          const key = `${level1}-${level2}`
          if (!prev.has(key)) {
            newExpanded.add(key)
          }
        })
      })
      return newExpanded
    })
  }, [groupedAgents])

  // Save expanded state to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('agent-sidebar-expanded-level1', JSON.stringify(Array.from(expandedLevel1)))
    }
  }, [expandedLevel1])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('agent-sidebar-expanded-level2', JSON.stringify(Array.from(expandedLevel2)))
    }
  }, [expandedLevel2])

  // Fetch unread message counts for all agents (using agent ID for storage)
  useEffect(() => {
    const fetchUnreadCounts = async () => {
      const counts: Record<string, number> = {}

      // Fetch for all agents (not just online ones) since messages persist
      for (const agent of agents) {
        try {
          // Use agent ID for lookup - the API now supports agent identifiers
          const response = await fetch(`/api/messages?agent=${encodeURIComponent(agent.id)}&action=unread-count`)
          const data = await response.json()
          if (data.count > 0) {
            counts[agent.id] = data.count
          }
        } catch (error) {
          // Silently fail
        }
      }

      setUnreadCounts(counts)
    }

    fetchUnreadCounts()
    const interval = setInterval(fetchUnreadCounts, 10000)
    return () => clearInterval(interval)
  }, [agents])

  const toggleLevel1 = (level1: string) => {
    setExpandedLevel1((prev) => {
      const next = new Set(prev)
      if (next.has(level1)) {
        next.delete(level1)
      } else {
        next.add(level1)
      }
      return next
    })
  }

  const toggleLevel2 = (level1: string, level2: string) => {
    const key = `${level1}-${level2}`
    setExpandedLevel2((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  const getCategoryColor = (category: string) => {
    const storageKey = `category-color-${category.toLowerCase()}`
    const savedColor = typeof window !== 'undefined' ? localStorage.getItem(storageKey) : null
    if (savedColor) {
      try {
        return JSON.parse(savedColor)
      } catch (e) {
        // Continue to default
      }
    }

    const hash = category.split('').reduce((acc, char) => {
      return char.charCodeAt(0) + ((acc << 5) - acc)
    }, 0)

    const colorIndex = Math.abs(hash) % COLOR_PALETTE.length
    return COLOR_PALETTE[colorIndex]
  }

  const countAgentsInCategory = (level1: string) => {
    const level2Groups = groupedAgents[level1]
    return Object.values(level2Groups).reduce((sum, agents) => sum + agents.length, 0)
  }

  const handleAgentClick = (agent: UnifiedAgent) => {
    if (agent.session.status === 'online') {
      // Online agent - select terminal
      onAgentSelect(agent)
    } else {
      // Offline agent - show profile panel
      onShowAgentProfile(agent)
    }
  }

  const handleCreateAgent = async (name: string, workingDirectory?: string, hostId?: string) => {
    setActionLoading(true)
    try {
      const response = await fetch('/api/sessions/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, workingDirectory, hostId }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to create agent')
      }

      setShowCreateModal(false)
      onRefresh?.()
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to create session')
    } finally {
      setActionLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-sidebar-border">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-100">
            AI Agents
            <span className="ml-2 text-sm font-normal text-gray-400">
              {stats ? `${stats.online}/${stats.total}` : agents.length}
            </span>
          </h2>
          <div className="flex items-center gap-2">
            {/* Stats indicators */}
            {stats && stats.offline > 0 && (
              <div
                className="flex items-center gap-1 px-2 py-1 rounded-full bg-gray-700/50 text-xs text-gray-400"
                title={`${stats.offline} offline agent(s)`}
              >
                <WifiOff className="w-3 h-3" />
                <span>{stats.offline}</span>
              </div>
            )}
            <button
              onClick={() => setShowCreateModal(true)}
              className="p-1.5 rounded-lg hover:bg-sidebar-hover transition-all duration-200 text-green-400 hover:text-green-300 hover:scale-110"
              aria-label="Create new agent"
              title="Create new agent"
            >
              <Plus className="w-4 h-4" />
            </button>
            <button
              onClick={onRefresh}
              disabled={loading}
              className="p-1.5 rounded-lg hover:bg-sidebar-hover transition-all duration-200 disabled:opacity-50 hover:scale-110"
              aria-label="Refresh agents"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Host List - Collapsible */}
        <div className="mt-3">
          <button
            onClick={() => setHostsExpanded(!hostsExpanded)}
            className="w-full flex items-center justify-between px-2 py-1.5 rounded text-xs text-gray-400 hover:bg-gray-800 hover:text-gray-300 transition-all"
          >
            <span className="flex items-center gap-1.5">
              <Server className="w-3.5 h-3.5" />
              <span className="font-medium">Hosts</span>
            </span>
            <ChevronRight
              className={`w-4 h-4 transition-transform ${hostsExpanded ? 'rotate-90' : ''}`}
            />
          </button>

          {hostsExpanded && (
            <div className="mt-1 space-y-1 pl-1">
              <button
                onClick={() => setSelectedHostFilter('all')}
                className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-xs transition-all ${
                  selectedHostFilter === 'all'
                    ? 'bg-blue-500/20 text-blue-300'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-gray-300'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <Server className="w-3.5 h-3.5" />
                  All Hosts
                </span>
                <span className={selectedHostFilter === 'all' ? 'text-blue-400' : 'text-gray-500'}>
                  {agents.length}
                </span>
              </button>

              {hosts.map((host) => {
                const count = agents.filter((a) => a.session.hostId === host.id).length
                const isSelected = selectedHostFilter === host.id
                const isLocal = host.type === 'local'

                return (
                  <button
                    key={host.id}
                    onClick={() => setSelectedHostFilter(host.id)}
                    className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-xs transition-all ${
                      isSelected
                        ? 'bg-blue-500/20 text-blue-300'
                        : 'text-gray-400 hover:bg-gray-800 hover:text-gray-300'
                    }`}
                  >
                    <span className="flex items-center gap-1.5">
                      {isLocal ? (
                        <Terminal className="w-3.5 h-3.5" />
                      ) : (
                        <Network className="w-3.5 h-3.5" />
                      )}
                      {host.name}
                    </span>
                    <span className={isSelected ? 'text-blue-400' : 'text-gray-500'}>
                      {count}
                    </span>
                  </button>
                )
              })}

              <Link href="/settings?tab=hosts">
                <button className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-xs text-gray-400 hover:bg-gray-800 hover:text-gray-300 border border-dashed border-gray-700 hover:border-gray-600 transition-all">
                  <Plus className="w-3.5 h-3.5" />
                  Add Host
                </button>
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="px-4 py-3 bg-red-900/20 border-b border-red-800">
          <p className="text-sm text-red-400">Failed to load agents</p>
        </div>
      )}

      {/* Agent List */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {loading && agents.length === 0 ? (
          <div className="px-4 py-8 text-center text-gray-400">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-400 mx-auto mb-2"></div>
            <p className="text-sm">Loading agents...</p>
          </div>
        ) : agents.length === 0 ? (
          <div className="px-4 py-8 text-center text-gray-400">
            <p className="text-sm mb-2">No agents found</p>
            <p className="text-xs text-gray-500 mb-4">
              Create a new agent or start a tmux session
            </p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="text-sm text-blue-400 hover:text-blue-300 underline"
            >
              Create your first agent
            </button>
          </div>
        ) : (
          <div className="py-2">
            {Object.entries(groupedAgents)
              .sort(([a], [b]) => a.toLowerCase().localeCompare(b.toLowerCase()))
              .map(([level1, level2Groups]) => {
              const colors = getCategoryColor(level1)
              const isExpanded = expandedLevel1.has(level1)
              const CategoryIcon = DEFAULT_ICON
              const agentCount = countAgentsInCategory(level1)

              return (
                <div key={level1} className="mb-1">
                  {/* Level 1 Header */}
                  <button
                    onClick={() => toggleLevel1(level1)}
                    className="w-full px-3 py-2.5 flex items-center gap-3 text-left hover:bg-sidebar-hover transition-all duration-200 group rounded-lg mx-1"
                    style={{
                      backgroundColor: isExpanded ? colors.bg : 'transparent',
                    }}
                  >
                    <div
                      className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-200"
                      style={{
                        backgroundColor: colors.bg,
                        border: `1px solid ${colors.border}40`,
                      }}
                    >
                      <CategoryIcon className="w-4 h-4" style={{ color: colors.icon }} />
                    </div>

                    <div className="flex-1 min-w-0 flex items-center gap-2">
                      <span
                        className="font-semibold uppercase text-xs tracking-wider truncate"
                        style={{ color: isExpanded ? colors.activeText : colors.icon }}
                      >
                        {level1}
                      </span>
                      <span
                        className="text-xs font-medium px-2 py-0.5 rounded-full transition-all duration-200"
                        style={{
                          backgroundColor: colors.bg,
                          color: colors.icon,
                          border: `1px solid ${colors.border}30`,
                        }}
                      >
                        {agentCount}
                      </span>
                    </div>

                    <ChevronRight
                      className={`w-4 h-4 transition-transform duration-200 flex-shrink-0 ${
                        isExpanded ? 'rotate-90' : ''
                      }`}
                      style={{ color: colors.icon }}
                    />
                  </button>

                  {/* Level 2 Groups */}
                  {isExpanded && (
                    <div className="ml-2 mt-1 space-y-0.5">
                      {Object.entries(level2Groups)
                        .sort(([a], [b]) => a.toLowerCase().localeCompare(b.toLowerCase()))
                        .map(([level2, agentsList]) => {
                        const level2Key = `${level1}-${level2}`
                        const isLevel2Expanded = expandedLevel2.has(level2Key)

                        return (
                          <div key={level2Key}>
                            {/* Level 2 Header (hide if it's "default") */}
                            {level2 !== 'default' && (
                              <button
                                onClick={() => toggleLevel2(level1, level2)}
                                className="w-full px-3 py-2 pl-10 flex items-center gap-2 text-left hover:bg-sidebar-hover transition-all duration-200 rounded-lg group"
                              >
                                <div className="flex-shrink-0">
                                  {isLevel2Expanded ? (
                                    <FolderOpen className="w-3.5 h-3.5" style={{ color: colors.icon }} />
                                  ) : (
                                    <Folder className="w-3.5 h-3.5" style={{ color: colors.icon }} />
                                  )}
                                </div>

                                <span className="text-sm text-gray-300 capitalize flex-1 truncate">
                                  {level2}
                                </span>

                                <span
                                  className="text-xs px-1.5 py-0.5 rounded-full"
                                  style={{
                                    backgroundColor: colors.bg,
                                    color: colors.icon,
                                  }}
                                >
                                  {agentsList.length}
                                </span>

                                <ChevronRight
                                  className={`w-3 h-3 transition-transform duration-200 ${
                                    isLevel2Expanded ? 'rotate-90' : ''
                                  }`}
                                  style={{ color: colors.icon }}
                                />
                              </button>
                            )}

                            {/* Agents */}
                            {(level2 === 'default' || isLevel2Expanded) && (
                              <ul className="space-y-0.5">
                                {[...agentsList]
                                  .sort((a, b) => (a.displayName || a.alias).toLowerCase().localeCompare((b.displayName || b.alias).toLowerCase()))
                                  .map((agent) => {
                                  const isActive = activeAgentId === agent.id
                                  const isOnline = agent.session.status === 'online'
                                  const indentClass = level2 === 'default' ? 'pl-10' : 'pl-14'

                                  return (
                                    <li key={agent.id} className="group/agent relative">
                                      <div
                                        onClick={() => handleAgentClick(agent)}
                                        className={`w-full py-2.5 px-3 ${indentClass} text-left transition-all duration-200 cursor-pointer rounded-lg relative overflow-hidden ${
                                          isActive
                                            ? 'shadow-sm'
                                            : 'hover:bg-sidebar-hover'
                                        } ${!isOnline ? 'opacity-70' : ''}`}
                                        style={{
                                          backgroundColor: isActive ? colors.active : 'transparent',
                                        }}
                                      >
                                        {/* Active indicator */}
                                        {isActive && (
                                          <div
                                            className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 rounded-r-full transition-all duration-200"
                                            style={{ backgroundColor: colors.border }}
                                          />
                                        )}

                                        <div className="flex items-center justify-between gap-2">
                                          <div className="flex-1 min-w-0 flex items-center gap-2">
                                            {/* Avatar or Icon */}
                                            {agent.avatar ? (
                                              <span className="text-sm flex-shrink-0">{agent.avatar}</span>
                                            ) : (
                                              <User
                                                className="w-3.5 h-3.5 flex-shrink-0"
                                                style={{ color: isActive ? colors.activeText : colors.icon }}
                                              />
                                            )}

                                            {/* Agent name */}
                                            <span
                                              className={`text-sm truncate font-medium ${
                                                isActive ? 'font-semibold' : ''
                                              }`}
                                              style={{
                                                color: isActive ? colors.activeText : 'rgb(229, 231, 235)',
                                              }}
                                            >
                                              {agent.displayName || agent.alias}
                                            </span>

                                            {/* Orphan indicator */}
                                            {agent.isOrphan && (
                                              <span
                                                className="text-[10px] px-1 py-0.5 rounded bg-yellow-500/20 text-yellow-400"
                                                title="Auto-registered from orphan session"
                                              >
                                                NEW
                                              </span>
                                            )}

                                            {/* Unread message indicator */}
                                            {unreadCounts[agent.id] && unreadCounts[agent.id] > 0 && (
                                              <div className="flex items-center gap-1 flex-shrink-0">
                                                <Mail className="w-3 h-3 text-blue-400" />
                                                <span className="text-xs font-bold text-white bg-blue-500 px-1.5 py-0.5 rounded-full">
                                                  {unreadCounts[agent.id]}
                                                </span>
                                              </div>
                                            )}

                                            {/* Status indicator */}
                                            <AgentStatusIndicator isOnline={isOnline} />
                                          </div>

                                          {/* Action buttons - show on hover */}
                                          <div className="hidden group-hover/agent:flex items-center gap-1">
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation()
                                                onShowAgentProfile(agent)
                                              }}
                                              className="p-1 rounded hover:bg-gray-700/50 text-gray-400 hover:text-blue-400 transition-all duration-200"
                                              title="View agent profile"
                                            >
                                              <Edit2 className="w-3 h-3" />
                                            </button>
                                          </div>
                                        </div>
                                      </div>
                                    </li>
                                  )
                                })}
                              </ul>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* Divider */}
                  <div className="my-2 mx-4 border-t border-gray-800/50" />
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-sidebar-border px-3 py-3 mt-auto space-y-1">
        <SubconsciousStatus />

        <Link
          href="/settings"
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-sidebar-hover transition-all duration-200 group"
        >
          <div className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center bg-gray-800 border border-gray-700 group-hover:bg-gray-700 group-hover:border-gray-600 transition-all duration-200">
            <Settings className="w-4 h-4 text-gray-400 group-hover:text-gray-300" />
          </div>
          <span className="text-sm font-medium text-gray-300 group-hover:text-gray-100 transition-colors">
            Settings
          </span>
        </Link>
      </div>

      {/* Create Agent Modal */}
      {showCreateModal && (
        <CreateAgentModal
          onClose={() => setShowCreateModal(false)}
          onCreate={handleCreateAgent}
          loading={actionLoading}
        />
      )}
    </div>
  )
}

function AgentStatusIndicator({ isOnline }: { isOnline: boolean }) {
  if (isOnline) {
    return (
      <div className="flex items-center gap-1.5 flex-shrink-0" title="Online">
        <div className="w-2 h-2 rounded-full bg-green-500 ring-2 ring-green-500/30 animate-pulse" />
        <span className="text-xs text-gray-400 hidden lg:inline">Online</span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1.5 flex-shrink-0" title="Offline">
      <div className="w-2 h-2 rounded-full bg-gray-500 ring-2 ring-gray-500/30" />
      <span className="text-xs text-gray-400 hidden lg:inline">Offline</span>
    </div>
  )
}

// Animated Create Modal
function CreateAgentModal({
  onClose,
  onCreate,
  loading,
}: {
  onClose: () => void
  onCreate: (name: string, workingDirectory?: string, hostId?: string) => void
  loading: boolean
}) {
  const { hosts } = useHosts()
  const [name, setName] = useState('')
  const [workingDirectory, setWorkingDirectory] = useState('')
  const [animationPhase, setAnimationPhase] = useState<'naming' | 'preparing' | 'creating' | 'ready' | 'error'>('creating')
  const [animationProgress, setAnimationProgress] = useState(0)

  // Animate through phases when loading
  useEffect(() => {
    if (loading) {
      setAnimationPhase('preparing')
      setAnimationProgress(20)

      const timer1 = setTimeout(() => {
        setAnimationPhase('creating')
        setAnimationProgress(50)
      }, 600)

      const timer2 = setTimeout(() => {
        setAnimationProgress(80)
      }, 1200)

      return () => {
        clearTimeout(timer1)
        clearTimeout(timer2)
      }
    }
  }, [loading])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (name.trim()) {
      onCreate(name.trim(), workingDirectory.trim() || undefined)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50" onClick={loading ? undefined : onClose}>
      <div className="bg-gray-900 rounded-xl w-full max-w-md shadow-2xl border border-gray-700 overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {loading ? (
          // Animated creation view
          <div className="p-6">
            <div className="text-center mb-2">
              <h3 className="text-lg font-semibold text-gray-100">Creating Your Agent</h3>
              <p className="text-sm text-gray-400">{name}</p>
            </div>
            <CreateAgentAnimation
              phase={animationPhase}
              agentName={name}
              progress={animationProgress}
            />
          </div>
        ) : (
          // Form view
          <div className="p-6">
            <h3 className="text-lg font-semibold text-gray-100 mb-4">Create New Agent</h3>
            <form onSubmit={handleSubmit}>
              <div className="space-y-4">
                <div>
                  <label htmlFor="agent-name" className="block text-sm font-medium text-gray-300 mb-1">
                    Agent Name *
                  </label>
                  <input
                    id="agent-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="23blocks-api-myagent"
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    autoFocus
                    pattern="[a-zA-Z0-9_\-]+"
                    title="Only letters, numbers, dashes, and underscores allowed"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Format: group-subgroup-name (e.g., 23blocks-api-auth)
                  </p>
                </div>
                <div>
                  <label htmlFor="working-dir" className="block text-sm font-medium text-gray-300 mb-1">
                    Working Directory (optional)
                  </label>
                  <input
                    id="working-dir"
                    type="text"
                    value={workingDirectory}
                    onChange={(e) => setWorkingDirectory(e.target.value)}
                    placeholder={typeof process !== 'undefined' ? process.env?.HOME || '/home/user' : '/home/user'}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-sm font-medium text-gray-400 hover:text-gray-200 transition-colors rounded-lg hover:bg-gray-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!name.trim()}
                  className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-blue-500/25"
                >
                  Create Agent
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}
