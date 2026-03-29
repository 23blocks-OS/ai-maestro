'use client'

import { useMemo, useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
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
  Upload,
  Moon,
  Power,
  LayoutGrid,
  List,
  Search,
  X,
  Brain,
  CheckCircle,
  Box,
  ChevronDown,
  AlertTriangle,
  XCircle,
  Users,
} from 'lucide-react'
import Link from 'next/link'
import AgentCreationWizard from './AgentCreationWizard'
import WakeAgentDialog from './WakeAgentDialog'
import { useHosts } from '@/hooks/useHosts'
import { useSessionActivity, type SessionActivityStatus } from '@/hooks/useSessionActivity'
import { SubconsciousStatus } from './SubconsciousStatus'
import AgentBadge from './AgentBadge'
import SidebarViewSwitcher, { type SidebarView } from './sidebar/SidebarViewSwitcher'
import TeamListView from './sidebar/TeamListView'
import MeetingListView from './sidebar/MeetingListView'

interface AgentListProps {
  agents: UnifiedAgent[]
  activeAgentId: string | null
  onAgentSelect: (agent: UnifiedAgent) => void
  onShowAgentProfile: (agent: UnifiedAgent) => void
  onShowAgentProfileDangerZone?: (agent: UnifiedAgent) => void  // Opens profile scrolled to danger zone
  onImportAgent?: () => void  // Opens import dialog
  loading?: boolean
  error?: Error | null
  onRefresh?: () => void
  stats?: {
    total: number
    online: number
    offline: number
    orphans: number
  } | null
  subconsciousRefreshTrigger?: number  // Increment to force subconscious status refresh
  sidebarWidth?: number  // Current sidebar width for responsive grid
  hostErrors?: Record<string, Error>  // Hosts that failed to respond (keyed by hostId)
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
  onShowAgentProfileDangerZone,
  onImportAgent,
  loading,
  error,
  onRefresh,
  stats,
  subconsciousRefreshTrigger,
  sidebarWidth = 320,
  hostErrors = {},
}: AgentListProps) {
  const router = useRouter()
  const [showWizardModal, setShowWizardModal] = useState(false)
  const [showCreateDropdown, setShowCreateDropdown] = useState(false)
  const createDropdownRef = useRef<HTMLDivElement>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({})
  const [viewMode, setViewMode] = useState<'normal' | 'compact'>(() => {
    if (typeof window === 'undefined') return 'compact'
    const saved = localStorage.getItem('agent-sidebar-view-mode')
    // Migrate old values
    if (saved === 'list') return 'compact'
    if (saved === 'grid') return 'normal'
    return (saved as 'normal' | 'compact') || 'compact'
  })
  // Track if user manually toggled view mode (don't auto-switch if true)
  const [userOverrodeViewMode, setUserOverrodeViewMode] = useState(false)
  const prevSidebarWidthRef = useRef(sidebarWidth)
  const [hibernatingAgents, setHibernatingAgents] = useState<Set<string>>(new Set())
  const [wakingAgents, setWakingAgents] = useState<Set<string>>(new Set())
  const [wakeDialogAgent, setWakeDialogAgent] = useState<UnifiedAgent | null>(null)

  // Drag-and-drop state
  const [draggedAgent, setDraggedAgent] = useState<UnifiedAgent | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null) // Format: "level1" or "level1-level2"

  // Host management
  const [staleHostPopup, setStaleHostPopup] = useState<{ id: string; name: string; error: string } | null>(null)
  const { hosts } = useHosts()
  const [selectedHostFilter, setSelectedHostFilter] = useState<string>(() => {
    if (typeof window === 'undefined') return 'all'
    return localStorage.getItem('agent-sidebar-host-filter') || 'all'
  })
  const [hostsExpanded, setHostsExpanded] = useState(() => {
    if (typeof window === 'undefined') return true
    const saved = localStorage.getItem('agent-sidebar-hosts-expanded')
    return saved !== 'false'
  })

  // Footer accordion state
  const [footerExpanded, setFooterExpanded] = useState(() => {
    if (typeof window === 'undefined') return true
    const saved = localStorage.getItem('agent-sidebar-footer-expanded')
    return saved !== 'false'
  })

  // Search state
  const [searchQuery, setSearchQuery] = useState('')

  // Status filter tabs: 'active' (default) shows online sessions, 'hiber' shows offline, 'all' shows everything
  const [statusFilter, setStatusFilter] = useState<'active' | 'hiber' | 'all'>('active')

  // Sidebar view state (agents / teams / meetings)
  const [sidebarView, setSidebarView] = useState<SidebarView>(() => {
    if (typeof window === 'undefined') return 'agents'
    return (localStorage.getItem('agent-sidebar-view') as SidebarView) || 'agents'
  })

  // Session activity tracking (for waiting/active/idle status)
  const { getSessionActivity } = useSessionActivity()

  // Teams data for team-based grouping — re-fetched when agents change (team membership may have changed)
  const [teams, setTeams] = useState<Array<{ id: string; name: string; agentIds: string[] }>>([])
  const fetchTeams = useCallback(() => {
    fetch('/api/teams').then(r => r.ok ? r.json() : { teams: [] }).then(data => {
      setTeams(data.teams || [])
    }).catch(() => {})
  }, [])
  useEffect(() => { fetchTeams() }, [agents, fetchTeams])

  // State for team accordion panels — all collapsed by default
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set())

  // Filter agents by selected host, status tab, and search query
  const filteredAgents = useMemo(() => {
    let result = selectedHostFilter === 'all'
      ? agents
      : agents.filter((a) => a.hostId === selectedHostFilter)

    // Apply status filter (active/hiber/all)
    // Use sessions[0] (array form) consistently — a.session (singular) is legacy/may be null
    if (statusFilter === 'active') {
      result = result.filter(a => a.sessions?.[0]?.status === 'online')
    } else if (statusFilter === 'hiber') {
      // An agent is hibernated when it has at least one session entry but none are online.
      // This aligns with the isHibernated definition used in the rendering logic:
      // !isOnline && agent.sessions && agent.sessions.length > 0
      result = result.filter(a => a.sessions && a.sessions.length > 0 && a.sessions[0]?.status !== 'online')
    }

    // Apply search filter (name, label, or host)
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim()
      result = result.filter((a) =>
        a.name?.toLowerCase().includes(query) ||
        a.label?.toLowerCase().includes(query) ||
        a.hostId?.toLowerCase().includes(query) ||
        a.hostName?.toLowerCase().includes(query)
      )
    }

    return result
  }, [agents, selectedHostFilter, statusFilter, searchQuery])

  // Group agents by closed team membership
  const teamGroupedAgents = useMemo(() => {
    const groups: Record<string, { teamName: string; agents: UnifiedAgent[] }> = {}
    // Build a set of agent IDs that belong to closed teams
    const agentTeamMap = new Map<string, string>() // agentId → teamName
    for (const team of teams) {
      for (const aid of team.agentIds) {
        agentTeamMap.set(aid, team.name)
      }
    }

    filteredAgents.forEach((agent) => {
      const teamName = agentTeamMap.get(agent.id) || 'NO-TEAM'
      if (!groups[teamName]) groups[teamName] = { teamName, agents: [] }
      groups[teamName].agents.push(agent)
    })

    return groups
  }, [filteredAgents, teams])

  // Calculate grid columns based on sidebar width
  // 320px = 1 col, 480px = 2 cols, 640px+ = 3 cols
  const gridColumns = useMemo(() => {
    if (sidebarWidth >= 640) return 3
    if (sidebarWidth >= 480) return 2
    return 1
  }, [sidebarWidth])

  // Auto-switch view mode when sidebar is being resized
  // But respect user's manual toggle until they cross the width threshold again
  useEffect(() => {
    const prevWidth = prevSidebarWidthRef.current
    const widthChanged = prevWidth !== sidebarWidth
    prevSidebarWidthRef.current = sidebarWidth

    if (!widthChanged) return

    // Reset user override when crossing the 480px threshold (resize resets manual choice)
    const crossedThreshold = (prevWidth < 480 && sidebarWidth >= 480) || (prevWidth >= 480 && sidebarWidth < 480)
    if (crossedThreshold) {
      setUserOverrodeViewMode(false)
    }

    // Auto-switch if user hasn't manually overridden
    if (!userOverrodeViewMode) {
      if (sidebarWidth >= 480 && viewMode === 'compact') {
        setViewMode('normal')
      } else if (sidebarWidth < 480 && viewMode === 'normal') {
        setViewMode('compact')
      }
    }
  }, [sidebarWidth, viewMode, userOverrodeViewMode])

  // Close create dropdown on click outside
  useEffect(() => {
    if (!showCreateDropdown) return
    const handleClickOutside = (e: MouseEvent) => {
      if (createDropdownRef.current && !createDropdownRef.current.contains(e.target as Node)) {
        setShowCreateDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showCreateDropdown])

  // Fetch unread message counts for all agents (using agent ID for storage)
  // OPTIMIZED: Use Promise.all for parallel fetching instead of sequential loop
  useEffect(() => {
    const fetchUnreadCounts = async () => {
      // Fetch for all agents in parallel (not just online ones) since messages persist
      const results = await Promise.all(
        agents.map(async (agent) => {
          try {
            // Use agent's hostUrl to route to the correct host for remote agents
            const baseUrl = agent.hostUrl || ''
            const response = await fetch(`${baseUrl}/api/messages?agent=${encodeURIComponent(agent.id)}&action=unread-count`)
            const data = await response.json()
            return { agentId: agent.id, count: data.count || 0 }
          } catch {
            // Silently fail - return 0 count
            return { agentId: agent.id, count: 0 }
          }
        })
      )

      // Build counts object from parallel results
      const counts: Record<string, number> = {}
      for (const { agentId, count } of results) {
        if (count > 0) {
          counts[agentId] = count
        }
      }

      setUnreadCounts(counts)
    }

    fetchUnreadCounts()
    const interval = setInterval(fetchUnreadCounts, 10000)
    return () => clearInterval(interval)
  }, [agents])

  // Persist view mode
  useEffect(() => {
    localStorage.setItem('agent-sidebar-view-mode', viewMode)
  }, [viewMode])

  // Persist sidebar view
  useEffect(() => {
    localStorage.setItem('agent-sidebar-view', sidebarView)
  }, [sidebarView])

  // Persist footer expanded state
  useEffect(() => {
    localStorage.setItem('agent-sidebar-footer-expanded', footerExpanded.toString())
  }, [footerExpanded])

  // Persist hosts expanded state
  useEffect(() => {
    localStorage.setItem('agent-sidebar-hosts-expanded', hostsExpanded.toString())
  }, [hostsExpanded])

  // Persist selected host filter
  useEffect(() => {
    localStorage.setItem('agent-sidebar-host-filter', selectedHostFilter)
  }, [selectedHostFilter])

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

  const countAgentsInCategory = (teamName: string) => {
    // Use teamGroupedAgents directly — groupedAgents intermediate wrapper was dead code
    return teamGroupedAgents[teamName]?.agents.length ?? 0
  }

  const handleAgentClick = (agent: UnifiedAgent) => {
    // Check if this is a hibernated agent (offline but has session config)
    // Use sessions[0] (array form) consistently — agent.session (singular) is legacy
    const sessionStatus = agent.sessions?.[0]?.status
    const isOnline = sessionStatus === 'online'
    const isHibernated = !isOnline && agent.sessions && agent.sessions.length > 0

    if (isOnline || isHibernated) {
      // Online or hibernated agent - select and show tabs
      onAgentSelect(agent)
    } else {
      // Truly offline agent (no session config) - show profile panel
      onShowAgentProfile(agent)
    }
  }

  const handleHibernate = async (agent: UnifiedAgent, e?: React.MouseEvent) => {
    // stopPropagation prevents the parent agent-select click from also firing.
    // Event is optional to support programmatic calls that have no DOM event.
    e?.stopPropagation()

    if (hibernatingAgents.has(agent.id)) return

    setHibernatingAgents(prev => new Set(prev).add(agent.id))

    try {
      const baseUrl = agent.hostUrl || ''
      const response = await fetch(`${baseUrl}/api/agents/${agent.id}/hibernate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to hibernate agent')
      }

      // Refresh the agent list to show updated status
      onRefresh?.()
    } catch (error) {
      console.error('Failed to hibernate agent:', error)
      alert(error instanceof Error ? error.message : 'Failed to hibernate agent')
    } finally {
      setHibernatingAgents(prev => {
        const next = new Set(prev)
        next.delete(agent.id)
        return next
      })
    }
  }

  const handleWake = (agent: UnifiedAgent, e?: React.MouseEvent) => {
    e?.stopPropagation()
    if (wakingAgents.has(agent.id)) return
    // Open the dialog to select which CLI to use
    setWakeDialogAgent(agent)
  }

  const handleWakeConfirm = async (program: string) => {
    if (!wakeDialogAgent) return

    const agent = wakeDialogAgent
    setWakingAgents(prev => new Set(prev).add(agent.id))

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

      // Close dialog and refresh the agent list
      setWakeDialogAgent(null)
      onRefresh?.()
    } catch (error) {
      console.error('Failed to wake agent:', error)
      alert(error instanceof Error ? error.message : 'Failed to wake agent')
    } finally {
      setWakingAgents(prev => {
        const next = new Set(prev)
        next.delete(agent.id)
        return next
      })
    }
  }

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, agent: UnifiedAgent) => {
    setDraggedAgent(agent)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', agent.id)
    // Add drag image styling
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '0.5'
    }
  }

  const handleDragEnd = (e: React.DragEvent) => {
    setDraggedAgent(null)
    setDropTarget(null)
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '1'
    }
  }

  const handleDragOver = (e: React.DragEvent, target: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dropTarget !== target) {
      setDropTarget(target)
    }
  }

  const handleDragLeave = (e: React.DragEvent) => {
    // Only clear drop target if we're leaving the actual element
    // (not just moving to a child element)
    const relatedTarget = e.relatedTarget as HTMLElement
    if (!e.currentTarget.contains(relatedTarget)) {
      setDropTarget(null)
    }
  }

  const handleDrop = async (e: React.DragEvent, level1: string, level2?: string) => {
    e.preventDefault()
    setDropTarget(null)

    if (!draggedAgent) return

    // Calculate new tags
    const newTags = level2 && level2 !== 'default' ? [level1, level2] : [level1]

    // Check if tags actually changed
    const currentTags = draggedAgent.tags || []
    const currentLevel1 = currentTags[0] || 'ungrouped'
    const currentLevel2 = currentTags[1] || 'default'

    if (currentLevel1 === level1 && currentLevel2 === (level2 || 'default')) {
      setDraggedAgent(null)
      return // No change
    }

    try {
      // Use agent's hostUrl for remote agents
      const baseUrl = draggedAgent.hostUrl || ''
      const response = await fetch(`${baseUrl}/api/agents/${draggedAgent.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags: newTags }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to move agent')
      }

      // Refresh the agent list to show updated position
      onRefresh?.()
    } catch (error) {
      console.error('Failed to move agent:', error)
      alert(error instanceof Error ? error.message : 'Failed to move agent')
    } finally {
      setDraggedAgent(null)
    }
  }

  const handleCreateAgent = async (name: string, workingDirectory?: string, hostId?: string, label?: string, avatar?: string, programArgs?: string): Promise<boolean> => {
    setActionLoading(true)

    try {
      const response = await fetch('/api/sessions/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, workingDirectory, hostId, label, avatar, programArgs }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to create agent')
      }

      return true // Success - modal will handle showing celebration
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to create session')
      return false
    } finally {
      setActionLoading(false)
    }
  }

  const handleCreateComplete = () => {
    setShowWizardModal(false)
    onRefresh?.()
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
            <div className="relative" ref={createDropdownRef}>
              {/* Pulsing ring when no agents */}
              {agents.length === 0 && (
                <>
                  <span className="absolute inset-0 rounded-lg bg-green-500/30 animate-ping" />
                  <span className="absolute inset-0 rounded-lg bg-green-500/20 animate-pulse" />
                </>
              )}
              <button
                onClick={() => setShowCreateDropdown(!showCreateDropdown)}
                className={`relative p-1.5 rounded-lg hover:bg-sidebar-hover transition-all duration-200 text-green-400 hover:text-green-300 hover:scale-110 flex items-center gap-0.5 ${
                  agents.length === 0 ? 'ring-2 ring-green-500/50' : ''
                }`}
                aria-label="Create new agent"
                title="Create new agent"
              >
                <Plus className="w-4 h-4" />
                <ChevronDown className="w-3 h-3" />
              </button>
              {showCreateDropdown && (
                <div className="absolute right-0 top-full mt-1 w-52 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 py-1 overflow-hidden">
                  <button
                    onClick={() => {
                      setShowCreateDropdown(false)
                      setShowWizardModal(true)
                    }}
                    className="w-full px-3 py-2 text-left text-sm text-gray-200 hover:bg-gray-700 transition-colors flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4 text-green-400" />
                    Create Agent
                  </button>
                  <button
                    onClick={() => {
                      setShowCreateDropdown(false)
                      router.push('/agent-creation')
                    }}
                    className="w-full px-3 py-2 text-left text-sm text-gray-200 hover:bg-gray-700 transition-colors flex items-center gap-2"
                  >
                    <Settings className="w-4 h-4 text-blue-400" />
                    Create Agent (Advanced)
                  </button>
                </div>
              )}
            </div>
            {/* View mode toggle */}
            <button
              onClick={() => {
                setViewMode(viewMode === 'compact' ? 'normal' : 'compact')
                setUserOverrodeViewMode(true) // User manually toggled, respect their choice
              }}
              className="p-1.5 rounded-lg hover:bg-sidebar-hover transition-all duration-200 text-gray-400 hover:text-gray-200 hover:scale-110"
              aria-label={viewMode === 'compact' ? 'Switch to normal view' : 'Switch to compact view'}
              title={viewMode === 'compact' ? 'Normal view' : 'Compact view'}
            >
              {viewMode === 'compact' ? (
                <LayoutGrid className="w-4 h-4" />
              ) : (
                <List className="w-4 h-4" />
              )}
            </button>
            {onImportAgent && (
              <button
                onClick={onImportAgent}
                className="p-1.5 rounded-lg hover:bg-sidebar-hover transition-all duration-200 text-purple-400 hover:text-purple-300 hover:scale-110"
                aria-label="Import agent"
                title="Import agent"
              >
                <Upload className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={onRefresh}
              disabled={loading}
              className="p-1.5 rounded-lg hover:bg-sidebar-hover transition-all duration-200 disabled:opacity-50 hover:scale-110"
              aria-label="Refresh agents"
            >
              {/* Wrap SVG in div for hardware-accelerated animation */}
              <div className={loading ? 'animate-spin' : ''}>
                <RefreshCw className="w-4 h-4" />
              </div>
            </button>
          </div>
        </div>

        {/* Search Input */}
        <div className="mt-3 px-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              placeholder="Search by name, label, host..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-8 py-1.5 text-sm bg-gray-800/50 border border-gray-700 rounded-lg text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-gray-500 hover:text-gray-300 hover:bg-gray-700 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          {searchQuery && (
            <div className="mt-1 text-xs text-gray-500">
              {filteredAgents.length} result{filteredAgents.length !== 1 ? 's' : ''}
            </div>
          )}
        </div>

        {/* Host List - Collapsible */}
        <div className="mt-3">
          <button
            onClick={() => setHostsExpanded(!hostsExpanded)}
            className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded text-xs text-gray-400 hover:bg-gray-800 hover:text-gray-300 transition-all"
          >
            <ChevronRight
              className={`w-4 h-4 transition-transform ${hostsExpanded ? 'rotate-90' : ''}`}
            />
            <Server className="w-3.5 h-3.5" />
            <span className="font-medium">Hosts</span>
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
                const count = agents.filter((a) => a.hostId === host.id).length
                const isSelected = selectedHostFilter === host.id
                const hostIsSelf = host.isSelf || !host.url || host.url.includes('localhost') || host.url.includes('127.0.0.1')
                const hasError = !hostIsSelf && !!hostErrors[host.id]

                return (
                  <div
                    key={host.id}
                    className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-xs transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-blue-500/20 text-blue-300'
                        : hasError
                          ? 'text-red-400/70 hover:bg-red-900/20 hover:text-red-300'
                          : 'text-gray-400 hover:bg-gray-800 hover:text-gray-300'
                    }`}
                    onClick={() => setSelectedHostFilter(host.id)}
                    title={hasError ? `Unreachable: ${hostErrors[host.id]?.message || 'connection failed'}` : host.url}
                  >
                    <span className="flex items-center gap-1.5 min-w-0">
                      {hostIsSelf ? (
                        <Terminal className="w-3.5 h-3.5 shrink-0" />
                      ) : hasError ? (
                        <XCircle
                          className="w-3.5 h-3.5 shrink-0 text-red-500 hover:text-red-300"
                          onClick={(e) => {
                            e.stopPropagation()
                            setStaleHostPopup({
                              id: host.id,
                              name: host.name,
                              error: hostErrors[host.id]?.message || 'Connection failed',
                            })
                          }}
                        />
                      ) : (
                        <Network className="w-3.5 h-3.5 shrink-0" />
                      )}
                      <span className="truncate">{host.name}</span>
                      {hasError && (
                        <span className="text-[9px] px-1 py-0.5 rounded bg-red-900/40 text-red-400 shrink-0">offline</span>
                      )}
                    </span>
                    <span className={isSelected ? 'text-blue-400' : hasError ? 'text-red-500/50' : 'text-gray-500'}>
                      {count}
                    </span>
                  </div>
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

        {/* View Switcher */}
        <SidebarViewSwitcher activeView={sidebarView} onViewChange={setSidebarView} />

      </div>

      {/* Error State */}
      {error && (
        <div className="px-4 py-3 bg-red-900/20 border-b border-red-800">
          <p className="text-sm text-red-400">Failed to load agents</p>
        </div>
      )}

      {/* Teams View */}
      {sidebarView === 'teams' && (
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <TeamListView agents={agents} searchQuery={searchQuery} />
        </div>
      )}

      {/* Meetings View */}
      {sidebarView === 'meetings' && (
        <div className="flex-1 min-h-0">
          <MeetingListView agents={agents} searchQuery={searchQuery} />
        </div>
      )}

      {/* Status Filter Tabs — sits directly on top of the agent scroll area */}
      {sidebarView === 'agents' && (
        <div className="flex-shrink-0 px-2 flex items-end gap-0 border-b border-gray-700/60 bg-sidebar">
          {([
            { key: 'active' as const, label: 'ACTIVE', count: agents.filter(a => a.sessions?.[0]?.status === 'online').length, color: 'emerald' },
            { key: 'all' as const, label: 'ALL', count: agents.length, color: 'blue' },
            // Exclude agents with no sessions — only count agents with a session that is not online
            { key: 'hiber' as const, label: 'HIBER', count: agents.filter(a => a.sessions && a.sessions.length > 0 && a.sessions[0]?.status !== 'online').length, color: 'amber' },
          ]).map(tab => {
            const isActive = statusFilter === tab.key
            return (
              <button
                key={tab.key}
                onClick={() => setStatusFilter(tab.key)}
                className={`flex-1 text-[10px] font-bold uppercase tracking-wider transition-all rounded-t-lg ${
                  isActive
                    ? `py-2 px-2 -mb-px border border-b-0 shadow-[0_-2px_6px_rgba(0,0,0,0.3)] ${
                        tab.color === 'emerald' ? 'text-emerald-300 border-emerald-500/40 bg-gray-900'
                        : tab.color === 'amber' ? 'text-amber-300 border-amber-500/40 bg-gray-900'
                        : 'text-blue-300 border-blue-500/40 bg-gray-900'
                      }`
                    : 'py-1.5 px-2 mb-0 text-gray-500 hover:text-gray-400 bg-gray-800/40 border border-b-0 border-transparent hover:bg-gray-800/60'
                }`}
              >
                {tab.label}
                <span className="ml-1 opacity-60">{tab.count}</span>
              </button>
            )
          })}
        </div>
      )}

      {/* Agent List — immediately below the tab bar */}
      {sidebarView === 'agents' && (
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {loading && agents.length === 0 ? (
          <div className="px-4 py-8 text-center text-gray-400">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-400 mx-auto mb-2"></div>
            <p className="text-sm">Loading agents...</p>
          </div>
        ) : agents.length === 0 ? (
          <div className="px-6 py-12 text-center">
            {/* Welcome animation */}
            <div className="relative mb-6">
              {/* Pulsing rings */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-32 h-32 rounded-full border-2 border-green-500/20 animate-ping" style={{ animationDuration: '2s' }} />
              </div>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-24 h-24 rounded-full border-2 border-green-500/30 animate-ping" style={{ animationDuration: '2s', animationDelay: '0.5s' }} />
              </div>

              {/* Central icon */}
              <div className="relative flex items-center justify-center h-32">
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-green-500/20 to-emerald-500/20 border border-green-500/30 flex items-center justify-center">
                  <Plus className="w-10 h-10 text-green-400" />
                </div>
              </div>
            </div>

            {/* Welcome text */}
            <h3 className="text-xl font-semibold text-gray-100 mb-2">
              Welcome to AI Maestro!
            </h3>
            <p className="text-sm text-gray-400 mb-6 max-w-xs mx-auto">
              Create your first AI agent to get started. Each agent runs in its own terminal session.
            </p>

            {/* Arrow pointing up */}
            <div className="flex flex-col items-center gap-2 mb-4">
              <div className="animate-bounce">
                <svg className="w-6 h-6 text-green-400 rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                </svg>
              </div>
              <span className="text-xs text-green-400 font-medium">Click the + button above</span>
            </div>

            {/* Or create button */}
            <button
              onClick={() => setShowWizardModal(true)}
              className="px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-semibold rounded-xl shadow-lg shadow-green-500/25 hover:shadow-green-500/40 transition-all duration-300 transform hover:scale-105"
            >
              Create Your First Agent
            </button>
          </div>
        ) : viewMode === 'normal' ? (
          /* Normal View — Full card with avatar image, grouped by closed team */
          <div className="p-3 space-y-3">
            {Object.entries(teamGroupedAgents)
              .sort(([a], [b]) => {
                // NO-TEAM always last
                if (a === 'NO-TEAM') return 1
                if (b === 'NO-TEAM') return -1
                return a.toLowerCase().localeCompare(b.toLowerCase())
              })
              .map(([teamName, group]) => {
                const colors = getCategoryColor(teamName)
                const isExpanded = expandedTeams.has(teamName)

                return (
                  <div key={teamName} className="rounded-lg overflow-hidden border border-slate-700/50">
                    {/* Team Header - Collapsible */}
                    <button
                      onClick={() => setExpandedTeams(prev => {
                        const next = new Set(prev)
                        if (next.has(teamName)) next.delete(teamName)
                        else next.add(teamName)
                        return next
                      })}
                      className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-700/30 transition-colors"
                      style={{ backgroundColor: colors.bg }}
                    >
                      <ChevronRight
                        className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
                        style={{ color: colors.icon }}
                      />
                      <Users className="w-3.5 h-3.5" style={{ color: colors.icon }} />
                      <span
                        className="font-bold uppercase text-xs tracking-wider flex-1 text-left"
                        style={{ color: colors.icon }}
                      >
                        {teamName}
                      </span>
                      <span
                        className="text-xs px-2 py-0.5 rounded-full font-medium"
                        style={{ backgroundColor: colors.active, color: colors.activeText }}
                      >
                        {group.agents.length}
                      </span>
                    </button>

                    {/* Team Content */}
                    {isExpanded && (
                      <div className="p-2 bg-slate-900/30">
                                <div
                                    className="grid gap-2"
                                    style={{ gridTemplateColumns: `repeat(${gridColumns}, minmax(0, 1fr))` }}
                                  >
                                    {[...group.agents]
                                      .sort((a, b) => {
                                        const aOnline = a.sessions?.[0]?.status === 'online' ? 2 : (a.sessions?.length ? 1 : 0)
                                        const bOnline = b.sessions?.[0]?.status === 'online' ? 2 : (b.sessions?.length ? 1 : 0)
                                        if (aOnline !== bOnline) return bOnline - aOnline
                                        return (a.label || a.name || a.alias || '').toLowerCase().localeCompare((b.label || b.name || b.alias || '').toLowerCase())
                                      })
                                      .map((agent) => {
                                        const session = agent.sessions?.[0]
                                        const isOnline = session?.status === 'online'
                                        const isHibernated = !isOnline && agent.sessions && agent.sessions.length > 0
                                        const sessionName = agent.name
                                        const activityInfo = sessionName ? getSessionActivity(sessionName) : null

                                        return (
                                          <AgentBadge
                                            key={agent.id}
                                            agent={agent}
                                            variant="normal"
                                            isSelected={activeAgentId === agent.id}
                                            activityStatus={activityInfo?.status}
                                            unreadCount={unreadCounts[agent.id]}
                                            onSelect={handleAgentClick}
                                            onRename={() => onShowAgentProfile(agent)}
                                            onDelete={() => onShowAgentProfileDangerZone?.(agent)}
                                            onHibernate={isOnline ? (a) => handleHibernate(a) : undefined}
                                            onWake={isHibernated ? (a) => handleWake(a) : undefined}
                                            onOpenTerminal={isOnline ? () => handleAgentClick(agent) : undefined}
                                            onSendMessage={() => {/* TODO: Implement send message dialog */}}
                                            onCopyId={() => navigator.clipboard.writeText(agent.id)}
                                          />
                                        )
                                      })}
                                  </div>
                      </div>
                    )}
                  </div>
                )
              })}
          </div>
        ) : (
          /* Compact View — grouped by closed team */
          <div className="py-2">
            {Object.entries(teamGroupedAgents)
              .sort(([a], [b]) => {
                if (a === 'NO-TEAM') return 1
                if (b === 'NO-TEAM') return -1
                return a.toLowerCase().localeCompare(b.toLowerCase())
              })
              .map(([teamName, group]) => {
              const colors = getCategoryColor(teamName)
              const isExpanded = expandedTeams.has(teamName)

              return (
                <div key={teamName} className="mb-1">
                  {/* Team Header */}
                  <button
                    onClick={() => setExpandedTeams(prev => {
                      const next = new Set(prev)
                      if (next.has(teamName)) next.delete(teamName)
                      else next.add(teamName)
                      return next
                    })}
                    className={`w-full px-3 py-2.5 flex items-center gap-3 text-left hover:bg-sidebar-hover transition-all duration-200 group rounded-lg mx-1`}
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
                      <Users className="w-4 h-4" style={{ color: colors.icon }} />
                    </div>

                    <div className="flex-1 min-w-0 flex items-center gap-2">
                      <span
                        className="font-semibold uppercase text-xs tracking-wider truncate"
                        style={{ color: isExpanded ? colors.activeText : colors.icon }}
                      >
                        {teamName}
                      </span>
                      <span
                        className="text-xs font-medium px-2 py-0.5 rounded-full transition-all duration-200"
                        style={{
                          backgroundColor: colors.bg,
                          color: colors.icon,
                          border: `1px solid ${colors.border}30`,
                        }}
                      >
                        {group.agents.length}
                      </span>
                    </div>

                    <ChevronRight
                      className={`w-4 h-4 transition-transform duration-200 flex-shrink-0 ${
                        isExpanded ? 'rotate-90' : ''
                      }`}
                      style={{ color: colors.icon }}
                    />
                  </button>

                  {/* Team Agents */}
                  {isExpanded && (
                    <div className="ml-2 mt-1 space-y-0.5">
                              <ul className="space-y-0.5">
                                {[...group.agents]
                                  .sort((a, b) => {
                                    // Sort by status first (online > hibernated > offline), then by alias
                                    const aSession = a.sessions?.[0]
                                    const bSession = b.sessions?.[0]
                                    const aOnline = aSession?.status === 'online' ? 2 : (a.sessions?.length ? 1 : 0)
                                    const bOnline = bSession?.status === 'online' ? 2 : (b.sessions?.length ? 1 : 0)
                                    if (aOnline !== bOnline) return bOnline - aOnline
                                    return (a.label || a.name || a.alias || '').toLowerCase().localeCompare((b.label || b.name || b.alias || '').toLowerCase())
                                  })
                                  .map((agent) => {
                                  const isActive = activeAgentId === agent.id
                                  const isOnline = agent.session?.status === 'online' || agent.sessions?.[0]?.status === 'online'
                                  const isHibernated = !isOnline && agent.sessions && agent.sessions.length > 0
                                  const indentClass = 'pl-10'

                                  // Get activity status for online agents
                                  const sessionName = agent.name
                                  const activityInfo = sessionName ? getSessionActivity(sessionName) : null
                                  const activityStatus = activityInfo?.status

                                  return (
                                    <li key={agent.id} className="group/agent relative">
                                      <div
                                        draggable
                                        onDragStart={(e) => handleDragStart(e, agent)}
                                        onDragEnd={handleDragEnd}
                                        onClick={() => handleAgentClick(agent)}
                                        className={`w-full py-2.5 px-3 ${indentClass} text-left transition-all duration-200 cursor-pointer rounded-lg relative overflow-hidden ${
                                          isActive
                                            ? 'shadow-sm'
                                            : 'hover:bg-sidebar-hover'
                                        } ${!isOnline ? 'opacity-70' : ''} ${
                                          draggedAgent?.id === agent.id ? 'opacity-50 scale-95' : ''
                                        }`}
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
                                          <div className="flex-1 min-w-0 flex items-center gap-3">
                                            {/* Avatar or Icon */}
                                            {agent.avatar && (agent.avatar.startsWith('http') || agent.avatar.startsWith('/')) ? (
                                              <img
                                                src={agent.avatar}
                                                alt=""
                                                className="w-12 h-12 rounded-full flex-shrink-0 object-cover"
                                              />
                                            ) : agent.avatar ? (
                                              <span className="text-3xl flex-shrink-0">{agent.avatar}</span>
                                            ) : (
                                              <User
                                                className="w-12 h-12 flex-shrink-0"
                                                style={{ color: isActive ? colors.activeText : colors.icon }}
                                              />
                                            )}

                                            {/* Agent name and host info - stacked layout */}
                                            <div className="flex-1 min-w-0">
                                              {/* First row: Agent name + badges + status */}
                                              <div className="flex items-center gap-1.5">
                                                <span
                                                  className={`text-sm truncate font-medium ${
                                                    isActive ? 'font-semibold' : ''
                                                  }`}
                                                  style={{
                                                    color: isActive ? colors.activeText : 'rgb(229, 231, 235)',
                                                  }}
                                                >
                                                  {agent.label || agent.name || agent.alias}
                                                </span>

                                                {/* Cached indicator */}
                                                {agent._cached && (
                                                  <span
                                                    className="text-[10px] px-1 py-0.5 rounded bg-gray-500/30 text-gray-400 flex-shrink-0"
                                                    title="Loaded from cache (host unreachable)"
                                                  >
                                                    cached
                                                  </span>
                                                )}

                                                {/* Orphan indicator */}
                                                {agent.isOrphan && (
                                                  <span
                                                    className="text-[10px] px-1 py-0.5 rounded bg-yellow-500/20 text-yellow-400 flex-shrink-0"
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
                                                <AgentStatusIndicator
                                                  isOnline={isOnline}
                                                  isHibernated={isHibernated}
                                                  activityStatus={activityStatus}
                                                />
                                              </div>

                                              {/* Second row: Agent name (when label is shown) */}
                                              {agent.label && agent.name && (
                                                <div className="flex items-center gap-1 mt-0.5">
                                                  <span
                                                    className="text-[10px] text-gray-500 truncate"
                                                    title={agent.name}
                                                  >
                                                    {agent.name}
                                                  </span>
                                                </div>
                                              )}

                                              {/* Third row: Remote host indicator */}
                                              {agent.hostId && agent.hostId !== 'local' && (
                                                <div className="flex items-center gap-1 mt-0.5">
                                                  <span
                                                    className="text-[10px] text-purple-400 truncate"
                                                    title={`Running on ${agent.hostName || agent.hostId}`}
                                                  >
                                                    @{agent.hostName || agent.hostId}
                                                  </span>
                                                </div>
                                              )}
                                            </div>
                                          </div>

                                          {/* Action buttons - show on hover */}
                                          <div className="hidden group-hover/agent:flex items-center gap-1">
                                            {/* Hibernate button - show when agent is online */}
                                            {isOnline && (
                                              <button
                                                onClick={(e) => {
                                                  // Stop propagation first to prevent the parent onClick (handleAgentClick) from firing
                                                  e.stopPropagation()
                                                  handleHibernate(agent, e)
                                                }}
                                                disabled={hibernatingAgents.has(agent.id)}
                                                className="p-1 rounded hover:bg-yellow-500/20 text-gray-400 hover:text-yellow-400 transition-all duration-200 disabled:opacity-50"
                                                title="Hibernate agent (stop session)"
                                              >
                                                {hibernatingAgents.has(agent.id) ? (
                                                  <RefreshCw className="w-3 h-3 animate-spin" />
                                                ) : (
                                                  <Moon className="w-3 h-3" />
                                                )}
                                              </button>
                                            )}
                                            {/* Wake button - show when agent is hibernated */}
                                            {isHibernated && (
                                              <button
                                                onClick={(e) => {
                                                  // Stop propagation first to prevent the parent onClick (handleAgentClick) from firing
                                                  e.stopPropagation()
                                                  setWakeDialogAgent(agent)
                                                }}
                                                disabled={wakingAgents.has(agent.id)}
                                                className="p-1 rounded hover:bg-green-500/20 text-gray-400 hover:text-green-400 transition-all duration-200 disabled:opacity-50"
                                                title="Wake agent (start session)"
                                              >
                                                {wakingAgents.has(agent.id) ? (
                                                  <RefreshCw className="w-3 h-3 animate-spin" />
                                                ) : (
                                                  <Power className="w-3 h-3" />
                                                )}
                                              </button>
                                            )}
                                            <a
                                              href={`/companion?agent=${encodeURIComponent(agent.id)}`}
                                              onClick={(e) => e.stopPropagation()}
                                              className="p-1 rounded hover:bg-pink-500/20 text-gray-400 hover:text-pink-400 transition-all duration-200"
                                              title="Companion View"
                                            >
                                              <User className="w-3 h-3" />
                                            </a>
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
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation()
                                                if (onShowAgentProfileDangerZone) {
                                                  onShowAgentProfileDangerZone(agent)
                                                }
                                              }}
                                              className="p-1 rounded hover:bg-red-500/20 text-gray-400 hover:text-red-400 transition-all duration-200"
                                              title="Delete agent"
                                            >
                                              <Trash2 className="w-3 h-3" />
                                            </button>
                                          </div>
                                        </div>
                                      </div>
                                    </li>
                                  )
                                })}
                              </ul>
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
      )}

      {/* Footer - Collapsible */}
      <div className="flex-shrink-0 border-t border-sidebar-border">
        {/* Footer Header */}
        <div className="flex items-center justify-between px-4 py-2">
          <button
            onClick={() => setFooterExpanded(!footerExpanded)}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-300 transition-all"
          >
            <ChevronRight
              className={`w-4 h-4 transition-transform ${footerExpanded ? 'rotate-90' : ''}`}
            />
            <span className="font-medium">System</span>
          </button>

          {/* Icons shown in header when collapsed */}
          {!footerExpanded && (
            <div className="flex items-center gap-2">
              <div
                className="p-1.5 rounded-md hover:bg-gray-700 transition-all cursor-pointer"
                title="Subconscious Status"
              >
                <Brain className="w-4 h-4 text-purple-400" />
              </div>
              <Link
                href="/settings"
                className="p-1.5 rounded-md hover:bg-gray-700 transition-all"
                title="Settings"
              >
                <Settings className="w-4 h-4 text-gray-400 hover:text-gray-300" />
              </Link>
            </div>
          )}
        </div>

        {/* Expanded content */}
        {footerExpanded && (
          <div className="px-3 pb-3 space-y-1">
            <SubconsciousStatus refreshTrigger={subconsciousRefreshTrigger} />

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
        )}
      </div>

      {/* Creation Wizard */}
      {showWizardModal && (
        <AgentCreationWizard
          onClose={() => setShowWizardModal(false)}
          onComplete={handleCreateComplete}
        />
      )}

      {/* Wake Agent Dialog */}
      <WakeAgentDialog
        isOpen={wakeDialogAgent !== null}
        onClose={() => setWakeDialogAgent(null)}
        onConfirm={handleWakeConfirm}
        agentName={wakeDialogAgent?.name || wakeDialogAgent?.id || ''}
        agentAlias={wakeDialogAgent?.alias}
      />

      {/* Stale/unreachable host popup */}
      {staleHostPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setStaleHostPopup(null)}>
          <div
            className="bg-gray-900 border border-red-800/60 rounded-xl shadow-2xl p-5 max-w-sm w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 mb-3">
              <XCircle className="w-5 h-5 text-red-500 shrink-0" />
              <h3 className="text-sm font-semibold text-red-300">Host Unreachable</h3>
            </div>
            <p className="text-xs text-gray-300 mb-1">
              <span className="font-medium text-white">{staleHostPopup.name}</span>{' '}
              <span className="text-gray-500">({staleHostPopup.id})</span>
            </p>
            <p className="text-xs text-red-400/80 mb-4 bg-red-950/30 rounded px-2 py-1.5 font-mono break-all">
              {staleHostPopup.error}
            </p>
            <div className="flex items-center gap-2 justify-end">
              <button
                onClick={() => setStaleHostPopup(null)}
                className="px-3 py-1.5 text-xs text-gray-400 hover:text-gray-200 rounded-lg hover:bg-gray-800 transition-colors"
              >
                Dismiss
              </button>
              <button
                onClick={async () => {
                  try {
                    const res = await fetch(`/api/hosts/${encodeURIComponent(staleHostPopup.id)}`, { method: 'DELETE' })
                    if (res.ok) {
                      setStaleHostPopup(null)
                      if (selectedHostFilter === staleHostPopup.id) {
                        setSelectedHostFilter('all')
                      }
                      window.location.reload()
                    }
                  } catch { /* ignore */ }
                }}
                className="px-3 py-1.5 text-xs text-red-300 bg-red-900/40 hover:bg-red-800/60 rounded-lg border border-red-700/40 hover:border-red-600/60 transition-colors"
              >
                Remove Host
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function AgentStatusIndicator({
  isOnline,
  isHibernated,
  activityStatus
}: {
  isOnline: boolean
  isHibernated?: boolean
  activityStatus?: SessionActivityStatus
}) {
  if (isOnline) {
    // Online states: waiting, active, or idle
    if (activityStatus === 'waiting') {
      return (
        <div className="flex items-center gap-1.5 flex-shrink-0" title="Waiting for input">
          <div className="w-2 h-2 rounded-full bg-amber-500 ring-2 ring-amber-500/30 animate-pulse" />
          <span className="text-xs text-amber-400 hidden lg:inline">Waiting</span>
        </div>
      )
    }

    if (activityStatus === 'active') {
      return (
        <div className="flex items-center gap-1.5 flex-shrink-0" title="Processing">
          <div className="w-2 h-2 rounded-full bg-green-500 ring-2 ring-green-500/30 animate-pulse" />
          <span className="text-xs text-green-400 hidden lg:inline">Active</span>
        </div>
      )
    }

    // Idle or unknown activity status - show as online/idle
    return (
      <div className="flex items-center gap-1.5 flex-shrink-0" title="Online - Idle">
        <div className="w-2 h-2 rounded-full bg-green-500 ring-2 ring-green-500/30" />
        <span className="text-xs text-gray-400 hidden lg:inline">Idle</span>
      </div>
    )
  }

  if (isHibernated) {
    return (
      <div className="flex items-center gap-1.5 flex-shrink-0" title="Hibernated">
        <div className="w-2 h-2 rounded-full bg-slate-500 ring-2 ring-slate-500/30" />
        <span className="text-xs text-gray-500 hidden lg:inline">Hiber</span>
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

// Host Selector Component - beautiful list with search for large networks
function HostSelector({
  hosts,
  selectedHostId,
  onSelect,
}: {
  hosts: Array<{ id: string; name: string; url?: string; isSelf?: boolean }>
  selectedHostId: string
  onSelect: (hostId: string) => void
}) {
  const [searchQuery, setSearchQuery] = useState('')

  // Filter hosts by search query
  const filteredHosts = hosts.filter(host =>
    host.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    host.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
    host.url?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div>
      <label className="block text-sm font-medium text-gray-300 mb-2">
        Host
      </label>

      {/* Search input - only show if more than 2 hosts */}
      {hosts.length > 2 && (
        <div className="relative mb-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search hosts..."
            className="w-full pl-9 pr-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-sm"
          />
        </div>
      )}

      {/* Host list - scrollable */}
      <div className="space-y-2 max-h-64 overflow-y-auto pr-1 custom-scrollbar">
        {filteredHosts.length === 0 ? (
          <div className="p-3 text-center text-gray-500 text-sm">
            No hosts found
          </div>
        ) : (
          filteredHosts.map(host => (
            <button
              key={host.id}
              type="button"
              onClick={() => onSelect(host.id)}
              className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-all ${
                selectedHostId === host.id
                  ? 'bg-blue-500/20 border-blue-500/50 text-blue-300'
                  : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-600'
              }`}
            >
              <Server className="w-5 h-5 flex-shrink-0" />
              <div className="flex-1 text-left min-w-0">
                <div className="font-medium truncate">
                  {host.name}
                  {host.isSelf && (
                    <span className="ml-2 text-xs text-gray-500">(this machine)</span>
                  )}
                </div>
                {host.url && (
                  <div className="text-xs text-gray-500 truncate">{host.url}</div>
                )}
              </div>
              {selectedHostId === host.id && (
                <CheckCircle className="w-5 h-5 text-blue-400 flex-shrink-0" />
              )}
            </button>
          ))
        )}
      </div>

      <p className="text-xs text-gray-500 mt-2">
        Choose which machine to create this agent on
      </p>
    </div>
  )
}


