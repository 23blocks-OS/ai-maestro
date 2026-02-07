'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import type { TaskWithDeps, TaskStatus } from '@/types/task'
import KanbanCard from './KanbanCard'

interface ColumnConfig {
  status: TaskStatus
  label: string
  dotColor: string
  icon: React.ComponentType<{ className?: string }>
}

interface KanbanColumnProps {
  config: ColumnConfig
  tasks: TaskWithDeps[]
  onDrop: (taskId: string, status: TaskStatus) => void
  onSelectTask: (task: TaskWithDeps) => void
  onQuickAdd?: (status: TaskStatus) => void
}

export default function KanbanColumn({ config, tasks, onDrop, onSelectTask, onQuickAdd }: KanbanColumnProps) {
  const [isDragOver, setIsDragOver] = useState(false)

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setIsDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    // Only clear if we're leaving the column element itself
    if (e.currentTarget.contains(e.relatedTarget as Node)) return
    setIsDragOver(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const taskId = e.dataTransfer.getData('text/plain')
    if (taskId) {
      onDrop(taskId, config.status)
    }
  }

  const Icon = config.icon

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`
        flex flex-col min-w-[220px] flex-1 rounded-xl transition-all duration-200
        bg-gray-900/50 border
        ${isDragOver ? 'border-blue-500 ring-2 ring-blue-500/30 bg-blue-950/20' : 'border-gray-800/50'}
      `}
    >
      {/* Column header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-800/50">
        <span className={`w-2 h-2 rounded-full ${config.dotColor}`} />
        <Icon className="w-3.5 h-3.5 text-gray-400" />
        <span className="text-xs font-medium text-gray-300">{config.label}</span>
        <span className="text-[10px] text-gray-600 bg-gray-800/80 rounded-full px-1.5 min-w-[18px] text-center">
          {tasks.length}
        </span>
      </div>

      {/* Card list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-[100px]">
        {tasks.map(task => (
          <KanbanCard key={task.id} task={task} onSelect={onSelectTask} />
        ))}

        {tasks.length === 0 && (
          <div className="flex items-center justify-center h-16 text-[10px] text-gray-700">
            No tasks
          </div>
        )}
      </div>

      {/* Quick add */}
      {onQuickAdd && (
        <button
          onClick={() => onQuickAdd(config.status)}
          className="flex items-center gap-1 mx-2 mb-2 px-2 py-1.5 rounded-lg text-[11px] text-gray-600 hover:text-gray-400 hover:bg-gray-800/60 transition-colors"
        >
          <Plus className="w-3 h-3" />
          Add task
        </button>
      )}
    </div>
  )
}
