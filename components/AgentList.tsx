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
  Upload,
  Moon,
  Power,
  LayoutGrid,
  List,
  Search,
  X,
  Brain,
  CheckCircle,
} from 'lucide-react'
import Link from 'next/link'
import CreateAgentAnimation, { getPreviewAvatarUrl } from './CreateAgentAnimation'
import WakeAgentDialog from './WakeAgentDialog'
import { useHosts } from '@/hooks/useHosts'
import { useSessionActivity, type SessionActivityStatus } from '@/hooks/useSessionActivity'
import { SubconsciousStatus } from './SubconsciousStatus'
import AgentBadge from './AgentBadge'

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
}: AgentListProps) {
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({})
  const [viewMode, setViewMode] = useState<'list' | 'grid'>(() => {
    if (typeof window === 'undefined') return 'list'
    return (localStorage.getItem('agent-sidebar-view-mode') as 'list' | 'grid') || 'list'
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

  // Session activity tracking (for waiting/active/idle status)
  const { getSessionActivity } = useSessionActivity()

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

  // Filter agents by selected host and search query
  const filteredAgents = useMemo(() => {
    let result = selectedHostFilter === 'all'
      ? agents
      : agents.filter((a) => a.hostId === selectedHostFilter)

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
  }, [agents, selectedHostFilter, searchQuery])

  // Group agents by tags (level1 = first tag, level2 = second tag)
  const groupedAgents = useMemo(() => {
    const groups: Record<string, Record<string, UnifiedAgent[]>> = {}

    filteredAgents.forEach((agent) => {
      const tags = agent.tags || []
      const level1 = tags[0] || 'ungrouped'
      const level2 = tags[1] || 'default'

      if (!groups[level1]) groups[level1] = {}
      if (!groups[level1][level2]) groups[level1][level2] = []

      groups[level1][level2].push(agent)
    })

    return groups
  }, [filteredAgents])

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
      if (sidebarWidth >= 480 && viewMode === 'list') {
        setViewMode('grid')
      } else if (sidebarWidth < 480 && viewMode === 'grid') {
        setViewMode('list')
      }
    }
  }, [sidebarWidth, viewMode, userOverrodeViewMode])

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
    // Check if this is a hibernated agent (offline but has session config)
    const isHibernated = agent.session?.status !== 'online' && (agent.sessions && agent.sessions.length > 0)

    if (agent.session?.status === 'online' || isHibernated) {
      // Online or hibernated agent - select and show tabs
      onAgentSelect(agent)
    } else {
      // Truly offline agent (no session config) - show profile panel
      onShowAgentProfile(agent)
    }
  }

  const handleHibernate = async (agent: UnifiedAgent, e: React.MouseEvent) => {
    e.stopPropagation()

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

  const handleWake = (agent: UnifiedAgent, e: React.MouseEvent) => {
    e.stopPropagation()
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
    setShowCreateModal(false)
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
            <div className="relative">
              {/* Pulsing ring when no agents */}
              {agents.length === 0 && (
                <>
                  <span className="absolute inset-0 rounded-lg bg-green-500/30 animate-ping" />
                  <span className="absolute inset-0 rounded-lg bg-green-500/20 animate-pulse" />
                </>
              )}
              <button
                onClick={() => setShowCreateModal(true)}
                className={`relative p-1.5 rounded-lg hover:bg-sidebar-hover transition-all duration-200 text-green-400 hover:text-green-300 hover:scale-110 ${
                  agents.length === 0 ? 'ring-2 ring-green-500/50' : ''
                }`}
                aria-label="Create new agent"
                title="Create new agent"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
            {/* View mode toggle */}
            <button
              onClick={() => {
                setViewMode(viewMode === 'list' ? 'grid' : 'list')
                setUserOverrodeViewMode(true) // User manually toggled, respect their choice
              }}
              className="p-1.5 rounded-lg hover:bg-sidebar-hover transition-all duration-200 text-gray-400 hover:text-gray-200 hover:scale-110"
              aria-label={viewMode === 'list' ? 'Switch to grid view' : 'Switch to list view'}
              title={viewMode === 'list' ? 'Grid view' : 'List view'}
            >
              {viewMode === 'list' ? (
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
                // Check if this is the self host by URL pattern (client-side detection)
                const isSelf = !host.url || host.url.includes('localhost') || host.url.includes('127.0.0.1')

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
                      {isSelf ? (
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
              onClick={() => setShowCreateModal(true)}
              className="px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-semibold rounded-xl shadow-lg shadow-green-500/25 hover:shadow-green-500/40 transition-all duration-300 transform hover:scale-105"
            >
              Create Your First Agent
            </button>
          </div>
        ) : viewMode === 'grid' ? (
          /* Grid View - Corporate Badge Layout with Collapsible Tag Groups */
          <div className="p-3 space-y-3">
            {Object.entries(groupedAgents)
              .sort(([a], [b]) => a.toLowerCase().localeCompare(b.toLowerCase()))
              .map(([level1, level2Groups]) => {
                const colors = getCategoryColor(level1)
                const agentCount = countAgentsInCategory(level1)
                const isExpanded = expandedLevel1.has(level1)

                return (
                  <div key={level1} className="rounded-lg overflow-hidden border border-slate-700/50">
                    {/* Level 1 Header - Collapsible */}
                    <button
                      onClick={() => toggleLevel1(level1)}
                      className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-700/30 transition-colors"
                      style={{ backgroundColor: colors.bg }}
                    >
                      <ChevronRight
                        className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
                        style={{ color: colors.icon }}
                      />
                      <span
                        className="font-bold uppercase text-xs tracking-wider flex-1 text-left"
                        style={{ color: colors.icon }}
                      >
                        {level1}
                      </span>
                      <span
                        className="text-xs px-2 py-0.5 rounded-full font-medium"
                        style={{ backgroundColor: colors.active, color: colors.activeText }}
                      >
                        {agentCount}
                      </span>
                    </button>

                    {/* Level 1 Content */}
                    {isExpanded && (
                      <div className="p-2 space-y-3 bg-slate-900/30">
                        {Object.entries(level2Groups)
                          .sort(([a], [b]) => a.toLowerCase().localeCompare(b.toLowerCase()))
                          .map(([level2, agentsList]) => {
                            const level2Key = `${level1}-${level2}`
                            const isLevel2Expanded = expandedLevel2.has(level2Key)

                            return (
                              <div key={level2Key}>
                                {/* Level 2 Header - Collapsible (skip if "default") */}
                                {level2 !== 'default' && (
                                  <button
                                    onClick={() => toggleLevel2(level1, level2)}
                                    className="w-full flex items-center gap-2 px-2 py-1.5 mb-2 rounded-md hover:bg-slate-700/30 transition-colors"
                                  >
                                    <ChevronRight
                                      className={`w-3 h-3 transition-transform duration-200 text-slate-400 ${isLevel2Expanded ? 'rotate-90' : ''}`}
                                    />
                                    <Folder className="w-3.5 h-3.5" style={{ color: colors.icon }} />
                                    <span className="text-xs text-slate-300 capitalize flex-1 text-left">
                                      {level2}
                                    </span>
                                    <span
                                      className="text-[10px] px-1.5 py-0.5 rounded-full"
                                      style={{ backgroundColor: colors.bg, color: colors.icon }}
                                    >
                                      {agentsList.length}
                                    </span>
                                  </button>
                                )}

                                {/* Agent Grid */}
                                {(level2 === 'default' || isLevel2Expanded) && (
                                  <div
                                    className="grid gap-2"
                                    style={{ gridTemplateColumns: `repeat(${gridColumns}, minmax(0, 1fr))` }}
                                  >
                                    {[...agentsList]
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
                                        const session = agent.sessions?.[0]
                                        const isOnline = session?.status === 'online'
                                        const isHibernated = !isOnline && agent.sessions && agent.sessions.length > 0
                                        const sessionName = agent.name
                                        const activityInfo = sessionName ? getSessionActivity(sessionName) : null

                                        return (
                                          <AgentBadge
                                            key={agent.id}
                                            agent={agent}
                                            isSelected={activeAgentId === agent.id}
                                            activityStatus={activityInfo?.status}
                                            unreadCount={unreadCounts[agent.id]}
                                            onSelect={handleAgentClick}
                                            onRename={() => onShowAgentProfile(agent)}
                                            onDelete={() => onShowAgentProfileDangerZone?.(agent)}
                                            onHibernate={isOnline ? () => {
                                              handleHibernate(agent, { stopPropagation: () => {} } as React.MouseEvent)
                                            } : undefined}
                                            onWake={isHibernated ? () => setWakeDialogAgent(agent) : undefined}
                                            onOpenTerminal={isOnline ? () => handleAgentClick(agent) : undefined}
                                            onSendMessage={() => {/* TODO: Implement send message dialog */}}
                                            onCopyId={() => navigator.clipboard.writeText(agent.id)}
                                          />
                                        )
                                      })}
                                  </div>
                                )}
                              </div>
                            )
                          })}
                      </div>
                    )}
                  </div>
                )
              })}
          </div>
        ) : (
          /* List View - Hierarchical Layout */
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
                  {/* Level 1 Header - Drop target */}
                  <button
                    onClick={() => toggleLevel1(level1)}
                    onDragOver={(e) => handleDragOver(e, level1)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, level1)}
                    className={`w-full px-3 py-2.5 flex items-center gap-3 text-left hover:bg-sidebar-hover transition-all duration-200 group rounded-lg mx-1 ${
                      dropTarget === level1 ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-gray-900' : ''
                    }`}
                    style={{
                      backgroundColor: dropTarget === level1 ? colors.active : (isExpanded ? colors.bg : 'transparent'),
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
                            {/* Level 2 Header (hide if it's "default") - Drop target */}
                            {level2 !== 'default' && (
                              <button
                                onClick={() => toggleLevel2(level1, level2)}
                                onDragOver={(e) => handleDragOver(e, level2Key)}
                                onDragLeave={handleDragLeave}
                                onDrop={(e) => handleDrop(e, level1, level2)}
                                className={`w-full px-3 py-2 pl-10 flex items-center gap-2 text-left hover:bg-sidebar-hover transition-all duration-200 rounded-lg group ${
                                  dropTarget === level2Key ? 'ring-2 ring-blue-500 ring-offset-1 ring-offset-gray-900' : ''
                                }`}
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
                                  const session = agent.sessions?.[0]
                                  const isOnline = session?.status === 'online'
                                  const isHibernated = !isOnline && agent.sessions && agent.sessions.length > 0
                                  const indentClass = level2 === 'default' ? 'pl-10' : 'pl-14'

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
                                                className="w-10 h-10 flex-shrink-0"
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
                                                onClick={(e) => handleHibernate(agent, e)}
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
                                                onClick={(e) => handleWake(agent, e)}
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

      {/* Footer - Collapsible */}
      <div className="border-t border-sidebar-border mt-auto">
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

      {/* Create Agent Modal */}
      {showCreateModal && (
        <CreateAgentModal
          onClose={() => setShowCreateModal(false)}
          onCreate={handleCreateAgent}
          onComplete={handleCreateComplete}
          loading={actionLoading}
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
      <div className="flex items-center flex-shrink-0" title="Hibernated - Click to wake">
        <Power className="w-3.5 h-3.5 text-gray-500" />
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

// Animated Create Modal
function CreateAgentModal({
  onClose,
  onCreate,
  onComplete,
  loading,
}: {
  onClose: () => void
  onCreate: (name: string, workingDirectory?: string, hostId?: string, label?: string, avatar?: string, programArgs?: string) => Promise<boolean>
  onComplete: () => void
  loading: boolean
}) {
  const { hosts } = useHosts()
  const [name, setName] = useState('')
  const [workingDirectory, setWorkingDirectory] = useState('')
  const [programArgs, setProgramArgs] = useState('')
  const [selectedHostId, setSelectedHostId] = useState<string>('')
  const [animationPhase, setAnimationPhase] = useState<'naming' | 'preparing' | 'creating' | 'ready' | 'error'>('creating')

  // Set default host to self/local host on mount
  useEffect(() => {
    if (hosts.length > 0 && !selectedHostId) {
      const selfHost = hosts.find(h => h.isSelf) || hosts[0]
      setSelectedHostId(selfHost.id)
    }
  }, [hosts, selectedHostId])
  const [animationProgress, setAnimationProgress] = useState(0)
  const [isCreating, setIsCreating] = useState(false)  // Animation in progress
  const [creationSuccess, setCreationSuccess] = useState(false)  // Agent created successfully
  const [showButton, setShowButton] = useState(false)  // Show "Let's Go!" button

  // Fun AI-themed aliases - split by gender to match avatar photos
  // IA names are feminine (Spanish style), AI names are masculine
  const FEMALE_ALIASES = [
    'MarIA', 'SofIA', 'LucIA', 'JulIA', 'NatalIA', 'OlivIA', 'VictorIA', 'ValerIA',
    'NovaIA', 'StellaIA', 'AuroraIA', 'CelestIA', 'HarmonIA', 'SerenIA', 'DataIA',
  ]
  const MALE_ALIASES = [
    'LunAI', 'NovAI', 'AriAI', 'ZarAI', 'KAI', 'SkyAI', 'MaxAI', 'LeoAI',
    'MirAI', 'EchoAI', 'ZenAI', 'NeoAI', 'PixAI', 'BytAI', 'CodeAI',
    'AtlAI', 'OrionAI', 'PhoenixAI', 'TitanAI', 'VegAI', 'CosmAI',
  ]

  // Get a gender-matched alias based on the agent name
  // Uses same hash logic as AgentBadge avatar selection for consistency
  const getRandomAlias = (agentName: string): string => {
    let hash = 0
    for (let i = 0; i < agentName.length; i++) {
      const char = agentName.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash
    }
    // Same gender logic as avatar - ensures name matches photo gender
    const isMale = (Math.abs(hash >> 8) % 2 === 0)
    const aliases = isMale ? MALE_ALIASES : FEMALE_ALIASES
    return aliases[Math.abs(hash) % aliases.length]
  }

  // Animate through phases when creating - spread over 10 seconds for a delightful experience
  useEffect(() => {
    if (isCreating) {
      // Reset and start animation sequence
      setAnimationPhase('preparing')
      setAnimationProgress(5)

      // Progress updates for preparing phase (0-2.5s)
      const timer1 = setTimeout(() => {
        setAnimationProgress(12)
      }, 500)

      const timer2 = setTimeout(() => {
        setAnimationProgress(20)
      }, 1000)

      const timer3 = setTimeout(() => {
        setAnimationProgress(28)
      }, 1800)

      // Transition to creating phase (2.5s)
      const timer4 = setTimeout(() => {
        setAnimationPhase('creating')
        setAnimationProgress(35)
      }, 2500)

      // Progress updates for creating phase (2.5-6s)
      const timer5 = setTimeout(() => {
        setAnimationProgress(45)
      }, 3200)

      const timer6 = setTimeout(() => {
        setAnimationProgress(55)
      }, 3900)

      const timer7 = setTimeout(() => {
        setAnimationProgress(65)
      }, 4600)

      const timer8 = setTimeout(() => {
        setAnimationProgress(78)
      }, 5300)

      const timer9 = setTimeout(() => {
        setAnimationProgress(90)
      }, 6000)

      // Transition to ready/celebration phase (6.5s)
      const timer10 = setTimeout(() => {
        setAnimationPhase('ready')
        setAnimationProgress(100)
      }, 6500)

      // Show the "Let's Go!" button after celebration animations complete (8s)
      const timer11 = setTimeout(() => {
        if (creationSuccess) {
          setShowButton(true)
        }
      }, 8000)

      return () => {
        clearTimeout(timer1)
        clearTimeout(timer2)
        clearTimeout(timer3)
        clearTimeout(timer4)
        clearTimeout(timer5)
        clearTimeout(timer6)
        clearTimeout(timer7)
        clearTimeout(timer8)
        clearTimeout(timer9)
        clearTimeout(timer10)
        clearTimeout(timer11)
      }
    }
  }, [isCreating, creationSuccess])

  // Show button when API completes successfully and we're in ready phase
  useEffect(() => {
    if (creationSuccess && animationPhase === 'ready') {
      // Small delay after reaching ready phase to let animations settle
      const timer = setTimeout(() => {
        setShowButton(true)
      }, 1500)
      return () => clearTimeout(timer)
    }
  }, [creationSuccess, animationPhase])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (name.trim()) {
      setIsCreating(true)
      // Generate persona name (like "NatalIA") and avatar URL to be saved
      // These must match what's shown in the preview animation
      const personaName = getRandomAlias(name.trim())
      const avatarUrl = getPreviewAvatarUrl(name.trim())
      // Pass selectedHostId to create agent on the chosen host
      const success = await onCreate(name.trim(), workingDirectory.trim() || undefined, selectedHostId || undefined, personaName, avatarUrl, programArgs.trim() || undefined)
      if (success) {
        setCreationSuccess(true)
        // Animation continues, user will click "Let's Go!" to close
      } else {
        // Error occurred, close modal
        setIsCreating(false)
      }
    }
  }

  const handleLetsGo = () => {
    onComplete()
  }

  // Show animation when creating or when celebration is showing
  const showAnimation = isCreating || creationSuccess

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50" onClick={showAnimation ? undefined : onClose}>
      <div className="bg-gray-900 rounded-xl w-full max-w-lg shadow-2xl border border-gray-700 overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {showAnimation ? (
          // Animated creation view
          <div className="p-6">
            <div className="text-center mb-2">
              <h3 className="text-lg font-semibold text-gray-100">
                {animationPhase === 'ready' ? 'Your Agent is Ready!' : 'Creating Your Agent'}
              </h3>
              {animationPhase !== 'ready' && <p className="text-sm text-gray-400">{name}</p>}
            </div>
            <CreateAgentAnimation
              phase={animationPhase}
              agentName={name}
              agentAlias={getRandomAlias(name)}
              avatarUrl={getPreviewAvatarUrl(name)}
              progress={animationProgress}
              showNextSteps={showButton}
            />
            {/* Let's Go button - appears after celebration */}
            {showButton && (
              <div className="mt-6 flex justify-center">
                <button
                  onClick={handleLetsGo}
                  className="px-8 py-3 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-semibold rounded-xl shadow-lg shadow-green-500/25 hover:shadow-green-500/40 transition-all duration-300 transform hover:scale-105 flex items-center gap-2"
                >
                  <span>Let&apos;s Go!</span>
                  <span className="text-lg">🚀</span>
                </button>
              </div>
            )}
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
                <div>
                  <label htmlFor="program-args" className="block text-sm font-medium text-gray-300 mb-1">
                    Program Arguments (optional)
                  </label>
                  <input
                    id="program-args"
                    type="text"
                    value={programArgs}
                    onChange={(e) => setProgramArgs(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    CLI flags passed to the program on launch (e.g. --continue --chrome)
                  </p>
                </div>
                {hosts.length > 1 && (
                  <HostSelector
                    hosts={hosts}
                    selectedHostId={selectedHostId}
                    onSelect={setSelectedHostId}
                  />
                )}
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
