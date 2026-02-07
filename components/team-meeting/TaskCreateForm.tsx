'use client'

import { useState } from 'react'
import { Plus, ChevronDown, ChevronUp } from 'lucide-react'
import type { Agent } from '@/types/agent'
import type { TaskWithDeps } from '@/types/task'
import DependencyPicker from './DependencyPicker'

interface TaskCreateFormProps {
  agents: Agent[]
  existingTasks: TaskWithDeps[]
  onCreateTask: (data: { subject: string; description?: string; assigneeAgentId?: string; blockedBy?: string[] }) => Promise<void>
}

export default function TaskCreateForm({ agents, existingTasks, onCreateTask }: TaskCreateFormProps) {
  const [subject, setSubject] = useState('')
  const [expanded, setExpanded] = useState(false)
  const [description, setDescription] = useState('')
  const [assigneeAgentId, setAssigneeAgentId] = useState('')
  const [blockedBy, setBlockedBy] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!subject.trim() || submitting) return
    setSubmitting(true)
    try {
      await onCreateTask({
        subject: subject.trim(),
        description: description.trim() || undefined,
        assigneeAgentId: assigneeAgentId || undefined,
        blockedBy: blockedBy.length > 0 ? blockedBy : undefined,
      })
      setSubject('')
      setDescription('')
      setAssigneeAgentId('')
      setBlockedBy([])
      setExpanded(false)
    } finally {
      setSubmitting(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !expanded) {
      e.preventDefault()
      handleSubmit(e as unknown as React.FormEvent)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="px-3 py-2 border-b border-gray-800">
      <div className="flex items-center gap-2">
        <Plus className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
        <input
          type="text"
          value={subject}
          onChange={e => setSubject(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Add a task..."
          className="flex-1 text-xs bg-transparent text-gray-200 placeholder-gray-600 focus:outline-none"
        />
        {subject.trim() && (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="p-0.5 text-gray-500 hover:text-gray-300 transition-colors"
          >
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        )}
      </div>

      {expanded && subject.trim() && (
        <div className="mt-2 ml-5.5 space-y-2">
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Description (optional)"
            rows={2}
            className="w-full text-[11px] bg-gray-800/50 text-gray-300 placeholder-gray-600 rounded px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-gray-600"
          />
          <div className="flex gap-2">
            <select
              value={assigneeAgentId}
              onChange={e => setAssigneeAgentId(e.target.value)}
              className="flex-1 text-[11px] bg-gray-800/50 text-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-gray-600"
            >
              <option value="">Unassigned</option>
              {agents.map(a => (
                <option key={a.id} value={a.id}>
                  {a.label || a.name || a.alias || a.id.slice(0, 8)}
                </option>
              ))}
            </select>
          </div>

          <DependencyPicker
            tasks={existingTasks}
            selectedIds={blockedBy}
            onChange={setBlockedBy}
            excludeTaskId={null}
          />

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={submitting}
              className="text-[11px] px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded transition-colors disabled:opacity-50"
            >
              {submitting ? 'Adding...' : 'Add Task'}
            </button>
          </div>
        </div>
      )}
    </form>
  )
}
