'use client'

import { Archive, Circle, PlayCircle, Eye, CheckCircle2, Hourglass, Lock, User, MessageSquare, AlertCircle } from 'lucide-react'
import type { TaskWithDeps, TaskStatus } from '@/types/task'

interface KanbanCardProps {
  task: TaskWithDeps
  onSelect: (task: TaskWithDeps) => void
}

const statusIcon: Record<TaskStatus, typeof Circle> = {
  backlog: Archive,
  pending: Circle,
  in_progress: PlayCircle,
  review: Eye,
  waiting: Hourglass,
  completed: CheckCircle2,
}

/** What a waiting card waits on, in words: juan, outside, hold, or an agent's name */
export function waitingLabel(task: TaskWithDeps, agentName?: (id: string) => string | undefined): string {
  const on = task.waitingOn
  if (!on) return 'waiting'
  if (on === 'juan') return 'Waiting on you'
  if (on === 'outside') return 'Waiting on someone outside'
  if (on === 'hold') return 'On hold'
  // An id is shown as the agent's name when this dashboard knows it; a name is shown as given
  const isId = /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(on)
  return `Waiting on ${agentName?.(on) || (isId ? on.slice(0, 8) : on)}`
}

export default function KanbanCard({ task, onSelect }: KanbanCardProps) {
  const Icon = statusIcon[task.status]

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

      {task.status === 'waiting' && (
        <p className="mt-1.5 text-[10px] text-amber-400/90 truncate" title={task.waitingNote || undefined}>
          {waitingLabel(task)}{task.waitingNote ? `: ${task.waitingNote}` : ''}
        </p>
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

        {task.scope && task.scope !== 'agent' && (
          <span className="text-[10px] text-sky-400/80 truncate max-w-[40%]" title={task.teamName}>
            {task.scope === 'team' ? `team: ${task.teamName || ''}` : task.scope}
          </span>
        )}

        <div className="flex-1" />

        {(task.comments?.some(c => c.author.kind === 'operator' && !c.deliveredAt)) && (
          <span title="An instruction has not reached the agent yet"><AlertCircle className="w-3 h-3 text-red-400 flex-shrink-0" /></span>
        )}
        {(task.comments?.length || 0) > 0 && (
          <span className="flex items-center gap-0.5 text-[10px] text-gray-500 flex-shrink-0">
            <MessageSquare className="w-2.5 h-2.5" />{task.comments!.length}
          </span>
        )}

        {task.blockedBy.length > 0 && (
          <span className="text-[10px] text-amber-500/70 flex-shrink-0">
            {task.blockedBy.length} dep{task.blockedBy.length > 1 ? 's' : ''}
          </span>
        )}
      </div>
    </div>
  )
}
