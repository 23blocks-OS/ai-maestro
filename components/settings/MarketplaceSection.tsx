/**
 * Skills Explorer Section
 *
 * Settings section for browsing and installing skills globally at user scope (~/.claude/skills/).
 * Skills installed from this page are available to ALL agents on the host.
 */

'use client'

import { SkillBrowser } from '@/components/marketplace'
import type { MarketplaceSkill } from '@/types/marketplace'
import { useState } from 'react'
import { Store, ExternalLink, Info } from 'lucide-react'
import Link from 'next/link'

export default function MarketplaceSection() {
  const [notification, setNotification] = useState<{ text: string; type: 'info' | 'error' | 'success' } | null>(null)

  /** Show a timed notification toast */
  const showNotification = (text: string, type: 'info' | 'error' | 'success' = 'info') => {
    setNotification({ text, type })
    setTimeout(() => setNotification(null), 5000)
  }

  /**
   * Handle global skill installation at user scope (~/.claude/skills/).
   * Installs the skill globally so it is available to ALL agents on the host.
   */
  const handleInstall = async (skill: MarketplaceSkill) => {
    showNotification(`Installing "${skill.name}" globally...`, 'info')
    try {
      const res = await fetch('/api/settings/global-elements/install-skill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: skill.id, name: skill.name, source: skill.marketplace }),
      })
      if (!res.ok) throw new Error(await res.text())
      showNotification(`Installed "${skill.name}" globally (user scope).`, 'success')
    } catch (err) {
      showNotification(`Failed to install skill: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error')
    }
  }

  /** Border color for notification toast based on type */
  const notifBorder = notification?.type === 'error'
    ? 'border-red-500/40'
    : notification?.type === 'success'
      ? 'border-emerald-500/40'
      : 'border-blue-500/40'

  /** Text color for notification toast based on type */
  const notifText = notification?.type === 'error'
    ? 'text-red-300'
    : notification?.type === 'success'
      ? 'text-emerald-300'
      : 'text-gray-300'

  return (
    <div className="p-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Store className="w-6 h-6 text-blue-400" />
          <div>
            <h1 className="text-xl font-semibold text-white">Skills Explorer</h1>
            <p className="text-sm text-gray-400">Browse and install skills globally. Installed skills are available to all agents.</p>
          </div>
        </div>
        <Link
          href="/marketplace"
          className="flex items-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg transition-colors"
        >
          <ExternalLink className="w-4 h-4" />
          Open Full Page
        </Link>
      </div>

      {/* Info Banner */}
      <div className="mb-6 p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg flex items-start gap-3">
        <Info className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-blue-300">
          <p>Browse all available skills from your installed Claude Code marketplaces.</p>
          <p className="mt-1 text-blue-400/80">Click &quot;Add&quot; on any skill to install it globally at user scope (~/.claude/skills/).</p>
        </div>
      </div>

      {/* Notification Toast */}
      {notification && (
        <div className={`fixed top-4 right-4 z-50 max-w-sm bg-gray-800 border ${notifBorder} rounded-lg shadow-lg p-4 animate-in slide-in-from-right duration-300`}>
          <p className={`text-sm ${notifText}`}>{notification.text}</p>
        </div>
      )}

      {/* Skill Browser */}
      <SkillBrowser
        onSkillInstall={handleInstall}
        mode="browse"
      />
    </div>
  )
}
