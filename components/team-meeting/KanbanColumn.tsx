'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import { Plus, Search, X, MoreVertical, ChevronRight, ChevronDown, ArrowUpAZ, ArrowDownZA, FilterX, Minimize2 } from 'lucide-react'
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
  bgColor?: string        // Tailwind bg class like "bg-blue-950/20"
  isBlocked?: boolean      // Forces blocked visual (red tint + border)
  selectedTaskId?: string  // Highlight the selected card
}

type SortDir = 'none' | 'asc' | 'desc'

export default function KanbanColumn({ config, tasks, onDrop, onSelectTask, onQuickAdd, bgColor, isBlocked, selectedTaskId }: KanbanColumnProps) {
  const [isDragOver, setIsDragOver] = useState(false)
  const [filter, setFilter] = useState('')
  const [sortDir, setSortDir] = useState<SortDir>('none')
  const [collapsed, setCollapsed] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  // Filter + sort cards
  const visibleTasks = useMemo(() => {
    let result = tasks
    if (filter) {
      const q = filter.toLowerCase()
      result = result.filter(t => t.subject.toLowerCase().includes(q))
    }
    if (sortDir !== 'none') {
      result = [...result].sort((a, b) => {
        const cmp = a.subject.localeCompare(b.subject)
        return sortDir === 'asc' ? cmp : -cmp
      })
    }
    return result
  }, [tasks, filter, sortDir])

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
    if (taskId) onDrop(taskId, config.status)
  }

  const cycleSortDir = () => setSortDir(d => d === 'none' ? 'asc' : d === 'asc' ? 'desc' : 'none')

  // Determine background: blocked overrides custom color
  const baseBg = isBlocked ? 'bg-red-950/30' : (bgColor || 'bg-gray-900/50')
  const baseBorder = isBlocked ? 'border-red-800/50' : 'border-gray-800/50'
  const dragGlow = isDragOver ? 'ring-2 ring-blue-500/50 shadow-[0_0_20px_rgba(59,130,246,0.2)] border-blue-500' : ''

  const Icon = config.icon

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`flex flex-col min-w-[220px] flex-1 rounded-xl transition-all duration-200 border ${baseBg} ${baseBorder} ${dragGlow}`}
    >
      {/* Column header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-800/50">
        {/* Collapse toggle */}
        <button onClick={() => setCollapsed(c => !c)} className="text-gray-500 hover:text-gray-300 transition-colors">
          {collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
        <span className={`w-2 h-2 rounded-full ${config.dotColor}`} />
        <Icon className="w-3.5 h-3.5 text-gray-400" />
        <span className="text-xs font-medium text-gray-300">{config.label}</span>
        <span className="text-[10px] text-gray-600 bg-gray-800/80 rounded-full px-1.5 min-w-[18px] text-center">
          {tasks.length}
        </span>
        <div className="flex-1" />

        {/* Sort cycle button */}
        <button onClick={cycleSortDir} className={`p-0.5 rounded transition-colors ${sortDir !== 'none' ? 'text-blue-400' : 'text-gray-600 hover:text-gray-400'}`} title={`Sort: ${sortDir}`}>
          {sortDir === 'desc' ? <ArrowDownZA className="w-3 h-3" /> : <ArrowUpAZ className="w-3 h-3" />}
        </button>

        {/* Column menu */}
        <div className="relative" ref={menuRef}>
          <button onClick={() => setMenuOpen(o => !o)} className="p-0.5 rounded text-gray-600 hover:text-gray-400 transition-colors">
            <MoreVertical className="w-3 h-3" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 z-30 bg-gray-800 border border-gray-700 rounded-lg shadow-xl py-1 min-w-[130px]">
              <button onClick={() => { setSortDir('asc'); setMenuOpen(false) }} className="flex items-center gap-2 w-full px-3 py-1.5 text-[11px] text-gray-300 hover:bg-gray-700/60">
                <ArrowUpAZ className="w-3 h-3" /> Sort A-Z
              </button>
              <button onClick={() => { setSortDir('desc'); setMenuOpen(false) }} className="flex items-center gap-2 w-full px-3 py-1.5 text-[11px] text-gray-300 hover:bg-gray-700/60">
                <ArrowDownZA className="w-3 h-3" /> Sort Z-A
              </button>
              <button onClick={() => { setFilter(''); setMenuOpen(false) }} className="flex items-center gap-2 w-full px-3 py-1.5 text-[11px] text-gray-300 hover:bg-gray-700/60">
                <FilterX className="w-3 h-3" /> Clear filter
              </button>
              <button onClick={() => { setCollapsed(true); setMenuOpen(false) }} className="flex items-center gap-2 w-full px-3 py-1.5 text-[11px] text-gray-300 hover:bg-gray-700/60">
                <Minimize2 className="w-3 h-3" /> Collapse
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Collapsed state: header-only with count */}
      {collapsed ? null : (
        <>
          {/* Filter input (sticky below header) */}
          <div className="sticky top-0 px-2 pt-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-500" />
              <input
                type="text"
                value={filter}
                onChange={e => setFilter(e.target.value)}
                placeholder="Filter..."
                className="w-full pl-6 pr-6 py-1 text-sm bg-gray-800 border border-gray-700 rounded text-gray-300 placeholder-gray-500 focus:outline-none focus:border-gray-600"
              />
              {filter && (
                <button onClick={() => setFilter('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* Card list */}
          <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-[100px]">
            {visibleTasks.map(task => (
              <KanbanCard key={task.id} task={task} onSelect={onSelectTask} isSelected={task.id === selectedTaskId} />
            ))}
            {visibleTasks.length === 0 && (
              <div className="flex items-center justify-center h-16 text-[10px] text-gray-700">
                {filter ? 'No matches' : 'No tasks'}
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
        </>
      )}
    </div>
  )
}
