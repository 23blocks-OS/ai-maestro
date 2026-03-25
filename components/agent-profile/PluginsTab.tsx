'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { XCircle, ExternalLink } from 'lucide-react'
import type { AgentLocalConfig, LocalPlugin } from '@/types/agent-local-config'
import { EmptyState } from './shared'

export default function PluginsTab({ config }: { config: AgentLocalConfig }) {
  const router = useRouter()
  const [confirmUninstall, setConfirmUninstall] = useState<LocalPlugin | null>(null)
  const [uninstalling, setUninstalling] = useState(false)

  const handleUninstall = async (plugin: LocalPlugin) => {
    setUninstalling(true)
    try {
      // Extract the marketplace name from the plugin key ("name@marketplace") so that
      // the correct pluginKey is removed from settings — without this, plugins installed
      // from a non-default marketplace would not be uninstalled correctly.
      const marketplaceName = plugin.key?.includes('@') ? plugin.key.split('@').slice(1).join('@') : undefined
      const res = await fetch('/api/agents/role-plugins/install', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pluginName: plugin.name,
          agentDir: config.workingDirectory,
          ...(marketplaceName !== undefined && { marketplaceName }),
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Uninstall failed' }))
        console.error('[PluginsTab] Uninstall failed:', err.error)
      }
    } catch (err) {
      console.error('[PluginsTab] Uninstall request failed:', err)
    }
    setUninstalling(false)
    setConfirmUninstall(null)
  }

  if (config.plugins.length === 0) {
    return <EmptyState text="No plugins installed" hint="No non-Role plugins detected in local config. Role Plugin shown in Role tab." />
  }

  return (
    <div className="space-y-1.5">
      {config.plugins.map((p) => (
        <div
          key={p.name}
          className={`px-2.5 py-2 rounded-lg border ${
            p.isConflictingRolePlugin
              ? 'border-red-500/40 bg-red-500/10'
              : 'border-gray-700/30 bg-gray-800/20'
          }`}
        >
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <p className={`text-xs font-medium truncate ${p.isConflictingRolePlugin ? 'text-red-300' : 'text-gray-200'}`}>
                {p.name}
              </p>
              {p.isConflictingRolePlugin && (
                <p className="text-[10px] text-red-400/80 mt-0.5">
                  Conflicting Role Plugin — only one is allowed per agent
                </p>
              )}
              {!p.isConflictingRolePlugin && p.description && (
                <p className="text-[10px] text-gray-500 leading-snug mt-0.5 line-clamp-2">{p.description}</p>
              )}
              {/* Marketplace link — extracted from plugin key (name@marketplace) */}
              {p.key?.includes('@') && (() => {
                const mkt = p.key!.split('@').slice(1).join('@')
                return (
                  <span
                    onClick={(e) => {
                      e.stopPropagation()
                      // Save profile panel state before navigating
                      sessionStorage.setItem('profile-panel-return', JSON.stringify({ agentId: config.workingDirectory, tab: 'plugins' }))
                      router.push(`/settings?tab=global-elements&subtab=plugins&marketplace=${encodeURIComponent(mkt)}`)
                    }}
                    className="inline-flex items-center gap-1 text-[9px] text-emerald-400/70 hover:text-emerald-300 cursor-pointer mt-0.5"
                    title={`View in Settings → ${mkt}`}
                  >
                    <ExternalLink className="w-2.5 h-2.5" />
                    {mkt}
                  </span>
                )
              })()}
            </div>
            <div
              onClick={() => setConfirmUninstall(p)}
              className={`flex-shrink-0 p-1 rounded-md cursor-pointer transition-colors ${
                p.isConflictingRolePlugin
                  ? 'hover:bg-red-500/20'
                  : 'hover:bg-gray-700/60'
              }`}
              title="Uninstall this plugin"
            >
              <XCircle className={`w-4 h-4 ${p.isConflictingRolePlugin ? 'text-red-400' : 'text-gray-500 hover:text-gray-300'}`} />
            </div>
          </div>
        </div>
      ))}

      {/* Uninstall confirmation dialog */}
      {confirmUninstall && (
        <div className={`mt-3 px-3 py-3 rounded-lg border ${
          confirmUninstall.isConflictingRolePlugin
            ? 'border-red-500/30 bg-red-500/10'
            : 'border-amber-500/30 bg-amber-500/10'
        }`}>
          <p className={`text-xs mb-3 ${confirmUninstall.isConflictingRolePlugin ? 'text-red-300' : 'text-amber-300'}`}>
            Do you want to uninstall <span className="font-semibold">{confirmUninstall.name}</span>?
            {!confirmUninstall.isConflictingRolePlugin && (
              <span className="block mt-1 text-[10px] opacity-80">
                All elements bundled in this plugin will also be removed.
              </span>
            )}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => handleUninstall(confirmUninstall)}
              disabled={uninstalling}
              className={`flex-1 px-3 py-1.5 rounded-md disabled:opacity-50 text-white text-xs font-medium transition-colors ${
                confirmUninstall.isConflictingRolePlugin
                  ? 'bg-red-600 hover:bg-red-500'
                  : 'bg-amber-600 hover:bg-amber-500'
              }`}
            >
              {uninstalling ? 'Uninstalling…' : 'Yes'}
            </button>
            <button
              onClick={() => setConfirmUninstall(null)}
              disabled={uninstalling}
              className="flex-1 px-3 py-1.5 rounded-md bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-gray-200 text-xs font-medium transition-colors"
            >
              No
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
