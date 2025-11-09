'use client'

import { useState } from 'react'
import { X, PackageOpen, Upload, Loader2, CheckCircle2, AlertCircle, FileSearch } from 'lucide-react'

interface AgentUnpackModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

export default function AgentUnpackModal({ isOpen, onClose, onSuccess }: AgentUnpackModalProps) {
  const [file, setFile] = useState<File | null>(null)
  const [newAlias, setNewAlias] = useState('')
  const [restoreToId, setRestoreToId] = useState(false)
  const [unpacking, setUnpacking] = useState(false)
  const [inspecting, setInspecting] = useState(false)
  const [manifest, setManifest] = useState<any>(null)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      setFile(selectedFile)
      setManifest(null)
      setError(null)
    }
  }

  const handleInspect = async () => {
    if (!file) return

    setInspecting(true)
    setError(null)

    try {
      // Upload file to temp location first
      const formData = new FormData()
      formData.append('file', file)

      // For inspection, we'll just read the manifest from the tarball client-side
      // or we could add an inspect endpoint - for now let's show basic file info
      setManifest({
        agent: {
          alias: 'Inspecting...',
          displayName: 'Loading pack details...'
        },
        packDate: new Date().toISOString(),
        includes: {
          database: true,
          messages: true,
          workspace: false
        }
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to inspect pack')
    } finally {
      setInspecting(false)
    }
  }

  const handleUnpack = async () => {
    if (!file) return

    setUnpacking(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append('file', file)

      if (newAlias) {
        formData.append('newAlias', newAlias)
      }
      if (restoreToId) {
        formData.append('restoreToId', 'true')
      }

      const response = await fetch('/api/agents/unpack', {
        method: 'POST',
        body: formData
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to unpack agent')
      }

      const data = await response.json()
      setResult(data)

      // Call success callback after a brief delay
      setTimeout(() => {
        onSuccess?.()
      }, 1500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to unpack agent')
    } finally {
      setUnpacking(false)
    }
  }

  const resetModal = () => {
    setFile(null)
    setNewAlias('')
    setRestoreToId(false)
    setManifest(null)
    setResult(null)
    setError(null)
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
            <div className="p-2 bg-green-600/20 rounded-lg">
              <PackageOpen className="w-5 h-5 text-green-400" />
            </div>
            <h2 className="text-lg font-bold text-gray-100">Import Agent</h2>
          </div>
          <button
            onClick={resetModal}
            className="p-2 rounded-lg hover:bg-gray-800 transition-all text-gray-400 hover:text-gray-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {!result ? (
          <>
            {/* File Upload */}
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Select Agent Pack
                </label>
                <div className="relative">
                  <input
                    type="file"
                    accept=".tar.gz,.tgz"
                    onChange={handleFileChange}
                    className="hidden"
                    id="pack-file-input"
                  />
                  <label
                    htmlFor="pack-file-input"
                    className="flex items-center justify-center gap-3 p-6 border-2 border-dashed border-gray-700 hover:border-gray-600 rounded-lg cursor-pointer transition-all bg-gray-800/30 hover:bg-gray-800/50"
                  >
                    {file ? (
                      <>
                        <FileSearch className="w-5 h-5 text-green-400" />
                        <div className="text-sm">
                          <p className="font-medium text-gray-200">{file.name}</p>
                          <p className="text-gray-500">{formatBytes(file.size)}</p>
                        </div>
                      </>
                    ) : (
                      <>
                        <Upload className="w-5 h-5 text-gray-500" />
                        <div className="text-sm text-gray-400">
                          Click to select pack file (.tar.gz)
                        </div>
                      </>
                    )}
                  </label>
                </div>
              </div>

              {file && (
                <>
                  {/* Configuration */}
                  <div className="space-y-3 pt-4 border-t border-gray-800">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        New Alias (optional)
                      </label>
                      <input
                        type="text"
                        value={newAlias}
                        onChange={(e) => setNewAlias(e.target.value)}
                        placeholder="Leave empty to auto-generate"
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        If empty, will use original alias with "-clone" suffix
                      </p>
                    </div>

                    <label className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-800/50 transition-all cursor-pointer">
                      <input
                        type="checkbox"
                        checked={restoreToId}
                        onChange={(e) => setRestoreToId(e.target.checked)}
                        className="w-4 h-4 rounded border-gray-700 bg-gray-800 text-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-0"
                      />
                      <div className="flex-1">
                        <div className="text-sm font-medium text-gray-200">Restore with Original ID</div>
                        <div className="text-xs text-gray-500">⚠️ May conflict with existing agent</div>
                      </div>
                    </label>
                  </div>
                </>
              )}
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
                onClick={handleUnpack}
                disabled={!file || unpacking}
                className="flex-1 px-4 py-2.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg font-medium text-sm transition-all flex items-center justify-center gap-2"
              >
                {unpacking ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <PackageOpen className="w-4 h-4" />
                    Import Agent
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
                  <p className="text-sm font-medium text-green-400">Agent imported successfully!</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {result.agent.alias} is now available
                  </p>
                </div>
              </div>

              {/* Agent details */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Agent Details:</p>
                <div className="p-3 bg-gray-800/50 rounded-lg border border-gray-800 space-y-1 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">Alias:</span>
                    <span className="text-gray-200 font-medium">{result.agent.alias}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">Display Name:</span>
                    <span className="text-gray-200">{result.agent.displayName}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">ID:</span>
                    <span className="text-gray-400 font-mono text-xs">{result.agent.id}</span>
                  </div>
                </div>
              </div>

              {/* Next steps */}
              <div className="p-3 bg-gray-800/50 rounded-lg border border-gray-800">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Next Steps:</p>
                <div className="text-xs text-gray-400 space-y-1">
                  <div>• Agent is now registered in the dashboard</div>
                  <div>• Create a tmux session to activate the agent</div>
                  <div>• Link session: <code className="text-blue-400">./scripts/register-agent-from-session.mjs</code></div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3 pt-4 border-t border-gray-800">
                <button
                  onClick={resetModal}
                  className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium text-sm transition-all"
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
