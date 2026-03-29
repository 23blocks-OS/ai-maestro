'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Lock, X } from 'lucide-react'

interface GovernancePasswordDialogProps {
  isOpen: boolean
  onClose: () => void
  mode: 'setup' | 'confirm'
  onPasswordConfirmed: (password: string) => void | Promise<void>
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

  // Defensive: reset on close AND on open to cover all paths (NT-016)
  // The useEffect below resets on open; handleClose resets on close. Both are intentional
  // to guard against edge cases where one path is skipped (e.g., unmount without close).
  useEffect(() => {
    if (isOpen) {
      setPassword('')
      setConfirmPassword('')
      setError(null)
      setSubmitting(false) // Reset submitting state so dialog is never stuck in a disabled state
    }
  }, [isOpen])

  // Close handler wrapped in useCallback to avoid stale closures in the Escape key effect
  const handleClose = useCallback(() => {
    if (submitting) return
    onClose()
    // Reset state on close
    setPassword('')
    setConfirmPassword('')
    setError(null)
  }, [submitting, onClose, setPassword, setConfirmPassword, setError])

  // Close dialog on Escape key press, with handleClose and submitting in deps to avoid stale captures
  useEffect(() => {
    if (!isOpen) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) handleClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [isOpen, submitting, handleClose])

  const handleSubmit = async () => {
    if (submitting) return // Guard against double-click firing multiple submissions
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
          // NT-011: Parse JSON safely and extract .error field for structured error messages
          const body = await res.json().catch(() => null)
          throw new Error(body?.error || `Failed to set password (${res.status})`)
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
      // Wrapped in try/catch with submitting state to match setup mode's error handling pattern (CC-002)
      // CC-P1-705: Guard against empty password even if button state is bypassed programmatically
      if (password.length === 0) { setError('Password is required'); return }
      setSubmitting(true)
      try {
        await onPasswordConfirmed?.(password)
        setPassword('')
        // Close the dialog after successful confirmation so it does not stay open
        onClose()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Confirmation failed')
      } finally {
        setSubmitting(false)
      }
    }
  }

  // Determine whether the submit button should be disabled
  const isSubmitDisabled =
    submitting ||
    password.length === 0 ||
    (mode === 'setup' && (confirmPassword.length === 0 || password !== confirmPassword || password.length < 6))

  return (
    <AnimatePresence>
      {isOpen && (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[70] flex items-center justify-center p-4" onClick={handleClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-md overflow-hidden"
        onClick={(e) => e.stopPropagation()}
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
              A governance password protects sensitive operations like assigning the MANAGER title or Chief-of-Staff positions.
            </p>
          )}

          {/* Password field */}
          <div>
            <label htmlFor="governance-password" className="block text-sm font-medium text-gray-300 mb-2">
              {mode === 'setup' ? 'New Password' : 'Password'}
            </label>
            <input
              id="governance-password"
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                setError(null)
              }}
              // CC-015: No stale closure risk -- React inline event handlers always capture the
              // latest render's closure, so `password`, `isSubmitDisabled`, and `handleSubmit`
              // are always current without needing useCallback or a dependency array.
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !isSubmitDisabled) handleSubmit()
              }}
              placeholder={mode === 'setup' ? 'Minimum 6 characters' : 'Enter governance password'}
              autoComplete={mode === 'setup' ? 'new-password' : 'current-password'}
              className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all"
              autoFocus
            />
          </div>

          {/* Confirm password field (setup mode only) */}
          {mode === 'setup' && (
            <div>
              <label htmlFor="governance-confirm-password" className="block text-sm font-medium text-gray-300 mb-2">
                Confirm Password
              </label>
              <input
                id="governance-confirm-password"
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
                autoComplete="new-password"
                className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all"
              />
            </div>
          )}

          {/* Error message */}
          {error && (
            <p className="text-sm text-red-400">{error}</p>
          )}

          {/* Forgot password hint — only in confirm mode */}
          {mode === 'confirm' && (
            <p className="text-xs text-gray-500">
              Forgotten password? Reset it locally by running:{' '}
              <code className="text-gray-400 bg-gray-800 px-1 py-0.5 rounded text-[10px]">
                curl -X POST http://localhost:23000/api/governance/password -H &quot;Content-Type: application/json&quot; -d &apos;{'{'}&#34;password&#34;:&#34;new-password&#34;{'}'}&apos;
              </code>
            </p>
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
      )}
    </AnimatePresence>
  )
}
