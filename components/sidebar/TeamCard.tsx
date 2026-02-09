'use client'

import { useState } from 'react'
import { Play, Pencil, Trash2 } from 'lucide-react'
import { formatDistanceToNow } from '@/lib/utils'
import type { Team } from '@/types/team'
import type { UnifiedAgent } from '@/types/agent'

interface TeamCardProps {
  team: Team
  agents: UnifiedAgent[]
  onStartMeeting: (team: Team) => void
  onEdit: (team: Team) => void
  onDelete: (team: Team) => void
}

export default function TeamCard({ team, agents, onStartMeeting, onEdit, onDelete }: TeamCardProps) {
  const [confirmDelete, setConfirmDelete] = useState(false)

  const memberAgents = team.agentIds
    .map(id => agents.find(a => a.id === id))
  const maxAvatars = 5
  const shown = memberAgents.slice(0, maxAvatars)
  const overflow = memberAgents.length - maxAvatars

  const getInitials = (agent: UnifiedAgent | undefined) => {
    if (!agent) return '?'
    const name = agent.label || agent.name || agent.alias || '?'
    return name.slice(0, 2).toUpperCase()
  }

  return (
    <div className="group px-3 py-2.5 rounded-lg hover:bg-gray-800/60 transition-all duration-200 cursor-pointer border border-transparent hover:border-gray-700/50">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-200 truncate">{team.name}</span>
            <span className="text-xs text-gray-500 flex-shrink-0">{team.agentIds.length}</span>
          </div>

          {team.description && (
            <p className="text-xs text-gray-500 truncate mt-0.5">{team.description}</p>
          )}

          {/* Agent avatars */}
          <div className="flex items-center gap-0.5 mt-2">
            {shown.map((agent, i) => (
              <div
                key={agent?.id || i}
                className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-medium border border-gray-700 ${
                  agent ? 'bg-gray-700 text-gray-300' : 'bg-gray-800 text-gray-500'
                }`}
                title={agent ? (agent.label || agent.name || 'Unknown') : 'Deleted agent'}
              >
                {agent?.avatar && (agent.avatar.startsWith('http') || agent.avatar.startsWith('/')) ? (
                  <img src={agent.avatar} alt="" className="w-full h-full rounded-full object-cover" />
                ) : (
                  getInitials(agent)
                )}
              </div>
            ))}
            {overflow > 0 && (
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-medium bg-gray-800 text-gray-400 border border-gray-700">
                +{overflow}
              </div>
            )}
          </div>

          {team.lastMeetingAt && (
            <span className="text-[10px] text-gray-600 mt-1 block">
              Last meeting {formatDistanceToNow(team.lastMeetingAt)}
            </span>
          )}
        </div>

        {/* Hover actions */}
        <div className="hidden group-hover:flex items-center gap-1 flex-shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); onStartMeeting(team) }}
            className="p-1 rounded hover:bg-green-500/20 text-gray-400 hover:text-green-400 transition-all"
            title="Start meeting"
          >
            <Play className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(team) }}
            className="p-1 rounded hover:bg-blue-500/20 text-gray-400 hover:text-blue-400 transition-all"
            title="Edit team"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          {confirmDelete ? (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(team); setConfirmDelete(false) }}
              className="p-1 rounded bg-red-500/20 text-red-400 text-[10px] font-medium transition-all"
              onMouseLeave={() => setConfirmDelete(false)}
            >
              Confirm
            </button>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); setConfirmDelete(true) }}
              className="p-1 rounded hover:bg-red-500/20 text-gray-400 hover:text-red-400 transition-all"
              title="Delete team"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
