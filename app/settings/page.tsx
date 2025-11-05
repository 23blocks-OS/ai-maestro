'use client'

import { useState } from 'react'
import SettingsSidebar from '@/components/SettingsSidebar'
import HostsSection from '@/components/settings/HostsSection'
import HelpSection from '@/components/settings/HelpSection'
import AboutSection from '@/components/settings/AboutSection'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export default function SettingsPage() {
  const [activeSection, setActiveSection] = useState<'hosts' | 'help' | 'about'>('hosts')

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
          {activeSection === 'help' && <HelpSection />}
          {activeSection === 'about' && <AboutSection />}
        </div>
      </div>
    </div>
  )
}
