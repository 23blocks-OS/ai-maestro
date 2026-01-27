'use client'

import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import {
  Mail, X, AlertCircle, Check, Plus, RefreshCw,
  Globe, ChevronDown, AlertTriangle
} from 'lucide-react'
import type { EmailDomain } from '@/types/agent'

interface EmailAddressDialogProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (address: string, displayName?: string) => Promise<void>
  hostUrl?: string
}

export default function EmailAddressDialog({
  isOpen,
  onClose,
  onSubmit,
  hostUrl
}: EmailAddressDialogProps) {
  const baseUrl = hostUrl || ''

  // Form state
  const [localPart, setLocalPart] = useState('')
  const [selectedDomainId, setSelectedDomainId] = useState<string | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Domain state
  const [domains, setDomains] = useState<EmailDomain[]>([])
  const [loadingDomains, setLoadingDomains] = useState(true)
  const [showDomainDropdown, setShowDomainDropdown] = useState(false)

  // Inline domain creation
  const [showAddDomain, setShowAddDomain] = useState(false)
  const [newDomainName, setNewDomainName] = useState('')
  const [addingDomain, setAddingDomain] = useState(false)

  // Fetch domains
  const fetchDomains = async () => {
    setLoadingDomains(true)
    try {
      const response = await fetch(`${baseUrl}/api/domains`)
      if (response.ok) {
        const data = await response.json()
        const domainList = data.domains || []
        setDomains(domainList)

        // Select default domain or first one
        if (domainList.length > 0 && !selectedDomainId) {
          const defaultDomain = domainList.find((d: EmailDomain) => d.isDefault) || domainList[0]
          setSelectedDomainId(defaultDomain.id)
        }
      }
    } catch (err) {
      console.error('Failed to fetch domains:', err)
    } finally {
      setLoadingDomains(false)
    }
  }

  useEffect(() => {
    if (isOpen) {
      fetchDomains()
      // Reset form
      setLocalPart('')
      setDisplayName('')
      setError(null)
      setShowAddDomain(false)
      setNewDomainName('')
    }
  }, [isOpen])

  // Get selected domain object
  const selectedDomain = domains.find(d => d.id === selectedDomainId)

  // Handle inline domain creation
  const handleAddDomain = async () => {
    if (!newDomainName.trim()) return

    setAddingDomain(true)
    setError(null)
    try {
      const response = await fetch(`${baseUrl}/api/domains`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: newDomainName.trim() }),
      })

      if (response.ok) {
        const data = await response.json()
        // Refresh domains and select the new one
        await fetchDomains()
        setSelectedDomainId(data.domain.id)
        setShowAddDomain(false)
        setNewDomainName('')
      } else {
        const err = await response.json()
        setError(err.error || 'Failed to add domain')
      }
    } catch (err) {
      setError('Failed to connect to server')
    } finally {
      setAddingDomain(false)
    }
  }

  // Handle form submission
  const handleSubmit = async () => {
    if (!localPart.trim() || !selectedDomain) {
      setError('Please enter an email name and select a domain')
      return
    }

    // Validate local part (basic check)
    const localPartRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+$/
    if (!localPartRegex.test(localPart.trim())) {
      setError('Invalid email name. Use letters, numbers, and common symbols.')
      return
    }

    const fullAddress = `${localPart.trim()}@${selectedDomain.domain}`

    setSaving(true)
    setError(null)
    try {
      await onSubmit(fullAddress, displayName.trim() || undefined)
      onClose()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to add email address'
      setError(message)
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  // Use portal to render outside sidebar container
  if (typeof document === 'undefined') return null

  return createPortal(
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-purple-500/10 flex items-center justify-center">
              <Mail className="w-6 h-6 text-purple-400" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-100">Add Email Address</h2>
              <p className="text-sm text-gray-400">Register an email identity for this agent</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-gray-200 transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Gateway Warning */}
          <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-semibold text-amber-300 mb-1">Identity Only</h4>
                <p className="text-sm text-gray-400">
                  This registers the email address as an identity. To actually send and receive emails,
                  you need to configure an <strong className="text-gray-200">email gateway or mail processor</strong> that
                  routes inbound/outbound mail for this domain to your agents.
                </p>
              </div>
            </div>
          </div>

          {/* Error message */}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-300">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
              <button onClick={() => setError(null)} className="ml-auto hover:text-red-200">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Email Address Input */}
          <div>
            <label className="text-sm font-medium text-gray-300 mb-3 block">
              Email Address
            </label>
            <div className="flex gap-2">
              {/* Local part */}
              <div className="flex-1">
                <input
                  type="text"
                  value={localPart}
                  onChange={(e) => setLocalPart(e.target.value.toLowerCase())}
                  placeholder="agent-name"
                  className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-3 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all font-mono"
                  autoFocus
                />
              </div>

              {/* @ symbol */}
              <div className="flex items-center px-2 text-gray-400 text-lg font-mono">
                @
              </div>

              {/* Domain selector */}
              <div className="relative w-64">
                {loadingDomains ? (
                  <div className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-3 text-gray-500 flex items-center gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Loading...
                  </div>
                ) : domains.length === 0 ? (
                  <button
                    type="button"
                    onClick={() => setShowAddDomain(true)}
                    className="w-full bg-gray-800 border border-dashed border-gray-600 rounded-lg px-4 py-3 text-gray-400 hover:border-purple-500 hover:text-purple-400 transition-all flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    Add Domain
                  </button>
                ) : (
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setShowDomainDropdown(!showDomainDropdown)}
                      className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-3 text-left text-gray-100 font-mono flex items-center justify-between hover:border-gray-500 transition-all"
                    >
                      <span>{selectedDomain?.domain || 'Select domain'}</span>
                      <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${showDomainDropdown ? 'rotate-180' : ''}`} />
                    </button>

                    {/* Dropdown */}
                    {showDomainDropdown && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-xl z-10 overflow-hidden">
                        {domains.map((domain) => (
                          <button
                            key={domain.id}
                            type="button"
                            onClick={() => {
                              setSelectedDomainId(domain.id)
                              setShowDomainDropdown(false)
                            }}
                            className={`w-full px-4 py-2.5 text-left font-mono text-sm flex items-center justify-between hover:bg-gray-700 transition-all ${
                              domain.id === selectedDomainId ? 'bg-purple-500/20 text-purple-300' : 'text-gray-200'
                            }`}
                          >
                            <span>{domain.domain}</span>
                            {domain.isDefault && (
                              <span className="text-xs text-yellow-400">default</span>
                            )}
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() => {
                            setShowAddDomain(true)
                            setShowDomainDropdown(false)
                          }}
                          className="w-full px-4 py-2.5 text-left text-sm flex items-center gap-2 text-purple-400 hover:bg-gray-700 border-t border-gray-700 transition-all"
                        >
                          <Plus className="w-4 h-4" />
                          Add new domain...
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Preview */}
            {localPart && selectedDomain && (
              <div className="mt-3 text-sm text-gray-400">
                Preview: <span className="font-mono text-purple-300">{localPart}@{selectedDomain.domain}</span>
              </div>
            )}
          </div>

          {/* Inline Add Domain */}
          {showAddDomain && (
            <div className="p-4 bg-gray-800/50 border border-gray-700 rounded-xl">
              <div className="flex items-center gap-2 mb-3">
                <Globe className="w-4 h-4 text-blue-400" />
                <span className="text-sm font-medium text-gray-200">Add New Domain</span>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newDomainName}
                  onChange={(e) => setNewDomainName(e.target.value.toLowerCase())}
                  placeholder="example.com"
                  className="flex-1 bg-gray-800 border border-gray-600 rounded-lg px-4 py-2 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-mono text-sm"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newDomainName.trim()) handleAddDomain()
                    if (e.key === 'Escape') setShowAddDomain(false)
                  }}
                />
                <button
                  type="button"
                  onClick={handleAddDomain}
                  disabled={!newDomainName.trim() || addingDomain}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
                >
                  {addingDomain ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddDomain(false)
                    setNewDomainName('')
                  }}
                  className="px-3 py-2 bg-gray-700 text-gray-300 rounded-lg text-sm hover:bg-gray-600 transition-all"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Make sure you own this domain and can configure email routing for it.
              </p>
            </div>
          )}

          {/* Display Name */}
          <div>
            <label className="text-sm font-medium text-gray-300 mb-2 block">
              Display Name <span className="text-gray-500">(optional)</span>
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Friendly name for this address"
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-3 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 p-6 border-t border-gray-800 bg-gray-900/50">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 transition-all font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!localPart.trim() || !selectedDomain || saving}
            className="flex-1 px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium flex items-center justify-center gap-2"
          >
            {saving ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Adding...
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" />
                Add Email Address
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
