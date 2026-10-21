'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, BellRing } from 'lucide-react'
import { useHosts } from '@/hooks/useHosts'
import { useAgents } from '@/hooks/useAgents'
import { useOpenTasks } from '@/hooks/useOpenTasks'
import { useSessionActivity } from '@/hooks/useSessionActivity'
import AttentionList from '@/components/attention/AttentionList'
import { VersionChecker } from '@/components/VersionChecker'
import { buildAttention, unreachableHosts } from '@/lib/attention'

/**
 * What needs the operator, across every agent on every host, longest waiting first. A separate page
 * reached from the home header (next to Matrix and Org); it does not replace the home view.
 * Agent status comes only from the shared store (presenceOf); cards from each host, as the Matrix does.
 */
export default function AttentionPage() {
  const { hosts } = useHosts()
  const { agents, hostErrors } = useAgents()
  const { cards, unreachable: cardHostsDown, loading } = useOpenTasks(hosts)
  const { presenceOf, getSessionActivity } = useSessionActivity()
  // Re-rank every 30 s so "waited" stays true between feed updates
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])

  const items = useMemo(() => buildAttention({
    agents: agents.map(a => ({
      id: a.id, name: a.name, label: a.label, alias: a.alias, tags: a.tags, hostId: a.hostId, hostName: a.hostName,
      presence: presenceOf(a),
      lastActivity: getSessionActivity(a.name || a.alias || a.session?.tmuxSessionName || '', a.id)?.lastActivity,
    })),
    cards,
  }, now), [agents, cards, presenceOf, getSessionActivity, now])

  const down = unreachableHosts(cardHostsDown, Object.keys(hostErrors).map(id => hosts.find(h => h.id === id)?.name || id))

  return (
    <div className="h-screen flex flex-col bg-gray-950 text-gray-100">
      <header className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-800 flex-shrink-0">
        <Link href="/" className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-gray-200" aria-label="Back to the dashboard">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <BellRing className="w-4 h-4 text-red-400" />
        <h1 className="text-sm font-medium">Attention</h1>
        <span className="text-xs text-gray-500">what needs you, longest waiting first</span>
        <div className="flex-1" />
        <span className="text-[10px] text-gray-600 bg-gray-800 rounded-full px-2 py-0.5" data-testid="attention-count">{items.length} {items.length === 1 ? 'item' : 'items'}</span>
      </header>

      {down.length > 0 && (
        <div className="px-4 py-2 text-xs text-amber-300 bg-amber-500/10 border-b border-amber-500/20" data-testid="attention-down">
          Could not reach {down.join(', ')}: what needs you there is missing from this list.
        </div>
      )}

      {loading && items.length === 0
        ? <div className="flex-1 flex items-center justify-center text-sm text-gray-500">Loading…</div>
        : <AttentionList items={items} showHost={hosts.length > 1} />}
      <VersionChecker />
    </div>
  )
}
