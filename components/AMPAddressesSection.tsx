'use client'

import React, { useState, useEffect } from 'react'
import {
  Radio, Trash2, Star, StarOff, RefreshCw, X,
  ChevronDown, ChevronRight, AlertCircle
} from 'lucide-react'
import type { AMPAddress } from '@/types/agent'

interface AMPAddressesSectionProps {
  agentId: string
  hostUrl?: string
  isExpanded: boolean
  onToggle: () => void
}

export default function AMPAddressesSection({
  agentId,
  hostUrl,
  isExpanded,
  onToggle
}: AMPAddressesSectionProps) {
  const baseUrl = hostUrl || ''
  const [addresses, setAddresses] = useState<AMPAddress[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Fetch AMP addresses
  const fetchAddresses = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`${baseUrl}/api/agents/${agentId}/amp/addresses`)
      if (response.ok) {
        const data = await response.json()
        setAddresses(data.addresses || [])
      } else {
        const err = await response.json()
        setError(err.error || 'Failed to load AMP addresses')
      }
    } catch {
      setError('Failed to connect to server')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isExpanded && agentId) {
      fetchAddresses()
    }
  }, [isExpanded, agentId])

  // Remove AMP address
  const handleRemoveAddress = async (address: string) => {
    setSaving(true)
    setError(null)
    try {
      const encodedAddress = encodeURIComponent(address)
      const response = await fetch(
        `${baseUrl}/api/agents/${agentId}/amp/addresses/${encodedAddress}`,
        { method: 'DELETE' }
      )

      if (response.ok) {
        const data = await response.json()
        setAddresses(data.addresses || [])
      } else {
        const err = await response.json()
        setError(err.error || 'Failed to remove AMP address')
      }
    } catch {
      setError('Failed to connect to server')
    } finally {
      setSaving(false)
    }
  }

  // Set primary AMP address
  const handleSetPrimary = async (address: string) => {
    setSaving(true)
    setError(null)
    try {
      const encodedAddress = encodeURIComponent(address)
      const response = await fetch(
        `${baseUrl}/api/agents/${agentId}/amp/addresses/${encodedAddress}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ primary: true })
        }
      )

      if (response.ok) {
        const data = await response.json()
        setAddresses(data.addresses || [])
      } else {
        const err = await response.json()
        setError(err.error || 'Failed to update AMP address')
      }
    } catch {
      setError('Failed to connect to server')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section>
      {/* Section Header */}
      <button
        onClick={onToggle}
        className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-500 mb-4 hover:text-gray-400 transition-all w-full"
      >
        {isExpanded ? (
          <ChevronDown className="w-4 h-4" />
        ) : (
          <ChevronRight className="w-4 h-4" />
        )}
        <Radio className="w-4 h-4" />
        AMP Addresses
        {addresses.length > 0 && (
          <span className="ml-1 px-1.5 py-0.5 text-xs bg-blue-500/20 text-blue-400 rounded">
            {addresses.length}
          </span>
        )}
      </button>

      {isExpanded && (
        <div className="space-y-3">
          {/* Error message */}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-300">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
              <button
                onClick={() => setError(null)}
                className="ml-auto hover:text-red-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Loading state */}
          {loading ? (
            <div className="flex items-center gap-2 text-gray-400 text-sm p-4 bg-gray-800/50 rounded-lg">
              <RefreshCw className="w-4 h-4 animate-spin" />
              Loading AMP addresses...
            </div>
          ) : addresses.length === 0 ? (
            /* Empty state */
            <div className="p-4 bg-gray-800/50 rounded-lg border border-gray-700">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  <Radio className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <p className="text-sm text-gray-300 font-medium">No AMP addresses</p>
                  <p className="text-xs text-gray-500">
                    AMP addresses are assigned when the agent registers with a provider
                  </p>
                </div>
              </div>
            </div>
          ) : (
            /* AMP address list */
            <>
              {addresses.map((addr) => (
                <div
                  key={addr.address}
                  className="bg-gray-800/50 rounded-lg p-4 border border-gray-700 hover:border-gray-600 transition-all group"
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      addr.primary
                        ? 'bg-yellow-500/20'
                        : 'bg-blue-500/10'
                    }`}>
                      {addr.primary ? (
                        <Star className="w-5 h-5 text-yellow-400 fill-yellow-400" />
                      ) : (
                        <Radio className="w-5 h-5 text-blue-400" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-sm text-gray-100 truncate">
                          {addr.address}
                        </span>
                        {addr.primary && (
                          <span className="px-1.5 py-0.5 text-xs bg-yellow-500/20 text-yellow-400 rounded">
                            primary
                          </span>
                        )}
                        {/* Type badge */}
                        <span className={`px-1.5 py-0.5 text-xs rounded ${
                          addr.type === 'local'
                            ? 'bg-green-500/20 text-green-400'
                            : 'bg-blue-500/20 text-blue-400'
                        }`}>
                          {addr.type === 'local' ? 'LOCAL' : 'CLOUD'}
                        </span>
                      </div>
                      <div className="text-xs text-gray-400">
                        {addr.provider}
                        {addr.tenant && ` / ${addr.tenant}`}
                      </div>
                    </div>
                    {/* Actions */}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {!addr.primary && (
                        <button
                          onClick={() => handleSetPrimary(addr.address)}
                          disabled={saving}
                          className="p-2 rounded-lg hover:bg-gray-700 text-gray-400 hover:text-yellow-400 transition-all"
                          title="Set as primary"
                        >
                          <StarOff className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => handleRemoveAddress(addr.address)}
                        disabled={saving}
                        className="p-2 rounded-lg hover:bg-gray-700 text-gray-400 hover:text-red-400 transition-all"
                        title="Remove AMP address"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </section>
  )
}
