'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Brain, Clock, Database, MessageSquare, AlertCircle, CheckCircle2 } from 'lucide-react'
interface ExtendedAgentSubconsciousStatus {
  success: boolean
  exists: boolean
  initialized: boolean
  isRunning: boolean
  isWarmingUp: boolean
  status: {
    startedAt: number | null
    memoryCheckInterval: number
    messageCheckInterval: number
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
    totalMemoryRuns: number
    totalMessageRuns: number
    cumulativeMessagesIndexed?: number
    cumulativeConversationsIndexed?: number
  } | null
  memoryStats?: {
    totalMessages: number
    totalConversations: number
    totalVectors: number
    oldestMessage: number | null
    newestMessage: number | null
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

interface Props {
  agentId: string | undefined
  hostUrl?: string  // Base URL for remote hosts
}

export function AgentSubconsciousIndicator({ agentId, hostUrl }: Props) {
  // Base URL for API calls - empty for local, full URL for remote hosts
  const baseUrl = hostUrl || ''
  const [status, setStatus] = useState<ExtendedAgentSubconsciousStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showPopover, setShowPopover] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  const fetchStatus = useCallback(async () => {
    if (!agentId) {
      setLoading(false)
      return
    }

    try {
      const response = await fetch(`${baseUrl}/api/agents/${agentId}/subconscious`)
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
  }, [agentId, baseUrl])

  useEffect(() => {
    fetchStatus()
    const interval = setInterval(fetchStatus, 30000)
    return () => clearInterval(interval)
  }, [fetchStatus])

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

  if (!agentId) return null

  const isRunning = status?.isRunning || false
  const isWarmingUp = status?.isWarmingUp || false
  const hasError = error || status?.status?.lastMemoryResult?.error || status?.status?.lastMessageResult?.error

  // Determine icon color and animation
  const getIndicatorClass = () => {
    if (loading) return 'text-gray-500 animate-pulse'
    if (hasError) return 'text-red-400'
    if (isRunning) return 'text-purple-400 animate-pulse'
    if (isWarmingUp) return 'text-yellow-400 animate-pulse'
    return 'text-gray-500'
  }

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={(e) => {
          e.stopPropagation()
          setShowPopover(!showPopover)
        }}
        className="flex items-center justify-center p-2 rounded transition-all duration-200 hover:bg-gray-800/50"
        title={
          loading ? 'Loading...' :
          hasError ? 'Subconscious Error' :
          isRunning ? 'Subconscious Active' :
          isWarmingUp ? 'Subconscious Warming Up' :
          'Subconscious Inactive'
        }
      >
        <Brain className={`w-4 h-4 ${getIndicatorClass()}`} />
        {isRunning && !loading && !hasError && (
          <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-purple-500 rounded-full" />
        )}
      </button>

      {/* Popover */}
      {showPopover && (
        <div
          ref={popoverRef}
          className="absolute top-full right-0 mt-2 w-64 bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-50"
        >
          <div className="p-3 border-b border-gray-700">
            <div className="flex items-center gap-2">
              <Brain className={`w-4 h-4 ${isRunning ? 'text-purple-400' : 'text-gray-400'}`} />
              <h3 className="text-sm font-semibold text-gray-100">Agent Subconscious</h3>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Background memory maintenance
            </p>
          </div>

          <div className="p-3 space-y-2">
            {error ? (
              <div className="flex items-center gap-2 text-red-400 text-xs">
                <AlertCircle className="w-3 h-3" />
                <span>Error: {error}</span>
              </div>
            ) : loading ? (
              <div className="flex items-center gap-2 text-gray-400 text-xs">
                <Brain className="w-3 h-3 animate-pulse" />
                <span>Loading...</span>
              </div>
            ) : status ? (
              <>
                {/* Status */}
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-400 flex items-center gap-1.5">
                    <CheckCircle2 className={`w-3 h-3 ${isRunning ? 'text-purple-400' : ''}`} />
                    Status
                  </span>
                  <span className={
                    isRunning ? 'text-purple-400' :
                    isWarmingUp ? 'text-yellow-400' :
                    'text-gray-400'
                  }>
                    {isRunning ? 'Running' : isWarmingUp ? 'Warming Up' : 'Inactive'}
                  </span>
                </div>

                {status.status && (
                  <>
                    <div className="border-t border-gray-700 pt-2 mt-2">
                      <p className="text-[10px] text-gray-500 mb-1.5">Memory Database</p>

                      {/* Database Stats - Total Messages */}
                      {status.memoryStats && (
                        <>
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-gray-400 flex items-center gap-1.5">
                              <Database className="w-3 h-3" />
                              Total Messages
                            </span>
                            <span className="text-purple-400 font-medium">
                              {status.memoryStats.totalMessages.toLocaleString()}
                            </span>
                          </div>

                          <div className="flex items-center justify-between text-xs mt-1">
                            <span className="text-gray-400 flex items-center gap-1.5">
                              <MessageSquare className="w-3 h-3" />
                              Conversations
                            </span>
                            <span className="text-gray-200">
                              {status.memoryStats.totalConversations.toLocaleString()}
                            </span>
                          </div>
                        </>
                      )}

                      <div className="flex items-center justify-between text-xs mt-1">
                        <span className="text-gray-400 flex items-center gap-1.5">
                          <Clock className="w-3 h-3" />
                          Last Scan
                        </span>
                        <span className="text-gray-200">
                          {formatTimeAgo(status.status.lastMemoryRun)}
                        </span>
                      </div>

                      {/* New this session */}
                      {(status.status.cumulativeMessagesIndexed !== undefined && status.status.cumulativeMessagesIndexed > 0) && (
                        <div className="flex items-center justify-between text-xs mt-1">
                          <span className="text-gray-400">New This Session</span>
                          <span className="text-green-400">+{status.status.cumulativeMessagesIndexed.toLocaleString()}</span>
                        </div>
                      )}

                      <div className="flex items-center justify-between text-xs mt-1">
                        <span className="text-gray-400">Total Scans</span>
                        <span className="text-gray-200">{status.status.totalMemoryRuns}</span>
                      </div>
                    </div>

                    <div className="border-t border-gray-700 pt-2 mt-2">
                      <p className="text-[10px] text-gray-500 mb-1.5">Notifications</p>

                      <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-400 flex items-center gap-1.5">
                          <MessageSquare className="w-3 h-3" />
                          Delivery
                        </span>
                        <span className="text-green-400">
                          Push (instant)
                        </span>
                      </div>

                      <p className="text-[10px] text-gray-500 mt-1.5">
                        Messages delivered via tmux
                      </p>
                    </div>
                  </>
                )}
              </>
            ) : null}
          </div>

          <div className="p-2 border-t border-gray-700">
            <button
              onClick={(e) => {
                e.stopPropagation()
                fetchStatus()
              }}
              className="w-full text-[10px] text-gray-400 hover:text-gray-200 transition-colors"
            >
              Click to refresh
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
