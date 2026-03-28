'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import SettingsSidebar from '@/components/SettingsSidebar'
import HostsSection from '@/components/settings/HostsSection'
import DomainsSection from '@/components/settings/DomainsSection'
import WebhooksSection from '@/components/settings/WebhooksSection'
import HelpSection from '@/components/settings/HelpSection'
import AboutSection from '@/components/settings/AboutSection'
import OnboardingSection from '@/components/settings/OnboardingSection'
import ExperimentsSection from '@/components/settings/ExperimentsSection'
import MarketplaceSection from '@/components/settings/MarketplaceSection'
import GlobalElementsSection from '@/components/settings/GlobalElementsSection'
import { VersionChecker } from '@/components/VersionChecker'
import Link from 'next/link'
import { ArrowLeft, Undo2, Redo2 } from 'lucide-react'
import { useConfigUndoRedo } from '@/hooks/useConfigUndoRedo'
import { SettingsUndoRedoContext } from '@/hooks/SettingsUndoRedoContext'

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center bg-gray-950 text-gray-500">Loading settings…</div>}>
      <SettingsPageInner />
    </Suspense>
  )
}

function SettingsPageInner() {
  const searchParams = useSearchParams()
  const tabParam = searchParams.get('tab')
  const [activeSection, setActiveSection] = useState<'hosts' | 'domains' | 'webhooks' | 'help' | 'about' | 'onboarding' | 'experiments' | 'marketplace' | 'global-elements'>('hosts')
  const undoRedo = useConfigUndoRedo()

  // Navigate to section from URL params (e.g. /settings?tab=global-elements)
  useEffect(() => {
    const validTabs = ['hosts', 'domains', 'webhooks', 'help', 'about', 'onboarding', 'experiments', 'marketplace', 'global-elements'] as const
    if (tabParam && (validTabs as readonly string[]).includes(tabParam)) {
      setActiveSection(tabParam as typeof validTabs[number])
    }
  }, [tabParam])

  return (
    <SettingsUndoRedoContext.Provider value={undoRedo}>
      <div className="flex flex-col h-screen bg-gray-950 text-white">
        {/* Header Navigation */}
        <div className="border-b border-gray-800 bg-gray-900/50 backdrop-blur flex-shrink-0">
          <div className="px-6 py-4 flex items-center justify-between">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Dashboard
            </Link>
            {/* Undo/Redo Buttons — top-right, consistent with AgentProfilePanel */}
            <div className="flex items-center gap-1.5">
              {/* Undo Button */}
              <div
                onClick={undoRedo.canUndo ? undoRedo.undo : undefined}
                className={`relative p-1 rounded-md flex-shrink-0 transition-colors ${
                  undoRedo.canUndo
                    ? 'cursor-pointer hover:bg-gray-700/60 text-gray-400 hover:text-blue-400'
                    : 'text-gray-700 cursor-not-allowed'
                }`}
                title="Undo"
              >
                <Undo2 className="w-4 h-4" />
              </div>
              {/* Redo Button */}
              <div
                onClick={undoRedo.canRedo ? undoRedo.redo : undefined}
                className={`relative p-1 rounded-md flex-shrink-0 transition-colors ${
                  undoRedo.canRedo
                    ? 'cursor-pointer hover:bg-gray-700/60 text-gray-400 hover:text-blue-400'
                    : 'text-gray-700 cursor-not-allowed'
                }`}
                title="Redo"
              >
                <Redo2 className="w-4 h-4" />
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <SettingsSidebar activeSection={activeSection} onSectionChange={setActiveSection} />

          {/* Content Area */}
          <div className="flex-1 overflow-y-auto">
            {activeSection === 'hosts' && <HostsSection />}
            {activeSection === 'domains' && <DomainsSection />}
            {activeSection === 'webhooks' && <WebhooksSection />}
            {activeSection === 'marketplace' && <MarketplaceSection />}
            {activeSection === 'global-elements' && <GlobalElementsSection initialSubtab={searchParams.get('subtab') as 'plugins' | 'elements' | 'marketplaces' | null} initialMarketplace={searchParams.get('marketplace')} />}
            {activeSection === 'experiments' && <ExperimentsSection />}
            {activeSection === 'onboarding' && <OnboardingSection />}
            {activeSection === 'help' && <HelpSection />}
            {activeSection === 'about' && <AboutSection />}
          </div>
        </div>

        {/* Footer */}
        <footer className="border-t border-gray-800 bg-gray-950 px-4 py-2 flex-shrink-0">
          <div className="flex flex-col md:flex-row justify-between items-center gap-1 md:gap-0 md:h-5">
            <p className="text-xs md:text-sm text-white leading-none">
              <VersionChecker /> • Made with <span className="text-red-500 text-lg inline-block scale-x-125">♥</span> in Boulder Colorado
            </p>
            <p className="text-xs md:text-sm text-white leading-none">
              Concept by{' '}
              <a
                href="https://x.com/jkpelaez"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-gray-300 transition-colors"
              >
                Juan Peláez
              </a>{' '}
              @{' '}
              <a
                href="https://23blocks.com"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-red-500 hover:text-red-400 transition-colors"
              >
                23blocks
              </a>
              . Coded by Claude
            </p>
          </div>
        </footer>
      </div>
    </SettingsUndoRedoContext.Provider>
  )
}
