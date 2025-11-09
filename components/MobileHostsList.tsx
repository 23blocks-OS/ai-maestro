'use client'

import { useState, useMemo } from 'react'
import {
  Server,
  Cloud,
  Terminal,
  ChevronDown,
  ChevronRight,
  Plus
} from 'lucide-react'
import type { Session } from '@/types/session'
import { useHosts } from '@/hooks/useHosts'

interface MobileHostsListProps {
  sessions: Session[]
  activeSessionId: string | null
  onSessionSelect: (sessionId: string) => void
  onCreateSession?: () => void
}

export default function MobileHostsList({
  sessions,
  activeSessionId,
  onSessionSelect,
  onCreateSession
}: MobileHostsListProps) {
  const { hosts } = useHosts()
  const [expandedHosts, setExpandedHosts] = useState<Set<string>>(new Set(['local']))

  // Group sessions by host
  const groupedSessions = useMemo(() => {
    const groups: { [hostId: string]: Session[] } = {}

    sessions.forEach((session) => {
      const hostId = session.hostId || 'local'
      if (!groups[hostId]) {
        groups[hostId] = []
      }
      groups[hostId].push(session)
    })

    return groups
  }, [sessions])

  const toggleHost = (hostId: string) => {
    const newExpanded = new Set(expandedHosts)
    if (newExpanded.has(hostId)) {
      newExpanded.delete(hostId)
    } else {
      newExpanded.add(hostId)
    }
    setExpandedHosts(newExpanded)
  }

  const getHostName = (hostId: string) => {
    if (hostId === 'local') return 'Local Host'
    const host = hosts.find((h) => h.id === hostId)
    return host?.name || hostId
  }

  const getHostIcon = (hostId: string) => {
    if (hostId === 'local') return Server
    return Server
  }

  const getHostUrl = (hostId: string) => {
    if (hostId === 'local') return 'localhost:23000'
    const host = hosts.find((h) => h.id === hostId)
    return host?.url ? new URL(host.url).host : 'Unknown'
  }

  const getDisplayName = (sessionId: string) => {
    const parts = sessionId.split('/')
    return parts[parts.length - 1]
  }

  const getBreadcrumb = (sessionId: string) => {
    const parts = sessionId.split('/')
    return parts.length > 1 ? parts.slice(0, -1).join(' / ') : null
  }

  // Sort hosts: local first, then alphabetically
  const sortedHostIds = useMemo(() => {
    const hostIds = Object.keys(groupedSessions)
    return hostIds.sort((a, b) => {
      if (a === 'local') return -1
      if (b === 'local') return 1
      return getHostName(a).localeCompare(getHostName(b))
    })
  }, [groupedSessions])

  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-6 text-center">
        <Server className="w-16 h-16 text-gray-600 mb-4" />
        <p className="text-lg font-medium text-gray-300 mb-2">No Agents</p>
        <p className="text-sm text-gray-500 mb-4">
          Create a new agent to get started
        </p>
        {onCreateSession && (
          <button
            onClick={onCreateSession}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Create Agent
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-gray-900">
      {/* Header */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-gray-800 bg-gray-950">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Server className="w-5 h-5 text-blue-400" />
            <h2 className="text-sm font-semibold text-white">Hosts & Agents</h2>
          </div>
          {onCreateSession && (
            <button
              onClick={onCreateSession}
              className="p-2 rounded-lg hover:bg-gray-800 transition-colors"
            >
              <Plus className="w-4 h-4 text-gray-400" />
            </button>
          )}
        </div>
        <p className="text-xs text-gray-500 mt-1">
          {sortedHostIds.length} host{sortedHostIds.length !== 1 ? 's' : ''} • {sessions.length} agent{sessions.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-2">
          {sortedHostIds.map((hostId) => {
            const hostSessions = groupedSessions[hostId] || []
            const isExpanded = expandedHosts.has(hostId)
            const HostIcon = getHostIcon(hostId)

            return (
              <div key={hostId} className="bg-gray-800/50 rounded-lg overflow-hidden">
                {/* Host Header */}
                <button
                  onClick={() => toggleHost(hostId)}
                  className="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-800 transition-colors"
                >
                  {isExpanded ? (
                    <ChevronDown className="w-5 h-5 text-gray-400 flex-shrink-0" />
                  ) : (
                    <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
                  )}
                  <HostIcon className={`w-5 h-5 flex-shrink-0 ${
                    hostId === 'local' ? 'text-blue-400' : 'text-purple-400'
                  }`} />
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-sm font-medium text-white truncate">
                      {getHostName(hostId)}
                    </p>
                    <p className="text-xs text-gray-500 truncate">
                      {getHostUrl(hostId)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="px-2 py-0.5 bg-gray-700 text-gray-300 rounded text-xs font-medium">
                      {hostSessions.length}
                    </span>
                  </div>
                </button>

                {/* Sessions List */}
                {isExpanded && (
                  <div className="border-t border-gray-700">
                    {hostSessions.length === 0 ? (
                      <div className="px-4 py-3 text-xs text-gray-500 text-center">
                        No agents on this host
                      </div>
                    ) : (
                      <div className="divide-y divide-gray-700">
                        {hostSessions.map((session) => {
                          const isActive = session.id === activeSessionId
                          const displayName = getDisplayName(session.id)
                          const breadcrumb = getBreadcrumb(session.id)

                          return (
                            <button
                              key={session.id}
                              onClick={() => onSessionSelect(session.id)}
                              className={`w-full px-4 py-3 flex items-center gap-3 transition-colors ${
                                isActive
                                  ? 'bg-blue-900/30'
                                  : 'hover:bg-gray-800/50'
                              }`}
                            >
                              <Terminal className={`w-4 h-4 flex-shrink-0 ${
                                isActive ? 'text-blue-400' : 'text-gray-400'
                              }`} />
                              <div className="flex-1 min-w-0 text-left">
                                <p className={`text-sm font-medium truncate ${
                                  isActive ? 'text-blue-400' : 'text-white'
                                }`}>
                                  {displayName}
                                </p>
                                {breadcrumb && (
                                  <p className="text-xs text-gray-500 truncate">{breadcrumb}</p>
                                )}
                              </div>
                              {isActive && (
                                <div className="w-2 h-2 rounded-full bg-blue-400 flex-shrink-0" />
                              )}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
