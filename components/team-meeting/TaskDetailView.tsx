'use client'

import { useState, useEffect } from 'react'
import { X, Trash2, Archive, Circle, PlayCircle, Eye, CheckCircle2, Lock } from 'lucide-react'
import type { Agent } from '@/types/agent'
import type { TaskWithDeps, TaskStatus } from '@/types/task'
import DependencyPicker from './DependencyPicker'

interface TaskDetailViewProps {
  task: TaskWithDeps
  agents: Agent[]
  allTasks: TaskWithDeps[]
  onUpdate: (taskId: string, updates: { subject?: string; description?: string; status?: TaskStatus; assigneeAgentId?: string | null; blockedBy?: string[] }) => Promise<void>
  onDelete: (taskId: string) => Promise<void>
  onClose: () => void
}

export default function TaskDetailView({ task, agents, allTasks, onUpdate, onDelete, onClose }: TaskDetailViewProps) {
  const [subject, setSubject] = useState(task.subject)
  const [description, setDescription] = useState(task.description || '')
  const [assigneeAgentId, setAssigneeAgentId] = useState(task.assigneeAgentId || '')
  const [blockedBy, setBlockedBy] = useState<string[]>(task.blockedBy)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

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
          {([
            { status: 'backlog' as TaskStatus, icon: Archive, label: 'Backlog', activeClass: 'bg-gray-700 text-gray-200' },
            { status: 'pending' as TaskStatus, icon: Circle, label: 'To Do', activeClass: 'bg-gray-700 text-gray-200' },
            { status: 'in_progress' as TaskStatus, icon: PlayCircle, label: 'In Progress', activeClass: 'bg-blue-600/30 text-blue-300' },
            { status: 'review' as TaskStatus, icon: Eye, label: 'Review', activeClass: 'bg-amber-600/30 text-amber-300' },
            { status: 'completed' as TaskStatus, icon: CheckCircle2, label: 'Done', activeClass: 'bg-emerald-600/30 text-emerald-300' },
          ]).map(({ status: s, icon: Icon, label, activeClass }) => {
            const isActive = task.status === s
            const disabled = task.isBlocked && s !== 'pending' && s !== 'backlog'

            return (
              <button
                key={s}
                onClick={() => handleStatusChange(s)}
                disabled={disabled}
                className={`flex items-center gap-1 text-[11px] px-2 py-1 rounded transition-colors ${isActive ? activeClass : 'text-gray-500 hover:bg-gray-800'} ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
              >
                {disabled ? <Lock className="w-3 h-3" /> : <Icon className="w-3 h-3" />}
                {label}
              </button>
            )
          })}
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
