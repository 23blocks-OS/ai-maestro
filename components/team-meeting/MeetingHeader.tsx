'use client'

import { Users, Plus, PhoneOff } from 'lucide-react'

interface MeetingHeaderProps {
  teamName: string
  agentCount: number
  onSetTeamName: (name: string) => void
  onAddAgent: () => void
  onEndMeeting: () => void
}

export default function MeetingHeader({
  teamName,
  agentCount,
  onSetTeamName,
  onAddAgent,
  onEndMeeting,
}: MeetingHeaderProps) {
  return (
    <div className="flex items-center gap-3 px-4 py-2 border-b border-gray-800 bg-gray-950 flex-shrink-0">
      <div className="flex items-center gap-2 text-emerald-400">
        <Users className="w-4 h-4" />
        <span className="text-xs font-medium uppercase tracking-wider">Meeting</span>
      </div>

      {/* Editable team name */}
      <input
        type="text"
        value={teamName}
        onChange={e => onSetTeamName(e.target.value)}
        className="text-sm text-white bg-transparent border-b border-transparent hover:border-gray-600 focus:border-emerald-500 focus:outline-none px-1 py-0.5 max-w-[200px]"
        placeholder="Team name..."
      />

      <span className="text-xs text-gray-500">
        {agentCount} agent{agentCount !== 1 ? 's' : ''}
      </span>

      <div className="flex-1" />

      <button
        onClick={onAddAgent}
        className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded transition-colors"
      >
        <Plus className="w-3 h-3" />
        Add Agent
      </button>

      <button
        onClick={onEndMeeting}
        className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-red-600/80 hover:bg-red-600 text-white rounded transition-colors"
      >
        <PhoneOff className="w-3 h-3" />
        End Meeting
      </button>
    </div>
  )
}
