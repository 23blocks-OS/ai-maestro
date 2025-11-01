'use client'

import { useState, useEffect } from 'react'
import { AlertCircle, ArrowRight, CheckCircle, Loader2, X } from 'lucide-react'

interface MigrationStatus {
  needsMigration: boolean
  sessionCount: number
  agentCount: number
  migratedCount: number
}

export default function MigrationBanner() {
  const [status, setStatus] = useState<MigrationStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [migrating, setMigrating] = useState(false)
  const [migrationComplete, setMigrationComplete] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    checkMigrationStatus()
  }, [])

  const checkMigrationStatus = async () => {
    try {
      const response = await fetch('/api/agents/migrate')
      if (response.ok) {
        const data = await response.json()
        setStatus(data)
      }
    } catch (err) {
      console.error('Failed to check migration status:', err)
    } finally {
      setLoading(false)
    }
  }

  const runMigration = async () => {
    setMigrating(true)
    setError(null)

    try {
      const response = await fetch('/api/agents/migrate', {
        method: 'POST'
      })

      const data = await response.json()

      if (response.ok || response.status === 207) {
        setMigrationComplete(true)
        // Refresh status after migration
        await checkMigrationStatus()

        // Auto-refresh page after 2 seconds to show new agents
        setTimeout(() => {
          window.location.reload()
        }, 2000)
      } else {
        setError(data.error || 'Migration failed')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Migration failed')
    } finally {
      setMigrating(false)
    }
  }

  const handleDismiss = () => {
    setDismissed(true)
    // Store dismissal in localStorage so it doesn't reappear immediately
    localStorage.setItem('migration-banner-dismissed', 'true')
  }

  // Don't show banner if loading, dismissed, or migration not needed
  if (loading || dismissed || !status?.needsMigration) {
    return null
  }

  // Check if user previously dismissed
  if (typeof window !== 'undefined' && localStorage.getItem('migration-banner-dismissed') === 'true') {
    return null
  }

  // Success state
  if (migrationComplete) {
    return (
      <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 mx-4 mt-4 flex items-start gap-3">
        <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-green-300 mb-1">
            Migration Complete! 🎉
          </h3>
          <p className="text-sm text-green-200/80">
            Successfully migrated {status.sessionCount} sessions to agents. Refreshing page...
          </p>
        </div>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mx-4 mt-4 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-red-300 mb-1">
            Migration Failed
          </h3>
          <p className="text-sm text-red-200/80 mb-3">{error}</p>
          <button
            onClick={() => setError(null)}
            className="text-sm text-red-300 hover:text-red-200 underline"
          >
            Try Again
          </button>
        </div>
        <button
          onClick={handleDismiss}
          className="text-red-400 hover:text-red-300 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    )
  }

  // Main migration prompt
  return (
    <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 mx-4 mt-4 flex items-start gap-3">
      <AlertCircle className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
      <div className="flex-1">
        <h3 className="text-sm font-semibold text-blue-300 mb-1">
          Upgrade to Agent-Centric Architecture
        </h3>
        <p className="text-sm text-blue-200/80 mb-3">
          AI Maestro v0.7.0 introduces agents as first-class citizens! Migrate your {status.sessionCount} session{status.sessionCount !== 1 ? 's' : ''} to unlock:
        </p>
        <ul className="text-sm text-blue-200/80 space-y-1 mb-4 ml-4">
          <li className="flex items-center gap-2">
            <span className="w-1 h-1 rounded-full bg-blue-400" />
            Agent profiles with metadata & metrics
          </li>
          <li className="flex items-center gap-2">
            <span className="w-1 h-1 rounded-full bg-blue-400" />
            Deployment tracking (local/cloud)
          </li>
          <li className="flex items-center gap-2">
            <span className="w-1 h-1 rounded-full bg-blue-400" />
            Enhanced message system
          </li>
        </ul>
        <div className="flex items-center gap-3">
          <button
            onClick={runMigration}
            disabled={migrating}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 text-white text-sm font-medium rounded-lg transition-all shadow-lg hover:shadow-blue-500/25"
          >
            {migrating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Migrating...
              </>
            ) : (
              <>
                Migrate Now
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
          <button
            onClick={handleDismiss}
            disabled={migrating}
            className="text-sm text-blue-300 hover:text-blue-200 transition-colors disabled:opacity-50"
          >
            Remind me later
          </button>
        </div>
        <p className="text-xs text-blue-300/60 mt-3">
          Migration is safe and non-destructive. Your sessions will continue to work as before.
        </p>
      </div>
      <button
        onClick={handleDismiss}
        disabled={migrating}
        className="text-blue-400 hover:text-blue-300 transition-colors disabled:opacity-50"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}
