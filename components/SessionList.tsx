'use client'

import { useMemo, useState, useEffect } from 'react'
import type { Session } from '@/types/session'
import { formatDistanceToNow } from '@/lib/utils'

interface SessionListProps {
  sessions: Session[]
  activeSessionId: string | null
  onSessionSelect: (sessionId: string) => void
  loading?: boolean
  error?: Error | null
  onRefresh?: () => void
}

export default function SessionList({
  sessions,
  activeSessionId,
  onSessionSelect,
  loading,
  error,
  onRefresh,
}: SessionListProps) {
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showRenameModal, setShowRenameModal] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [selectedSession, setSelectedSession] = useState<Session | null>(null)
  const [actionLoading, setActionLoading] = useState(false)

  // State for accordion panels
  const [expandedLevel1, setExpandedLevel1] = useState<Set<string>>(new Set())
  const [expandedLevel2, setExpandedLevel2] = useState<Set<string>>(new Set())

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

  // Initialize all panels as open on first render
  useEffect(() => {
    const level1Keys = new Set(Object.keys(groupedSessions))
    const level2Keys = new Set<string>()

    Object.entries(groupedSessions).forEach(([level1, level2Groups]) => {
      Object.keys(level2Groups).forEach((level2) => {
        level2Keys.add(`${level1}-${level2}`)
      })
    })

    setExpandedLevel1(level1Keys)
    setExpandedLevel2(level2Keys)
  }, [groupedSessions])

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

  const sortedSessions = useMemo(() => {
    return [...sessions].sort(
      (a, b) =>
        new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime()
    )
  }, [sessions])

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
            <button
              onClick={() => setShowCreateModal(true)}
              className="p-1.5 rounded hover:bg-sidebar-hover transition-colors text-green-400 hover:text-green-300"
              aria-label="Create new agent"
              title="Create new agent"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
            <button
              onClick={onRefresh}
              disabled={loading}
              className="p-1.5 rounded hover:bg-sidebar-hover transition-colors disabled:opacity-50"
              aria-label="Refresh sessions"
            >
              <svg
                className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
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
            {Object.entries(groupedSessions).map(([level1, level2Groups]) => (
              <div key={level1}>
                {/* Level 1 Header */}
                <button
                  onClick={() => toggleLevel1(level1)}
                  className="w-full px-4 py-2 flex items-center gap-2 text-left hover:bg-sidebar-hover transition-colors"
                >
                  <svg
                    className={`w-4 h-4 transition-transform ${
                      expandedLevel1.has(level1) ? 'rotate-90' : ''
                    }`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  <span className="font-semibold text-gray-200 uppercase text-xs tracking-wide">
                    {level1}
                  </span>
                </button>

                {/* Level 2 Groups */}
                {expandedLevel1.has(level1) && (
                  <div>
                    {Object.entries(level2Groups).map(([level2, sessionsList]) => (
                      <div key={`${level1}-${level2}`}>
                        {/* Level 2 Header (hide if it's "default") */}
                        {level2 !== 'default' && (
                          <button
                            onClick={() => toggleLevel2(level1, level2)}
                            className="w-full px-4 py-2 pl-8 flex items-center gap-2 text-left hover:bg-sidebar-hover transition-colors"
                          >
                            <svg
                              className={`w-3 h-3 transition-transform ${
                                expandedLevel2.has(`${level1}-${level2}`) ? 'rotate-90' : ''
                              }`}
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                            <span className="text-sm text-gray-300 capitalize">{level2}</span>
                            <span className="text-xs text-gray-500">({sessionsList.length})</span>
                          </button>
                        )}

                        {/* Sessions */}
                        {(level2 === 'default' || expandedLevel2.has(`${level1}-${level2}`)) && (
                          <ul>
                            {sessionsList.map((session) => (
                              <li key={session.id} className="group relative">
                                <div
                                  onClick={() => onSessionSelect(session.id)}
                                  className={`w-full py-2 px-4 ${
                                    level2 === 'default' ? 'pl-8' : 'pl-12'
                                  } text-left transition-colors cursor-pointer ${
                                    activeSessionId === session.id
                                      ? 'bg-sidebar-active border-l-2 border-blue-500'
                                      : 'hover:bg-sidebar-hover border-l-2 border-transparent'
                                  }`}
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="flex-1 min-w-0 flex items-center gap-2">
                                      <span className="text-sm text-gray-200 truncate">{session.name || session.id}</span>
                                      <SessionStatus status={session.status} />
                                    </div>
                                    {/* Action buttons - show on hover */}
                                    <div className="hidden group-hover:flex items-center gap-1">
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          setSelectedSession(session)
                                          setShowRenameModal(true)
                                        }}
                                        className="p-1 rounded hover:bg-gray-700 text-gray-400 hover:text-blue-400 transition-colors"
                                        title="Rename agent"
                                      >
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                        </svg>
                                      </button>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          setSelectedSession(session)
                                          setShowDeleteConfirm(true)
                                        }}
                                        className="p-1 rounded hover:bg-gray-700 text-gray-400 hover:text-red-400 transition-colors"
                                        title="Delete agent"
                                      >
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
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
    </div>
  )
}

function SessionStatus({ status }: { status: Session['status'] }) {
  const statusConfig = {
    active: { color: 'bg-green-500', label: 'Active' },
    idle: { color: 'bg-yellow-500', label: 'Idle' },
    disconnected: { color: 'bg-red-500', label: 'Disconnected' },
  }

  const config = statusConfig[status]

  return (
    <div className="flex items-center gap-1.5">
      <div className={`w-2 h-2 rounded-full ${config.color}`} />
      <span className="text-xs text-gray-400">{config.label}</span>
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
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
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
                pattern="[a-zA-Z0-9_-]+"
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
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-gray-100 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
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
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
                pattern="[a-zA-Z0-9_-]+"
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
              className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-gray-100 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !newName.trim() || newName === currentName}
              className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
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
            className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-gray-100 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onDelete}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Deleting...' : 'Delete Session'}
          </button>
        </div>
      </div>
    </div>
  )
}
