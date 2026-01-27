'use client'

import React, { useState, useEffect } from 'react'
import {
  Globe, Plus, Trash2, RefreshCw, X, AlertCircle,
  Check, Star, StarOff
} from 'lucide-react'
import type { EmailDomain, CreateDomainRequest } from '@/types/agent'

export default function DomainsSection() {
  const [domains, setDomains] = useState<EmailDomain[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [saving, setSaving] = useState(false)

  // Create form state
  const [newDomain, setNewDomain] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newIsDefault, setNewIsDefault] = useState(false)

  // Fetch domains
  const fetchDomains = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/domains')
      if (response.ok) {
        const data = await response.json()
        setDomains(data.domains || [])
      } else {
        const err = await response.json()
        setError(err.error || 'Failed to load domains')
      }
    } catch (err) {
      setError('Failed to connect to server')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchDomains()
  }, [])

  // Create domain
  const handleCreate = async () => {
    if (!newDomain.trim()) return

    setSaving(true)
    setError(null)
    try {
      const payload: CreateDomainRequest = {
        domain: newDomain.trim(),
        description: newDescription.trim() || undefined,
        isDefault: newIsDefault,
      }

      const response = await fetch('/api/domains', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (response.ok) {
        setShowCreateDialog(false)
        setNewDomain('')
        setNewDescription('')
        setNewIsDefault(false)
        fetchDomains()
      } else {
        const err = await response.json()
        setError(err.error || 'Failed to create domain')
      }
    } catch (err) {
      setError('Failed to connect to server')
    } finally {
      setSaving(false)
    }
  }

  // Delete domain
  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this domain? Existing email addresses using this domain will NOT be affected.')) return

    try {
      const response = await fetch(`/api/domains/${id}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        fetchDomains()
      } else {
        const err = await response.json()
        setError(err.error || 'Failed to delete domain')
      }
    } catch (err) {
      setError('Failed to connect to server')
    }
  }

  // Set as default
  const handleSetDefault = async (id: string) => {
    try {
      const response = await fetch(`/api/domains/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isDefault: true }),
      })

      if (response.ok) {
        fetchDomains()
      } else {
        const err = await response.json()
        setError(err.error || 'Failed to set default domain')
      }
    } catch (err) {
      setError('Failed to connect to server')
    }
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Email Domains</h1>
          <p className="text-gray-400">
            Manage domains for agent email addresses
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchDomains}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={() => setShowCreateDialog(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-all"
          >
            <Plus className="w-4 h-4" />
            Add Domain
          </button>
        </div>
      </div>

      {/* Info box */}
      <div className="mb-6 p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl">
        <h4 className="text-sm font-semibold text-amber-300 mb-2 flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          Important: Gateway or Mail Processor Required
        </h4>
        <p className="text-sm text-gray-400">
          AI Maestro manages email <strong className="text-gray-200">identity</strong> only.
          To actually send and receive emails, you need to configure an{' '}
          <strong className="text-gray-200">email gateway or mail processor</strong> that
          routes inbound/outbound mail for these domains to your agents.
        </p>
      </div>

      {/* Error message */}
      {error && (
        <div className="flex items-center gap-2 p-4 mb-6 bg-red-500/10 border border-red-500/30 rounded-lg text-red-300">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto hover:text-red-200">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Loading state */}
      {loading ? (
        <div className="flex items-center justify-center p-12 bg-gray-800/50 rounded-xl border border-gray-700">
          <RefreshCw className="w-6 h-6 text-gray-400 animate-spin" />
          <span className="ml-3 text-gray-400">Loading domains...</span>
        </div>
      ) : domains.length === 0 ? (
        /* Empty state */
        <div className="text-center p-12 bg-gray-800/50 rounded-xl border border-gray-700">
          <div className="w-16 h-16 rounded-full bg-blue-500/10 flex items-center justify-center mx-auto mb-4">
            <Globe className="w-8 h-8 text-blue-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-200 mb-2">No domains configured</h3>
          <p className="text-gray-400 mb-6 max-w-md mx-auto">
            Add domains that you control to create agent email addresses.
            For example: <code className="text-blue-300">23smartagents.com</code>
          </p>
          <button
            onClick={() => setShowCreateDialog(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-all"
          >
            <Plus className="w-4 h-4" />
            Add Your First Domain
          </button>
        </div>
      ) : (
        /* Domain list */
        <div className="space-y-3">
          {domains.map((domain) => (
            <div
              key={domain.id}
              className="bg-gray-800/50 rounded-xl border border-gray-700 hover:border-gray-600 transition-all overflow-hidden"
            >
              <div className="p-5">
                <div className="flex items-start gap-4">
                  {/* Icon */}
                  <div className={`w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    domain.isDefault ? 'bg-yellow-500/10' : 'bg-blue-500/10'
                  }`}>
                    {domain.isDefault ? (
                      <Star className="w-6 h-6 text-yellow-400 fill-yellow-400" />
                    ) : (
                      <Globe className="w-6 h-6 text-blue-400" />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <span className="font-mono text-lg text-gray-100">{domain.domain}</span>
                      {domain.isDefault && (
                        <span className="px-2 py-0.5 text-xs bg-yellow-500/20 text-yellow-400 rounded">
                          default
                        </span>
                      )}
                    </div>

                    {domain.description && (
                      <p className="text-sm text-gray-400 mb-2">{domain.description}</p>
                    )}

                    <div className="text-xs text-gray-500">
                      Added {formatDate(domain.createdAt)}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    {!domain.isDefault && (
                      <button
                        onClick={() => handleSetDefault(domain.id)}
                        className="p-2 rounded-lg hover:bg-gray-700 text-gray-400 hover:text-yellow-400 transition-all"
                        title="Set as default"
                      >
                        <StarOff className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(domain.id)}
                      className="p-2 rounded-lg hover:bg-gray-700 text-gray-400 hover:text-red-400 transition-all"
                      title="Delete domain"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Dialog */}
      {showCreateDialog && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-lg mx-4 shadow-2xl">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <Globe className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-100">Add Email Domain</h3>
                <p className="text-sm text-gray-400">Add a domain you control for agent emails</p>
              </div>
            </div>

            {/* Error in dialog */}
            {error && (
              <div className="flex items-center gap-2 p-3 mb-4 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-300">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="space-y-4">
              {/* Domain */}
              <div>
                <label className="text-xs font-medium text-gray-400 mb-2 block">
                  Domain *
                </label>
                <input
                  type="text"
                  value={newDomain}
                  onChange={(e) => setNewDomain(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newDomain.trim()) handleCreate()
                    if (e.key === 'Escape') {
                      setShowCreateDialog(false)
                      setError(null)
                    }
                  }}
                  placeholder="example.com"
                  className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-3 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-mono"
                  autoFocus
                />
                <p className="text-xs text-gray-500 mt-1">
                  Enter a domain you own and can configure email routing for
                </p>
              </div>

              {/* Description */}
              <div>
                <label className="text-xs font-medium text-gray-400 mb-2 block">
                  Description (optional)
                </label>
                <input
                  type="text"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="e.g., Primary domain for customer-facing agents"
                  className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-3 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                />
              </div>

              {/* Set as Default */}
              <label className="flex items-center gap-3 cursor-pointer group">
                <div
                  className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                    newIsDefault
                      ? 'bg-blue-600 border-blue-600'
                      : 'border-gray-600 group-hover:border-gray-500'
                  }`}
                  onClick={() => setNewIsDefault(!newIsDefault)}
                >
                  {newIsDefault && <Check className="w-3 h-3 text-white" />}
                </div>
                <span className="text-sm text-gray-300">Set as default domain</span>
              </label>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowCreateDialog(false)
                  setNewDomain('')
                  setNewDescription('')
                  setNewIsDefault(false)
                  setError(null)
                }}
                className="flex-1 px-4 py-2 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!newDomain.trim() || saving}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
              >
                {saving ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Adding...
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    Add Domain
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
