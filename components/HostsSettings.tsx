'use client'

import { useState, useEffect } from 'react'
import { Server, Plus, Trash2, Edit2, Check, X, AlertCircle, CheckCircle } from 'lucide-react'
import type { Host } from '@/types/host'

export default function HostsSettings() {
  const [hosts, setHosts] = useState<Host[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [healthStatus, setHealthStatus] = useState<Record<string, 'checking' | 'online' | 'offline'>>({})

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
        signal: AbortSignal.timeout(5000), // 5 second timeout
      })

      if (response.ok) {
        setHealthStatus(prev => ({ ...prev, [host.id]: 'online' }))
      } else {
        setHealthStatus(prev => ({ ...prev, [host.id]: 'offline' }))
      }
    } catch (err) {
      console.error(`Health check failed for ${host.id}:`, err)
      setHealthStatus(prev => ({ ...prev, [host.id]: 'offline' }))
    }
  }

  const handleAdd = async () => {
    try {
      const response = await fetch('/api/hosts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to add host')
      }

      await fetchHosts()
      setShowAddForm(false)
      resetForm()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add host')
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
    setShowAddForm(false)
  }

  const cancelEditing = () => {
    setEditingId(null)
    setShowAddForm(false)
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
            Configure remote AI Maestro workers for distributed session management
          </p>
        </div>
        <button
          onClick={() => {
            setShowAddForm(true)
            setEditingId(null)
            resetForm()
          }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Host
        </button>
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

      {/* Add/Edit Form */}
      {(showAddForm || editingId) && (
        <div className="p-6 bg-gray-800/50 border border-gray-700 rounded-lg space-y-4">
          <h2 className="text-lg font-medium text-white">
            {showAddForm ? 'Add New Host' : 'Edit Host'}
          </h2>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Host ID <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={formData.id}
                onChange={(e) => setFormData({ ...formData, id: e.target.value })}
                disabled={editingId !== null}
                placeholder="e.g., mac-mini"
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 disabled:opacity-50"
              />
              <p className="mt-1 text-xs text-gray-500">Alphanumeric, dashes, and underscores only</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Mac Mini"
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                URL <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={formData.url}
                onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                placeholder="http://100.80.12.6:23000"
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
              />
              <p className="mt-1 text-xs text-gray-500">Full URL including protocol and port</p>
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Description
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Optional description..."
                rows={2}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 resize-none"
              />
            </div>

            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="tailscale"
                checked={formData.tailscale || false}
                onChange={(e) => setFormData({ ...formData, tailscale: e.target.checked })}
                className="w-4 h-4 rounded border-gray-700 bg-gray-900 text-blue-600 focus:ring-blue-500"
              />
              <label htmlFor="tailscale" className="text-sm text-gray-300">
                Tailscale VPN
              </label>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="enabled"
                checked={formData.enabled}
                onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                className="w-4 h-4 rounded border-gray-700 bg-gray-900 text-blue-600 focus:ring-blue-500"
              />
              <label htmlFor="enabled" className="text-sm text-gray-300">
                Enabled
              </label>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-4">
            <button
              onClick={() => {
                if (editingId) {
                  handleUpdate(editingId)
                } else {
                  handleAdd()
                }
              }}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
            >
              <Check className="w-4 h-4" />
              {editingId ? 'Update Host' : 'Add Host'}
            </button>
            <button
              onClick={cancelEditing}
              className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
              Cancel
            </button>
          </div>
        </div>
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
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="text-lg font-medium text-white">{host.name}</h3>
                    <span className="text-xs text-gray-500 font-mono">({host.id})</span>
                    {host.type === 'local' && (
                      <span className="px-2 py-0.5 text-xs bg-green-500/10 border border-green-500/30 text-green-400 rounded">
                        Local
                      </span>
                    )}
                    {host.type === 'remote' && (
                      <span className="px-2 py-0.5 text-xs bg-blue-500/10 border border-blue-500/30 text-blue-400 rounded">
                        Remote
                      </span>
                    )}
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

                  <div className="text-sm text-gray-400 mb-2">
                    <code className="px-2 py-1 bg-gray-900 rounded text-blue-400">{host.url}</code>
                  </div>

                  {host.description && (
                    <p className="text-sm text-gray-500">{host.description}</p>
                  )}
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

                {host.type !== 'local' && (
                  <>
                    <button
                      onClick={() => startEditing(host)}
                      className="p-2 hover:bg-gray-700 rounded transition-colors"
                      title="Edit host"
                    >
                      <Edit2 className="w-4 h-4 text-gray-400" />
                    </button>
                    <button
                      onClick={() => handleDelete(host.id)}
                      className="p-2 hover:bg-gray-700 rounded transition-colors"
                      title="Delete host"
                    >
                      <Trash2 className="w-4 h-4 text-red-400" />
                    </button>
                  </>
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
    </div>
  )
}
