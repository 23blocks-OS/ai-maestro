'use client'

import { Archive, Circle, CheckCircle2, PlayCircle, Eye, Lock, User, GitPullRequest, GitBranch, CircleDot } from 'lucide-react'
import type { TaskWithDeps } from '@/types/task'

// Map task status to a meaningful icon
const STATUS_ICON_MAP: Record<string, React.ElementType> = {
  backlog: Archive,
  pending: Circle,
  in_progress: PlayCircle,
  review: Eye,
  completed: CheckCircle2,
}

// Priority indicator colors: 0=critical(red), 1=high(amber), 2=medium(blue), 3+=low(gray)
const PRIORITY_COLORS: Record<number, string> = {
  0: 'bg-red-500',
  1: 'bg-amber-500',
  2: 'bg-blue-500',
}

// Stable color palette for label pills — hash-based assignment
const LABEL_COLORS = [
  'bg-purple-800/60 text-purple-300',
  'bg-blue-800/60 text-blue-300',
  'bg-emerald-800/60 text-emerald-300',
  'bg-amber-800/60 text-amber-300',
  'bg-pink-800/60 text-pink-300',
  'bg-cyan-800/60 text-cyan-300',
]
function labelColor(label: string): string {
  const hash = label.split('').reduce((acc, c) => c.charCodeAt(0) + ((acc << 5) - acc), 0)
  return LABEL_COLORS[Math.abs(hash) % LABEL_COLORS.length]
}

interface KanbanCardProps {
  task: TaskWithDeps
  onSelect: (task: TaskWithDeps) => void
  isSelected?: boolean
}

// Stable color palette for assignee avatar circles — hash-based assignment
const ASSIGNEE_COLORS = [
  'bg-purple-600', 'bg-blue-600', 'bg-emerald-600', 'bg-amber-600',
  'bg-pink-600', 'bg-cyan-600', 'bg-indigo-600', 'bg-rose-600',
]
function assigneeColor(name: string): string {
  const hash = name.split('').reduce((acc, c) => c.charCodeAt(0) + ((acc << 5) - acc), 0)
  return ASSIGNEE_COLORS[Math.abs(hash) % ASSIGNEE_COLORS.length]
}

