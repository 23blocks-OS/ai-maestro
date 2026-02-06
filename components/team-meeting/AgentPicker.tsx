'use client'

import { useState, useMemo } from 'react'
import { Search, Check } from 'lucide-react'
import type { Agent } from '@/types/agent'

interface AgentPickerProps {
  agents: Agent[]
  selectedAgentIds: string[]
  onToggleAgent: (agentId: string) => void
}

export default function AgentPicker({ agents, selectedAgentIds, onToggleAgent }: AgentPickerProps) {
  const [searchQuery, setSearchQuery] = useState('')

  const filteredAgents = useMemo(() => {
    if (!searchQuery.trim()) return agents
    const q = searchQuery.toLowerCase()
    return agents.filter(a => {
      const name = (a.label || a.name || a.alias || '').toLowerCase()
      const tags = (a.tags || []).join(' ').toLowerCase()
      const host = (a.hostId || '').toLowerCase()
      return name.includes(q) || tags.includes(q) || host.includes(q)
    })
  }, [agents, searchQuery])

  return (
    <div className="flex flex-col gap-4">
      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search agents by name, tags, or host..."
          className="w-full pl-10 pr-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
          autoFocus
        />
      </div>

      {/* Agent grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 overflow-y-auto max-h-[calc(100vh-320px)] pr-1">
        {filteredAgents.map(agent => {
          const isOnline = agent.session?.status === 'online'
          const isSelected = selectedAgentIds.includes(agent.id)
          const displayName = agent.label || agent.name || agent.alias || agent.id.slice(0, 8)

          return (
            <div
              key={agent.id}
              onClick={() => onToggleAgent(agent.id)}
              className={`
                relative flex flex-col items-center gap-2 p-3 rounded-xl cursor-pointer transition-all duration-200
                ${isSelected
                  ? 'bg-emerald-500/20 border-2 border-emerald-500 ring-1 ring-emerald-500/30'
                  : 'bg-gray-800/60 border-2 border-transparent hover:border-gray-600 hover:bg-gray-800'
                }
                ${!isOnline && !isSelected ? 'opacity-50' : ''}
              `}
            >
              {/* Selection check */}
              {isSelected && (
                <div className="absolute top-1.5 right-1.5 w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center">
                  <Check className="w-3 h-3 text-white" />
                </div>
              )}

              {/* Avatar */}
              <div className="relative">
                <div className="w-12 h-12 rounded-full overflow-hidden bg-gray-700">
                  {agent.avatar ? (
                    <img src={agent.avatar} alt={displayName} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-400 text-lg font-bold">
                      {displayName.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
                {/* Online indicator */}
                <div className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-gray-900 ${
                  isOnline ? 'bg-green-500' : 'bg-gray-600'
                }`} />
              </div>

              {/* Name */}
              <span className="text-xs text-gray-300 text-center truncate w-full">{displayName}</span>
            </div>
          )
        })}

        {filteredAgents.length === 0 && (
          <div className="col-span-full text-center text-gray-500 py-8">
            No agents found matching &quot;{searchQuery}&quot;
          </div>
        )}
      </div>
    </div>
  )
}
