'use client'

import { Users, ListTodo, FileText, Clock, Play, Trash2 } from 'lucide-react'
import type { Team } from '@/types/team'

interface TeamListCardProps {
  team: Team
  taskCount: number
  docCount: number
  onClick: () => void
  onStartMeeting: () => void
  onDelete: () => void
}

export default function TeamListCard({ team, taskCount, docCount, onClick, onStartMeeting, onDelete }: TeamListCardProps) {
  return (
    <div
      className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-5 hover:border-emerald-600/50 transition-all cursor-pointer group"
      onClick={onClick}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-emerald-600/20 flex items-center justify-center">
            <Users className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-white">{team.name}</h3>
            <span className="text-[10px] text-gray-500">{team.agentIds.length} agent{team.agentIds.length !== 1 ? 's' : ''}</span>
          </div>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete() }}
          className="p-1 rounded hover:bg-red-900/30 text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
          title="Delete team"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Description */}
      {team.description && (
        <p className="text-xs text-gray-400 mb-4 line-clamp-2">{team.description}</p>
      )}

      {/* Stats */}
      <div className="flex items-center gap-4 mb-4">
        <div className="flex items-center gap-1 text-xs text-gray-500">
          <ListTodo className="w-3 h-3" />
          {taskCount} task{taskCount !== 1 ? 's' : ''}
        </div>
        <div className="flex items-center gap-1 text-xs text-gray-500">
          <FileText className="w-3 h-3" />
          {docCount} doc{docCount !== 1 ? 's' : ''}
        </div>
        {team.lastActivityAt && (
          <div className="flex items-center gap-1 text-xs text-gray-500">
            <Clock className="w-3 h-3" />
            {new Date(team.lastActivityAt).toLocaleDateString()}
          </div>
        )}
      </div>

      {/* Actions */}
      <button
        onClick={(e) => { e.stopPropagation(); onStartMeeting() }}
        className="w-full flex items-center justify-center gap-1.5 text-xs px-3 py-2 bg-emerald-600/10 hover:bg-emerald-600 text-emerald-400 hover:text-white border border-emerald-600/30 hover:border-emerald-600 rounded transition-all"
      >
        <Play className="w-3 h-3" />
        Start Meeting
      </button>
    </div>
  )
}
