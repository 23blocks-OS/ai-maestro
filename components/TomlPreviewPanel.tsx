'use client'

import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, X } from 'lucide-react'

interface TomlPreviewPanelProps {
  tomlPath: string
  onClose?: () => void
}

export default function TomlPreviewPanel({ tomlPath, onClose }: TomlPreviewPanelProps) {
  const [content, setContent] = useState<string>('')
  const [exists, setExists] = useState(false)
  const [loading, setLoading] = useState(true)

  const fetchToml = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/agents/creation-helper/toml-preview?path=${encodeURIComponent(tomlPath)}`
      )
      if (!res.ok) return
      const data: { content: string; exists: boolean } = await res.json()
      setContent(data.content)
      setExists(data.exists)
    } catch {
      // Silently ignore fetch errors — will retry on next poll
    } finally {
      setLoading(false)
    }
  }, [tomlPath])

  useEffect(() => {
    fetchToml()
    const interval = setInterval(fetchToml, 5000)
    return () => clearInterval(interval)
  }, [fetchToml])

  return (
    <div className="flex flex-col h-full bg-gray-900">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 shrink-0">
        <h2 className="text-sm font-semibold text-gray-200">Agent Profile Preview</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setLoading(true); fetchToml() }}
            className="p-1.5 rounded hover:bg-gray-700 text-gray-400 hover:text-gray-200 transition-colors"
            title="Refresh"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded hover:bg-gray-700 text-gray-400 hover:text-gray-200 transition-colors"
              title="Close"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {!exists ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-500 text-sm text-center max-w-[280px]">
              No profile generated yet. Chat with Haephestos to start building your agent profile.
            </p>
          </div>
        ) : (
          <pre className="text-xs text-gray-200 font-mono whitespace-pre-wrap break-words leading-relaxed">
            {content}
          </pre>
        )}
      </div>
    </div>
  )
}