export default function KanbanCard({ task, onSelect, isSelected }: KanbanCardProps) {
  const Icon = STATUS_ICON_MAP[task.status] || Circle
  const priorityDot = task.priority != null ? (PRIORITY_COLORS[task.priority] || 'bg-gray-500') : null

  // Filter out Title: pseudo-labels and assign: labels (shown as assignee instead)
  const displayLabels = (task.labels || []).filter(l => !l.startsWith('Title:') && !l.startsWith('assign:'))

  const handleDragStart = (e: React.DragEvent) => {
    if (task.isBlocked) {
      e.preventDefault()
      return
    }
    e.dataTransfer.setData('text/plain', task.id)
    e.dataTransfer.effectAllowed = 'move'
  }

  // Build dynamic class string for the card wrapper
  const blockedStyle = task.isBlocked ? 'opacity-60 cursor-not-allowed border-amber-700/50' : 'active:opacity-50'
  const selectedGlow = isSelected ? 'shadow-[0_0_15px_rgba(16,185,129,0.3)] ring-1 ring-emerald-500/50' : ''
  const hoverGlow = 'hover:shadow-[0_0_10px_rgba(255,255,255,0.05)]'

  // Subject content — reused for both linked and plain rendering
  const subjectContent = (
    <span className={`text-xs leading-snug line-clamp-2 ${task.status === 'completed' ? 'text-gray-500 line-through' : 'text-gray-200'}`}>
      {task.subject}
    </span>
  )

  return (
    <div
      draggable={!task.isBlocked}
      onDragStart={handleDragStart}
      onClick={() => onSelect(task)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelect(task) }}
      tabIndex={0}
      role="button"
      title={task.description ? task.description.slice(0, 200) + (task.description.length > 200 ? '...' : '') : undefined}
      className={`group px-3 py-3 rounded-lg cursor-pointer transition-all duration-200 bg-gray-800/80 border border-gray-700/50 hover:border-gray-600/80 hover:bg-gray-800 ${blockedStyle} ${selectedGlow} ${hoverGlow}`}
    >
      {/* Repository badge — extracted from externalRef URL */}
      {task.externalRef && (() => {
        const repoMatch = task.externalRef.match(/github\.com\/[^/]+\/([^/]+)/)
        return repoMatch ? (
          <div className="flex items-center gap-1 mb-0.5">
            <GitBranch className="w-2.5 h-2.5 text-gray-500" />
            <span className="text-[9px] text-gray-500 truncate">{repoMatch[1]}</span>
          </div>
        ) : null
      })()}

      {/* Top row: priority dot + subject (clickable if external) */}
      <div className="flex items-start gap-1.5">
        {task.priority != null && (
          <span className="flex items-center gap-1">
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${priorityDot}`} />
            <span className={`text-[10px] font-medium ${
              task.priority === 0 ? 'text-red-400' :
              task.priority === 1 ? 'text-amber-400' :
              task.priority === 2 ? 'text-blue-400' : 'text-gray-400'
            }`}>
              P{task.priority}
            </span>
          </span>
        )}
        {/* Clickable subject for external items — opens GitHub in new tab */}
        {task.externalRef ? (
          <a
            href={task.externalRef}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="hover:underline hover:text-blue-300 transition-colors"
          >
            {subjectContent}
          </a>
        ) : subjectContent}
      </div>

      {/* Labels — Title: pseudo-labels filtered out */}
      {displayLabels.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {displayLabels.slice(0, 3).map(label => (
            <span key={label} className={`text-[9px] px-1.5 py-0.5 rounded-full ${labelColor(label)}`}>
              {label}
            </span>
          ))}
          {displayLabels.length > 3 && (
            <span className="text-[9px] text-gray-600">+{displayLabels.length - 3}</span>
          )}
        </div>
      )}

      {/* Assignee row — prominent display with larger avatar */}
      <div className="flex items-center gap-2 mt-2.5 mb-1">
        {task.assigneeName ? (
          <span className="flex items-center gap-1.5 text-[11px] text-gray-300 truncate" title={`Assigned to ${task.assigneeName}`}>
            {task.assigneeAvatar ? (
              <img
                src={task.assigneeAvatar}
                alt={task.assigneeName}
                className="w-6 h-6 rounded-full object-cover flex-shrink-0 ring-1 ring-gray-600"
              />
            ) : (
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-medium text-white flex-shrink-0 uppercase ring-1 ring-gray-600 ${assigneeColor(task.assigneeName)}`}>
                {task.assigneeName.charAt(0)}
              </span>
            )}
            <span className="truncate max-w-[80px] font-medium">{task.assigneeName}</span>
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-[11px] text-gray-600 italic">
            <span className="w-6 h-6 rounded-full bg-gray-700/50 flex items-center justify-center flex-shrink-0 ring-1 ring-gray-700">
              <User className="w-3 h-3 text-gray-600" />
            </span>
            Unassigned
          </span>
        )}
      </div>

      {/* Footer row — status icon + issue link */}
      <div className="flex items-center gap-2 mt-1">
        {task.isBlocked ? (
          <span title="Task is blocked"><Lock className="w-3 h-3 text-amber-500 flex-shrink-0" /></span>
        ) : (
          <Icon className="w-3 h-3 text-gray-500 flex-shrink-0" />
        )}

        <div className="flex-1" />

        {/* GitHub issue/PR type indicator with colored icon */}
        {task.externalRef && (() => {
          const isPR = task.externalRef.includes('/pull/')
          const issueMatch = task.externalRef.match(/(?:issues|pull)\/(\d+)/)
          if (!issueMatch) return null
          const TypeIcon = isPR ? GitPullRequest : CircleDot
          const isCompleted = task.status === 'done' || task.status === 'completed'
          return (
            <a
              href={task.externalRef}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className={`flex items-center gap-0.5 text-[10px] font-mono hover:underline ${
                isCompleted ? 'text-purple-400' : 'text-green-400'
              }`}
              title={`Open ${isPR ? 'PR' : 'issue'} #${issueMatch[1]} on GitHub`}
            >
              <TypeIcon className="w-3 h-3" />
              #{issueMatch[1]}
            </a>
          )
        })()}

        {/* PR link icon (separate from externalRef, for tasks with a linked PR) */}
        {task.prUrl && (
          <span title="Has PR"><GitPullRequest className="w-3 h-3 text-purple-400/70 flex-shrink-0" /></span>
        )}

        {task.blockedBy.length > 0 && (
          <span className="text-[10px] text-amber-500/70 flex-shrink-0" title={`${task.blockedBy.length} dependencies`}>
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
