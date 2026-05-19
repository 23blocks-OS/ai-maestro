'use client'

import React, { useEffect, useState, useCallback, useRef } from 'react'
import {
  PanelTop,
  RefreshCw,
  FileCode2,
  AlertCircle,
  Clock,
} from 'lucide-react'

interface CanvasFile {
  name: string
  path: string
  size: number
  modifiedAt: string
}

interface CanvasPanelProps {
  agentId: string
  hostUrl?: string
  isActive?: boolean
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return d.toLocaleDateString()
}

export default function CanvasPanel({ agentId, hostUrl, isActive = false }: CanvasPanelProps) {
  const [files, setFiles] = useState<CanvasFile[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedFile, setSelectedFile] = useState<CanvasFile | null>(null)
  const [iframeUrl, setIframeUrl] = useState<string | null>(null)
  const [loadingFile, setLoadingFile] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const prevBlobUrl = useRef<string | null>(null)
  const baseUrl = hostUrl || ''

  const fetchFiles = useCallback(async () => {
    if (!agentId) return

    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`${baseUrl}/api/agents/${agentId}/canvas`)
      const data = await response.json()
      if (data.files) {
        setFiles(data.files)
      } else if (data.error) {
        setError(data.message || 'Failed to load canvas files')
      }
    } catch (err) {
      setError('Failed to connect to server')
    } finally {
      setLoading(false)
    }
  }, [agentId, baseUrl])

  useEffect(() => {
    if (!agentId || !isActive) return
    fetchFiles()
  }, [agentId, isActive, fetchFiles])

  // Cleanup blob URLs
  useEffect(() => {
    return () => {
      if (prevBlobUrl.current) {
        URL.revokeObjectURL(prevBlobUrl.current)
      }
    }
  }, [])

  // Listen for canvas interaction postMessages from the iframe
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (!event.data || event.data.type !== 'canvas:interaction') return
      if (!selectedFile || !agentId) return

      const { action, element, data } = event.data
      fetch(`${baseUrl}/api/agents/${agentId}/canvas/interactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ canvasFile: selectedFile.path, action, element, data }),
      }).catch(() => {
        // Fire-and-forget
      })
    }

    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [agentId, selectedFile, baseUrl])

  const openFile = useCallback(async (file: CanvasFile) => {
    setSelectedFile(file)
    setLoadingFile(true)
    setError(null)

    try {
      const response = await fetch(
        `${baseUrl}/api/agents/${agentId}/canvas?file=${encodeURIComponent(file.path)}`
      )

      if (!response.ok) {
        const data = await response.json().catch(() => null)
        setError(data?.message || `Failed to load file (${response.status})`)
        setLoadingFile(false)
        return
      }

      const html = await response.text()

      // Revoke previous blob URL
      if (prevBlobUrl.current) {
        URL.revokeObjectURL(prevBlobUrl.current)
      }

      // Inject maestro bridge script for canvas interactions
      const bridgeScript = `<script>
window.maestro = {
  send: function(action, element, data) {
    window.parent.postMessage({
      type: 'canvas:interaction',
      action: action,
      element: element || null,
      data: data || null
    }, '*');
  }
};
</script>`
      const injectedHtml = html.includes('<head>')
        ? html.replace('<head>', '<head>' + bridgeScript)
        : bridgeScript + html

      const blob = new Blob([injectedHtml], { type: 'text/html' })
      const url = URL.createObjectURL(blob)
      prevBlobUrl.current = url
      setIframeUrl(url)
    } catch (err) {
      setError('Failed to load file')
    } finally {
      setLoadingFile(false)
    }
  }, [agentId, baseUrl])

  if (!agentId) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>No agent selected</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 h-full w-full flex flex-col bg-gray-900 text-gray-100 overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-gray-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <PanelTop className="w-5 h-5 text-cyan-400" />
          <h2 className="text-lg font-semibold">Canvas</h2>
          {files.length > 0 && (
            <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded">
              {files.length} file{files.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <button
          onClick={fetchFiles}
          className="p-1.5 hover:bg-gray-800 rounded transition-colors"
          title="Refresh"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex-shrink-0 mx-4 mt-3 p-3 bg-red-900/30 border border-red-800 rounded-lg flex items-center gap-2 text-red-400 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 overflow-hidden flex min-h-0">
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="flex items-center gap-2 text-gray-400">
              <RefreshCw className="w-5 h-5 animate-spin" />
              <span>Loading canvas files...</span>
            </div>
          </div>
        ) : files.length === 0 ? (
          /* Empty state */
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center max-w-md">
              <PanelTop className="w-16 h-16 mx-auto mb-4 text-gray-600" />
              <h3 className="text-lg font-medium mb-2">No canvas files yet</h3>
              <p className="text-gray-400 text-sm">
                Agents can write self-contained HTML files to their canvas directory for viewing here.
              </p>
              <code className="block mt-3 text-xs text-gray-500 bg-gray-800 px-3 py-2 rounded">
                ~/.aimaestro/agents/$AIM_AGENT_ID/canvas/
              </code>
              <p className="text-gray-500 text-xs mt-3">
                HTML must be self-contained (inline styles, base64 images). Relative asset paths are not supported.
              </p>
            </div>
          </div>
        ) : (
          /* Split view: file list + iframe */
          <>
            {/* File list sidebar */}
            <div className="w-60 flex-shrink-0 border-r border-gray-800 overflow-y-auto">
              {files.map((file) => (
                <button
                  key={file.path}
                  onClick={() => openFile(file)}
                  className={`w-full flex items-start gap-2 px-3 py-2.5 text-left hover:bg-gray-800 transition-colors ${
                    selectedFile?.path === file.path ? 'bg-gray-800 border-l-2 border-cyan-500' : ''
                  }`}
                >
                  <FileCode2 className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm truncate">{file.name}</div>
                    {file.path !== file.name && (
                      <div className="text-xs text-gray-500 truncate">{file.path}</div>
                    )}
                    <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
                      <span>{formatFileSize(file.size)}</span>
                      <span className="flex items-center gap-0.5">
                        <Clock className="w-3 h-3" />
                        {formatDate(file.modifiedAt)}
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>

            {/* Iframe area */}
            <div className="flex-1 flex items-center justify-center min-w-0">
              {loadingFile ? (
                <div className="flex items-center gap-2 text-gray-400">
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  <span>Loading...</span>
                </div>
              ) : iframeUrl ? (
                <iframe
                  src={iframeUrl}
                  sandbox="allow-scripts"
                  className="w-full h-full border-0 bg-white rounded"
                />
              ) : (
                <div className="text-center text-gray-500">
                  <FileCode2 className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>Select a file to preview</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
