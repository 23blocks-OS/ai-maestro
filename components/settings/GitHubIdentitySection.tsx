'use client'

import { useState, useEffect, useCallback } from 'react'
import { Github, User, Shield, AlertTriangle, Check, RefreshCw } from 'lucide-react'

interface GitHubAuth {
  username: string
  scopes: string[]
  accounts?: string[]
}

export default function GitHubIdentitySection() {
  const [auth, setAuth] = useState<GitHubAuth | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchAuth = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/github/auth')
      if (!res.ok) throw new Error('Not authenticated')
      const data = await res.json()
      setAuth(data)
    } catch {
      setAuth(null)
      setError('GitHub CLI not authenticated. Run: gh auth login')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAuth() }, [fetchAuth])

  const hasProjectScope = auth?.scopes?.includes('project') ?? false

  if (loading) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="flex items-center gap-3 mb-2">
          <Github className="w-6 h-6 text-gray-400" />
          <h1 className="text-2xl font-bold text-white">GitHub Identity</h1>
        </div>
        <div className="mt-4 text-sm text-gray-500">Loading...</div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-2">
        <Github className="w-6 h-6 text-blue-400" />
        <h1 className="text-2xl font-bold text-white">GitHub Identity</h1>
      </div>
      <p className="text-gray-400 mb-6">
        GitHub authentication status and account management.
      </p>

      {error ? (
        <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-lg font-semibold text-white mb-1">Not Authenticated</h3>
              <p className="text-sm text-gray-400 mb-3">
                Run the following command in your terminal to authenticate:
              </p>
              <code className="block bg-gray-800 text-green-400 px-3 py-2 rounded text-sm font-mono">
                gh auth login
              </code>
              <button onClick={fetchAuth} className="mt-4 flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 transition-colors">
                <RefreshCw className="w-4 h-4" /> Retry
              </button>
            </div>
          </div>
        </div>
      ) : auth && (
        <div className="space-y-4">
          {/* Active Account */}
          <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-5">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                <User className="w-6 h-6 text-blue-400" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-semibold text-white">{auth.username}</h3>
                <p className="text-sm text-gray-400">Active GitHub account</p>
              </div>
              {auth.accounts && auth.accounts.length > 1 && (
                <button onClick={fetchAuth} className="px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors">
                  Switch Account
                </button>
              )}
            </div>
          </div>

          {/* Scopes */}
          <div className={`rounded-xl border p-5 ${hasProjectScope ? 'border-green-500/30 bg-green-500/10' : 'border-yellow-500/30 bg-yellow-500/10'}`}>
            <div className="flex items-start gap-4">
              <div className={`w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 ${hasProjectScope ? 'bg-green-500/20' : 'bg-yellow-500/20'}`}>
                <Shield className={`w-6 h-6 ${hasProjectScope ? 'text-green-400' : 'text-yellow-400'}`} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-semibold text-white">Scopes</h3>
                <div className="flex flex-wrap gap-2 mt-2">
                  {auth.scopes.map((scope) => (
                    <span key={scope} className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-800 text-gray-300 rounded text-xs font-mono">
                      <Check className="w-3 h-3 text-green-400" /> {scope}
                    </span>
                  ))}
                </div>
                {!hasProjectScope && (
                  <div className="flex items-start gap-2 mt-3 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                    <AlertTriangle className="w-4 h-4 text-yellow-500 flex-shrink-0 mt-0.5" />
                    <div className="text-xs text-yellow-400">
                      <span className="font-medium">Missing <code>project</code> scope.</span> Run in terminal:
                      <code className="block mt-1 text-green-400">gh auth refresh -s project</code>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Refresh */}
          <button onClick={fetchAuth} className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors">
            <RefreshCw className="w-4 h-4" /> Refresh Status
          </button>
        </div>
      )}
    </div>
  )
}
