'use client'

import { useState, useEffect } from 'react'
import { X, Trash2, Archive, Circle, PlayCircle, Eye, CheckCircle2, Hourglass, Lock, Send, RotateCw } from 'lucide-react'
import type { Agent } from '@/types/agent'
import { QUADRANTS, quadrantOf, type Quadrant, type TaskWithDeps, type TaskStatus } from '@/types/task'
import DependencyPicker from './DependencyPicker'
import WaitingFields from './WaitingFields'
import { waitingLabel } from './KanbanCard'

interface TaskDetailViewProps {
  task: TaskWithDeps
  agents: Agent[]
  allTasks: TaskWithDeps[]
  onUpdate: (taskId: string, updates: { subject?: string; description?: string; status?: TaskStatus; assigneeAgentId?: string | null; blockedBy?: string[]; waitingOn?: string; waitingNote?: string; urgent?: boolean | null; important?: boolean | null }) => Promise<void>
  onDelete: (taskId: string) => Promise<void>
  onClose: () => void
  /** When given, the card shows a comment box. deliver=true sends the text to the assignee's session. */
  onAddComment?: (task: TaskWithDeps, text: string, deliver: boolean) => Promise<{ delivered?: boolean; reason?: string }>
  onRetryComment?: (task: TaskWithDeps, commentId: string) => Promise<{ delivered?: boolean; reason?: string }>
  /** Start with the waiting picker open (a card was dropped on the Waiting column) */
  startWaiting?: boolean
}

