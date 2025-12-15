'use client'

import { useState, useEffect } from 'react'
import { FlaskConical, Users, Layers, ToggleLeft, ToggleRight, AlertTriangle } from 'lucide-react'

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

  // Load initial state from localStorage
  useEffect(() => {
    const loadedFlags: Record<string, boolean> = {}
    FEATURE_FLAGS.forEach((flag) => {
      loadedFlags[flag.id] = localStorage.getItem(flag.storageKey) === 'true'
    })
    setFlags(loadedFlags)
  }, [])

  const toggleFlag = (flag: FeatureFlag) => {
    const newValue = !flags[flag.id]
    setFlags((prev) => ({ ...prev, [flag.id]: newValue }))
    localStorage.setItem(flag.storageKey, String(newValue))
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
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
