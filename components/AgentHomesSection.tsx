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
  /** F103: the person this device speaks for, set by the operator */
  speaksAs?: { personId: string; name: string } | null
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

/** F129: the Wi-Fi networks of the agent's boards. Names only come back; the password field is write-only */
function Networks({ base }: { base: string }) {
  const url = `${base}/networks`
  const [networks, setNetworks] = useState<{ ssid: string; open: boolean }[]>([])
  const [form, setForm] = useState({ ssid: '', password: '' })
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    call(url).then((d) => setNetworks(d.networks)).catch((err) => setNote((err as Error).message))
  }, [url])

  const run = async (request: () => Promise<{ networks: typeof networks; pushed: { ok: boolean }[] }>) => {
    setBusy(true)
    setNote('')
    try {
      const data = await request()
      setNetworks(data.networks)
      const ok = data.pushed.filter((p) => p.ok).length
      setNote(data.pushed.length ? `Sent to ${ok} of ${data.pushed.length} online devices. The others get it when they connect.` : 'Saved. Devices get it when they connect.')
      return true
    } catch (err) {
      setNote((err as Error).message)
      return false
    } finally {
      setBusy(false)
    }
  }

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    if (await run(() => post(url, form))) setForm({ ssid: '', password: '' })
  }

  const input = 'bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100'
  const button = 'text-xs px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-200 disabled:opacity-40'
  return (
    <div className="mt-4 border border-gray-700 rounded-lg p-3" data-testid="agent-networks">
      <p className="text-sm text-gray-100">Wi-Fi networks</p>
      <p className="text-xs text-gray-500">For boards that travel. The first one in range is joined first.</p>
      <ul className="mt-2 space-y-1">
        {networks.map((n) => (
          <li key={n.ssid} className="flex items-center justify-between gap-2 text-xs text-gray-200">
            <span className="truncate">{n.ssid}{n.open && <span className="ml-2 text-gray-500">open</span>}</span>
            <button type="button" disabled={busy} className={button} onClick={() => void run(() => call(`${url}?ssid=${encodeURIComponent(n.ssid)}`, { method: 'DELETE' }))}>Remove</button>
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="mt-2 flex flex-wrap gap-2">
        <input required aria-label="Network name" placeholder="Network name" maxLength={32} value={form.ssid} onChange={(e) => setForm({ ...form, ssid: e.target.value })} className={input} />
        <input type="password" autoComplete="new-password" aria-label="Password" placeholder="Password (empty if open)" maxLength={63} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className={input} />
        <button type="submit" disabled={busy || networks.length >= 8} className={button}>Add</button>
      </form>
      {note && <p role="status" className="mt-2 text-xs text-gray-400 break-words">{note}</p>}
    </div>
  )
}

export default function AgentHomesSection({ agentId, hostUrl = '' }: { agentId: string; hostUrl?: string }) {
  const base = `${hostUrl}/api/agents/${encodeURIComponent(agentId)}/devices`
  const [homes, setHomes] = useState<AgentHome[] | null>(null)
  const [error, setError] = useState('')
  const [status, setStatus] = useState<Record<string, string>>({})
  const [picture, setPicture] = useState<Record<string, number>>({})
  const [forgetting, setForgetting] = useState<string | null>(null)
  const [people, setPeople] = useState<{ id: string; displayName: string }[]>([])

  // People live in this dashboard's directory; the agent's host keeps a snapshot of the name
  useEffect(() => {
    fetch('/api/people').then((r) => r.json()).then((d) => setPeople((d.people || []).filter((p: { active?: boolean }) => p.active !== false))).catch(() => {})
  }, [])

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

  // The whole map goes back each time: the agent keeps only what the operator chose here
  const setSpeaksAs = (home: AgentHome, personId: string) => act(home, async () => {
    const map: Record<string, { personId: string; name: string }> = {}
    for (const h of homes || []) if (h.speaksAs && h.key !== home.key) map[h.key] = h.speaksAs
    const person = people.find((p) => p.id === personId)
    if (person) map[home.key] = { personId: person.id, name: person.displayName }
    await call(`${hostUrl}/api/agents/${encodeURIComponent(agentId)}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ devicePeople: Object.keys(map).length ? map : null }),
    })
    return person ? `What is said here now counts as ${person.displayName}.` : 'What is said here is from someone not verified again.'
  })
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
            {(people.length > 0 || home.speaksAs) && (
              <label className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-400">
                Speaks as
                <select
                  value={home.speaksAs?.personId ?? ''}
                  disabled={status[home.key] === WORKING}
                  onChange={(e) => void setSpeaksAs(home, e.target.value)}
                  className="bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-gray-200"
                >
                  <option value="">Someone not verified</option>
                  {home.speaksAs && !people.some((p) => p.id === home.speaksAs!.personId) && <option value={home.speaksAs.personId}>{home.speaksAs.name}</option>}
                  {people.map((p) => <option key={p.id} value={p.id}>{p.displayName}</option>)}
                </select>
                <span className="text-gray-500">Only for a device one person carries, like their phone: anyone holding it speaks as them.</span>
              </label>
            )}
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
      {!!homes?.length && <Networks base={base} />}
      <AddHome base={base} onAdded={() => void load()} />
    </div>
  )
}