export default function TaskDetailView({ task, agents, allTasks, onUpdate, onDelete, onClose, onAddComment, onRetryComment, startWaiting }: TaskDetailViewProps) {
  const [subject, setSubject] = useState(task.subject)
  const [description, setDescription] = useState(task.description || '')
  const [assigneeAgentId, setAssigneeAgentId] = useState(task.assigneeAgentId || '')
  const [blockedBy, setBlockedBy] = useState<string[]>(task.blockedBy)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [waitingDraft, setWaitingDraft] = useState<{ on: string; note: string } | null>(
    startWaiting ? { on: task.waitingOn || 'juan', note: task.waitingNote || '' } : null
  )
  const [commentText, setCommentText] = useState('')
  const [commentBusy, setCommentBusy] = useState(false)
  const [commentNote, setCommentNote] = useState<string | null>(null)

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
    if (status === 'waiting') {
      // Waiting needs a "waiting on": ask first
      setWaitingDraft({ on: task.waitingOn || 'juan', note: task.waitingNote || '' })
      return
    }
    setWaitingDraft(null)
    await onUpdate(task.id, { status })
  }

  const applyWaiting = async () => {
    if (!waitingDraft) return
    await onUpdate(task.id, { status: 'waiting', waitingOn: waitingDraft.on, waitingNote: waitingDraft.note.trim() || undefined })
    setWaitingDraft(null)
  }

  const agentName = (id: string) => {
    const a = agents.find(x => x.id === id)
    return a ? (a.label || a.name || a.alias || id.slice(0, 8)) : undefined
  }

  const sendComment = async (deliver: boolean) => {
    if (!onAddComment || !commentText.trim()) return
    setCommentBusy(true)
    setCommentNote(null)
    try {
      const r = await onAddComment(task, commentText.trim(), deliver)
      setCommentText('')
      if (deliver && r.delivered === false) setCommentNote(`Saved, but not sent to the agent: ${r.reason || 'it could not take it'}. Use Retry when it can.`)
    } catch (err) {
      setCommentNote(err instanceof Error ? err.message : 'Could not save the comment')
    } finally {
      setCommentBusy(false)
    }
  }

  const retry = async (commentId: string) => {
    if (!onRetryComment) return
    setCommentBusy(true)
    setCommentNote(null)
    try {
      const r = await onRetryComment(task, commentId)
      if (r.delivered === false) setCommentNote(`Still not sent: ${r.reason || 'the agent could not take it'}`)
    } finally {
      setCommentBusy(false)
    }
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
    <div className="flex flex-col h-full flex-1 min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800">
        <span className="text-xs text-gray-400 font-medium">Task Detail</span>
        <button onClick={onClose} className="p-0.5 hover:bg-gray-800 rounded transition-colors">
          <X className="w-3.5 h-3.5 text-gray-500" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-3">
        {/* Status buttons */}
        <div className="flex flex-wrap gap-1">
          {([
            { status: 'backlog' as TaskStatus, icon: Archive, label: 'Backlog', activeClass: 'bg-gray-700 text-gray-200' },
            { status: 'pending' as TaskStatus, icon: Circle, label: 'To Do', activeClass: 'bg-gray-700 text-gray-200' },
            { status: 'in_progress' as TaskStatus, icon: PlayCircle, label: 'In Progress', activeClass: 'bg-blue-600/30 text-blue-300' },
            { status: 'review' as TaskStatus, icon: Eye, label: 'Review', activeClass: 'bg-amber-600/30 text-amber-300' },
            { status: 'waiting' as TaskStatus, icon: Hourglass, label: 'Waiting', activeClass: 'bg-orange-600/30 text-orange-300' },
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

        {/* Eisenhower matrix: where this card sits (the same two answers the Matrix view drags between) */}
        <div data-testid="matrix-picker">
          <label className="text-[10px] text-gray-500 uppercase tracking-wider">Matrix</label>
          <div className="flex flex-wrap gap-1 mt-1">
            {([null, 'q1', 'q2', 'q3', 'q4'] as Array<Quadrant | null>).map(q => {
              const active = quadrantOf(task) === q
              return (
                <button
                  key={q || 'none'}
                  onClick={() => onUpdate(task.id, q ? { urgent: QUADRANTS[q].urgent, important: QUADRANTS[q].important } : { urgent: null, important: null })}
                  className={`text-[11px] px-2 py-1 rounded transition-colors ${active ? 'bg-blue-600/30 text-blue-300' : 'text-gray-500 hover:bg-gray-800'}`}
                  title={q ? `${QUADRANTS[q].urgent ? 'Urgent' : 'Not urgent'}, ${QUADRANTS[q].important ? 'important' : 'not important'}` : 'Not on the matrix yet'}
                  data-testid={`place-${q || 'none'}`}
                >
                  {q ? QUADRANTS[q].label : 'Not placed'}
                </button>
              )
            })}
          </div>
        </div>

        {task.status === 'waiting' && !waitingDraft && (
          <p className="text-[11px] text-orange-300/90">
            {waitingLabel(task, agentName)}{task.waitingNote ? `: ${task.waitingNote}` : ''}
            <button onClick={() => setWaitingDraft({ on: task.waitingOn || 'juan', note: task.waitingNote || '' })} className="ml-2 text-blue-400 hover:text-blue-300">Change</button>
          </p>
        )}
        {waitingDraft && (
          <div className="space-y-1.5">
            <WaitingFields agents={agents} on={waitingDraft.on} note={waitingDraft.note} onChange={setWaitingDraft} />
            <div className="flex gap-2">
              <button onClick={applyWaiting} className="text-[11px] px-2.5 py-1 bg-orange-600/80 hover:bg-orange-500 text-white rounded">Set waiting</button>
              <button onClick={() => setWaitingDraft(null)} className="text-[11px] px-2 py-1 text-gray-400 hover:text-gray-200">Cancel</button>
            </div>
          </div>
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
            disabled={task.scope === 'agent'}
            title={task.scope === 'agent' ? "A card on an agent's own board stays that agent's. Use a team to share work." : undefined}
            className="w-full text-[11px] bg-gray-800/50 text-gray-300 rounded px-2 py-1 mt-1 focus:outline-none focus:ring-1 focus:ring-gray-600 disabled:opacity-60"
          >
            <option value="">Unassigned</option>
            {/* A project card can be for an agent this dashboard does not list (another host): show who it is for */}
            {assigneeAgentId && !agents.some(a => a.id === assigneeAgentId) && (
              <option value={assigneeAgentId}>{task.assigneeName || assigneeAgentId}</option>
            )}
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

        {/* Comments: instructions for the assignee */}
        {onAddComment && (
          <div className="pt-2 border-t border-gray-800/50 space-y-2" data-testid="task-comments">
            <label className="text-[10px] text-gray-500 uppercase tracking-wider">Comments</label>
            {(task.comments || []).map(c => (
              <div key={c.id} className="text-[11px] bg-gray-800/40 rounded px-2 py-1.5">
                <div className="flex items-center gap-2 text-[10px] text-gray-500">
                  <span>{c.author.kind === 'operator' ? 'You' : (c.author.id ? agentName(c.author.id) || 'Agent' : 'Agent')}</span>
                  <span>{new Date(c.createdAt).toLocaleString()}</span>
                  {c.author.kind === 'operator' && (
                    c.deliveredAt
                      ? <span className="text-emerald-400/80">sent to the agent</span>
                      : <span className="flex items-center gap-1 text-red-400">
                          not sent
                          {onRetryComment && (
                            <button onClick={() => retry(c.id)} disabled={commentBusy} className="flex items-center gap-0.5 text-blue-400 hover:text-blue-300 disabled:opacity-50">
                              <RotateCw className="w-2.5 h-2.5" />Retry
                            </button>
                          )}
                        </span>
                  )}
                </div>
                <p className="text-gray-300 whitespace-pre-wrap break-words mt-0.5">{c.text}</p>
              </div>
            ))}
            <textarea
              value={commentText}
              onChange={e => setCommentText(e.target.value)}
              placeholder={task.assigneeAgentId ? 'Write an instruction for the agent...' : 'Assign someone first to send them an instruction'}
              rows={2}
              className="w-full text-[11px] bg-gray-800/50 text-gray-300 placeholder-gray-600 rounded px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-gray-600"
            />
            <div className="flex items-center gap-2">
              <button
                onClick={() => sendComment(true)}
                disabled={commentBusy || !commentText.trim() || !task.assigneeAgentId}
                className="flex items-center gap-1 text-[11px] px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded disabled:opacity-40"
              >
                <Send className="w-3 h-3" />Send to agent
              </button>
              <button
                onClick={() => sendComment(false)}
                disabled={commentBusy || !commentText.trim()}
                className="text-[11px] px-2 py-1 text-gray-400 hover:text-gray-200 disabled:opacity-40"
                title="Keep it on the card; the agent is not told"
              >
                Save as note
              </button>
            </div>
            {commentNote && <p className="text-[10px] text-amber-400">{commentNote}</p>}
            <p className="text-[10px] text-gray-600">An operator comment is a convention on a trusted network, not proof of who wrote it.</p>
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
