'use client'

import { useMemo } from 'react'
import { KeyRound } from 'lucide-react'
import { useAgents } from '@/hooks/useAgents'
import { useSessionActivity } from '@/hooks/useSessionActivity'
import { accountOf } from '@/lib/credential-words'
import { formatLimits } from '@/lib/status-format'
import type { Agent } from '@/types/agent'

/**
 * Every agent and the account it draws from, per host (#65 part 2): eleven agents on one person's allowance show
 * at a glance. An agent with no Model access setting uses its computer's own login.
 */
export default function AccountsSection() {
  const { agents, loading } = useAgents()
  const { snapshotOf } = useSessionActivity()

  const hosts = useMemo(() => {
    const byHost = new Map<string, Map<string, Agent[]>>()
    for (const a of agents) {
      const host = a.hostName || a.hostId || 'this computer'
      const acct = accountOf(a)?.label || "this computer's login (no setting)"
      if (!byHost.has(host)) byHost.set(host, new Map())
      const m = byHost.get(host)!
      m.set(acct, [...(m.get(acct) || []), a])
    }
    return [...byHost].sort(([x], [y]) => x.localeCompare(y))
  }, [agents])

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-100 flex items-center gap-2"><KeyRound className="w-5 h-5" /> Accounts</h2>
        <p className="text-sm text-gray-400 mt-1">Which account each agent calls its model with. Set it in the agent&apos;s profile under Model access. A red key means the running session uses a different account than its setting.</p>
      </div>
      {loading && !agents.length && <p className="text-sm text-gray-500">Loading agents…</p>}
      {hosts.map(([host, accounts]) => (
        <section key={host} className="rounded-lg border border-gray-800">
          <h3 className="px-4 py-2 text-sm font-medium text-gray-200 border-b border-gray-800">{host}</h3>
          <div className="divide-y divide-gray-800">
            {[...accounts].sort((x, y) => y[1].length - x[1].length).map(([acct, list]) => (
              <div key={acct} className="px-4 py-3">
                <div className="text-sm text-gray-200">{acct} <span className="text-gray-500">· {list.length} agent{list.length === 1 ? '' : 's'}</span></div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {list.map(a => {
                    const check = a.credentialCheck?.state
                    const lim = formatLimits(snapshotOf(a)?.limits)
                    return (
                      <span key={a.id} title={[a.credentialCheck?.detail, lim?.title].filter(Boolean).join('\n') || undefined} data-testid="account-agent"
                        className={`text-xs px-2 py-0.5 rounded-full border ${check === 'mismatch' ? 'border-red-500/60 bg-red-500/15 text-red-300' : check === 'unverified' ? 'border-amber-500/40 text-amber-300' : 'border-gray-700 text-gray-300'}`}>
                        {a.label || a.name}{lim ? ` · ${lim.text}` : ''}
                      </span>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
