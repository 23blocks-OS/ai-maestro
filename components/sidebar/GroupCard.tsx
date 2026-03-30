'use client'

import { useState } from 'react'
import { Play, Pencil, Trash2, UsersRound } from 'lucide-react'
import { formatDistanceToNow } from '@/lib/utils'
import type { Group } from '@/types/group'
import type { UnifiedAgent } from '@/types/agent'

interface GroupCardProps {
  group: Group
  agents: UnifiedAgent[]
  onStartMeeting: (group: Group) => void
  onEdit: (group: Group) => void
  onDelete: (group: Group) => void
}

export default function GroupCard({ group, agents, onStartMeeting, onEdit, onDelete }: GroupCardProps) {
  const [confirmDelete, setConfirmDelete] = useState(false)

  const subscriberAgents = group.subscriberIds
    .map(id => agents.find(a => a.id === id))
  const maxAvatars = 5
  const shown = subscriberAgents.slice(0, maxAvatars)
  const overflow = subscriberAgents.length - maxAvatars

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
            <UsersRound className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
            <span className="text-sm font-medium text-gray-200 truncate">{group.name}</span>
            <span className="text-xs text-gray-500 flex-shrink-0">{group.subscriberIds.length}</span>
          </div>

          {group.description && (
            <p className="text-xs text-gray-500 truncate mt-0.5">{group.description}</p>
          )}

          {/* Subscriber avatars */}
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

          {group.lastMeetingAt && (
            <span className="text-[10px] text-gray-600 mt-1 block">
              Last meeting {formatDistanceToNow(group.lastMeetingAt)}
            </span>
          )}
        </div>

        {/* Hover actions */}
        <div className="hidden group-hover:flex items-center gap-1 flex-shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); onStartMeeting(group) }}
            className="p-1 rounded hover:bg-green-500/20 text-gray-400 hover:text-green-400 transition-all"
            title="Start meeting"
          >
            <Play className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(group) }}
            className="p-1 rounded hover:bg-blue-500/20 text-gray-400 hover:text-blue-400 transition-all"
            title="Edit group"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          {confirmDelete ? (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(group); setConfirmDelete(false) }}
              className="p-1 rounded bg-red-500/20 text-red-400 text-[10px] font-medium transition-all"
              onMouseLeave={() => setConfirmDelete(false)}
            >
              Confirm
            </button>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); setConfirmDelete(true) }}
              className="p-1 rounded hover:bg-red-500/20 text-gray-400 hover:text-red-400 transition-all"
              title="Delete group"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
