'use client'

import { useState, useEffect, useCallback } from 'react'
import { X, Puzzle, Check, Loader2 } from 'lucide-react'

interface RolePluginOption {
  name: string
  description: string
  source: 'local' | 'marketplace'
}

interface RolePluginModalProps {
  isOpen: boolean
  onClose: () => void
  currentPluginName?: string
  onSelectPlugin: (pluginName: string) => Promise<void>
  agentTitle?: string  // 'member' | 'autonomous' — used to filter by compatible-titles
}

const DEFAULT_PROGRAMMER_PLUGIN = 'ai-maestro-programmer-agent'
const DEFAULT_PROGRAMMER_DESCRIPTION = 'General-purpose implementer — writes code, runs tests, creates PRs'

// Predefined (title-locked) plugins that MEMBER agents should not see in the picker
const TITLE_LOCKED_PLUGINS = new Set([
  'ai-maestro-assistant-manager-agent',
  'ai-maestro-chief-of-staff',
  'ai-maestro-architect-agent',
  'ai-maestro-orchestrator-agent',
  'ai-maestro-integrator-agent',
  DEFAULT_PROGRAMMER_PLUGIN, // shown separately as "Default (Programmer)"
])

export default function RolePluginModal({
  isOpen,
  onClose,
  currentPluginName,
  onSelectPlugin,
  agentTitle,
}: RolePluginModalProps) {
  // Normalise title to lowercase for comparisons
  const normalizedTitle = agentTitle?.toLowerCase() ?? 'member'
  const isAutonomous = normalizedTitle === 'autonomous'
  const [customPlugins, setCustomPlugins] = useState<RolePluginOption[]>([])
  const [loading, setLoading] = useState(false)
  const [switching, setSwitching] = useState(false)

  // Fetch custom plugins when modal opens
  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    setLoading(true)
    // Pass title filter to API so the server can pre-filter; also apply client-side safety filter below
    const titleParam = agentTitle ? `?title=${encodeURIComponent(agentTitle)}` : ''
    fetch(`/api/agents/role-plugins${titleParam}`)
      .then(r => r.json())
      .then(data => {
        if (cancelled) return
        const plugins: RolePluginOption[] = (data.plugins || [])
          // Only show local plugins that are NOT title-locked defaults
          .filter((p: { name: string; source?: string; compatibleTitles?: string[] }) => {
            if (p.source !== 'local') return false
            if (TITLE_LOCKED_PLUGINS.has(p.name)) return false
            // Client-side safety: if plugin declares compatibleTitles, the agent's title must be included
            if (p.compatibleTitles && p.compatibleTitles.length > 0) {
              const agentTitleNorm = (agentTitle ?? 'member').toLowerCase()
              return p.compatibleTitles.some((t: string) => t.toLowerCase() === agentTitleNorm)
            }
            return true
          })
          .map((p: { name: string; description?: string; source: string }) => ({
            name: p.name,
            description: p.description || '',
            source: p.source as 'local' | 'marketplace',
          }))
        setCustomPlugins(plugins)
      })
      .catch((err) => { console.error('[RolePluginModal] Failed to load role plugins:', err) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [isOpen, agentTitle])

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [isOpen, onClose])

  const handleSelect = useCallback(async (pluginName: string) => {
    if (switching) return
    setSwitching(true)
    try {
      await onSelectPlugin(pluginName)
    } finally {
      setSwitching(false)
    }
  }, [switching, onSelectPlugin])

  if (!isOpen) return null

  const isDefaultCurrent =
    !currentPluginName || currentPluginName === DEFAULT_PROGRAMMER_PLUGIN

  return (
    // Backdrop — click to close
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[70] flex items-center justify-center"
      onClick={onClose}
    >
      {/* Modal container — stop propagation so clicks inside don't close */}
      <div
        className="bg-gray-900 rounded-xl border border-gray-700 shadow-2xl max-w-lg w-full mx-4 max-h-[70vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-700/60">
          <Puzzle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          <h3 className="text-sm font-semibold text-gray-200 flex-1">Select Role Plugin</h3>
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-gray-700/60 transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4 text-gray-500 hover:text-gray-300" />
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto py-2">
          {switching ? (
            <div className="flex items-center justify-center gap-2 py-8">
              <Loader2 className="w-4 h-4 text-emerald-400 animate-spin" />
              <span className="text-xs text-emerald-400/70">Switching plugin…</span>
            </div>
          ) : (
            <>
              {/* Default (Programmer) — shown only for MEMBER agents, not AUTONOMOUS */}
              {!isAutonomous && (
                <button
                  onClick={() => handleSelect(DEFAULT_PROGRAMMER_PLUGIN)}
                  disabled={isDefaultCurrent}
                  className={`w-full flex items-start gap-3 px-4 py-3 text-left transition-colors ${
                    isDefaultCurrent
                      ? 'bg-emerald-500/10 cursor-default'
                      : 'hover:bg-gray-800/60 cursor-pointer'
                  }`}
                >
                  <Puzzle className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${isDefaultCurrent ? 'text-emerald-300' : 'text-emerald-400/50'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className={`text-xs font-medium truncate ${isDefaultCurrent ? 'text-emerald-200' : 'text-gray-300'}`}>
                        Default (Programmer)
                      </span>
                    </div>
                    <p className="text-[10px] text-gray-500 leading-snug mt-0.5">
                      {DEFAULT_PROGRAMMER_DESCRIPTION}
                    </p>
                  </div>
                  {isDefaultCurrent && (
                    <Check className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
                  )}
                </button>
              )}

              {/* Divider — only shown when Default (Programmer) is visible */}
              {!isAutonomous && <div className="mx-4 my-1 border-t border-gray-700/40" />}

              {/* Custom plugins */}
              {loading ? (
                <div className="flex items-center justify-center gap-2 py-4">
                  <Loader2 className="w-3.5 h-3.5 text-gray-500 animate-spin" />
                  <span className="text-xs text-gray-500">Loading custom plugins…</span>
                </div>
              ) : customPlugins.length === 0 ? (
                <div className="px-4 py-4 text-center">
                  <p className="text-xs text-gray-500 italic">
                    {isAutonomous
                      ? 'No compatible plugins available.'
                      : 'No custom plugins. Create one with Haephestos.'}
                  </p>
                </div>
              ) : (
                customPlugins.map(p => {
                  const isCurrent = currentPluginName === p.name
                  return (
                    <button
                      key={p.name}
                      onClick={() => handleSelect(p.name)}
                      disabled={isCurrent}
                      className={`w-full flex items-start gap-3 px-4 py-3 text-left transition-colors ${
                        isCurrent
                          ? 'bg-emerald-500/10 cursor-default'
                          : 'hover:bg-gray-800/60 cursor-pointer'
                      }`}
                    >
                      <Puzzle className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${isCurrent ? 'text-emerald-300' : 'text-emerald-400/50'}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className={`text-xs font-medium truncate ${isCurrent ? 'text-emerald-200' : 'text-gray-300'}`}>
                            {p.name}
                          </span>
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 font-medium flex-shrink-0">
                            custom
                          </span>
                        </div>
                        {p.description && (
                          <p className="text-[10px] text-gray-500 leading-snug mt-0.5 line-clamp-2">
                            {p.description}
                          </p>
                        )}
                      </div>
                      {isCurrent && (
                        <Check className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
                      )}
                    </button>
                  )
                })
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
