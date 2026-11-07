'use client'

/**
 * Every agent's homes, across every host. Each host is asked for its own, in parallel, so a slow host blocks nothing and
 * a host that does not answer is named, as the Doctor does. Managing a home happens in the agent's profile.
 */
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useHosts } from '@/hooks/useHosts'
import { isSelfHost } from '@/lib/host-kind'
import { homeState, type AgentHome } from '@/components/AgentHomesSection'
import type { Host } from '@/types/host'

interface HostHomes {
  agents?: { agentId: string; name?: string; devices: AgentHome[]; error?: string }[]
  error?: string
}

const baseOf = (h: Host) => (isSelfHost(h) ? '' : h.url)

export default function AgentHomesPage() {
  const { hosts } = useHosts()
  const enabled = useMemo(() => hosts.filter((h) => h.enabled !== false), [hosts])
  const hostKey = enabled.map((h) => `${h.id}|${h.url}`).join(',')
  const [state, setState] = useState<Record<string, HostHomes>>({})

  useEffect(() => {
    let live = true
    const load = () => {
      for (const host of enabled) {
        fetch(`${baseOf(host)}/api/devices`, { signal: AbortSignal.timeout(10000) })
          .then(async (res) => {
            const data = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`)
            if (live) setState((s) => ({ ...s, [host.id]: { agents: data.agents } }))
          })
          .catch((err) => {
            if (live) setState((s) => ({ ...s, [host.id]: { error: err.message } }))
          })
      }
    }
    load()
    const timer = setInterval(load, 15000)
    return () => {
      live = false
      clearInterval(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hostKey stands for the list
  }, [hostKey])

  const answers = enabled.map((h) => state[h.id])
  const noHomes = answers.length > 0 && answers.every((h) => h?.agents?.every((a) => a.devices.length === 0))

  return (
    <main className="min-h-screen bg-gray-950 text-gray-100 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <Link href="/" className="text-sm text-blue-300">← AI Maestro</Link>
        <div>
          <h1 className="text-2xl font-semibold">Agent devices</h1>
          <p className="mt-1 text-sm text-gray-400">
            The real devices your agents own. An agent can have many and is active on one at a time. Add one from the agent&apos;s profile.
          </p>
        </div>
        {noHomes && (
          <p className="text-sm text-gray-500" data-testid="no-homes">
            No devices yet. Most agents do not need one. See <a className="text-blue-300" href="https://agentdevices.org" target="_blank" rel="noopener noreferrer">agentdevices.org</a>.
          </p>
        )}
        {enabled.map((host) => {
          const homes = state[host.id]
          if (!homes) return null
          if (homes.error) return <p key={host.id} className="text-sm text-amber-300">{host.name || host.id} did not answer: {homes.error}</p>
          if (!homes.agents?.length) return null
          return (
            <section key={host.id}>
              <h2 className="text-sm font-medium text-gray-400 mb-2">{host.name || host.id}</h2>
              <div className="grid gap-3 md:grid-cols-2">
                {homes.agents.flatMap((agent) => [
                  ...(agent.error ? [<p key={agent.agentId} className="text-sm text-red-300 break-words">{agent.name}: {agent.error}</p>] : []),
                  ...agent.devices.map((home) => (
                    <article key={`${agent.agentId}:${home.key}`} className="border border-gray-700 rounded-lg p-4">
                      <div className="flex justify-between gap-3">
                        <h3 className="font-medium truncate">{home.name}</h3>
                        <span className={`text-xs ${homeState(home).tone}`}>{homeState(home).label}</span>
                      </div>
                      <p className="mt-1 text-sm text-blue-200">{agent.name}{home.active && <span className="ml-2 text-xs text-green-400">Active</span>}</p>
                      <p className="mt-1 text-xs text-gray-500 break-words">{home.capabilities.join(' · ') || 'No capabilities yet'}</p>
                      <p className="mt-1 text-xs text-gray-500">Last seen {home.lastSeen ? new Date(home.lastSeen).toLocaleString() : 'never'}</p>
                    </article>
                  )),
                ])}
              </div>
            </section>
          )
        })}
      </div>
    </main>
  )
}
