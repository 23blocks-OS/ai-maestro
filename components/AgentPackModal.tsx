'use client'

import { useState } from 'react'
import { X, Package, Download, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'

interface AgentPackModalProps {
  isOpen: boolean
  onClose: () => void
  agentId: string
  agentAlias: string
}

export default function AgentPackModal({ isOpen, onClose, agentId, agentAlias }: AgentPackModalProps) {
  const [includeWorkspace, setIncludeWorkspace] = useState(false)
  const [includeMessages, setIncludeMessages] = useState(true)
  const [packing, setPacking] = useState(false)
  const [packResult, setPackResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  const handlePack = async () => {
    setPacking(true)
    setError(null)

    try {
      const response = await fetch(`/api/agents/${agentId}/pack`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          includeWorkspace,
          includeMessages,
        })
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to pack agent')
      }

      const result = await response.json()
      setPackResult(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to pack agent')
    } finally {
      setPacking(false)
    }
  }

  const handleDownload = async () => {
    if (!packResult) return

    try {
      const response = await fetch(`/api/agents/${agentId}/pack?file=${encodeURIComponent(packResult.packFile)}`)

      if (!response.ok) {
        throw new Error('Failed to download pack')
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = packResult.packFile.split('/').pop() || `agent-pack-${agentAlias}.tar.gz`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to download pack')
    }
  }

  const resetModal = () => {
    setPackResult(null)
    setError(null)
    setIncludeWorkspace(false)
    setIncludeMessages(true)
    onClose()
  }

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
        onClick={resetModal}
      />

      {/* Modal */}
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg bg-gray-900 rounded-xl border border-gray-800 shadow-2xl z-50 p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600/20 rounded-lg">
              <Package className="w-5 h-5 text-blue-400" />
            </div>
            <h2 className="text-lg font-bold text-gray-100">Pack Agent</h2>
          </div>
          <button
            onClick={resetModal}
            className="p-2 rounded-lg hover:bg-gray-800 transition-all text-gray-400 hover:text-gray-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {!packResult ? (
          <>
            {/* Configuration */}
            <div className="space-y-4 mb-6">
              <div>
                <p className="text-sm text-gray-400 mb-4">
                  Create a portable pack of <span className="font-medium text-gray-200">{agentAlias}</span> that can be:
                </p>
                <ul className="text-sm text-gray-500 space-y-1 ml-4">
                  <li>• Cloned on this machine</li>
                  <li>• Moved to another host</li>
                  <li>• Shared as a template</li>
                  <li>• Backed up for safekeeping</li>
                </ul>
              </div>

              <div className="space-y-3 pt-4 border-t border-gray-800">
                <label className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-800/50 transition-all cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeMessages}
                    onChange={(e) => setIncludeMessages(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-700 bg-gray-800 text-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-0"
                  />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-gray-200">Include Messages</div>
                    <div className="text-xs text-gray-500">Inbox and sent messages</div>
                  </div>
                </label>

                <label className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-800/50 transition-all cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeWorkspace}
                    onChange={(e) => setIncludeWorkspace(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-700 bg-gray-800 text-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-0"
                  />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-gray-200">Include Workspace</div>
                    <div className="text-xs text-gray-500">Project files (may be large)</div>
                  </div>
                </label>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="mb-4 p-3 bg-red-900/20 border border-red-900/50 rounded-lg flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-3">
              <button
                onClick={handlePack}
                disabled={packing}
                className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg font-medium text-sm transition-all flex items-center justify-center gap-2"
              >
                {packing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Packing...
                  </>
                ) : (
                  <>
                    <Package className="w-4 h-4" />
                    Create Pack
                  </>
                )}
              </button>
              <button
                onClick={resetModal}
                className="px-4 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg font-medium text-sm transition-all"
              >
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Success */}
            <div className="space-y-6">
              <div className="flex items-center gap-3 p-4 bg-green-900/20 border border-green-900/50 rounded-lg">
                <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-green-400">Pack created successfully!</p>
                  <p className="text-xs text-gray-400 mt-1">
                    Size: {formatBytes(packResult.size)}
                  </p>
                </div>
              </div>

              {/* Pack details */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Includes:</p>
                <div className="space-y-1 text-sm text-gray-400">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-600">•</span>
                    <span>Agent metadata {packResult.manifest.includes.database && '& database'}</span>
                  </div>
                  {packResult.manifest.includes.messages && (
                    <div className="flex items-center gap-2">
                      <span className="text-gray-600">•</span>
                      <span>Messages (inbox & sent)</span>
                    </div>
                  )}
                  {packResult.manifest.includes.workspace && (
                    <div className="flex items-center gap-2">
                      <span className="text-gray-600">•</span>
                      <span>Workspace files ({formatBytes(packResult.manifest.workspace?.size || 0)})</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Next steps */}
              <div className="p-3 bg-gray-800/50 rounded-lg border border-gray-800">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Next Steps:</p>
                <div className="text-xs text-gray-400 space-y-1">
                  <div>• Download and save the pack file</div>
                  <div>• Transfer to another machine: <code className="text-blue-400">scp pack.tar.gz user@host:~/</code></div>
                  <div>• Restore: <code className="text-blue-400">./scripts/unpack-agent.mjs pack.tar.gz</code></div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3 pt-4 border-t border-gray-800">
                <button
                  onClick={handleDownload}
                  className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium text-sm transition-all flex items-center justify-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Download Pack
                </button>
                <button
                  onClick={resetModal}
                  className="px-4 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg font-medium text-sm transition-all"
                >
                  Done
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  )
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]
}
