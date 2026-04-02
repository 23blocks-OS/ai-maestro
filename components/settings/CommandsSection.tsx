/**
 * Commands Section — browse commands per AI client.
 * Disabled tabs for clients that don't support commands (Codex, Kiro).
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import { TerminalSquare, RefreshCw } from 'lucide-react'
import ClientTabBar from './ClientTabBar'
import ConvertButton from './ConvertButton'
import type { ProviderId } from '@/lib/converter/types'

interface CommandInfo {
  name: string
  description?: string
  path?: string
}

// Clients that don't support native commands
const NO_COMMANDS_CLIENTS: ProviderId[] = ['codex', 'kiro']

interface CommandsSectionProps {
  initialClient?: ProviderId
  onClientChange?: (client: ProviderId) => void
  onConverted?: (client: ProviderId, elementName: string) => void
  highlight?: string
}

export default function CommandsSection({
  initialClient = 'claude-code',
  onClientChange,
  onConverted,
  highlight,
}: CommandsSectionProps) {
  const [activeClient, setActiveClient] = useState<ProviderId>(initialClient)
  const [commands, setCommands] = useState<CommandInfo[]>([])
  const [counts, setCounts] = useState<Partial<Record<ProviderId, number>>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notification, setNotification] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

  const showNotification = (text: string, type: 'success' | 'error') => {
    setNotification({ text, type })
    setTimeout(() => setNotification(null), 5000)
  }

  const fetchCommands = useCallback(async (client: ProviderId) => {
    if (NO_COMMANDS_CLIENTS.includes(client)) {
      setCommands([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/settings/global-elements/client-skills?client=${client}`)
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      // Commands come from the instructions field (commands are separate from skills/agents)
      // For now, use a dedicated commands field if the API returns it
      const cmdList: CommandInfo[] = (data.commands || data.instructions || []).map((name: string) => ({ name }))
      setCommands(cmdList)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load commands')
      setCommands([])
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchCounts = useCallback(async () => {
    const clients: ProviderId[] = ['claude-code', 'gemini', 'opencode']
    const newCounts: Partial<Record<ProviderId, number>> = {}
    await Promise.all(clients.map(async client => {
      try {
        const res = await fetch(`/api/settings/global-elements/client-skills?client=${client}`)
        if (res.ok) {
          const data = await res.json()
          newCounts[client] = data.commands?.length || data.instructions?.length || 0
        }
      } catch { /* */ }
    }))
    setCounts(newCounts)
  }, [])

  useEffect(() => { fetchCommands(activeClient) }, [activeClient, fetchCommands])
  useEffect(() => { fetchCounts() }, [fetchCounts])

  const handleClientChange = (client: ProviderId) => {
    setActiveClient(client)
    onClientChange?.(client)
  }

  const handleConvert = (targetClient: ProviderId, elementName: string) => {
    const targetLabel = NO_COMMANDS_CLIENTS.includes(targetClient) ? ' (as skill)' : ''
    showNotification(`Converted command "${elementName}" to ${targetClient}${targetLabel}`, 'success')
    fetchCounts()
    onConverted?.(targetClient, elementName)
  }

  return (
    <div className="p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <TerminalSquare className="w-6 h-6 text-emerald-400" />
          <div>
            <h1 className="text-xl font-semibold text-white">Commands</h1>
            <p className="text-sm text-gray-400">Browse slash commands per AI client. Some clients convert commands to skills.</p>
          </div>
        </div>
        <button
          onClick={() => { fetchCommands(activeClient); fetchCounts() }}
          className="flex items-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      <ClientTabBar
        activeClient={activeClient}
        onClientChange={handleClientChange}
        counts={counts}
        disabledClients={NO_COMMANDS_CLIENTS}
      />

      {notification && (
        <div className={`fixed top-4 right-4 z-50 max-w-sm bg-gray-800 border rounded-lg shadow-lg p-4 animate-in slide-in-from-right duration-300 ${notification.type === 'success' ? 'border-emerald-500/40' : 'border-red-500/40'}`}>
          <p className={`text-sm ${notification.type === 'success' ? 'text-emerald-300' : 'text-red-300'}`}>{notification.text}</p>
        </div>
      )}

      {NO_COMMANDS_CLIENTS.includes(activeClient) ? (
        <div className="p-8 text-center text-gray-500">
          <TerminalSquare className="w-8 h-8 mx-auto mb-3 opacity-30" />
          <p>This client does not support native commands.</p>
          <p className="mt-1 text-xs">Commands from other clients are converted to skills during conversion.</p>
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center py-16">
          <RefreshCw className="w-6 h-6 text-gray-500 animate-spin" />
          <span className="ml-3 text-gray-400">Loading commands...</span>
        </div>
      ) : error ? (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-300">{error}</div>
      ) : commands.length === 0 ? (
        <div className="p-8 text-center text-gray-500">
          <TerminalSquare className="w-8 h-8 mx-auto mb-3 opacity-30" />
          <p>No commands found for this client.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {commands.map(cmd => (
            <div
              key={cmd.name}
              className={`
                bg-gray-900/50 rounded-lg border border-gray-800 p-4
                hover:border-gray-700 transition-all duration-200
                ${highlight === cmd.name ? 'ring-2 ring-emerald-500 animate-pulse' : ''}
              `}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="text-sm font-medium text-gray-200 truncate">/{cmd.name}</h3>
                  <p className="text-xs text-gray-500 mt-1 line-clamp-2">{cmd.description || 'No description'}</p>
                </div>
                <ConvertButton
                  elementName={cmd.name}
                  elementType="commands"
                  sourceClient={activeClient}
                  sourcePath={cmd.path || `~/.${activeClient === 'claude-code' ? 'claude' : activeClient}/commands/${cmd.name}.md`}
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
