'use client'

import { Server, HelpCircle, Info, Compass, FlaskConical, Webhook, Globe, Store, Puzzle, Bot, TerminalSquare } from 'lucide-react'

type SectionId = 'hosts' | 'domains' | 'webhooks' | 'help' | 'about' | 'onboarding' | 'experiments' | 'marketplace' | 'global-elements' | 'agents' | 'commands'

interface SettingsSidebarProps {
  activeSection: SectionId
  onSectionChange: (section: SectionId) => void
}

export default function SettingsSidebar({ activeSection, onSectionChange }: SettingsSidebarProps) {
  const sections = [
    {
      id: 'hosts' as const,
      label: 'Hosts',
      icon: Server,
      description: 'Manage remote workers',
    },
    {
      id: 'domains' as const,
      label: 'Domains',
      icon: Globe,
      description: 'Email domains',
    },
    {
      id: 'webhooks' as const,
      label: 'Webhooks',
      icon: Webhook,
      description: 'Event subscriptions',
    },
    {
      id: 'marketplace' as const,
      label: 'Skills',
      icon: Store,
      description: 'Browse & convert skills per client',
    },
    {
      id: 'agents' as const,
      label: 'Agents',
      icon: Bot,
      description: 'Browse agents per client',
    },
    {
      id: 'commands' as const,
      label: 'Commands',
      icon: TerminalSquare,
      description: 'Slash commands per client',
    },
    {
      id: 'global-elements' as const,
      label: 'Plugins',
      icon: Puzzle,
      description: 'Plugins & marketplaces',
    },
    {
      id: 'experiments' as const,
      label: 'Experiments',
      icon: FlaskConical,
      description: 'Try new features',
    },
    {
      id: 'onboarding' as const,
      label: 'Onboarding',
      icon: Compass,
      description: 'Getting started guide',
    },
    {
      id: 'help' as const,
      label: 'Help',
      icon: HelpCircle,
      description: 'Documentation & guides',
    },
    {
      id: 'about' as const,
      label: 'About',
      icon: Info,
      description: 'Version & info',
    },
  ]

  return (
    <div className="w-64 border-r border-gray-800 bg-gray-900/50 p-4 flex flex-col">
      <h2 className="text-lg font-semibold text-white mb-1 px-2">Settings</h2>
      <p className="text-xs text-gray-400 mb-6 px-2">Configure AI Maestro</p>

      <nav className="space-y-1">
        {sections.map((section) => {
          const Icon = section.icon
          const isActive = activeSection === section.id

          return (
            <button
              key={section.id}
              onClick={() => onSectionChange(section.id)}
              className={`w-full flex items-start gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 ${
                isActive
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                  : 'text-gray-300 hover:bg-gray-800/50 hover:text-white'
              }`}
            >
              <Icon className={`w-5 h-5 mt-0.5 flex-shrink-0 ${isActive ? 'text-white' : 'text-gray-400'}`} />
              <div className="flex-1 text-left">
                <div className={`font-medium ${isActive ? 'text-white' : 'text-gray-200'}`}>
                  {section.label}
                </div>
                <div className={`text-xs ${isActive ? 'text-blue-100' : 'text-gray-500'}`}>
                  {section.description}
                </div>
              </div>
            </button>
          )
        })}
      </nav>
    </div>
  )
}
