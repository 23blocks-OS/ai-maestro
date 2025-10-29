'use client'

import { useMemo, useState, useEffect } from 'react'
import type { Session } from '@/types/session'
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
  FileText,
  Boxes,
  Brain,
  Package,
  Zap,
  Code2,
  Mail,
  RotateCcw,
} from 'lucide-react'

interface SessionListProps {
  sessions: Session[]
  activeSessionId: string | null
  onSessionSelect: (sessionId: string) => void
  loading?: boolean
  error?: Error | null
  onRefresh?: () => void
  onToggleSidebar?: () => void
}

/**
 * DYNAMIC COLOR SYSTEM
 *
 * Colors are automatically assigned to categories based on their name.
 * The same category will always get the same color (using a hash function).
 *
 * HOW IT WORKS:
 * 1. When a category appears, a hash is generated from its name
 * 2. The hash picks a color from the COLOR_PALETTE array below
 * 3. Same category name = same hash = same color (consistent)
 *
 * CUSTOMIZATION:
 * - Edit COLOR_PALETTE below to change the available colors
 * - Add more color objects to increase variety
 * - Colors are stored in localStorage if you want to override specific categories
 *
 * NO HARDCODING NEEDED - works with ANY category name!
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

// Default icon for categories
const DEFAULT_ICON = Layers

export default function SessionList({
  sessions,
  activeSessionId,
  onSessionSelect,
  loading,
  error,
  onRefresh,
  onToggleSidebar,
}: SessionListProps) {
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showRenameModal, setShowRenameModal] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [selectedSession, setSelectedSession] = useState<Session | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({})
  const [restorableCount, setRestorableCount] = useState(0)
  const [showRestoreModal, setShowRestoreModal] = useState(false)

  // State for accordion panels - load from localStorage
  const [expandedLevel1, setExpandedLevel1] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set()
    const saved = localStorage.getItem('sidebar-expanded-level1')
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
    const saved = localStorage.getItem('sidebar-expanded-level2')
    if (saved) {
      try {
        return new Set(JSON.parse(saved))
      } catch (e) {
        return new Set()
      }
    }
    return new Set()
  })

  // Group sessions by level1-level2-level3 naming convention
  const groupedSessions = useMemo(() => {
    const groups: Record<string, Record<string, Session[]>> = {}

    sessions.forEach((session) => {
      const parts = session.id.split('-')

      if (parts.length >= 3) {
        // Has full hierarchy: level1-level2-sessionName
        const level1 = parts[0]
        const level2 = parts[1]
        const sessionName = parts.slice(2).join('-') // Everything after level2

        if (!groups[level1]) groups[level1] = {}
        if (!groups[level1][level2]) groups[level1][level2] = []

        groups[level1][level2].push({
          ...session,
          name: sessionName, // Display name is just level3+
        })
      } else if (parts.length === 2) {
        // Only level1-sessionName, put in "default" level2
        const level1 = parts[0]
        const level2 = 'default'
        const sessionName = parts[1]

        if (!groups[level1]) groups[level1] = {}
        if (!groups[level1][level2]) groups[level1][level2] = []

        groups[level1][level2].push({
          ...session,
          name: sessionName,
        })
      } else {
        // No hierarchy, put in "Ungrouped" > "default"
        const level1 = 'ungrouped'
        const level2 = 'default'

        if (!groups[level1]) groups[level1] = {}
        if (!groups[level1][level2]) groups[level1][level2] = []

        groups[level1][level2].push(session)
      }
    })

    return groups
  }, [sessions])

  // Initialize NEW panels as open (but preserve user's collapsed state)
  useEffect(() => {
    setExpandedLevel1((prev) => {
      const newExpanded = new Set(prev)
      // Only add NEW level1 categories that don't exist yet
      Object.keys(groupedSessions).forEach((level1) => {
        if (!prev.has(level1)) {
          newExpanded.add(level1)
        }
      })
      return newExpanded
    })

    setExpandedLevel2((prev) => {
      const newExpanded = new Set(prev)
      // Only add NEW level2 categories that don't exist yet
      Object.entries(groupedSessions).forEach(([level1, level2Groups]) => {
        Object.keys(level2Groups).forEach((level2) => {
          const key = `${level1}-${level2}`
          if (!prev.has(key)) {
            newExpanded.add(key)
          }
        })
      })
      return newExpanded
    })
  }, [groupedSessions])

  // Save expandedLevel1 to localStorage whenever it changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('sidebar-expanded-level1', JSON.stringify(Array.from(expandedLevel1)))
    }
  }, [expandedLevel1])

  // Save expandedLevel2 to localStorage whenever it changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('sidebar-expanded-level2', JSON.stringify(Array.from(expandedLevel2)))
    }
  }, [expandedLevel2])

  // Fetch unread message counts for all sessions
  useEffect(() => {
    const fetchUnreadCounts = async () => {
      const counts: Record<string, number> = {}

      for (const session of sessions) {
        try {
          const response = await fetch(`/api/messages?session=${encodeURIComponent(session.id)}&action=unread-count`)
          const data = await response.json()
          if (data.count > 0) {
            counts[session.id] = data.count
          }
        } catch (error) {
          // Silently fail - message counts are not critical
        }
      }

      setUnreadCounts(counts)
    }

    fetchUnreadCounts()

    // Refresh every 10 seconds
    const interval = setInterval(fetchUnreadCounts, 10000)
    return () => clearInterval(interval)
  }, [sessions])

  // Fetch restorable sessions count
  useEffect(() => {
    const fetchRestorableCount = async () => {
      try {
        const response = await fetch('/api/sessions/restore')
        const data = await response.json()
        setRestorableCount(data.count || 0)
      } catch (error) {
        // Silently fail - restorable count is not critical
      }
    }

    fetchRestorableCount()

    // Refresh every 30 seconds
    const interval = setInterval(fetchRestorableCount, 30000)
    return () => clearInterval(interval)
  }, [sessions])

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

  // Get color scheme for a category - dynamically assigns from palette
  const getCategoryColor = (category: string) => {
    // Try to load custom color from localStorage first
    const storageKey = `category-color-${category.toLowerCase()}`
    const savedColor = localStorage.getItem(storageKey)
    if (savedColor) {
      try {
        return JSON.parse(savedColor)
      } catch (e) {
        // Invalid stored color, continue to default
      }
    }

    // Generate a consistent hash from the category name
    const hash = category.split('').reduce((acc, char) => {
      return char.charCodeAt(0) + ((acc << 5) - acc)
    }, 0)

    // Use hash to pick a color from palette (ensures same category always gets same color)
    const colorIndex = Math.abs(hash) % COLOR_PALETTE.length
    return COLOR_PALETTE[colorIndex]
  }

  // Get icon for a category - uses default icon for all
  const getCategoryIcon = (category: string, isExpanded: boolean) => {
    return DEFAULT_ICON
  }

  // Count total sessions in a level1 category
  const countSessionsInCategory = (level1: string) => {
    const level2Groups = groupedSessions[level1]
    return Object.values(level2Groups).reduce((sum, sessions) => sum + sessions.length, 0)
  }

  const handleCreateSession = async (name: string, workingDirectory?: string) => {
    setActionLoading(true)
    try {
      const response = await fetch('/api/sessions/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, workingDirectory }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to create session')
      }

      setShowCreateModal(false)
      onRefresh?.()
      // Navigate to new session after refresh
      setTimeout(() => onSessionSelect(name), 500)
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to create session')
    } finally {
      setActionLoading(false)
    }
  }

  const handleRenameSession = async (newName: string) => {
    if (!selectedSession) return

    setActionLoading(true)
    try {
      const response = await fetch(`/api/sessions/${selectedSession.id}/rename`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newName }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to rename session')
      }

      setShowRenameModal(false)
      setSelectedSession(null)
      onRefresh?.()
      // Navigate to renamed session if it was active
      if (activeSessionId === selectedSession.id) {
        setTimeout(() => onSessionSelect(newName), 500)
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to rename session')
    } finally {
      setActionLoading(false)
    }
  }

  const handleDeleteSession = async () => {
    if (!selectedSession) return

    setActionLoading(true)
    try {
      const response = await fetch(`/api/sessions/${selectedSession.id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to delete session')
      }

      setShowDeleteConfirm(false)
      setSelectedSession(null)
      onRefresh?.()
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to delete session')
    } finally {
      setActionLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-sidebar-border">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-100">AI Agents</h2>
          <div className="flex items-center gap-2">
            {restorableCount > 0 && (
              <button
                onClick={() => setShowRestoreModal(true)}
                className="p-1.5 rounded-lg hover:bg-sidebar-hover transition-all duration-200 text-orange-400 hover:text-orange-300 hover:scale-110 relative"
                aria-label="Restore sessions"
                title={`Restore ${restorableCount} saved ${restorableCount === 1 ? 'session' : 'sessions'}`}
              >
                <RotateCcw className="w-4 h-4" />
                <span className="absolute -top-1 -right-1 bg-orange-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-bold">
                  {restorableCount}
                </span>
              </button>
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
              aria-label="Refresh sessions"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-1">
          {sessions.length} {sessions.length === 1 ? 'agent' : 'agents'}
        </p>
      </div>

      {/* Error State */}
      {error && (
        <div className="px-4 py-3 bg-red-900/20 border-b border-red-800">
          <p className="text-sm text-red-400">Failed to load sessions</p>
        </div>
      )}

      {/* Session List */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {loading && sessions.length === 0 ? (
          <div className="px-4 py-8 text-center text-gray-400">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-400 mx-auto mb-2"></div>
            <p className="text-sm">Loading sessions...</p>
          </div>
        ) : sessions.length === 0 ? (
          <div className="px-4 py-8 text-center text-gray-400">
            <p className="text-sm mb-2">No active agents</p>
            <p className="text-xs text-gray-500 mb-4">
              Create a new agent to get started
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
            {Object.entries(groupedSessions).map(([level1, level2Groups]) => {
              const colors = getCategoryColor(level1)
              const isExpanded = expandedLevel1.has(level1)
              const CategoryIcon = getCategoryIcon(level1, isExpanded)
              const sessionCount = countSessionsInCategory(level1)

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
                    {/* Icon with colored background */}
                    <div
                      className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-200"
                      style={{
                        backgroundColor: colors.bg,
                        border: `1px solid ${colors.border}40`,
                      }}
                    >
                      <CategoryIcon className="w-4 h-4" style={{ color: colors.icon }} />
                    </div>

                    {/* Category name and count */}
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
                        {sessionCount}
                      </span>
                    </div>

                    {/* Chevron */}
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
                      {Object.entries(level2Groups).map(([level2, sessionsList]) => {
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
                                {/* Folder icon */}
                                <div className="flex-shrink-0">
                                  {isLevel2Expanded ? (
                                    <FolderOpen className="w-3.5 h-3.5" style={{ color: colors.icon }} />
                                  ) : (
                                    <Folder className="w-3.5 h-3.5" style={{ color: colors.icon }} />
                                  )}
                                </div>

                                {/* Subcategory name */}
                                <span className="text-sm text-gray-300 capitalize flex-1 truncate">
                                  {level2}
                                </span>

                                {/* Count badge */}
                                <span
                                  className="text-xs px-1.5 py-0.5 rounded-full"
                                  style={{
                                    backgroundColor: colors.bg,
                                    color: colors.icon,
                                  }}
                                >
                                  {sessionsList.length}
                                </span>

                                {/* Chevron */}
                                <ChevronRight
                                  className={`w-3 h-3 transition-transform duration-200 ${
                                    isLevel2Expanded ? 'rotate-90' : ''
                                  }`}
                                  style={{ color: colors.icon }}
                                />
                              </button>
                            )}

                            {/* Sessions */}
                            {(level2 === 'default' || isLevel2Expanded) && (
                              <ul className="space-y-0.5">
                                {sessionsList.map((session) => {
                                  const isActive = activeSessionId === session.id
                                  const indentClass = level2 === 'default' ? 'pl-10' : 'pl-14'

                                  return (
                                    <li key={session.id} className="group/session relative">
                                      <div
                                        onClick={() => onSessionSelect(session.id)}
                                        className={`w-full py-2.5 px-3 ${indentClass} text-left transition-all duration-200 cursor-pointer rounded-lg relative overflow-hidden ${
                                          isActive
                                            ? 'shadow-sm'
                                            : 'hover:bg-sidebar-hover'
                                        }`}
                                        style={{
                                          backgroundColor: isActive ? colors.active : 'transparent',
                                        }}
                                      >
                                        {/* Active indicator - left accent */}
                                        {isActive && (
                                          <div
                                            className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 rounded-r-full transition-all duration-200"
                                            style={{ backgroundColor: colors.border }}
                                          />
                                        )}

                                        <div className="flex items-center justify-between gap-2">
                                          <div className="flex-1 min-w-0 flex items-center gap-2">
                                            {/* Terminal icon */}
                                            <Terminal
                                              className="w-3.5 h-3.5 flex-shrink-0"
                                              style={{ color: isActive ? colors.activeText : colors.icon }}
                                            />

                                            {/* Session name */}
                                            <span
                                              className={`text-sm truncate font-medium ${
                                                isActive ? 'font-semibold' : ''
                                              }`}
                                              style={{
                                                color: isActive ? colors.activeText : 'rgb(229, 231, 235)',
                                              }}
                                            >
                                              {session.name || session.id}
                                            </span>

                                            {/* Unread message indicator */}
                                            {unreadCounts[session.id] && unreadCounts[session.id] > 0 && (
                                              <div className="flex items-center gap-1 flex-shrink-0">
                                                <Mail className="w-3 h-3 text-blue-400" />
                                                <span className="text-xs font-bold text-white bg-blue-500 px-1.5 py-0.5 rounded-full">
                                                  {unreadCounts[session.id]}
                                                </span>
                                              </div>
                                            )}

                                            {/* Status indicator */}
                                            <SessionStatus status={session.status} />
                                          </div>

                                          {/* Action buttons - show on hover */}
                                          <div className="hidden group-hover/session:flex items-center gap-1">
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation()
                                                setSelectedSession(session)
                                                setShowRenameModal(true)
                                              }}
                                              className="p-1 rounded hover:bg-gray-700/50 text-gray-400 hover:text-blue-400 transition-all duration-200"
                                              title="Rename agent"
                                            >
                                              <Edit2 className="w-3 h-3" />
                                            </button>
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation()
                                                setSelectedSession(session)
                                                setShowDeleteConfirm(true)
                                              }}
                                              className="p-1 rounded hover:bg-gray-700/50 text-gray-400 hover:text-red-400 transition-all duration-200"
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

                  {/* Divider between Level 1 categories */}
                  <div className="my-2 mx-4 border-t border-gray-800/50" />
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Create Session Modal */}
      {showCreateModal && (
        <CreateSessionModal
          onClose={() => setShowCreateModal(false)}
          onCreate={handleCreateSession}
          loading={actionLoading}
        />
      )}

      {/* Rename Session Modal */}
      {showRenameModal && selectedSession && (
        <RenameSessionModal
          currentName={selectedSession.id}
          onClose={() => {
            setShowRenameModal(false)
            setSelectedSession(null)
          }}
          onRename={handleRenameSession}
          loading={actionLoading}
        />
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && selectedSession && (
        <DeleteConfirmModal
          sessionName={selectedSession.id}
          onClose={() => {
            setShowDeleteConfirm(false)
            setSelectedSession(null)
          }}
          onDelete={handleDeleteSession}
          loading={actionLoading}
        />
      )}

      {/* Restore Sessions Modal */}
      {showRestoreModal && (
        <RestoreSessionsModal
          onClose={() => setShowRestoreModal(false)}
          onRestore={(restored) => {
            setShowRestoreModal(false)
            setRestorableCount(0)
            onRefresh?.()
          }}
          loading={actionLoading}
          setLoading={setActionLoading}
        />
      )}
    </div>
  )
}

function SessionStatus({ status }: { status: Session['status'] }) {

  const statusConfig = {
    active: { color: 'bg-green-500', label: 'Active', ring: 'ring-green-500/30' },
    idle: { color: 'bg-yellow-500', label: 'Idle', ring: 'ring-yellow-500/30' },
    disconnected: { color: 'bg-gray-500', label: 'Disconnected', ring: 'ring-gray-500/30' },
  }

  const config = statusConfig[status]

  return (
    <div className="flex items-center gap-1.5 flex-shrink-0">
      <div
        className={`w-2 h-2 rounded-full ${config.color} ring-2 ${config.ring} ${
          status === 'active' ? 'animate-pulse' : ''
        }`}
      />
      <span className="text-xs text-gray-400 hidden lg:inline">{config.label}</span>
    </div>
  )
}

// Modal Components
function CreateSessionModal({
  onClose,
  onCreate,
  loading,
}: {
  onClose: () => void
  onCreate: (name: string, workingDirectory?: string) => void
  loading: boolean
}) {
  const [name, setName] = useState('')
  const [workingDirectory, setWorkingDirectory] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (name.trim()) {
      onCreate(name.trim(), workingDirectory.trim() || undefined)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-gray-800 rounded-xl p-6 w-full max-w-md shadow-2xl border border-gray-700" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-gray-100 mb-4">Create New Agent</h3>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label htmlFor="session-name" className="block text-sm font-medium text-gray-300 mb-1">
                Agent Name *
              </label>
              <input
                id="session-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="apps-notify-session1"
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                autoFocus
                pattern="[a-zA-Z0-9_\-]+"
                title="Only letters, numbers, dashes, and underscores allowed"
              />
              <p className="text-xs text-gray-400 mt-1">
                Format: level1-level2-sessionName (e.g., apps-notify-batman)
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
                placeholder={process.env.HOME || '/home/user'}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-gray-100 disabled:opacity-50 transition-colors rounded-lg hover:bg-gray-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-blue-500/25"
            >
              {loading ? 'Creating...' : 'Create Agent'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function RenameSessionModal({
  currentName,
  onClose,
  onRename,
  loading,
}: {
  currentName: string
  onClose: () => void
  onRename: (newName: string) => void
  loading: boolean
}) {
  const [newName, setNewName] = useState(currentName)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (newName.trim() && newName !== currentName) {
      onRename(newName.trim())
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-gray-800 rounded-xl p-6 w-full max-w-md shadow-2xl border border-gray-700" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-gray-100 mb-4">Rename Agent</h3>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label htmlFor="new-name" className="block text-sm font-medium text-gray-300 mb-1">
                New Name
              </label>
              <input
                id="new-name"
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                autoFocus
                pattern="[a-zA-Z0-9_\-]+"
                title="Only letters, numbers, dashes, and underscores allowed"
              />
              <p className="text-xs text-gray-400 mt-1">
                Format: level1-level2-sessionName (changing parts will move the session in the hierarchy)
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-gray-100 disabled:opacity-50 transition-colors rounded-lg hover:bg-gray-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !newName.trim() || newName === currentName}
              className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-blue-500/25"
            >
              {loading ? 'Renaming...' : 'Rename'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function DeleteConfirmModal({
  sessionName,
  onClose,
  onDelete,
  loading,
}: {
  sessionName: string
  onClose: () => void
  onDelete: () => void
  loading: boolean
}) {
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-gray-800 rounded-xl p-6 w-full max-w-md shadow-2xl border border-gray-700" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-red-400 mb-4">Delete Agent</h3>
        <p className="text-gray-300 mb-2">
          Are you sure you want to delete the agent <span className="font-mono font-bold">{sessionName}</span>?
        </p>
        <p className="text-sm text-gray-400 mb-6">
          This will terminate the agent and all processes running in it. This action cannot be undone.
        </p>
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-gray-100 disabled:opacity-50 transition-colors rounded-lg hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            onClick={onDelete}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-red-500/25"
          >
            {loading ? 'Deleting...' : 'Delete Session'}
          </button>
        </div>
      </div>
    </div>
  )
}

interface PersistedSession {
  id: string
  name: string
  workingDirectory: string
  createdAt: string
  lastSavedAt: string
}

function RestoreSessionsModal({
  onClose,
  onRestore,
  loading,
  setLoading,
}: {
  onClose: () => void
  onRestore: (restored: number) => void
  loading: boolean
  setLoading: (loading: boolean) => void
}) {
  const [sessions, setSessions] = useState<PersistedSession[]>([])
  const [selectedSessions, setSelectedSessions] = useState<Set<string>>(new Set())
  const [fetchLoading, setFetchLoading] = useState(true)

  useEffect(() => {
    const fetchSessions = async () => {
      try {
        const response = await fetch('/api/sessions/restore')
        const data = await response.json()
        setSessions(data.sessions || [])
        // Select all sessions by default
        setSelectedSessions(new Set(data.sessions?.map((s: PersistedSession) => s.id) || []))
      } catch (error) {
        console.error('Failed to fetch restorable sessions:', error)
      } finally {
        setFetchLoading(false)
      }
    }

    fetchSessions()
  }, [])

  const toggleSession = (sessionId: string) => {
    setSelectedSessions((prev) => {
      const next = new Set(prev)
      if (next.has(sessionId)) {
        next.delete(sessionId)
      } else {
        next.add(sessionId)
      }
      return next
    })
  }

  const handleRestoreSelected = async () => {
    if (selectedSessions.size === 0) return

    setLoading(true)
    try {
      const restorePromises = Array.from(selectedSessions).map((sessionId) =>
        fetch('/api/sessions/restore', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId }),
        })
      )

      await Promise.all(restorePromises)
      onRestore(selectedSessions.size)
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to restore sessions')
    } finally {
      setLoading(false)
    }
  }

  const handleRestoreAll = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/sessions/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true }),
      })

      if (!response.ok) {
        throw new Error('Failed to restore all sessions')
      }

      onRestore(sessions.length)
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to restore sessions')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-gray-800 rounded-xl p-6 w-full max-w-2xl shadow-2xl border border-gray-700 max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-orange-400 mb-4 flex items-center gap-2">
          <RotateCcw className="w-5 h-5" />
          Restore Saved Sessions
        </h3>

        {fetchLoading ? (
          <div className="py-12 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-400 mx-auto mb-2"></div>
            <p className="text-sm text-gray-400">Loading saved sessions...</p>
          </div>
        ) : sessions.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-gray-400">No saved sessions to restore</p>
          </div>
        ) : (
          <>
            <p className="text-sm text-gray-400 mb-4">
              Select sessions to restore. These sessions were previously created but are not currently active.
            </p>

            {/* Session List */}
            <div className="flex-1 overflow-y-auto space-y-2 mb-4 max-h-96">
              {sessions.map((session) => (
                <label
                  key={session.id}
                  className="flex items-start gap-3 p-3 rounded-lg bg-gray-700/50 hover:bg-gray-700 transition-all cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedSessions.has(session.id)}
                    onChange={() => toggleSession(session.id)}
                    className="mt-1 w-4 h-4 rounded border-gray-600 text-orange-500 focus:ring-orange-500 focus:ring-offset-gray-800"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Terminal className="w-4 h-4 text-orange-400 flex-shrink-0" />
                      <span className="font-mono font-semibold text-gray-100 truncate">{session.id}</span>
                    </div>
                    <div className="text-xs text-gray-400 space-y-0.5">
                      <div className="flex items-center gap-1">
                        <Folder className="w-3 h-3" />
                        <span className="truncate">{session.workingDirectory}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span>Created: {formatDistanceToNow(session.createdAt)}</span>
                        <span>Last saved: {formatDistanceToNow(session.lastSavedAt)}</span>
                      </div>
                    </div>
                  </div>
                </label>
              ))}
            </div>

            {/* Actions */}
            <div className="flex justify-between items-center gap-3 pt-4 border-t border-gray-700">
              <button
                type="button"
                onClick={() => {
                  if (selectedSessions.size === sessions.length) {
                    setSelectedSessions(new Set())
                  } else {
                    setSelectedSessions(new Set(sessions.map((s) => s.id)))
                  }
                }}
                className="text-sm text-orange-400 hover:text-orange-300 underline"
              >
                {selectedSessions.size === sessions.length ? 'Deselect All' : 'Select All'}
              </button>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={loading}
                  className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-gray-100 disabled:opacity-50 transition-colors rounded-lg hover:bg-gray-700"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRestoreSelected}
                  disabled={loading || selectedSessions.size === 0}
                  className="px-4 py-2 text-sm font-medium bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-orange-500/25"
                >
                  {loading
                    ? 'Restoring...'
                    : `Restore ${selectedSessions.size} ${selectedSessions.size === 1 ? 'Session' : 'Sessions'}`}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
