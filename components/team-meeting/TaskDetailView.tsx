'use client'

import { useState, useEffect } from 'react'
import { X, Trash2, Archive, Circle, PlayCircle, Eye, CheckCircle2, Lock } from 'lucide-react'
import type { Agent } from '@/types/agent'
import type { TaskWithDeps, TaskStatus } from '@/types/task'
import type { KanbanColumnConfig } from '@/types/team'
import { DEFAULT_KANBAN_COLUMNS } from '@/types/team'
import DependencyPicker from './DependencyPicker'

interface TaskDetailViewProps {
  task: TaskWithDeps
  agents: Agent[]
  allTasks: TaskWithDeps[]
  kanbanColumns?: KanbanColumnConfig[]
  onUpdate: (taskId: string, updates: { subject?: string; description?: string; status?: TaskStatus; assigneeAgentId?: string | null; blockedBy?: string[] }) => Promise<void>
  onDelete: (taskId: string) => Promise<void>
  onClose: () => void
}

export default function TaskDetailView({ task, agents, allTasks, kanbanColumns, onUpdate, onDelete, onClose }: TaskDetailViewProps) {
  const [subject, setSubject] = useState(task.subject)
  const [description, setDescription] = useState(task.description || '')
  const [assigneeAgentId, setAssigneeAgentId] = useState(task.assigneeAgentId || '')
  const [blockedBy, setBlockedBy] = useState<string[]>(task.blockedBy)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const columns = kanbanColumns || DEFAULT_KANBAN_COLUMNS

  // Sync when task changes externally
  useEffect(() => {
    setSubject(task.subject)
    setDescription(task.description || '')
    setAssigneeAgentId(task.assigneeAgentId || '')
    setBlockedBy(task.blockedBy)
  }, [task.id, task.subject, task.description, task.assigneeAgentId, task.blockedBy])

  const handleSave = async () => {
    setSaving(true)
    try {
      await onUpdate(task.id, {
        subject: subject.trim(),
        description: description.trim() || undefined,
        assigneeAgentId: assigneeAgentId || null,
        blockedBy,
      })
    } finally {
      setSaving(false)
    }
  }

  const handleStatusChange = async (status: TaskStatus) => {
    if (task.isBlocked && status !== 'pending' && status !== 'backlog') return
    await onUpdate(task.id, { status })
  }

  const handleDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    await onDelete(task.id)
    onClose()
  }

  const hasChanges = subject !== task.subject
    || description !== (task.description || '')
    || assigneeAgentId !== (task.assigneeAgentId || '')
    || JSON.stringify(blockedBy) !== JSON.stringify(task.blockedBy)

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800">
        <span className="text-xs text-gray-400 font-medium">Task Detail</span>
        <button onClick={onClose} className="p-0.5 hover:bg-gray-800 rounded transition-colors">
          <X className="w-3.5 h-3.5 text-gray-500" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {/* Status buttons */}
        <div className="flex flex-wrap gap-1">
          {columns.map(col => (
            <button
              key={col.id}
              onClick={() => handleStatusChange(col.id)}
              disabled={task.isBlocked && col.id !== 'pending' && col.id !== 'backlog'}
              className={`px-2 py-1 text-xs rounded transition-colors ${
                task.status === col.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              } ${task.isBlocked && col.id !== 'pending' && col.id !== 'backlog' ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {col.label}
            </button>
          ))}
        </div>

        {task.isBlocked && (
          <p className="text-[10px] text-amber-500/80">Blocked by incomplete dependencies</p>
        )}

        {/* Subject */}
        <div>
          <label className="text-[10px] text-gray-500 uppercase tracking-wider">Subject</label>
          <input
            type="text"
            value={subject}
            onChange={e => setSubject(e.target.value)}
            className="w-full text-xs bg-gray-800/50 text-gray-200 rounded px-2 py-1.5 mt-1 focus:outline-none focus:ring-1 focus:ring-gray-600"
          />
        </div>

        {/* Description */}
        <div>
          <label className="text-[10px] text-gray-500 uppercase tracking-wider">Description</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Add description..."
            rows={3}
            className="w-full text-[11px] bg-gray-800/50 text-gray-300 placeholder-gray-600 rounded px-2 py-1.5 mt-1 resize-none focus:outline-none focus:ring-1 focus:ring-gray-600"
          />
        </div>

        {/* Assignee */}
        <div>
          <label className="text-[10px] text-gray-500 uppercase tracking-wider">Assignee</label>
          <select
            value={assigneeAgentId}
            onChange={e => setAssigneeAgentId(e.target.value)}
            className="w-full text-[11px] bg-gray-800/50 text-gray-300 rounded px-2 py-1 mt-1 focus:outline-none focus:ring-1 focus:ring-gray-600"
          >
            <option value="">Unassigned</option>
            {agents.map(a => (
              <option key={a.id} value={a.id}>
                {a.label || a.name || a.alias || a.id.slice(0, 8)}
              </option>
            ))}
          </select>
        </div>

        {/* Dependencies */}
        <DependencyPicker
          tasks={allTasks}
          selectedIds={blockedBy}
          onChange={setBlockedBy}
          excludeTaskId={task.id}
        />

        {/* External Reference */}
        {task.externalRef && (
          <div className="space-y-1">
            <label className="text-[11px] text-gray-500 font-medium">External Reference</label>
            <div className="text-xs text-gray-300">{task.externalRef}</div>
          </div>
        )}

        {/* PR URL */}
        {task.prUrl && (
          <div className="space-y-1">
            <label className="text-[11px] text-gray-500 font-medium">PR URL</label>
            <a href={task.prUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:text-blue-300">{task.prUrl}</a>
          </div>
        )}

        {/* Review Result */}
        {task.reviewResult && (
          <div className="space-y-1">
            <label className="text-[11px] text-gray-500 font-medium">Review Result</label>
            <span className={`text-xs px-2 py-0.5 rounded ${task.reviewResult === 'pass' ? 'bg-emerald-900/50 text-emerald-400' : 'bg-red-900/50 text-red-400'}`}>
              {task.reviewResult.toUpperCase()}
            </span>
          </div>
        )}

        {/* Type */}
        {task.taskType && (
          <div className="space-y-1">
            <label className="text-[11px] text-gray-500 font-medium">Type</label>
            <span className="text-xs px-2 py-0.5 rounded bg-gray-800 text-gray-400">{task.taskType}</span>
          </div>
        )}

        {/* Labels */}
        {task.labels && task.labels.length > 0 && (
          <div className="space-y-1">
            <label className="text-[11px] text-gray-500 font-medium">Labels</label>
            <div className="flex flex-wrap gap-1">
              {task.labels.map(label => (
                <span key={label} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-400">{label}</span>
              ))}
            </div>
          </div>
        )}

        {/* Acceptance Criteria */}
        {task.acceptanceCriteria && task.acceptanceCriteria.length > 0 && (
          <div className="space-y-1">
            <label className="text-[11px] text-gray-500 font-medium">Acceptance Criteria</label>
            <ul className="text-xs text-gray-400 space-y-0.5 list-disc list-inside">
              {task.acceptanceCriteria.map((criterion, i) => (
                <li key={i}>{criterion}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Timestamps */}
        <div className="text-[10px] text-gray-600 space-y-0.5 pt-2 border-t border-gray-800/50">
          <p>Created: {new Date(task.createdAt).toLocaleString()}</p>
          {task.startedAt && <p>Started: {new Date(task.startedAt).toLocaleString()}</p>}
          {task.completedAt && <p>Completed: {new Date(task.completedAt).toLocaleString()}</p>}
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-3 py-2 border-t border-gray-800">
        {confirmDelete ? (
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-red-400">Delete?</span>
            <button
              onClick={handleDelete}
              className="text-[11px] px-2 py-0.5 bg-red-600 hover:bg-red-500 text-white rounded transition-colors"
            >
              Yes
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="text-[11px] px-2 py-0.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors"
            >
              No
            </button>
          </div>
        ) : (
          <button
            onClick={handleDelete}
            className="flex items-center gap-1 text-[11px] text-red-400/70 hover:text-red-400 transition-colors"
          >
            <Trash2 className="w-3 h-3" />
            Delete
          </button>
        )}
        {hasChanges && (
          <button
            onClick={handleSave}
            disabled={saving || !subject.trim()}
            className="text-[11px] px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        )}
      </div>
    </div>
  )
}
