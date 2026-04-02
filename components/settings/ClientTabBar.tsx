/**
 * ClientTabBar — reusable tab bar for switching between AI coding clients.
 * Used at the top of Skills, Plugins, Agents, and Commands sections.
 */

'use client'

import { getAllProviders } from '@/lib/converter/registry'
import type { ProviderId } from '@/lib/converter/types'

interface ClientTabBarProps {
  activeClient: ProviderId
  onClientChange: (client: ProviderId) => void
  /** Element counts per client (for badge numbers) */
  counts?: Partial<Record<ProviderId, number>>
  /** Disable tabs for clients that don't support this element type */
  disabledClients?: ProviderId[]
}

const CLIENT_ICONS: Record<ProviderId, string> = {
  'claude-code': 'C',
  'codex': 'X',
  'gemini': 'G',
  'opencode': 'O',
  'kiro': 'K',
}

export default function ClientTabBar({
  activeClient,
  onClientChange,
  counts = {},
  disabledClients = [],
}: ClientTabBarProps) {
  const providers = getAllProviders()

  return (
    <div role="tablist" className="flex gap-1 p-1 bg-gray-900/50 rounded-lg border border-gray-800 mb-4">
      {providers.map(provider => {
        const isActive = provider.id === activeClient
        const isDisabled = disabledClients.includes(provider.id)
        const count = counts[provider.id]

        return (
          <button
            key={provider.id}
            role="tab"
            aria-selected={isActive}
            aria-label={provider.displayName}
            onClick={() => !isDisabled && onClientChange(provider.id)}
            disabled={isDisabled}
            title={isDisabled ? `${provider.displayName} does not support this element type` : provider.displayName}
            className={`
              flex items-center gap-2 px-4 py-2 min-h-[44px] rounded-md text-sm font-medium
              transition-all duration-150 flex-1 justify-center
              ${isActive
                ? 'bg-blue-600 text-white shadow-sm'
                : isDisabled
                  ? 'text-gray-600 cursor-not-allowed opacity-40'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
              }
            `}
          >
            <span className={`
              w-5 h-5 rounded flex items-center justify-center text-xs font-bold
              ${isActive ? 'bg-blue-500 text-white' : 'bg-gray-800 text-gray-500'}
            `}>
              {CLIENT_ICONS[provider.id] || '?'}
            </span>
            <span className="hidden sm:inline">{provider.displayName}</span>
            {count !== undefined && count > 0 && (
              <span className={`
                text-xs px-1.5 py-0.5 rounded-full min-w-[20px] text-center
                ${isActive ? 'bg-blue-500/50 text-blue-100' : 'bg-gray-800 text-gray-500'}
              `}>
                {count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
