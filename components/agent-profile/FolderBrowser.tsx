'use client'

import { useState, useCallback, useEffect } from 'react'
import { Loader2, AlertCircle, FolderOpen, ArrowLeft, Folder, FileCode, FileText } from 'lucide-react'

interface DirEntry {
  name: string
  type: 'file' | 'dir'
  size: number
}

export default function FolderBrowser({ initialPath, onBack }: { initialPath: string; onBack: () => void }) {
  const [currentPath, setCurrentPath] = useState(initialPath)
  const [entries, setEntries] = useState<DirEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [fileContent, setFileContent] = useState<{ name: string; content: string } | null>(null)

  const loadDir = useCallback(async (dirPath: string) => {
    setLoading(true)
    setError(null)
    setFileContent(null)
    try {
      const res = await fetch(`/api/agents/browse-dir?path=${encodeURIComponent(dirPath)}`)
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Failed to load directory' }))
        setError(data.error || `HTTP ${res.status}`)
        setEntries([])
      } else {
        const data = await res.json()
        setEntries(data.entries || [])
      }
    } catch {
      setError('Failed to load directory')
      setEntries([])
    }
    setLoading(false)
  }, [])

  // Load initial directory
  useEffect(() => { loadDir(initialPath) }, [initialPath, loadDir])

  const navigateTo = (name: string) => {
    const newPath = `${currentPath}/${name}`
    setCurrentPath(newPath)
    loadDir(newPath)
  }

  const navigateUp = () => {
    const parent = currentPath.replace(/\/[^/]+$/, '')
    if (parent && parent !== currentPath) {
      setCurrentPath(parent)
      loadDir(parent)
    }
  }

  const viewFile = async (fileName: string) => {
    setLoading(true)
    const filePath = `${currentPath}/${fileName}`
    try {
      const res = await fetch(`/api/agents/browse-dir?path=${encodeURIComponent(filePath)}&mode=file`)
      const data = await res.json()
      if (data.content !== undefined) {
        setFileContent({ name: fileName, content: data.content })
      } else {
        setFileContent({ name: fileName, content: data.error || '(Unable to read file)' })
      }
    } catch {
      setFileContent({ name: fileName, content: '(Failed to load file)' })
    }
    setLoading(false)
  }

  // Shorten path for display
  const displayPath = currentPath.replace(/^\/Users\/[^/]+/, '~')
  // Show ".." entry only when we've navigated deeper than the root
  const canGoUp = currentPath !== initialPath

  // File content view
  if (fileContent) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-800 bg-gray-900/80">
          <div
            onClick={() => setFileContent(null)}
            className="p-1 rounded-md cursor-pointer hover:bg-gray-700/60 transition-colors"
            title="Back to folder"
          >
            <ArrowLeft className="w-4 h-4 text-gray-400" />
          </div>
          <FileCode className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
          <span className="text-xs text-gray-300 truncate font-medium">{fileContent.name}</span>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3" style={{ overscrollBehavior: 'contain' }}>
          <pre className="text-[11px] text-gray-400 whitespace-pre-wrap break-all font-mono leading-relaxed">{fileContent.content}</pre>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Browser header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-800 bg-gray-900/80">
        <div
          onClick={onBack}
          className="p-1 rounded-md cursor-pointer hover:bg-gray-700/60 transition-colors"
          title="Back to profile tabs"
        >
          <ArrowLeft className="w-4 h-4 text-gray-400" />
        </div>
        <Folder className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
        <span className="text-[11px] text-gray-400 truncate flex-1" title={currentPath}>
          {displayPath}
        </span>
        {loading && <Loader2 className="w-3 h-3 text-gray-500 animate-spin flex-shrink-0" />}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-2 bg-red-500/10 border-b border-red-500/20">
          <AlertCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
          <span className="text-[11px] text-red-400 truncate">{error}</span>
        </div>
      )}

      {/* Directory listing */}
      <div className="flex-1 overflow-y-auto" style={{ overscrollBehavior: 'contain' }}>
        {/* Parent directory entry */}
        {canGoUp && (
          <div
            onClick={navigateUp}
            className="flex items-center gap-2.5 px-4 py-2 cursor-pointer hover:bg-gray-800/50 transition-colors border-b border-gray-800/50"
          >
            <Folder className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
            <span className="text-xs text-gray-400">..</span>
          </div>
        )}

        {!loading && entries.length === 0 && !error && (
          <div className="flex items-center justify-center h-20">
            <span className="text-[11px] text-gray-600 italic">Empty directory</span>
          </div>
        )}

        {entries.map((entry) => (
          <div
            key={entry.name}
            onClick={() => entry.type === 'dir' ? navigateTo(entry.name) : viewFile(entry.name)}
            className="flex items-center gap-2.5 px-4 py-2 cursor-pointer hover:bg-gray-800/50 transition-colors border-b border-gray-800/50"
          >
            {entry.type === 'dir' ? (
              <Folder className="w-3.5 h-3.5 text-amber-400/70 flex-shrink-0" />
            ) : (
              <FileText className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
            )}
            <span className={`text-xs truncate flex-1 ${entry.type === 'dir' ? 'text-amber-300/80' : 'text-gray-300'}`}>
              {entry.name}
            </span>
            {entry.type === 'file' && entry.size > 0 && (
              <span className="text-[10px] text-gray-600 flex-shrink-0">
                {entry.size < 1024 ? `${entry.size}B` : `${(entry.size / 1024).toFixed(1)}K`}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
