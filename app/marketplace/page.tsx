/**
 * Marketplace Page
 *
 * Browse all available skills from Claude Code marketplaces.
 * Standalone page for exploring the skill ecosystem.
 */

'use client'

import { useState } from 'react'
import { ArrowLeft, Store } from 'lucide-react'
import Link from 'next/link'
import { SkillBrowser } from '@/components/marketplace'
import type { MarketplaceSkill } from '@/types/marketplace'

export default function MarketplacePage() {
  const [installNotification, setInstallNotification] = useState<string | null>(null)

  // For standalone browsing, just show a notification when trying to install
  const handleInstall = async (skill: MarketplaceSkill) => {
    setInstallNotification(`To install "${skill.name}", open an agent and use the Skill Editor.`)
    setTimeout(() => setInstallNotification(null), 5000)
  }

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-gray-950/90 backdrop-blur-sm border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <Link
                href="/"
                className="flex items-center gap-2 text-gray-400 hover:text-gray-300 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="text-sm">Back</span>
              </Link>
              <div className="h-6 w-px bg-gray-800" />
              <div className="flex items-center gap-2">
                <Store className="w-5 h-5 text-blue-400" />
                <h1 className="text-lg font-semibold text-gray-100">Skill Marketplace</h1>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Notification */}
      {installNotification && (
        <div className="fixed top-20 right-4 z-50 max-w-sm bg-gray-800 border border-gray-700 rounded-lg shadow-lg p-4 animate-in slide-in-from-right duration-300">
          <p className="text-sm text-gray-300">{installNotification}</p>
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Info Banner */}
        <div className="mb-6 p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
          <p className="text-sm text-blue-300">
            Browse skills from all installed Claude Code marketplaces. To add skills to an agent,
            open the agent&apos;s detail page and use the Skill Editor tab.
          </p>
        </div>

        {/* Skill Browser */}
        <SkillBrowser
          onSkillInstall={handleInstall}
          mode="browse"
        />
      </main>
    </div>
  )
}
