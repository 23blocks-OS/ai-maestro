'use client'

import { useState, useMemo } from 'react'
import {
  Server,
  Terminal,
  ChevronDown,
  ChevronRight,
  Plus,
  RefreshCw,
  AlertCircle
} from 'lucide-react'
import type { Agent } from '@/types/agent'
import { useHosts } from '@/hooks/useHosts'

interface MobileHostsListProps {
  agents: Agent[]
  agentsLoading?: boolean
  agentsError?: Error | null
  activeAgentId: string | null
  onAgentSelect: (agentId: string) => void
  onCreateAgent?: () => void
  onRefresh?: () => void
}

export default function MobileHostsList({
  agents,
  agentsLoading = false,
  agentsError = null,
  activeAgentId,
  onAgentSelect,
  onCreateAgent,
  onRefresh
}: MobileHostsListProps) {
  const { hosts, loading: hostsLoading, error: hostsError } = useHosts()
  const [expandedHosts, setExpandedHosts] = useState<Set<string>>(new Set(['local']))

  // Group agents by host
  const groupedAgents = useMemo(() => {
    const groups: { [hostId: string]: Agent[] } = {}

    agents.forEach((agent) => {
      const hostId = agent.hostId || 'local'
      if (!groups[hostId]) {
        groups[hostId] = []
      }
      groups[hostId].push(agent)
    })

    return groups
  }, [agents])

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
    const host = hosts.find((h) => h.id === hostId)
    return host?.name || hostId
  }

  const getHostIcon = (hostId: string) => {
    if (hostId === 'local') return Server
    return Server
  }

  const getHostUrl = (hostId: string) => {
    if (hostId === 'local') {
      // Show the actual host being accessed (works on mobile)
      if (typeof window !== 'undefined') {
        return window.location.host
      }
      return 'localhost:23000'
    }
    const host = hosts.find((h) => h.id === hostId)
    return host?.url ? new URL(host.url).host : 'Unknown'
  }

  // Get display name for an agent
  const getAgentDisplayName = (agent: Agent) => {
    return agent.label || agent.name || agent.alias || agent.id
  }

  // Get breadcrumb from tags
  const getAgentBreadcrumb = (agent: Agent) => {
    if (agent.tags && agent.tags.length > 0) {
      return agent.tags.join(' / ')
    }
    return null
  }

  // Sort hosts: local first, then alphabetically
  // Use ALL hosts from useHosts, not just hosts with agents
  const sortedHostIds = useMemo(() => {
    // Start with all hosts from the hosts list
    const hostIds = new Set(hosts.map(h => h.id))

    // Also include any hostIds from agents that might not be in the hosts list
    Object.keys(groupedAgents).forEach(hostId => hostIds.add(hostId))

    return Array.from(hostIds).sort((a, b) => {
      if (a === 'local') return -1
      if (b === 'local') return 1
      return getHostName(a).localeCompare(getHostName(b))
    })
  }, [hosts, groupedAgents])

  // Combined loading state
  const isLoading = hostsLoading || agentsLoading

  // Combined error state
  const error = hostsError || agentsError

  // Show loading state
  if (isLoading && agents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-6 text-center">
        <RefreshCw className="w-12 h-12 text-blue-400 animate-spin mb-4" />
        <p className="text-sm text-gray-400">Loading hosts and agents...</p>
      </div>
    )
  }

  // Show error state
  if (error && agents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-6 text-center">
        <AlertCircle className="w-12 h-12 text-red-400 mb-4" />
        <p className="text-lg font-medium text-gray-300 mb-2">Connection Error</p>
        <p className="text-sm text-red-400 mb-4">{error.message}</p>
        {onRefresh && (
          <button
            onClick={onRefresh}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Retry
          </button>
        )}
      </div>
    )
  }

  // Show no hosts state when no hosts are configured
  if (hosts.length === 0 && agents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-6 text-center">
        <Server className="w-16 h-16 text-gray-600 mb-4" />
        <p className="text-lg font-medium text-gray-300 mb-2">No Hosts</p>
        <p className="text-sm text-gray-500 mb-4">
          Configure a host to get started
        </p>
        {onRefresh && (
          <button
            onClick={onRefresh}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        )}
      </div>
    )
  }

  // Show no agents state when hosts exist but no agents
  if (agents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-6 text-center">
        <Terminal className="w-16 h-16 text-gray-600 mb-4" />
        <p className="text-lg font-medium text-gray-300 mb-2">No Agents</p>
        <p className="text-sm text-gray-500 mb-4">
          Create a new agent to get started
        </p>
        {onCreateAgent && (
          <button
            onClick={onCreateAgent}
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
            {isLoading && (
              <RefreshCw className="w-3 h-3 text-gray-500 animate-spin" />
            )}
          </div>
          <div className="flex items-center gap-1">
            {onRefresh && (
              <button
                onClick={onRefresh}
                disabled={isLoading}
                className="p-2 rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 text-gray-400 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
            )}
            {onCreateAgent && (
              <button
                onClick={onCreateAgent}
                className="p-2 rounded-lg hover:bg-gray-800 transition-colors"
              >
                <Plus className="w-4 h-4 text-gray-400" />
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <p className="text-xs text-gray-500">
            {sortedHostIds.length} host{sortedHostIds.length !== 1 ? 's' : ''} • {agents.length} agent{agents.length !== 1 ? 's' : ''}
          </p>
          {error && (
            <span className="text-xs text-red-400 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              Partial data
            </span>
          )}
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-2">
          {sortedHostIds.map((hostId) => {
            const hostAgents = groupedAgents[hostId] || []
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
                      {hostAgents.length}
                    </span>
                  </div>
                </button>

                {/* Agents List */}
                {isExpanded && (
                  <div className="border-t border-gray-700">
                    {hostAgents.length === 0 ? (
                      <div className="px-4 py-3 text-xs text-gray-500 text-center">
                        No agents on this host
                      </div>
                    ) : (
                      <div className="divide-y divide-gray-700">
                        {hostAgents.map((agent) => {
                          const isActive = agent.id === activeAgentId
                          const displayName = getAgentDisplayName(agent)
                          const breadcrumb = getAgentBreadcrumb(agent)
                          const isOnline = agent.session?.status === 'online'
                          // Hibernated = offline but has session config (can be woken)
                          const isHibernated = !isOnline && !!agent.tools?.session

                          // Status indicator colors and labels
                          const statusColor = isOnline
                            ? 'bg-green-500'
                            : isHibernated
                              ? 'bg-yellow-500'
                              : 'bg-gray-500'
                          const statusLabel = isOnline
                            ? 'Online'
                            : isHibernated
                              ? 'Hibernated'
                              : 'Offline'

                          return (
                            <button
                              key={agent.id}
                              onClick={() => onAgentSelect(agent.id)}
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
                                {agent.taskDescription && (
                                  <p className="text-xs text-gray-500 truncate mt-0.5">{agent.taskDescription}</p>
                                )}
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                {/* Status indicator with label */}
                                <span className={`text-xs ${
                                  isOnline ? 'text-green-400' : isHibernated ? 'text-yellow-400' : 'text-gray-500'
                                }`}>
                                  {statusLabel}
                                </span>
                                <div className={`w-2 h-2 rounded-full ${statusColor} ${
                                  isOnline ? 'animate-pulse' : ''
                                }`} />
                                {isActive && (
                                  <div className="w-2 h-2 rounded-full bg-blue-400" />
                                )}
                              </div>
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
