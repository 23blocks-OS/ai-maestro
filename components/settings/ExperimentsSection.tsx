'use client'

import { useState, useEffect, useCallback } from 'react'
import { FlaskConical, ToggleLeft, ToggleRight, AlertTriangle, Database, Settings } from 'lucide-react'

interface FeatureFlag {
  id: string
  name: string
  description: string
  storageKey: string
  icon: React.ComponentType<{ className?: string }>
  warning?: string
}

const FEATURE_FLAGS: FeatureFlag[] = [
  // Agent-Centric Sidebar has been promoted to production (v0.17.0+)
  // Add new experiments here as needed
]

export default function ExperimentsSection() {
  const [flags, setFlags] = useState<Record<string, boolean>>({})

  // Server-side settings
  const [indexerEnabled, setIndexerEnabled] = useState<boolean>(true)
  const [indexerLoading, setIndexerLoading] = useState(true)
  const [indexerSaving, setIndexerSaving] = useState(false)

  // Load initial state from localStorage (client-side experiments)
  useEffect(() => {
    const loadedFlags: Record<string, boolean> = {}
    FEATURE_FLAGS.forEach((flag) => {
      loadedFlags[flag.id] = localStorage.getItem(flag.storageKey) === 'true'
    })
    setFlags(loadedFlags)
  }, [])

  // Fetch server-side settings
  useEffect(() => {
    fetch('/api/config')
      .then((res) => res.json())
      .then((data) => {
        if (typeof data.conversationIndexerEnabled === 'boolean') {
          setIndexerEnabled(data.conversationIndexerEnabled)
        }
      })
      .catch(() => { /* server unavailable — keep default */ })
      .finally(() => setIndexerLoading(false))
  }, [])

  const toggleIndexer = useCallback(async () => {
    // Guard against concurrent requests (e.g. rapid clicks before React re-renders the disabled button)
    if (indexerSaving) return
    const newValue = !indexerEnabled
    setIndexerSaving(true)
    try {
      const res = await fetch('/api/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationIndexerEnabled: newValue }),
      })
      if (res.ok) {
        setIndexerEnabled(newValue)
      }
    } catch { /* network error — no change */ }
    finally {
      // Always clear saving state, even if fetch throws
      setIndexerSaving(false)
    }
  }, [indexerEnabled, indexerSaving])

  const toggleFlag = (flag: FeatureFlag) => {
    // Derive newValue from the previous state inside the updater to avoid stale-closure reads
    setFlags((prev) => {
      const newValue = !prev[flag.id]
      try { localStorage.setItem(flag.storageKey, String(newValue)) } catch { /* storage unavailable */ }
      return { ...prev, [flag.id]: newValue }
    })
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Server-side System Settings */}
      <div className="mb-10">
        <div className="flex items-center gap-3 mb-2">
          <Settings className="w-6 h-6 text-blue-400" />
          <h1 className="text-2xl font-bold text-white">System Settings</h1>
        </div>
        <p className="text-gray-400">
          Server-side settings that affect all agents. Changes take effect immediately.
        </p>

        <div className="mt-6 space-y-4">
          {/* Conversation Indexer Toggle */}
          <div
            className={`rounded-xl border p-5 transition-all duration-300 ${
              indexerEnabled
                ? 'bg-blue-500/10 border-blue-500/30'
                : 'bg-gray-800/50 border-gray-700'
            }`}
          >
            <div className="flex items-start gap-4">
              <div
                className={`w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  indexerEnabled ? 'bg-blue-500/20' : 'bg-gray-700'
                }`}
              >
                <Database className={`w-6 h-6 ${indexerEnabled ? 'text-blue-400' : 'text-gray-400'}`} />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-4">
                  <h3 className="text-lg font-semibold text-white">Conversation Indexer</h3>
                  <button
                    onClick={toggleIndexer}
                    disabled={indexerLoading || indexerSaving}
                    className={`p-1 rounded-lg transition-all ${
                      indexerLoading || indexerSaving
                        ? 'text-gray-600 cursor-not-allowed'
                        : indexerEnabled
                          ? 'text-blue-400 hover:text-blue-300'
                          : 'text-gray-400 hover:text-gray-300'
                    }`}
                    aria-label={indexerEnabled ? 'Disable indexer' : 'Enable indexer'}
                  >
                    {indexerEnabled ? (
                      <ToggleRight className="w-10 h-10" />
                    ) : (
                      <ToggleLeft className="w-10 h-10" />
                    )}
                  </button>
                </div>

                <p className="text-sm text-gray-400 mt-1">
                  Delta Index periodically indexes agent conversations for semantic search and memory consolidation.
                  Disable this if indexing causes high CPU or memory usage.
                </p>

                {!indexerEnabled && (
                  <div className="flex items-start gap-2 mt-3 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                    <AlertTriangle className="w-4 h-4 text-yellow-500 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-yellow-400">
                      Indexer is disabled. Agents will not build or update their conversation memory until re-enabled.
                    </p>
                  </div>
                )}

                {indexerEnabled && !indexerLoading && (
                  <div className="mt-3 text-xs text-blue-400 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                    Indexer active for all agents
                  </div>
                )}

                {indexerLoading && (
                  <div className="mt-3 text-xs text-gray-500">Loading…</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Client-side Experiments */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <FlaskConical className="w-6 h-6 text-purple-400" />
          <h1 className="text-2xl font-bold text-white">Experiments</h1>
        </div>
        <p className="text-gray-400">
          Enable experimental features to try new functionality before it&apos;s fully released.
          These features may change or be removed without notice.
        </p>
      </div>

      <div className="space-y-4">
        {FEATURE_FLAGS.length === 0 ? (
          <div className="rounded-xl border border-gray-700 bg-gray-800/30 p-8 text-center">
            <FlaskConical className="w-12 h-12 text-gray-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-300 mb-2">No Active Experiments</h3>
            <p className="text-sm text-gray-500">
              All experimental features have been promoted to production.
              Check back later for new experiments to try!
            </p>
          </div>
        ) : (
          FEATURE_FLAGS.map((flag) => {
            const Icon = flag.icon
            const isEnabled = flags[flag.id]

            return (
              <div
                key={flag.id}
                className={`rounded-xl border p-5 transition-all duration-300 ${
                  isEnabled
                    ? 'bg-purple-500/10 border-purple-500/30'
                    : 'bg-gray-800/50 border-gray-700 hover:border-gray-600'
                }`}
              >
                <div className="flex items-start gap-4">
                  <div
                    className={`w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      isEnabled ? 'bg-purple-500/20' : 'bg-gray-700'
                    }`}
                  >
                    <Icon
                      className={`w-6 h-6 ${isEnabled ? 'text-purple-400' : 'text-gray-400'}`}
                    />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-4">
                      <h3 className="text-lg font-semibold text-white">{flag.name}</h3>
                      <button
                        onClick={() => toggleFlag(flag)}
                        className={`p-1 rounded-lg transition-all ${
                          isEnabled
                            ? 'text-purple-400 hover:text-purple-300'
                            : 'text-gray-400 hover:text-gray-300'
                        }`}
                        aria-label={isEnabled ? 'Disable feature' : 'Enable feature'}
                      >
                        {isEnabled ? (
                          <ToggleRight className="w-10 h-10" />
                        ) : (
                          <ToggleLeft className="w-10 h-10" />
                        )}
                      </button>
                    </div>

                    <p className="text-sm text-gray-400 mt-1">{flag.description}</p>

                    {flag.warning && (
                      <div className="flex items-start gap-2 mt-3 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                        <AlertTriangle className="w-4 h-4 text-yellow-500 flex-shrink-0 mt-0.5" />
                        <p className="text-xs text-yellow-400">{flag.warning}</p>
                      </div>
                    )}

                    {isEnabled && (
                      <div className="mt-3 text-xs text-purple-400 flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
                        Feature enabled - reload the page to see changes
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      <div className="mt-8 p-4 bg-gray-800/30 rounded-xl border border-gray-700">
        <h4 className="text-sm font-semibold text-gray-300 mb-2">About Experiments</h4>
        <p className="text-xs text-gray-500">
          Experimental features are works in progress. They may be unstable, incomplete, or change
          significantly before release. Your feedback helps us improve these features. Report issues
          or suggestions via GitHub.
        </p>
      </div>
    </div>
  )
}
