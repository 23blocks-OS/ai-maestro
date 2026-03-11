'use client'

import { useState, useEffect, useCallback, type ReactNode } from 'react'
import { RefreshCw, X } from 'lucide-react'

interface TomlPreviewPanelProps {
  tomlPath: string
  onClose?: () => void
}

/** Basic TOML syntax highlighting — regex-based, line-by-line */
function highlightToml(content: string): ReactNode[] {
  return content.split('\n').map((line, i, arr) => {
    const nl = i < arr.length - 1 ? '\n' : ''
    const trimmed = line.trim()

    // Comments
    if (trimmed.startsWith('#')) {
      return <span key={i} className="text-gray-500 italic">{line}{nl}</span>
    }

    // Section headers [section] or [[array]]
    if (/^\[{1,2}[^\]]+\]{1,2}$/.test(trimmed)) {
      return <span key={i} className="text-amber-400 font-bold">{line}{nl}</span>
    }

    // Key = value pairs
    const eqIdx = line.indexOf('=')
    if (eqIdx !== -1) {
      const key = line.substring(0, eqIdx)
      const eq = '='
      const val = line.substring(eqIdx + 1)
      const valTrim = val.trim()

      let valClass = 'text-gray-200'
      if (valTrim === 'true' || valTrim === 'false') {
        valClass = 'text-orange-400'
      } else if (/^-?\d+(\.\d+)?$/.test(valTrim)) {
        valClass = 'text-purple-400'
      } else if (/^".*"$/.test(valTrim) || /^'.*'$/.test(valTrim)) {
        valClass = 'text-green-400'
      } else if (/^\[/.test(valTrim)) {
        valClass = 'text-cyan-300'
      }

      return (
        <span key={i}>
          <span className="text-blue-300">{key}</span>
          <span className="text-gray-400">{eq}</span>
          <span className={valClass}>{val}</span>
          {nl}
        </span>
      )
    }

    // Empty or other lines
    return <span key={i} className="text-gray-200">{line}{nl}</span>
  })
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
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-700 shrink-0">
        <h2 className="text-xs font-semibold text-gray-300 uppercase tracking-wider">.agent.toml</h2>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => { setLoading(true); fetchToml() }}
            className="p-1 rounded hover:bg-gray-700 text-gray-400 hover:text-gray-200 transition-colors"
            title="Refresh"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-gray-700 text-gray-400 hover:text-gray-200 transition-colors"
              title="Close"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-3">
        {!exists ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <div className="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center">
              <span className="text-lg text-gray-600">⚙</span>
            </div>
            <p className="text-gray-500 text-xs text-center max-w-[220px] leading-relaxed">
              No profile yet. Chat with Haephestos to start building your agent.
            </p>
          </div>
        ) : (
          <pre className="text-xs font-mono whitespace-pre-wrap break-words leading-relaxed">
            {highlightToml(content)}
          </pre>
        )}
      </div>
    </div>
  )
}
