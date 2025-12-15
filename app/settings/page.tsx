'use client'

import { useState } from 'react'
import SettingsSidebar from '@/components/SettingsSidebar'
import HostsSection from '@/components/settings/HostsSection'
import HelpSection from '@/components/settings/HelpSection'
import AboutSection from '@/components/settings/AboutSection'
import OnboardingSection from '@/components/settings/OnboardingSection'
import ExperimentsSection from '@/components/settings/ExperimentsSection'
import { VersionChecker } from '@/components/VersionChecker'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export default function SettingsPage() {
  const [activeSection, setActiveSection] = useState<'hosts' | 'help' | 'about' | 'onboarding' | 'experiments'>('hosts')

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-white">
      {/* Header Navigation */}
      <div className="border-b border-gray-800 bg-gray-900/50 backdrop-blur flex-shrink-0">
        <div className="px-6 py-4">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </Link>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <SettingsSidebar activeSection={activeSection} onSectionChange={setActiveSection} />

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto">
          {activeSection === 'hosts' && <HostsSection />}
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
  )
}
