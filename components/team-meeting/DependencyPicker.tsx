'use client'

import { X } from 'lucide-react'
import type { TaskWithDeps } from '@/types/task'

interface DependencyPickerProps {
  tasks: TaskWithDeps[]
  selectedIds: string[]
  onChange: (ids: string[]) => void
  excludeTaskId: string | null  // Task being edited (can't depend on itself)
}

export default function DependencyPicker({ tasks, selectedIds, onChange, excludeTaskId }: DependencyPickerProps) {
  // Filter out the task being edited and already-selected tasks from the dropdown
  const availableTasks = tasks.filter(t =>
    t.id !== excludeTaskId && !selectedIds.includes(t.id)
  )

  const selectedTasks = tasks.filter(t => selectedIds.includes(t.id))

  const handleAdd = (taskId: string) => {
    if (!selectedIds.includes(taskId)) {
      onChange([...selectedIds, taskId])
    }
  }

  const handleRemove = (taskId: string) => {
    onChange(selectedIds.filter(id => id !== taskId))
  }

  return (
    <div className="space-y-1">
      <label className="text-[10px] text-gray-500 uppercase tracking-wider">Blocked by</label>

      {/* Selected dependencies */}
      {selectedTasks.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selectedTasks.map(t => (
            <span
              key={t.id}
              className="inline-flex items-center gap-1 text-[10px] bg-gray-800 text-gray-400 rounded px-1.5 py-0.5"
            >
              {t.subject.length > 25 ? t.subject.slice(0, 25) + '...' : t.subject}
              <button
                type="button"
                onClick={() => handleRemove(t.id)}
                className="hover:text-gray-200 transition-colors"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Add dependency dropdown */}
      {availableTasks.length > 0 && (
        <select
          value=""
          onChange={e => { if (e.target.value) handleAdd(e.target.value) }}
          className="w-full text-[11px] bg-gray-800/50 text-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-gray-600"
        >
          <option value="">Add dependency...</option>
          {availableTasks.map(t => (
            <option key={t.id} value={t.id}>
              {t.subject.length > 40 ? t.subject.slice(0, 40) + '...' : t.subject}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}
