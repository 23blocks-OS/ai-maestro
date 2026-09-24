'use client'

/**
 * What the status colours mean, in one line (lib/agent-presence.ts):
 * green working, orange needs you, yellow ready, grey offline.
 */

import { PRESENCE_STYLE, type AgentPresence } from '@/lib/agent-presence'

const ORDER: AgentPresence[] = ['working', 'needs-you', 'ready', 'offline']

export default function PresenceLegend({ className = '' }: { className?: string }) {
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-gray-500 ${className}`} aria-label="Status colours">
      {ORDER.map(p => (
        <span key={p} className="flex items-center gap-1" title={PRESENCE_STYLE[p].title}>
          <span className={`w-1.5 h-1.5 rounded-full ${PRESENCE_STYLE[p].dot.replace('animate-pulse', '')}`} />
          {PRESENCE_STYLE[p].label}
        </span>
      ))}
    </div>
  )
}
