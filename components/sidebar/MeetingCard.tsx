'use client'

import { useState } from 'react'
import { LogIn, Square, Trash2, Users } from 'lucide-react'
import { formatDistanceToNow } from '@/lib/utils'
import type { Meeting } from '@/types/team'
import type { UnifiedAgent } from '@/types/agent'

interface MeetingCardProps {
  meeting: Meeting
  agents: UnifiedAgent[]
  onJoin: (meeting: Meeting) => void
  onEnd: (meeting: Meeting) => void
  onDelete: (meeting: Meeting) => void
}

export default function MeetingCard({ meeting, agents, onJoin, onEnd, onDelete }: MeetingCardProps) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const isActive = meeting.status === 'active'

  const memberAgents = meeting.agentIds
    .map(id => agents.find(a => a.id === id))
    .filter(Boolean) as UnifiedAgent[]

  const timeAgo = isActive
    ? `Started ${formatDistanceToNow(meeting.startedAt)}`
    : meeting.endedAt
      ? `Ended ${formatDistanceToNow(meeting.endedAt)}`
      : ''

  return (
    <div
      className={`group px-3 py-2.5 rounded-lg transition-all duration-200 cursor-pointer border border-transparent ${
        isActive
          ? 'hover:bg-emerald-500/5 hover:border-emerald-500/20'
          : 'hover:bg-gray-800/60 hover:border-gray-700/50 opacity-60'
      }`}
      onClick={() => isActive && onJoin(meeting)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {/* Status dot */}
            {isActive ? (
              <span className="relative flex-shrink-0 w-2 h-2">
                <span className="absolute inset-0 rounded-full bg-emerald-500 animate-ping opacity-75" />
                <span className="relative block w-2 h-2 rounded-full bg-emerald-500" />
              </span>
            ) : (
              <span className="w-2 h-2 rounded-full bg-gray-600 flex-shrink-0" />
            )}

            <span className={`text-sm font-medium truncate ${isActive ? 'text-gray-200' : 'text-gray-400'}`}>
              {meeting.name}
            </span>

            <span className="flex items-center gap-0.5 text-xs text-gray-500 flex-shrink-0">
              <Users className="w-3 h-3" />
              {meeting.agentIds.length}
            </span>
          </div>

          <span className="text-[10px] text-gray-500 mt-0.5 block ml-4">{timeAgo}</span>

          {/* Compact agent names */}
          {memberAgents.length > 0 && (
            <div className="text-[10px] text-gray-600 mt-1 ml-4 truncate">
              {memberAgents.map(a => a.label || a.name).join(', ')}
            </div>
          )}
        </div>

        {/* Hover actions */}
        <div className="hidden group-hover:flex items-center gap-1 flex-shrink-0">
          {isActive && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); onJoin(meeting) }}
                className="p-1 rounded hover:bg-emerald-500/20 text-gray-400 hover:text-emerald-400 transition-all"
                title="Join meeting"
              >
                <LogIn className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onEnd(meeting) }}
                className="p-1 rounded hover:bg-yellow-500/20 text-gray-400 hover:text-yellow-400 transition-all"
                title="End meeting"
              >
                <Square className="w-3.5 h-3.5" />
              </button>
            </>
          )}
          {confirmDelete ? (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(meeting); setConfirmDelete(false) }}
              className="p-1 rounded bg-red-500/20 text-red-400 text-[10px] font-medium transition-all"
              onMouseLeave={() => setConfirmDelete(false)}
            >
              Confirm
            </button>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); setConfirmDelete(true) }}
              className="p-1 rounded hover:bg-red-500/20 text-gray-400 hover:text-red-400 transition-all"
              title="Delete meeting"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
