'use client'

import { useState } from 'react'
import { Building2, Users, Globe, ArrowRight, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'

interface OrganizationSetupProps {
  onComplete: () => void
  onSkip?: () => void
}

/**
 * Organization Setup Component
 *
 * Full-screen modal for setting the organization/network name on first install.
 * The organization name becomes the tenant identifier in AMP addresses.
 *
 * Features:
 * - Real-time validation with clear feedback
 * - Examples and guidance
 * - Explains what organization name is used for
 */
export default function OrganizationSetup({ onComplete, onSkip }: OrganizationSetupProps) {
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [validationState, setValidationState] = useState<'idle' | 'valid' | 'invalid'>('idle')

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

  const handleSubmit = async (e: React.FormEvent) => {
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

  return (
    <div className="fixed inset-0 bg-gray-950 flex items-center justify-center p-4 z-50">
      <div className="w-full max-w-lg">
        {/* Logo/Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl mb-4 shadow-lg shadow-blue-500/20">
            <Building2 className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Welcome to AI Maestro</h1>
          <p className="text-gray-400">Let&apos;s set up your organization</p>
        </div>

        {/* Main Card */}
        <div className="bg-gray-900 rounded-2xl border border-gray-800 p-8 shadow-xl">
          <form onSubmit={handleSubmit}>
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
                  <p className="text-xs text-gray-500">All machines in your network will share this organization name</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 bg-gray-800/30 rounded-lg">
                <Globe className="w-5 h-5 text-purple-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm text-gray-300">Permanent Choice</p>
                  <p className="text-xs text-gray-500">This name cannot be changed once set. New hosts will automatically adopt it.</p>
                </div>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting || validationState !== 'valid'}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-medium rounded-xl hover:from-blue-500 hover:to-purple-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-500/20"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Setting up...
                </>
              ) : (
                <>
                  Continue
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

        {/* Skip Option (if provided) */}
        {onSkip && (
          <div className="text-center mt-4">
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
