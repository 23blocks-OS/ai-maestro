/**
 * Agents Section — browse agents per AI client.
 * Same pattern as SkillsSection: ClientTabBar + card grid + ConvertButton.
 */

'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Bot, RefreshCw } from 'lucide-react'
import ClientTabBar from './ClientTabBar'
import ConvertButton from './ConvertButton'
import type { ProviderId } from '@/lib/converter/types'

interface AgentInfo {
  name: string
  description?: string
  path?: string
}

interface AgentsSectionProps {
  initialClient?: ProviderId
  onClientChange?: (client: ProviderId) => void
  onConverted?: (client: ProviderId, elementName: string) => void
  highlight?: string
}

export default function AgentsSection({
  initialClient = 'claude-code',
  onClientChange,
  onConverted,
  highlight,
}: AgentsSectionProps) {
  const [activeClient, setActiveClient] = useState<ProviderId>(initialClient)
  const [agents, setAgents] = useState<AgentInfo[]>([])
  const [counts, setCounts] = useState<Partial<Record<ProviderId, number>>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notification, setNotification] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  const notificationTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const showNotification = (text: string, type: 'success' | 'error') => {
    if (notificationTimeoutRef.current) clearTimeout(notificationTimeoutRef.current)
    setNotification({ text, type })
    notificationTimeoutRef.current = setTimeout(() => setNotification(null), 5000)
  }

  // Cleanup notification timeout on unmount
  useEffect(() => {
    return () => {
      if (notificationTimeoutRef.current) clearTimeout(notificationTimeoutRef.current)
    }
  }, [])

  // Auto-clear highlight after 2 seconds
  useEffect(() => {
    if (!highlight) return
    const timer = setTimeout(() => {
      const url = new URL(window.location.href)
      url.searchParams.delete('highlight')
      window.history.replaceState({}, '', url.toString())
    }, 2000)
    return () => clearTimeout(timer)
  }, [highlight])

  const fetchAgents = useCallback(async (client: ProviderId) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/settings/global-elements/client-skills?client=${client}`)
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      const agentList: AgentInfo[] = (data.agents || []).map((name: string) => ({ name }))
      setAgents(agentList)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load agents')
      setAgents([])
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchCounts = useCallback(async () => {
    const clients: ProviderId[] = ['claude-code', 'codex', 'gemini', 'opencode', 'kiro']
    const newCounts: Partial<Record<ProviderId, number>> = {}
    await Promise.all(clients.map(async client => {
      try {
        const res = await fetch(`/api/settings/global-elements/client-skills?client=${client}`)
        if (res.ok) {
          const data = await res.json()
          newCounts[client] = data.agents?.length || 0
        }
      } catch { /* */ }
    }))
    setCounts(newCounts)
  }, [])

  useEffect(() => { fetchAgents(activeClient) }, [activeClient, fetchAgents])
  useEffect(() => { fetchCounts() }, [fetchCounts])

  const handleClientChange = (client: ProviderId) => {
    setActiveClient(client)
    onClientChange?.(client)
    // Update URL without navigation
    const url = new URL(window.location.href)
    url.searchParams.set('client', client)
    window.history.replaceState({}, '', url.toString())
  }

  const handleConvert = (targetClient: ProviderId, elementName: string) => {
    showNotification(`Converted agent "${elementName}" to ${targetClient}`, 'success')
    fetchCounts()
    setActiveClient(targetClient)
    onConverted?.(targetClient, elementName)
  }

  // Agent format badge
  const formatBadge = (client: ProviderId) => {
    switch (client) {
      case 'codex': return 'TOML'
      case 'kiro': return 'JSON'
      default: return 'MD'
    }
  }

  return (
    <div className="p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Bot className="w-6 h-6 text-purple-400" />
          <div>
            <h1 className="text-xl font-semibold text-white">Agents</h1>
            <p className="text-sm text-gray-400">Browse and manage agents per AI client.</p>
          </div>
        </div>
        <button
          onClick={() => { fetchAgents(activeClient); fetchCounts() }}
          className="flex items-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      <ClientTabBar activeClient={activeClient} onClientChange={handleClientChange} counts={counts} />

      {notification && (
        <div className={`fixed top-4 right-4 z-50 max-w-sm bg-gray-800 border rounded-lg shadow-lg p-4 animate-in slide-in-from-right duration-300 ${notification.type === 'success' ? 'border-emerald-500/40' : 'border-red-500/40'}`}>
          <p className={`text-sm ${notification.type === 'success' ? 'text-emerald-300' : 'text-red-300'}`}>{notification.text}</p>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <RefreshCw className="w-6 h-6 text-gray-500 animate-spin" />
          <span className="ml-3 text-gray-400">Loading agents...</span>
        </div>
      ) : error ? (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-300">{error}</div>
      ) : agents.length === 0 ? (
        <div className="p-8 text-center text-gray-500">
          <Bot className="w-8 h-8 mx-auto mb-3 opacity-30" />
          <p>No agents found for this client.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {agents.map(agent => (
            <div
              key={agent.name}
              className={`
                bg-gray-900/50 rounded-lg border border-gray-800 p-4
                hover:border-gray-700 transition-all duration-200
                ${highlight === agent.name ? 'ring-2 ring-purple-500 animate-pulse' : ''}
              `}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-medium text-gray-200 truncate">{agent.name}</h3>
                    <span className="text-[10px] px-1.5 py-0.5 bg-gray-800 text-gray-500 rounded font-mono">{formatBadge(activeClient)}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1 line-clamp-2">{agent.description || 'No description'}</p>
                </div>
                <ConvertButton
                  elementName={agent.name}
                  elementType="agents"
                  sourceClient={activeClient}
                  sourcePath={agent.path || `~/.${activeClient === 'claude-code' ? 'claude' : activeClient}/agents/${agent.name}`}
                  onConverted={handleConvert}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
