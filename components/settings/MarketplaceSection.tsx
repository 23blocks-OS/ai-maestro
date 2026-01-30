/**
 * Marketplace Section
 *
 * Settings section for browsing the skill marketplace.
 */

'use client'

import { SkillBrowser } from '@/components/marketplace'
import type { MarketplaceSkill } from '@/types/marketplace'
import { useState } from 'react'
import { Store, ExternalLink, Info } from 'lucide-react'
import Link from 'next/link'

export default function MarketplaceSection() {
  const [notification, setNotification] = useState<string | null>(null)

  // Show notification when trying to install from settings
  const handleInstall = async (skill: MarketplaceSkill) => {
    setNotification(`To add "${skill.name}" to an agent, open the agent's profile and use the Skills section.`)
    setTimeout(() => setNotification(null), 5000)
  }

  return (
    <div className="p-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Store className="w-6 h-6 text-blue-400" />
          <div>
            <h1 className="text-xl font-semibold text-white">Skill Marketplace</h1>
            <p className="text-sm text-gray-400">Browse skills from Claude Code marketplaces</p>
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
          <p className="mt-1 text-blue-400/80">To add skills to an agent, open the agent&apos;s profile and use the Skills section.</p>
        </div>
      </div>

      {/* Notification Toast */}
      {notification && (
        <div className="fixed top-4 right-4 z-50 max-w-sm bg-gray-800 border border-gray-700 rounded-lg shadow-lg p-4 animate-in slide-in-from-right duration-300">
          <p className="text-sm text-gray-300">{notification}</p>
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
