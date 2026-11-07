'use client'

/**
 * An agent's homes: the devices it owns (docs/SPEC-AGENT-DEVICES.md). Most agents have none, so nothing is loaded until
 * the section is opened. Everything here talks to the agent's own host, which holds its key.
 */
import { useCallback, useEffect, useState } from 'react'

export interface AgentHome {
  key: string
  name: string
  verified: boolean
  owner: string | null
  active: boolean
  state: 'unverified' | 'online' | 'offline' | 'revoked'
  capabilities: string[]
  lastSeen?: number
}

const STATE: Record<AgentHome['state'], { label: string; tone: string }> = {
  online: { label: 'Online', tone: 'text-green-400' },
  offline: { label: 'Offline', tone: 'text-gray-400' },
  unverified: { label: 'Not confirmed', tone: 'text-amber-400' },
  revoked: { label: 'Owned by another agent', tone: 'text-red-400' },
}

export const homeState = (home: AgentHome) => STATE[home.state] ?? STATE.unverified

const WORKING = 'Working…'

async function call(url: string, init?: RequestInit) {
  // A device call can take 30 s: a refresh, then the exchange
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(40000) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data.ok === false) throw new Error(data.message || data.error || `HTTP ${res.status}`)
  return data
}

const post = (url: string, body?: unknown) =>
  call(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })

