'use client'

import { LayoutGrid, List, Plus } from 'lucide-react'
import type { Agent } from '@/types/agent'
import type { SidebarMode } from '@/types/team'

interface MeetingSidebarProps {
  agents: Agent[]
  activeAgentId: string | null
  sidebarMode: SidebarMode
  onSelectAgent: (agentId: string) => void
  onToggleMode: () => void
  onAddAgent: () => void
}

export default function MeetingSidebar({
  agents,
  activeAgentId,
  sidebarMode,
  onSelectAgent,
  onToggleMode,
  onAddAgent,
}: MeetingSidebarProps) {
  return (
    <div className="flex flex-col h-full bg-gray-900 border-r border-gray-800" style={{ width: 300 }}>
      {/* Sidebar header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800">
        <span className="text-xs text-gray-400 font-medium uppercase tracking-wider">
          Agents ({agents.length})
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={onToggleMode}
            className="p-1 rounded hover:bg-gray-800 text-gray-500 hover:text-gray-300 transition-colors"
            title={sidebarMode === 'grid' ? 'Switch to list' : 'Switch to grid'}
          >
            {sidebarMode === 'grid' ? <List className="w-3.5 h-3.5" /> : <LayoutGrid className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={onAddAgent}
            className="p-1 rounded hover:bg-gray-800 text-gray-500 hover:text-emerald-400 transition-colors"
            title="Add agent to meeting"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Agent list/grid */}
      <div className={`flex-1 overflow-y-auto p-2 ${
        sidebarMode === 'grid' ? 'grid grid-cols-2 gap-2 content-start' : 'flex flex-col gap-1'
      }`}>
        {agents.map(agent => {
          const isActive = agent.id === activeAgentId
          const displayName = agent.label || agent.name || agent.alias || agent.id.slice(0, 8)
          const isOnline = agent.session?.status === 'online'

          if (sidebarMode === 'grid') {
            return (
              <div
                key={agent.id}
                onClick={() => onSelectAgent(agent.id)}
                className={`
                  flex flex-col items-center gap-1.5 p-2.5 rounded-lg cursor-pointer transition-all duration-200
                  ${isActive
                    ? 'bg-emerald-500/20 border border-emerald-500/50'
                    : 'bg-gray-800/40 border border-transparent hover:bg-gray-800 hover:border-gray-700'
                  }
                `}
              >
                <div className="relative">
                  <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-700">
                    {agent.avatar ? (
                      <img src={agent.avatar} alt={displayName} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-400 text-sm font-bold">
                        {displayName.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-gray-900 ${
                    isOnline ? 'bg-green-500' : 'bg-gray-600'
                  }`} />
                </div>
                <span className={`text-[11px] text-center truncate w-full ${
                  isActive ? 'text-emerald-300' : 'text-gray-400'
                }`}>
                  {displayName}
                </span>
              </div>
            )
          }

          // List mode
          return (
            <div
              key={agent.id}
              onClick={() => onSelectAgent(agent.id)}
              className={`
                flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer transition-all duration-200
                ${isActive
                  ? 'bg-emerald-500/20 border border-emerald-500/50'
                  : 'border border-transparent hover:bg-gray-800'
                }
              `}
            >
              <div className="relative flex-shrink-0">
                <div className="w-8 h-8 rounded-full overflow-hidden bg-gray-700">
                  {agent.avatar ? (
                    <img src={agent.avatar} alt={displayName} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs font-bold">
                      {displayName.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
                <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-gray-900 ${
                  isOnline ? 'bg-green-500' : 'bg-gray-600'
                }`} />
              </div>
              <div className="flex-1 min-w-0">
                <span className={`text-sm truncate block ${
                  isActive ? 'text-emerald-300' : 'text-gray-300'
                }`}>
                  {displayName}
                </span>
                <span className="text-[10px] text-gray-500 truncate block">
                  {agent.name || agent.alias}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
