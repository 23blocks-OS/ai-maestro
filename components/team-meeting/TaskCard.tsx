'use client'

import { Archive, Circle, CheckCircle2, PlayCircle, Eye, Lock, User } from 'lucide-react'
import type { TaskWithDeps, TaskStatus } from '@/types/task'

interface TaskCardProps {
  task: TaskWithDeps
  onSelect: (task: TaskWithDeps) => void
  onStatusChange: (taskId: string, status: TaskStatus) => void
}

const statusConfig: Record<TaskStatus, { icon: typeof Circle; color: string; bg: string }> = {
  backlog: { icon: Archive, color: 'text-gray-500', bg: 'bg-gray-500' },
  pending: { icon: Circle, color: 'text-gray-400', bg: 'bg-gray-400' },
  in_progress: { icon: PlayCircle, color: 'text-blue-400', bg: 'bg-blue-400' },
  review: { icon: Eye, color: 'text-amber-400', bg: 'bg-amber-400' },
  completed: { icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-400' },
}

export default function TaskCard({ task, onSelect, onStatusChange }: TaskCardProps) {
  const config = statusConfig[task.status]
  const StatusIcon = config.icon

  const handleStatusClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (task.isBlocked) return
    const cycle: TaskStatus[] = ['backlog', 'pending', 'in_progress', 'review', 'completed']
    const idx = cycle.indexOf(task.status)
    const next = cycle[(idx + 1) % cycle.length]
    onStatusChange(task.id, next)
  }

  return (
    <div
      onClick={() => onSelect(task)}
      className={`
        flex items-start gap-2 px-2.5 py-2 rounded-lg cursor-pointer transition-all duration-200
        border border-transparent hover:bg-gray-800/60 hover:border-gray-700/50
        ${task.isBlocked ? 'opacity-60' : ''}
      `}
    >
      {/* Status toggle */}
      <button
        onClick={handleStatusClick}
        disabled={task.isBlocked}
        className={`mt-0.5 flex-shrink-0 ${config.color} hover:opacity-80 transition-opacity ${task.isBlocked ? 'cursor-not-allowed' : ''}`}
        title={task.isBlocked ? 'Blocked by dependencies' : `Status: ${task.status}`}
      >
        {task.isBlocked ? (
          <Lock className="w-4 h-4 text-amber-500" />
        ) : (
          <StatusIcon className="w-4 h-4" />
        )}
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className={`text-xs leading-snug ${task.status === 'completed' ? 'text-gray-500 line-through' : 'text-gray-200'}`}>
          {task.subject}
        </p>
        <div className="flex items-center gap-2 mt-1">
          {task.assigneeName && (
            <span className="flex items-center gap-1 text-[10px] text-gray-500">
              <User className="w-2.5 h-2.5" />
              {task.assigneeName}
            </span>
          )}
          {task.blockedBy.length > 0 && (
            <span className="text-[10px] text-amber-500/70">
              {task.blockedBy.length} dep{task.blockedBy.length > 1 ? 's' : ''}
            </span>
          )}
          {task.blocks.length > 0 && (
            <span className="text-[10px] text-blue-500/70">
              blocks {task.blocks.length}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