function AddHome({ base, onAdded }: { base: string; onAdded: () => void }) {
  const [identity, setIdentity] = useState<{ address: string; key: string } | null>(null)
  const [form, setForm] = useState({ key: '', endpoint: '', name: '' })
  const [note, setNote] = useState('')
  const [error, setError] = useState('')

  const open = async () => {
    setError('')
    try {
      setIdentity(await call(`${base}/identity`))
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setNote('')
    try {
      const data = await post(base, form)
      setNote(data.pending ? `Added, not confirmed yet: ${data.pending}. Run the command on the device, then check again.` : 'Added.')
      setForm({ key: '', endpoint: '', name: '' })
      onAdded()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  if (!identity) {
    return (
      <div className="mt-3">
        <button type="button" onClick={open} className="text-xs px-3 py-1.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-200" data-testid="add-home">Add a device</button>
        {error && <p role="alert" className="mt-2 text-xs text-red-300">{error}</p>}
      </div>
    )
  }

  const input = 'block w-full mt-1 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100'
  return (
    <form onSubmit={add} className="mt-3 space-y-2 border border-gray-700 rounded-lg p-3 text-xs text-gray-300" data-testid="add-home-form">
      <p>1. On the device, run:</p>
      <pre className="whitespace-pre-wrap break-all bg-gray-950 rounded p-2 text-gray-200">{`node clients/linux/cli.mjs assign ${identity.address} ${identity.key}`}</pre>
      <p className="text-gray-500">Add <code>--camera</code> to allow the camera. Start the bridge with <code>cli.mjs serve</code>.</p>
      <p>2. Then enter what the device prints:</p>
      <label className="block">Device public key
        <input required value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} className={input} />
      </label>
      <label className="block">Address (Tailscale)
        <input required placeholder="http://100.64.0.2:23110" value={form.endpoint} onChange={(e) => setForm({ ...form, endpoint: e.target.value })} className={input} />
      </label>
      <label className="block">Name
        <input maxLength={80} placeholder="Kitchen" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={input} />
      </label>
      <div className="flex gap-2">
        <button type="submit" className="px-3 py-1.5 rounded bg-blue-700 hover:bg-blue-600 text-white">Add</button>
        <button type="button" onClick={() => setIdentity(null)} className="px-3 py-1.5 rounded text-gray-400 hover:text-gray-200">Close</button>
      </div>
      {note && <p role="status" className="text-amber-300 break-words">{note}</p>}
      {error && <p role="alert" className="text-red-300 break-words">{error}</p>}
    </form>
  )
}

export default function AgentHomesSection({ agentId, hostUrl = '' }: { agentId: string; hostUrl?: string }) {
  const base = `${hostUrl}/api/agents/${encodeURIComponent(agentId)}/devices`
  const [homes, setHomes] = useState<AgentHome[] | null>(null)
  const [error, setError] = useState('')
  const [status, setStatus] = useState<Record<string, string>>({})
  const [picture, setPicture] = useState<Record<string, number>>({})
  const [forgetting, setForgetting] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setHomes((await call(base)).devices)
      setError('')
    } catch (err) {
      setError((err as Error).message)
    }
  }, [base])

  useEffect(() => {
    void load()
    const timer = setInterval(() => void load(), 10000)
    return () => clearInterval(timer)
  }, [load])

  const act = async (home: AgentHome, run: () => Promise<string | void>) => {
    if (status[home.key] === WORKING) return
    setStatus((s) => ({ ...s, [home.key]: WORKING }))
    try {
      const text = await run()
      setStatus((s) => ({ ...s, [home.key]: text || '' }))
    } catch (err) {
      setStatus((s) => ({ ...s, [home.key]: (err as Error).message }))
    }
    void load()
  }

  const device = (home: AgentHome) => `${base}/${encodeURIComponent(home.key)}`
  const button = 'text-xs px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-200 disabled:opacity-40'

  return (
    <div data-testid="agent-homes">
      {error && <p role="alert" className="text-xs text-red-300 mb-2">{error}</p>}
      {homes === null && !error && <p className="text-xs text-gray-500">Loading…</p>}
      {homes?.length === 0 && <p className="text-xs text-gray-500">No devices. An agent works fine without one.</p>}
      <ul className="space-y-3">
        {homes?.map((home) => (
          <li key={home.key} className="border border-gray-700 rounded-lg p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-gray-100 truncate">{home.name}{home.active && <span className="ml-2 text-xs text-green-400">Active</span>}</span>
              <span className={`text-xs ${homeState(home).tone}`}>{homeState(home).label}</span>
            </div>
            <p className="mt-1 text-xs text-gray-500 break-words">{home.capabilities.join(' · ') || 'No capabilities yet'}</p>
            {picture[home.key] && (
              // eslint-disable-next-line @next/next/no-img-element -- a local capture, not a site asset
              <img src={`${device(home)}/snapshot?t=${picture[home.key]}`} alt={`Latest picture from ${home.name}`} className="mt-2 rounded max-h-48" />
            )}
            <div className="mt-2 flex flex-wrap gap-2">
              {!home.active && <button type="button" disabled={!home.verified} className={button} onClick={() => act(home, async () => { await post(`${device(home)}/jump`) })}>Make active</button>}
              <button type="button" className={button} onClick={() => act(home, async () => {
                const { value } = await post(`${device(home)}/invoke`, { capability: 'device.health' })
                return `Health: ${value.status}`
              })}>Health</button>
              <button type="button" disabled={!home.active} title={home.active ? undefined : 'Only the active device can use the camera'} className={button} onClick={() => act(home, async () => {
                await post(`${device(home)}/invoke`, { capability: 'camera.snapshot' })
                setPicture((p) => ({ ...p, [home.key]: Date.now() }))
              })}>Picture</button>
              <button type="button" className={button} onClick={() => act(home, async () => { await post(`${device(home)}/refresh`) })}>Check again</button>
              {forgetting === home.key ? (
                <>
                  <span className="text-xs text-amber-300">This removes it here only. The device stays assigned.</span>
                  <button type="button" className={button} onClick={() => act(home, async () => {
                    await call(device(home), { method: 'DELETE' })
                    setForgetting(null)
                  })}>Forget it</button>
                  <button type="button" className={button} onClick={() => setForgetting(null)}>Keep</button>
                </>
              ) : (
                <button type="button" className={button} onClick={() => setForgetting(home.key)}>Forget</button>
              )}
            </div>
            {status[home.key] && <p role="status" className="mt-2 text-xs text-gray-400 break-words">{status[home.key]}</p>}
          </li>
        ))}
      </ul>
      <AddHome base={base} onAdded={() => void load()} />
    </div>
  )
}
