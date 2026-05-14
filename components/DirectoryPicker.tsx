'use client'

import { useState, useEffect, useCallback } from 'react'
import { Folder, FolderOpen, Home, ChevronRight, Monitor, FileText, Code2, GitBranch, ArrowUp, Loader2 } from 'lucide-react'

interface DirectoryEntry {
  name: string
  path: string
}

interface BrowseResponse {
  path: string
  homeDir: string
  parent: string | null
  entries: DirectoryEntry[]
  shortcuts: Array<{ name: string; path: string; icon: string }>
}

interface DirectoryPickerProps {
  value: string
  onChange: (path: string) => void
  hostId?: string  // For remote host browsing
}

const SHORTCUT_ICONS: Record<string, typeof Home> = {
  'monitor': Monitor,
  'file-text': FileText,
  'code': Code2,
  'git-branch': GitBranch,
}

export default function DirectoryPicker({ value, onChange, hostId }: DirectoryPickerProps) {
  const [currentPath, setCurrentPath] = useState('')
  const [entries, setEntries] = useState<DirectoryEntry[]>([])
  const [shortcuts, setShortcuts] = useState<BrowseResponse['shortcuts']>([])
  const [homeDir, setHomeDir] = useState('')
  const [parentPath, setParentPath] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set())
  const [childEntries, setChildEntries] = useState<Record<string, DirectoryEntry[]>>({})

  const fetchDirectory = useCallback(async (dirPath?: string) => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      if (dirPath) params.set('path', dirPath)
      if (hostId) params.set('host', hostId)
      const resp = await fetch(`/api/browse?${params}`)
      if (!resp.ok) {
        const data = await resp.json()
        throw new Error(data.error || 'Failed to browse directory')
      }
      const data: BrowseResponse = await resp.json()
      setCurrentPath(data.path)
      setEntries(data.entries)
      setShortcuts(data.shortcuts)
      setHomeDir(data.homeDir)
      setParentPath(data.parent)
      setExpandedDirs(new Set())
      setChildEntries({})
      // Auto-select current path
      onChange(data.path)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to browse')
    } finally {
      setLoading(false)
    }
  }, [hostId, onChange])

  // Load initial directory
  useEffect(() => {
    fetchDirectory(value || undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleNavigate = useCallback((path: string) => {
    fetchDirectory(path)
  }, [fetchDirectory])

  const handleToggleExpand = useCallback(async (dirPath: string) => {
    if (expandedDirs.has(dirPath)) {
      setExpandedDirs(prev => {
        const next = new Set(prev)
        next.delete(dirPath)
        return next
      })
      return
    }

    // Fetch children
    try {
      const params = new URLSearchParams({ path: dirPath })
      if (hostId) params.set('host', hostId)
      const resp = await fetch(`/api/browse?${params}`)
      if (resp.ok) {
        const data: BrowseResponse = await resp.json()
        setChildEntries(prev => ({ ...prev, [dirPath]: data.entries }))
        setExpandedDirs(prev => new Set(prev).add(dirPath))
      }
    } catch {
      // Silently fail for expansion
    }
  }, [expandedDirs, hostId])

  const handleSelectDir = useCallback((dirPath: string) => {
    onChange(dirPath)
  }, [onChange])

  // Breadcrumb segments
  const breadcrumbs = currentPath.split('/').filter(Boolean)

  return (
    <div className="bg-gray-800/50 rounded-lg border border-gray-700 overflow-hidden">
      {/* Breadcrumb navigation */}
      <div className="flex items-center gap-1 px-3 py-2 bg-gray-800/80 border-b border-gray-700/50 overflow-x-auto">
        <button
          onClick={() => handleNavigate(homeDir)}
          className="flex items-center gap-1 px-1.5 py-0.5 rounded text-xs text-gray-400 hover:text-gray-200 hover:bg-gray-700/50 transition-colors flex-shrink-0"
          title="Home directory"
        >
          <Home className="w-3 h-3" />
          <span>~</span>
        </button>
        {parentPath && (
          <button
            onClick={() => handleNavigate(parentPath)}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-xs text-gray-400 hover:text-gray-200 hover:bg-gray-700/50 transition-colors flex-shrink-0"
            title="Go up"
          >
            <ArrowUp className="w-3 h-3" />
          </button>
        )}
        <div className="flex items-center gap-0.5 overflow-x-auto flex-1 min-w-0">
          {breadcrumbs.map((segment, i) => {
            const segmentPath = '/' + breadcrumbs.slice(0, i + 1).join('/')
            const isLast = i === breadcrumbs.length - 1
            return (
              <div key={segmentPath} className="flex items-center gap-0.5 flex-shrink-0">
                <ChevronRight className="w-3 h-3 text-gray-600" />
                <button
                  onClick={() => !isLast && handleNavigate(segmentPath)}
                  className={`px-1 py-0.5 rounded text-xs transition-colors ${
                    isLast
                      ? 'text-blue-400 font-medium'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700/50'
                  }`}
                >
                  {segment}
                </button>
              </div>
            )
          })}
        </div>
      </div>

      {/* Shortcuts row (only at home dir level) */}
      {shortcuts.length > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-700/30 overflow-x-auto">
          {shortcuts.map(sc => {
            const Icon = SHORTCUT_ICONS[sc.icon] || Folder
            const isSelected = value === sc.path
            return (
              <button
                key={sc.path}
                onClick={() => {
                  handleSelectDir(sc.path)
                  handleNavigate(sc.path)
                }}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all flex-shrink-0 ${
                  isSelected
                    ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                    : 'bg-gray-700/30 text-gray-400 hover:bg-gray-700/50 hover:text-gray-300 border border-transparent'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {sc.name}
              </button>
            )
          })}
        </div>
      )}

      {/* Directory listing */}
      <div className="max-h-48 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
          </div>
        ) : error ? (
          <div className="px-3 py-4 text-center text-sm text-red-400">{error}</div>
        ) : entries.length === 0 ? (
          <div className="px-3 py-4 text-center text-sm text-gray-500">No subdirectories</div>
        ) : (
          <div className="py-1">
            {entries.map(entry => {
              const isSelected = value === entry.path
              const isExpanded = expandedDirs.has(entry.path)
              const children = childEntries[entry.path] || []

              return (
                <div key={entry.path}>
                  <div
                    className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-blue-500/15 text-blue-400'
                        : 'text-gray-300 hover:bg-gray-700/40'
                    }`}
                    onClick={() => handleSelectDir(entry.path)}
                  >
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleToggleExpand(entry.path)
                      }}
                      className="p-0.5 rounded hover:bg-gray-600/50 transition-colors flex-shrink-0"
                    >
                      <ChevronRight className={`w-3 h-3 text-gray-500 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                    </button>
                    {isExpanded ? (
                      <FolderOpen className="w-4 h-4 text-blue-400 flex-shrink-0" />
                    ) : (
                      <Folder className="w-4 h-4 text-gray-500 flex-shrink-0" />
                    )}
                    <span className="text-sm truncate">{entry.name}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleSelectDir(entry.path)
                        handleNavigate(entry.path)
                      }}
                      className="ml-auto p-1 rounded text-xs text-gray-500 hover:text-gray-300 hover:bg-gray-600/50 transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0"
                      title="Open directory"
                    >
                      <ChevronRight className="w-3 h-3" />
                    </button>
                  </div>

                  {/* Expanded children */}
                  {isExpanded && children.length > 0 && (
                    <div className="ml-6">
                      {children.map(child => {
                        const isChildSelected = value === child.path
                        return (
                          <div
                            key={child.path}
                            className={`flex items-center gap-2 px-3 py-1 cursor-pointer transition-colors ${
                              isChildSelected
                                ? 'bg-blue-500/15 text-blue-400'
                                : 'text-gray-400 hover:bg-gray-700/40'
                            }`}
                            onClick={() => handleSelectDir(child.path)}
                            onDoubleClick={() => handleNavigate(child.path)}
                          >
                            <Folder className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                            <span className="text-xs truncate">{child.name}</span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Selected path display */}
      <div className="px-3 py-2 bg-gray-800/80 border-t border-gray-700/50">
        <div className="flex items-center gap-2">
          <Folder className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
          <span className="text-xs text-gray-400 truncate font-mono">{value || currentPath || '~'}</span>
        </div>
      </div>
    </div>
  )
}
