'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Lock, X } from 'lucide-react'

interface GovernancePasswordDialogProps {
  isOpen: boolean
  onClose: () => void
  mode: 'setup' | 'confirm'
  onPasswordConfirmed: (password: string) => void
}

export default function GovernancePasswordDialog({
  isOpen,
  onClose,
  mode,
  onPasswordConfirmed,
}: GovernancePasswordDialogProps) {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleClose = () => {
    if (submitting) return
    onClose()
    // Reset state on close
    setPassword('')
    setConfirmPassword('')
    setError(null)
  }

  const handleSubmit = async () => {
    setError(null)

    if (mode === 'setup') {
      // Validate password length
      if (password.length < 6) {
        setError('Password must be at least 6 characters')
        return
      }
      // Validate passwords match
      if (password !== confirmPassword) {
        setError('Passwords do not match')
        return
      }

      setSubmitting(true)
      try {
        // Set the governance password via API
        const res = await fetch('/api/governance/password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password }),
        })
        if (!res.ok) {
          const body = await res.text()
          throw new Error(body || `Failed to set password (${res.status})`)
        }
        onPasswordConfirmed(password)
        // Reset state after successful submission
        setPassword('')
        setConfirmPassword('')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to set password')
      } finally {
        setSubmitting(false)
      }
    } else {
      // Confirm mode: pass the password back to the caller for server-side validation
      onPasswordConfirmed(password)
      setPassword('')
    }
  }

  // Determine whether the submit button should be disabled
  const isSubmitDisabled =
    submitting ||
    password.length === 0 ||
    (mode === 'setup' && (confirmPassword.length === 0 || password !== confirmPassword || password.length < 6))

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-md overflow-hidden"
      >
        {/* Header */}
        <div className="bg-emerald-500/10 border-b border-emerald-500/20 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                <Lock className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-emerald-300">
                  {mode === 'setup' ? 'Set Governance Password' : 'Enter Governance Password'}
                </h3>
                {mode === 'setup' && (
                  <p className="text-sm text-gray-400">Required for role management operations</p>
                )}
              </div>
            </div>
            <button
              onClick={handleClose}
              className="p-2 rounded-lg hover:bg-gray-800 transition-all text-gray-400 hover:text-gray-200"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {mode === 'setup' && (
            <p className="text-sm text-gray-400">
              A governance password protects sensitive operations like assigning the MANAGER role or Chief-of-Staff positions.
            </p>
          )}

          {/* Password field */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              {mode === 'setup' ? 'New Password' : 'Password'}
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                setError(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !isSubmitDisabled) handleSubmit()
              }}
              placeholder={mode === 'setup' ? 'Minimum 6 characters' : 'Enter governance password'}
              className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all"
              autoFocus
            />
          </div>

          {/* Confirm password field (setup mode only) */}
          {mode === 'setup' && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Confirm Password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value)
                  setError(null)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !isSubmitDisabled) handleSubmit()
                }}
                placeholder="Re-enter password"
                className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all"
              />
            </div>
          )}

          {/* Error message */}
          {error && (
            <p className="text-sm text-red-400">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-800 px-6 py-4 flex items-center justify-end gap-3">
          <button
            onClick={handleClose}
            disabled={submitting}
            className="px-4 py-2 text-sm text-gray-400 hover:text-gray-300 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitDisabled}
            className="px-4 py-2 text-sm bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
          >
            {submitting ? 'Saving...' : mode === 'setup' ? 'Set Password' : 'Confirm'}
          </button>
        </div>
      </motion.div>
    </div>
  )
}
