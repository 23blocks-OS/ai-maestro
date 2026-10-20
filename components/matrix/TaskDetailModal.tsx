'use client'

import { useEffect } from 'react'
import type { Agent } from '@/types/agent'
import type { TaskWithDeps } from '@/types/task'
import type { TaskUpdates, CommentResult } from '@/hooks/useTasks'
import TaskDetailView from '@/components/team-meeting/TaskDetailView'

/** The same card detail the board opens (comments, Send to agent, waiting), as a modal for the matrix views */
export default function TaskDetailModal({ task, agents, allTasks, onUpdate, onDelete, onClose, onAddComment, onRetryComment }: {
  task: TaskWithDeps
  agents: Agent[]
  allTasks: TaskWithDeps[]
  onUpdate: (task: TaskWithDeps, updates: TaskUpdates) => Promise<void>
  onDelete: (task: TaskWithDeps) => Promise<void>
  onClose: () => void
  onAddComment: (task: TaskWithDeps, text: string, deliver: boolean) => Promise<CommentResult>
  onRetryComment: (task: TaskWithDeps, commentId: string) => Promise<CommentResult>
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-lg max-h-[80vh] bg-gray-900 border border-gray-700 rounded-xl shadow-2xl overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <TaskDetailView
          task={task}
          agents={agents}
          allTasks={allTasks}
          onUpdate={async (_id, updates) => { await onUpdate(task, updates) }}
          onDelete={async () => { await onDelete(task); onClose() }}
          onClose={onClose}
          onAddComment={onAddComment}
          onRetryComment={onRetryComment}
        />
      </div>
    </div>
  )
}
