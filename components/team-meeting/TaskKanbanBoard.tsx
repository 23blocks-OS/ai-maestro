'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  X, Archive, Circle, PlayCircle, Eye, CheckCircle2, SearchCheck, UserCheck,
  GitMerge, Ban, Clock, TestTube, FileQuestion, Search, ArrowUp, ArrowDown,
  MoreVertical, Palette, ChevronDown, ChevronRight, Plus, ShieldAlert,
  ExternalLink, GitBranch,
} from 'lucide-react'
import type { Agent } from '@/types/agent'
import type { TaskWithDeps, TaskStatus } from '@/types/task'
import type { KanbanColumnConfig } from '@/types/team'
import { DEFAULT_KANBAN_COLUMNS } from '@/types/team'
import KanbanCard from './KanbanCard'
import TaskDetailView from './TaskDetailView'
import TaskCreateForm from './TaskCreateForm'

const ICON_MAP: Record<string, typeof Circle> = {
  Archive, Circle, PlayCircle, Eye, CheckCircle2, SearchCheck, UserCheck,
  GitMerge, Ban, Clock, TestTube, FileQuestion, ShieldAlert,
}

// 8-color palette consistent with AI Maestro dark theme
const COLUMN_COLORS = [
  { id: 'default', label: 'Default', bg: 'bg-gray-900/50', border: 'border-gray-800/50' },
  { id: 'blue', label: 'Blue', bg: 'bg-blue-950/30', border: 'border-blue-800/50' },
  { id: 'purple', label: 'Purple', bg: 'bg-purple-950/30', border: 'border-purple-800/50' },
  { id: 'amber', label: 'Amber', bg: 'bg-amber-950/30', border: 'border-amber-800/50' },
  { id: 'emerald', label: 'Emerald', bg: 'bg-emerald-950/30', border: 'border-emerald-800/50' },
  { id: 'rose', label: 'Rose', bg: 'bg-red-950/30', border: 'border-red-800/50' },
  { id: 'cyan', label: 'Cyan', bg: 'bg-cyan-950/30', border: 'border-cyan-800/50' },
  { id: 'indigo', label: 'Indigo', bg: 'bg-indigo-950/30', border: 'border-indigo-800/50' },
]

// Blocked column forced to rose/red tint
const BLOCKED_COLOR = { bg: 'bg-red-950/30', border: 'border-red-800/50' }

type SortDir = 'none' | 'asc' | 'desc'

interface ColumnState {
  filter: string
  sort: SortDir
  collapsed: boolean
  colorId: string
}

interface TaskKanbanBoardProps {
  agents: Agent[]
  tasks: TaskWithDeps[]
  tasksByStatus: Record<string, TaskWithDeps[]>
  kanbanColumns?: KanbanColumnConfig[]
  onUpdateTask: (taskId: string, updates: { status?: TaskStatus; [key: string]: unknown }) => Promise<{ unblocked: TaskWithDeps[] }>
  onDeleteTask: (taskId: string) => Promise<void>
  onCreateTask: (data: { subject: string; description?: string; assigneeAgentId?: string; blockedBy?: string[]; priority?: number; status?: string }) => Promise<void>
  onClose?: () => void
  teamName: string
  // Optional new props -- callers that don't pass them won't break
  teamId?: string
  teamAgentIds?: string[]
  columns?: KanbanColumnConfig[]
}

