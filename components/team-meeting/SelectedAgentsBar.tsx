'use client'

import { X, Phone, Bell } from 'lucide-react'
import type { Agent } from '@/types/agent'

interface SelectedAgentsBarProps {
  agents: Agent[]
  selectedAgentIds: string[]
  teamName: string
  notifyAmp: boolean
  onDeselectAgent: (agentId: string) => void
  onSetTeamName: (name: string) => void
  onSetNotifyAmp: (enabled: boolean) => void
  onStartMeeting: () => void
  onSaveTeam: () => void
  onLoadTeam: () => void
}

export default function SelectedAgentsBar({
  agents,
  selectedAgentIds,
  teamName,
  notifyAmp,
  onDeselectAgent,
  onSetTeamName,
  onSetNotifyAmp,
  onStartMeeting,
  onSaveTeam,
  onLoadTeam,
}: SelectedAgentsBarProps) {
  const selectedAgents = selectedAgentIds
    .map(id => agents.find(a => a.id === id))
    .filter(Boolean) as Agent[]

  return (
    <div className="border-t border-gray-800 bg-gray-900/80 backdrop-blur-sm px-4 py-3">
      <div className="flex items-center gap-3 flex-wrap">
        {/* Selected agent chips */}
        <div className="flex items-center gap-1.5 flex-wrap flex-1 min-w-0">
          {selectedAgents.length === 0 ? (
            <span className="text-sm text-gray-500">Select agents to start a meeting</span>
          ) : (
            selectedAgents.map(agent => {
              const displayName = agent.label || agent.name || agent.alias || ''
              return (
                <div
                  key={agent.id}
                  className="flex items-center gap-1.5 bg-emerald-500/20 border border-emerald-500/40 rounded-full pl-1.5 pr-1 py-0.5"
                >
                  <div className="w-5 h-5 rounded-full overflow-hidden bg-gray-700 flex-shrink-0">
                    {agent.avatar ? (
                      <img src={agent.avatar} alt={displayName} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[10px] text-gray-400 font-bold">
                        {displayName.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <span className="text-xs text-emerald-300 max-w-[80px] truncate">{displayName}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); onDeselectAgent(agent.id) }}
                    className="p-0.5 rounded-full hover:bg-emerald-500/30 text-emerald-400"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )
            })
          )}
        </div>

        {/* Team name input */}
        <input
          type="text"
          value={teamName}
          onChange={e => onSetTeamName(e.target.value)}
          placeholder="Team name..."
          className="w-40 px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-emerald-500"
        />

        {/* AMP toggle */}
        <label className="flex items-center gap-1.5 cursor-pointer text-sm text-gray-400 hover:text-gray-300">
          <input
            type="checkbox"
            checked={notifyAmp}
            onChange={e => onSetNotifyAmp(e.target.checked)}
            className="sr-only"
          />
          <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
            notifyAmp ? 'bg-emerald-500 border-emerald-500' : 'border-gray-600 bg-gray-800'
          }`}>
            {notifyAmp && <Bell className="w-2.5 h-2.5 text-white" />}
          </div>
          <span className="text-xs whitespace-nowrap">Notify</span>
        </label>

        {/* Save / Load buttons */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={onSaveTeam}
            disabled={selectedAgentIds.length === 0}
            className="text-xs px-2.5 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Save
          </button>
          <button
            onClick={onLoadTeam}
            className="text-xs px-2.5 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors"
          >
            Load
          </button>
        </div>

        {/* Start Meeting button */}
        <button
          onClick={onStartMeeting}
          disabled={selectedAgentIds.length === 0}
          className="flex items-center gap-1.5 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Phone className="w-3.5 h-3.5" />
          Start Meeting
        </button>
      </div>
    </div>
  )
}
