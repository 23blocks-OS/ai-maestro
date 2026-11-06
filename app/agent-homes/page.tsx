'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import type {
  AgentHome,
  HomeChange,
  HomeRequest
} from '@/services/agent-homes-service'

export default function AgentHomesPage() {
  const [devices, setDevices] = useState<AgentHome[]>([])
  const [requests, setRequests] = useState<HomeRequest[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [transfer, setTransfer] = useState<AgentHome | null>(null)
  const [agent, setAgent] = useState('')
  const [key, setKey] = useState('')
  const [saving, setSaving] = useState(false)
  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/agent-homes', { cache: 'no-store' })
      const data = await response.json()
      if (!response.ok)
        throw new Error(data.message || 'Could not read devices')
      setDevices(data.devices)
      setRequests(data.requests)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => {
    void refresh()
    const timer = setInterval(() => void refresh(), 5000)
    return () => clearInterval(timer)
  }, [refresh])
  const request = async (device: AgentHome, change: HomeChange) => {
    setSaving(true)
    setError('')
    try {
      const response = await fetch('/api/agent-homes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceKey: device.key,
          agent: device.assignedAgent,
          change
        })
      })
      const data = await response.json()
      if (!response.ok)
        throw new Error(data.message || 'Could not request change')
      setTransfer(null)
      await refresh()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }
  return (
    <main className="min-h-screen bg-gray-950 text-gray-100 p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <Link href="/" className="text-blue-300">
          ← AI Maestro
        </Link>
        <h1 className="text-3xl font-semibold">
          Agent homes &amp; accessories
        </h1>
        <p className="text-gray-400">
          Each device belongs to one agent. Approve ownership and permission
          changes on the device screen.
        </p>
        {error && (
          <p role="alert" className="text-red-300">
            {error}
          </p>
        )}
        {loading ? (
          <p>Loading devices…</p>
        ) : devices.length === 0 ? (
          <div className="p-6 border border-gray-700 rounded-xl">
            <h2 className="text-xl">Connect your first agent home</h2>
            <p className="mt-2 text-gray-400">
              Start the device controller monitor and connect its status
              directory to this Maestro host.
            </p>
            <a
              className="text-blue-300 inline-block mt-3"
              href="https://github.com/23blocks-OS/ai-maestro-device-protocol/blob/main/docs/agent-tools.md"
            >
              Setup instructions
            </a>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {devices.map((device) => {
              const pending = requests.find(
                (r) =>
                  r.deviceKey === device.key &&
                  ['queued', 'awaiting_local_approval'].includes(r.status ?? '')
              )
              return (
                <article
                  key={device.key}
                  className="border border-gray-700 rounded-xl p-5 space-y-3"
                >
                  <div className="flex justify-between gap-4">
                    <h2 className="text-xl font-semibold">{device.name}</h2>
                    <span>{device.state}</span>
                  </div>
                  <p className="break-all text-blue-200">
                    {device.assignedAgent}
                  </p>
                  <p className="text-sm text-gray-400">
                    {device.platform || 'Platform unknown'} · Last seen{' '}
                    {device.lastSeen
                      ? new Date(device.lastSeen).toLocaleString()
                      : 'never'}
                  </p>
                  <p className="text-sm">
                    {device.capabilities.concat(device.streams).join(' · ') ||
                      'Capabilities unavailable'}
                  </p>
                  <p className="text-sm">
                    Camera snapshots{' '}
                    {device.permissions.camera ? 'allowed' : 'off'}
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <button
                      disabled={saving || !!pending}
                      onClick={() =>
                        void request(device, {
                          action: 'camera',
                          enabled: !device.permissions.camera
                        })
                      }
                      className="border rounded px-3 py-2 disabled:opacity-40"
                    >
                      {device.permissions.camera
                        ? 'Revoke camera'
                        : 'Request camera'}
                    </button>
                    <button
                      disabled={saving || !!pending}
                      onClick={() => {
                        setTransfer(device)
                        setAgent('')
                        setKey('')
                      }}
                      className="border rounded px-3 py-2 disabled:opacity-40"
                    >
                      Transfer
                    </button>
                    <button
                      disabled={saving || !!pending}
                      onClick={() => void request(device, { action: 'revoke' })}
                      className="border border-red-700 text-red-300 rounded px-3 py-2 disabled:opacity-40"
                    >
                      Unassign
                    </button>
                  </div>
                  {pending && (
                    <p role="status" className="text-amber-300">
                      Waiting for approval on the device.
                    </p>
                  )}
                </article>
              )
            })}
          </div>
        )}
        {transfer && (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void request(transfer, { action: 'transfer', agent, key })
            }}
            className="border border-amber-700 rounded-xl p-5 space-y-3"
          >
            <h2 className="text-xl">Transfer {transfer.name}</h2>
            <label className="block">
              New agent’s full AMP address
              <input
                required
                value={agent}
                onChange={(e) => setAgent(e.target.value)}
                className="block w-full bg-gray-900 border rounded p-2 mt-1"
              />
            </label>
            <label className="block">
              New agent’s device public key
              <input
                required
                value={key}
                onChange={(e) => setKey(e.target.value)}
                className="block w-full bg-gray-900 border rounded p-2 mt-1"
              />
            </label>
            <p className="text-gray-400">
              The device owner will verify this address and key before
              accepting. Camera and media permissions reset on transfer.
            </p>
            <button disabled={saving} className="bg-blue-700 rounded px-3 py-2">
              Request transfer
            </button>
            <button
              type="button"
              onClick={() => setTransfer(null)}
              className="px-3 py-2"
            >
              Cancel
            </button>
          </form>
        )}
        {requests.length > 0 && (
          <section>
            <h2 className="text-xl mb-3">Recent changes</h2>
            <ul className="space-y-2">
              {requests
                .sort((a, b) => b.createdAt - a.createdAt)
                .slice(0, 10)
                .map((r) => (
                  <li key={r.id}>
                    {r.device} · {r.change.action} ·{' '}
                    {r.status?.replaceAll('_', ' ')}
                  </li>
                ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  )
}