export default function TaskKanbanBoard({
  agents,
  tasks,
  tasksByStatus,
  kanbanColumns,
  onUpdateTask,
  onDeleteTask,
  onCreateTask,
  onClose,
  teamName,
  teamId,
}: TaskKanbanBoardProps) {
  const cols = kanbanColumns || DEFAULT_KANBAN_COLUMNS

  const [selectedTask, setSelectedTask] = useState<TaskWithDeps | null>(null)
  const [quickAddStatus, setQuickAddStatus] = useState<string | null>(null)
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null)

  // Per-column state keyed by column id
  const [colStates, setColStates] = useState<Record<string, ColumnState>>({})
  // Column menu open state
  const [menuOpenCol, setMenuOpenCol] = useState<string | null>(null)
  // Color picker open state
  const [colorPickerCol, setColorPickerCol] = useState<string | null>(null)
  // Issue browser modal
  const [issueBrowserOpen, setIssueBrowserOpen] = useState(false)

  // Horizontal scroll ref for sticky scrollbar
  const boardRef = useRef<HTMLDivElement>(null)

  // Helpers to get/set column state
  const getColState = useCallback((colId: string): ColumnState => {
    if (colStates[colId]) return colStates[colId]
    // Load color from localStorage if available
    const storedColor = typeof window !== 'undefined'
      ? localStorage.getItem(`kanban-col-color-${teamId || 'default'}-${colId}`) || 'default'
      : 'default'
    return { filter: '', sort: 'none', collapsed: false, colorId: storedColor }
  }, [colStates, teamId])

  const setColState = useCallback((colId: string, patch: Partial<ColumnState>) => {
    setColStates(prev => {
      const current = prev[colId] || { filter: '', sort: 'none', collapsed: false, colorId: 'default' }
      const next = { ...current, ...patch }
      // Persist color to localStorage
      if (patch.colorId !== undefined && typeof window !== 'undefined') {
        localStorage.setItem(`kanban-col-color-${teamId || 'default'}-${colId}`, patch.colorId)
      }
      return { ...prev, [colId]: next }
    })
  }, [teamId])

  // Detect if a column is the "blocked" column
  const isBlockedColumn = (colId: string): boolean =>
    colId.toLowerCase().includes('block')

  // Escape key handler: priority order detail > quickAdd > issueBrowser > menu > board close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selectedTask) { setSelectedTask(null) }
        else if (quickAddStatus !== null) { setQuickAddStatus(null) }
        else if (issueBrowserOpen) { setIssueBrowserOpen(false) }
        else if (menuOpenCol) { setMenuOpenCol(null) }
        else if (colorPickerCol) { setColorPickerCol(null) }
        else { onClose?.() }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedTask, quickAddStatus, issueBrowserOpen, menuOpenCol, colorPickerCol, onClose])

  // Close menu/colorPicker on outside click
  useEffect(() => {
    const handleClick = () => {
      setMenuOpenCol(null)
      setColorPickerCol(null)
    }
    if (menuOpenCol || colorPickerCol) {
      // Delay to avoid closing immediately on the click that opened it
      const timer = setTimeout(() => {
        window.addEventListener('click', handleClick, { once: true })
      }, 0)
      return () => { clearTimeout(timer); window.removeEventListener('click', handleClick) }
    }
  }, [menuOpenCol, colorPickerCol])

  const handleDrop = async (taskId: string, newStatus: string) => {
    const task = tasks.find(t => t.id === taskId)
    const isValidStatus = cols.some(col => col.id === newStatus)
    if (!task || task.status === newStatus || task.isBlocked || !isValidStatus) return
    await onUpdateTask(taskId, { status: newStatus })
  }

  const handleQuickAdd = (status: string) => {
    setQuickAddStatus(status)
  }

  const handleQuickCreate = async (data: { subject: string; description?: string; assigneeAgentId?: string; blockedBy?: string[]; priority?: number }) => {
    await onCreateTask({ ...data, status: quickAddStatus || undefined })
    setQuickAddStatus(null)
  }

  // Keep selectedTask synced with fresh data
  const freshSelectedTask = selectedTask ? tasks.find(t => t.id === selectedTask.id) || null : null

  // Filter + sort tasks for a given column
  const getProcessedTasks = useCallback((colId: string, colTasks: TaskWithDeps[]): TaskWithDeps[] => {
    const state = getColState(colId)
    let result = colTasks

    // Filter by subject/description
    if (state.filter) {
      const q = state.filter.toLowerCase()
      result = result.filter(t =>
        t.subject.toLowerCase().includes(q) ||
        (t.description && t.description.toLowerCase().includes(q))
      )
    }

    // Sort by subject
    if (state.sort === 'asc') {
      result = [...result].sort((a, b) => a.subject.localeCompare(b.subject))
    } else if (state.sort === 'desc') {
      result = [...result].sort((a, b) => b.subject.localeCompare(a.subject))
    }

    return result
  }, [getColState])

  // Cycle sort direction
  const cycleSort = (colId: string) => {
    const current = getColState(colId).sort
    const next: SortDir = current === 'none' ? 'asc' : current === 'asc' ? 'desc' : 'none'
    setColState(colId, { sort: next })
  }

  // Get column color classes
  const getColColor = (colId: string): { bg: string; border: string } => {
    if (isBlockedColumn(colId)) return BLOCKED_COLOR
    const state = getColState(colId)
    return COLUMN_COLORS.find(c => c.id === state.colorId) || COLUMN_COLORS[0]
  }

  return (
    <div className="flex-1 flex flex-col bg-gray-950 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800 flex-shrink-0">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-medium text-white">Kanban Board</h3>
          {teamName && (
            <span className="text-xs text-gray-500">{teamName}</span>
          )}
          <span className="text-[10px] text-gray-600 bg-gray-800 rounded-full px-2 py-0.5">
            {tasks.length} task{tasks.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Issue browser button */}
          {teamId && (
            <button
              onClick={() => setIssueBrowserOpen(true)}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded transition-colors"
              title="Add issue from GitHub"
            >
              <GitBranch className="w-3 h-3" />
              Add Issue from GitHub
            </button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded transition-colors"
              title="Close kanban"
            >
              <X className="w-3 h-3" />
              Close
            </button>
          )}
        </div>
      </div>

      {/* Board -- horizontal scroll with sticky bottom scrollbar */}
      <div
        ref={boardRef}
        className="flex-1 overflow-x-auto overflow-y-hidden p-3"
        style={{ scrollbarGutter: 'stable' }}
      >
        <div className="flex gap-2.5 h-full min-w-min">
          {cols.map(col => {
            const IconComponent = isBlockedColumn(col.id)
              ? ShieldAlert
              : (ICON_MAP[col.icon || 'Circle'] || Circle)
            const state = getColState(col.id)
            const colColor = getColColor(col.id)
            const rawTasks = tasksByStatus[col.id] || []
            const processed = getProcessedTasks(col.id, rawTasks)
            const isDragOverRef = { current: false }

            return (
              <EnhancedColumn
                key={col.id}
                colId={col.id}
                label={col.label}
                dotColor={col.color}
                icon={IconComponent}
                tasks={processed}
                totalCount={rawTasks.length}
                colColor={colColor}
                state={state}
                isBlocked={isBlockedColumn(col.id)}
                selectedCardId={selectedCardId}
                menuOpen={menuOpenCol === col.id}
                colorPickerOpen={colorPickerCol === col.id}
                onDrop={handleDrop}
                onSelectTask={(task) => { setSelectedCardId(task.id); setSelectedTask(task) }}
                onQuickAdd={handleQuickAdd}
                onFilterChange={(v) => setColState(col.id, { filter: v })}
                onCycleSort={() => cycleSort(col.id)}
                onToggleCollapse={() => setColState(col.id, { collapsed: !state.collapsed })}
                onMenuToggle={() => setMenuOpenCol(menuOpenCol === col.id ? null : col.id)}
                onColorPickerToggle={() => setColorPickerCol(colorPickerCol === col.id ? null : col.id)}
                onColorChange={(colorId) => { setColState(col.id, { colorId }); setColorPickerCol(null) }}
                onClearFilter={() => setColState(col.id, { filter: '' })}
                onSortAsc={() => setColState(col.id, { sort: 'asc' })}
                onSortDesc={() => setColState(col.id, { sort: 'desc' })}
              />
            )
          })}
        </div>
      </div>

      {/* Task detail modal */}
      {freshSelectedTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div
            className="w-full max-w-lg max-h-[80vh] bg-gray-900 border border-gray-700 rounded-xl shadow-2xl overflow-hidden flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <TaskDetailView
              task={freshSelectedTask}
              agents={agents}
              allTasks={tasks}
              kanbanColumns={cols}
              onUpdate={async (taskId, updates) => { await onUpdateTask(taskId, updates) }}
              onDelete={async (taskId) => { await onDeleteTask(taskId); setSelectedTask(null); setSelectedCardId(null) }}
              onClose={() => { setSelectedTask(null); setSelectedCardId(null) }}
            />
          </div>
        </div>
      )}

      {/* Quick-add modal */}
      {quickAddStatus !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div
            className="w-full max-w-md bg-gray-900 border border-gray-700 rounded-xl shadow-2xl overflow-hidden p-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-sm font-medium text-gray-200">
                New task in {cols.find(c => c.id === quickAddStatus)?.label || 'Unknown Status'}
              </h4>
              <button onClick={() => setQuickAddStatus(null)} className="p-1 hover:bg-gray-800 rounded">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>
            <TaskCreateForm
              agents={agents}
              existingTasks={tasks}
              onCreateTask={handleQuickCreate}
            />
          </div>
        </div>
      )}

      {/* Issue browser modal */}
      {issueBrowserOpen && teamId && (
        <IssueBrowserModal
          teamId={teamId}
          columns={cols}
          onCreateTask={onCreateTask}
          onClose={() => setIssueBrowserOpen(false)}
        />
      )}
    </div>
  )
}


