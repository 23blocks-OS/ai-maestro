'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Brain, Activity, Clock, MessageSquare, Database, AlertCircle, CheckCircle2 } from 'lucide-react'
interface ExtendedSubconsciousStatus {
  success: boolean
  discoveredAgents: number
  activeAgents: number
  runningSubconscious: number
  isWarmingUp: boolean
  totalMemoryRuns: number
  totalMessageRuns: number
  lastMemoryRun: number | null
  lastMessageRun: number | null
  lastMemoryResult: {
    success: boolean
    messagesProcessed?: number
    conversationsDiscovered?: number
    error?: string
  } | null
  lastMessageResult: {
    success: boolean
    unreadCount?: number
    error?: string
  } | null
  cumulativeMessagesIndexed?: number
  cumulativeConversationsIndexed?: number
  databaseStats?: {
    totalMessages: number
    totalConversations: number
  }
}

function formatTimeAgo(timestamp: number | null): string {
  if (!timestamp) return 'Never'
  const seconds = Math.floor((Date.now() - timestamp) / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

interface SubconsciousStatusProps {
  refreshTrigger?: number  // Increment this to force a refresh
}

export function SubconsciousStatus({ refreshTrigger }: SubconsciousStatusProps = {}) {
  const [status, setStatus] = useState<ExtendedSubconsciousStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showPopover, setShowPopover] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  const fetchStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/subconscious')
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      const data = await response.json()
      setStatus(data)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStatus()
    // Refresh every 30 seconds
    const interval = setInterval(fetchStatus, 30000)
    return () => clearInterval(interval)
  }, [fetchStatus])

  // Refresh when refreshTrigger changes
  useEffect(() => {
    if (refreshTrigger !== undefined && refreshTrigger > 0) {
      fetchStatus()
    }
  }, [refreshTrigger, fetchStatus])

  // Close popover on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setShowPopover(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const isActive = status?.runningSubconscious && status.runningSubconscious > 0
  const isWarmingUp = status?.isWarmingUp || false
  const hasDiscoveredAgents = (status?.discoveredAgents || 0) > 0
  const hasError = error || (status?.lastMemoryResult?.error) || (status?.lastMessageResult?.error)

  // Determine status text and color
  const getStatusInfo = () => {
    if (loading) return { text: 'Loading...', color: 'text-gray-500' }
    if (hasError) return { text: 'Error', color: 'text-red-400' }
    if (isActive) return { text: `${status?.runningSubconscious} Active`, color: 'text-purple-400' }
    if (isWarmingUp) return { text: `${status?.discoveredAgents} Agents`, color: 'text-yellow-400' }
    if (hasDiscoveredAgents) return { text: `${status?.discoveredAgents} Agents`, color: 'text-gray-400' }
    return { text: 'No Agents', color: 'text-gray-500' }
  }

  const statusInfo = getStatusInfo()

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => setShowPopover(!showPopover)}
        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group w-full ${
          showPopover ? 'bg-sidebar-hover' : 'hover:bg-sidebar-hover'
        }`}
        title="Subconscious Status"
      >
        <div className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center border transition-all duration-200 ${
          loading
            ? 'bg-gray-800 border-gray-700'
            : hasError
              ? 'bg-red-900/30 border-red-700/50'
              : isActive
                ? 'bg-purple-900/30 border-purple-600/50'
                : isWarmingUp
                  ? 'bg-yellow-900/30 border-yellow-600/50'
                  : hasDiscoveredAgents
                    ? 'bg-gray-800 border-gray-600'
                    : 'bg-gray-800 border-gray-700'
        }`}>
          <Brain className={`w-4 h-4 transition-all duration-200 ${
            loading
              ? 'text-gray-500 animate-pulse'
              : hasError
                ? 'text-red-400'
                : isActive
                  ? 'text-purple-400 animate-pulse'
                  : isWarmingUp
                    ? 'text-yellow-400 animate-pulse'
                    : hasDiscoveredAgents
                      ? 'text-gray-400'
                      : 'text-gray-500'
          }`} />
        </div>
        <div className="flex flex-col items-start flex-1 min-w-0">
          <span className="text-sm font-medium text-gray-300 group-hover:text-gray-100 transition-colors">
            Subconscious
          </span>
          <span className={`text-xs ${statusInfo.color}`}>
            {statusInfo.text}
          </span>
        </div>
        {(isActive || isWarmingUp) && !loading && !hasError && (
          <div className={`w-2 h-2 rounded-full animate-pulse ${isActive ? 'bg-purple-500' : 'bg-yellow-500'}`} />
        )}
      </button>

      {/* Popover */}
      {showPopover && (
        <div
          ref={popoverRef}
          className="absolute bottom-full left-0 mb-2 w-72 bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-50"
        >
          <div className="p-4 border-b border-gray-700">
            <div className="flex items-center gap-2">
              <Brain className={`w-5 h-5 ${isActive ? 'text-purple-400' : 'text-gray-400'}`} />
              <h3 className="text-sm font-semibold text-gray-100">Subconscious Status</h3>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Background processes that maintain agent memory and check messages
            </p>
          </div>

          <div className="p-4 space-y-3">
            {error ? (
              <div className="flex items-center gap-2 text-red-400 text-sm">
                <AlertCircle className="w-4 h-4" />
                <span>Connection error: {error}</span>
              </div>
            ) : loading ? (
              <div className="flex items-center gap-2 text-gray-400 text-sm">
                <Activity className="w-4 h-4 animate-pulse" />
                <span>Loading status...</span>
              </div>
            ) : status ? (
              <>
                {/* Discovered Agents */}
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400 flex items-center gap-2">
                    <Database className="w-4 h-4" />
                    Discovered Agents
                  </span>
                  <span className="text-gray-200">{status.discoveredAgents || 0}</span>
                </div>

                {/* Active in Memory */}
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400 flex items-center gap-2">
                    <Activity className="w-4 h-4" />
                    Active in Memory
                  </span>
                  <span className={isWarmingUp ? 'text-yellow-400' : 'text-gray-200'}>
                    {status.activeAgents}
                    {isWarmingUp && ' (warming up)'}
                  </span>
                </div>

                {/* Running Processes */}
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400 flex items-center gap-2">
                    <CheckCircle2 className={`w-4 h-4 ${isActive ? 'text-purple-400' : ''}`} />
                    Running Processes
                  </span>
                  <span className={isActive ? 'text-purple-400' : 'text-gray-200'}>
                    {status.runningSubconscious}
                  </span>
                </div>

                <div className="border-t border-gray-700 pt-3 mt-3">
                  <p className="text-xs text-gray-500 mb-2">Memory Database</p>

                  {/* Database Stats - Total Messages Indexed */}
                  {status.databaseStats && (
                    <>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-400 flex items-center gap-2">
                          <Database className="w-4 h-4" />
                          Total Messages
                        </span>
                        <span className="text-purple-400 font-medium">
                          {status.databaseStats.totalMessages.toLocaleString()}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-sm mt-1">
                        <span className="text-gray-400 flex items-center gap-2">
                          <MessageSquare className="w-4 h-4" />
                          Conversations
                        </span>
                        <span className="text-gray-200">
                          {status.databaseStats.totalConversations.toLocaleString()}
                        </span>
                      </div>
                    </>
                  )}

                  {/* Last Memory Run */}
                  <div className="flex items-center justify-between text-sm mt-1">
                    <span className="text-gray-400 flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      Last Scan
                    </span>
                    <span className="text-gray-200">
                      {formatTimeAgo(status.lastMemoryRun)}
                    </span>
                  </div>

                  {/* Session stats - new messages this session */}
                  {(status.cumulativeMessagesIndexed !== undefined && status.cumulativeMessagesIndexed > 0) && (
                    <div className="flex items-center justify-between text-sm mt-1">
                      <span className="text-gray-400">New This Session</span>
                      <span className="text-green-400">+{status.cumulativeMessagesIndexed.toLocaleString()}</span>
                    </div>
                  )}

                  {/* Total Runs */}
                  <div className="flex items-center justify-between text-sm mt-1">
                    <span className="text-gray-400">Total Scans</span>
                    <span className="text-gray-200">{status.totalMemoryRuns}</span>
                  </div>
                </div>

                <div className="border-t border-gray-700 pt-3 mt-3">
                  <p className="text-xs text-gray-500 mb-2">Message Checking</p>

                  {/* Last Message Run */}
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-400 flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      Last Run
                    </span>
                    <span className="text-gray-200">
                      {formatTimeAgo(status.lastMessageRun)}
                    </span>
                  </div>

                  {/* Message Result */}
                  {status.lastMessageResult && (
                    <div className="flex items-center justify-between text-sm mt-1">
                      <span className="text-gray-400 flex items-center gap-2">
                        <MessageSquare className="w-4 h-4" />
                        Unread Messages
                      </span>
                      <span className={status.lastMessageResult.success ? 'text-gray-200' : 'text-red-400'}>
                        {status.lastMessageResult.success
                          ? status.lastMessageResult.unreadCount || 0
                          : 'Error'}
                      </span>
                    </div>
                  )}

                  {/* Total Runs */}
                  <div className="flex items-center justify-between text-sm mt-1">
                    <span className="text-gray-400">Total Runs</span>
                    <span className="text-gray-200">{status.totalMessageRuns}</span>
                  </div>
                </div>
              </>
            ) : null}
          </div>

          {/* Refresh button */}
          <div className="p-3 border-t border-gray-700">
            <button
              onClick={(e) => {
                e.stopPropagation()
                fetchStatus()
              }}
              className="w-full text-xs text-gray-400 hover:text-gray-200 transition-colors"
            >
              Click to refresh
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
