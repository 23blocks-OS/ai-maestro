'use client'

import { useState, useEffect } from 'react'
import { X, Send, Copy, Server, AlertCircle, CheckCircle, Loader2, ArrowRight, GitBranch, FolderGit2 } from 'lucide-react'
import { useHosts } from '@/hooks/useHosts'
import type { Host } from '@/types/host'
import type { PortableRepository } from '@/types/portable'

interface TransferAgentDialogProps {
  agentId: string
  agentAlias: string
  agentDisplayName?: string
  currentHostId?: string  // The host where the agent currently lives
  onClose: () => void
  onTransferComplete?: (result: TransferResult) => void
}

interface TransferResult {
  success: boolean
  newAgentId?: string
  newAlias?: string
  targetHost: string
  mode: 'move' | 'clone'
  error?: string
}

type TransferMode = 'move' | 'clone'
type TransferStatus = 'idle' | 'exporting' | 'transferring' | 'importing' | 'cleaning' | 'complete' | 'error'

export default function TransferAgentDialog({
  agentId,
  agentAlias,
  agentDisplayName,
  currentHostId = 'local',
  onClose,
  onTransferComplete
}: TransferAgentDialogProps) {
  const { hosts } = useHosts()
  const [selectedHostId, setSelectedHostId] = useState<string>('')
  const [mode, setMode] = useState<TransferMode>('clone')
  const [newAlias, setNewAlias] = useState('')
  const [status, setStatus] = useState<TransferStatus>('idle')
  const [progress, setProgress] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<TransferResult | null>(null)

  // Repository state
  const [repositories, setRepositories] = useState<PortableRepository[]>([])
  const [loadingRepos, setLoadingRepos] = useState(true)
  const [cloneRepositories, setCloneRepositories] = useState(true)

  // Filter out the current host from available targets
  const availableHosts = hosts.filter(h => h.id !== currentHostId && h.enabled)

  // Auto-select first available host
  useEffect(() => {
    if (availableHosts.length > 0 && !selectedHostId) {
      setSelectedHostId(availableHosts[0].id)
    }
  }, [availableHosts, selectedHostId])

  // Fetch repositories when dialog opens
  useEffect(() => {
    const fetchRepos = async () => {
      try {
        setLoadingRepos(true)
        const response = await fetch(`/api/agents/${agentId}/repos`)
        if (response.ok) {
          const data = await response.json()
          // Convert to PortableRepository format
          const portableRepos: PortableRepository[] = (data.repositories || []).map((repo: any) => ({
            name: repo.name,
            remoteUrl: repo.remoteUrl,
            defaultBranch: repo.defaultBranch || repo.currentBranch,
            isPrimary: repo.isPrimary,
            originalPath: repo.localPath
          }))
          setRepositories(portableRepos)
        }
      } catch (err) {
        console.error('Failed to fetch repos:', err)
      } finally {
        setLoadingRepos(false)
      }
    }
    fetchRepos()
  }, [agentId])

  const selectedHost = hosts.find(h => h.id === selectedHostId)

  const handleTransfer = async () => {
    if (!selectedHostId || !selectedHost) {
      setError('Please select a target host')
      return
    }

    setStatus('exporting')
    setProgress('Preparing agent export...')
    setError(null)

    try {
      // Call the transfer API
      const response = await fetch(`/api/agents/${agentId}/transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetHostId: selectedHostId,
          targetHostUrl: selectedHost.url,
          mode,
          newAlias: newAlias.trim() || undefined,
          cloneRepositories: cloneRepositories && repositories.length > 0
        })
      })

      // Handle streaming progress updates
      if (response.headers.get('content-type')?.includes('text/event-stream')) {
        const reader = response.body?.getReader()
        const decoder = new TextDecoder()

        if (reader) {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            const text = decoder.decode(value)
            const lines = text.split('\n')

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = JSON.parse(line.slice(6))
                if (data.status) setStatus(data.status as TransferStatus)
                if (data.progress) setProgress(data.progress)
                if (data.error) {
                  setError(data.error)
                  setStatus('error')
                }
                if (data.result) {
                  setResult(data.result)
                  setStatus('complete')
                  onTransferComplete?.(data.result)
                }
              }
            }
          }
        }
      } else {
        // Non-streaming response
        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.error || 'Transfer failed')
        }

        setResult(data)
        setStatus('complete')
        onTransferComplete?.(data)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Transfer failed')
      setStatus('error')
    }
  }

  const getStatusMessage = () => {
    switch (status) {
      case 'exporting': return 'Exporting agent data...'
      case 'transferring': return 'Transferring to target host...'
      case 'importing': return 'Importing on target host...'
      case 'cleaning': return 'Cleaning up source agent...'
      case 'complete': return 'Transfer complete!'
      case 'error': return 'Transfer failed'
      default: return ''
    }
  }

  const isInProgress = ['exporting', 'transferring', 'importing', 'cleaning'].includes(status)

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-xl shadow-2xl w-full max-w-lg border border-gray-700">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
              <Send className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-100">Transfer Agent</h2>
              <p className="text-sm text-gray-400">
                {agentDisplayName || agentAlias}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isInProgress}
            className="p-2 rounded-lg hover:bg-gray-800 transition-colors text-gray-400 hover:text-gray-200 disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-5">
          {status === 'complete' && result?.success ? (
            // Success state
            <div className="text-center py-6">
              <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-8 h-8 text-green-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-100 mb-2">
                {mode === 'move' ? 'Agent Moved!' : 'Agent Cloned!'}
              </h3>
              <p className="text-sm text-gray-400 mb-4">
                {agentDisplayName || agentAlias} has been {mode === 'move' ? 'moved' : 'cloned'} to {selectedHost?.name}
              </p>
              {result.newAlias && result.newAlias !== agentAlias && (
                <p className="text-sm text-blue-400">
                  New alias: <span className="font-mono">{result.newAlias}</span>
                </p>
              )}
            </div>
          ) : status === 'error' ? (
            // Error state
            <div className="text-center py-6">
              <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-8 h-8 text-red-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-100 mb-2">Transfer Failed</h3>
              <p className="text-sm text-red-400">{error}</p>
            </div>
          ) : isInProgress ? (
            // Progress state
            <div className="text-center py-6">
              <div className="w-16 h-16 rounded-full bg-blue-500/20 flex items-center justify-center mx-auto mb-4">
                <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
              </div>
              <h3 className="text-lg font-semibold text-gray-100 mb-2">{getStatusMessage()}</h3>
              <p className="text-sm text-gray-400">{progress}</p>
            </div>
          ) : (
            // Configuration state
            <>
              {/* Target Host Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Target Host
                </label>
                {availableHosts.length === 0 ? (
                  <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                    <p className="text-sm text-yellow-400">
                      No other hosts available. Add remote hosts in Settings to enable transfers.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {availableHosts.map(host => (
                      <button
                        key={host.id}
                        onClick={() => setSelectedHostId(host.id)}
                        className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-all ${
                          selectedHostId === host.id
                            ? 'bg-blue-500/20 border-blue-500/50 text-blue-300'
                            : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-600'
                        }`}
                      >
                        <Server className="w-5 h-5" />
                        <div className="flex-1 text-left">
                          <div className="font-medium">{host.name}</div>
                          <div className="text-xs text-gray-500">{host.url}</div>
                        </div>
                        {selectedHostId === host.id && (
                          <CheckCircle className="w-5 h-5 text-blue-400" />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Transfer Mode */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Transfer Mode
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setMode('clone')}
                    className={`flex flex-col items-center gap-2 p-4 rounded-lg border transition-all ${
                      mode === 'clone'
                        ? 'bg-blue-500/20 border-blue-500/50'
                        : 'bg-gray-800 border-gray-700 hover:border-gray-600'
                    }`}
                  >
                    <Copy className={`w-6 h-6 ${mode === 'clone' ? 'text-blue-400' : 'text-gray-400'}`} />
                    <div className="text-center">
                      <div className={`font-medium ${mode === 'clone' ? 'text-blue-300' : 'text-gray-300'}`}>
                        Clone
                      </div>
                      <div className="text-xs text-gray-500">Keep original</div>
                    </div>
                  </button>
                  <button
                    onClick={() => setMode('move')}
                    className={`flex flex-col items-center gap-2 p-4 rounded-lg border transition-all ${
                      mode === 'move'
                        ? 'bg-orange-500/20 border-orange-500/50'
                        : 'bg-gray-800 border-gray-700 hover:border-gray-600'
                    }`}
                  >
                    <ArrowRight className={`w-6 h-6 ${mode === 'move' ? 'text-orange-400' : 'text-gray-400'}`} />
                    <div className="text-center">
                      <div className={`font-medium ${mode === 'move' ? 'text-orange-300' : 'text-gray-300'}`}>
                        Move
                      </div>
                      <div className="text-xs text-gray-500">Delete original</div>
                    </div>
                  </button>
                </div>
              </div>

              {/* New Alias (optional) */}
              <div>
                <label htmlFor="new-alias" className="block text-sm font-medium text-gray-300 mb-2">
                  New Alias <span className="text-gray-500">(optional)</span>
                </label>
                <input
                  id="new-alias"
                  type="text"
                  value={newAlias}
                  onChange={(e) => setNewAlias(e.target.value)}
                  placeholder={agentAlias}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Leave empty to keep the same alias (may be auto-renamed if it conflicts)
                </p>
              </div>

              {/* Repositories Section */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  <div className="flex items-center gap-2">
                    <FolderGit2 className="w-4 h-4" />
                    Git Repositories
                  </div>
                </label>
                {loadingRepos ? (
                  <div className="p-3 bg-gray-800 border border-gray-700 rounded-lg flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                    <span className="text-sm text-gray-400">Detecting repositories...</span>
                  </div>
                ) : repositories.length === 0 ? (
                  <div className="p-3 bg-gray-800 border border-gray-700 rounded-lg">
                    <p className="text-sm text-gray-500">No git repositories detected</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {/* Clone option */}
                    <label className="flex items-center gap-3 p-3 bg-gray-800 border border-gray-700 rounded-lg cursor-pointer hover:border-gray-600 transition-all">
                      <input
                        type="checkbox"
                        checked={cloneRepositories}
                        onChange={(e) => setCloneRepositories(e.target.checked)}
                        className="w-4 h-4 rounded bg-gray-700 border-gray-600 text-blue-500 focus:ring-blue-500 focus:ring-offset-gray-900"
                      />
                      <div className="flex-1">
                        <span className="text-sm font-medium text-gray-200">Clone repositories on target</span>
                        <p className="text-xs text-gray-500">Git clone the repos to the same paths on the new host</p>
                      </div>
                    </label>

                    {/* Repository list */}
                    <div className={`space-y-1 ${!cloneRepositories ? 'opacity-50' : ''}`}>
                      {repositories.map((repo, idx) => (
                        <div
                          key={idx}
                          className="flex items-center gap-3 p-2 bg-gray-800/50 rounded-lg"
                        >
                          <GitBranch className="w-4 h-4 text-gray-500" />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-gray-300 flex items-center gap-2">
                              {repo.name}
                              {repo.isPrimary && (
                                <span className="px-1.5 py-0.5 text-xs bg-blue-500/20 text-blue-400 rounded">
                                  primary
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-gray-500 truncate" title={repo.remoteUrl}>
                              {repo.remoteUrl}
                            </div>
                            {repo.originalPath && (
                              <div className="text-xs text-gray-600 truncate" title={repo.originalPath}>
                                → {repo.originalPath}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Warning for move mode */}
              {mode === 'move' && (
                <div className="p-3 bg-orange-500/10 border border-orange-500/30 rounded-lg">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-orange-400 mt-0.5" />
                    <p className="text-sm text-orange-300">
                      Move mode will delete the agent from this host after successful transfer.
                      Messages and work history will be transferred to the new host.
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-800">
          {status === 'complete' || status === 'error' ? (
            <button
              onClick={onClose}
              className="px-5 py-2.5 bg-gray-700 text-gray-200 rounded-lg hover:bg-gray-600 transition-all font-medium"
            >
              Close
            </button>
          ) : (
            <>
              <button
                onClick={onClose}
                disabled={isInProgress}
                className="px-5 py-2.5 text-gray-400 hover:text-gray-200 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleTransfer}
                disabled={isInProgress || availableHosts.length === 0 || !selectedHostId}
                className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium flex items-center gap-2"
              >
                {isInProgress ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Transferring...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    {mode === 'move' ? 'Move Agent' : 'Clone Agent'}
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
