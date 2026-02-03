'use client'

import { useState } from 'react'
import { Building2, Users, Globe, ArrowRight, AlertCircle, CheckCircle2, Loader2, Plus, UserPlus, ArrowLeft, Server, Link2 } from 'lucide-react'

interface OrganizationSetupProps {
  onComplete: () => void
  onSkip?: () => void
}

type SetupMode = 'choose' | 'create' | 'join'

interface JoinResult {
  organization: string
  hostId: string
  hostName: string
}

/**
 * Organization Setup Component
 *
 * Full-screen modal for setting up the organization/network on first install.
 * Offers two paths:
 * 1. Create new network - Set your own organization name (you're the first host)
 * 2. Join existing network - Connect to an existing host and adopt their organization
 *
 * The organization name becomes the tenant identifier in AMP addresses.
 */
export default function OrganizationSetup({ onComplete, onSkip }: OrganizationSetupProps) {
  const [mode, setMode] = useState<SetupMode>('choose')

  // Create mode state
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [validationState, setValidationState] = useState<'idle' | 'valid' | 'invalid'>('idle')

  // Join mode state
  const [hostUrl, setHostUrl] = useState('')
  const [isConnecting, setIsConnecting] = useState(false)
  const [joinResult, setJoinResult] = useState<JoinResult | null>(null)

  // Validation regex: 1-63 chars, lowercase alphanumeric + hyphens, starts with letter
  const ORGANIZATION_REGEX = /^[a-z][a-z0-9-]{0,61}[a-z0-9]$|^[a-z]$/

  const validateName = (value: string): { valid: boolean; error?: string } => {
    if (!value) {
      return { valid: false }
    }

    const normalized = value.toLowerCase().trim()

    if (normalized.length < 1) {
      return { valid: false, error: 'Organization name is required' }
    }

    if (normalized.length > 63) {
      return { valid: false, error: 'Name must be 63 characters or less' }
    }

    if (!/^[a-z]/.test(normalized)) {
      return { valid: false, error: 'Must start with a letter' }
    }

    if (/[^a-z0-9-]/.test(normalized)) {
      return { valid: false, error: 'Only lowercase letters, numbers, and hyphens allowed' }
    }

    if (normalized.endsWith('-')) {
      return { valid: false, error: 'Cannot end with a hyphen' }
    }

    if (!ORGANIZATION_REGEX.test(normalized)) {
      return { valid: false, error: 'Invalid format' }
    }

    return { valid: true }
  }

  const handleInputChange = (value: string) => {
    // Only allow lowercase letters, numbers, and hyphens
    const filtered = value.toLowerCase().replace(/[^a-z0-9-]/g, '')
    setName(filtered)
    setError(null)

    if (filtered) {
      const validation = validateName(filtered)
      setValidationState(validation.valid ? 'valid' : 'invalid')
      if (!validation.valid && validation.error) {
        setError(validation.error)
      }
    } else {
      setValidationState('idle')
    }
  }

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const validation = validateName(name)
    if (!validation.valid) {
      setError(validation.error || 'Invalid organization name')
      setValidationState('invalid')
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      const response = await fetch('/api/organization', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organization: name.toLowerCase().trim() }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to set organization')
      }

      onComplete()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set organization')
      setValidationState('invalid')
    } finally {
      setIsSubmitting(false)
    }
  }

  const normalizeUrl = (url: string): string => {
    let normalized = url.trim()

    // Add protocol if missing
    if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
      normalized = `http://${normalized}`
    }

    // Remove trailing slash
    normalized = normalized.replace(/\/+$/, '')

    return normalized
  }

  const handleJoinConnect = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!hostUrl.trim()) {
      setError('Please enter a host URL')
      return
    }

    setIsConnecting(true)
    setError(null)
    setJoinResult(null)

    const normalizedUrl = normalizeUrl(hostUrl)

    try {
      // First, fetch the remote host's identity to get their organization
      const identityResponse = await fetch(`${normalizedUrl}/api/hosts/identity`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      })

      if (!identityResponse.ok) {
        const errorText = await identityResponse.text()
        throw new Error(`Could not connect to host: ${identityResponse.status} ${errorText}`)
      }

      const identity = await identityResponse.json()

      if (!identity.organization) {
        throw new Error('The remote host has not set up an organization yet. They need to create a network first.')
      }

      // Store the result for confirmation
      setJoinResult({
        organization: identity.organization,
        hostId: identity.id,
        hostName: identity.name || identity.id,
      })

    } catch (err) {
      console.error('[OrganizationSetup] Join connect error:', err)
      if (err instanceof TypeError && err.message.includes('fetch')) {
        setError('Could not reach the host. Please check the URL and ensure the host is running.')
      } else {
        setError(err instanceof Error ? err.message : 'Failed to connect to host')
      }
    } finally {
      setIsConnecting(false)
    }
  }

  const handleJoinConfirm = async () => {
    if (!joinResult) return

    setIsSubmitting(true)
    setError(null)

    const normalizedUrl = normalizeUrl(hostUrl)

    try {
      // 1. Set the organization locally (adopting from remote)
      const orgResponse = await fetch('/api/organization', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organization: joinResult.organization,
          setBy: joinResult.hostId, // Credit the original host
        }),
      })

      if (!orgResponse.ok) {
        const data = await orgResponse.json()
        throw new Error(data.error || 'Failed to adopt organization')
      }

      // 2. Add the remote host to our hosts list
      const addHostResponse = await fetch('/api/hosts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: normalizedUrl,
          name: joinResult.hostName,
        }),
      })

      if (!addHostResponse.ok) {
        // Don't fail completely - org was set, host can be added later
        console.warn('[OrganizationSetup] Failed to add host, but organization was set')
      }

      // 3. Trigger a sync with the new host to exchange peer information
      try {
        await fetch('/api/hosts/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetHostId: joinResult.hostId }),
        })
      } catch {
        // Sync failure is not critical
        console.warn('[OrganizationSetup] Initial sync failed, will retry automatically')
      }

      onComplete()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join network')
    } finally {
      setIsSubmitting(false)
    }
  }

  const getInputBorderClass = () => {
    switch (validationState) {
      case 'valid':
        return 'border-green-500 focus:border-green-500 focus:ring-green-500/20'
      case 'invalid':
        return 'border-red-500 focus:border-red-500 focus:ring-red-500/20'
      default:
        return 'border-gray-600 focus:border-blue-500 focus:ring-blue-500/20'
    }
  }

  const resetState = () => {
    setName('')
    setHostUrl('')
    setError(null)
    setValidationState('idle')
    setJoinResult(null)
  }

  const goBack = () => {
    resetState()
    setMode('choose')
  }

  // ========================================
  // RENDER: Choose Mode
  // ========================================
  if (mode === 'choose') {
    return (
      <div className="fixed inset-0 bg-gray-950 flex items-center justify-center p-4 z-50">
        <div className="w-full max-w-xl">
          {/* Logo/Brand */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl mb-4 shadow-lg shadow-blue-500/20">
              <Building2 className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">Welcome to AI Maestro</h1>
            <p className="text-gray-400">How would you like to get started?</p>
          </div>

          {/* Choice Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Create New Network */}
            <button
              onClick={() => { resetState(); setMode('create') }}
              className="group p-6 bg-gray-900 rounded-2xl border border-gray-800 hover:border-blue-500/50 transition-all text-left hover:shadow-lg hover:shadow-blue-500/10"
            >
              <div className="w-12 h-12 bg-blue-500/10 rounded-xl flex items-center justify-center mb-4 group-hover:bg-blue-500/20 transition-colors">
                <Plus className="w-6 h-6 text-blue-400" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">Create New Network</h3>
              <p className="text-sm text-gray-400 mb-4">
                Start fresh with your own organization name. You&apos;ll be the first host in the network.
              </p>
              <div className="flex items-center text-blue-400 text-sm font-medium">
                Get started
                <ArrowRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" />
              </div>
            </button>

            {/* Join Existing Network */}
            <button
              onClick={() => { resetState(); setMode('join') }}
              className="group p-6 bg-gray-900 rounded-2xl border border-gray-800 hover:border-purple-500/50 transition-all text-left hover:shadow-lg hover:shadow-purple-500/10"
            >
              <div className="w-12 h-12 bg-purple-500/10 rounded-xl flex items-center justify-center mb-4 group-hover:bg-purple-500/20 transition-colors">
                <UserPlus className="w-6 h-6 text-purple-400" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">Join Existing Network</h3>
              <p className="text-sm text-gray-400 mb-4">
                Connect to an existing host to join their network and adopt their organization.
              </p>
              <div className="flex items-center text-purple-400 text-sm font-medium">
                Connect
                <ArrowRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" />
              </div>
            </button>
          </div>

          {/* Skip Option */}
          {onSkip && (
            <div className="text-center mt-6">
              <button
                onClick={onSkip}
                className="text-sm text-gray-500 hover:text-gray-400 transition-colors"
              >
                Skip for now
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ========================================
  // RENDER: Create New Network
  // ========================================
  if (mode === 'create') {
    return (
      <div className="fixed inset-0 bg-gray-950 flex items-center justify-center p-4 z-50">
        <div className="w-full max-w-lg">
          {/* Back Button */}
          <button
            onClick={goBack}
            className="flex items-center gap-2 text-gray-400 hover:text-white mb-6 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>

          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-12 h-12 bg-blue-500/10 rounded-xl mb-4">
              <Plus className="w-6 h-6 text-blue-400" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">Create New Network</h1>
            <p className="text-gray-400">Choose a name for your organization</p>
          </div>

          {/* Main Card */}
          <div className="bg-gray-900 rounded-2xl border border-gray-800 p-8 shadow-xl">
            <form onSubmit={handleCreateSubmit}>
              {/* Input Section */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Organization Name
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => handleInputChange(e.target.value)}
                    placeholder="e.g., acme-corp"
                    className={`w-full px-4 py-3 bg-gray-800 border rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-4 transition-all ${getInputBorderClass()}`}
                    autoFocus
                    disabled={isSubmitting}
                    maxLength={63}
                  />
                  {validationState === 'valid' && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <CheckCircle2 className="w-5 h-5 text-green-500" />
                    </div>
                  )}
                </div>

                {/* Preview */}
                {name && validationState === 'valid' && (
                  <div className="mt-3 p-3 bg-gray-800/50 rounded-lg border border-gray-700">
                    <p className="text-xs text-gray-500 mb-1">Your agents will be addressed as:</p>
                    <p className="text-sm font-mono text-blue-400">
                      agent-name@<span className="text-green-400">{name.toLowerCase()}</span>.aimaestro.local
                    </p>
                  </div>
                )}

                {/* Error */}
                {error && (
                  <div className="mt-3 flex items-start gap-2 text-red-400">
                    <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <p className="text-sm">{error}</p>
                  </div>
                )}
              </div>

              {/* Info Cards */}
              <div className="space-y-3 mb-6">
                <div className="flex items-start gap-3 p-3 bg-gray-800/30 rounded-lg">
                  <Users className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm text-gray-300">Shared Identity</p>
                    <p className="text-xs text-gray-500">All machines joining your network will adopt this name</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 bg-gray-800/30 rounded-lg">
                  <Globe className="w-5 h-5 text-purple-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm text-gray-300">Permanent Choice</p>
                    <p className="text-xs text-gray-500">This name cannot be changed once set</p>
                  </div>
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isSubmitting || validationState !== 'valid'}
                className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-500 text-white font-medium rounded-xl hover:from-blue-500 hover:to-blue-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-500/20"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Creating network...
                  </>
                ) : (
                  <>
                    Create Network
                    <ArrowRight className="w-5 h-5" />
                  </>
                )}
              </button>
            </form>

            {/* Examples */}
            <div className="mt-6 pt-6 border-t border-gray-800">
              <p className="text-xs text-gray-500 mb-2">Examples of valid names:</p>
              <div className="flex flex-wrap gap-2">
                {['acme-corp', 'my-team', 'dev-lab', 'agents23'].map((example) => (
                  <button
                    key={example}
                    type="button"
                    onClick={() => handleInputChange(example)}
                    className="px-3 py-1 text-xs font-mono bg-gray-800 text-gray-400 rounded-lg hover:bg-gray-700 hover:text-gray-300 transition-colors"
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ========================================
  // RENDER: Join Existing Network
  // ========================================
  if (mode === 'join') {
    return (
      <div className="fixed inset-0 bg-gray-950 flex items-center justify-center p-4 z-50">
        <div className="w-full max-w-lg">
          {/* Back Button */}
          <button
            onClick={goBack}
            className="flex items-center gap-2 text-gray-400 hover:text-white mb-6 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>

          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-12 h-12 bg-purple-500/10 rounded-xl mb-4">
              <UserPlus className="w-6 h-6 text-purple-400" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">Join Existing Network</h1>
            <p className="text-gray-400">Connect to a host already in the network</p>
          </div>

          {/* Main Card */}
          <div className="bg-gray-900 rounded-2xl border border-gray-800 p-8 shadow-xl">
            {!joinResult ? (
              // Step 1: Enter host URL
              <form onSubmit={handleJoinConnect}>
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Host URL
                  </label>
                  <div className="relative">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2">
                      <Link2 className="w-5 h-5 text-gray-500" />
                    </div>
                    <input
                      type="text"
                      value={hostUrl}
                      onChange={(e) => { setHostUrl(e.target.value); setError(null) }}
                      placeholder="e.g., 192.168.1.100:23000"
                      className="w-full pl-11 pr-4 py-3 bg-gray-800 border border-gray-600 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-4 focus:border-purple-500 focus:ring-purple-500/20 transition-all"
                      autoFocus
                      disabled={isConnecting}
                    />
                  </div>
                  <p className="mt-2 text-xs text-gray-500">
                    Enter the URL of any AI Maestro host already in the network
                  </p>

                  {/* Error */}
                  {error && (
                    <div className="mt-3 flex items-start gap-2 text-red-400">
                      <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                      <p className="text-sm">{error}</p>
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex items-start gap-3 p-3 bg-gray-800/30 rounded-lg mb-6">
                  <Server className="w-5 h-5 text-purple-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm text-gray-300">What happens next?</p>
                    <p className="text-xs text-gray-500">
                      We&apos;ll connect to the host, fetch their organization name, and add them to your network.
                    </p>
                  </div>
                </div>

                {/* Connect Button */}
                <button
                  type="submit"
                  disabled={isConnecting || !hostUrl.trim()}
                  className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-purple-500 text-white font-medium rounded-xl hover:from-purple-500 hover:to-purple-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-purple-500/20"
                >
                  {isConnecting ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    <>
                      Connect
                      <ArrowRight className="w-5 h-5" />
                    </>
                  )}
                </button>
              </form>
            ) : (
              // Step 2: Confirm join
              <div>
                {/* Success State */}
                <div className="text-center mb-6">
                  <div className="inline-flex items-center justify-center w-12 h-12 bg-green-500/10 rounded-full mb-4">
                    <CheckCircle2 className="w-6 h-6 text-green-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-1">Connected!</h3>
                  <p className="text-sm text-gray-400">Found an existing network</p>
                </div>

                {/* Organization Details */}
                <div className="bg-gray-800/50 rounded-xl p-4 mb-6 border border-gray-700">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 bg-purple-500/10 rounded-lg flex items-center justify-center">
                      <Building2 className="w-5 h-5 text-purple-400" />
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Organization</p>
                      <p className="text-lg font-semibold text-white">{joinResult.organization}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-500/10 rounded-lg flex items-center justify-center">
                      <Server className="w-5 h-5 text-blue-400" />
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Host</p>
                      <p className="text-sm font-medium text-white">{joinResult.hostName}</p>
                    </div>
                  </div>
                </div>

                {/* Address Preview */}
                <div className="p-3 bg-gray-800/30 rounded-lg border border-gray-700 mb-6">
                  <p className="text-xs text-gray-500 mb-1">Your agents will be addressed as:</p>
                  <p className="text-sm font-mono text-blue-400">
                    agent-name@<span className="text-green-400">{joinResult.organization}</span>.aimaestro.local
                  </p>
                </div>

                {/* Error */}
                {error && (
                  <div className="mb-6 flex items-start gap-2 text-red-400">
                    <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <p className="text-sm">{error}</p>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex gap-3">
                  <button
                    onClick={() => setJoinResult(null)}
                    disabled={isSubmitting}
                    className="flex-1 px-4 py-3 bg-gray-800 text-gray-300 font-medium rounded-xl hover:bg-gray-700 transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleJoinConfirm}
                    disabled={isSubmitting}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-purple-600 to-purple-500 text-white font-medium rounded-xl hover:from-purple-500 hover:to-purple-400 transition-all disabled:opacity-50 shadow-lg shadow-purple-500/20"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Joining...
                      </>
                    ) : (
                      <>
                        Join Network
                        <ArrowRight className="w-5 h-5" />
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  return null
}
