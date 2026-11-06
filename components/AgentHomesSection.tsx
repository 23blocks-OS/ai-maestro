'use client'

import { useEffect, useState } from 'react'
import type { AgentHome } from '@/services/agent-homes-service'

export function AgentHomesSection({
  address,
  baseUrl
}: {
  address?: string
  baseUrl: string
}) {
  const [homes, setHomes] = useState<AgentHome[]>([])
  useEffect(() => {
    if (!address) return
    let active = true
    const load = async () => {
      try {
        const response = await fetch(baseUrl + '/api/agent-homes')
        if (!response.ok) throw new Error()
        const data = await response.json()
        if (active)
          setHomes(
            data.devices.filter((d: AgentHome) => d.assignedAgent === address)
          )
      } catch {
        if (active) setHomes([])
      }
    }
    void load()
    const timer = setInterval(() => void load(), 10000)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [address, baseUrl])
  if (!homes.length) return null
  return (
    <section className="border border-gray-700 rounded-lg p-4">
      <h3 className="font-medium text-gray-200">Homes &amp; accessories</h3>
      <ul className="mt-2 space-y-1">
        {homes.map((home) => (
          <li key={home.key}>
            <a className="text-blue-300" href={baseUrl + '/agent-homes'}>
              {home.name}
            </a>{' '}
            <span className="text-gray-400">{home.state}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