// ---------------------------------------------------------------------------
// Enhanced Column sub-component (inline, avoids modifying KanbanColumn.tsx)
// ---------------------------------------------------------------------------
interface EnhancedColumnProps {
  colId: string
  label: string
  dotColor: string
  icon: React.ComponentType<{ className?: string }>
  tasks: TaskWithDeps[]
  totalCount: number
  colColor: { bg: string; border: string }
  state: ColumnState
  isBlocked: boolean
  selectedCardId: string | null
  menuOpen: boolean
  colorPickerOpen: boolean
  onDrop: (taskId: string, status: string) => void
  onSelectTask: (task: TaskWithDeps) => void
  onQuickAdd: (status: string) => void
  onFilterChange: (value: string) => void
  onCycleSort: () => void
  onToggleCollapse: () => void
  onMenuToggle: () => void
  onColorPickerToggle: () => void
  onColorChange: (colorId: string) => void
  onClearFilter: () => void
  onSortAsc: () => void
  onSortDesc: () => void
}

function EnhancedColumn({
  colId, label, dotColor, icon: Icon, tasks, totalCount, colColor, state,
  isBlocked, selectedCardId, menuOpen, colorPickerOpen,
  onDrop, onSelectTask, onQuickAdd, onFilterChange, onCycleSort,
  onToggleCollapse, onMenuToggle, onColorPickerToggle, onColorChange,
  onClearFilter, onSortAsc, onSortDesc,
}: EnhancedColumnProps) {
  const [isDragOver, setIsDragOver] = useState(false)

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setIsDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return
    setIsDragOver(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const taskId = e.dataTransfer.getData('text/plain')
    if (taskId) onDrop(taskId, colId)
  }

  // Collapsed view: header + count only
  if (state.collapsed) {
    return (
      <div
        className={`flex flex-col min-w-[48px] max-w-[48px] rounded-xl transition-all duration-200 ${colColor.bg} border ${colColor.border} cursor-pointer`}
        onClick={onToggleCollapse}
      >
        <div className="flex flex-col items-center gap-2 py-3 px-1">
          <ChevronRight className="w-3 h-3 text-gray-500" />
          <span className="text-[10px] text-gray-400 [writing-mode:vertical-lr] rotate-180">{label}</span>
          <span className="text-[10px] text-gray-600 bg-gray-800/80 rounded-full px-1.5 min-w-[18px] text-center">
            {totalCount}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`
        flex flex-col min-w-[240px] w-[280px] rounded-xl transition-all duration-200
        ${colColor.bg} border
        ${isDragOver
          ? 'border-blue-500 ring-2 ring-blue-500/50 shadow-[0_0_20px_rgba(59,130,246,0.15)]'
          : colColor.border
        }
      `}
    >
      {/* Column header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-800/50 flex-shrink-0">
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotColor}`} />
        {isBlocked
          ? <ShieldAlert className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
          : <Icon className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
        }
        <span className="text-xs font-medium text-gray-300 truncate">{label}</span>
        <span className="text-[10px] text-gray-600 bg-gray-800/80 rounded-full px-1.5 min-w-[18px] text-center flex-shrink-0">
          {tasks.length}{tasks.length !== totalCount ? `/${totalCount}` : ''}
        </span>

        {/* Sort button */}
        <button
          onClick={onCycleSort}
          className="ml-auto p-0.5 rounded hover:bg-gray-800/80 transition-colors flex-shrink-0"
          title={`Sort: ${state.sort}`}
        >
          {state.sort === 'asc' && <ArrowUp className="w-3 h-3 text-emerald-400" />}
          {state.sort === 'desc' && <ArrowDown className="w-3 h-3 text-emerald-400" />}
          {state.sort === 'none' && <ArrowUp className="w-3 h-3 text-gray-700" />}
        </button>

        {/* Color palette button (not for blocked columns) */}
        {!isBlocked && (
          <div className="relative flex-shrink-0">
            <button
              onClick={(e) => { e.stopPropagation(); onColorPickerToggle() }}
              className="p-0.5 rounded hover:bg-gray-800/80 transition-colors"
              title="Column color"
            >
              <Palette className="w-3 h-3 text-gray-600 hover:text-gray-400" />
            </button>
            {colorPickerOpen && (
              <div
                className="absolute top-6 right-0 z-30 bg-gray-800 border border-gray-700 rounded-lg p-2 shadow-xl"
                onClick={e => e.stopPropagation()}
              >
                <div className="grid grid-cols-4 gap-1.5">
                  {COLUMN_COLORS.map(c => (
                    <button
                      key={c.id}
                      onClick={() => onColorChange(c.id)}
                      className={`w-6 h-6 rounded ${c.bg} border ${c.border} hover:ring-1 hover:ring-white/30 transition-all ${
                        state.colorId === c.id ? 'ring-1 ring-white/50' : ''
                      }`}
                      title={c.label}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Column menu (three-dot) */}
        <div className="relative flex-shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); onMenuToggle() }}
            className="p-0.5 rounded hover:bg-gray-800/80 transition-colors"
          >
            <MoreVertical className="w-3 h-3 text-gray-600 hover:text-gray-400" />
          </button>
          {menuOpen && (
            <div
              className="absolute top-6 right-0 z-30 bg-gray-800 border border-gray-700 rounded-lg py-1 shadow-xl min-w-[140px]"
              onClick={e => e.stopPropagation()}
            >
              <button onClick={() => { onSortAsc(); onMenuToggle() }} className="w-full text-left px-3 py-1.5 text-[11px] text-gray-300 hover:bg-gray-700/80 flex items-center gap-2">
                <ArrowUp className="w-3 h-3" /> Sort ascending
              </button>
              <button onClick={() => { onSortDesc(); onMenuToggle() }} className="w-full text-left px-3 py-1.5 text-[11px] text-gray-300 hover:bg-gray-700/80 flex items-center gap-2">
                <ArrowDown className="w-3 h-3" /> Sort descending
              </button>
              <button onClick={() => { onClearFilter(); onMenuToggle() }} className="w-full text-left px-3 py-1.5 text-[11px] text-gray-300 hover:bg-gray-700/80 flex items-center gap-2">
                <X className="w-3 h-3" /> Clear filter
              </button>
              {!isBlocked && (
                <button onClick={() => { onColorPickerToggle(); onMenuToggle() }} className="w-full text-left px-3 py-1.5 text-[11px] text-gray-300 hover:bg-gray-700/80 flex items-center gap-2">
                  <Palette className="w-3 h-3" /> Change color
                </button>
              )}
              <button onClick={() => { onToggleCollapse(); onMenuToggle() }} className="w-full text-left px-3 py-1.5 text-[11px] text-gray-300 hover:bg-gray-700/80 flex items-center gap-2">
                <ChevronRight className="w-3 h-3" /> Collapse column
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Filter input -- sticky at top of scrollable area */}
      <div className="px-2 pt-2 flex-shrink-0">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-600" />
          <input
            type="text"
            value={state.filter}
            onChange={e => onFilterChange(e.target.value)}
            placeholder="Filter..."
            className="w-full pl-7 pr-6 py-1 text-[11px] bg-gray-800/60 border border-gray-700/50 rounded-md text-gray-300 placeholder-gray-600 focus:outline-none focus:border-gray-600 transition-colors"
          />
          {state.filter && (
            <button
              onClick={() => onFilterChange('')}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-gray-700"
            >
              <X className="w-2.5 h-2.5 text-gray-500" />
            </button>
          )}
        </div>
      </div>

      {/* Card list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-[80px]">
        {tasks.map(task => (
          <div
            key={task.id}
            className={`transition-all duration-200 rounded-lg ${
              selectedCardId === task.id
                ? 'shadow-[0_0_15px_rgba(16,185,129,0.3)] ring-1 ring-emerald-500/40'
                : ''
            }`}
          >
            <KanbanCard task={task} onSelect={onSelectTask} />
          </div>
        ))}

        {tasks.length === 0 && (
          <div className="flex items-center justify-center h-16 text-[10px] text-gray-700">
            {state.filter ? 'No matches' : 'No tasks'}
          </div>
        )}
      </div>

      {/* Quick add */}
      <button
        onClick={() => onQuickAdd(colId)}
        className="flex items-center gap-1 mx-2 mb-2 px-2 py-1.5 rounded-lg text-[11px] text-gray-600 hover:text-gray-400 hover:bg-gray-800/60 transition-colors flex-shrink-0"
      >
        <Plus className="w-3 h-3" />
        Add task
      </button>
    </div>
  )
}


// ---------------------------------------------------------------------------
// Issue Browser Modal -- fetch repos and issues from GitHub for a team
// ---------------------------------------------------------------------------
interface IssueBrowserModalProps {
  teamId: string
  columns: KanbanColumnConfig[]
  onCreateTask: (data: { subject: string; description?: string; status?: string }) => Promise<void>
  onClose: () => void
}

interface GitHubRepo {
  nameWithOwner?: string
  name?: string
  owner?: { login?: string }
  url?: string
}

interface GitHubIssue {
  number: number
  title: string
  body?: string
  state?: string
  url?: string
  labels?: Array<{ name: string }>
}

function IssueBrowserModal({ teamId, columns, onCreateTask, onClose }: IssueBrowserModalProps) {
  const [repos, setRepos] = useState<GitHubRepo[]>([])
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null)
  const [issues, setIssues] = useState<GitHubIssue[]>([])
  const [targetColumn, setTargetColumn] = useState(columns[0]?.id || 'backlog')
  const [loading, setLoading] = useState(false)
  const [loadingIssues, setLoadingIssues] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch repos for the team
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch(`/api/teams/${teamId}/repos`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error('Failed to load repos')))
      .then(data => {
        if (!cancelled) {
          setRepos(data.repos || [])
          setLoading(false)
        }
      })
      .catch(err => {
        if (!cancelled) {
          setError(err.message || 'Failed to load repos')
          setLoading(false)
        }
      })
    return () => { cancelled = true }
  }, [teamId])

  // Fetch issues when repo selected
  useEffect(() => {
    if (!selectedRepo) { setIssues([]); return }
    let cancelled = false
    setLoadingIssues(true)
    // Parse owner/repo from nameWithOwner format
    const [owner, repo] = selectedRepo.includes('/') ? selectedRepo.split('/') : ['', selectedRepo]
    fetch(`/api/github/repos?owner=${encodeURIComponent(owner)}`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error('Failed to load issues')))
      .then(data => {
        if (!cancelled) {
          // The repos endpoint returns repos; we look for issues in the selected one
          // For now, show the repo list -- issues would need a dedicated endpoint
          // Use a generic approach: try to fetch issues via gh CLI proxy
          return fetch(`/api/github/issues?repo=${encodeURIComponent(selectedRepo)}&state=open`)
        }
      })
      .then(r => {
        if (r && r.ok) return r.json()
        // If issues endpoint doesn't exist, return empty
        return { issues: [] }
      })
      .then(data => {
        if (!cancelled) {
          setIssues(data?.issues || [])
          setLoadingIssues(false)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setIssues([])
          setLoadingIssues(false)
        }
      })
    return () => { cancelled = true }
  }, [selectedRepo])

  const handleAddIssue = async (issue: GitHubIssue) => {
    await onCreateTask({
      subject: `#${issue.number} ${issue.title}`,
      description: issue.body || undefined,
      status: targetColumn,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div
        className="w-full max-w-2xl max-h-[80vh] bg-gray-900 border border-gray-700 rounded-xl shadow-2xl overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-gray-400" />
            <h4 className="text-sm font-medium text-white">Add Issue from GitHub</h4>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-800 rounded transition-colors" title="Close issue browser">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Target column selector */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-gray-500">Add to column:</span>
            <select
              value={targetColumn}
              onChange={e => setTargetColumn(e.target.value)}
              className="text-[11px] bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-300 focus:outline-none"
            >
              {columns.map(c => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </div>

          {/* Repo list */}
          {loading && <p className="text-xs text-gray-500">Loading repos...</p>}
          {error && <p className="text-xs text-red-400">{error}</p>}

          {!loading && repos.length === 0 && !error && (
            <p className="text-xs text-gray-600">No repos found for this team. Link a GitHub project first.</p>
          )}

          {repos.length > 0 && (
            <div className="space-y-1">
              <span className="text-[11px] text-gray-500 font-medium">Repositories</span>
              <div className="grid gap-1">
                {repos.map((repo, i) => {
                  const repoName = repo.nameWithOwner || repo.name || `repo-${i}`
                  const isSelected = selectedRepo === repoName
                  return (
                    <button
                      key={repoName}
                      onClick={() => setSelectedRepo(isSelected ? null : repoName)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-all ${
                        isSelected
                          ? 'bg-gray-700/80 text-white border border-gray-600'
                          : 'bg-gray-800/50 text-gray-400 hover:bg-gray-800 hover:text-gray-300 border border-transparent'
                      }`}
                    >
                      <GitBranch className="w-3 h-3 flex-shrink-0" />
                      <span className="truncate">{repoName}</span>
                      {repo.url && (
                        <a
                          href={repo.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}
                          className="ml-auto flex-shrink-0"
                        >
                          <ExternalLink className="w-3 h-3 text-gray-600 hover:text-gray-400" />
                        </a>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Issues for selected repo */}
          {selectedRepo && (
            <div className="space-y-1">
              <span className="text-[11px] text-gray-500 font-medium">
                Open Issues {loadingIssues && '(loading...)'}
              </span>
              {issues.length === 0 && !loadingIssues && (
                <p className="text-[11px] text-gray-600 px-3 py-2">No open issues found, or the issues endpoint is not available.</p>
              )}
              <div className="grid gap-1 max-h-[300px] overflow-y-auto">
                {issues.map(issue => (
                  <div
                    key={issue.number}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-800/50 border border-transparent hover:border-gray-700 transition-all group"
                  >
                    <span className="text-[10px] text-gray-600 flex-shrink-0">#{issue.number}</span>
                    <span className="text-xs text-gray-300 truncate flex-1">{issue.title}</span>
                    {issue.labels && issue.labels.length > 0 && (
                      <div className="flex gap-1 flex-shrink-0">
                        {issue.labels.slice(0, 2).map(l => (
                          <span key={l.name} className="text-[9px] px-1 py-0.5 rounded bg-gray-700/80 text-gray-500">{l.name}</span>
                        ))}
                      </div>
                    )}
                    <button
                      onClick={() => handleAddIssue(issue)}
                      className="flex-shrink-0 opacity-0 group-hover:opacity-100 px-2 py-0.5 text-[10px] bg-emerald-800/60 text-emerald-300 rounded hover:bg-emerald-700/60 transition-all"
                    >
                      <Plus className="w-3 h-3 inline mr-0.5" />
                      Add
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
