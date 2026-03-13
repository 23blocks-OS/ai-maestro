'use client'

import { Archive, Circle, CheckCircle2, PlayCircle, Eye, Lock, User, SearchCheck, UserCheck, GitMerge, Ban, Clock, TestTube, FileQuestion } from 'lucide-react'
import type { TaskWithDeps, TaskStatus } from '@/types/task'

interface KanbanCardProps {
  task: TaskWithDeps
  onSelect: (task: TaskWithDeps) => void
}

const ICON_MAP: Record<string, typeof Circle> = {
  Archive, Circle, PlayCircle, Eye, CheckCircle2, SearchCheck, UserCheck, GitMerge, Ban, Clock, TestTube, FileQuestion,
}

export default function KanbanCard({ task, onSelect }: KanbanCardProps) {
  const Icon = Circle

  const handleDragStart = (e: React.DragEvent) => {
    if (task.isBlocked) {
      e.preventDefault()
      return
    }
    e.dataTransfer.setData('text/plain', task.id)
    e.dataTransfer.effectAllowed = 'move'
  }

  return (
    <div
      draggable={!task.isBlocked}
      onDragStart={handleDragStart}
      onClick={() => onSelect(task)}
      className={`
        group px-3 py-2.5 rounded-lg cursor-pointer transition-all duration-200
        bg-gray-800/80 border border-gray-700/50 hover:border-gray-600/80 hover:bg-gray-800
        ${task.isBlocked ? 'opacity-60 cursor-not-allowed' : 'active:opacity-50'}
      `}
    >
      {/* Subject */}
      <p className={`text-xs leading-snug line-clamp-2 ${task.status === 'completed' ? 'text-gray-500 line-through' : 'text-gray-200'}`}>
        {task.subject}
      </p>

      {task.labels && task.labels.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1">
          {task.labels.slice(0, 3).map(label => (
            <span key={label} className="text-[9px] px-1 py-0.5 rounded bg-gray-700/80 text-gray-400">
              {label}
            </span>
          ))}
          {task.labels.length > 3 && (
            <span className="text-[9px] text-gray-600">+{task.labels.length - 3}</span>
          )}
        </div>
      )}

      {/* Footer row */}
      <div className="flex items-center gap-2 mt-2">
        {task.isBlocked ? (
          <Lock className="w-3 h-3 text-amber-500 flex-shrink-0" />
        ) : (
          <Icon className="w-3 h-3 text-gray-500 flex-shrink-0" />
        )}

        {task.assigneeName && (
          <span className="flex items-center gap-1 text-[10px] text-gray-500 truncate">
            <User className="w-2.5 h-2.5 flex-shrink-0" />
            {task.assigneeName}
          </span>
        )}

        <div className="flex-1" />

        {task.blockedBy.length > 0 && (
          <span className="text-[10px] text-amber-500/70 flex-shrink-0">
            {task.blockedBy.length} dep{task.blockedBy.length > 1 ? 's' : ''}
          </span>
        )}

        {task.taskType && (
          <span className="text-[9px] px-1 py-0.5 rounded bg-gray-700/60 text-gray-500 flex-shrink-0">
            {task.taskType}
          </span>
        )}
      </div>
    </div>
  )
}
