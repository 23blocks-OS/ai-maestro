'use client'

import { useState, useEffect } from 'react'
import { Server, Plus, Trash2, Edit2, CheckCircle, X, AlertCircle, Loader2, ArrowUpCircle, Package, Users, Wifi, RefreshCw, Link2 } from 'lucide-react'
import type { Host } from '@/types/host'
import localVersion from '@/version.json'

interface SyncResult {
  localAdd: boolean
  backRegistered: boolean
  peersExchanged: number
  peersShared: number
  errors: string[]
}

/**
 * Compare two semver-like version strings
 * Returns: -1 if a < b, 0 if a === b, 1 if a > b
 */
function compareVersions(a: string, b: string): number {
  const partsA = a.split('.').map(Number)
  const partsB = b.split('.').map(Number)

  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const numA = partsA[i] || 0
    const numB = partsB[i] || 0
    if (numA < numB) return -1
    if (numA > numB) return 1
  }
  return 0
}

export default function HostsSection() {
  const [hosts, setHosts] = useState<Host[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showWizard, setShowWizard] = useState(false)
  const [healthStatus, setHealthStatus] = useState<Record<string, 'checking' | 'online' | 'offline'>>({})
  const [hostVersions, setHostVersions] = useState<Record<string, string>>({})
  const [hostSessionCounts, setHostSessionCounts] = useState<Record<string, number>>({})

  // Form state
  const [formData, setFormData] = useState<Partial<Host>>({
    id: '',
    name: '',
    url: '',
    type: 'remote',
    enabled: true,
    description: '',
    tailscale: false,
  })

  // Load hosts on mount
  useEffect(() => {
    fetchHosts()
  }, [])

  // Function to refresh all hosts health/version
  const refreshAllHosts = () => {
    // Get all enabled hosts
    const enabledHosts = hosts.filter(h => h.enabled)

    // Set ALL hosts to 'checking' state first (so user sees all spinners)
    const checkingState: Record<string, 'checking'> = {}
    enabledHosts.forEach(h => { checkingState[h.id] = 'checking' })
    setHealthStatus(prev => ({ ...prev, ...checkingState }))

    // Then check each host
    enabledHosts.forEach(host => {
      if (host.isSelf) {
        // For this machine, fetch version and sessions directly (no proxy needed)
        Promise.all([
          fetch('/api/config').then(res => res.json()),
          fetch('/api/sessions').then(res => res.json())
        ])
          .then(([configData, sessionsData]) => {
            if (configData.version) {
              setHostVersions(prev => ({ ...prev, [host.id]: configData.version }))
            }
            if (sessionsData.sessions && Array.isArray(sessionsData.sessions)) {
              setHostSessionCounts(prev => ({ ...prev, [host.id]: sessionsData.sessions.length }))
            }
            setHealthStatus(prev => ({ ...prev, [host.id]: 'online' }))
          })
          .catch(() => {
            setHealthStatus(prev => ({ ...prev, [host.id]: 'offline' }))
          })
      } else {
        // For remote hosts, use the health proxy (don't set 'checking' again, already done above)
        checkHealthWithoutSettingChecking(host)
      }
    })
  }

  // Check health without setting 'checking' state (used by refreshAllHosts which sets it upfront)
  const checkHealthWithoutSettingChecking = async (host: Host) => {
    try {
      const response = await fetch(`/api/hosts/health?url=${encodeURIComponent(host.url)}`, {
        signal: AbortSignal.timeout(15000),
      })

      if (response.ok) {
        const data = await response.json()
        setHealthStatus(prev => ({ ...prev, [host.id]: 'online' }))
        if (data.version) {
          setHostVersions(prev => ({ ...prev, [host.id]: data.version }))
        }
        if (typeof data.sessionCount === 'number') {
          setHostSessionCounts(prev => ({ ...prev, [host.id]: data.sessionCount }))
        }
      } else {
        setHealthStatus(prev => ({ ...prev, [host.id]: 'offline' }))
      }
    } catch {
      setHealthStatus(prev => ({ ...prev, [host.id]: 'offline' }))
    }
  }

  // Auto-check health for all hosts on mount to get versions
  useEffect(() => {
    if (hosts.length > 0) {
      refreshAllHosts()
    }
  }, [hosts]) // Run when hosts change (not just length)

  const fetchHosts = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/hosts')
      if (!response.ok) throw new Error('Failed to fetch hosts')
      const data = await response.json()
      setHosts(data.hosts || [])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch hosts')
    } finally {
      setLoading(false)
    }
  }

  const checkHealth = async (host: Host) => {
    setHealthStatus(prev => ({ ...prev, [host.id]: 'checking' }))

    try {
      // Use proxy endpoint to avoid CORS and network accessibility issues
      const response = await fetch(`/api/hosts/health?url=${encodeURIComponent(host.url)}`, {
        signal: AbortSignal.timeout(15000), // 15 second timeout (remote /api/sessions can take 5-10s)
      })

      if (response.ok) {
        const data = await response.json()
        setHealthStatus(prev => ({ ...prev, [host.id]: 'online' }))
        // Store version if available
        if (data.version) {
          setHostVersions(prev => ({ ...prev, [host.id]: data.version }))
        }
        // Store session count if available
        if (typeof data.sessionCount === 'number') {
          setHostSessionCounts(prev => ({ ...prev, [host.id]: data.sessionCount }))
        }
      } else {
        setHealthStatus(prev => ({ ...prev, [host.id]: 'offline' }))
      }
    } catch (err) {
      console.error(`Health check failed for ${host.id}:`, err)
      setHealthStatus(prev => ({ ...prev, [host.id]: 'offline' }))
    }
  }

  const handleAdd = async (hostData: Partial<Host>): Promise<SyncResult | void> => {
    try {
      const response = await fetch('/api/hosts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(hostData),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to add host')
      }

      await fetchHosts()

      // Return sync result if available
      if (data.sync) {
        return data.sync as SyncResult
      }
    } catch (err) {
      throw err
    }
  }

  const handleUpdate = async (hostId: string) => {
    try {
      const response = await fetch(`/api/hosts/${hostId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to update host')
      }

      await fetchHosts()
      setEditingId(null)
      resetForm()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update host')
    }
  }

  const handleDelete = async (hostId: string) => {
    if (!confirm('Are you sure you want to delete this host?')) return

    try {
      const response = await fetch(`/api/hosts/${hostId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to delete host')
      }

      await fetchHosts()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete host')
    }
  }

  const startEditing = (host: Host) => {
    setEditingId(host.id)
    setFormData(host)
    setShowWizard(false)
  }

  const cancelEditing = () => {
    setEditingId(null)
    setShowWizard(false)
    resetForm()
  }

  const resetForm = () => {
    setFormData({
      id: '',
      name: '',
      url: '',
      type: 'remote',
      enabled: true,
      description: '',
      tailscale: false,
    })
  }

  const getHealthStatusIndicator = (hostId: string) => {
    const status = healthStatus[hostId]

    if (status === 'checking') {
      return <div className="w-3 h-3 rounded-full bg-yellow-500 animate-pulse" />
    }
    if (status === 'online') {
      return <div className="w-3 h-3 rounded-full bg-green-500" />
    }
    if (status === 'offline') {
      return <div className="w-3 h-3 rounded-full bg-red-500" />
    }
    return <div className="w-3 h-3 rounded-full bg-gray-600" />
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">Loading hosts...</div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white mb-2">Host Management</h1>
          <p className="text-sm text-gray-400">
            Configure remote AI Maestro peers for distributed session management
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={refreshAllHosts}
            disabled={Object.values(healthStatus).some(s => s === 'checking')}
            className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors disabled:opacity-50"
            title="Refresh all host versions and status"
          >
            <RefreshCw className={`w-4 h-4 ${Object.values(healthStatus).some(s => s === 'checking') ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={() => {
              setShowWizard(true)
              setEditingId(null)
              resetForm()
            }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Host
          </button>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <p className="text-sm">{error}</p>
          <button
            onClick={() => setError(null)}
            className="ml-auto text-red-400 hover:text-red-300"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Edit Form */}
      {editingId && (
        <EditHostForm
          formData={formData}
          setFormData={setFormData}
          onSave={() => handleUpdate(editingId)}
          onCancel={cancelEditing}
        />
      )}

      {/* Hosts List */}
      <div className="space-y-3">
        {hosts.map((host) => (
          <div
            key={host.id}
            className="p-4 bg-gray-800/30 border border-gray-700 rounded-lg hover:bg-gray-800/50 transition-colors"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3 flex-1">
                {/* Status Indicator */}
                <div className="mt-1.5">
                  {getHealthStatusIndicator(host.id)}
                </div>

                {/* Host Info */}
                <div className="flex-1 min-w-0">
                  {/* Title Row */}
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="text-lg font-medium text-white">{host.name}</h3>
                    {host.tailscale && (
                      <span className="px-2 py-0.5 text-xs bg-purple-500/10 border border-purple-500/30 text-purple-400 rounded">
                        Tailscale
                      </span>
                    )}
                    {!host.enabled && (
                      <span className="px-2 py-0.5 text-xs bg-gray-500/10 border border-gray-500/30 text-gray-400 rounded">
                        Disabled
                      </span>
                    )}
                  </div>

                  {/* URL */}
                  <div className="text-sm text-gray-400 mb-3">
                    <code className="text-gray-500">{host.url}</code>
                  </div>

                  {host.description && (
                    <p className="text-sm text-gray-500 mb-3">{host.description}</p>
                  )}

                  {/* Stats Bar */}
                  <div className="flex items-center gap-4 text-xs text-gray-400">
                    {/* Version */}
                    {hostVersions[host.id] && (
                      <div className={`flex items-center gap-1.5 ${
                        compareVersions(hostVersions[host.id], localVersion.version) < 0
                          ? 'text-orange-400'
                          : 'text-gray-400'
                      }`}>
                        {compareVersions(hostVersions[host.id], localVersion.version) < 0 ? (
                          <ArrowUpCircle className="w-3.5 h-3.5" />
                        ) : (
                          <Package className="w-3.5 h-3.5" />
                        )}
                        <span className="font-mono">
                          v{hostVersions[host.id]}
                          {compareVersions(hostVersions[host.id], localVersion.version) < 0 && (
                            <span className="text-gray-500 ml-1">(update available)</span>
                          )}
                        </span>
                      </div>
                    )}

                    {/* Separator */}
                    {hostVersions[host.id] && typeof hostSessionCounts[host.id] === 'number' && (
                      <span className="text-gray-600">•</span>
                    )}

                    {/* Sessions */}
                    {typeof hostSessionCounts[host.id] === 'number' && (
                      <div className="flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5" />
                        <span>{hostSessionCounts[host.id]} {hostSessionCounts[host.id] === 1 ? 'session' : 'sessions'}</span>
                      </div>
                    )}

                    {/* Separator */}
                    {(hostVersions[host.id] || typeof hostSessionCounts[host.id] === 'number') && healthStatus[host.id] && (
                      <span className="text-gray-600">•</span>
                    )}

                    {/* Status */}
                    {healthStatus[host.id] === 'online' && (
                      <div className="flex items-center gap-1.5 text-green-400">
                        <Wifi className="w-3.5 h-3.5" />
                        <span>Online</span>
                      </div>
                    )}
                    {healthStatus[host.id] === 'offline' && (
                      <div className="flex items-center gap-1.5 text-red-400">
                        <AlertCircle className="w-3.5 h-3.5" />
                        <span>Offline</span>
                      </div>
                    )}
                    {healthStatus[host.id] === 'checking' && (
                      <div className="flex items-center gap-1.5 text-yellow-400">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Checking...</span>
                      </div>
                    )}

                    {/* Sync Status (for remote hosts with sync info) */}
                    {host.type === 'remote' && host.syncSource && (
                      <>
                        <span className="text-gray-600">•</span>
                        <div className="flex items-center gap-1.5 text-purple-400">
                          <Link2 className="w-3.5 h-3.5" />
                          <span>
                            {host.syncSource === 'manual' ? 'Manual' :
                             host.syncSource === 'peer-registration' ? 'Auto-registered' :
                             host.syncSource?.startsWith('peer-exchange') ? 'Peer discovery' :
                             'Synced'}
                          </span>
                        </div>
                      </>
                    )}

                    {/* Last Sync Error */}
                    {host.type === 'remote' && host.lastSyncError && (
                      <>
                        <span className="text-gray-600">•</span>
                        <div className="flex items-center gap-1.5 text-orange-400" title={host.lastSyncError}>
                          <AlertCircle className="w-3.5 h-3.5" />
                          <span>Sync warning</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 ml-4">
                {host.type === 'remote' && (
                  <button
                    onClick={() => checkHealth(host)}
                    disabled={healthStatus[host.id] === 'checking'}
                    className="p-2 hover:bg-gray-700 rounded transition-colors disabled:opacity-50"
                    title="Test connection"
                  >
                    <CheckCircle className="w-4 h-4 text-gray-400" />
                  </button>
                )}

                <button
                  onClick={() => startEditing(host)}
                  className="p-2 hover:bg-gray-700 rounded transition-colors"
                  title="Edit host"
                >
                  <Edit2 className="w-4 h-4 text-gray-400" />
                </button>

                {host.type !== 'local' && (
                  <button
                    onClick={() => handleDelete(host.id)}
                    className="p-2 hover:bg-gray-700 rounded transition-colors"
                    title="Delete host"
                  >
                    <Trash2 className="w-4 h-4 text-red-400" />
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {hosts.length === 0 && (
        <div className="flex flex-col items-center justify-center h-64 text-gray-400">
          <Server className="w-12 h-12 mb-4 opacity-50" />
          <p>No hosts configured</p>
          <p className="text-sm text-gray-500 mt-2">Add a remote host to get started</p>
        </div>
      )}

      {/* Add Host Wizard */}
      {showWizard && (
        <AddHostWizard
          onAdd={handleAdd}
          onClose={() => {
            setShowWizard(false)
            resetForm()
          }}
        />
      )}
    </div>
  )
}

// Add Host Wizard Component
function AddHostWizard({
  onAdd,
  onClose,
}: {
  onAdd: (host: Partial<Host>) => Promise<SyncResult | void>
  onClose: () => void
}) {
  const [step, setStep] = useState<'url' | 'details' | 'success'>('url')
  const [url, setUrl] = useState('')
  const [discovering, setDiscovering] = useState(false)
  const [discoveryError, setDiscoveryError] = useState<string | null>(null)
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null)
  const [hostData, setHostData] = useState<Partial<Host>>({
    id: '',
    name: '',
    url: '',
    type: 'remote',
    enabled: true,
    tailscale: false,
  })

  const handleDiscover = async () => {
    setDiscovering(true)
    setDiscoveryError(null)

    try {
      // Validate URL format
      let testUrl = url.trim()
      if (!testUrl.startsWith('http://') && !testUrl.startsWith('https://')) {
        testUrl = 'http://' + testUrl
      }

      // Remove trailing slash to prevent double slashes in API calls
      testUrl = testUrl.replace(/\/$/, '')

      const parsedUrl = new URL(testUrl)

      // Test connection via proxy endpoint to avoid CORS issues
      const response = await fetch(`/api/hosts/health?url=${encodeURIComponent(testUrl)}`, {
        signal: AbortSignal.timeout(15000), // 15 second timeout (remote /api/sessions can take 5-10s)
      })

      if (!response.ok) {
        throw new Error('Host is not reachable or is not an AI Maestro instance')
      }

      // Generate suggested ID from hostname
      const hostname = parsedUrl.hostname.replace(/\./g, '-')
      const suggestedId = hostname === 'localhost' || hostname === '127-0-0-1'
        ? `remote-${Date.now()}`
        : hostname

      // Set discovered data
      setHostData({
        id: suggestedId,
        name: parsedUrl.hostname,
        url: testUrl,
        type: 'remote',
        enabled: true,
        tailscale: !!parsedUrl.hostname.match(/^100\./), // Auto-detect Tailscale
      })

      setStep('details')
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        setDiscoveryError('Connection timeout - host is not reachable')
      } else {
        setDiscoveryError(err instanceof Error ? err.message : 'Invalid URL or host not reachable')
      }
    } finally {
      setDiscovering(false)
    }
  }

  const handleSave = async () => {
    try {
      const result = await onAdd(hostData)
      if (result) {
        setSyncResult(result)
      }
      setStep('success')
      setTimeout(() => onClose(), 3000) // Give more time to read sync results
    } catch (err) {
      setDiscoveryError(err instanceof Error ? err.message : 'Failed to add host')
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-gray-800 rounded-xl p-6 w-full max-w-md shadow-2xl border border-gray-700" onClick={(e) => e.stopPropagation()}>
        {step === 'url' && (
          <>
            <h3 className="text-lg font-semibold text-white mb-4">Add Remote Host</h3>
            <p className="text-sm text-gray-400 mb-4">
              Enter the URL of your remote AI Maestro instance. We&apos;ll automatically discover the connection details.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Host URL <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="http://100.80.12.6:23000 or 192.168.1.10:23000"
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && url.trim()) {
                      handleDiscover()
                    }
                  }}
                />
                <p className="mt-1 text-xs text-gray-500">
                  Examples: http://100.80.12.6:23000 (Tailscale), http://192.168.1.10:23000 (Local network)
                </p>
              </div>

              {discoveryError && (
                <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400">
                  <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  <p className="text-sm">{discoveryError}</p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 mt-6">
              <button
                onClick={onClose}
                disabled={discovering}
                className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white transition-colors rounded-lg hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={handleDiscover}
                disabled={discovering || !url.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
              >
                {discovering ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Discovering...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    Discover Host
                  </>
                )}
              </button>
            </div>
          </>
        )}

        {step === 'details' && (
          <>
            <h3 className="text-lg font-semibold text-white mb-4">Configure Host Details</h3>
            <p className="text-sm text-gray-400 mb-4">
              Customize the host configuration before saving.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Host ID <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={hostData.id}
                  onChange={(e) => setHostData({ ...hostData, id: e.target.value })}
                  placeholder="e.g., mac-mini"
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                />
                <p className="mt-1 text-xs text-gray-500">Alphanumeric, dashes, and underscores only</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={hostData.name}
                  onChange={(e) => setHostData({ ...hostData, name: e.target.value })}
                  placeholder="e.g., Mac Mini"
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  URL <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={hostData.url}
                  onChange={(e) => setHostData({ ...hostData, url: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Description (Optional)
                </label>
                <textarea
                  value={hostData.description || ''}
                  onChange={(e) => setHostData({ ...hostData, description: e.target.value })}
                  placeholder="Optional description..."
                  rows={2}
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 resize-none"
                />
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="tailscale-wizard"
                  checked={hostData.tailscale || false}
                  onChange={(e) => setHostData({ ...hostData, tailscale: e.target.checked })}
                  className="w-4 h-4 rounded border-gray-700 bg-gray-900 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="tailscale-wizard" className="text-sm text-gray-300">
                  Connected via Tailscale VPN
                </label>
              </div>

              {discoveryError && (
                <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400">
                  <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  <p className="text-sm">{discoveryError}</p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 mt-6">
              <button
                onClick={() => setStep('url')}
                className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white transition-colors rounded-lg hover:bg-gray-700"
              >
                Back
              </button>
              <button
                onClick={handleSave}
                disabled={!hostData.id || !hostData.name || !hostData.url}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
              >
                <CheckCircle className="w-4 h-4" />
                Add Host
              </button>
            </div>
          </>
        )}

        {step === 'success' && (
          <div className="text-center py-6">
            <div className="w-16 h-16 bg-green-500/10 border border-green-500/30 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-green-400" />
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">Host Added Successfully!</h3>

            {/* Sync Status Details */}
            {syncResult && (
              <div className="mt-4 space-y-2 text-left bg-gray-900/50 rounded-lg p-4">
                <h4 className="text-sm font-medium text-gray-300 mb-3">Sync Status</h4>

                <div className="flex items-center gap-2 text-sm">
                  {syncResult.localAdd ? (
                    <CheckCircle className="w-4 h-4 text-green-400" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-yellow-400" />
                  )}
                  <span className="text-gray-400">
                    {syncResult.localAdd ? 'Added to local registry' : 'Already in local registry'}
                  </span>
                </div>

                <div className="flex items-center gap-2 text-sm">
                  {syncResult.backRegistered ? (
                    <Link2 className="w-4 h-4 text-green-400" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-orange-400" />
                  )}
                  <span className="text-gray-400">
                    {syncResult.backRegistered
                      ? 'Registered with remote host'
                      : 'Could not register with remote host'}
                  </span>
                </div>

                {syncResult.peersExchanged > 0 && (
                  <div className="flex items-center gap-2 text-sm">
                    <Users className="w-4 h-4 text-blue-400" />
                    <span className="text-gray-400">
                      Discovered {syncResult.peersExchanged} new peer{syncResult.peersExchanged !== 1 ? 's' : ''}
                    </span>
                  </div>
                )}

                {syncResult.peersShared > 0 && (
                  <div className="flex items-center gap-2 text-sm">
                    <RefreshCw className="w-4 h-4 text-purple-400" />
                    <span className="text-gray-400">
                      Shared with {syncResult.peersShared} existing peer{syncResult.peersShared !== 1 ? 's' : ''}
                    </span>
                  </div>
                )}

                {syncResult.errors.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-gray-700">
                    <p className="text-xs text-orange-400 mb-1">Warnings:</p>
                    {syncResult.errors.map((err, i) => (
                      <p key={i} className="text-xs text-gray-500">{err}</p>
                    ))}
                  </div>
                )}
              </div>
            )}

            {!syncResult && (
              <p className="text-sm text-gray-400">
                You can now create sessions on this remote host.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// Edit Host Form Component
function EditHostForm({
  formData,
  setFormData,
  onSave,
  onCancel,
}: {
  formData: Partial<Host>
  setFormData: (data: Partial<Host>) => void
  onSave: () => void
  onCancel: () => void
}) {
  const isLocal = formData.type === 'local'

  return (
    <div className="p-6 bg-gray-800/50 border border-gray-700 rounded-lg space-y-4">
      <h2 className="text-lg font-medium text-white">Edit Host</h2>

      {isLocal && (
        <div className="p-3 bg-blue-900/20 border border-blue-700/30 rounded-lg">
          <p className="text-sm text-blue-300">
            This is your local host. You can customize the display name to make it easier to identify when accessing from other devices.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Host ID <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={formData.id}
            disabled
            className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-gray-500 opacity-50 cursor-not-allowed"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Display Name <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder={isLocal ? "e.g., Juan's MacBook Pro" : ""}
            className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
          />
        </div>

        {!isLocal && (
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-300 mb-2">
              URL <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={formData.url}
              onChange={(e) => setFormData({ ...formData, url: e.target.value })}
              className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
            />
          </div>
        )}

        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Description
          </label>
          <textarea
            value={formData.description || ''}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder={isLocal ? "e.g., Main development machine" : ""}
            rows={2}
            className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-blue-500 resize-none"
          />
        </div>

        {!isLocal && (
          <>
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="tailscale-edit"
                checked={formData.tailscale || false}
                onChange={(e) => setFormData({ ...formData, tailscale: e.target.checked })}
                className="w-4 h-4 rounded border-gray-700 bg-gray-900 text-blue-600"
              />
              <label htmlFor="tailscale-edit" className="text-sm text-gray-300">
                Tailscale VPN
              </label>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="enabled-edit"
                checked={formData.enabled}
                onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                className="w-4 h-4 rounded border-gray-700 bg-gray-900 text-blue-600"
              />
              <label htmlFor="enabled-edit" className="text-sm text-gray-300">
                Enabled
              </label>
            </div>
          </>
        )}
      </div>

      <div className="flex items-center gap-3 pt-4">
        <button
          onClick={onSave}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
        >
          <CheckCircle className="w-4 h-4" />
          Update Host
        </button>
        <button
          onClick={onCancel}
          className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
        >
          <X className="w-4 h-4" />
          Cancel
        </button>
      </div>
    </div>
  )
}
